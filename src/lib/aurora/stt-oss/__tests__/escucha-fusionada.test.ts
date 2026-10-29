import { describe, expect, it, vi } from "vitest";
import {
  escucharFusionado,
  SILENCIO_TRAMO_MS,
  TRAMO_MAX_MS,
  type BloqueAudio,
  type PeticionOido,
  type TramoAudio,
} from "../escucha-fusionada";
import type { ResultadoTranscripcion } from "../oido-openai";

const HZ = 1000;
const MUESTRAS_POR_BLOQUE = 100;

/** Un bloque de 100 ms con la amplitud indicada (0 = silencio). */
function bloque(amplitud: number): BloqueAudio {
  return { muestras: new Float32Array(MUESTRAS_POR_BLOQUE).fill(amplitud), frecuencia: HZ };
}

/** Bloques de silencio (100 ms cada uno) para calibrar el suelo de ruido. */
function calibracion(): BloqueAudio[] {
  return Array.from({ length: 10 }, () => bloque(0));
}

/** `ms` de voz continua (amplitud muy por encima del umbral). */
function voz(ms: number): BloqueAudio[] {
  return Array.from({ length: ms / 100 }, () => bloque(0.2));
}

/** `ms` de silencio. */
function silencio(ms: number): BloqueAudio[] {
  return Array.from({ length: ms / 100 }, () => bloque(0));
}

/** Fuente falsa: entrega los bloques en orden, sin micrófono ni procesos. */
async function* fuente(bloques: BloqueAudio[]): AsyncIterable<BloqueAudio> {
  for (const b of bloques) yield b;
}

/** Transcritor falso: devuelve un texto que incluye el motor elegido. */
function transcritorFalso() {
  return vi.fn(
    async (_tramo: TramoAudio, peticion: PeticionOido): Promise<ResultadoTranscripcion> => ({
      ok: true,
      texto: `dicho-${peticion.motor}`,
      motor: peticion.motor,
      ms: 0,
    }),
  );
}

describe("escucharFusionado", () => {
  it("cierra el tramo con 800 ms de silencio y transcribe con el motor final", async () => {
    const elegir = vi.fn(() => ({ motor: "parakeet-v3", motivo: "prueba" }));
    const transcribir = transcritorFalso();
    const alFinal = vi.fn();
    await escucharFusionado({
      obtenerAudio: () => fuente([...calibracion(), ...voz(1000), ...silencio(SILENCIO_TRAMO_MS)]),
      elegir,
      transcribir,
      alFinal,
      idiomaPista: "es-MX",
    });
    expect(elegir).toHaveBeenCalledWith(
      expect.objectContaining({ idioma: "es", fase: "final" }),
    );
    expect(transcribir).toHaveBeenCalledTimes(1);
    expect(alFinal).toHaveBeenCalledWith("dicho-parakeet-v3", "parakeet-v3");
  });

  it("no transcribe el ruido de fondo por debajo del umbral", async () => {
    const transcribir = transcritorFalso();
    const alFinal = vi.fn();
    await escucharFusionado({
      obtenerAudio: () => fuente([
        ...calibracion(),
        ...Array.from({ length: 20 }, () => bloque(0.005)),
      ]),
      elegir: () => ({ motor: "parakeet-v3", motivo: "prueba" }),
      transcribir,
      alFinal,
    });
    expect(transcribir).not.toHaveBeenCalled();
    expect(alFinal).not.toHaveBeenCalled();
  });

  it("corta un tramo a los 30 s aunque no haya silencio", async () => {
    const transcribir = transcritorFalso();
    const alFinal = vi.fn();
    await escucharFusionado({
      obtenerAudio: () => fuente([...calibracion(), ...voz(TRAMO_MAX_MS)]),
      elegir: () => ({ motor: "parakeet-v3", motivo: "prueba" }),
      transcribir,
      alFinal,
    });
    expect(transcribir).toHaveBeenCalledTimes(1);
    const tramo = transcribir.mock.calls[0][0];
    expect(tramo.muestras.length).toBeGreaterThanOrEqual(TRAMO_MAX_MS);
  });

  it("pide el motor por tramo y entrega los finales en orden", async () => {
    const elegir = vi.fn()
      .mockReturnValueOnce({ motor: "parakeet-v3", motivo: "español" })
      .mockReturnValueOnce({ motor: "phonon-2", motivo: "inglés" });
    const transcribir = transcritorFalso();
    const alFinal = vi.fn();
    await escucharFusionado({
      obtenerAudio: () => fuente([
        ...calibracion(),
        ...voz(500),
        ...silencio(SILENCIO_TRAMO_MS),
        ...voz(500),
        ...silencio(SILENCIO_TRAMO_MS),
      ]),
      elegir,
      transcribir,
      alFinal,
    });
    expect(elegir).toHaveBeenCalledTimes(2);
    expect(alFinal.mock.calls).toEqual([
      ["dicho-parakeet-v3", "parakeet-v3"],
      ["dicho-phonon-2", "phonon-2"],
    ]);
  });

  it("un tramo que falla no tumba la escucha ni los siguientes", async () => {
    const transcribir = transcritorFalso();
    transcribir.mockRejectedValueOnce(new Error("motor caído"));
    const alFinal = vi.fn();
    await expect(escucharFusionado({
      obtenerAudio: () => fuente([
        ...calibracion(),
        ...voz(500),
        ...silencio(SILENCIO_TRAMO_MS),
        ...voz(500),
        ...silencio(SILENCIO_TRAMO_MS),
      ]),
      elegir: () => ({ motor: "parakeet-v3", motivo: "prueba" }),
      transcribir,
      alFinal,
    })).resolves.toBeUndefined();
    expect(transcribir).toHaveBeenCalledTimes(2);
    expect(alFinal).toHaveBeenCalledTimes(1);
    expect(alFinal).toHaveBeenCalledWith("dicho-parakeet-v3", "parakeet-v3");
  });

  it("si el elector falla, se salta el tramo sin lanzar", async () => {
    const transcribir = transcritorFalso();
    const alFinal = vi.fn();
    await expect(escucharFusionado({
      obtenerAudio: () => fuente([...calibracion(), ...voz(500), ...silencio(SILENCIO_TRAMO_MS)]),
      elegir: () => { throw new Error("sin elector"); },
      transcribir,
      alFinal,
    })).resolves.toBeUndefined();
    expect(transcribir).not.toHaveBeenCalled();
    expect(alFinal).not.toHaveBeenCalled();
  });

  it("limpia el parcial del navegador al cerrar y nunca lanza si la fuente cae", async () => {
    const alParcial = vi.fn();
    const alFinal = vi.fn();
    const transcribir = transcritorFalso();
    async function* fuenteRota(): AsyncIterable<BloqueAudio> {
      for (const b of [...calibracion(), ...voz(1000)]) yield b;
      throw new Error("se cayó el micrófono");
    }
    await expect(escucharFusionado({
      obtenerAudio: fuenteRota,
      elegir: () => ({ motor: "parakeet-v3", motivo: "prueba" }),
      transcribir,
      alParcial,
      alFinal,
    })).resolves.toBeUndefined();
    expect(alParcial).toHaveBeenCalledWith("");
    expect(alFinal).toHaveBeenCalledTimes(1);
  });
});
