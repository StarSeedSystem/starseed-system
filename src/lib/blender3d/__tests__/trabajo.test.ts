/**
 * TESTS · Trabajo 3D puro TypeScript · BLD1025C
 * Cubren: validación, costeo, confirmación, casos边缘 y pureza.
 * Prohibido: vi.mock, import de route.ts, node:, eval, new Function, fetch.
 */

import { describe, it, expect } from "vitest";

import {
  validarTrabajo,
  estimarCoste,
  necesitaConfirmacion,
  VERSION_VOCABULARIO,
} from "../trabajo";

import vocabulario from "../vocabulario.json";

describe("validarTrabajo", () => {
  it("trabajo mínimo válido: cubo + cámara + luz + render_png", () => {
    const trabajo = {
      v: 1,
      titulo: "Escena minima",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "objeto1", tam: 1, segmentos: 12 } },
        { op: "transformar", params: { objeto: "objeto1", ubicacion: [0, 0, 0], rotacion: [0, 0, 0], escala: [1, 1, 1] } },
        { op: "luz", params: { nombre: "luz1", tipo: "sol", color: [1, 1, 1, 1], energia: 500, ubicacion: [0, 5, 0], rotacion: [0, 0, 0] } },
        { op: "camara", params: { nombre: "camara1", ubicacion: [0, 0, 10], mira_a: [0, 0, 0], lente_mm: 50 } },
      ],
      salidas: [
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
      ],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(true);
  });

  it("campos desconocidos son rechazados con motivo en español", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "objeto1", tam: 1, segmentos: 12 } },
      ],
      salidas: [],
      campo_extra: "no permitido",
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("campo extra no esperado");
  });

  it("NaN e Infinity son rechazados", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "objeto1", tam: NaN, segmentos: 12 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    const tieneNaN = res.motivos.some((m) => m.includes("no es un número finito"));
    expect(tieneNaN).toBe(true);
  });

  it("demasiadas operaciones son rechazadas (>256)", () => {
    const ops = Array(257).fill(0).map((_, i) => ({
      op: "primitiva",
      params: { tipo: "cubo", nombre: `obj${i}`, tam: 1, segmentos: 12 },
    }));
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: ops,
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("escena mayor a 256 operaciones");
  });

  it("nombre repetido es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "misma", tam: 1, segmentos: 12 } },
        { op: "primitiva", params: { tipo: "esfera", nombre: "misma", tam: 1, segmentos: 12 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("nombre repetido");
  });

  it("ruta con .. es rechazada", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [
        { tipo: "importar", params: { archivo: "../etc/passwd", nombre: "archivo-mal" } },
      ],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("ruta con '..' no permitida");
  });

  it("ruta absoluta es rechazada", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [
        { tipo: "importar", params: { archivo: "/etc/passwd", nombre: "archivo-mal" } },
      ],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("ruta absoluta no permitida");
  });

  it("archivo .blend es rechazado en importar", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [
        { tipo: "importar", params: { archivo: "modelo.blend", nombre: "archivo-mal" } },
      ],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("extensión no permitida");
  });

  it("archivo .py es rechazado en importar", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [
        { tipo: "importar", params: { archivo: "script.py", nombre: "archivo-mal" } },
      ],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("extensión no permitida");
  });

  it("textos de inyección en nombre son rechazados o quedan como dato", () => {
    const casos = [
      { nombre: `"); import os;`, motivo: "formato de nombre inválido" },
      { nombre: `"`, motivo: "formato de nombre inválido" },
      { nombre: `os`, motivo: null },
      { nombre: `algoritmo_tilde_ñ`, motivo: null },
      { nombre: `_inicio`, motivo: "formato de nombre inválido" },
    ];
    for (const { nombre, motivo } of casos) {
      const trabajo = {
        v: 1,
        titulo: "Test",
        calidad: "borrador",
        ambito: "personal",
        origen: "protomolecula",
        quien: "persona",
        escena: [
          { op: "primitiva", params: { tipo: "cubo", nombre, tam: 1, segmentos: 12 } },
        ],
        salidas: [],
      };
      const res = validarTrabajo(trabajo);
      if (motivo === null) {
        expect(res.ok).toBe(true);
      } else {
        expect(res.ok).toBe(false);
        expect(res.motivos).toContain("formato de nombre inválido");
      }
    }
  });

  it("textos de inyección en texto3d son rechazados o quedan como dato", () => {
    const casos = [
      { texto: `"); import os;`, motivo: "patrón de texto no válido" },
      { texto: `"`, motivo: "patrón de texto no válido" },
      { texto: `hola mundo`, motivo: null },
      { texto: `algoritmo_tilde_ñ`, motivo: null },
    ];
    for (const { texto, motivo } of casos) {
      const trabajo = {
        v: 1,
        titulo: "Test",
        calidad: "borrador",
        ambito: "personal",
        origen: "protomolecula",
        quien: "persona",
        escena: [
          {
            op: "texto3d",
            params: { nombre: "txt1", texto, extrusion: 0, tam: 1 },
          },
        ],
        salidas: [],
      };
      const res = validarTrabajo(trabajo);
      if (motivo === null) {
        expect(res.ok).toBe(true);
      } else {
        expect(res.ok).toBe(false);
        expect(res.motivos).toContain("patrón de texto no válido");
      }
    }
  });

  it("remallar es rechazado con su motivo", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "remallar", params: { objeto: "obj1", modo: "voxel", caras: 5 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("próximamente");
    expect(res.motivos).toContain("hoy lo hace servicios/taller-3d");
  });

  it("estimarCoste devuelve vertices y segundos", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: 1, segmentos: 0 } },
        { op: "primitiva", params: { tipo: "esfera", nombre: "s1", tam: 1, segmentos: 0 } },
      ],
      salidas: [
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
      ],
      limites: { segundos: 300 },
    };
    const coste = estimarCoste(trabajo);
    expect(coste.vertices).toBeGreaterThan(0);
    expect(coste.segundos).toBeGreaterThan(0);
  });

  it("necesitaConfirmacion devuelve true para ámbito grupo", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "grupo",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    expect(necesitaConfirmacion(trabajo, "ligero")).toBe(true);
  });

  it("necesitaConfirmacion devuelve true para calidad final", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "final",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    expect(necesitaConfirmacion(trabajo, "ligero")).toBe(true);
  });

  it("necesitaConfirmacion devuelve true cuando hay importar", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [{ op: "importar", params: { archivo: "modelo.glb", nombre: "m1" } }],
      salidas: [],
    };
    expect(necesitaConfirmacion(trabajo, "ligero")).toBe(true);
  });

  it("necesitaConfirmacion devuelve false para ámbito personal sin riesgos", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [{ op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: 1, segmentos: 12 } }],
      salidas: [{ tipo: "render_png", params: { ancho: 640, alto: 480, muestras: 32, motor: "workbench" } }],
    };
    expect(necesitaConfirmacion(trabajo, "ligero")).toBe(false);
  });

  it("v 1 es el versión válida", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(true);
  });

  it("v 0 es rechazado", () => {
    const trabajo = {
      v: 0,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("título mayor a 80 caracteres es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Este es un título que excede los ochenta caracteres maximos permitidos en el sistema",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("título mayor a 80 caracteres");
  });

  it("calidad inválida es rechazada", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "avanzada",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("ambito inválido es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "privado",
      origen: "protomolecula",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("origen inválido es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "invalido",
      quien: "persona",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("quien inválido es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "admin",
      escena: [],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("salidas fuera de rango (0 o >4) son rechazadas", () => {
    // 0 salidas
    const trabajo0 = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [{ op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: 1, segmentos: 12 } }],
      salidas: [],
    };
    const res0 = validarTrabajo(trabajo0);
    expect(res0.ok).toBe(false);

    // 5 salidas
    const trabajo5 = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [{ op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: 1, segmentos: 12 } }],
      salidas: [
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
        { tipo: "render_png", params: { ancho: 1920, alto: 1080, muestras: 64, motor: "workbench" } },
      ],
    };
    const res5 = validarTrabajo(trabajo5);
    expect(res5.ok).toBe(false);
  });

  it("número negativo en tam es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: -1, segmentos: 12 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("menor que 0.001");
  });

  it("segmentos fuera de rango es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "primitiva", params: { tipo: "cubo", nombre: "c1", tam: 1, segmentos: 1 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("menor que 3");
  });

  it("luz con tipo inválido es rechazado", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "luz", params: { nombre: "luz1", tipo: "infinita", color: [1, 1, 1, 1], energia: 500 } },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
  });

  it("operación desconocida es rechazada", () => {
    const trabajo = {
      v: 1,
      titulo: "Test",
      calidad: "borrador",
      ambito: "personal",
      origen: "protomolecula",
      quien: "persona",
      escena: [
        { op: "operacion_inesistente", params: {} },
      ],
      salidas: [],
    };
    const res = validarTrabajo(trabajo);
    expect(res.ok).toBe(false);
    expect(res.motivos).toContain("operación desconocida");
  });
});

describe("pureza y especificaciones", () => {
it("archivo no contiene node:, eval, new Function, fetch", async () => {
    const path = await import("path");
    const contenido = fs.readFileSync(path.join(__dirname, "../trabajo.ts"), "utf-8");
    expect(contenido).not.toContain("node:");
    expect(contenido).not.toContain("eval(");
    expect(contenido).not.toContain("new Function");
    expect(contenido).not.toContain("fetch(");
  });

  it("todas las especificaciones del JSON son de las clases permitidas", () => {
    const clasesPermitidas = [
      "num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj",
    ];
    const operaciones = vocabulario.operaciones;
    const salidas = vocabulario.salidas;

    for (const [op, espec] of Object.entries(operaciones)) {
      for (const [campo, subEspec] of Object.entries(espec.params)) {
        const t = subEspec.t;
        if (t) {
          const valida = clasesPermitidas.includes(t);
          expect(valida).toBe(true), `operacion ${op} campo ${campo} tipo ${t} no está en clases permitidas`;
        }
      }
    }

    for (const [salida, espec] of Object.entries(salidas)) {
      for (const [campo, subEspec] of Object.entries(espec.params)) {
        const t = subEspec.t;
        if (t) {
          const valida = clasesPermitidas.includes(t);
          expect(valida).toBe(true), `salida ${salida} campo ${campo} tipo ${t} no está en clases permitidas`;
        }
      }
    }
  });

  it("VERSION_VOCABULARIO es 1", () => {
    expect(VERSION_VOCABULARIO).toBe(1);
  });
});