import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vocabulario from "../vocabulario.json";
import { validarTrabajo, estimarCoste, necesitaConfirmacion, VERSION_VOCABULARIO, type Trabajo3D } from "../trabajo";
const cubo = { op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 };
const camara = { op: "camara", nombre: "Camara", ubicacion: [0, 0, 5], mira_a: [0, 0, 0] };
const luz = { op: "luz", nombre: "Luz", tipo: "sol", energia: 1000 };
const png = { tipo: "render_png", ancho: 64, alto: 64, muestras: 1, motor: "workbench" };
const base = (extra: Partial<Trabajo3D> = {}): Trabajo3D => ({ v: 1, titulo: "Prueba", calidad: "normal", ambito: "personal", origen: "api", quien: "agente", escena: [cubo, camara, luz], salidas: [png], ...extra });
const valido = (bruto: unknown): Trabajo3D => { const r = validarTrabajo(bruto); if (!r.ok) throw new Error(r.motivos.join(" | ")); return r.trabajo; };
describe("trabajo 3D", () => {
  it("acepta el trabajo mínimo válido", () => {
    const t = valido(base());
    expect(t.escena).toHaveLength(3);
    expect(t.salidas[0].tipo).toBe("render_png");
    expect(VERSION_VOCABULARIO).toBe(1);
  });
  it("rechaza campos desconocidos, también dentro de una operación", () => {
    expect(validarTrabajo({ ...base(), veneno: 1 }).ok).toBe(false);
    const r = validarTrabajo({ ...base(), escena: [{ ...cubo, veneno: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toContain("Campo desconocido");
  });
  it("rechaza NaN e Infinity", () => {
    for (const tam of [NaN, Infinity]) expect(validarTrabajo({ ...base(), escena: [{ ...cubo, tam }] }).ok).toBe(false);
    expect(validarTrabajo({ ...base(), escena: [{ ...cubo, tam: -1 }] }).ok).toBe(false);
  });
  it("rechaza más de 256 operaciones", () => {
    const escena = Array.from({ length: 257 }, (_, i) => ({ op: "primitiva", tipo: "cubo", nombre: `C${i}`, tam: 1 }));
    expect(validarTrabajo({ ...base(), escena }).ok).toBe(false);
  });

  it("rechaza nombres repetidos y referencias a objetos inexistentes", () => {
    expect(validarTrabajo({ ...base(), escena: [cubo, { ...cubo }] }).ok).toBe(false);
    const r = validarTrabajo({ ...base(), escena: [{ op: "transformar", objeto: "Fantasma", ubicacion: [0, 0, 0] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toContain("no existe");
  });

  it("rechaza rutas con «..», absolutas y extensiones .blend o .py", () => {
    for (const archivo of ["../x.glb", "/x.glb", "x.blend", "x.py"]) {
      expect(validarTrabajo({ ...base(), escena: [{ op: "importar", archivo, nombre: "Modelo" }] }).ok).toBe(false);
    }
    expect(valido(base({ escena: [{ op: "importar", archivo: "entradas/modelo.glb", nombre: "Modelo" }] })).escena[0].nombre).toBe("Modelo");
  });

  it("rechaza remallar con su motivo de próximamente", () => {
    const r = validarTrabajo({ ...base(), escena: [{ op: "remallar" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toContain("servicios/taller-3d");
  });

  it("trata la inyección como dato o la rechaza, y admite unicode", () => {
    const inyectado = '"); import os';
    expect(validarTrabajo({ ...base(), escena: [{ ...cubo, nombre: inyectado }] }).ok).toBe(false);
    const r = validarTrabajo({ ...base(), escena: [{ op: "texto3d", nombre: "Texto", texto: inyectado, extrusion: 0, tam: 1 }] });
    if (r.ok) expect(r.trabajo.escena[0].texto).toBe(inyectado); else expect(r.motivos.join(" ")).toContain("Texto inválido");
    expect(validarTrabajo({ ...base(), escena: [{ op: "texto3d", nombre: "Texto", texto: "a\nb", extrusion: 0, tam: 1 }] }).ok).toBe(false);
    expect(valido(base({ escena: [{ op: "texto3d", nombre: "Texto", texto: "Cañón ¡sí! 42", extrusion: 0, tam: 1 }] })).escena[0].texto).toBe("Cañón ¡sí! 42");
  });

  it("acepta un caso válido por cada operación y salida del vocabulario", () => {
    const escena = [cubo,
      { op: "transformar", objeto: "Cubo", ubicacion: [0, 0, 0], rotacion: [0, 0, 0], escala: [1, 1, 1] },
      { op: "material", objeto: "Cubo", color: [1, 0, 0, 1], metalico: 0.2, rugosidad: 0.5, alfa: 1 },
      { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 1 },
      { op: "texto3d", nombre: "Texto", texto: "Hola, ñ 42!", extrusion: 0.1, tam: 1 },
      camara, luz, { op: "mundo", color: [0.1, 0.2, 0.3, 1], fuerza: 1 },
      { op: "importar", archivo: "entradas/modelo.glb", nombre: "Modelo" },
      { op: "animar", objeto: "Cubo", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 10, valor: [3, 0, 0] }], interpolacion: "suave" }];
    const salidas = [png,
      { tipo: "render_mp4", ancho: 64, alto: 64, fps: 24, desde: 0, hasta: 10, muestras: 1, motor: "workbench" },
      { tipo: "render_exr", ancho: 64, alto: 64, muestras: 1, motor: "workbench" },
      { tipo: "exportar_glb", objetos: ["Cubo"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false }];
    expect(valido(base({ escena, salidas })).salidas).toHaveLength(4);
  });

  it("estima vértices y segundos de forma pura", () => {
    const t = valido(base({ escena: [cubo, { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 2 }], salidas: [{ ...png, ancho: 100, alto: 100, muestras: 10 }] }));
    const c = estimarCoste(t);
    expect(c.vertices).toBe(128);
    expect(c.segundos).toBeGreaterThan(0);
    const mp4 = estimarCoste(valido(base({ salidas: [{ tipo: "render_mp4", ancho: 100, alto: 100, fps: 24, desde: 0, hasta: 9, muestras: 10, motor: "workbench" }] })));
    expect(mp4.segundos).toBeCloseTo(c.segundos * 10, 9);
  });

  it("decide cuándo hace falta confirmación", () => {
    expect(necesitaConfirmacion(base(), "ligero")).toBe(false);
    expect(necesitaConfirmacion(base({ ambito: "grupo" }), "estudio")).toBe(true);
    expect(necesitaConfirmacion(base({ ambito: "publica" }), "estudio")).toBe(true);
    expect(necesitaConfirmacion(base({ calidad: "final" }), "estudio")).toBe(true);
    expect(necesitaConfirmacion(base({ escena: [{ op: "importar", archivo: "x.glb", nombre: "M" }] }), "estudio")).toBe(true);
    expect(necesitaConfirmacion(base({ salidas: [{ ...png, ancho: 1920, alto: 1080, muestras: 256 }] }), "ligero")).toBe(true);
    expect(necesitaConfirmacion(base({ salidas: [{ ...png, ancho: 1920, alto: 1080, muestras: 256 }] }), "estudio")).toBe(false);
    expect(necesitaConfirmacion(base(), "ninguno")).toBe(true);
  });

  it("el núcleo es puro: sin Node, red ni evaluación dinámica", () => {
    const src = readFileSync(new URL("../trabajo.ts", import.meta.url), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch("]) expect(src.includes(prohibido)).toBe(false);
  });

  it("todas las especificaciones del JSON son de las clases permitidas", () => {
    type Esp = { t?: string; de?: Esp; campos?: Record<string, Esp> };
    const clases = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    const malas = (e: Esp, ruta: string, fuera: string[]) => {
      if (!e.t || !clases.includes(e.t)) fuera.push(ruta);
      if (e.de) malas(e.de, `${ruta}.de`, fuera);
      if (e.campos) for (const [k, v] of Object.entries(e.campos)) malas(v, `${ruta}.${k}`, fuera);
    };
    const v = vocabulario as unknown as { operaciones: Record<string, { estado: string; params: Record<string, Esp> }>; salidas: Record<string, { params: Record<string, Esp> }> };
    const fuera: string[] = [];
    for (const [op, def] of Object.entries(v.operaciones)) {
      expect(["listo", "proximamente"]).toContain(def.estado);
      for (const [k, e] of Object.entries(def.params)) malas(e, `${op}.${k}`, fuera);
    }
    for (const [tipo, def] of Object.entries(v.salidas)) for (const [k, e] of Object.entries(def.params)) malas(e, `${tipo}.${k}`, fuera);
    expect(fuera).toEqual([]);
  });
});
