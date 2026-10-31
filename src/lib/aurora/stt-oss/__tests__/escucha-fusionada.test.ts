import { describe, it, expect } from "vitest";
import {
  crearTramador, escucharFusionado, tramoAWav,
  type FragmentoOido, type PeticionTranscripcion, type TramoOido,
} from "@/lib/aurora/stt-oss/escucha-fusionada";

/** Bloque de 100 ms a 16 kHz: silencio (0) o voz (0,3, muy por encima del umbral). */
const bloque = (voz: boolean, ms = 100): Float32Array => {
  const b = new Float32Array(Math.round((16000 * ms) / 1000));
  if (voz) for (let i = 0; i < b.length; i++) b[i] = 0.3;
  return b;
};
/** Deja correr microtareas (sin temporizadores) hasta que se cumple la condición. */
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let j = 0; j < 2000 && !cond(); j++) await Promise.resolve();
};
/** Fuente de prueba: preroll 3 · voz n · silencio 9, y fin al agotarse. */
const fuenteTest = (voz: number): (() => FragmentoOido | null) => {
  const fuente = [
    ...Array.from({ length: 3 }, () => bloque(false)),
    ...Array.from({ length: voz }, () => bloque(true)),
    ...Array.from({ length: 9 }, () => bloque(false)),
  ];
  let i = 0;
  return () => (i < fuente.length ? { pcm: fuente[i++], rate: 16000 } : null);
};
describe("tramoAWav", () => {
  it("empaqueta PCM como WAV f32 (RIFF/WAVE, ritmo y datos correctos)", () => {
    const pcm = new Float32Array([0.1, -0.2]);
    const bytes = new DataView(tramoAWav(pcm, 16000));
    expect(bytes.getInt32(4, true)).toBe(36 + pcm.length * 4); // tamaño del bloque RIFF
    expect(bytes.getInt32(8, true)).toBe(0x45564157); // "WAVE"
    expect(bytes.getInt32(36, true)).toBe(0x61746164); // "data"
    expect(bytes.getUint16(20, true)).toBe(3); // IEEE float
    expect(bytes.getUint32(24, true)).toBe(16000);
    expect(tramoAWav(pcm).byteLength).toBe(44 + pcm.length * 4);
    expect(bytes.getFloat32(44, true)).toBeCloseTo(0.1);
  });
});

describe("crearTramador", () => {
  it("cierra el tramo tras ~800 ms de silencio y respeta el pre-roll (~300 ms)", () => {
    const tramador = crearTramador();
    for (let i = 0; i < 3; i++) expect(tramador.empujar(bloque(false))).toBeNull();
    expect(tramador.vozActiva()).toBe(false);
    tramador.empujar(bloque(true));
    expect(tramador.vozActiva()).toBe(true);
    for (let i = 0; i < 4; i++) expect(tramador.empujar(bloque(true))).toBeNull(); // 500 ms de voz
    let tramo: TramoOido | null = null;
    for (let j = 0; j < 12 && !tramo; j++) tramo = tramador.empujar(bloque(false));
    expect(tramador.vozActiva()).toBe(false);
    expect(tramo).not.toBeNull();
    expect(Math.round(tramo!.ms)).toBe(1600); // pre-roll 300 + voz 500 + silencio 800
    expect(tramo!.pcm.length).toBe(25600); // 1,6 s a 16 kHz
    expect(tramo!.pcm[0]).toBe(0); // el pre-roll es silencio: no corta la primera sílaba
  });

  it("corta el tramo a los 30 s aunque no llegue el silencio", () => {
    const tramador = crearTramador();
    tramador.empujar(bloque(true));
    let tramo: TramoOido | null = null;
    for (let i = 0; i < 299 && !tramo; i++) tramo = tramador.empujar(bloque(true));
    expect(tramador.vozActiva()).toBe(false); // tras el corte vuelve a aguardar voz
    expect(Math.round(tramo!.ms)).toBe(30000);
  });
  it("descarta rozamientos breves (< 350 ms) y `cerrar` es idempotente", () => {
    const tramador = crearTramador();
    tramador.empujar(bloque(true, 200));
    expect(tramador.vozActiva()).toBe(true);
    expect(tramador.cerrar()).toBeNull(); // tramo demasiado corto
    expect(tramador.vozActiva()).toBe(false);
    expect(tramador.cerrar()).toBeNull();
  });
});

describe("escucharFusionado", () => {
  it("elige motor por tramo (fase final), transcribe y entrega el final recortado", async () => {
    const peticiones: PeticionTranscripcion[] = [];
    const tramos: TramoOido[] = [];
    const pistas: string[] = [];
    const finales: string[] = [];
    const sesion = escucharFusionado({
      obtenerAudio: fuenteTest(5),
      elegir: (idioma) => ({ motor: idioma === "es" ? "parakeet-v3" : "phonon-2" }),
      transcribir: async (tramo, peticion) => {
        tramos.push(tramo);
        peticiones.push(peticion);
        return "  hola Astraura  ";
      },
      alParcial: (t) => pistas.push(t),
      alFinal: (t) => finales.push(t),
      idiomaPista: "es",
      hotwords: ["StarSeed", "Astraura", "Genesis"],
    });
    await esperar(() => finales.length > 0);
    sesion.detener();
    expect(finales).toEqual(["hola Astraura"]);
    expect(peticiones[0].motor).toBe("parakeet-v3");
    expect(peticiones[0].idioma).toBe("es"); expect(peticiones[0].hotwords).toEqual(["StarSeed", "Astraura", "Genesis"]);
    expect(tramos[0].rate).toBe(16000); expect(tramos[0].ms).toBeGreaterThanOrEqual(350);
    expect(pistas).toContain("…");
    expect(sesion.activa()).toBe(false);
  });
  it("un motor caído (lanza o `null`) pierde su tramo y no tumba el oído ni entrega final", async () => {
    let peticiones = 0;
    const finales: string[] = [];
    const sesion = escucharFusionado({
      obtenerAudio: fuenteTest(6),
      transcribir: async () => {
        peticiones += 1;
        throw new Error("motor caído");
      },
      alParcial: () => { /* sin pista en esta prueba */ },
      alFinal: (t) => finales.push(t),
    });
    await esperar(() => !sesion.activa() && peticiones > 0); await esperar(() => finales.length > 0);
    expect(finales).toEqual([]); // el tramo del motor caído se pierde, nada más
    expect(sesion.activa()).toBe(false); // la fuente se agotó con normalidad
  });
});
