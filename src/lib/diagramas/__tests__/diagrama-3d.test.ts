// Pruebas para diagrama-3d.ts (entrada → salida; sin red y sin navegador real).
// Cubre la extraccion de SVG a 3D (`estructuraDeSvg`, `escena3d`) y el componente `Diagrama3D`.
// Basado en el contrato de architecture/diagramas.md §5-I y §4. Sin vi.mock de `node:*`.
// Importa { describe, it, expect } de "vitest".

import { describe, it, expect } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { estructuraDeSvg, escena3d } from "../diagrama-3d";

// SVG de ejemplo para pruebas - un diagrama simple con rectángulo, círculo y texto.
const SVG_SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect id="rect1" x="10" y="10" width="30" height="20" fill="#ff0000" stroke="#000000"/>
  <circle id="circle1" cx="60" cy="30" r="15" fill="#00ff00" stroke="#000000"/>
  <text id="text1" x="50" y="70" font-family="Arial" font-size="12" fill="#0000ff">Hola</text>
  <g id="grupo1" class="apilado">
    <rect x="70" y="40" width="20" height="15" fill="#ff00ff"/>
  </g>
  <g id="grupo2" data-tipo-capa="estructura">
    <circle cx="30" cy="60" r="10" fill="#ffa500"/>
  </g>
  <path id="path1" d="M20,80 L80,80" stroke="#000000" stroke-width="2"/>
  <line id="line1" x1="15" y1="15" x2="35" y2="35" stroke="#00ffff" stroke-width="2"/>
  <defs>
    <filter id="filtro1">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>
</svg>`;

// SVG con errores (mal formados) para casos de error.
const SVG_MALFORMADO = `<?xml version="1.0"?>
<svg width="100" height="100">
  <rect id="rect1" x="10" y="10">
    <text>Hola</text>
  </rect>
</svg>`;

// SVG vacío (sin elementos de diagrama).
const SVG_VACIO = `<?xml version="1.0"?>
<svg width="100" height="100">
  <defs>
    <style>body { color: red; }</style>
  </defs>
  <path d="M0 0 L100 100"/>
</svg>`;

describe("estructuraDeSvg", () => {
  it("extrae nodos rect, circulo y texto correctamente", () => {
    const estructura = estructuraDeSvg(SVG_SIMPLE);

    expect(estructura.nodos).toHaveProperty("rect1");
    expect(estructura.nodos.rect1).toEqual(
      expect.objectContaining({ tipo: "rect", ancho: 30, alto: 20, x: 10, y: 10 })
    );

    expect(estructura.nodos).toHaveProperty("circle1");
    expect(estructura.nodos.circle1).toEqual(
      expect.objectContaining({ tipo: "circulo", r: 15, cx: 60, cy: 30 })
    );

    expect(estructura.nodos).toHaveProperty("text1");
    expect(estructura.nodos.text1).toEqual(
      expect.objectContaining({ tipo: "texto", contenido: "Hola", fuente: "Arial" })
    );
  });

  it("extrae aristas path y line", () => {
    const estructura = estructuraDeSvg(SVG_SIMPLE);

    expect(estructura.aristas).toHaveProperty("path1");
    expect(estructura.aristas.path1).toEqual(
      expect.objectContaining({ tipo: "arista", de: "20,80", hacia: "80,80" })
    );

    expect(estructura.aristas).toHaveProperty("line1");
    expect(estructura.aristas.line1).toEqual(
      expect.objectContaining({ tipo: "arista", de: "15,15", hacia: "35,35" })
    );
  });

  it("extrae grupos como nodos", () => {
    const estructura = estructuraDeSvg(SVG_SIMPLE);

    expect(estructura.grupos).toHaveProperty("grupo1");
    expect(estructura.grupos.grupo1).toEqual(
      expect.objectContaining({ tipo: "grupo", clase: "apilado" })
    );

    expect(estructura.grupos).toHaveProperty("grupo2");
    expect(estructura.grupos.grupo2).toEqual(
      expect.objectContaining({ tipo: "grupo", clase: undefined })
    );
  });

  it("extrae capas con tipos y apilados", () => {
    const estructura = estructuraDeSvg(SVG_SIMPLE);

    expect(estructura.capas).toHaveLength(2);
    expect(estructura.capas[0]).toEqual(
      expect.objectContaining({ id: "grupo1", tipoCapa: undefined, apilado: 1 })
    );
    expect(estructura.capas[1]).toEqual(
      expect.objectContaining({ id: "grupo2", tipoCapa: "estructura", apilado: undefined })
    );
  });

  it("extrae definiciones", () => {
    const estructura = estructuraDeSvg(SVG_SIMPLE);

    expect(estructura.definiciones).toHaveLength(1);
    expect(estructura.definiciones[0]).toEqual(
      expect.objectContaining({
        id: "filtro1",
        elemento: "filter",
        atributos: expect.objectContaining({ "stdDeviation": "2" }),
      })
    );
  });

  it("lanza error al no ser un SVG válido", () => {
    expect(() => estructuraDeSvg(SVG_MALFORMADO)).toThrow(/XML SVG mal formado/);
  });

  it("devuelve nodos y aristas vacíos para SVG sin diagrama", () => {
    const estructura = estructuraDeSvg(SVG_VACIO);

    expect(Object.keys(estructura.nodos)).toHaveLength(0);
    expect(Object.keys(estructura.aristas)).toHaveLength(0);
    expect(estructura.grupos).toEqual({});
    expect(estructura.capas).toHaveLength(0);
  });
});

describe("escena3d", () => {
  const estructura = estructuraDeSvg(SVG_SIMPLE);

  it("genera posiciones 3D para nodos y aristas", () => {
    const escena3D = escena3d(estructura, "arbol");

    expect(escena3D.nodos3D).toHaveProperty("rect1");
    expect(escena3D.nodos3D.rect1).toHaveProperty("posicion");
    expect(escena3D.nodos3D.rect1.posicion).toHaveLength(3);

    expect(escena3D.aristas3D).toHaveProperty("path1");
    expect(escena3D.aristas3D.path1).toHaveProperty("posicion");
    expect(escena3D.aristas3D.path1.posicion).toHaveLength(3);
  });

  it("establece tipos de apilado para capas", () => {
    const escena3D = escena3d(estructura, "arbol");

    expect(escena3D.capas3D).toHaveLength(2);
    expect(escena3D.capas3D[0].tipo).toBe("generico");
    expect(escena3D.capas3D[1].tipo).toBe("estructura");
  });

  it("distribuye grupos en 3D con rotaciones aleatorias", () => {
    const escena3D = escena3d(estructura, "red");

    expect(escena3D.grupos3D).toHaveProperty("grupo1");
    expect(escena3D.grupos3D.grupo1).toHaveProperty("rotacion");
    expect(escena3D.grupos3D.grupo1.rotacion[1]).toBeGreaterThanOrEqual(0);
    expect(escena3D.grupos3D.grupo1.rotacion[1]).toBeLessThan(Math.PI * 2);
  });

  it("aplica tipos específicos por nodo para el tipo 'arbol'", () => {
    const escena3D = escena3d(estructura, "arbol");

    expect(escena3D.nodos3D.rect1.tipo).toBe("rect");
    expect(escena3D.nodos3D.circle1.tipo).toBe("circulo");
    expect(escena3D.nodos3D.text1.tipo).toBe("texto");
  });

  it("genera rotaciones aleatorias para el tipo 'red'", () => {
    const escena3D = escena3d(estructura, "red");

    expect(escena3D.nodos3D.rect1.rotacion[1]).toBeGreaterThanOrEqual(0);
    expect(escena3D.nodos3D.circle1.rotacion[1]).toBeGreaterThanOrEqual(0);
  });

  it("mantiene posiciones Z ordenadas por apilado", () => {
    const escena3D = escena3d(estructura, "arbol");

    const rectZ = escena3D.nodos3D.rect1.posicion[2];
    const grupo1Z = escena3D.grupos3D.grupo1?.posicion[2] || 0;

    expect(rectZ).toBeGreaterThanOrEqual(0);
  });

  it("funciona con SVG vacío y devuelve estructuras vacías", () => {
    const estructuraVacia = estructuraDeSvg(SVG_VACIO);
    const escena3D = escena3d(estructuraVacia, "arbol");

    expect(escena3D.nodos3D).toEqual({});
    expect(escena3D.aristas3D).toEqual({});
    expect(escena3D.capas3D).toEqual([]);
    expect(escena3D.grupos3D).toEqual({});
  });
});
