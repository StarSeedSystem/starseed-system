import { describe, expect, it, vi } from "vitest";
import { aWav, DivisorTramos, escucharFusionado, HOTWORDS_STARSEED, TRAMO_MAX_MS, TRAMO_SILENCIO_MS, type OpcionesEscuchaFusionada } from "../escucha-fusionada";

/** Voz (0.5) o silencio (0) durante N ms con bloques de 1 ms a 1000 Hz. */
function crear(audio: "voz" | "silencio", ms: number): Float32Array { return new Float32Array(ms).fill(audio === "voz" ? 0.5 : 0); }

describe("DivisorTramos (el VAD de oss-stt, extraído)", () => {
  it("cierra el tramo a los 800 ms de silencio y entrega el PCM completo", () => {
    const cerrados: Float32Array[] = []; const d = new DivisorTramos(1000, (pcm) => cerrados.push(pcm));
    d.bloque(crear("voz", 100), 0); // la voz, y con ella la última voz, viven en t=0
    for (let t = 100; t <= 1300; t++) d.bloque(crear("silencio", 1), t);
    expect(cerrados).toHaveLength(1); // cierra cuando el silencio alcanza los 800 ms
    expect(cerrados[0].length).toBe(801); // 100 de voz + 701 de silencio
  });
  it("corta un monólogo de más de 30 s aunque no haya silencio", () => {
    const cerrados: Float32Array[] = []; const d = new DivisorTramos(1000, (pcm) => cerrados.push(pcm));
    for (let t = 0; t <= TRAMO_MAX_MS + 100; t++) d.bloque(crear("voz", 1), t);
    expect(cerrados).toHaveLength(1);
    expect(cerrados[0].length).toBeGreaterThanOrEqual(TRAMO_MAX_MS);
  });
  it("tira el tramo que trae menos de 350 ms de audio (clic), aunque se cierre a tiempo", () => {
    const cerrados: Float32Array[] = []; const d = new DivisorTramos(1000, (pcm) => cerrados.push(pcm));
    for (let t = 0; t <= 199; t++) d.bloque(crear("voz", 1), t);
    d.cerrar(); // un cierre a tiempo (como el de un corte abrupto): 200 ms, clic
    expect(cerrados).toHaveLength(0);
  });
});

/** Fuente de audio falsa + callbacks falsos para escucharFusionado. */
function crearEscucha(remplazar: Partial<OpcionesEscuchaFusionada> = {}) {
  const llamadas = { alParcial: vi.fn(), alFinal: vi.fn() };
  let alBloque: ((pcm: Float32Array, ahora: number) => void) | null = null;
  let soltamicro = 0;
  const opciones: OpcionesEscuchaFusionada = {
    obtenerAudio: (cb) => { alBloque = cb; return { sampleRate: 1000, detener: () => { soltamicro++; } }; },
    elegir: vi.fn(() => ({ motor: "parakeet-v3", motivo: "prueba" })),
    transcribir: vi.fn(async () => ({ ok: true, texto: "hola Astraura", idioma: "es" })),
    alParcial: llamadas.alParcial, alFinal: llamadas.alFinal,
    idiomaPista: "es", hotwords: HOTWORDS_STARSEED,
    ...remplazar,
  };
  const decir = (tipo: "voz" | "silencio", ms: number, inicio: number) => { const pcm = crear(tipo, ms); for (let i = 0; i < ms; i++) alBloque?.(new Float32Array(1).fill(pcm[i]), inicio + i); };
  return { escucha: escucharFusionado(opciones), opciones, llamadas, decir, soltado: () => soltamicro, alBloque: () => alBloque };
}
/** Deja respirar el procesamiento asíncrono (el transcriptor falso responde al instante). */
const respirar = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };

describe("escucharFusionado", () => {
  it("pide motor de fase «final» por tramo y reparte el texto con su motor", async () => {
    const { escucha, opciones, llamadas, decir } = crearEscucha();
    escucha.arrancar();
    decir("voz", 100, 0); decir("silencio", TRAMO_SILENCIO_MS + 2, 100); await respirar();
    expect(opciones.elegir).toHaveBeenCalledWith({ idioma: "es", fase: "final" });
    expect(opciones.transcribir).toHaveBeenCalledWith(expect.objectContaining({ motor: "parakeet-v3", idioma: "es", hotwords: HOTWORDS_STARSEED, sampleRate: 1000 }));
    expect(llamadas.alFinal).toHaveBeenCalledWith("hola Astraura", "parakeet-v3");
    expect(escucha.motorFinal()).toBe("parakeet-v3");
  });
  it("usa la pista de idioma por tramo, sin imponerla (regla 2 del §3)", async () => {
    const { escucha, opciones, decir } = crearEscucha({ idiomaPista: "es-MX" });
    escucha.arrancar();
    decir("voz", 100, 0); decir("silencio", TRAMO_SILENCIO_MS + 2, 100); await respirar();
    expect(opciones.elegir).toHaveBeenCalledWith({ idioma: "es-mx", fase: "final" });
  });
  it("un tramo que falla no tumba la escucha: el siguiente se transcribe igual", async () => {
    let pruebas = 0;
    const { escucha, opciones, llamadas, decir } = crearEscucha({
      transcribir: vi.fn(async () => {
        pruebas += 1;
        if (pruebas === 1) throw new Error("la red se fue");
        if (pruebas === 2) throw new Error("sin clave");
        return { ok: true, texto: "ahora va", idioma: "es" };
      }),
    });
    escucha.arrancar();
    for (const j of [0, 1, 2]) { decir("voz", 100, j * 1300); decir("silencio", TRAMO_SILENCIO_MS + 2, j * 1300 + 100); }
    await respirar();
    expect(opciones.transcribir).toHaveBeenCalledTimes(3);
    expect(llamadas.alFinal).toHaveBeenCalledTimes(1); expect(llamadas.alFinal).toHaveBeenCalledWith("ahora va", "parakeet-v3");
  });
  it("la respuesta sin texto o fallida no llama a alFinal", async () => {
    const { escucha, llamadas, decir } = crearEscucha({ transcribir: vi.fn(async () => ({ ok: true, texto: "   " })) });
    escucha.arrancar();
    decir("voz", 100, 0); decir("silencio", TRAMO_SILENCIO_MS + 2, 100); await respirar();
    expect(llamadas.alFinal).not.toHaveBeenCalled();
  });
  it("parcial() reemite por alParcial y descarta lo vacío; elector roto cae al suelo", async () => {
    const { escucha, llamadas, decir } = crearEscucha({ elegir: vi.fn(() => { throw new Error("elector roto"); }) });
    escucha.parcial("  se oye…  "); escucha.parcial("   "); escucha.arrancar();
    decir("voz", 100, 0); decir("silencio", TRAMO_SILENCIO_MS + 2, 100); await respirar();
    expect(llamadas.alParcial).toHaveBeenCalledTimes(1); expect(llamadas.alParcial).toHaveBeenCalledWith("se oye…");
    expect(escucha.motorFinal()).toBe("navegador"); // suelo del elector caído
  });
  it("arrancar es idempotente y detener suelta la fuente y mata el tramo en vuelo", async () => {
    let dejarPasar!: (r: { ok: boolean; texto: string }) => void;
    const { escucha, llamadas, decir, soltado } = crearEscucha({
      transcribir: vi.fn(() => new Promise((r) => { dejarPasar = r; })),
    });
    escucha.arrancar(); escucha.arrancar();
    decir("voz", 100, 0); decir("silencio", TRAMO_SILENCIO_MS + 2, 100);
    expect(soltado()).toBe(0); escucha.detener(); escucha.detener(); expect(soltado()).toBe(1); // una sola fuente, idempotente
    dejarPasar({ ok: true, texto: "llegó tarde" });
    await respirar();
    expect(llamadas.alFinal).not.toHaveBeenCalled(); expect(escucha.activo()).toBe(false);
  });
});

describe("aWav", () => {
  it("escribe la cabecera RIFF WAV de 16 kHz mono y el PCM detectado", async () => {
    const blob = aWav(new Int16Array([100, -200]), 16000);
    expect(blob.type).toBe("audio/wav");
    const v = new DataView(await blob.arrayBuffer());
    const texto = (pos: number, largo: number) => String.fromCharCode(...new Uint8Array(v.buffer, pos, largo));
    expect(texto(0, 4)).toBe("RIFF");
    expect(texto(8, 4)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(16000); // sampleRate
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(40, true)).toBe(4); // 2 muestras × 2 bytes
    expect(v.getInt16(44, true)).toBe(100); expect(v.getInt16(46, true)).toBe(-200);
  });
});
