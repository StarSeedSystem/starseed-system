import { afterEach, describe, expect, it } from "vitest";
import { AJUSTES_PUERTA_POR_DEFECTO, type AjustesPuerta, type EstadoPropio } from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio, type AnuncioPuerta } from "@/lib/malla/puerta/tabla";
import {
  crearGestorPuerta,
  destinoInterno,
  type GestorPuerta,
  type MetaVecino,
  type SocketSalida,
  type Trama,
  type TransportePuerta,
} from "@/lib/malla/puerta/tunel";

/* ── Red en memoria ── */
interface Nodo {
  id: string;
  gestor: GestorPuerta;
  tabla: TablaPuertas;
  aj: AjustesPuerta;
  est: EstadoPropio;
  sockets: FalsoSocket[];
  preguntas: string[];
}

class FalsoSocket implements SocketSalida {
  escritos: Uint8Array[] = [];
  cerrado = false;
  private cbDatos: ((b: Uint8Array) => Promise<void> | void) | null = null;
  private cbCierre: ((e?: string) => void) | null = null;
  constructor(public host: string, public port: number) {}
  async escribir(b: Uint8Array): Promise<void> {
    this.escritos.push(b);
  }
  alDatos(cb: (b: Uint8Array) => Promise<void> | void): void {
    this.cbDatos = cb;
  }
  alCerrar(cb: (e?: string) => void): void {
    this.cbCierre = cb;
  }
  cerrar(): void {
    this.cerrado = true;
  }
  async servidorManda(b: Uint8Array): Promise<void> {
    await this.cbDatos?.(b);
  }
  servidorCierra(): void {
    this.cbCierre?.();
  }
  todo(): Uint8Array {
    const n = this.escritos.reduce((a, x) => a + x.length, 0);
    const o = new Uint8Array(n);
    let p = 0;
    for (const x of this.escritos) {
      o.set(x, p);
      p += x.length;
    }
    return o;
  }
}

const estadoConInternet: EstadoPropio = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
const estadoSin: EstadoPropio = { conInternet: false, bateria: 0.9, cargando: false, medida: false };

function crearRed(opts: { desordenar?: boolean } = {}) {
  const nodos = new Map<string, Nodo>();
  const oyentes = new Map<string, (v: string, t: Trama, m: MetaVecino) => void>();
  const enlaces = new Set<string>();
  const cuenta = new Map<string, string>(); // nodo → cuenta
  const clave = (a: string, b: string): string => [a, b].sort().join("|");
  const tipo = new Map<string, string>();
  const tramas: Array<{ de: string; a: string; t: Trama }> = [];
  let sec = 0;

  const red = {
    nodos,
    tramas,
    enlazar(a: string, b: string, t = "local"): void {
      enlaces.add(clave(a, b));
      tipo.set(clave(a, b), t);
    },
    cortar(a: string, b: string): void {
      enlaces.delete(clave(a, b));
    },
    cuenta(id: string, c: string): void {
      cuenta.set(id, c);
    },
    nodo(id: string, o: { tcp?: boolean; est?: EstadoPropio; aj?: Partial<AjustesPuerta>; pregunta?: "permitir" | "denegar" | "siempre" | "nunca" } = {}): Nodo {
      const tabla = new TablaPuertas(() => Date.now(), id);
      const n = { id, tabla, aj: { ...AJUSTES_PUERTA_POR_DEFECTO, ...(o.aj ?? {}) }, est: o.est ?? estadoSin, sockets: [], preguntas: [] } as unknown as Nodo;
      cuenta.set(id, cuenta.get(id) ?? "yo");
      const transporte: TransportePuerta = {
        yo: () => id,
        vecinos: () => [...nodos.keys()].filter((x) => x !== id && enlaces.has(clave(id, x))),
        tamTrozo: () => 1024,
        async enviar(vecino, t) {
          if (!enlaces.has(clave(id, vecino))) return false;
          tramas.push({ de: id, a: vecino, t });
          const entrega = (): void => {
            const m: MetaVecino = { mismaCuenta: cuenta.get(id) === cuenta.get(vecino), tipoEnlace: tipo.get(clave(id, vecino)) ?? "local", etiqueta: tipo.get(clave(id, vecino)) ?? "local" };
            oyentes.get(vecino)?.(id, JSON.parse(JSON.stringify(t)) as Trama, m);
          };
          if (opts.desordenar) setTimeout(entrega, (sec++ * 7) % 11);
          else queueMicrotask(entrega);
          return true;
        },
        alRecibir(cb) {
          oyentes.set(id, cb);
          return () => oyentes.delete(id);
        },
      };
      n.gestor = crearGestorPuerta({
        transporte,
        tabla,
        ajustes: () => n.aj,
        cambiarAjustes: (f) => {
          n.aj = f(n.aj);
        },
        estado: () => n.est,
        anuncioPropio: () => (n.est.conInternet ? crearAnuncioPropio({ id, capas: ["internet"], latenciaMs: 20, estado: n.est, ahora: Date.now() }) : null),
        abrirTcp: o.tcp
          ? async (host, port) => {
              const s = new FalsoSocket(host, port);
              n.sockets.push(s);
              return s;
            }
          : undefined,
        preguntar: async (s) => {
          n.preguntas.push(s.id);
          return o.pregunta ?? "denegar";
        },
        plazoAperturaMs: 400,
        plazoPreguntaMs: 800,
        plazoAckMs: 1500,
        ventana: 4,
      });
      nodos.set(id, n);
      n.gestor.iniciar();
      return n;
    },
  };
  return red;
}

const pausa = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));
const aleatorios = (n: number): Uint8Array => {
  const b = new Uint8Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x & 255;
  }
  return b;
};

const vivos: GestorPuerta[] = [];
afterEach(() => {
  for (const g of vivos.splice(0)) g.detener();
});
function listo<T extends Nodo>(n: T): T {
  vivos.push(n.gestor);
  return n;
}

describe("anti-SSRF", () => {
  it("rechaza direcciones internas y formas numéricas raras", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.2", "169.254.1.1", "2130706433", "0x7f.0.0.1", "0177.0.0.1", "foo.local", "[::1]", "::1", "metadata.internal"]) {
      expect(destinoInterno(h), h).toBe(true);
    }
    expect(destinoInterno("93.184.216.34")).toBe(false);
    expect(destinoInterno("api.supabase.co")).toBe(false);
  });
});

describe("túnel por una puerta vecina", () => {
  it("abre, copia bytes en los dos sentidos y no los altera (con desorden en la red)", async () => {
    const red = crearRed({ desordenar: true });
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "mac", "ble");
    mac.gestor.anunciar();
    await pausa(40);
    const t = await tab.gestor.abrirTunel("api.supabase.co", 443);
    expect("error" in t).toBe(false);
    if ("error" in t) return;
    expect(t.puerta).toBe("mac");
    expect(t.saltos).toBe(0);
    const subida = aleatorios(50_000);
    const bajada = aleatorios(70_000).map((x) => 255 - x);
    const recibido: Uint8Array[] = [];
    t.alDatos((b) => void recibido.push(b));
    expect(await t.escribir(subida)).toBe(true);
    const sock = mac.sockets[0];
    expect(sock.host).toBe("api.supabase.co");
    await pausa(300);
    expect(Array.from(sock.todo())).toEqual(Array.from(subida));
    await sock.servidorManda(bajada);
    await pausa(300);
    const total = recibido.reduce((a, x) => a + x.length, 0);
    expect(total).toBe(bajada.length);
    const unido = new Uint8Array(total);
    let p = 0;
    for (const x of recibido) {
      unido.set(x, p);
      p += x.length;
    }
    expect(Array.from(unido)).toEqual(Array.from(bajada));
    t.cerrar();
    await pausa(30);
    expect(sock.cerrado).toBe(true);
  });

  it("la puerta no ve el contenido: las tramas llevan solo bytes ya cifrados por el cliente (no los toca)", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    const t = (await tab.gestor.abrirTunel("example.com", 443)) as Exclude<Awaited<ReturnType<GestorPuerta["abrirTunel"]>>, { error: string }>;
    const tls = Uint8Array.from([0x16, 0x03, 0x01, 0xde, 0xad]);
    await t.escribir(tls);
    await pausa(30);
    expect(Array.from(mac.sockets[0].todo())).toEqual(Array.from(tls));
  });

  it("deniega puertos y destinos internos", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    for (const [h, p, m] of [["192.168.0.10", 443, "destino-interno"], ["example.com", 22, "puerto-no-permitido"], ["localhost", 443, "destino-interno"]] as const) {
      const r = await tab.gestor.abrirTunel(h, p);
      expect(r, h).toEqual({ error: m });
      tab.tabla.candidatas().forEach(() => undefined);
      // cada rechazo veta a la puerta unos segundos: se levanta para la siguiente prueba
      tab.tabla.marcarAcierto("mac");
    }
    expect(mac.sockets.length).toBe(0);
  });

  it("respeta la política: sin internet, apagada o revocada", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    mac.aj = { ...mac.aj, misNeuronas: false };
    expect(await tab.gestor.abrirTunel("example.com", 443)).toEqual({ error: "apagada" });
    tab.tabla.marcarAcierto("mac");
    mac.aj = { ...mac.aj, misNeuronas: true };
    mac.est = { ...estadoConInternet, medida: true };
    expect(await tab.gestor.abrirTunel("example.com", 443)).toEqual({ error: "red-medida" });
    tab.tabla.marcarAcierto("mac");
    mac.est = { ...estadoConInternet, bateria: 0.05 };
    expect(await tab.gestor.abrirTunel("example.com", 443)).toEqual({ error: "bateria" });
    tab.tabla.marcarAcierto("mac");
    mac.est = estadoConInternet;
    mac.gestor.revocar("tablet");
    expect(mac.aj.revocadas).toContain("tablet");
    expect(await tab.gestor.abrirTunel("example.com", 443)).toEqual({ error: "revocada" });
  });
});

describe("cuotas, auditoría y revocación en caliente", () => {
  it("corta al pasar la cuota diaria y la auditoría no guarda contenido", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet, aj: { topesMias: { ...AJUSTES_PUERTA_POR_DEFECTO.topesMias, bytesDia: 3000 } } }));
    red.enlazar("tablet", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    const t = (await tab.gestor.abrirTunel("example.com", 443)) as Exclude<Awaited<ReturnType<GestorPuerta["abrirTunel"]>>, { error: string }>;
    let cierre = "";
    t.alCerrar((m) => (cierre = m));
    await t.escribir(aleatorios(5000));
    await pausa(80);
    expect(cierre).not.toBe("");
    expect(mac.gestor.bytesHoy("mias")).toBeGreaterThanOrEqual(3000);
    const a = mac.gestor.auditoria();
    expect(a.length).toBe(1);
    expect(Object.keys(a[0]).sort()).toEqual(["bytes", "de", "grupo", "host", "ms", "puerto", "resultado", "t", "vecino"]);
    expect(a[0].host).toBe("example.com");
    // con la cuota agotada, el siguiente túnel se rechaza
    tab.tabla.marcarAcierto("mac");
    expect(await tab.gestor.abrirTunel("example.com", 443)).toEqual({ error: "cuota" });
  });

  it("revocar corta los túneles abiertos y «Parar» cierra todos", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    const t = (await tab.gestor.abrirTunel("example.com", 443)) as Exclude<Awaited<ReturnType<GestorPuerta["abrirTunel"]>>, { error: string }>;
    let cierre = "";
    t.alCerrar((m) => (cierre = m));
    expect(mac.gestor.compartiendo().length).toBe(1);
    expect(mac.gestor.compartiendo()[0].de).toBe("tablet");
    mac.gestor.detenerCompartir();
    await pausa(30);
    expect(cierre).toBe("detenida");
    expect(mac.gestor.compartiendo().length).toBe(0);
  });
});

describe("otras cuentas", () => {
  it("por defecto pregunta; sin respuesta o con «no» se deniega; «siempre» se recuerda", async () => {
    const red = crearRed();
    red.cuenta("amiga", "otra");
    const amiga = listo(red.nodo("amiga"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet, pregunta: "denegar" }));
    red.enlazar("amiga", "mac");
    expect(mac.aj.otrasCuentas).toBe("preguntar");
    mac.gestor.anunciar();
    await pausa(20);
    expect(await amiga.gestor.abrirTunel("example.com", 443)).toEqual({ error: "otra-cuenta" });
    expect(mac.preguntas).toEqual(["amiga"]);
    // Ahora el dueño dice «siempre»
    const mac2 = listo(red.nodo("mac2", { tcp: true, est: estadoConInternet, pregunta: "siempre" }));
    red.enlazar("amiga", "mac2");
    mac2.gestor.anunciar();
    await pausa(20);
    amiga.tabla.quitar("mac");
    const t = await amiga.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    expect(mac2.aj.recordadas.amiga).toBe("permitir");
    expect(mac2.gestor.compartiendo()[0].grupo).toBe("otras");
  });

  it("en «Nunca» ni pregunta; en «Automático» sirve con los topes de otras cuentas", async () => {
    const red = crearRed();
    red.cuenta("amiga", "otra");
    const amiga = listo(red.nodo("amiga"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet, aj: { otrasCuentas: "nunca" } }));
    red.enlazar("amiga", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    expect(await amiga.gestor.abrirTunel("example.com", 443)).toEqual({ error: "apagada" });
    expect(mac.preguntas).toEqual([]);
    amiga.tabla.marcarAcierto("mac");
    mac.aj = { ...mac.aj, otrasCuentas: "automatico" };
    expect("error" in (await amiga.gestor.abrirTunel("example.com", 443))).toBe(false);
  });

  it("una neurona de otra cuenta no puede hacerse pasar por mía aunque diga mc=true por un relé ajeno", async () => {
    const red = crearRed();
    red.cuenta("intruso", "otra");
    const intruso = listo(red.nodo("intruso"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("intruso", "mac");
    mac.gestor.anunciar();
    await pausa(20);
    // El intruso es de otra cuenta: `meta.mismaCuenta` es false aunque su trama diga mc=true.
    const r = await intruso.gestor.abrirTunel("example.com", 443);
    expect(r).toEqual({ error: "otra-cuenta" });
  });
});

describe("selección y reserva", () => {
  const anuncio = (id: string, o: Partial<AnuncioPuerta> = {}): AnuncioPuerta => ({
    v: 1, id, capas: ["internet"], latenciaMs: 30, anchoKbps: 5000, medida: false, bateria: 0.9, cargando: false, saltos: 0, via: [id], ts: 0, ...o,
  });

  it("elige la mejor entre varias y cae a la siguiente si falla", () => {
    const t = new TablaPuertas(() => 1000, "yo");
    t.anotar(anuncio("lenta", { latenciaMs: 400, anchoKbps: 100 }), "n1", { tipoEnlace: "local", etiqueta: "x" });
    t.anotar(anuncio("rapida", { latenciaMs: 20, anchoKbps: 20000 }), "n2", { tipoEnlace: "local", etiqueta: "x" });
    t.anotar(anuncio("medida", { medida: true }), "n3", { tipoEnlace: "local", etiqueta: "x" });
    t.anotar(anuncio("lejana", { saltos: 2, via: ["lejana", "a", "b"] }), "n4", { tipoEnlace: "local", etiqueta: "x" });
    expect(t.elegir()?.anuncio.id).toBe("rapida");
    expect(t.elegir({ evitarMedida: true, excluir: new Set(["rapida"]) })?.anuncio.id).toBe("lenta");
    t.marcarFallo("rapida");
    expect(t.elegir()?.anuncio.id).not.toBe("rapida");
    expect(t.candidatas().length).toBe(3); // la fallida queda vetada un rato
  });

  it("Bluetooth puntúa por debajo de Wi‑Fi directo a igualdad", () => {
    const t = new TablaPuertas(() => 1000, "yo");
    t.anotar(anuncio("por-ble"), "n1", { tipoEnlace: "ble", etiqueta: "Bluetooth" });
    t.anotar(anuncio("por-wifi"), "n2", { tipoEnlace: "local", etiqueta: "Wi‑Fi directo" });
    expect(t.elegir()?.anuncio.id).toBe("por-wifi");
  });

  it("si la puerta se cae a medias, abrir otro túnel usa otra puerta", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const a = listo(red.nodo("a", { tcp: true, est: estadoConInternet }));
    const b = listo(red.nodo("b", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "a");
    red.enlazar("tablet", "b");
    a.gestor.anunciar();
    b.gestor.anunciar();
    await pausa(20);
    const t1 = (await tab.gestor.abrirTunel("example.com", 443)) as Exclude<Awaited<ReturnType<GestorPuerta["abrirTunel"]>>, { error: string }>;
    const primera = t1.puerta;
    let cierre = "";
    t1.alCerrar((m) => (cierre = m));
    red.cortar("tablet", primera);
    await t1.escribir(aleatorios(3000));
    await pausa(300);
    expect(cierre).not.toBe("");
    tab.tabla.marcarFallo(primera);
    const t2 = (await tab.gestor.abrirTunel("example.com", 443)) as Exclude<Awaited<ReturnType<GestorPuerta["abrirTunel"]>>, { error: string }>;
    expect(t2.puerta).not.toBe(primera);
  });

  it("si la primera puerta responde que no, prueba la segunda en la misma petición", async () => {
    const red = crearRed();
    const tab = listo(red.nodo("tablet"));
    const a = listo(red.nodo("a", { tcp: true, est: estadoConInternet, aj: { misNeuronas: false } }));
    const b = listo(red.nodo("b", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "a");
    red.enlazar("tablet", "b");
    a.gestor.anunciar();
    b.gestor.anunciar();
    await pausa(20);
    const t = await tab.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    if (!("error" in t)) expect(t.puerta).toBe("b");
  });
});

describe("varios saltos", () => {
  it("llega a la puerta por una neurona intermedia (Bluetooth → relé → Wi‑Fi) y los bytes se conservan", async () => {
    const red = crearRed({ desordenar: true });
    const tab = listo(red.nodo("tablet"));
    const rele = listo(red.nodo("rele"));
    const mac = listo(red.nodo("mac", { tcp: true, est: estadoConInternet }));
    red.enlazar("tablet", "rele", "ble");
    red.enlazar("rele", "mac", "local");
    mac.gestor.anunciar();
    await pausa(80);
    const c = tab.tabla.candidatas();
    expect(c.length).toBe(1);
    expect(c[0].anuncio.id).toBe("mac");
    expect(c[0].anuncio.saltos).toBe(1);
    expect(c[0].vecino).toBe("rele");
    const t = await tab.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    if ("error" in t) return;
    expect(t.saltos).toBe(1);
    const datos = aleatorios(20_000);
    await t.escribir(datos);
    await pausa(300);
    expect(Array.from(mac.sockets[0].todo())).toEqual(Array.from(datos));
    const bajada = aleatorios(9000);
    const rec: number[] = [];
    t.alDatos((b) => void rec.push(...b));
    await mac.sockets[0].servidorManda(bajada);
    await pausa(300);
    expect(rec).toEqual(Array.from(bajada));
    expect(rele.gestor.compartiendo()[0]?.rol).toBe("rele");
    // la auditoría de la puerta ve al vecino (el relé) y al solicitante
    mac.gestor.detenerCompartir();
    await pausa(30);
    expect(mac.gestor.auditoria()[0]).toMatchObject({ de: "tablet", vecino: "rele" });
  });

  it("no hay bucles: un anillo de tres neuronas sin salida termina con error", async () => {
    const red = crearRed();
    const a = listo(red.nodo("a"));
    const b = listo(red.nodo("b"));
    const c = listo(red.nodo("c"));
    red.enlazar("a", "b");
    red.enlazar("b", "c");
    red.enlazar("c", "a");
    // anuncio falso que alcanza el anillo desde fuera: nadie tiene salida real
    const falso: AnuncioPuerta = { v: 1, id: "fantasma", capas: ["internet"], latenciaMs: 10, anchoKbps: null, medida: false, bateria: null, cargando: false, saltos: 1, via: ["fantasma", "x"], ts: 0 };
    for (const n of [a, b, c]) n.tabla.anotar(falso, n.id === "a" ? "b" : n.id === "b" ? "c" : "a", { tipoEnlace: "local", etiqueta: "x" });
    const r = await a.gestor.abrirTunel("example.com", 443);
    expect("error" in r).toBe(true);
    expect(red.tramas.filter((x) => x.t.k === "abrir").length).toBeLessThan(12);
  });

  it("el anuncio no se reenvía más allá del máximo de saltos", async () => {
    const red = crearRed();
    const ids = ["n0", "n1", "n2", "n3", "n4", "n5"];
    const ns = ids.map((i) => listo(red.nodo(i, i === "n0" ? { tcp: true, est: estadoConInternet } : {})));
    for (let i = 0; i < ids.length - 1; i++) red.enlazar(ids[i], ids[i + 1]);
    ns[0].gestor.anunciar();
    await pausa(60);
    expect(ns[1].tabla.candidatas().length).toBe(1);
    expect(ns[4].tabla.candidatas().length).toBe(1); // 3 saltos
    expect(ns[5].tabla.candidatas().length).toBe(0); // 4 saltos: demasiado lejos
  });
});

describe("valores por defecto", () => {
  it("entre mis neuronas ON; otras cuentas «Preguntar»; solo puerto 443; sin red privada", () => {
    const d = AJUSTES_PUERTA_POR_DEFECTO;
    expect(d.misNeuronas).toBe(true);
    expect(d.otrasCuentas).toBe("preguntar");
    expect(d.puertos).toEqual([443]);
    expect(d.permitirRedPrivada).toBe(false);
    expect(d.topesMias.permitirRedMedida).toBe(false);
    expect(d.topesOtras.bytesDia).toBeLessThan(d.topesMias.bytesDia);
  });
});
