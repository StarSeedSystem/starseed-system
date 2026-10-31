import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vocabulario from "../vocabulario.json";
import { VERSION_VOCABULARIO, estimarCoste, necesitaConfirmacion, validarTrabajo } from "../trabajo";
import type { Trabajo3D } from "../trabajo";

type Bruto = Record<string, unknown>;

const base = (extra: Bruto = {}): Bruto => ({
  v: 1, titulo: "Escena mínima", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
  escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] }, { op: "luz", nombre: "sol", tipo: "sol", energia: 3 }],
  salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }],
  ...extra,
});
const CUBO = { op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 };
const PNG = { tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" };
const valido = (b: unknown): Trabajo3D => { const r = validarTrabajo(b); expect(r.ok).toBe(true); return (r as { ok: true; trabajo: Trabajo3D }).trabajo; };
const motivos = (b: unknown): string[] => { const r = validarTrabajo(b); expect(r.ok).toBe(false); return (r as { ok: false; motivos: string[] }).motivos; };
const conEscena = (escena: unknown[], salidas: unknown[] = base().salidas as unknown[]): Bruto => ({ ...base(), escena, salidas });

describe("validarTrabajo", () => {
  it("acepta el trabajo mínimo (cubo + cámara + luz + render_png)", () => {
    const t = valido(base());
    expect(t.v).toBe(VERSION_VOCABULARIO);
    expect(t.escena.map((o) => o.op)).toEqual(["primitiva", "camara", "luz"]);
  });
  it("aplica defaults de cámara y salida al trabajo válido", () => {
    const t = valido(base());
    expect(t.v).toBe(1);
    expect(t.titulo).toBe("Escena mínima");
    expect(t.escena).toHaveLength(3);
    expect(t.salidas).toHaveLength(1);
    expect(t.escena[1].lente_mm).toBe(50);
    expect(t.escena[1].ortografica).toBe(false);
    expect(t.salidas[0].fondo_transparente).toBe(false);
    expect(t.limites).toBeUndefined();
  });
  it("comprueba la versión, el título y los límites", () => {
    expect(VERSION_VOCABULARIO).toBe(1);
    expect(VERSION_VOCABULARIO).toBe(vocabulario.version);
    expect(motivos(base({ v: 2 })).join(" ")).toContain("v debe ser 1");
    expect(motivos(base({ titulo: "   " })).join(" ")).toContain("titulo");
    expect(motivos(base({ titulo: "x".repeat(81) })).join(" ")).toContain("titulo");
    expect(motivos(base({ titulo: 12 })).join(" ")).toContain("titulo");
    expect(valido(base({ limites: { segundos: 300, memoriaMB: 2048 } })).limites).toEqual({ segundos: 300, memoriaMB: 2048 });
    expect(motivos(base({ limites: { segundos: 2000 } })).join(" ")).toContain("limites");
    expect(motivos(base({ limites: { segundos: -1 } })).join(" ")).toContain("limites");
  });
  it("rechaza campos desconocidos del trabajo y de una operación", () => {
    expect(motivos({ ...base(), extra: 1 }).join(" ")).toContain("campo desconocido en el trabajo: extra");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1, peligro: true }])).join(" ")).toContain("campo desconocido: peligro");
  });
  it("rechaza NaN, Infinity, números fuera de rango y vectores de longitud distinta", () => {
    for (const tam of [Number.NaN, Number.POSITIVE_INFINITY, 0]) expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam }])).join(" ")).toContain("número");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "transformar", objeto: "c", ubicacion: [1, 2] }])).join(" ")).toContain("vector de 3 números");
  });
  it("rechaza NaN, Infinity, valores fuera de rango y enteros donde toca", () => {
    expect(motivos(base({ escena: [{ op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: Number.NaN }] })).join(" ")).toContain("número");
    expect(motivos(base({ escena: [{ op: "luz", nombre: "Sol", tipo: "sol", energia: Number.POSITIVE_INFINITY }] })).join(" ")).toContain("número");
    expect(motivos(base({ escena: [CUBO, { op: "camara", nombre: "cam", ubicacion: [Number.NaN, 0, 0], mira_a: [0, 0, 0] }] })).join(" ")).toContain("vector de 3 números");
    expect(motivos(base({ escena: [CUBO, { op: "material", objeto: "Cubo", color: [1, Number.NaN, 0.5, 1] }] })).join(" ")).toContain("rgba");
    expect(motivos(base({ escena: [CUBO, { op: "material", objeto: "Cubo", alfa: 2 }] })).join(" ")).toContain("número");
    expect(motivos(base({ salidas: [{ ...PNG, ancho: 512.5 }] })).join(" ")).toContain("entero");
  });
  it("rechaza las salidas fuera de rango y lo desconocido", () => {
    expect(motivos(base({ salidas: [] })).join(" ")).toContain("salidas debe tener entre 1 y 4 elementos");
    expect(motivos(base({ salidas: [PNG, PNG, PNG, PNG, PNG] })).join(" ")).toContain("salidas debe tener entre 1 y 4 elementos");
    expect(motivos(base({ escena: [{ op: "teleportar", nombre: "N" }] })).join(" ")).toContain("operacion desconocida");
    expect(motivos(base({ salidas: [{ ...PNG, tipo: "render_gif" }] })).join(" ")).toContain("salida desconocida");
  });
  it("una transformación con referencia válida aplica la escala por defecto", () => {
    expect(valido(base({ escena: [CUBO, { op: "transformar", objeto: "Cubo" }] })).escena[1].escala).toEqual([1, 1, 1]);
  });
  it("rechaza más de 256 operaciones", () => {
    const escena = Array.from({ length: 257 }, (_, i) => ({ op: "primitiva", tipo: "cubo", nombre: `c${i}`, tam: 1 }));
    expect(motivos(conEscena(escena)).join(" ")).toContain("demasiadas operaciones");
  });
  it("rechaza nombres repetidos y refs a objetos que no existen", () => {
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "a", tam: 1 }, { op: "primitiva", tipo: "esfera", nombre: "a", tam: 1 }])).join(" ")).toContain("repetido");
    expect(motivos(conEscena([{ op: "material", objeto: "fantasma" }])).join(" ")).toContain("referencia a un objeto que no existe");
  });
  it("rechaza rutas con .., absolutas, .blend y .py", () => {
    for (const archivo of ["a/../b.glb", "/tmp/a.glb", "modelo.blend", "script.py"])
      expect(motivos(conEscena([{ op: "importar", archivo, nombre: "imp" }])).join(" ")).toContain("ruta relativa inválida");
  });
  it("acepta rutas relativas con subcarpetas y extensiones de la lista", () => {
    expect(valido(base({ escena: [{ op: "importar", archivo: "piezas/modelo.glb", nombre: "Modelo" }] })).escena).toHaveLength(1);
    expect(valido(base({ escena: [CUBO, { op: "mundo", hdri: "fondos/amanecer.hdr", fuerza: 1 }] })).escena).toHaveLength(2);
  });
  it("rechaza remallar con su motivo de próximamente", () => {
    const m = motivos(conEscena([{ op: "remallar", objeto: "cubo" }])).join(" ");
    expect(m).toContain("próximamente");
    expect(m).toContain("servicios/taller-3d");
  });
  it("neutraliza textos de inyección en nombre y texto3d", () => {
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "\"); import os", tam: 1 }])).join(" ")).toContain("nombre inválido");
    expect(motivos(conEscena([{ ...CUBO, nombre: "Cubo\nrm -rf /" }])).join(" ")).toContain("nombre inválido");
    for (const texto of ["hola\nimport os", "emoji 😈", "línea uno\nlínea dos", "Cubo\u2028 业"]) expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto, extrusion: 0.1, tam: 1 }])).join(" ")).toContain("texto con caracteres no permitidos");
    expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto: "x".repeat(65), extrusion: 0.1, tam: 1 }])).join(" ")).toContain("texto más largo de 64");
    expect(valido(conEscena([{ op: "texto3d", nombre: "t", texto: "'); import os", extrusion: 0.1, tam: 1 }])).escena[0].texto).toBe("'); import os");
  });
  it("acepta una escena con todas las operaciones del vocabulario", () => {
    const escena = [
      { op: "primitiva", tipo: "cubo", nombre: "base", tam: 1 },
      { op: "transformar", objeto: "base", ubicacion: [1, 0, 0], rotacion: [0, 0, 45], escala: [1, 1, 1] },
      { op: "material", objeto: "base", color: [1, 0, 0, 1], metalico: 0.5, rugosidad: 0.3, emision_color: [0, 0, 0, 1], emision_fuerza: 0, alfa: 1 },
      { op: "modificador", objeto: "base", tipo: "subdivision", niveles: 2 },
      { op: "texto3d", nombre: "rotulo", texto: "Hola, ñandú!", extrusion: 0.2, tam: 1 },
      { op: "camara", nombre: "cam", ubicacion: [0, -6, 2], mira_a: [0, 0, 0], lente_mm: 35, ortografica: false },
      { op: "luz", nombre: "luz", tipo: "area", color: [1, 1, 1, 1], energia: 100, ubicacion: [0, 0, 5], rotacion: [0, 0, 0] },
      { op: "mundo", color: [0, 0, 0, 1], fuerza: 1 },
      { op: "importar", archivo: "modelo.glb", nombre: "importado" },
      { op: "animar", objeto: "base", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 24, valor: [1, 0, 0] }], interpolacion: "suave" },
    ];
    expect(valido(conEscena(escena)).escena).toHaveLength(10);
  });
  it("acepta las cuatro salidas del vocabulario", () => {
    const salidas = [
      { tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench", fondo_transparente: true },
      { tipo: "render_mp4", ancho: 256, alto: 256, fps: 24, desde: 0, hasta: 23, muestras: 8, motor: "cycles-cpu" },
      { tipo: "render_exr", ancho: 256, alto: 256, muestras: 8, motor: "eevee" },
      { tipo: "exportar_glb", objetos: ["cubo", "cam"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
    ];
    expect(valido(conEscena(base().escena as unknown[], salidas)).salidas).toHaveLength(4);
  });

  describe("enums y modificadores", () => {
    it("primitivas cubren todas sus opciones de la lista cerrada", () => {
      const tipos: string[] = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro", "plano", "circulo"];
      for (const [i, tipo] of tipos.entries()) {
        expect(valido(base({ escena: [{ op: "primitiva", tipo, nombre: `Obj${i}`, tam: 1 }] })).escena).toHaveLength(1);
      }
    });
    it("modificadores cubren todas sus opciones de la lista cerrada", () => {
      const modificadores: string[] = ["subdivision", "bisel", "solidificar", "espejo", "matriz", "decimar", "malla_alambre"];
      for (const tipo of modificadores) {
        expect(valido(base({ escena: [CUBO, { op: "modificador", objeto: "Cubo", tipo }] })).escena).toHaveLength(2);
      }
    });
    it("luces cubren todas sus opciones de la lista cerrada", () => {
      const luces: string[] = ["sol", "punto", "foco", "area"];
      for (const [i, tipo] of luces.entries()) {
        expect(valido(base({ escena: [{ op: "luz", nombre: `L${i}`, tipo, energia: 10 }] })).escena).toHaveLength(1);
      }
    });
  });
});

describe("estimarCoste y necesitaConfirmacion", () => {
  it("cuenta vértices con 4^niveles de subdivisión y segundos por motor", () => {
    const t = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "modificador", objeto: "c", tipo: "subdivision", niveles: 2 }], [{ tipo: "render_png", ancho: 1000, alto: 1000, muestras: 100, motor: "cycles-cpu" }]));
    const c = estimarCoste(t);
    expect(c.vertices).toBe(8 + 8 * 15);
    expect(c.segundos).toBeCloseTo((1000 * 1000 * 100) / 120000, 2);
  });
  it("cuenta los vértices de cada primitiva de la base (cubo 8, plano 4)", () => {
    expect(estimarCoste(valido(base({ escena: [CUBO, { op: "primitiva", tipo: "plano", nombre: "Suelo", tam: 10 }], salidas: [{ tipo: "exportar_glb" }] }))).vertices).toBe(12);
  });
  it("cuenta los fotogramas del mp4 y no añade coste en el GLB", () => {
    const mp4 = estimarCoste(valido(base({ escena: [CUBO], salidas: [{ tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 60, muestras: 16, motor: "workbench" }] })));
    expect(mp4.segundos).toBeCloseTo((320 * 240 * 16 * 61) / 350000, 2);
    const soloGlb = estimarCoste(valido(base({ escena: [CUBO], salidas: [{ tipo: "exportar_glb" }] })));
    expect(soloGlb.segundos).toBe(0);
    expect(soloGlb.vertices).toBe(8);
  });
  it("pide confirmación por ámbito, importar, final y coste sobre el perfil ligero", () => {
    expect(necesitaConfirmacion(valido(base()), "ligero")).toBe(false);
    expect(necesitaConfirmacion({ ...valido(base()), ambito: "grupo" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion({ ...valido(base()), ambito: "publica" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion({ ...valido(base()), calidad: "final" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion(valido(conEscena([{ op: "importar", archivo: "a.glb", nombre: "i" }])), "estudio")).toBe(true);
    expect(necesitaConfirmacion(valido(base()), "ninguno")).toBe(true);
    const pesado = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }], [{ tipo: "render_png", ancho: 1600, alto: 900, muestras: 64, motor: "workbench" }]));
    expect(necesitaConfirmacion(pesado, "ligero")).toBe(true);
    expect(necesitaConfirmacion(pesado, "estandar")).toBe(false);
    const muchosVértices = valido(base({ escena: [{ op: "primitiva", tipo: "esfera", nombre: "Esfera", tam: 1 }, { op: "modificador", objeto: "Esfera", tipo: "subdivision", niveles: 4 }], salidas: [{ tipo: "render_png", ancho: 128, alto: 128, muestras: 2, motor: "workbench" }] }));
    expect(necesitaConfirmacion(muchosVértices, "ligero")).toBe(true);
    expect(necesitaConfirmacion(muchosVértices, "estandar")).toBe(false);
  });
});

describe("pureza y vocabulario", () => {
  it("trabajo.ts no contiene node:, eval(, new Function ni fetch(", () => {
    const fuente = readFileSync(new URL("../trabajo.ts", import.meta.url), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch("]) expect(fuente).not.toContain(prohibido);
  });
  it("todas las especificaciones del JSON son de las clases permitidas", () => {
    const clases = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    const revisar = (e: { t: string; de?: unknown; campos?: Record<string, unknown> }): void => {
      expect(clases).toContain(e.t);
      if (e.de) revisar(e.de as { t: string });
      for (const campo of Object.values(e.campos ?? {})) revisar(campo as { t: string });
    };
    for (const def of [...Object.values(vocabulario.operaciones), ...Object.values(vocabulario.salidas)]) for (const espec of Object.values(def.params)) revisar(espec as { t: string });
  });
});
