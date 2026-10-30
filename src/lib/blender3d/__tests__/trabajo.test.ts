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
const CUBO = { op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 };
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
  it("aplica los valores por defecto de cámara, salida, escala y límites", () => {
    const t = valido(base());
    expect(t.escena[1]).toMatchObject({ lente_mm: 50, ortografica: false });
    expect(t.salidas[0]).toMatchObject({ fondo_transparente: false });
    expect(t.limites).toBeUndefined();
    expect(valido(conEscena([CUBO, { op: "transformar", objeto: "cubo" }])).escena[1].escala).toEqual([1, 1, 1]);
  });
  it("comprueba la versión, el título y los límites", () => {
    expect(VERSION_VOCABULARIO).toBe(vocabulario.version);
    expect(motivos({ ...base(), v: 2 }).join(" ")).toContain("v debe ser 1");
    for (const titulo of ["   ", "x".repeat(81), 12])
      expect(motivos({ ...base(), titulo }).join(" ")).toContain("titulo");
    const conLimites = valido({ ...base(), limites: { segundos: 300, memoriaMB: 2048 } });
    expect(conLimites.limites).toEqual({ segundos: 300, memoriaMB: 2048 });
    for (const limites of [{ segundos: 2000 }, { segundos: -1 }])
      expect(motivos({ ...base(), limites }).join(" ")).toContain("limites");
  });
  it("rechaza NaN en vectores, rgba fuera de rango y decimales donde toca entero", () => {
    expect(motivos(conEscena([CUBO, { op: "camara", nombre: "cam2", ubicacion: [Number.NaN, 0, 0], mira_a: [0, 0, 0] }])).join(" ")).toContain("vector de 3 números");
    expect(motivos(conEscena([CUBO, { op: "material", objeto: "cubo", color: [1, Number.NaN, 0.5, 1] }])).join(" ")).toContain("rgba");
    expect(motivos(conEscena([CUBO, { op: "material", objeto: "cubo", alfa: 2 }])).join(" ")).toContain("número");
    expect(motivos(conEscena(base().escena as unknown[], [{ ...PNG, ancho: 512.5 }])).join(" ")).toContain("entero");
  });
  it("imputa los topes duros de salidas y lo desconocido", () => {
    expect(motivos(conEscena(base().escena as unknown[], [])).join(" ")).toContain("entre 1 y 4");
    expect(motivos(conEscena(base().escena as unknown[], [PNG, PNG, PNG, PNG, PNG])).join(" ")).toContain("entre 1 y 4");
    expect(motivos(conEscena([{ op: "teleportar", nombre: "N" }])).join(" ")).toContain("operacion desconocida");
    expect(motivos(conEscena(base().escena as unknown[], [{ ...PNG, tipo: "render_gif" }])).join(" ")).toContain("salida desconocida");
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
  it("rechaza nombres con saltos de línea, unicode ajeno, largos o que empiezan por dígito", () => {
    for (const nombre of ["cubo\nrm -rf /", "Cuboño", "立立方方", "a".repeat(33), "2empieza"])
      expect(motivos(conEscena([{ ...CUBO, nombre }])).join(" ")).toContain("nombre");
  });
  it("acepta rutas relativas con subcarpetas y extensiones de la lista", () => {
    expect(valido(conEscena([{ op: "importar", archivo: "piezas/modelo.glb", nombre: "imp" }])).escena).toHaveLength(1);
    expect(valido(conEscena([CUBO, { op: "mundo", hdri: "fondos/amanecer.hdr", fuerza: 1 }])).escena).toHaveLength(2);
  });
  it("neutraliza textos de inyección en nombre y texto3d", () => {
    expect(motivos(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "\"); import os", tam: 1 }])).join(" ")).toContain("nombre inválido");
    for (const texto of ["hola\nimport os", "emoji 😈"]) expect(motivos(conEscena([{ op: "texto3d", nombre: "t", texto, extrusion: 0.1, tam: 1 }])).join(" ")).toContain("texto con caracteres no permitidos");
    expect(valido(conEscena([{ op: "texto3d", nombre: "t", texto: "'); import os", extrusion: 0.1, tam: 1 }])).escena[0].texto).toBe("'); import os");
  });
  it("un texto 3D válido queda como DATO (tildes, ñ y signos), nunca como código", () => {
    const datos = "¿Versión con ñ? ¡Sí! (n.1) 'cosas'";
    expect(valido(conEscena([{ op: "texto3d", nombre: "tx1", texto: datos, extrusion: 0.2, tam: 1.2 }])).escena[0].texto).toBe(datos);
  });
  it("rechaza textos 3D con unicode ajeno y de más de 64", () => {
    expect(motivos(conEscena([{ op: "texto3d", nombre: "tx1", texto: "Cubo\u2028 业", extrusion: 0.2, tam: 1.2 }])).join(" ")).toContain("texto con caracteres no permitidos");
    expect(motivos(conEscena([{ op: "texto3d", nombre: "tx1", texto: "x".repeat(65), extrusion: 0.2, tam: 1.2 }])).join(" ")).toContain("más largo de 64");
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
  it("imputa los valores por defecto de material y animar (la lista cerrada manda)", () => {
    const ops = valido(conEscena([
      CUBO,
      { op: "material", objeto: "cubo" },
      { op: "animar", objeto: "cubo", propiedad: "escala", claves: [{ fotograma: 0, valor: [1, 1, 1] }] },
    ] as unknown[])).escena;
    expect(ops[1].color).toEqual([0.8, 0.8, 0.8, 1]);
    expect(ops[1].metalico).toBe(0);
    expect(ops[1].rugosidad).toBe(0.5);
    expect(ops[1].alfa).toBe(1);
    expect(ops[2].interpolacion).toBe("lineal");
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
  it("enums y modificadores cubren sus opciones de la lista cerrada", () => {
    const primitivas = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro", "plano", "circulo"];
    for (const [i, tipo] of primitivas.entries())
      expect(valido(conEscena([{ op: "primitiva", tipo, nombre: `Obj${i}`, tam: 1 }])).escena).toHaveLength(1);
    const modificadores = ["subdivision", "bisel", "solidificar", "espejo", "matriz", "decimar", "malla_alambre"];
    for (const [i, tipo] of modificadores.entries())
      expect(valido(conEscena([CUBO, { op: "modificador", objeto: "cubo", tipo }])).escena).toHaveLength(2);
    const luces = ["sol", "punto", "foco", "area"];
    for (const [i, tipo] of luces.entries())
      expect(valido(conEscena([{ op: "luz", nombre: `L${i}`, tipo, energia: 10 }])).escena).toHaveLength(1);
  });
});

describe("estimarCoste y necesitaConfirmacion", () => {
  it("cuenta vértices con 4^niveles de subdivisión y segundos por motor", () => {
    const t = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }, { op: "modificador", objeto: "c", tipo: "subdivision", niveles: 2 }], [{ tipo: "render_png", ancho: 1000, alto: 1000, muestras: 100, motor: "cycles-cpu" }]));
    const c = estimarCoste(t);
    expect(c.vertices).toBe(8 + 8 * 15);
    expect(c.segundos).toBeCloseTo((1000 * 1000 * 100) / 120000, 2);
  });
  it("cuenta los vértices de todas las primitivas y el GLB no añade coste", () => {
    const cubos = estimarCoste(valido(conEscena([CUBO, { op: "primitiva", tipo: "plano", nombre: "suelo", tam: 10 }], [{ tipo: "exportar_glb", objetos: ["cubo", "suelo"] }])));
    expect(cubos.vertices).toBe(12);
    expect(cubos.segundos).toBe(0);
  });
  it("cuenta los fotogramas del mp4 con el motor elegido", () => {
    const mp4 = estimarCoste(valido(conEscena([CUBO], [{ tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 60, muestras: 16, motor: "workbench" }])));
    expect(mp4.segundos).toBeCloseTo(214.162, 2);
  });
  it("pide confirmación por ámbito, importar, final y coste sobre el perfil ligero", () => {
    expect(necesitaConfirmacion(valido(base()), "ligero")).toBe(false);
    expect(necesitaConfirmacion(valido(base()), "estandar")).toBe(false);
    expect(necesitaConfirmacion({ ...valido(base()), ambito: "grupo" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion({ ...valido(base()), ambito: "publica" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion({ ...valido(base()), calidad: "final" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion(valido(conEscena([{ op: "importar", archivo: "a.glb", nombre: "i" }])), "estudio")).toBe(true);
    expect(necesitaConfirmacion(valido(base()), "ninguno")).toBe(true);
    const pesado = valido(conEscena([{ op: "primitiva", tipo: "cubo", nombre: "c", tam: 1 }], [{ tipo: "render_png", ancho: 1600, alto: 900, muestras: 64, motor: "workbench" }]));
    expect(necesitaConfirmacion(pesado, "ligero")).toBe(true);
    expect(necesitaConfirmacion(pesado, "estandar")).toBe(false);
  });
  it("el perfil ligero pide confirmación cuando el coste en vértices pesa", () => {
    const escena = Array.from({ length: 105 }, (_, i) => ({ op: "primitiva", tipo: "esfera", nombre: `e${i}`, tam: 1 }));
    const t = estimarCoste(valido(conEscena(escena, [{ tipo: "exportar_glb" }])));
    expect(t.vertices).toBe(482 * 105);
    expect(t.segundos).toBe(0);
    expect(necesitaConfirmacion(valido(conEscena(escena, [{ tipo: "exportar_glb" }])), "ligero")).toBe(true);
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
