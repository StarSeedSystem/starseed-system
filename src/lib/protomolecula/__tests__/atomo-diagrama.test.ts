import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../atomos";
import {
  DIAGRAMA, FAMILIAS, TIPOS_POR_FAMILIA,
  altoDe, planDiagrama, tamanoDe, type EntradaDiagrama,
} from "../atomos/diagrama";
import { TIPOS_DIAGRAMA } from "@/ai/astraura/habilidades/diagramas";
import { limpiarRegistro, obtenerAtomo, registrarAtomo } from "../registro-atomos";

describe("átomo diagrama · definición", () => {
  beforeEach(() => limpiarRegistro());

  it("declara el contrato de Diagram Design, se registra y está en el índice", () => {
    expect(DIAGRAMA).toMatchObject({
      herramientaId: "diagram-design", categoria: "arquitectura", integracion: "iframe-aislado",
      control: "total", ficha: { licencia: "MIT" },
    });
    expect(DIAGRAMA.entradas).toEqual(expect.arrayContaining(["texto", "datos", "draw.io", "mermaid", "excalidraw"]));
    expect(DIAGRAMA.salidas).toEqual(["html", "svg", "png"]);
    expect(registrarAtomo(DIAGRAMA)).toEqual({ ok: true });
    registrarAtomosPropios();
    expect(obtenerAtomo("diagram-design")).toBe(DIAGRAMA);
    expect(ATOMOS_PROPIOS).toContain(DIAGRAMA);
  });

  it("los tres parámetros de tipo cubren los 45 tipos de la habilidad sin repetir ninguno", () => {
    const todas = FAMILIAS.flatMap((g) => TIPOS_POR_FAMILIA[g]);
    expect(todas).toHaveLength(45);
    expect(new Set(todas.map((t) => t.id))).toEqual(new Set(TIPOS_DIAGRAMA.map((t) => t.id)));
    expect(new Set(todas.map((t) => t.nombre)).size).toBe(45);
    expect(todas.every((t) => t.nombre.length <= 40)).toBe(true);
  });

  it("cada familia cabe como opciones del parámetro (32 como máximo) con un defecto de su lista", () => {
    for (const g of FAMILIAS) {
      const p = DIAGRAMA.parametros.find((q) => q.id === `tipo-${g}`);
      expect(p?.opciones).toEqual(TIPOS_POR_FAMILIA[g].map((t) => t.nombre));
      expect(p?.opciones?.length ?? 99).toBeLessThanOrEqual(32);
      expect(TIPOS_POR_FAMILIA[g].map((t) => t.nombre)).toContain(p?.defecto as string);
    }
  });

  it("el módulo es puro y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "diagrama.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn|eval)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).toContain("iframe `sandbox`");
  });
});

describe("planDiagrama · plan puro del diagrama", () => {
  it("por defecto: arquitectura clara, sin animación, doc-wide con φ y marca del perfil", () => {
    expect(planDiagrama({})).toEqual({
      tipo: "architecture", tipoNombre: "Arquitectura", grupo: "estructura",
      tema: "claro", animado: false, ancho: 960, alto: altoDe(960), tamano: "doc-wide",
      marca: "perfil", salida: "html", fuente: "texto", redibujar: false,
      atribucion: expect.stringContaining("MIT"), avisos: [],
    });
  });

  it("es puro: misma entrada, mismo plan y no muta la entrada", () => {
    const entrada: EntradaDiagrama = {
      valores: { grupo: "datos", "tipo-datos": "Wardley", tema: "oscuro", animado: true, ancho: 1400, salida: "png" },
      fuente: "mermaid",
    };
    const copia = structuredClone(entrada);
    expect(planDiagrama(entrada)).toEqual(planDiagrama(entrada));
    expect(entrada).toEqual(copia);
  });

  it("elige el tipo del parámetro de SU familia y cae al defecto si el valor no es de la lista", () => {
    expect(planDiagrama({ valores: { "tipo-proceso": "Gantt" } })).toMatchObject({ grupo: "estructura", tipo: "architecture" });
    expect(planDiagrama({ valores: { grupo: "proceso", "tipo-proceso": "Gantt" } })).toMatchObject({ grupo: "proceso", tipo: "gantt" });
    expect(planDiagrama({ valores: { grupo: "proceso", "tipo-proceso": "no existe" } })).toMatchObject({ grupo: "proceso", tipo: "flowchart" });
    expect(planDiagrama({ valores: { grupo: "extravagante", "tipo-datos": "Radar" } })).toMatchObject({ grupo: "estructura", tipo: "architecture" });
  });

  it("tema, animación, formato y marca acotados a lo declarado", () => {
    expect(planDiagrama({ valores: { tema: "oscuro", animado: true, salida: "svg", marca: "grupo" } })).toMatchObject({
      tema: "oscuro", animado: true, salida: "svg", marca: "grupo",
    });
    expect(planDiagrama({ valores: { tema: "azul", animado: "sí", salida: "pdf", marca: "mundo" } })).toMatchObject({
      tema: "claro", animado: false, salida: "html", marca: "perfil",
    });
  });

  it("ancho→alto con φ (1.25 en pantallas estrechas) y tamaño por tramos", () => {
    expect(altoDe(960)).toBe(593);
    expect(altoDe(400)).toBe(320);
    expect(planDiagrama({ valores: { ancho: 400 } })).toMatchObject({ tamano: "doc-inline", alto: 320 });
    expect(planDiagrama({ valores: { ancho: 1400 } })).toMatchObject({ tamano: "slide-16x9", alto: 865 });
    expect(tamanoDe(2000)).toBe("print-a4-landscape");
    expect(planDiagrama({ valores: { ancho: 5000 } })).toMatchObject({ ancho: 3840, alto: 2373, tamano: "print-a4-landscape" });
    expect(planDiagrama({ valores: { ancho: 100 } })).toMatchObject({ ancho: 320 });
  });

  it("un import (draw.io, Mermaid, Excalidraw) se redibuja con aviso; lo demás no", () => {
    expect(planDiagrama({ fuente: "excalidraw" })).toMatchObject({ redibujar: true, avisos: [expect.stringContaining("redibuja")] });
    const noRedibuja = [void 0, "texto", "datos", "otro"] as const;
    for (const f of noRedibuja) expect(planDiagrama({ fuente: f as never })).toMatchObject({ redibujar: false, avisos: [] });
  });

  it("animado a la vez que import acumula los dos avisos, con la atribución MIT siempre", () => {
    const plan = planDiagrama({ valores: { animado: true }, fuente: "mermaid" });
    expect(plan.avisos).toEqual([expect.stringContaining("iframe sandbox"), expect.stringContaining("redibuja")]);
    expect(plan.atribucion).toContain("diagram-design");
  });
});
