import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ATOMOS_PROPIOS } from "../atomos";
import { DIAGRAMA, TIPOS_PANEL, planDiagrama } from "../atomos/diagrama";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { TIPOS_DIAGRAMA } from "@/lib/diagramas/herramienta-diagrama";

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
    expect(DIAGRAMA.parametros.map((p) => p.id)).toEqual(["tipo", "tema", "animado", "ancho", "marca"]);
    expect(DIAGRAMA.entradas).toEqual(expect.arrayContaining(["texto", "datos", "draw.io", "mermaid", "excalidraw"]));
    expect(DIAGRAMA.salidas).toEqual(expect.arrayContaining(["html", "svg", "png"]));
    expect(registrarAtomo(DIAGRAMA)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(DIAGRAMA);
  });

  it("el panel cabe en el tope de 32 opciones y cada opción es un tipo real de la skill", () => {
    expect(TIPOS_PANEL.length).toBeLessThanOrEqual(32);
    expect(new Set(TIPOS_PANEL).size).toBe(TIPOS_PANEL.length);
    expect(DIAGRAMA.parametros.find((p) => p.id === "tipo")?.opciones).toEqual([...TIPOS_PANEL]);
    for (const tipo of TIPOS_PANEL) {
      expect((TIPOS_DIAGRAMA as readonly string[]).toContain(tipo)).toBe(true);
    }
  });

  it("el módulo es puro y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "diagrama.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
  });
});

describe("planDiagrama · plan puro del átomo", () => {
  it("por defecto: flowchart completo, estático, claro, 720 px y marca starseed", () => {
    const plan = planDiagrama();
    expect(plan).toMatchObject({
      tipo: "flowchart", tamano: "completa", tema: "claro", animado: false, ancho: 720, marca: "starseed",
    });
    const pasos = plan.pasos.join(" ");
    expect(pasos).toContain("iframe sandbox sin allow-same-origin");
    expect(pasos).toContain("nunca Google Fonts");
    expect(plan.avisos).toEqual([]);
    expect(plan.instruccion).toContain("Tipo: completa (editorial completa");
  });

  it("es puro: misma entrada, mismo plan, y la entrada no cambia", () => {
    const valores = { tipo: "gantt", tema: "oscuro", animado: true, ancho: 900, marca: "neutro" };
    const copia = structuredClone(valores);
    expect(planDiagrama(valores)).toEqual(planDiagrama(valores));
    expect(valores).toEqual(copia);
  });

  it("resuelve los 45 tipos de la skill y también los alias en español", () => {
    for (const tipo of TIPOS_DIAGRAMA) {
      expect(planDiagrama({ tipo }).tipo).toBe(tipo);
    }
    expect(planDiagrama({ tipo: "organigrama" }).tipo).toBe("org-chart");
    expect(planDiagrama({ tipo: "espina-de-pescado" }).tipo).toBe("fishbone");
  });

  it("un tipo desconocido cae a flowchart y avisa el motivo", () => {
    const plan = planDiagrama({ tipo: "collage" });
    expect(plan.tipo).toBe("flowchart");
    expect(plan.avisos.some((a) => a.startsWith("No conozco el tipo «collage»"))).toBe(true);
  });

  it("sin tipo declarado no pasa cadena vacía al resolutor de tipo de la herramienta", () => {
    const plan = planDiagrama({});
    expect(plan).toMatchObject({ tipo: "flowchart" });
    expect(plan.avisos).toEqual([]);
  });

  it("el tipo del panel entra tal cual al resolutor de tipo de la herramienta", () => {
    for (const tipo of TIPOS_PANEL) {
      expect(planDiagrama({ tipo }).avisos).toEqual([]);
    }
  });

  it("con petición, la instrucción lleva la petición y las reglas del sandbox", () => {
    const plan = planDiagrama({ tipo: "gantt" }, "plazos de la ola 1018");
    expect(plan.tipo).toBe("gantt");
    expect(plan.instruccion).toContain("Petición: «plazos de la ola 1018»");
    expect(plan.instruccion).toContain("El HTML se muestra solo dentro de un iframe sandbox sin permisos");
  });

  it("animado cambia los pasos y el sandbox: scripts permitidos, sin ningún permiso más", () => {
    const plan = planDiagrama({ tipo: "cascada", animado: true });
    expect(plan.tipo).toBe("waterfall");
    expect(plan.animado).toBe(true);
    expect(plan.pasos.join(" ")).toContain("scripts de la animación dentro del sandbox");
    expect(plan.instruccion).toContain("Lleva una animación corta en JavaScript embebido");
    const estatico = planDiagrama({ tipo: "cascada" });
    expect(estatico.pasos.join(" ")).toContain("sin JavaScript: diagrama estático");
  });

  it("el ancho se redondea a múltiplos de 8 y acota a los 320..1920 del viewport", () => {
    expect(planDiagrama({ ancho: 0 }).ancho).toBe(320);
    expect(planDiagrama({ ancho: 9999 }).ancho).toBe(1920);
    expect(planDiagrama({ ancho: 900 }).ancho).toBe(896);
    expect(planDiagrama({ ancho: Number.NaN }).ancho).toBe(720);
  });

  it("el tema oscuro pide la plantilla oscura y la marca neutro la piel de la skill", () => {
    const oscuro = planDiagrama({ tema: "oscuro" });
    expect(oscuro.tema).toBe("oscuro");
    expect(oscuro.pasos.join(" ")).toContain("template-dark.html");
    const neutro = planDiagrama({ marca: "neutro" });
    expect(neutro.marca).toBe("neutro");
    expect(neutro.pasos.join(" ")).toContain("piel por defecto de la skill");
  });
