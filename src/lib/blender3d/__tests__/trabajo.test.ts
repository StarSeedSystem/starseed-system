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

describe("casos rescatados de la rama de la nube", () => {
  it("aplica los valores por defecto de cámara, material, transformar y salida", () => {
    const t = valido(base());
    expect(t.escena[1].lente_mm).toBe(50);
    expect(t.escena[1].ortografica).toBe(false);
    expect(t.salidas[0].fondo_transparente).toBe(false);
    expect(t.limites).toBeUndefined();
    const con = valido(conEscena([
      { op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 },
      { op: "material", objeto: "c" }, { op: "transformar", objeto: "c" },
    ]));
    expect(con.escena[1].color).toEqual([0.8, 0.8, 0.8, 1]);
    expect(con.escena[2].escala).toEqual([1, 1, 1]);
  });
  it("comprueba versión, título y límites", () => {
    expect(VERSION_VOCABULARIO).toBe(vocabulario.version);
    expect(motivos({ ...base(), v: 2 })).toEqual(["v debe ser 1"]);
    for (const titulo of ["   ", "x".repeat(81), 12]) expect(motivos({ ...base(), titulo }).join(" ")).toContain("titulo");
    expect(valido({ ...base(), limites: { segundos: 300, memoriaMB: 2048 } }).limites).toEqual({ segundos: 300, memoriaMB: 2048 });
    for (const limites of [{ segundos: 2000 }, { segundos: -1 }]) expect(motivos({ ...base(), limites }).join(" ")).toContain("limites");
  });
  it("rechaza NaN en rgba, alfa fuera de rango y medidas no enteras", () => {
    const con = (op: unknown): string => motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, op])).join(" ");
    expect(con({ op: "material", objeto: "c", color: [1, Number.NaN, 0.5, 1] })).toContain("rgba");
    expect(con({ op: "material", objeto: "c", alfa: 2 })).toContain("número en rango");
    expect(motivos({ ...base(), salidas: [{ tipo: "render_png", ancho: 512.5, alto: 256, muestras: 8, motor: "workbench" }] }).join(" ")).toContain("entero");
  });
  it("impone los topes de salidas y rechaza operaciones y salidas desconocidas", () => {
    expect(motivos({ ...base(), salidas: [] }).join(" ")).toContain("entre 1 y 4");
    expect(motivos({ ...base(), salidas: Array.from({ length: 5 }, () => ({ tipo: "render_png", ancho: 16, alto: 16, muestras: 1, motor: "workbench" })) }).join(" ")).toContain("entre 1 y 4");
    expect(motivos(conEscena([{ op: "teleportar", nombre: "t" }])).join(" ")).toContain("operacion desconocida");
    expect(motivos({ ...base(), salidas: [{ tipo: "render_gif" }] }).join(" ")).toContain("salida desconocida");
  });
  it("acepta rutas con subcarpetas y todas las primitivas, modificadores y luces", () => {
    expect(valido(conEscena([{ op: "importar", archivo: "piezas/modelo.glb", nombre: "Modelo" }])).escena).toHaveLength(1);
    expect(valido(conEscena([{ op: "mundo", hdri: "fondos/amanecer.hdr", fuerza: 1 }])).escena).toHaveLength(1);
    for (const [i, tipo] of ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro", "plano", "circulo"].entries())
      expect(valido(conEscena([{ op: "primitiva", tipo, nombre: `p${i}`, tam: 1 }])).escena).toHaveLength(1);
    for (const tipo of ["subdivision", "bisel", "solidificar", "espejo", "matriz", "decimar", "malla_alambre"])
      expect(valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "modificador", objeto: "c", tipo }])).escena).toHaveLength(2);
    for (const [i, tipo] of ["sol", "punto", "foco", "area"].entries())
      expect(valido(conEscena([{ op: "luz", nombre: `l${i}`, tipo, energia: 10 }])).escena).toHaveLength(1);
  });
  it("rechaza nombres y textos con unicode ajeno o longitud fuera de la lista", () => {
    for (const nombre of ["Cuboño", "立立方方", "a".repeat(33), "2empieza", "Cubo\nrm -rf /"])
      expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre, tam: 1 }])).join(" ")).toContain("nombre");
    expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto: "Cubo\u2028 业", extrusion: 0.2, tam: 1 }])).join(" ")).toContain("texto");
    expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto: "x".repeat(65), extrusion: 0.2, tam: 1 }])).join(" ")).toContain("más largo de 64");
  });
  it("cuenta fotogramas del mp4 y primitivas; el GLB no cuesta segundos", () => {
    const mp4 = estimarCoste(valido(conEscena(base().escena as unknown[], [{ tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 60, muestras: 16, motor: "workbench" }])));
    expect(mp4.segundos).toBeCloseTo(214.162, 2);
    const glb = estimarCoste(valido(conEscena(
      [{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "primitiva", tipo: "plano", nombre: "s", tam: 10 }],
      [{ tipo: "exportar_glb" }],
    )));
    expect(glb.vertices).toBe(12);
    expect(glb.segundos).toBe(0);
  });
  it("el perfil ligero confirma por vértices y el estándar admite el mínimo", () => {
    expect(necesitaConfirmacion(valido(base()), "estandar")).toBe(false);
    const pesado = valido(conEscena([{ op: "primitiva", tipo: "toro", nombre: "c", tam: 1 }, { op: "modificador", objeto: "c", tipo: "subdivision", niveles: 4 }]));
    expect(estimarCoste(pesado).vertices).toBeGreaterThan(50000);
    expect(necesitaConfirmacion(pesado, "ligero")).toBe(true);
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
