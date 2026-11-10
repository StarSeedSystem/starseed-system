/**
 * PTA1110A — la puerta en un carril LENTO (Bluetooth: 300 kb/s, 25 ms por sentido), con reloj virtual.
 * Mide lo mismo con el gestor ANTERIOR (PTA1108A, congelado en `fixtures/tunel-antes.ts`) y con el nuevo, e imprime las cifras
 * (`PUERTA_RENDIMIENTO ...`) para el contrato. Objetivos del gestor nuevo: primera respuesta pequeña < 0,8 s, página de 200 KB
 * < 8 s, descarga de 2 MB a ≥ 28 KB/s (el carril da 37,5), sobrecarga binaria ≤ 1,10 y una consulta pequeña NO espera a la descarga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AJUSTES_PUERTA_POR_DEFECTO, type EstadoPropio } from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio } from "@/lib/malla/puerta/tabla";
import { crearGestorPuerta as crearNuevo, type GestorPuerta, type MetaVecino, type SocketSalida, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";
import { crearGestorPuerta as crearAntes } from "./fixtures/tunel-antes";

const KBPS = 300;
const LAT_MS = 25;
const BPS = (KBPS * 1000) / 8;
const SOBRE_JSON = 96; // `{"t":"tu.msg","v":1,"id":"<uuid>","c":"puerta","b":…}` alrededor del cuerpo
const SOBRE_BIN = 14; // cabecera de la trama binaria del túnel (id de 8 bytes) + algo de enmarcado del carril

const estadoSin: EstadoPropio = { conInternet: false, bateria: 0.9, cargando: false, medida: false };
const estadoCon: EstadoPropio = { conInternet: true, bateria: 0.9, cargando: false, medida: false };

type Dir = "cg" | "gc";

class Carril {
  libre: Record<Dir, number> = { cg: 0, gc: 0 };
  bytes: Record<Dir, number> = { cg: 0, gc: 0 };
  /** Manda `n` bytes; llama a `entrega` cuando llegan y resuelve cuando el otro lado acusa (ida + vuelta). */
  pasar(dir: Dir, n: number, entrega: () => void, prioritaria = false): Promise<void> {
    const t = Date.now();
    const dur = (n / BPS) * 1000;
    let ini: number;
    if (prioritaria) {
      // Como el motor Bluetooth (control > datos): una trama de control se cuela delante de lo que espera en cola y solo aguarda
      // a la que está en el aire (media trama de 4 KiB de media); la cola de datos se retrasa lo que ella dura.
      ini = t + Math.min(Math.max(0, this.libre[dir] - t), 55);
      this.libre[dir] = Math.max(this.libre[dir], t) + dur;
    } else {
      ini = Math.max(t, this.libre[dir]);
      this.libre[dir] = ini + dur;
    }
    this.bytes[dir] += n;
    const llega = ini + dur + LAT_MS;
    return new Promise((res) => {
      setTimeout(entrega, llega - t);
      setTimeout(res, llega - t + LAT_MS);
    });
  }
  total(): number {
    return this.bytes.cg + this.bytes.gc;
  }
}

class ServidorFalso implements SocketSalida {
  private cb: ((b: Uint8Array) => Promise<void> | void) | null = null;
  private escrito = 0;
  private respondido = false;
  constructor(private host: string, private respuesta: Record<string, number>) {}
  async escribir(b: Uint8Array): Promise<void> {
    this.escrito += b.length;
    if (this.respondido || this.escrito < 600) return;
    this.respondido = true;
    const total = this.respuesta[this.host] ?? 2048;
    setTimeout(() => void this.mandar(total), 20); // el sitio tarda 20 ms
  }
  private async mandar(total: number): Promise<void> {
    for (let o = 0; o < total; o += 16384) await this.cb?.(new Uint8Array(Math.min(16384, total - o)));
  }
  alDatos(cb: (b: Uint8Array) => Promise<void> | void): void {
    this.cb = cb;
  }
  alCerrar(): void {}
  cerrar(): void {}
}

type Fabrica = typeof crearNuevo;

interface Opciones {
  gestor: "antes" | "nuevo";
  binario?: boolean;
  /** Dependencias extra del gestor del CLIENTE (ajustes, alGrande…). */
  clienteExtra?: Record<string, unknown>;
}

function montar(o: Opciones) {
  const carril = new Carril();
  const oyentes = new Map<string, (v: string, t: Trama, m: MetaVecino) => void>();
  const oyentesBin = new Map<string, (v: string, b: Uint8Array) => void>();
  const meta: MetaVecino = { mismaCuenta: true, tipoEnlace: "ble", etiqueta: "Bluetooth directo" };
  // El gestor ANTERIOR mandaba todo como «control» (una sola cola); el nuevo lo manda como datos y deja el control por delante.
  const prioridad = o.gestor === "nuevo";
  const transporte = (id: string, otro: string, dir: Dir): TransportePuerta => ({
    yo: () => id,
    vecinos: () => [otro],
    tamTrozo: () => 4096,
    async enviar(_v, t) {
      const n = JSON.stringify(t).length + SOBRE_JSON;
      await carril.pasar(dir, n, () => oyentes.get(otro)?.(id, JSON.parse(JSON.stringify(t)) as Trama, meta), prioridad && t.k !== "dat");
      return true;
    },
    alRecibir(cb) {
      oyentes.set(id, cb);
      return () => oyentes.delete(id);
    },
    ...(o.binario
      ? {
          async enviarBin(_v: string, b: Uint8Array) {
            const copia = b.slice();
            await carril.pasar(dir, b.length + SOBRE_BIN, () => oyentesBin.get(otro)?.(id, copia), prioridad && b[0] === 2);
            return true;
          },
          alRecibirBin(cb: (v: string, b: Uint8Array) => void) {
            oyentesBin.set(id, cb);
            return () => oyentesBin.delete(id);
          },
        }
      : {}),
  });
  const fabrica = (o.gestor === "nuevo" ? crearNuevo : crearAntes) as unknown as Fabrica;
  const respuesta = { "api.test": 2048, "pagina.test": 200 * 1024, "bulk.test": 2 * 1024 * 1024, "otra.test": 2 * 1024 * 1024 };
  const gTabla = new TablaPuertas(() => Date.now(), "G");
  const cTabla = new TablaPuertas(() => Date.now(), "C");
  const comunes = { ajustes: () => AJUSTES_PUERTA_POR_DEFECTO, plazoAckMs: 20_000, plazoAperturaMs: 8_000 };
  const g = fabrica({
    ...comunes,
    transporte: transporte("G", "C", "gc"),
    tabla: gTabla,
    estado: () => estadoCon,
    anuncioPropio: () => crearAnuncioPropio({ id: "G", capas: ["internet"], latenciaMs: 20, estado: estadoCon, ahora: Date.now() }),
    abrirTcp: async (host: string) => new ServidorFalso(host, respuesta),
    ...(o.gestor === "antes" ? { ventana: 8 } : {}),
  } as never);
  const c = fabrica({
    ...comunes,
    transporte: transporte("C", "G", "cg"),
    tabla: cTabla,
    estado: () => estadoSin,
    anuncioPropio: () => null,
    ...(o.clienteExtra ?? {}),
    ...(o.gestor === "antes" ? { ventana: 8 } : {}),
  } as never);
  return { carril, g, c, respuesta };
}

async function avanzarHasta(cond: () => boolean, maxMs: number, paso = 5): Promise<number> {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < maxMs) await vi.advanceTimersByTimeAsync(paso);
  return Date.now() - t0;
}

interface Medida {
  primeroMs: number | null;
  finMs: number | null;
  bytes: number;
}

/** Abre un túnel a `host`, pide (600 B) y mide primer byte y fin de la respuesta de `esperado` bytes. */
function pedir(c: GestorPuerta, host: string, esperado: number, tipo?: "descargas"): { m: Medida; listo: () => boolean } {
  const m: Medida = { primeroMs: null, finMs: null, bytes: 0 };
  const t0 = Date.now();
  void (async () => {
    const t = await c.abrirTunel(host, 443, tipo ? { tipo } : undefined);
    if ("error" in t) {
      m.finMs = -1;
      return;
    }
    t.alDatos((b) => {
      m.bytes += b.length;
      m.primeroMs ??= Date.now() - t0;
      if (m.bytes >= esperado && m.finMs === null) m.finMs = Date.now() - t0;
    });
    await t.escribir(new Uint8Array(600));
  })();
  return { m, listo: () => m.finMs !== null };
}

describe("PTA1110A · la puerta en un carril de 300 kb/s", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function preparar(o: Opciones) {
    const r = montar(o);
    r.g.iniciar();
    r.c.iniciar();
    await vi.advanceTimersByTimeAsync(400); // el anuncio llega por el carril
    return r;
  }

  const cifras: Record<string, Record<string, number | string>> = {};
  async function escenarios(nombre: string, o: Opciones) {
    const out: Record<string, number | string> = {};
    // 1 · Primera respuesta pequeña (consulta a Supabase: 600 B arriba, 2 KB abajo), con el túnel por abrir.
    {
      const { c } = await preparar(o);
      const p = pedir(c, "api.test", 2048);
      await avanzarHasta(p.listo, 20_000);
      out.primeraRespuestaMs = p.m.finMs ?? -1;
    }
    // 2 · Página de 200 KB.
    {
      const { c } = await preparar(o);
      const p = pedir(c, "pagina.test", 200 * 1024);
      await avanzarHasta(p.listo, 60_000);
      out.pagina200KBms = p.m.finMs ?? -1;
    }
    // 3 · Descarga de 2 MB: rendimiento y sobrecarga respecto al carril.
    {
      const { c, carril } = await preparar(o);
      const base = carril.total();
      const p = pedir(c, "bulk.test", 2 * 1024 * 1024);
      await avanzarHasta(p.listo, 200_000, 20);
      const ms = p.m.finMs ?? -1;
      out.descarga2MBms = ms;
      out.kBps = ms > 0 ? Math.round((2 * 1024 * 1024) / 1024 / (ms / 1000)) : 0;
      out.sobrecarga = ms > 0 ? Number(((carril.total() - base) / (2 * 1024 * 1024 + 600)).toFixed(3)) : 0;
    }
    // 4 · Una consulta pequeña MIENTRAS corre la descarga de 2 MB (justicia entre túneles).
    {
      const { c } = await preparar(o);
      const grande = pedir(c, "bulk.test", 2 * 1024 * 1024);
      await vi.advanceTimersByTimeAsync(3_000);
      const peq = pedir(c, "api.test", 2048);
      await avanzarHasta(peq.listo, 60_000, 10);
      out.consultaDuranteDescargaMs = peq.m.finMs ?? -1;
      out.descargaSigueVivaBytes = grande.m.bytes;
    }
    cifras[nombre] = out;
    // eslint-disable-next-line no-console
    console.log(`PUERTA_RENDIMIENTO ${nombre} ${JSON.stringify(out)}`);
    return out;
  }

  it("gestor ANTERIOR (ventana 8, JSON+base64, sin reparto): cifras de partida", async () => {
    const r = await escenarios("antes", { gestor: "antes" });
    expect(r.descarga2MBms).toBeGreaterThan(0);
  }, 120_000);

  it("gestor NUEVO con JSON (par antiguo en el otro extremo): mejora y alcanza los objetivos de latencia", async () => {
    const r = await escenarios("nuevo-json", { gestor: "nuevo" });
    expect(r.primeraRespuestaMs).toBeGreaterThan(0);
    expect(r.primeraRespuestaMs).toBeLessThan(900);
    expect(r.pagina200KBms).toBeLessThan(10_000);
    expect(r.kBps).toBeGreaterThanOrEqual(22);
    expect(r.consultaDuranteDescargaMs).toBeGreaterThan(0);
    expect(r.consultaDuranteDescargaMs).toBeLessThan(1_000);
  }, 120_000);

  it("gestor NUEVO con trama binaria negociada: objetivos de rendimiento y sobrecarga", async () => {
    const r = await escenarios("nuevo-bin", { gestor: "nuevo", binario: true });
    expect(r.primeraRespuestaMs).toBeGreaterThan(0);
    expect(r.primeraRespuestaMs).toBeLessThan(800);
    expect(r.pagina200KBms).toBeLessThan(8_000);
    expect(r.kBps).toBeGreaterThanOrEqual(28);
    expect(r.sobrecarga).toBeLessThanOrEqual(1.1);
    expect(r.consultaDuranteDescargaMs).toBeLessThan(900);
    // Contra el punto de partida: más rápido y con menos sobrecarga.
    const antes = cifras.antes;
    if (antes) {
      expect(r.kBps as number).toBeGreaterThan(antes.kBps as number);
      expect(r.sobrecarga as number).toBeLessThan(antes.sobrecarga as number);
      // (El anterior respondía antes a la consulta porque dejaba sin usar casi la mitad del carril: 20 KB/s de 37,5.)
      expect(r.consultaDuranteDescargaMs as number).toBeLessThan(900);
    }
  }, 120_000);

  it("justicia: ocho consultas pequeñas seguidas no dejan sin avanzar a la descarga grande (suelo de reparto)", async () => {
    const { c } = await preparar({ gestor: "nuevo", binario: true });
    const grande = pedir(c, "bulk.test", 2 * 1024 * 1024);
    await vi.advanceTimersByTimeAsync(2_000);
    const antes = grande.m.bytes;
    const pequenas = Array.from({ length: 8 }, () => pedir(c, "api.test", 2048));
    await avanzarHasta(() => pequenas.every((p) => p.listo()), 30_000, 10);
    expect(pequenas.every((p) => p.listo() && (p.m.finMs ?? 0) > 0)).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(grande.m.bytes).toBeGreaterThan(antes); // la grande siguió avanzando
  }, 120_000);

  describe("pregunta única antes de una descarga grande por un carril lento", () => {
    const base = (grandeLento: "preguntar" | "continuar" | "solo-wifi") => {
      let ajustes = { ...AJUSTES_PUERTA_POR_DEFECTO, grandeLento };
      const preguntas: unknown[] = [];
      return {
        preguntas,
        ajustes: () => ajustes,
        extra: (eleccion: "continuar" | "solo-wifi", recordar: boolean) => ({
          ajustes: () => ajustes,
          cambiarAjustes: (f: (a: typeof ajustes) => typeof ajustes) => {
            ajustes = f(ajustes);
          },
          alGrande: async (i: unknown) => {
            preguntas.push(i);
            return { eleccion, recordar };
          },
        }),
      };
    };

    it("pregunta UNA vez (≈1 MiB, ~300 kb/s) y la elección «continuar» se recuerda", async () => {
      const b = base("preguntar");
      const { c } = await preparar({ gestor: "nuevo", binario: true, clienteExtra: b.extra("continuar", true) });
      const p = pedir(c, "bulk.test", 2 * 1024 * 1024, "descargas");
      await avanzarHasta(p.listo, 200_000, 20);
      expect(b.preguntas).toHaveLength(1);
      expect(p.m.bytes).toBeGreaterThanOrEqual(2 * 1024 * 1024); // continuó hasta el final
      expect(b.ajustes().grandeLento).toBe("continuar"); // recordada
    }, 120_000);

    it("con la elección ya recordada no vuelve a preguntar", async () => {
      const b = base("continuar");
      const { c } = await preparar({ gestor: "nuevo", binario: true, clienteExtra: b.extra("solo-wifi", false) });
      const p = pedir(c, "bulk.test", 2 * 1024 * 1024, "descargas");
      await avanzarHasta(p.listo, 200_000, 20);
      expect(b.preguntas).toHaveLength(0);
      expect(p.m.bytes).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    }, 120_000);

    it("«solo Wi‑Fi» corta la descarga por la malla", async () => {
      const b = base("preguntar");
      const { c } = await preparar({ gestor: "nuevo", binario: true, clienteExtra: b.extra("solo-wifi", false) });
      const p = pedir(c, "bulk.test", 2 * 1024 * 1024, "descargas");
      await avanzarHasta(p.listo, 60_000, 20);
      expect(b.preguntas).toHaveLength(1);
      expect(p.m.bytes).toBeLessThan(2 * 1024 * 1024);
    }, 120_000);

    it("una navegación pequeña nunca pregunta", async () => {
      const b = base("preguntar");
      const { c } = await preparar({ gestor: "nuevo", binario: true, clienteExtra: b.extra("continuar", false) });
      const p = pedir(c, "pagina.test", 200 * 1024);
      await avanzarHasta(p.listo, 60_000, 10);
      expect(b.preguntas).toHaveLength(0);
    }, 120_000);
  });
});
