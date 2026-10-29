// DGM1018H · Pruebas puras del átomo «Diagrama» sin red, sin disco salvo su propio fuente, sin `any`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DIAGRAMA, FAMILIAS_DIAGRAMA, TEMAS_DIAGRAMA, planDiagrama, resolverTipo, sandboxDe } from "../atomos/diagrama";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { TIPOS_DIAGRAMA } from "@/lib/diagramas/herramienta-diagrama";
import type { ValorParametro } from "../../tipos";

const valores = (x: Record<string, string | number | boolean>): Record<string, ValorParametro | undefined> => x;

describe("átomo diagrama · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de Diagram Design, se registra y está en el índice", () => {
    expect(DIAGRAMA).toMatchObject({
      herramientaId: "diagram-design",
      categoria: "arquitectura",
      integracion: "iframe-aislado",
      control: "total",
      ficha: { licencia: "MIT", repo: "cathrynlavery/diagram-design" },
    });
    expect(DIAGRAMA.parametros.map((p) => p.id)).toEqual(["familia", "variante", "tema", "animado", "ancho", "perfil"]);
    expect(DIAGRAMA.entradas).toEqual(expect.arrayContaining(["texto", "datos", "draw.io", "mermaid", "excalidraw"]));
    expect(DIAGRAMA.salidas).toEqual(["html", "svg", "png"]);
    expect(registrarAtomo(DIAGRAMA)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(DIAGRAMA);
  });

  it("las familias cubren los 45 tipos exactamente una vez", () => {
    const tipos = Object.values(FAMILIAS_DIAGRAMA).flat() as string[];
    expect(tipos).toHaveLength(TIPOS_DIAGRAMA.length);
    expect(new Set(tipos).size).toBe(45);
    expect([...tipos].sort()).toEqual([...TIPOS_DIAGRAMA].sort());
  });

  it("el módulo es puro, sin claves ni IPs, y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "diagrama.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});

describe("resolverTipo del átomo diagrama", () => {
  it("por defecto elige flujo → flowchart", () => {
    expect(resolverTipo()).toEqual({ familia: "flujo", tipo: "flowchart", variante: 1 });
  });

  it("elige el tipo por familia y variante, acotado al tamaño de la familia", () => {
    expect(resolverTipo(valores({ familia: "esquematico", variante: 10 }))).toEqual({ familia: "esquematico", tipo: "axonometric-plan", variante: 10 });
    expect(resolverTipo(valores({ familia: "tiempo", variante: 99 })).tipo).toBe("gantt");
    expect(resolverTipo(valores({ familia: "comparativa", variante: 2 })).tipo).toBe("venn");
    expect(resolverTipo(valores({ familia: "datos", variante: 3 })).tipo).toBe("uml-class");
  });

  it("una familia desconocida vuelve a flujo, y una variante rara no explota", () => {
    expect(resolverTipo(valores({ familia: "no-existe" }))).toEqual({ familia: "flujo", tipo: "flowchart", variante: 1 });
    expect(resolverTipo(valores({ familia: "grafica", variante: 0 })).tipo).toBe("bar");
    expect(resolverTipo(valores({ familia: "grafica", variante: -5 })).tipo).toBe("bar");
  });

  it("es puro: misma entrada, mismo tipo, y la entrada no cambia", () => {
    const entrada = valores({ familia: "jerarquia", variante: 4, tema: "oscuro" });
    const copia = structuredClone(entrada);
    expect(resolverTipo(entrada)).toEqual(resolverTipo(entrada));
    expect(entrada).toEqual(copia);
  });
});

describe("planDiagrama del átomo diagrama", () => {
  it("por defecto: flowchart, tema claro, doc-inline y sin scripts", () => {
    const plan = planDiagrama();
    expect(plan.tipo).toBe("flowchart");
    expect(plan.tema).toBe("claro");
    expect(plan.tokens).toEqual(TEMAS_DIAGRAMA.claro);
    expect(plan.sandbox).toBe("");
    expect(plan.viewBox).toBe("0 0 960 600");
    expect(plan.rampa).toBe("estandar");
    expect(plan.perfil).toBe("contexto");
    expect(plan.formato).toBe("html");
  });

  it("tema oscuro, ancho y perfil se resuelven con el árbitro; valores malos vuelven al defecto", () => {
    const oscuro = planDiagrama(valores({ tema: "oscuro", ancho: "slide-16x9", animado: true, perfil: "astraura" }));
    expect(oscuro.tokens).toEqual(TEMAS_DIAGRAMA.oscuro);
    expect(oscuro.sandbox).toBe("allow-scripts");
    expect(oscuro.viewBox).toBe("0 0 1280 720");
    expect(oscuro.rampa).toBe("presentacion");
    expect(oscuro.minAncho).toBe(1280);
    expect(oscuro.perfil).toBe("astraura");
    expect(planDiagrama(valores({ ancho: "social-og" })).minAncho).toBe(1200);
    expect(planDiagrama(valores({ ancho: "print-a4" })).rampa).toBe("impresion");
    expect(planDiagrama(valores({ ancho: "no-existe" })).ancho).toBe("doc-inline");
    expect(planDiagrama(valores({ tema: "no-existe" })).tema).toBe("claro");
    expect(planDiagrama(valores({ perfil: "no-existe" })).perfil).toBe("contexto");
  });

  it("el sandbox jamás permite same-origin, con animado o sin él", () => {
    expect(sandboxDe(false)).not.toContain("allow-same-origin");
    expect(sandboxDe(true)).toBe("allow-scripts");
    expect(planDiagrama(valores({ animado: true })).sandbox).not.toContain("allow-same-origin");
  });

  it("es puro: mismos valores, mismo plan, y la entrada no cambia", () => {
    const entrada = valores({ familia: "grafica", variante: 4, tema: "oscuro", animado: true, ancho: "social-square", perfil: "cafe" });
    const copia = structuredClone(entrada);
    expect(planDiagrama(entrada)).toEqual(planDiagrama(entrada));
    expect(entrada).toEqual(copia);
  });
});
