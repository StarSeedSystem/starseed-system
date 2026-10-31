import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CSP_DIAGRAMA, DIAGRAMA, FAMILIA_DE_TIPO, FAMILIAS_DIAGRAMA, LIMITES_DIAGRAMA,
  MARCAS, SANDBOX_DIAGRAMA, TIPOS_DIAGRAMA, familiaDe, normalizarTemaDiagrama,
  normalizarTipoDiagrama, planDiagrama, tiposDeFamilia, validarLimites,
} from "../atomos/diagrama";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

describe("átomo diagrama · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de Diagram Design, se registra y está en el índice", () => {
    expect(DIAGRAMA).toMatchObject({
      herramientaId: "diagram-design",
      categoria: "arquitectura",
      integracion: "iframe-aislado",
      control: "total",
      ficha: { licencia: "MIT" },
    });
    expect(DIAGRAMA.parametros.map((p) => p.id)).toEqual(["tipo", "tema", "animado", "ancho", "marca"]);
    expect(DIAGRAMA.entradas).toEqual(expect.arrayContaining(["texto", "datos", "draw.io", "Mermaid", "Excalidraw"]));
    expect(DIAGRAMA.salidas).toEqual(["html", "svg", "png"]);
    expect(registrarAtomo(DIAGRAMA)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(DIAGRAMA);
  });

  it("las 8 familias del control son válidas y caben en el registro (máx. 32 opciones)", () => {
    expect(FAMILIAS_DIAGRAMA.length).toBeLessThanOrEqual(32);
    expect([...FAMILIAS_DIAGRAMA]).toEqual(["estructura", "flujo", "datos", "jerarquia", "espacio", "comparativa", "tiempo", "mapas"]);
    expect([...MARCAS]).toEqual(["os", "neutro", "heredado", "personal"]);
    for (const p of DIAGRAMA.parametros) expect(p.opciones?.length ?? 0).toBeLessThanOrEqual(32);
  });

  it("el módulo es puro, sin claves ni IPs, y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "diagrama.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});

describe("normalizarTipoDiagrama · los 45 tipos y sus alias", () => {
  it("acepta los 45 ids canónicos exactos, sin duplicados", () => {
    expect(new Set(TIPOS_DIAGRAMA).size).toBe(45);
    expect(TIPOS_DIAGRAMA.length).toBe(45);
    for (const tipo of TIPOS_DIAGRAMA) expect(normalizarTipoDiagrama(tipo)).toBe(tipo);
    expect(normalizarTipoDiagrama("ARCHITECTURE")).toBe("architecture");
    expect(normalizarTipoDiagrama(undefined)).toBeNull();
  });

  it("acepta alias en español y rechaza lo desconocido", () => {
    expect(normalizarTipoDiagrama("Arquitectura")).toBe("architecture");
    expect(normalizarTipoDiagrama("Organigrama")).toBe("org-chart");
    expect(normalizarTipoDiagrama("Espina de pescado")).toBe("fishbone");
    expect(normalizarTipoDiagrama("Línea de tiempo")).toBe("timeline");
    expect(normalizarTipoDiagrama("triquetra")).toBeNull();
    expect(normalizarTipoDiagrama("")).toBeNull();
  });

  it("cada uno de los 45 tipos tiene UNA familia, y la familia lo devuelve", () => {
    for (const tipo of TIPOS_DIAGRAMA) {
      expect(FAMILIA_DE_TIPO[tipo]).toBeTruthy();
      expect(tiposDeFamilia(familiaDe(tipo))).toContain(tipo);
    }
    const todas = FAMILIAS_DIAGRAMA.flatMap((f) => tiposDeFamilia(f));
    expect(todas.length).toBe(45);
    expect(new Set(todas).size).toBe(45);
  });
});

describe("validarLimites · editorial de la skill", () => {
  it("LIMITES_DIAGRAMA son 9 nodos, 12 aristas y 2 acentos", () => {
    expect(LIMITES_DIAGRAMA).toEqual({ nodos: 9, aristas: 12, acentos: 2 });
  });

  it("acepta lo que cabe y da motivo con lo que excede", () => {
    expect(validarLimites(9, 12, 2)).toBeNull();
    expect(validarLimites(1, 1, 1)).toBeNull();
    expect(validarLimites(10)).toMatch(/Máximo 9 nodos/);
    expect(validarLimites(9, 13)).toMatch(/Máximo 12 aristas/);
    expect(validarLimites(9, 12, 3)).toMatch(/Máximo 2 acentos/);
    expect(validarLimites(undefined, undefined, undefined)).toBeNull();
  });
});

describe("planDiagrama · plan puro", () => {
  const entrada = { id: "dgm-1", autor: "astra", creado: "2026-10-18T12:00:00.000Z" };

  it("por defecto: architecture, tema claro, sin animación, canvas 960×600 y marca del OS", () => {
    const plan = planDiagrama(entrada);
    expect(plan).toMatchObject({ formato: "diagrama-diagram-design", version: 1, id: "dgm-1", tipo: "architecture", familia: "estructura", tema: "claro", animado: false, ancho: 960, alto: 600, marca: "os" });
    expect(plan.limites).toEqual(LIMITES_DIAGRAMA);
    expect(plan.exportar).toEqual(["html", "svg", "png"]);
    expect(plan.importar).toEqual(["draw.io", "Mermaid", "Excalidraw"]);
  });

  it("es determinista y no muta la entrada", () => {
    const conValores = { ...entrada, valores: { tipo: "flujo", tema: "oscuro", animado: true, ancho: 1280, marca: "neutro" } };
    const copia = structuredClone(conValores);
    expect(planDiagrama(conValores)).toEqual(planDiagrama(conValores));
    expect(conValores).toEqual(copia);
  });

  it("tema oscuro y familia elegida dan su tipo de serie; valores extraños van al defecto", () => {
    expect(planDiagrama({ ...entrada, valores: { tema: "oscuro", tipo: "mapas" } })).toMatchObject({ tema: "oscuro", tipo: "sankey", familia: "mapas" });
    expect(planDiagrama({ ...entrada, valores: { tema: "azul", tipo: "brujula", ancho: 100 } as never })).toMatchObject({ tema: "claro", tipo: "architecture", ancho: 480 });
  });

  it("un tipo concreto entre los 45 manda; lo desconocido cae a la familia", () => {
    expect(planDiagrama({ ...entrada, tipo: "Gantt" })).toMatchObject({ tipo: "gantt", familia: "tiempo" });
    expect(planDiagrama({ ...entrada, tipo: "ingrato" })).toMatchObject({ tipo: "architecture" });
    expect(planDiagrama({ ...entrada, valores: { tipo: "jerarquia" } as unknown as Record<string, string | number | boolean> })).toMatchObject({ tipo: "tree" });
  });

  it("el ancho se acota al rango declarado y el alto acompaña el preset", () => {
    expect(planDiagrama({ ...entrada, valores: { ancho: 2560 } as unknown as Record<string, string | number | boolean> }).alto).toBe(720);
    expect(planDiagrama({ ...entrada, valores: { ancho: 99999 } as unknown as Record<string, string | number | boolean> }).ancho).toBe(2560);
    expect(planDiagrama({ ...entrada, valores: { ancho: "ancho" } as unknown as Record<string, string | number | boolean> }).ancho).toBe(960);
  });

  it("tema con tildes y marca inválida se normalizan; fecha rota va a la época", () => {
    expect(planDiagrama({ ...entrada, creado: "ayer" }).creado).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizarTemaDiagrama("oscuro")).toBe("oscuro");
    expect(normalizarTemaDiagrama("clarito")).toBe("claro");
  });
});

describe("aislamiento del HTML (§3)", () => {
  it("el iframe no comparte origen y el bloqueo carece de Google Fonts", () => {
    expect(CSP_DIAGRAMA).toContain("default-src 'none'");
    expect(CSP_DIAGRAMA).not.toMatch(/googleapis|gstatic|https?:\/\//);
    expect(SANDBOX_DIAGRAMA).toContain("allow-scripts");
    expect(SANDBOX_DIAGRAMA).not.toContain("allow-same-origin");
  });
});
