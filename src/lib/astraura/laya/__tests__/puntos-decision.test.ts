// Pruebas del catálogo de puntos de decisión de Laya (LYS1018A). Sin red y sin modelo: las respuestas
// de Laya son de ejemplo, con la forma real de system_one (choice/probabilities/answer_confidence, score, noul).
import { describe, expect, it } from "vitest";
import { construirPeticion } from "@/lib/jev/decisiones";
import { UMBRAL_LAYA_EJECUTAR } from "@/lib/astraura/decision-hibrida";
import { MEDIOS_LAYA, PUNTOS_DECISION, UMBRAL_POR_DEFECTO, conOpciones, puntoDecision, queHacer, validarPuntos,
  type PuntoDecision } from "../puntos-decision";

const IDS_TABLA_4 = ["reflejo.herramienta", "plan.dificultad", "respuesta.basta", "basico.consenso", "habilidad.elegir",
  "publicar.moderar", "privacidad.subir", "voz.tono", "video.intencion", "enjambre.medio"];
const RESPUESTA_LAYA = {
  herramienta: { choice: "chat", probabilities: { chat: 0.71, voz: 0.05, tarea: 0.24 }, confidence: 0.68, answer_confidence: 0.83 },
  dificultad: { score: 1.5, probabilities: [0.4, 0.45, 0.15], confidence: 0.52, answer_confidence: 0.7 },
  basta: { noul: 0.42, confidence: 0.9, answer_confidence: 0.44 },
};
const p = (id: string): PuntoDecision => puntoDecision(id) ?? (() => { throw new Error(`falta ${id}`); })();
const roto = (id: string, cambios: Record<string, unknown>): PuntoDecision => ({ ...p(id), ...cambios }) as unknown as PuntoDecision;
const fallosDe = (punto: PuntoDecision) => validarPuntos([punto]).join(" | ");

describe("catálogo de puntos de decisión", () => {
  it("es válido y trae exactamente los diez puntos de la tabla §4, sin repetir", () => {
    expect(validarPuntos()).toEqual([]);
    expect(PUNTOS_DECISION.map((x) => x.id).sort()).toEqual([...IDS_TABLA_4].sort());
    expect(Object.isFrozen(PUNTOS_DECISION) && Object.isFrozen(PUNTOS_DECISION[0])).toBe(true);
  });

  it("cada punto se pregunta con la forma nativa de Laya/Jev en español", () => {
    for (const x of PUNTOS_DECISION) {
      expect(() => construirPeticion("estado", { ...x.preguntas })).not.toThrow();
      for (const q of Object.values(x.preguntas)) expect(q.instructions).toMatch(/[a-záéíóúñ]{3}/);
    }
    expect(p("plan.dificultad").preguntas.dificultad.type).toBe("score");
    expect(p("respuesta.basta").preguntas.basta.type).toBe("noul");
  });

  it("casa con lo que ya existe y con lo medido en el A1", () => {
    expect(p("reflejo.herramienta").umbral).toBe(UMBRAL_LAYA_EJECUTAR);
    expect(UMBRAL_POR_DEFECTO).toBe(0.6);
    // §8: una petición de 3 preguntas tarda 3,1–3,2 s en el A1; ningún tope del A1 puede cortarla.
    for (const x of PUNTOS_DECISION) {
      expect(x.plazoMsPorMedio.a1).toBeGreaterThanOrEqual(3200);
      for (const m of MEDIOS_LAYA) expect(x.plazoMsPorMedio[m]).toBeGreaterThan(0);
    }
  });

  it("respeta la privacidad: lo personal solo en las propias y la privacidad nunca sale", () => {
    const salen = PUNTOS_DECISION.filter((x) => x.privacidad === "puede-salir").map((x) => x.id).sort();
    expect(salen).toEqual(["enjambre.medio", "publicar.moderar"]);
    expect(p("privacidad.subir")).toMatchObject({ privacidad: "solo-propias", siDuda: "regla" });
    expect(p("publicar.moderar").siDuda).toBe("revisar");
  });
});

describe("validarPuntos detecta catálogos mal formados", () => {
  it("ids repetidos o con forma rara, capas desconocidas y umbrales fuera de rango", () => {
    expect(validarPuntos([p("voz.tono"), p("voz.tono")]).join()).toMatch(/id repetido/);
    expect(fallosDe(roto("voz.tono", { id: "VozTono" }))).toMatch(/zona\.qué/);
    expect(fallosDe(roto("voz.tono", { capa: "telepatia" }))).toMatch(/capa desconocida «telepatia»/);
    for (const umbral of [1.5, -0.1, Number.NaN, "0.6"]) expect(fallosDe(roto("voz.tono", { umbral }))).toMatch(/umbral/);
    expect(validarPuntos([roto("voz.tono", { umbral: 0 }), roto("respuesta.basta", { umbral: 1 })])).toEqual([]);
  });

  it("plazos ausentes, a cero, con decimales o en segundos por error", () => {
    const base = p("voz.tono").plazoMsPorMedio;
    expect(fallosDe(roto("voz.tono", { plazoMsPorMedio: { a1: 3500, mac: 3000, navegador: 4000 } }))).toMatch(/plazo de malla/);
    expect(fallosDe(roto("voz.tono", { plazoMsPorMedio: { ...base, mac: 0, navegador: 2.5 } }))).toMatch(/mac, navegador/);
    expect(fallosDe(roto("voz.tono", { plazoMsPorMedio: { ...base, a1: 60_000 } }))).toMatch(/fuera de 1–30000 ms/);
  });

  it("choice y score bien formados con la forma nativa", () => {
    const una = { tono: { type: "choice", instructions: "¿Tono?", criteria: { neutro: "Neutro" } } };
    expect(fallosDe(roto("voz.tono", { preguntas: una }))).toMatch(/choice «tono» necesita 2 opciones/);
    const sinCriterios = { tono: { type: "choice", instructions: "¿Tono?" } };
    expect(fallosDe(roto("voz.tono", { preguntas: sinCriterios }))).toMatch(/choice exige criteria/);
    const repetido = { dificultad: { type: "score", instructions: "¿Dificultad?", criteria: ["baja", "baja"] } };
    expect(fallosDe(roto("plan.dificultad", { preguntas: repetido }))).toMatch(/score «dificultad» necesita 2 niveles distintos/);
    const desconocido = { x: { type: "probabilidad", instructions: "¿X?" } };
    expect(fallosDe(roto("voz.tono", { preguntas: desconocido }))).toMatch(/type desconocido/);
    expect(fallosDe(roto("voz.tono", { preguntas: { x: { type: "noul", instructions: "  " } } }))).toMatch(/texto no vacío/);
    expect(fallosDe(roto("voz.tono", { preguntas: {} }))).toMatch(/al menos una pregunta/);
  });

  it("preguntas abiertas: choice con «ninguna» y que existan", () => {
    const sinNinguna = { herramienta: { type: "choice", instructions: "¿Cuál?", criteria: { buscar: "Buscar" } } };
    expect(fallosDe(roto("reflejo.herramienta", { preguntas: sinNinguna }))).toMatch(/abierta «herramienta» debe ser choice con «ninguna»/);
    expect(fallosDe(roto("respuesta.basta", { abiertas: ["otra"] }))).toMatch(/abierta «otra» no está/);
  });

  it("qué hacer si duda: valores conocidos, respaldo escrito e invariantes del contrato", () => {
    expect(fallosDe(roto("voz.tono", { siDuda: "adivinar" }))).toMatch(/siDuda desconocido/);
    expect(fallosDe(roto("voz.tono", { privacidad: "publica" }))).toMatch(/privacidad desconocida/);
    expect(fallosDe(roto("voz.tono", { respaldo: " " }))).toMatch(/falta el respaldo/);
    expect(fallosDe(roto("publicar.moderar", { siDuda: "regla" }))).toMatch(/siDuda debe ser «revisar»/);
    expect(fallosDe(roto("privacidad.subir", { privacidad: "puede-salir" }))).toMatch(/privacidad debe ser «solo-propias»/);
  });
});

describe("queHacer y conOpciones", () => {
  it("decide con answer_confidence (calibrada) y nunca con confidence", () => {
    expect(queHacer(p("reflejo.herramienta"), RESPUESTA_LAYA.herramienta)).toEqual({ accion: "decidir", confianza: 0.83 });
    expect(queHacer(p("plan.dificultad"), RESPUESTA_LAYA.dificultad)).toEqual({ accion: "decidir", confianza: 0.7 });
    expect(queHacer(p("respuesta.basta"), RESPUESTA_LAYA.basta)).toMatchObject({ accion: "escalar", motivo: expect.stringMatching(/0\.44 < 0\.6/) });
    expect(queHacer(p("respuesta.basta"), { confidence: 0.99 } as { answer_confidence?: unknown })).toMatchObject({ accion: "escalar" });
    expect(queHacer(p("publicar.moderar"), null)).toMatchObject({ accion: "revisar", motivo: expect.stringMatching(/no llegó a tiempo/) });
    expect(queHacer(p("privacidad.subir"), { answer_confidence: 0.55 })).toEqual({ accion: "decidir", confianza: 0.55 });
  });

  it("conOpciones añade las opciones de la llamada, conserva «ninguna» y no toca el catálogo", () => {
    const punto = p("habilidad.elegir");
    const preguntas = conOpciones(punto, "habilidad", { tdd: "Desarrollo guiado por pruebas", diagnostico: "Diagnosticar un error" });
    const h = preguntas.habilidad;
    expect(h.type === "choice" && Object.keys(h.criteria).sort()).toEqual(["diagnostico", "ninguna", "tdd"]);
    expect(() => construirPeticion("estado", preguntas)).not.toThrow();
    const original = punto.preguntas.habilidad;
    expect(original.type === "choice" && Object.keys(original.criteria)).toEqual(["ninguna"]);
    expect(() => conOpciones(p("voz.tono"), "tono", { susurro: "Susurro" })).toThrow(/no tiene la pregunta abierta/);
  });
});
