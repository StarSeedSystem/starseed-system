import { describe, it, expect } from "vitest";
import { crearVadTramos, escucharFusionado, blobWav, SILENCIO_MS, TRAMO_MS_MAX, VOZ_MS_MIN, type TramoAudio, type EncajeVad } from "../escucha-fusionada";
import type { ResultadoOido } from "../motores-oido";

const RATE = 16000;
/** Un bloque constante: su |valor| es exactamente su RMS (fácil de razonar). */
const bloque = (valor: number, ms = 250): Float32Array => new Float32Array(Math.round((ms / 1000) * RATE)).fill(valor);
interface Espias { elegir: Array<{ idioma: string; fase: string }>; transcribir: Array<{ motor: string; idioma: string; hotwords: string[] }>; parciales: string[]; finales: string[]; }

/** Monta una escucha con elector y transcriptor FALSOS (sin red ni micrófono ni procesos). */
function fabricarEscucha(opts?: { motor?: string; texto?: string; fallo?: boolean; elegir?: (p: { idioma: string; fase: "final" }) => ResultadoOido; idiomaPista?: string; hotwords?: string[] }) {
  const espias: Espias = { elegir: [], transcribir: [], parciales: [], finales: [] };
  let alBloque: (b: Float32Array, rate: number) => void = () => {};
  const escucha = escucharFusionado({
    obtenerAudio: (cb) => { alBloque = cb; return { parar: () => {} }; },
    elegir: opts?.elegir ?? ((p) => { espias.elegir.push(p); return { motor: opts?.motor ?? "parakeet-v3", motivo: "falso" }; }),
    transcribir: async (_tramo, motor, extra) => {
      espias.transcribir.push({ motor, idioma: extra.idioma, hotwords: extra.hotwords });
      if (opts?.fallo) throw new Error("servidor tumbado"); // el transcriptor puede caer
      return opts?.texto ?? "hola";
    },
    alParcial: (t) => espias.parciales.push(t), alFinal: (t) => espias.finales.push(t),
    idiomaPista: opts?.idiomaPista, hotwords: opts?.hotwords,
  });
  return { escucha, espias, enviar: (valor: number, ms?: number) => alBloque(bloque(valor, ms), RATE) };
}
/** Deja correr la cola de transcripciones (microtareas + timers mínimos). */
const asentar = () => new Promise((r) => setTimeout(r, 10));
/** Una frase completa (voz + silencio de cierre) + asentar. */
const conFrase = async (f: ReturnType<typeof fabricarEscucha>, n = 1) => {
  for (let i = 0; i < n; i++) { f.enviar(0.2); for (let j = 0; j < 6; j++) f.enviar(0); await asentar(); }
};

describe("crearVadTramos", () => {
  it("constantes iguales a las del VAD de oss-stt.ts", () => {
    expect(SILENCIO_MS).toBe(800); expect(TRAMO_MS_MAX).toBe(30000); expect(VOZ_MS_MIN).toBe(350);
  });
  it("silencio puro no abre ni cierra nada", () => {
    const vad = crearVadTramos(RATE);
    expect(vad.procesar(bloque(0)).tipo).toBe("nada");
    expect(vad.procesar(bloque(0)).tipo).toBe("nada"); expect(vad.cortar()).toBe("nada");
  });
  it("una frase más 800 ms de silencio se cierra y trae el audio entero", () => {
    const vad = crearVadTramos(RATE);
    expect(vad.procesar(bloque(0.2)).tipo).toBe("voz"); // empieza la voz
    let visto: EncajeVad = { tipo: "nada" };
    for (let i = 0; i < 8 && visto.tipo !== "tramo"; i++) visto = vad.procesar(bloque(0));
    expect(visto.tramo?.ms).toBeGreaterThanOrEqual(1250); expect(visto.tramo?.sampleRate).toBe(RATE);
    expect(visto.tramo?.audio[0]).toBeCloseTo(0.2); // la primera sílaba quedó dentro
  });
  it("un monólogo se corta solo al llegar al máximo de 30 s", () => {
    const vad = crearVadTramos(RATE);
    let corte = 0;
    for (let ms = 250; ms <= TRAMO_MS_MAX && !corte; ms += 250) {
      const r = vad.procesar(bloque(0.2)); if (r.tipo === "tramo") corte = r.tramo?.ms ?? 0;
    }
    expect(corte).toBeGreaterThanOrEqual(30000);
  });
  it("menos del mínimo de voz se descarta con cortar()", () => {
    const vad = crearVadTramos(RATE);
    vad.procesar(bloque(0.2)); expect(vad.cortar()).toBe("nada"); // 250 ms < 350
    vad.procesar(bloque(0.2)); vad.procesar(bloque(0.2)); expect(vad.cortar()).toBe("tramo"); // 500 ms
  });
});

describe("blobWav", () => {
  it("deja un WAV PCM16 mono con cabecera RIFF/WAVE", async () => {
    const tramo: TramoAudio = { audio: new Float32Array([0.5, -0.5, 0.25]), sampleRate: RATE, ms: 188 };
    const v = new DataView(await blobWav(tramo).arrayBuffer());
    const texto = (off: number) => String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    expect(v.byteLength).toBe(44 + 3 * 2);
    expect(texto(0)).toBe("RIFF"); expect(texto(8)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(RATE); expect(v.getUint16(22, true)).toBe(1); // ritmo y mono
    expect(v.getInt16(44, true)).toBeGreaterThan(16000); expect(v.getInt16(46, true)).toBeLessThan(-16000);
  });
  it("recorta la amplitud fuera de ±1", async () => {
    const tramo: TramoAudio = { audio: new Float32Array([2, -2]), sampleRate: RATE, ms: 125 };
    const v = new DataView(await blobWav(tramo).arrayBuffer());
    expect(v.getInt16(44, true)).toBe(0x7fff); expect(v.getInt16(46, true)).toBe(-0x8000);
  });
});

describe("escucharFusionado", () => {
  it("elige el motor de la fase final por tramo y entrega el texto", async () => {
    const f = fabricarEscucha({ motor: "parakeet-v3", texto: "hola hacia el elector" });
    await conFrase(f); expect(f.espias.elegir).toEqual([{ idioma: "es", fase: "final" }]);
    expect(f.espias.transcribir).toHaveLength(1);
    expect(f.espias.transcribir[0].motor).toBe("parakeet-v3"); expect(f.espias.finales).toEqual(["hola hacia el elector"]);
  });
  it("idiomaPista y hotwords llegan al elector y al transcriptor", async () => {
    const f = fabricarEscucha({ idiomaPista: "pt", hotwords: ["Astraura", "StarSeed"] });
    await conFrase(f); expect(f.espias.elegir[0].idioma).toBe("pt");
    expect(f.espias.transcribir[0].hotwords).toEqual(["Astraura", "StarSeed"]);
  });
  it("el suelo (navegador) no se transcribe: no hay endpoint", async () => {
    const f = fabricarEscucha({ motor: "navegador" });
    await conFrase(f); expect(f.espias.transcribir).toHaveLength(0); expect(f.espias.finales).toHaveLength(0);
  });
  it("un tramo tumbado no detiene la escucha ni lanza", async () => {
    const f = fabricarEscucha({ fallo: true });
    await expect(conFrase(f)).resolves.toBeUndefined(); // no lanza
    await conFrase(f); // segunda frase: sigue oyendo tras el motor caído
    expect(f.espias.elegir).toHaveLength(2);
    expect(f.espias.transcribir).toHaveLength(2); expect(f.espias.finales).toHaveLength(0);
  });
  it("alParcial avisa una vez por frase antes del final", async () => {
    const f = fabricarEscucha();
    await conFrase(f, 2);
    expect(f.espias.parciales).toEqual(["…", "…"]); expect(f.espias.finales).toHaveLength(2); // un aviso por frase
  });
  it("parar deja de transcribir lo que llegue después", async () => {
    const f = fabricarEscucha();
    await conFrase(f);
    expect(f.espias.finales).toHaveLength(1);
    f.escucha.parar(); await conFrase(f);
    expect(f.espias.finales).toHaveLength(1); // lo de después, fuera
  });
});
