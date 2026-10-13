/**
 * Pruebas del núcleo puro tareas-bot.ts (BOT1011W): creación, reparto determinista,
 * verificación profesional (sin autoverificación) y estados. Solo funciones puras.
 */
import { describe, it, expect } from "vitest";
import {
  crearTarea, asignarPasos, iniciarVerificacion, marcarCriterio, estadoDe,
  MAX_CRITERIOS, MAX_LARGO_CRITERIO, type Resultado,
} from "../tareas-bot";
import type { Tarea } from "../tipos";

function lista<T>(r: Resultado<T>): string[] {
  expect("problemas" in r).toBe(true);
  return "problemas" in r ? r.problemas : [];
}

function buena<T>(r: Resultado<T>): T {
  if ("problemas" in r) throw new Error(r.problemas.join(" · "));
  return r.ok;
}

const BASE = { titulo: "Preparar portada", agentes: ["bot-a", "bot-b"], criterios: ["código verde", "diseño aprobado"] };

describe("crearTarea", () => {
  it("sin criterios no hay tarea", () => {
    expect(lista(crearTarea({ ...BASE, criterios: [] }, "orbe", "genesis")).join(" ")).toMatch(/criterios/i);
  });
  it("respeta el tope y el largo de criterios", () => {
    const muchos = Array.from({ length: MAX_CRITERIOS + 1 }, (_, i) => `c${i}`);
    expect(lista(crearTarea({ ...BASE, criterios: muchos }, "orbe", "genesis")).join(" ")).toMatch(/12/);
    const largo = ["x".repeat(MAX_LARGO_CRITERIO + 1)];
    expect(lista(crearTarea({ ...BASE, criterios: largo }, "orbe", "genesis")).join(" ")).toMatch(/200/);
  });
  it("verificador por defecto es persona y nace en propuesta", () => {
    const t = buena(crearTarea(BASE, "orbe", "poligenesis"));
    expect(t.verificador).toBe("persona");
    expect(t.estado).toBe("propuesta");
    expect(t.director).toBe("orbe");
    expect(t.origen).toBe("poligenesis");
  });
});

describe("asignarPasos", () => {
  const AGENTES = [
    { id: "bot-cod", capacidades: ["codigo"] },
    { id: "bot-ui", capacidades: ["diseno"] },
  ];
  it("reparte por palabras clave de forma determinista", () => {
    const t = buena(crearTarea(BASE, "orbe", "genesis"));
    const p1 = asignarPasos(t, AGENTES);
    const p2 = asignarPasos(t, [...AGENTES].reverse());
    expect(p1.find((p) => p.criterio === "código verde")?.agenteId).toBe("bot-cod");
    expect(p1.find((p) => p.criterio === "diseño aprobado")?.agenteId).toBe("bot-ui");
    expect(p2).toEqual(p1);
  });
  it("nunca asigna al director si hay más agentes, y sin agentes recae en el director", () => {
    const t = buena(crearTarea(BASE, "orbe", "genesis"));
    const conDirector = asignarPasos(t, [...AGENTES, { id: "orbe", capacidades: ["codigo"] }]);
    expect(conDirector.every((p) => p.agenteId !== "orbe")).toBe(true);
    const solo = asignarPasos(t, []);
    expect(solo.every((p) => p.agenteId === "orbe")).toBe(true);
  });
});

describe("verificación profesional", () => {
  const t: Tarea = buena(crearTarea(BASE, "orbe", "genesis"));
  const pasos = asignarPasos(t, [{ id: "bot-a", capacidades: [] }, { id: "bot-b", capacidades: [] }]);

  it("un bot no puede verificar lo que él mismo hizo, ni el director la tarea", () => {
    const v0 = iniciarVerificacion(t, pasos);
    const mismo = marcarCriterio(v0, pasos[0].criterio, { tipo: "bot", id: pasos[0].agenteId }, true);
    expect(lista(mismo).join(" ")).toMatch(/mismo/);
    const dir = marcarCriterio(v0, pasos[0].criterio, { tipo: "bot", id: "orbe" }, true, "rev");
    expect(lista(dir).join(" ")).toMatch(/director/);
  });
  it("una persona puede verificar cualquier criterio", () => {
    const v = buena(marcarCriterio(iniciarVerificacion(t, pasos), pasos[0].criterio, { tipo: "persona", id: "alex" }, true, "ok"));
    expect(v.marcas[pasos[0].criterio].ok).toBe(true);
  });
  it("las pruebas pueden verificar", () => {
    const v = buena(marcarCriterio(iniciarVerificacion(t, pasos), pasos[0].criterio, { tipo: "pruebas", id: "vitest" }, true));
    expect(v.marcas[pasos[0].criterio].por.tipo).toBe("pruebas");
  });
});

describe("estadoDe", () => {
  const t: Tarea = buena(crearTarea(BASE, "orbe", "genesis"));
  const pasos = asignarPasos(t, [{ id: "bot-a", capacidades: [] }]);
  const persona = { tipo: "persona", id: "alex" } as const;

  it("sin pasos sigue propuesta; con pasos, en-curso", () => {
    expect(estadoDe(t, iniciarVerificacion(t, []))).toBe("propuesta");
    expect(estadoDe(t, iniciarVerificacion(t, pasos))).toBe("en-curso");
  });
  it("con una marca, verificando; una marca falsa impide hecha", () => {
    let v = iniciarVerificacion(t, pasos);
    v = buena(marcarCriterio(v, t.criterios[0], persona, true));
    expect(estadoDe(t, v)).toBe("verificando");
    v = buena(marcarCriterio(v, t.criterios[1], persona, false));
    expect(estadoDe(t, v)).toBe("verificando");
  });
  it("hecha solo con TODOS los criterios en ok", () => {
    let v = iniciarVerificacion(t, pasos);
    for (const c of t.criterios) v = buena(marcarCriterio(v, c, { tipo: "pruebas", id: "vitest" }, true));
    expect(estadoDe(t, v)).toBe("hecha");
  });
});
