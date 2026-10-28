import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vocabulario from "../vocabulario.json";
import { VERSION_VOCABULARIO, estimarCoste, necesitaConfirmacion, validarTrabajo } from "../trabajo";
import type { Trabajo3D } from "../trabajo";

type Bruto = Record<string, unknown>;

const base = (): Bruto => ({
  v: 1, titulo: "Escena mínima", calidad: "borrador", ambito: "personal", origen: "estudio", quien: "persona",
  escena: [{ op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] }, { op: "luz", nombre: "sol", tipo: "sol", energia: 3 }],
  salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }],
});
const valido = (b: unknown): Trabajo3D => { const r = validarTrabajo(b); expect(r.ok).toBe(true); return (r as { ok: true; trabajo: Trabajo3D }).trabajo; };
const motivos = (b: unknown): string[] => { const r = validarTrabajo(b); expect(r.ok).toBe(false); return (r as { ok: false; motivos: string[] }).motivos; };
const conEscena = (escena: unknown[], salidas: unknown[] = base().salidas as unknown[]): Bruto => ({ ...base(), escena, salidas });

describe("validarTrabajo", () => {
  it("acepta el trabajo mínimo (cubo + cámara + luz + render_png)", () => {
    const t = valido(base());
    expect(t.v).toBe(VERSION_VOCABULARIO);
    expect(t.escena.map((o) => o.op)).toEqual(["primitiva", "camara", "luz"]);
  });
  it("rechaza campos desconocidos del trabajo y de una operación", () => {
    expect(motivos({ ...base(), extra: 1 }).join(" ")).toContain("campo desconocido en el trabajo: extra");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1, peligro: true }])).join(" ")).toContain("campo desconocido: peligro");
  });
  it("rechaza NaN, Infinity, números fuera de rango y vectores de longitud distinta", () => {
    for (const tam of [Number.NaN, Number.POSITIVE_INFINITY, 0]) expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam }])).join(" ")).toContain("número");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "transformar", objeto: "c", ubicacion: [1, 2] }])).join(" ")).toContain("vector de 3 números");
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
  it("rechaza remallar con su motivo de próximamente", () => {
    const m = motivos(conEscena([{ op: "remallar", objeto: "cubo" }])).join(" ");
    expect(m).toContain("próximamente");
    expect(m).toContain("servicios/taller-3d");
  });
  it("neutraliza textos de inyección en nombre y texto3d", () => {
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "\"); import os", tam: 1 }])).join(" ")).toContain("nombre inválido");
    for (const texto of ["hola\nimport os", "emoji 😈"]) expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto, extrusion: 0.1, tam: 1 }])).join(" ")).toContain("texto con caracteres no permitidos");
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
});

describe("estimarCoste y necesitaConfirmacion", () => {
  it("cuenta vértices con 4^niveles de subdivisión y segundos por motor", () => {
    const t = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "modificador", objeto: "c", tipo: "subdivision", niveles: 2 }], [{ tipo: "render_png", ancho: 1000, alto: 1000, muestras: 100, motor: "cycles-cpu" }]));
    const c = estimarCoste(t);
    expect(c.vertices).toBe(8 + 8 * 15);
    expect(c.segundos).toBeCloseTo((1000 * 1000 * 100) / 120000, 2);
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

describe("valores por defecto del vocabulario", () => {
  it("aplica los valores por defecto de cámara, material, transformar y salida", () => {
    const t = valido(base());
    expect(t.v).toBe(1);
    expect(t.escena).toHaveLength(3);
    expect(t.salidas).toHaveLength(1);
    expect(t.escena[1].lente_mm).toBe(50);
    expect(t.escena[1].ortografica).toBe(false);
    expect(t.salidas[0].fondo_transparente).toBe(false);
    expect(t.limites).toBeUndefined();
    const conMaterial = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "material", objeto: "c" }]));
    expect(conMaterial.escena[1].color).toEqual([0.8, 0.8, 0.8, 1]);
    expect(conMaterial.escena[1].rugosidad).toBe(0.5);
    const conTransformar = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "transformar", objeto: "c" }]));
    expect(conTransformar.escena[1].escala).toEqual([1, 1, 1]);
  });
});

describe("contrato de versión, título y límites", () => {
  it("fija la versión del vocabulario y valida título y límites", () => {
    expect(VERSION_VOCABULARIO).toBe(1);
    expect(VERSION_VOCABULARIO).toBe(vocabulario.version);
    expect(motivos({ ...base(), v: 2 }).join(" ")).toContain("v debe ser 1");
    expect(motivos({ ...base(), titulo: "   " }).join(" ")).toContain("titulo");
    expect(motivos({ ...base(), titulo: "x".repeat(81) }).join(" ")).toContain("titulo");
    expect(motivos({ ...base(), titulo: 12 }).join(" ")).toContain("titulo");
    const conLimites = valido({ ...base(), limites: { segundos: 300, memoriaMB: 2048 } });
    expect(conLimites.limites).toEqual({ segundos: 300, memoriaMB: 2048 });
    expect(motivos({ ...base(), limites: { segundos: 2000 } }).join(" ")).toContain("limites");
    expect(motivos({ ...base(), limites: { segundos: -1 } }).join(" ")).toContain("limites");
  });
});

describe("números, topes y referencias", () => {
  it("rechaza NaN, Infinity, valores fuera de rango y no enteros donde toca", () => {
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: Number.NaN }])).join(" ")).toContain("número en rango");
    expect(motivos(conEscena([{ op: "luz", nombre: "l", tipo: "sol", energia: Number.POSITIVE_INFINITY }])).join(" ")).toContain("número en rango");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "camara", nombre: "cam", ubicacion: [Number.NaN, 0, 0], mira_a: [0, 0, 0] }])).join(" ")).toContain("vector de 3 números");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "material", objeto: "c", color: [1, Number.NaN, 0.5, 1] }])).join(" ")).toContain("rgba");
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "material", objeto: "c", alfa: 2 }])).join(" ")).toContain("número en rango");
    expect(motivos(conEscena(base().escena as unknown[], [{ tipo: "render_png", ancho: 512.5, alto: 256, muestras: 8, motor: "workbench" }])).join(" ")).toContain("entero");
  });

  it("valida el número de salidas y rechaza operaciones y salidas desconocidas", () => {
    expect(motivos(conEscena(base().escena as unknown[], [])).join(" ")).toContain("entre 1 y 4");
    const png = { tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" };
    expect(motivos(conEscena(base().escena as unknown[], [png, png, png, png, png])).join(" ")).toContain("entre 1 y 4");
    expect(motivos(conEscena([{ op: "teleportar", nombre: "N" }])).join(" ")).toContain("operacion desconocida");
    expect(motivos(conEscena(base().escena as unknown[], [{ ...png, tipo: "render_gif" }])).join(" ")).toContain("salida desconocida");
  });

  it("acepta rutas relativas con subcarpetas y extensiones permitidas", () => {
    expect(valido(conEscena([{ op: "importar", archivo: "piezas/modelo.glb", nombre: "Modelo" }])).escena).toHaveLength(1);
    expect(valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "mundo", hdri: "fondos/amanecer.hdr", fuerza: 1 }])).escena).toHaveLength(2);
  });
});

describe("nombres, textos y opciones cerradas", () => {
  it("rechaza nombres con inyección, saltos de línea, unicode ajeno o demasiado largos", () => {
    for (const nombre of ['"); import os', "Cubo\nrm -rf /", "Cuboño", "立立方方", "a".repeat(33), "2empieza"])
      expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre, tam: 1 }])).join(" ")).toContain("nombre");
  });

  it("rechaza textos 3D con comillas, saltos de línea, unicode ajeno o más de 64", () => {
    const textoMalo = (texto: string): string =>
      motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "texto3d", nombre: "Texto", texto, extrusion: 0.2, tam: 1.2 }])).join(" ");
    expect(textoMalo('"); import os')).toContain("texto");
    expect(textoMalo("línea uno\nlínea dos")).toContain("texto");
    expect(textoMalo("Cubo\u2028 业")).toContain("texto");
    expect(textoMalo("x".repeat(65))).toContain("más largo de 64");
  });

  it("recorre todas las opciones cerradas de primitivas, modificadores y luces", () => {
    const tipos = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro", "plano", "circulo"];
    for (const [i, tipo] of tipos.entries())
      expect(valido(conEscena([{ op: "primitiva", tipo, nombre: `Obj${i}`, tam: 1 }])).escena).toHaveLength(1);
    const modificadores = ["subdivision", "bisel", "solidificar", "espejo", "matriz", "decimar", "malla_alambre"];
    for (const tipo of modificadores)
      expect(valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 }, { op: "modificador", objeto: "Cubo", tipo }])).escena).toHaveLength(2);
    const luces = ["sol", "punto", "foco", "area"];
    for (const [i, tipo] of luces.entries())
      expect(valido(conEscena([{ op: "luz", nombre: `L${i}`, tipo, energia: 10 }])).escena).toHaveLength(1);
  });
});

describe("coste de fotogramas y confirmación por vértices", () => {
  it("cuenta los fotogramas del mp4 y no añade coste al GLB", () => {
    const mp4 = estimarCoste(valido(conEscena(base().escena as unknown[], [{ tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 60, muestras: 16, motor: "workbench" }])));
    expect(mp4.segundos).toBeCloseTo(214.162, 2);
    const glb = estimarCoste(valido(conEscena(base().escena as unknown[], [{ tipo: "exportar_glb" }])));
    expect(glb.segundos).toBe(0);
    expect(glb.vertices).toBe(8);
  });

  it("el perfil ligero pide confirmación si el coste en vértices pesa", () => {
    const pesado = valido(conEscena([
      { op: "primitiva", tipo: "esfera", nombre: "e", tam: 1 },
      { op: "modificador", objeto: "e", tipo: "subdivision", niveles: 4 },
    ], [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" }]));
    expect(estimarCoste(pesado).vertices).toBe(482 * 4 ** 4);
    expect(necesitaConfirmacion(pesado, "ligero")).toBe(true);
    expect(necesitaConfirmacion(pesado, "estandar")).toBe(false);
    expect(necesitaConfirmacion(valido(base()), "estandar")).toBe(false);
  });
});
