// Pruebas del aprendizaje de Laya (LYS1018M). Sin red y sin modelos: los estados y las
// respuestas son de ejemplo, con la forma real de System One (`answer_confidence` calibrada).
import { describe, expect, it } from "vitest";
import { MIN_CASOS_RECALIBRADO, anotar, exportarJSONL, huellaEstado, umbralDelCatalogo, umbralRecalibrado,
  type CasoLaya, type EntradaCaso, type ResultadoLaya } from "../aprendizaje-laya";
import { UMBRAL_POR_DEFECTO, puntoDecision } from "../puntos-decision";

const PUNTO = "reflejo.herramienta";
const AMBITO = "perfil:ana";

const entrada = (cambios: Partial<EntradaCaso> = {}): EntradaCaso => ({
  punto: PUNTO, ambito: AMBITO, p: 0.8, donde: "local", ms: 1800,
  resultado: "aceptada", privado: false, estado: "busca el horario del tren", ...cambios,
});

/** Registro de `n` casos iguales, anotados uno a uno como en producción. */
const lote = (resultado: ResultadoLaya, p: number, n: number, ambito = AMBITO): CasoLaya[] => {
  let registro: CasoLaya[] = [];
  for (let i = 0; i < n; i++) registro = anotar(registro, entrada({ resultado, p, ambito }));
  return registro;
};

describe("anotar · registro de cada decisión", () => {
  it("añade al final sin mutar la lista y conserva punto, ámbito, p, medio, ms y resultado", () => {
    const previo = lote("aceptada", 0.9, 1);
    const despues = anotar(previo, entrada({ donde: "malla", ms: 3200, p: 0.71, resultado: "escalada" }));
    expect(previo).toHaveLength(1);
    expect(despues).toHaveLength(2);
    expect(despues[0]).toEqual(previo[0]);
    expect(despues[1]).toMatchObject({
      punto: PUNTO, ambito: AMBITO, p: 0.71, donde: "malla", ms: 3200,
      resultado: "escalada", privado: false, estado: "busca el horario del tren",
    });
    expect(despues[1].huella).toBeUndefined();
  });

  it("lo privado no guarda el texto: solo una huella estable, distinta para estados distintos", () => {
    const secreto = "mi teléfono es 555 123 456 y vivo en Casa Azul";
    const [caso] = anotar([], entrada({ privado: true, estado: secreto }));
    expect(caso.privado).toBe(true);
    expect(caso.estado).toBeUndefined();
    expect(caso.huella).toBe(huellaEstado(secreto));
    expect(caso.huella).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify([caso])).not.toContain("555");
    expect(huellaEstado(secreto)).toBe(huellaEstado(secreto));
    expect(huellaEstado(secreto)).not.toBe(huellaEstado("otro estado"));
    expect(huellaEstado({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("umbralRecalibrado · por punto y ámbito", () => {
  it("con menos de 30 casos manda el umbral del catálogo", () => {
    const corto = lote("corregida", 0.2, MIN_CASOS_RECALIBRADO - 1);
    expect(umbralRecalibrado(corto, PUNTO, AMBITO)).toBe(umbralDelCatalogo(PUNTO));
    expect(umbralDelCatalogo("voz.tono")).toBe(puntoDecision("voz.tono")?.umbral);
    expect(umbralDelCatalogo("punto.inexistente")).toBe(UMBRAL_POR_DEFECTO);
  });

  it("separa por punto y ámbito: los casos de otro ámbito no cuentan", () => {
    const ajenos = lote("corregida", 0.2, 20, "grupo:otro");
    const propios = lote("aceptada", 0.9, MIN_CASOS_RECALIBRADO - 1);
    expect(umbralRecalibrado([...ajenos, ...propios], PUNTO, AMBITO)).toBe(umbralDelCatalogo(PUNTO));
  });

  it("con ≥ 30 casos sube justo por encima de las correcciones que el catálogo dejaba pasar", () => {
    const catalogo = umbralDelCatalogo(PUNTO);
    const bajas = [...lote("corregida", 0.55, 5), ...lote("aceptada", 0.8, 25)];
    expect(umbralRecalibrado(bajas, PUNTO, AMBITO)).toBe(catalogo);
    const altas = [...lote("corregida", 0.75, 5), ...lote("aceptada", 0.8, 25)];
    const umbral = umbralRecalibrado(altas, PUNTO, AMBITO);
    expect(umbral).toBeGreaterThan(0.75);
    expect(umbral).toBeLessThanOrEqual(0.76);
    // Aplicado, ya no acepta ningún caso que se corrigió: las 5 correcciones quedan fuera.
    const aceptados = altas.filter((c) => c.p >= umbral);
    expect(aceptados.every((c) => c.resultado !== "corregida")).toBe(true);
    expect(aceptados).toHaveLength(25);
  });

  it("sin correcciones se queda en el umbral del catálogo: no baja la guardia sin pruebas", () => {
    const catalogo = umbralDelCatalogo(PUNTO);
    expect(umbralRecalibrado(lote("aceptada", 0.7, MIN_CASOS_RECALIBRADO), PUNTO, AMBITO)).toBe(catalogo);
  });

  it("usa la answer_confidence calibrada de System One, nunca la confidence del modelo", () => {
    const respuesta = {
      herramienta: { choice: "chat", probabilities: { chat: 0.71, voz: 0.05, tarea: 0.24 }, confidence: 0.68, answer_confidence: 0.83 },
      dificultad: { score: 1.5, probabilities: [0.4, 0.45, 0.15], confidence: 0.52, answer_confidence: 0.7 },
      basta: { noul: 0.42, confidence: 0.9, answer_confidence: 0.44 },
    };
    const [caso] = anotar([], entrada({ p: respuesta.herramienta.answer_confidence, estado: respuesta }));
    expect(caso.p).toBe(0.83);
    expect(caso.p).not.toBe(respuesta.herramienta.confidence);
  });
});

describe("exportarJSONL · cuaderno de afinado de Laya", () => {
  it("saca solo los casos no privados, uno por línea y con state/questions/expected", () => {
    const preguntas = { herramienta: { type: "noul" as const, instructions: "¿Hay que usar una herramienta?" } };
    const publico = anotar([], entrada({ estado: "pide la hora", preguntas, esperado: { herramienta: true } }));
    const privado = anotar([], entrada({ privado: true, estado: "mi teléfono es 555 123 456" }));
    const jsonl = exportarJSONL([...privado, ...publico]);
    expect(jsonl.endsWith("\n")).toBe(true);
    expect(jsonl).not.toContain("555");
    const lineas = jsonl.trimEnd().split("\n");
    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0])).toEqual({
      state: "pide la hora", questions: preguntas, expected: { herramienta: true },
    });
    expect(exportarJSONL([...privado])).toBe("");
  });

  it("si faltan preguntas usa las del catálogo y, si el estado ya es una fila, la respeta", () => {
    const sinPreguntas = JSON.parse(exportarJSONL(anotar([], entrada())).trim());
    expect(sinPreguntas.questions).toEqual(puntoDecision(PUNTO)?.preguntas);
    expect(sinPreguntas.expected).toEqual({});
    const fila = { state: "estado crudo", questions: {}, expected: { x: "sí" } };
    const yaFormateado = anotar([], entrada({ estado: fila }));
    expect(JSON.parse(exportarJSONL(yaFormateado).trim())).toEqual(fila);
  });
});
