import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cerradaPorOtraOla,
  decidirVuelta,
  dichoPorLaNube,
  yaSeReabrioPorRechazo,
} from "../reapertura-skill";

const README = join(process.cwd(), ".agent", "skills", "agent-reach", "README.md");

const NOTA_RECHAZADA =
  "reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»";

describe("reparación CAP1119 · la nube dijo «rechazada»", () => {
  it("no relanza igual: lee la causa, corrige el archivo declarado y pasa las puertas", () => {
    expect(dichoPorLaNube(NOTA_RECHAZADA)).toBe("rechazada");
    const decision = decidirVuelta({ nota: NOTA_RECHAZADA });
    expect(decision.accion).toBe("corregir-y-verificar");
    expect(decision.motivo).toBe("nube-rechazada");
    expect(decision.razon).toContain("tsc");
    expect(decision.razon).toContain("vitest");
  });

  it("una segunda nota de rechazo idéntica no autoriza otra reapertura", () => {
    expect(yaSeReabrioPorRechazo([NOTA_RECHAZADA], NOTA_RECHAZADA)).toBe(true);
    expect(yaSeReabrioPorRechazo([NOTA_RECHAZADA], "la nube dijo «sin_cambios»")).toBe(false);
    expect(yaSeReabrioPorRechazo([], NOTA_RECHAZADA)).toBe(false);
  });
});

describe("reparación CAP1119 · otra ola ya la cerró en progreso.json", () => {
  it("estado rechazada ⇒ no repetir, aunque la nota venga de la nube", () => {
    expect(cerradaPorOtraOla("rechazada")).toBe(true);
    const decision = decidirVuelta({ nota: NOTA_RECHAZADA, estado: "rechazada" });
    expect(decision.accion).toBe("no-repetir");
    expect(decision.motivo).toBe("cerrada-por-otra-ola");
    expect(decision.razon).toContain("progreso.json");
  });

  it("un estado en curso no cuenta como cerrado y la regla de la nube sigue mandando", () => {
    expect(cerradaPorOtraOla("en_curso")).toBe(false);
    expect(cerradaPorOtraOla(undefined)).toBe(false);
    expect(decidirVuelta({ nota: NOTA_RECHAZADA, estado: "en_curso" }).accion)
      .toBe("corregir-y-verificar");
    expect(decidirVuelta({ nota: "", estado: "integrada" }).accion).toBe("no-repetir");
  });
});

describe("README de agent-reach para el enjambre", () => {
  const guia = readFileSync(README, "utf8");

  it("existe y enseña un ejemplo de uso de solo lectura sin sesión", () => {
    expect(guia.length).toBeGreaterThan(800);
    expect(guia).toContain("agent-reach channels");
    expect(guia).toContain("agent-reach web search");
    expect(guia).toContain("agent-reach read");
    expect(guia).toContain("solo lectura");
    expect(guia).toContain("sin iniciar sesión");
    expect(guia).not.toContain("pip install agent-reach");
    expect(guia).not.toContain("npx agent-reach");
  });

  it("documenta literalmente las tres objeciones de la reparación", () => {
    expect(guia).toContain("la nube dijo «rechazada»");
    expect(guia).toContain("otra ola ya la cerró");
    expect(guia).toContain("progreso.json");
    expect(guia).toContain("no la repito");
    expect(guia).toContain("no la relanzo igual");
  });

  it("respeta las reglas del área de mando, inteligencia y diseño", () => {
    expect(guia).toContain("/api/mando/*");
    expect(guia).toContain("404");
    expect(guia).toContain("429");
    expect(guia).toContain("402");
    expect(guia).toContain("ASTRAURA_CLOUD_URL");
    expect(guia).toContain("decidirVuelta");
  });
});
