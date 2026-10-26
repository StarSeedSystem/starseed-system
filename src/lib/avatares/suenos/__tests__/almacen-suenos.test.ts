// @vitest-environment jsdom
/** Almacén de los sueños · Ola 1025U · U4. Acotado por escenario, saneado al leer y sin lanzar nunca. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  CLAVE_USO_SUENOS, claveSuenos, guardarSuenos, guardarUso, leerSuenos, leerUso, olvidarSuenos,
} from "../almacen-suenos";
import { TOPES_SUENO, nuevoSueno, planSueno, registrarInicio, type Sueno } from "../sueno";

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const luna = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1" } });

function sueno(i: number, estado: Sueno["estado"] = "completo"): Sueno {
  const r = planSueno([luna], `tema ${i}`);
  if (!r.ok) throw new Error(r.motivo);
  return {
    ...nuevoSueno(r.plan, "esc-1", "manual", T0 + i * 1000, new Set()),
    id: `s${i}`,
    estado,
    turnos: [{ autorId: luna.id, autorNombre: "Luna", texto: `Turno ${i}`, at: T0 + i }],
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("sueños por escenario", () => {
  it("sin nada guardado: ningún sueño y los automáticos APAGADOS", () => {
    expect(leerSuenos("esc-1")).toEqual({ automaticos: false, suenos: [] });
  });

  it("guarda y lee; cada escenario aparte", () => {
    expect(guardarSuenos("esc-1", { automaticos: true, suenos: [sueno(1), sueno(2)] })).toBe(true);
    const d = leerSuenos("esc-1");
    expect(d.automaticos).toBe(true);
    expect(d.suenos.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(leerSuenos("esc-2")).toEqual({ automaticos: false, suenos: [] });
    expect(window.localStorage.getItem(claveSuenos("esc-1"))).not.toBeNull();
  });

  it("solo se guardan los últimos N", () => {
    guardarSuenos("esc-1", { automaticos: false, suenos: Array.from({ length: 30 }, (_, i) => sueno(i)) });
    const d = leerSuenos("esc-1");
    expect(d.suenos).toHaveLength(TOPES_SUENO.guardadosPorEscenario);
    expect(d.suenos[d.suenos.length - 1].id).toBe("s29");
  });

  it("el sueño que corre se guarda «en curso» y al volver a abrir aparece «interrumpido»", () => {
    guardarSuenos("esc-1", { automaticos: false, suenos: [sueno(1), sueno(2, "en-curso")] });
    const guardado = JSON.parse(window.localStorage.getItem(claveSuenos("esc-1"))!);
    expect(guardado.suenos.find((s: Sueno) => s.id === "s2").estado).toBe("en-curso");
    const leido = leerSuenos("esc-1").suenos.find((s) => s.id === "s2")!;
    expect(leido.estado).toBe("interrumpido");
    expect(leido.motivo).toMatch(/se cortó/i);
  });

  it("un JSON roto o con basura no lanza", () => {
    window.localStorage.setItem(claveSuenos("esc-1"), "{no es json");
    expect(leerSuenos("esc-1")).toEqual({ automaticos: false, suenos: [] });
    window.localStorage.setItem(claveSuenos("esc-1"), JSON.stringify({ automaticos: "sí", suenos: [1, null, { id: "x" }] }));
    expect(leerSuenos("esc-1")).toEqual({ automaticos: false, suenos: [] });
  });

  it("olvidar borra los sueños del escenario", () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [sueno(1)] });
    olvidarSuenos("esc-1");
    expect(leerSuenos("esc-1")).toEqual({ automaticos: false, suenos: [] });
  });
});

describe("uso por hora", () => {
  it("se guarda y se lee; lo que pasó de la hora no vuelve", () => {
    guardarUso(registrarInicio(leerUso(T0), [luna], false, T0), T0);
    expect(leerUso(T0 + 1000).inicios).toEqual([T0]);
    expect(leerUso(T0 + 2 * 3_600_000).inicios).toEqual([]);
  });

  it("un uso roto da el vacío", () => {
    window.localStorage.setItem(CLAVE_USO_SUENOS, "[[[");
    expect(leerUso(T0)).toEqual({ inicios: [], automaticos: [], participaciones: {}, llamadas: {} });
  });
});
