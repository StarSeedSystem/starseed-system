/**
 * VOZ1111J — la voz limpia con el enlace muy estrecho: formato compacto, escalera con histéresis, suelo y negociación.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  armarPaquete,
  armarPaqueteB,
  bytesTextoB1,
  bytesTextoP,
  etiquetaLlamada,
  leerControl,
  armarControl,
  leerPaqueteB,
  tsCompleto,
  unidadesPaqueteVoz,
} from "../paquete";
import { cabeNivel, ControlNivelVoz, kbpsTextoNivel, nivelInicial, NIVELES_OPUS, type EntradaNivel } from "../niveles";
import { __vaciarReservasVoz, fijarReservaVoz, reservaVozKbps } from "../reserva";
import { ajustarModelo, kbpsMaxConCiclo, MedidorEnlace, presupuestoVideo, type ModeloEnlace, type ResumenEnlace } from "@/lib/llamadas/video-datos/reparto";
import { MUESTRAS_TRAMA } from "../codec";
import { AVISO_SIN_VOZ_RX, SesionVozDatos, fabricaCodecsSimples, type AudioVoz, type FabricaCodecs, type RelojVoz, type TransporteVoz } from "../sesion";
import { textoCalidadVoz, nivelCalidadVoz } from "../decision";

const ID = "3f1c2a90-5b7e-4c1d-9a8e-2b6f0c4d7e11";
const bytes = (n: number, s = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + s) & 255);

describe("formato compacto «b1»", () => {
  it("ida y vuelta: tramas de 60 ms, silencio declarado y redundancia", () => {
    const t = armarPaqueteB({
      etiqueta: etiquetaLlamada(ID),
      q: 300,
      cubre: 9,
      ts: 0x1_2345_6789,
      c: "opus",
      tramas: [
        { q: 300, n: 3, bytes: bytes(46) },
        // 3 unidades de silencio (303-305) y otra trama
        { q: 306, n: 3, bytes: bytes(200, 3) },
      ],
      red: [{ q: 297, n: 3, bytes: bytes(46, 9) }],
    });
    expect(t).not.toBeNull();
    expect(t!.startsWith('{"t":"voz.b"')).toBe(true);
    const p = leerPaqueteB(t!);
    expect(p).toMatchObject({ etiqueta: etiquetaLlamada(ID), q: 300, cubre: 9, c: "opus" });
    expect(p!.tramas.map((x) => [x.q, x.n, x.bytes.length])).toEqual([
      [300, 3, 46],
      [306, 3, 200],
    ]);
    expect(Array.from(p!.tramas[1].bytes)).toEqual(Array.from(bytes(200, 3)));
    expect(p!.red.map((x) => [x.q, x.n])).toEqual([[297, 3]]);
    // 32 bits del reloj, rehechos con el mío.
    expect(tsCompleto(p!.ts, 0x1_2345_6789 + 150)).toBe(0x1_2345_6789);
    // Las unidades que trae: audio, silencio declarado y la redundancia.
    expect(unidadesPaqueteVoz(t!, 0x1_2345_6789)!.unidades).toEqual([297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308]);
  });

  it("lo que llega del otro se valida: versión, largos, solapes y basura no pasan", () => {
    const ok = armarPaqueteB({ etiqueta: 7, q: 10, cubre: 3, ts: 1, c: "adpcm", tramas: [{ q: 10, n: 1, bytes: bytes(5) }], red: [] })!;
    expect(leerPaqueteB(ok)).not.toBeNull();
    expect(leerPaqueteB('{"t":"voz.b","d":"@@@@"}')).toBeNull();
    expect(leerPaqueteB('{"t":"voz.b","d":"AQ=="}')).toBeNull(); // cabecera cortada
    expect(leerPaqueteB('{"t":"voz.b"')).toBeNull();
    // Trama que se sale de lo que cubre, o solapada: no se arma.
    expect(armarPaqueteB({ etiqueta: 7, q: 10, cubre: 1, ts: 1, c: "opus", tramas: [{ q: 10, n: 3, bytes: bytes(5) }], red: [] })).toBeNull();
    expect(armarPaqueteB({ etiqueta: 7, q: 10, cubre: 6, ts: 1, c: "opus", tramas: [{ q: 10, n: 3, bytes: bytes(5) }, { q: 11, n: 1, bytes: bytes(5) }], red: [] })).toBeNull();
    // Un byte de más al final: no se acepta.
    const d = JSON.parse(ok).d as string;
    const crudo = Uint8Array.from(atob(d), (c) => c.charCodeAt(0));
    const mas = new Uint8Array(crudo.length + 1);
    mas.set(crudo);
    expect(leerPaqueteB(`{"t":"voz.b","d":"${btoa(String.fromCharCode(...mas))}"}`)).toBeNull();
    // Versión desconocida.
    crudo[0] = 9;
    expect(leerPaqueteB(`{"t":"voz.b","d":"${btoa(String.fromCharCode(...crudo))}"}`)).toBeNull();
  });

  it("quita el desperdicio en el aire: 3 tramas de Opus a 24 kb/s pesan ≥ 18 % menos que en `voz.p`", () => {
    const tramas = [bytes(61), bytes(61, 2), bytes(61, 3)];
    const p = armarPaquete({ s: ID, q: 123456, ts: 1731300000000, c: "opus", f: 20, tramas });
    const b = armarPaqueteB({ etiqueta: etiquetaLlamada(ID), q: 123456, cubre: 3, ts: 1731300000000, c: "opus", tramas: tramas.map((x, i) => ({ q: 123456 + i, n: 1, bytes: x })), red: [] })!;
    expect(b.length).toBeLessThanOrEqual(p.length * 0.82);
    // Las fórmulas de coste coinciden con lo que se arma (± el largo del número q).
    expect(Math.abs(bytesTextoB1([61, 61, 61]) - b.length)).toBeLessThanOrEqual(4);
    expect(Math.abs(bytesTextoP([61, 61, 61], ID) - p.length)).toBeLessThanOrEqual(8);
    // Y dentro de un `nl.lote` (JSON de JSON), las comillas escapadas pesan aún más en `voz.p`.
    expect(JSON.stringify(b).length - b.length).toBeLessThan(JSON.stringify(p).length - p.length);
  });

  it("controles: «hola» con fmt y «rep» acotado; un aparato anterior (sin fmt) se lee igual", () => {
    expect(leerControl(armarControl({ s: "x", k: "hola", codecs: ["opus"], fmt: ["b1", "!!"] }))).toEqual({ s: "x", k: "hola", codecs: ["opus"], fmt: ["b1"] });
    expect(leerControl('{"t":"voz.c","s":"x","k":"hola","codecs":["adpcm"]}')).toEqual({ s: "x", k: "hola", codecs: ["adpcm"] });
    expect(leerControl('{"t":"voz.c","s":"x","k":"rep","perd":250,"tarde":-3,"kbps":1e9,"corte":1}')).toEqual({ s: "x", k: "rep", perd: 100, tarde: 0, kbps: 10_000, corte: 1 });
  });
});

describe("escalera de la voz", () => {
  it("cada escalón pone menos texto en el carril; en «b1» el de arriba ya pesa menos que el de antes", () => {
    const k = NIVELES_OPUS.map((n) => kbpsTextoNivel(n, "b1", ID));
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeLessThan(k[i - 1]);
    expect(kbpsTextoNivel(NIVELES_OPUS[0], "p", ID)).toBeGreaterThanOrEqual(46); // los ≈ 48 kb/s del banco
    expect(k[0]).toBeLessThan(40);
    expect(k[k.length - 1]).toBeLessThan(11);
  });

  it("empieza por lo que cabe en lo anunciado", () => {
    expect(nivelInicial(NIVELES_OPUS, "b1", 160, ID)).toBe(0);
    expect(nivelInicial(NIVELES_OPUS, "b1", 40, ID)).toBeGreaterThanOrEqual(2);
    expect(nivelInicial(NIVELES_OPUS, "b1", 16, ID)).toBe(NIVELES_OPUS.length - 1);
    expect(nivelInicial(NIVELES_OPUS, "b1", null, ID)).toBe(0);
  });

  const modelo = (kbps: number, r = 42): ModeloEnlace => ({ rMs: r, bytesPorMs: kbps / 8, fuente: "ajuste" });
  const limpio = (m: ModeloEnlace | null): EntradaNivel => ({ modelo: m, retrasoMaxMs: 80, descartes: 0, informe: null });

  it("baja al momento con atasco, sube un escalón solo tras la calma y con holgura; una subida fallida duplica la calma", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0, ID);
    // Atasco (espera de 900 ms): baja, como poco uno, y con el modelo de 24 kb/s hasta lo que cabe.
    const b = c.paso(1000, { modelo: modelo(24), retrasoMaxMs: 900, descartes: 0, informe: null });
    expect(b?.motivo).toBe("atasco");
    expect(c.indice).toBeGreaterThanOrEqual(3);
    expect(cabeNivel(c.nivel, "b1", modelo(24), 0.05, ID)).toBe(true);
    const bajo = c.indice;
    // Vuelve la capacidad (160): no sube antes de 6 s de calma y 3 pasos seguidos cabiendo (a los 9 s).
    for (let t = 2000; t < 9000; t += 1000) expect(c.paso(t, limpio(modelo(160)))).toBeNull();
    const s = c.paso(9000, limpio(modelo(160)));
    expect(s).toMatchObject({ motivo: "hay-sitio", hasta: bajo - 1 });
    // La subida provoca descartes enseguida: baja y la calma pasa a 12 s.
    expect(c.paso(10_000, { modelo: modelo(160), retrasoMaxMs: 100, descartes: 3, informe: null })?.motivo).toBe("descartes");
    expect(c.calmaMs).toBe(12_000);
    for (let t = 11_000; t < 24_000; t += 1000) expect(c.paso(t, limpio(modelo(160)))).toBeNull();
    expect(c.paso(24_000, limpio(modelo(160)))?.motivo).toBe("hay-sitio");
  });

  it("un segundo con el modelo optimista no sube: hacen falta 3 pasos seguidos cabiendo", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 5, ID);
    for (let t = 1000; t < 20_000; t += 1000) expect(c.paso(t, limpio(t % 3000 === 0 ? modelo(160) : modelo(16)))).toBeNull();
  });


  it("con atasco y un modelo viejo (de antes de la caída), baja de una vez a lo que el carril entrega de verdad", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0, ID);
    const r = c.paso(1000, { modelo: modelo(160), retrasoMaxMs: 900, descartes: 0, informe: null, entregadoKbps: 20 });
    expect(r?.motivo).toBe("atasco");
    expect(kbpsTextoNivel(c.nivel, "b1", ID)).toBeLessThanOrEqual(16);
    expect(kbpsTextoNivel(NIVELES_OPUS[c.indice - 1], "b1", ID)).toBeGreaterThan(16);
  });

  it("bajada rápida entre pasos: dos escalones con la voz esperando > 400 ms, como mucho cada 600 ms", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0, ID);
    expect(c.bajadaRapida(1000, 300)).toBeNull();
    expect(c.bajadaRapida(1000, 500)).toMatchObject({ desde: 0, hasta: 2 });
    expect(c.bajadaRapida(1300, 900)).toBeNull();
    expect(c.bajadaRapida(1700, 900)).toMatchObject({ desde: 2, hasta: 4 });
  });

  it("el informe del otro manda: pérdida o tarde altas bajan; sin modelo sube igual (no hay techo medido)", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0, ID);
    expect(c.paso(1000, { modelo: null, retrasoMaxMs: 0, descartes: 0, informe: { perd: 6, tarde: 0, corte: false, edadMs: 500 } })?.motivo).toBe("perdida-rx");
    expect(c.paso(2000, { modelo: null, retrasoMaxMs: 0, descartes: 0, informe: { perd: 0, tarde: 9, corte: false, edadMs: 500 } })?.motivo).toBe("tarde-rx");
    // Un informe viejo no cuenta.
    expect(c.paso(3000, { modelo: null, retrasoMaxMs: 0, descartes: 0, informe: { perd: 50, tarde: 0, corte: false, edadMs: 9000 } })).toBeNull();
  });

  it("baja por capacidad sin esperar a perder cuando el modelo dice que no cabe", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 0, ID);
    const r = c.paso(1000, limpio(modelo(40)));
    expect(r?.motivo).toBe("capacidad");
    expect(cabeNivel(c.nivel, "b1", modelo(40), 0.05, ID)).toBe(true);
    expect(cabeNivel(NIVELES_OPUS[c.indice - 1], "b1", modelo(40), 0.05, ID)).toBe(false);
  });

  it("bajo el suelo: 3 s de atasco en el último escalón; sale con 3 s limpios", () => {
    const ult = NIVELES_OPUS.length - 1;
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, ult, ID);
    const mal: EntradaNivel = { modelo: modelo(8), retrasoMaxMs: 2000, descartes: 4, informe: null };
    c.paso(1000, mal);
    c.paso(2000, mal);
    expect(c.bajoSuelo).toBe(false);
    c.paso(3000, mal);
    expect(c.bajoSuelo).toBe(true);
    c.paso(4000, limpio(modelo(16)));
    c.paso(5000, limpio(modelo(16)));
    expect(c.bajoSuelo).toBe(true);
    c.paso(6000, limpio(modelo(16)));
    expect(c.bajoSuelo).toBe(false);
  });

  it("redundancia solo con pérdida informada y el escalón cabiendo dos veces", () => {
    const c = new ControlNivelVoz(NIVELES_OPUS, "b1", 0, 2, ID);
    const inf = { perd: 4, tarde: 0, corte: false, edadMs: 100 };
    expect(c.redundancia({ modelo: modelo(160), retrasoMaxMs: 0, descartes: 0, informe: inf })).toBe(true);
    expect(c.redundancia({ modelo: modelo(30), retrasoMaxMs: 0, descartes: 0, informe: inf })).toBe(false);
    expect(c.redundancia({ modelo: modelo(160), retrasoMaxMs: 0, descartes: 0, informe: { ...inf, perd: 0 } })).toBe(false);
  });
});

const DUENO = {};
describe("reserva de la voz en el reparto con el vídeo", () => {
  afterEach(() => __vaciarReservasVoz());
  const r = (o: Partial<ResumenEnlace>): ResumenEnlace => ({ modelo: null, maxKbps: 80, entregadoKbps: 0, vozKbps: 10, videoKbps: 0, retrasoMaxMs: 0, ocupacion: 0, ...o });

  it("el vídeo gana lo que libera una voz más ligera y lo devuelve si sube", () => {
    fijarReservaVoz(DUENO, 38);
    expect(presupuestoVideo(r({}))).toBe(Math.round((80 - 38) * 0.9));
    fijarReservaVoz(DUENO, 13);
    expect(presupuestoVideo(r({}))).toBe(Math.round((80 - 13) * 0.9));
    // La voz medida manda si es mayor (lo que de verdad entra).
    expect(presupuestoVideo(r({ vozKbps: 30 }))).toBe(Math.round((80 - 30) * 0.9));
    fijarReservaVoz(DUENO, null);
    expect(reservaVozKbps()).toBeNull();
  });
});

describe("VOZ1111L: el modelo del carril también aprende de escrituras aisladas", () => {
  it("con escrituras aisladas, tamaños de poca amplitud no dan pendiente (se usa el «supuesto»)", () => {
    // 160 kb/s, acuse 42 ms, voz sola de 200–300 B con ± 10 ms de muestreo: la pendiente al azar decía ≈ 60 kb/s.
    const pares = Array.from({ length: 12 }, (_, k) => ({ bytes: 150 + (k % 3) * 100, ms: 42 + (150 + (k % 3) * 100) / 20 + (k % 3 === 2 ? 14 : k % 3 === 0 ? -8 : 0) }));
    expect(ajustarModelo(pares, 20)!.fuente).toBe("ajuste");
    const m = ajustarModelo(pares, 20, true)!;
    expect(m.fuente).toBe("supuesto");
    expect(kbpsMaxConCiclo(m, 100)).toBeGreaterThan(80);
  });

  it("voz ligera en un carril estrecho: el «supuesto» no inventa sitio para el vídeo", () => {
    // 40 kb/s (5 B/ms), acuse 42 ms, voz sola de 220 B: 86 ms por escritura.
    const estrecho = Array.from({ length: 10 }, () => ({ bytes: 220, ms: 42 + 220 / 5 }));
    expect(kbpsMaxConCiclo(ajustarModelo(estrecho, 20)!, 100)).toBeGreaterThan(30); // sin escrituras aisladas: como antes
    expect(kbpsMaxConCiclo(ajustarModelo(estrecho, 20, true)!, 100)).toBeLessThan(25);
    const ancho = Array.from({ length: 10 }, () => ({ bytes: 220, ms: 42 + 220 / 20 }));
    expect(kbpsMaxConCiclo(ajustarModelo(ancho, 20, true)!, 100)).toBeGreaterThan(80);
  });

  it("con voz ligera (carril vacío entre paquetes) el modelo se rehace con la capacidad nueva", () => {
    // Carril de 40 kb/s (5 B/ms) y acuse de 42 ms; paquetes de 150–350 B cada 200 ms, siempre con el carril vacío antes.
    const simular = (bytesPorMs: number, m: MedidorEnlace, t0: number, entrados0: number) => {
      let t = t0;
      let entrados = entrados0;
      for (let k = 0; k < 45; k++) {
        const b = 150 + (k % 5) * 50;
        const fin = t + 42 + b / bytesPorMs;
        entrados += b;
        // Muestras cada 20 ms: entra, en vuelo, acusado.
        for (let s = t + 20; s < t + 200; s += 20) m.muestra(s, { cola: s < fin ? b : 0, entrados });
        t += 200;
      }
      return { t, entrados };
    };
    const m = new MedidorEnlace(20);
    m.muestra(0, { cola: 0, entrados: 0 });
    const a = simular(5, m, 0, 0);
    m.cerrarVentana(a.t);
    expect(m.modelo).not.toBeNull();
    // Lo que cabe (voz + vídeo, escrituras de 100 ms) en 40 kb/s con 42 ms de acuse es ≈ 23 kb/s: el modelo no da sitio de más.
    expect(kbpsMaxConCiclo(m.modelo!, 100)).toBeLessThan(40);
    // Vuelve a 160 kb/s: el modelo lo ve sin que haga falta llenar el carril.
    const b = simular(20, m, a.t, a.entrados);
    m.cerrarVentana(b.t);
    expect(kbpsMaxConCiclo(m.modelo!, 100)).toBeGreaterThan(75);
  });
});

/* ───────────────────────── Sesiones de punta a punta ───────────────────────── */

class Reloj implements RelojVoz {
  t = 0;
  private tareas: Array<{ fn: () => void; ms: number; prox: number; viva: boolean }> = [];
  ahora = () => this.t;
  cada(fn: () => void, ms: number) {
    const x = { fn, ms, prox: this.t + ms, viva: true };
    this.tareas.push(x);
    return () => {
      x.viva = false;
    };
  }
  avanzar(ms: number) {
    const fin = this.t + ms;
    for (;;) {
      this.tareas = this.tareas.filter((x) => x.viva);
      const sig = this.tareas.reduce<(typeof this.tareas)[number] | undefined>((m, x) => (!m || x.prox < m.prox ? x : m), undefined);
      if (!sig || sig.prox > fin) break;
      this.t = sig.prox;
      sig.prox += sig.ms;
      sig.fn();
    }
    this.t = fin;
  }
}

/** Enlace en memoria con pérdida opcional; el que recibe lo tiene 1 ms después. */
function enlace(reloj: Reloj, perdida: (lado: number) => boolean = () => false) {
  const mk = (lado: number) => {
    const oy = new Set<(t: string) => void>();
    const e = {
      enviados: [] as string[],
      otro: null as null | { recibir(t: string): void },
      enviar(t: string): "ok" {
        e.enviados.push(t);
        const o = e.otro;
        const tirar = (t.startsWith('{"t":"voz.p"') || t.startsWith('{"t":"voz.b"')) && perdida(lado);
        if (o && !tirar) {
          const q = reloj.cada(() => {
            q();
            o.recibir(t);
          }, 1);
        }
        return "ok";
      },
      ocupado: () => false,
      alRecibir(cb: (t: string) => void) {
        oy.add(cb);
        return () => oy.delete(cb);
      },
      abierto: () => true,
      info: () => ({ tipo: "ble", cifrada: true }),
      recibir(t: string) {
        for (const f of Array.from(oy)) f(t);
      },
    };
    return e;
  };
  const a = mk(0);
  const b = mk(1);
  a.otro = b;
  b.otro = a;
  return [a, b] as const;
}

function audio() {
  const oido: Int16Array[] = [];
  let cb: (p: Int16Array) => void = () => undefined;
  const a: AudioVoz = {
    iniciar: async (f) => {
      cb = f;
      return true;
    },
    reproducir: (p) => oido.push(p),
    detener: () => undefined,
  };
  return { a, oido, hablar: (p: Int16Array) => cb(p) };
}

/**
 * «Opus» de mentira que hace lo que importa: tramas de 20/40/60 ms (junta 1–3 capturas), marca q/n, y el decodificador
 * devuelve la trama entera (n × 320 muestras) para que la sesión la parta.
 */
function fabricaOpusFalsa(registro: Array<{ kbps: number; msTrama: number }>): FabricaCodecs {
  const simples = fabricaCodecsSimples();
  return {
    soportados: () => ["opus", "adpcm", "mulaw"],
    tramaLargaOpus: () => true,
    codificador(c) {
      if (c !== "opus") return simples.codificador(c);
      let salida: (b: Uint8Array, m?: { q: number; n: number }) => void = () => undefined;
      let msTrama = 20;
      let buf: Int16Array[] = [];
      let q0 = 0;
      return {
        codificar(pcm, q) {
          if (!buf.length) q0 = q ?? 0;
          buf.push(pcm);
          if (buf.length * 20 >= msTrama) {
            const n = buf.length;
            const out = new Uint8Array(n * 4);
            buf.forEach((p, i) => new DataView(out.buffer).setInt32(i * 4, p[0]));
            buf = [];
            salida(out, { q: q0, n });
          }
        },
        ajustar(n) {
          registro.push(n);
          msTrama = n.msTrama;
          buf = [];
        },
        alSalir(f) {
          salida = f;
        },
        cerrar() {},
      };
    },
    decodificador(c) {
      if (c !== "opus") return simples.decodificador(c);
      let f: (p: Int16Array, q: number) => void = () => undefined;
      return {
        decodificar(b, q) {
          const n = b.length / 4;
          const pcm = new Int16Array(n * MUESTRAS_TRAMA);
          for (let i = 0; i < n; i++) pcm.fill(new DataView(b.buffer, b.byteOffset).getInt32(i * 4), i * MUESTRAS_TRAMA, (i + 1) * MUESTRAS_TRAMA);
          f(pcm, q);
        },
        alPcm(cb) {
          f = cb;
        },
        cerrar() {},
      };
    },
  };
}

const tono = (k: number) => new Int16Array(MUESTRAS_TRAMA).fill(1000 + (k % 500));

async function llamada(o: { anteriorA?: boolean; anteriorB?: boolean; perdida?: (lado: number) => boolean; capacidad?: number | null } = {}) {
  const reloj = new Reloj();
  const [ea, eb] = enlace(reloj, o.perdida);
  const cap = (e: TransporteVoz) => Object.assign(e, { capacidadKbps: () => o.capacidad ?? null });
  const aa = audio();
  const ab = audio();
  const ajustesA: Array<{ kbps: number; msTrama: number }> = [];
  const sa = new SesionVozDatos({ idLlamada: ID, transporte: cap(ea), audio: aa.a, codecs: fabricaOpusFalsa(ajustesA), reloj, comoAnterior: o.anteriorA });
  const sb = new SesionVozDatos({ idLlamada: ID, transporte: cap(eb), audio: ab.a, codecs: fabricaOpusFalsa([]), reloj, comoAnterior: o.anteriorB });
  await sa.iniciar();
  await sb.iniciar();
  let k = 0;
  const hablar = (ms: number) => {
    for (let i = 0; i < ms / 20; i++) {
      aa.hablar(tono(k));
      ab.hablar(tono(k));
      k++;
      reloj.avanzar(20);
    }
  };
  return { reloj, ea, eb, aa, ab, sa, sb, hablar, ajustesA };
}

describe("negociación con un aparato anterior (0.5.1-prueba.36)", () => {
  it("dos aparatos nuevos hablan «b1» y se informan; la voz llega entera", async () => {
    const x = await llamada();
    x.hablar(3000);
    expect(x.ea.enviados.some((t) => t.startsWith('{"t":"voz.b"'))).toBe(true);
    expect(x.ea.enviados.some((t) => t.startsWith('{"t":"voz.p"'))).toBe(false);
    expect(x.ea.enviados.some((t) => t.includes('"k":"rep"'))).toBe(true);
    expect(x.sb.estado().perdidaPct).toBe(0);
    expect(x.ab.oido.filter((p) => p[0] >= 1000).length).toBeGreaterThan(120);
  });

  it("nuevo → anterior (en los dos sentidos): `voz.p` con tramas de 20 ms, sin «rep», y se oye", async () => {
    for (const lado of ["A", "B"] as const) {
      const x = await llamada(lado === "A" ? { anteriorB: true } : { anteriorA: true });
      x.hablar(3000);
      const nuevo = lado === "A" ? x.ea : x.eb;
      const viejo = lado === "A" ? x.eb : x.ea;
      expect(nuevo.enviados.some((t) => t.startsWith('{"t":"voz.b"'))).toBe(false);
      const p = nuevo.enviados.filter((t) => t.startsWith('{"t":"voz.p"'));
      expect(p.length).toBeGreaterThan(20);
      // Cada trama es de 20 ms (lo que el decodificador de antes numera).
      expect(p.every((t) => (unidadesPaqueteVoz(t)?.unidades.length ?? 0) <= 8)).toBe(true);
      expect(nuevo.enviados.some((t) => t.includes('"k":"rep"'))).toBe(false);
      expect(viejo.enviados.some((t) => t.includes('"fmt"'))).toBe(false);
      const oyeElViejo = lado === "A" ? x.ab.oido : x.aa.oido;
      const oyeElNuevo = lado === "A" ? x.aa.oido : x.ab.oido;
      expect(oyeElViejo.filter((q) => q[0] >= 1000).length).toBeGreaterThan(100);
      expect(oyeElNuevo.filter((q) => q[0] >= 1000).length).toBeGreaterThan(100);
    }
  });

  it("anunciando 16 kb/s arranca en el último escalón: tramas de 60 ms y paquetes de 180 ms, partidas al oírse", async () => {
    const x = await llamada({ capacidad: 16 });
    x.hablar(3000);
    expect(x.sa.estado().nivel).toMatchObject({ kbps: 6, msTrama: 60, msPaquete: 180, formato: "b1" });
    expect(x.ajustesA[x.ajustesA.length - 1]).toEqual({ kbps: 6, msTrama: 60 });
    const b = x.ea.enviados.filter((t) => t.startsWith('{"t":"voz.b"')).map((t) => leerPaqueteB(t)!);
    expect(b.length).toBeGreaterThan(5);
    expect(b.some((p) => p.tramas.some((t) => t.n === 3))).toBe(true);
    // Se oye lo que se dijo, trama a trama (320 muestras), sin pérdida.
    expect(x.ab.oido.every((p) => p.length === MUESTRAS_TRAMA)).toBe(true);
    expect(x.ab.oido.filter((p) => p[0] >= 1000).length).toBeGreaterThan(100);
    expect(x.sb.estado().perdidaPct).toBe(0);
    expect(textoCalidadVoz(x.sa.calidad())).toContain("Opus 6 kb/s");
  });
});

describe("bajo el suelo se dice la verdad", () => {
  it("con la mitad perdida el que oye se calla y avisa; el que habla lo sabe por el informe; al volver, se va solo", async () => {
    let malo = true;
    const n = [0, 0];
    const x = await llamada({ perdida: (l) => malo && n[l]++ % 2 === 0 });
    x.hablar(6000);
    expect(x.sb.estado().sinVozRx).toBe(true);
    expect(x.sb.estado().aviso).toBe(AVISO_SIN_VOZ_RX);
    expect(nivelCalidadVoz(x.sb.calidad())).toBe("mala");
    expect(textoCalidadVoz(x.sb.calidad())).toMatch(/no alcanza para la voz/);
    // Lo que se reproduce mientras tanto es silencio limpio, no fragmentos.
    const desde = x.ab.oido.length;
    x.hablar(400);
    expect(x.ab.oido.slice(desde).every((p) => p.every((v) => v === 0))).toBe(true);
    // El que habla lo sabe por el «rep» (corte) y lo dice.
    expect(x.sa.estado().bajoSueloTx).toBe(true);
    expect(x.sa.estado().aviso).toMatch(/no alcanza para la voz/);
    malo = false;
    x.hablar(10_000);
    expect(x.sb.estado().sinVozRx).toBe(false);
    expect(x.sb.estado().aviso).toBeNull();
    expect(x.sa.estado().aviso).toBeNull();
  });

  it("la reserva de la voz sigue a su escalón y se retira al colgar", async () => {
    __vaciarReservasVoz();
    const x = await llamada({ capacidad: 16 });
    x.hablar(200);
    // VOZ1111L: con dos sesiones activas (los dos extremos aquí) no se sabe cuál comparte carril: sin reserva.
    expect(reservaVozKbps()).toBeNull();
    x.sb.detener();
    expect(reservaVozKbps()).toBe(kbpsTextoNivel(NIVELES_OPUS[NIVELES_OPUS.length - 1], "b1", ID));
    x.sa.detener();
    expect(reservaVozKbps()).toBeNull();
  });
});
