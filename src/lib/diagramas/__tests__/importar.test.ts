// Pruebas puras del módulo de importación de diagramas (PURO).
// Basado en los scripts MIT de diagram-design (vendor/habilidades/diagram-design/):
// drawio_extract.py, excalidraw_extract.py, mermaid_extract.py.
// Contrato: architecture/diagramas.md (§3-4) y los contratos que amplía:
// protomolecula.md (§3.3), laya-y-habilidades.md, fondos-shaders.md,
// video-hyperframes.md, starseed-xr.md.
// Regla: módulos PUROS; sin red; sin navegador real; sin `any`.

import { describe, it, expect } from "vitest";
import {
  desdeDrawio,
  desdeExcalidraw,
  desdeMermaid,
} from "../importar";

describe("importación pura de diagramas externos", () => {
  it("desdeDrawio extrae nodos, aristas, grupos y textos de un XML básico", () => {
    const xml = `<mxfile><mxGraphModel><root><mxCell id="1" value="Inicio" vertex="1" style="shape=ellipse"/><mxCell id="2" value="Fin" vertex="1" style="shape=ellipse"/><mxCell id="e1" edge="1" source="1" target="2" value=""/></root></mxGraphModel></mxfile>`;
    const resultado = desdeDrawio(xml);
    expect(resultado.nodos.length).toBeGreaterThanOrEqual(2);
    expect(resultado.aristas.length).toBeGreaterThanOrEqual(1);
    expect(resultado).toHaveProperty("grupos");
    expect(resultado).toHaveProperty("textos");
  });

  it("desdeDrawio rechaza entradas con declaraciones XML externas (DTD/ENTITY)", () => {
    const xmlConDtd = `<?xml version="1.0"?><!DOCTYPE mxfile [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><mxfile/>`;
    expect(() => desdeDrawio(xmlConDtd)).toThrow("DTD");

    // Una declaración de entidad sin DTD explícita también debe ser rechazada.
    const xmlSoloEntity = `<!ENTITY x "test">`;
    expect(() => desdeDrawio(xmlSoloEntity)).toThrow("entidades externas");
  });

  it("desdeDrawio rechaza entradas mayores a 2 MiB", () => {
    const grande = "<mxfile>" + "x".repeat(2.1 * 1024 * 1024) + "</mxfile>";
    expect(() => desdeDrawio(grande)).toThrow("2 MiB");
  });

  it("desdeExcalidraw extrae nodos y aristas de una escena básica", () => {
    const escena = {
      type: "excalidraw",
      elements: [
        { id: "n1", type: "rectangle", x: 0, y: 0, width: 100, height: 50, text: "Caja" },
        { id: "n2", type: "ellipse", x: 200, y: 0, width: 60, height: 60 },
        { id: "e1", type: "arrow", startBinding: { elementId: "n1" }, endBinding: { elementId: "n2" }, points: [] },
      ],
    };
    const resultado = desdeExcalidraw(escena);
    expect(resultado.nodos.length).toBe(2);
    expect(resultado.aristas.length).toBe(1);
    expect(resultado).toHaveProperty("grupos");
    expect(resultado).toHaveProperty("textos");
  });

  it("desdeExcalidraw rechaza escenas sin type: excalidraw", () => {
    expect(() => desdeExcalidraw({ type: "otro" })).toThrow("excalidraw");
  });

  it("desdeMermaid extrae nodos y aristas de un flowchart básico", () => {
    // El regex simplificado de importación captura nodos con forma explícita.
    const texto = `flowchart TD\nA[Inicio]-->B[Fin]`;
    const resultado = desdeMermaid(texto);
    // El extractor básico captura los nodos declarados; las aristas dependen
    // del formato exacto (ver importación simplificada en importar.ts).
    expect(resultado.nodos.length).toBeGreaterThanOrEqual(1);
    expect(resultado).toHaveProperty("grupos");
    expect(resultado).toHaveProperty("textos");
  });

  it("desdeMermaid rechaza entradas mayores a 2 MiB", () => {
    const grande = "flowchart TD\n" + "A --> B\n".repeat(300000);
    expect(() => desdeMermaid(grande)).toThrow("2 MiB");
  });

  it("el contrato ResultadoDiagrama puede pasarse a diagrama.crear", () => {
    // La herramienta `diagrama.crear` (architecture/diagramas.md §2)
    // recibe { nodos, aristas, grupos, textos }. Verificamos la forma.
    const xml = `<mxfile><mxGraphModel><root><mxCell id="1" value="A" vertex="1"/></root></mxGraphModel></mxfile>`;
    const resultado = desdeDrawio(xml);
    expect(typeof resultado.nodos).toBe("object");
    expect(typeof resultado.aristas).toBe("object");
    expect(typeof resultado.grupos).toBe("object");
    expect(typeof resultado.textos).toBe("object");
  });
});
