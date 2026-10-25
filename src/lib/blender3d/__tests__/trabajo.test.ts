import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vocabulario from "../vocabulario.json";
import { estimarCoste, necesitaConfirmacion, validarTrabajo, VERSION_VOCABULARIO } from "../trabajo";
const base = () => ({
  v: 1, titulo: "Escena de prueba", calidad: "normal", ambito: "personal",
  origen: "protomolecula", quien: "agente",
  escena: [{ op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 }],
  salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 4, motor: "workbench" }],
});
const fallos = (t: unknown): string[] => { const r = validarTrabajo(t); return r.ok ? [] : r.motivos; };
const trabajoBase = () => { const r = validarTrabajo(base()); if (!r.ok) throw new Error(r.motivos.join("; ")); return r.trabajo; };

describe("trabajo 3D como dato", () => {
  it("acepta el mínimo y publica la versión del vocabulario", () => {
    expect(validarTrabajo(base())).toMatchObject({ ok: true });
    expect(VERSION_VOCABULARIO).toBe(1);
    expect(fallos({ v: 1 }).length).toBeGreaterThan(0);
  });
  it("rechaza campos y operaciones desconocidos", () => {
    expect(fallos({ ...base(), extra: 1 }).join(" ")).toContain("desconocido");
    const t = base();
    Object.assign(t.escena[0], { otro: 1 });
    expect(fallos(t).join(" ")).toContain("desconocido");
    expect(fallos({ ...base(), escena: [{ op: "rm_rf" }] }).join(" ")).toContain("desconocida");
  });
  it("rechaza NaN e Infinity", () => {
    const t = base();
    Object.assign(t.escena[0], { tam: NaN });
    expect(fallos(t).join(" ")).toContain("finito");
    const u = base();
    Object.assign(u.salidas[0], { ancho: Infinity });
    expect(fallos(u).join(" ")).toContain("finito");
  });
  it("rechaza más operaciones que el tope y más de cuatro salidas", () => {
    const escena = Array.from({ length: 257 }, (_, i) => ({ op: "primitiva", tipo: "cubo", nombre: `C${i}`, tam: 1 }));
    expect(fallos({ ...base(), escena }).join(" ")).toContain("256");
    const salidas = Array.from({ length: 5 }, () => base().salidas[0]);
    expect(fallos({ ...base(), salidas }).join(" ")).toContain("1 a 4");
  });
  it("rechaza nombres repetidos y referencias inexistentes", () => {
    const escena = [{ op: "primitiva", tipo: "cubo", nombre: "A", tam: 1 }, { op: "primitiva", tipo: "cubo", nombre: "A", tam: 1 }];
    expect(fallos({ ...base(), escena }).join(" ")).toContain("repetido");
    expect(fallos({ ...base(), escena: [{ op: "transformar", objeto: "Fantasma", ubicacion: [0, 0, 0] }] }).join(" ")).toContain("referencia");
  });
  it("rechaza rutas con .., absolutas o de programa", () => {
    for (const archivo of ["../malo.glb", "/absoluto.glb", "modelo.blend", "script.py"]) {
      const escena = [{ op: "importar", archivo, nombre: "Importado" }];
      expect(fallos({ ...base(), escena }).length).toBeGreaterThan(0);
    }
  });
  it("rechaza remallar con su motivo", () => {
    const motivos = fallos({ ...base(), escena: [{ op: "remallar", objeto: "Cubo", modo: "voxel", caras: 1000 }] }).join(" ");
    expect(motivos).toContain("próximamente");
    expect(motivos).toContain("taller-3d");
  });
  it("no deja pasar inyección en nombre y conserva el texto válido como dato", () => {
    expect(fallos({ ...base(), escena: [{ op: "primitiva", tipo: "cubo", nombre: '"); import os', tam: 1 }] }).length).toBeGreaterThan(0);
    expect(fallos({ ...base(), escena: [{ op: "texto3d", nombre: "T", texto: "a\nimport os", extrusion: 0, tam: 1 }] }).length).toBeGreaterThan(0);
    expect(validarTrabajo({ ...base(), escena: [{ op: "texto3d", nombre: "T", texto: "ñandú, ¡sí!", extrusion: 0, tam: 1 }] })).toMatchObject({ ok: true });
  });
  it("acepta una escena con todas las operaciones y salidas del vocabulario", () => {
    const escena = [
      { op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 },
      { op: "primitiva", tipo: "esfera", nombre: "Esfera", tam: 2, segmentos: 32 },
      { op: "transformar", objeto: "Cubo", ubicacion: [0, 0, 0] },
      { op: "material", objeto: "Cubo", color: [1, 0, 0, 1], metalico: 0.5, rugosidad: 0.5, emision_color: [0, 0, 0, 1], emision_fuerza: 0, alfa: 1 },
      { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 2 },
      { op: "texto3d", nombre: "Titulo", texto: "¡Hola, ñandú!", extrusion: 0.1, tam: 1 },
      { op: "camara", nombre: "Camara", ubicacion: [0, -5, 2], mira_a: [0, 0, 0], lente_mm: 50, ortografica: false },
      { op: "luz", nombre: "Sol", tipo: "sol", color: [1, 1, 1, 1], energia: 3, ubicacion: [0, 0, 10], rotacion: [0, 0, 0] },
      { op: "mundo", color: [0.1, 0.1, 0.1, 1], fuerza: 1, hdri: "cielo.hdr" },
      { op: "importar", archivo: "modelo.glb", nombre: "Importado" },
      { op: "animar", objeto: "Cubo", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 24, valor: [1, 0, 0] }], interpolacion: "suave" },
    ];
    const salidas = [
      { tipo: "render_png", ancho: 64, alto: 64, muestras: 4, motor: "workbench", fondo_transparente: true },
      { tipo: "render_mp4", ancho: 64, alto: 64, fps: 24, desde: 0, hasta: 24, muestras: 4, motor: "cycles-cpu" },
      { tipo: "render_exr", ancho: 64, alto: 64, muestras: 4, motor: "cycles-gpu" },
      { tipo: "exportar_glb", objetos: ["Cubo", "Esfera"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
    ];
    const r = validarTrabajo({ ...base(), escena, salidas });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trabajo.salidas).toHaveLength(4);
  });
  it("estima vértices y segundos de forma pura", () => {
    const escena = [{ op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 1 }, { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 2 }];
    const t = trabajoBase();
    const conModificador = { ...t, escena, salidas: [{ tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "cycles-cpu" }] };
    expect(estimarCoste(conModificador)).toEqual({ vertices: 128, segundos: 3.5 });
    const video = estimarCoste({ ...t, salidas: [{ tipo: "render_mp4", ancho: 100, alto: 100, fps: 24, desde: 1, hasta: 10, muestras: 2, motor: "workbench" }] });
    expect(video.segundos).toBeCloseTo(0.5, 5);
  });
  it("pide confirmación según ámbito, calidad, importar, perfil y coste", () => {
    const t = trabajoBase();
    expect(necesitaConfirmacion(t, "estandar")).toBe(false);
    expect(necesitaConfirmacion({ ...t, ambito: "grupo" }, "estandar")).toBe(true);
    expect(necesitaConfirmacion({ ...t, calidad: "final" }, "estudio")).toBe(true);
    expect(necesitaConfirmacion({ ...t, escena: [...t.escena, { op: "importar", archivo: "a.glb", nombre: "Imp" }] }, "estandar")).toBe(true);
    expect(necesitaConfirmacion(t, "ninguno")).toBe(true);
    const pesado = { ...t, salidas: [{ tipo: "render_png", ancho: 4096, alto: 4096, muestras: 1024, motor: "cycles-cpu" }] };
    expect(necesitaConfirmacion(pesado, "ligero")).toBe(true);
  });
  it("el módulo no usa Node, eval ni red", () => {
    const src = readFileSync(new URL("../trabajo.ts", import.meta.url), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch("]) expect(src).not.toContain(prohibido);
  });
  it("todas las especificaciones del JSON son de clases permitidas", () => {
    type Esp = { t: string; de?: Esp; campos?: Record<string, Esp> };
    const permitidas = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    const clases = new Set<string>();
    const recorrer = (e: Esp): void => { clases.add(e.t); if (e.de) recorrer(e.de); if (e.campos) Object.values(e.campos).forEach(recorrer); };
    const voc = vocabulario as unknown as { operaciones: Record<string, { params: Record<string, Esp> }>; salidas: Record<string, { params: Record<string, Esp> }> };
    for (const def of [...Object.values(voc.operaciones), ...Object.values(voc.salidas)]) Object.values(def.params).forEach(recorrer);
    expect([...clases].sort()).toEqual([...permitidas].sort());
  });
});
