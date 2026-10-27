import { describe, it, expect } from "vitest";
import {
  SILENCIO_MS,
  TRAMO_MAX_MS,
  crearSegmentadorEnergia,
  energiaRms,
  escucharFusionado,
  umbralVoz,
  wavDesdePcm,
  type OpcionesEscuchaFusionada,
  type TramoAudio,
} from "../escucha-fusionada";
import type { OpcionesEleccionOido, ResultadoOido } from "../motores-oido";

/** Bloque de audio constante: su RMS es el valor absoluto. */
function bloque(valor: number, n = 160): Float32Array {
  return new Float32Array(n).fill(valor);
}

/** Audio falso: silencio de calibración, voz y silencio de cierre. */
async function* audioFalso(vozMs = 500): AsyncIterable<Float32Array> {
  for (let i = 0; i < 10; i++) yield bloque(0.0001);
  for (let i = 0; i < vozMs / 10; i++) yield bloque(0.2);
  for (let i = 0; i < 80; i++) yield bloque(0.0001);
}

/** Dos frases separadas por silencio: dos tramos, dos elecciones de motor. */
async function* audioDosTramos(): AsyncIterable<Float32Array> {
  for (let i = 0; i < 10; i++) yield bloque(0.0001);
  for (let i = 0; i < 50; i++) yield bloque(0.2);
  for (let i = 0; i < 80; i++) yield bloque(0.0001);
  for (let i = 0; i < 50; i++) yield bloque(0.2);
  for (let i = 0; i < 80; i++) yield bloque(0.0001);
}

describe("energía y umbral", () => {
  it("energiaRms mide el valor eficaz y tolera bloques vacíos", () => {
    expect(energiaRms(bloque(0.5))).toBeCloseTo(0.5);
    expect(energiaRms(new Float32Array(0))).toBe(0);
  });

  it("umbralVoz vive por encima del suelo de ruido", () => {
    expect(umbralVoz(0.004)).toBeCloseTo(0.0156);
    expect(umbralVoz(0.5)).toBe(0.08 * 2.4);
  });
});

describe("crearSegmentadorEnergia", () => {
  it("expone los mismos límites que oss-stt: 800 ms y 30 s", () => {
    expect(SILENCIO_MS).toBe(800);
    expect(TRAMO_MAX_MS).toBe(30000);
  });

  it("ignora el silencio y cierra un tramo tras el silencio pactado", () => {
    const s = crearSegmentadorEnergia({
      sampleRate: 16000, silencioMs: 100, vozMinMs: 50, prerollMs: 30, bloquesCalibracion: 2,
    });
    for (let i = 0; i < 2; i++) expect(s.anadir(bloque(0.0001))).toEqual([]);
    const tramos: TramoAudio[] = [];
    for (let i = 0; i < 10; i++) tramos.push(...s.anadir(bloque(0.2)));
    for (let i = 0; i < 10; i++) tramos.push(...s.anadir(bloque(0.0001)));
    expect(tramos).toHaveLength(1);
    expect(tramos[0].motivo).toBe("silencio");
    expect(tramos[0].duracionMs).toBeGreaterThan(100);
    expect(s.estaHablando()).toBe(false);
  });

  it("descarta un tramo demasiado corto y respeta el máximo", () => {
    const corto = crearSegmentadorEnergia({
      sampleRate: 16000, silencioMs: 100, vozMinMs: 50, prerollMs: 20, bloquesCalibracion: 2,
    });
    for (let i = 0; i < 2; i++) corto.anadir(bloque(0.0001));
    corto.anadir(bloque(0.2));
    expect(corto.cerrar()).toBeNull();

    const largo = crearSegmentadorEnergia({
      sampleRate: 16000, tramoMaxMs: 100, vozMinMs: 50, prerollMs: 0, bloquesCalibracion: 2,
    });
    for (let i = 0; i < 2; i++) largo.anadir(bloque(0.0001));
    let tramo: TramoAudio | null = null;
    for (let i = 0; i < 20 && !tramo; i++) tramo = largo.anadir(bloque(0.2))[0] ?? null;
    expect(tramo?.motivo).toBe("maximo");
    expect(tramo?.duracionMs).toBe(100);
  });
});

describe("escucharFusionado", () => {
  it("el elector de la fase final decide el motor de cada tramo", async () => {
    const elecciones: OpcionesEleccionOido[] = [];
    const pedidos: { motor: string; idioma: string; hotwords: string[] }[] = [];
    const finales: { texto: string; motor: string; idioma: string }[] = [];
    const parciales: string[] = [];
    let reloj = 0;
    const opciones: OpcionesEscuchaFusionada = {
      obtenerAudio: () => audioFalso(),
      elegir: (o): ResultadoOido => { elecciones.push(o); return { motor: "parakeet-v3", motivo: "prueba" }; },
      transcribir: (tramo, motor, idioma, hotwords) => {
        pedidos.push({ motor, idioma, hotwords });
        expect(tramo.duracionMs).toBeGreaterThan(500);
        return { ok: true, texto: " hola astraura ", idioma: "es", ms: 12 };
      },
      alParcial: (texto) => parciales.push(texto),
      alFinal: (texto, info) => finales.push({ texto, motor: info.motor, idioma: info.idioma }),
      idiomaPista: "es-MX",
      hotwords: ["Astraura", "StarSeed"],
      ahora: () => (reloj += 50),
    };
    await escucharFusionado(opciones);
    expect(elecciones).toHaveLength(1);
    expect(elecciones[0].fase).toBe("final");
    expect(elecciones[0].idioma).toBe("es");
    expect(pedidos[0]).toEqual({ motor: "parakeet-v3", idioma: "es", hotwords: ["Astraura", "StarSeed"] });
    expect(finales).toEqual([{ texto: "hola astraura", motor: "parakeet-v3", idioma: "es" }]);
    expect(parciales.length).toBeGreaterThan(0);
  });

  it("un transcriptor roto no tumba la escucha ni inventa texto", async () => {
    const finales: string[] = [];
    await escucharFusionado({
      obtenerAudio: () => audioFalso(),
      elegir: () => ({ motor: "phonon-2", motivo: "prueba" }),
      transcribir: () => { throw new Error("sin red"); },
      alFinal: (texto) => finales.push(texto),
    });
    expect(finales).toEqual([]);
  });

  it("el suelo del navegador no intenta transcribir por su cuenta", async () => {
    let pedidos = 0;
    await escucharFusionado({
      obtenerAudio: () => audioFalso(),
      elegir: () => ({ motor: "navegador", motivo: "suelo" }),
      transcribir: () => { pedidos += 1; return "no debería"; },
      alFinal: () => { /* nada */ },
    });
    expect(pedidos).toBe(0);
  });
});

describe("wavDesdePcm", () => {
  it("genera un WAV PCM16 mono con cabecera válida", async () => {
    const blob = wavDesdePcm(new Float32Array([0, 1, -1]), 16000);
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(bytes.length).toBe(44 + 6);
  });
});
