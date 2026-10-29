import { describe, it, expect } from "vitest";
import {
  escucharFusionado,
  tramoAWav,
  ESCUCHA_SILENCIO_MS,
  type OpcionesEscuchaFusionada,
  type TramoTranscrito,
} from "../escucha-fusionada";
import type { OpcionesEleccionOido } from "../motores-oido";

/** Todo el audio falso va a 16 kHz: la misma tasa del micrófono real. */
const SR = 16000;

/** Un bloque constante a `nivel` dura `ms` (su RMS es exactamente `nivel`). */
const bloque = (ms: number, nivel: number): Float32Array =>
  Float32Array.from({ length: Math.round((ms / 1000) * SR) }, () => nivel);

/** Trama de bloques de 50 ms que alterna silencio (0) y voz (0,3). */
const trama = (segmentos: Array<{ ms: number; nivel: number }>): Float32Array[] => {
  const bloques: Float32Array[] = [];
  for (const s of segmentos) {
    for (let queda = s.ms; queda > 0; queda -= 50) {
      bloques.push(bloque(Math.min(50, queda), s.nivel));
    }
  }
  return bloques;
};

/** Deja correr la cola de transcripciones de la escucha (microtareas + reloj). */
const vaciar = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resuelto) => setTimeout(resuelto, 0));
};

/** Duración en ms de un tramo WAV (44 bytes de cabecera + PCM16 a 2 bytes). */
const msDelTramo = (tramo: Blob): number =>
  ((tramo.size - 44) / 2 / SR) * 1000;

/**
 * Escucha con TODO falso: micrófono manual (`alimentar`), elector que siempre
 * responde «motor-prueba» y transcriptor que responde «lo oído».
 */
const crear = (ajustes: Partial<OpcionesEscuchaFusionada> = {}) => {
  const fuentes: Array<(b: Float32Array) => void> = [];
  const paradasDeFuente: number[] = [];
  const llamadasElector: OpcionesEleccionOido[] = [];
  const llamadasTranscripcion: { tramo: Blob; motor: string; idioma: string | undefined; hotwords: string[] }[] = [];
  const parciales: string[] = [];
  const finales: string[] = [];
  const escucha = escucharFusionado({
    obtenerAudio: (alBloque) => {
      fuentes.push(alBloque);
      return () => { paradasDeFuente.push(1); };
    },
    elegir: (o) => {
      llamadasElector.push(o);
      return { motor: "motor-prueba", motivo: "falso" };
    },
    transcribir: (tramo, motor, idioma, hotwords) => {
      llamadasTranscripcion.push({ tramo, motor, idioma, hotwords });
      return Promise.resolve<TramoTranscrito>({ texto: "lo oído" });
    },
    alParcial: (t) => { parciales.push(t); },
    alFinal: (t) => { finales.push(t); },
    ...ajustes,
  });
  return {
    escucha,
    alimentar: (serie: Float32Array[]) => { for (const b of serie) fuentes[0]?.(b); },
    llamadasElector,
    llamadasTranscripcion,
    parciales,
    finales,
    paradasDeFuente,
  };
};

describe("escucharFusionado", () => {
  it("corta un tramo, pide el elector de fase «final» y transcribe", async () => {
    const e = crear();
    e.alimentar(trama([
      { ms: 1000, nivel: 0 }, // calibración del suelo de ruido
      { ms: 1200, nivel: 0.3 }, // habla
      { ms: 1000, nivel: 0 }, // silencio que cierra el tramo
    ]));
    await vaciar();
    expect(e.llamadasElector).toHaveLength(1);
    expect(e.llamadasElector[0]?.fase).toBe("final");
    expect(e.llamadasElector[0]?.idioma).toBe("*"); // sin pista: manda el AUDIO
    expect(e.llamadasTranscripcion).toHaveLength(1);
    expect(e.llamadasTranscripcion[0]?.motor).toBe("motor-prueba");
    expect(e.llamadasTranscripcion[0]?.tramo).toBeInstanceOf(Blob);
    expect(e.finales).toEqual(["lo oído"]);
    // El parcial (señal honesta «…») se emite al empezar la voz, UNA vez.
    expect(e.parciales).toEqual(["…"]);
    // El tramo conserva el pre-roll y toda la voz: más largo que la habla.
    expect(msDelTramo(e.llamadasTranscripcion[0]!.tramo)).toBeGreaterThanOrEqual(1200);
  });

  it("mantiene el elector por tramo: cada cierre vuelve a pedir fase «final»", async () => {
    const e = crear();
    const unTramo = trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]);
    e.alimentar(unTramo);
    await vaciar();
    e.alimentar(unTramo);
    await vaciar();
    expect(e.llamadasElector).toHaveLength(2);
    expect(e.finales).toEqual(["lo oído", "lo oído"]);
    expect(e.llamadasTranscripcion.map((c) => c.motor)).toEqual(["motor-prueba", "motor-prueba"]);
  });

  it("el idioma que detecta el motor corrige la pista (§3 regla 2)", async () => {
    const e = crear({
      idiomaPista: "es",
      transcribir: () => Promise.resolve<TramoTranscrito>({ texto: "dijo", idioma: "en-GB" }),
    });
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    e.alimentar(trama([
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(e.llamadasElector.map((c) => c.idioma)).toEqual(["es", "en"]);
    expect(e.finales).toEqual(["dijo", "dijo"]);
  });

  it("respeta la pista y las palabras propias (§3 regla 3)", async () => {
    const e = crear({ idiomaPista: "es-MX", hotwords: ["StarSeed", "Astraura"] });
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(e.llamadasTranscripcion[0]?.idioma).toBe("es");
    expect(e.llamadasTranscripcion[0]?.hotwords).toEqual(["StarSeed", "Astraura"]);
  });
});

describe("escucharFusionado · detector de energía de oss-stt.ts", () => {
  it("descarta los tramos más cortos de 350 ms de voz", async () => {
    const e = crear();
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 200, nivel: 0.3 }, // clic/toque: se descarta
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(e.llamadasElector).toHaveLength(0);
    expect(e.llamadasTranscripcion).toHaveLength(0);
    expect(e.finales).toEqual([]);
  });

  it("cierra el tramo por fuerza a 30 s aunque no haya silencio", async () => {
    const tramoMaxMs = 600;
    const e = crear({ tramoMaxMs });
    e.alimentar(trama([{ ms: 1000, nivel: 0 }, { ms: 2500, nivel: 0.3 }]));
    await vaciar();
    expect(e.llamadasTranscripcion.length).toBeGreaterThanOrEqual(3);
    for (const llamada of e.llamadasTranscripcion) {
      const ms = msDelTramo(llamada.tramo);
      expect(ms).toBeGreaterThanOrEqual(350); // y siempre ≥ el mínimo de voz
      expect(ms).toBeLessThan(tramoMaxMs + 100); // un bloque de tolerancia
    }
  });

  it("no parte la frase por el silencio por defecto de 800 ms", async () => {
    // Sin silencio suficiente tras la voz, no debe cerrar aún nada.
    const e = crear();
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: ESCUCHA_SILENCIO_MS - 200, nivel: 0 },
    ]));
    await vaciar();
    expect(e.llamadasTranscripcion).toHaveLength(0);
  });

  it("el elector solo ve los motores disponibles que se le pasan", async () => {
    const e = crear({ disponibles: ["navegador"] });
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(e.llamadasElector[0]?.disponibles).toEqual(["navegador"]);
  });
});

describe("escucharFusionado · degradación digna (nada lanza, nada se pierde)", () => {
  it("si el transcriptor falla, la escucha sigue y el tramo siguiente llega", async () => {
    let primerasFallidas = 1;
    const e = crear({
      transcribir: async () => {
        if (primerasFallidas > 0) {
          primerasFallidas -= 1;
          throw new Error("fallo falso del motor");
        }
        return { texto: "segundo tramo", idioma: "es" };
      },
    });
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(e.finales).toEqual([]); // el primer tramo no arriva
    expect(e.escucha.activa()).toBe(true); // y la escucha no muere
    e.alimentar(trama([{ ms: 800, nivel: 0.3 }, { ms: 1000, nivel: 0 }]));
    await vaciar();
    expect(e.finales).toEqual(["segundo tramo"]);
  });

  it("detener: suelta la fuente y no reparte finales atrasados", async () => {
    let resolver!: (r: TramoTranscrito) => void;
    const registro: Array<{ tramo: Blob; motor: string; idioma: string | undefined; hotwords: string[] }> = [];
    const e = crear({
      transcribir: (tramo, motor) => {
        registro.push({ tramo, motor, idioma: undefined, hotwords: [] });
        return new Promise<TramoTranscrito>((resuelto) => {
          resolver = resuelto;
        });
      },
    });
    e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]));
    await vaciar();
    expect(registro).toHaveLength(1);
    e.escucha.detener();
    expect(e.escucha.activa()).toBe(false);
    expect(e.paradasDeFuente).toHaveLength(1); // la fuente del micrófono parada
    resolver({ texto: "tarde" }); // el motor responde DESPUÉS del detener
    await vaciar();
    expect(e.finales).toEqual([]); // nada atrasado se reparte
  });

  it("no lanza si la fuente o los bloques llegan rotos", async () => {
    const e = crear();
    expect(() => e.alimentar([new Float32Array(0)])).not.toThrow();
    expect(() => e.alimentar(trama([
      { ms: 1000, nivel: 0 },
      { ms: 800, nivel: 0.3 },
      { ms: 1000, nivel: 0 },
    ]))).not.toThrow();
    await vaciar();
    expect(e.finales).toEqual(["lo oído"]);
  });
});

describe("tramoAWav", () => {
  it("devuelve WAV PCM16 monofónico con la tasa pedida en su cabecera", async () => {
    const muestras = 1600; // 100 ms a 16 kHz
    const tramo = tramoAWav(Float32Array.from({ length: muestras }, () => 0.3));
    expect(tramo.type).toBe("audio/wav");
    expect(tramo.size).toBe(44 + muestras * 2);
    const cabecera = new DataView(await tramo.arrayBuffer());
    expect(cabecera.getUint8(0)).toBe(0x52); // "R" de RIFF
    expect(cabecera.getUint16(20, true)).toBe(1); // PCM linear
    expect(cabecera.getUint16(22, true)).toBe(1); // un canal
    expect(cabecera.getUint32(24, true)).toBe(16000); // sampleRate
    expect(cabecera.getUint16(34, true)).toBe(16); // 16 bits
  });

  it("recorta al rango −1…1 sin lanzar", () => {
    const tramo = tramoAWav(Float32Array.from([2, -2, 0.5]));
    expect(tramo.size).toBe(44 + 3 * 2);
  });
});
