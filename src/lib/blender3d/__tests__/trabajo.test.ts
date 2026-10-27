import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vocabulario from "../vocabulario.json";
import { VERSION_VOCABULARIO, estimarCoste, necesitaConfirmacion, validarTrabajo } from "../trabajo";

const trabajo = (escena: unknown, salidas: unknown, extra: Record<string, unknown> = {}) => ({ v: 1, titulo: "prueba", calidad: "normal", ambito: "personal", origen: "estudio", quien: "persona", ...extra, escena, salidas });
const mal = (bruto: unknown, trozo: string) => { const r = validarTrabajo(bruto); expect(r.ok).toBe(false); if (!r.ok) expect(r.motivos.join(" · ")).toContain(trozo); };
const bien = (bruto: unknown) => { const r = validarTrabajo(bruto); if (!r.ok) throw new Error(`tenía que ser válido: ${r.motivos.join(" · ")}`); return r.trabajo; };
const cubo = { op: "primitiva", tipo: "cubo", nombre: "Cubo" };
const minimo = [cubo, { op: "camara", nombre: "Camara", ubicacion: [0, -5, 0], mira_a: [0, 0, 0] }, { op: "luz", nombre: "Luz", tipo: "sol" }];
const png = [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench" }];
describe("trabajo 3D como dato", () => {
  it("acepta el trabajo mínimo y rellena los valores por omisión", () => {
    const t = bien(trabajo(minimo, png));
    expect(t.escena[0].tam).toBe(1);
    expect(t.escena[2].energia).toBe(1000);
    expect(t.escena[2].ubicacion).toEqual([4, -4, 3]);
    expect(t.salidas[0].fondo_transparente).toBe(false);
    expect(VERSION_VOCABULARIO).toBe(1);
  });
  it("rechaza campos desconocidos: operación, salida, parámetro y trabajo (nunca en silencio)", () => {
    mal(trabajo([{ op: "nuclear" }], png), "es desconocido"); mal(trabajo([{ tipo: "render_webp", ancho: 64, alto: 64 }], png), "es desconocido");
    mal(trabajo([{ op: "primitiva", tipo: "cubo", nombre: "Cubo", color: 1 }], png), "color: campo desconocido");
    mal(trabajo(minimo, [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench", tinte: "rojo" }]), "tinte: campo desconocido");
    mal(trabajo(minimo, png, { v: 2 }), "versión"); mal(trabajo(minimo, png, { peso: 1 }), "peso: campo desconocido");
  });
  it("rechaza NaN e Infinity, enteros donde toca y vectores cortos", () => {
    mal(trabajo([{ op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: Number.NaN }], png), "número finito");
    mal(trabajo(minimo, [{ tipo: "render_png", ancho: 64, alto: 64, muestras: Number.POSITIVE_INFINITY, motor: "workbench" }]), "número finito");
    mal(trabajo([cubo, { op: "animar", objeto: "Cubo", propiedad: "escala", claves: [{ fotograma: 1.5, valor: [1, 1, 1] }] }], png), "número entero");
    mal(trabajo([cubo, { op: "transformar", objeto: "Cubo", ubicacion: [1, 2] }], png), "lista de 3 números");
  });
  it("rechaza escenas de más de 256 operaciones, nombres repetidos y referencias a lo que no existe", () => {
    mal(trabajo([cubo, ...Array.from({ length: 256 }, () => ({ op: "transformar", objeto: "Cubo" }))], png), "256 operaciones como mucho");
    mal(trabajo([cubo, { op: "primitiva", tipo: "cubo", nombre: "Cubo" }], png), "ya existe");
    mal(trabajo([{ op: "transformar", objeto: "Nadie" }], png), "no existe todavía");
  });
  it("rechaza rutas travesías («..», absolutas, .blend, .py) y el remallar con su motivo", () => {
    const importar = (archivo: string) => [{ op: "importar", nombre: "Piezas", archivo }];
    mal(trabajo(importar("../secreto.glb"), png), "ruta");
    mal(trabajo(importar("a/../b.glb"), png), "ruta");
    mal(trabajo(importar("/etc/modelo.glb"), png), "ruta");
    mal(trabajo(importar("modelos/cosa.blend"), png), "extensión");
    mal(trabajo(importar("guion.py"), png), "extensión");
    mal(trabajo([...minimo, { op: "remallar" }], png), "taller-3d");
  });
  it("los textos de inyección se rechazan (nombre y texto); con tildes y ñ permitidas quedan como dato", () => {
    for (const malicioso of ["\"); import os", "capa\nroja", "café"]) mal(trabajo([{ op: "primitiva", tipo: "cubo", nombre: malicioso }], png), "nombre no válido");
    for (const malicioso of ["\"); import os", "capa\nroja"]) mal(trabajo([{ op: "texto3d", nombre: "Texto", texto: malicioso }], png), "patrón");
    const t = bien(trabajo([
      { op: "texto3d", nombre: "Saludo", texto: "¡Hola ñ Sr. Güey: a(1)+b-2!" }, { op: "texto3d", nombre: "Cafe", texto: "café con ñ" },
    ], png));
    expect(t.escena[0].texto).toContain("ñ");
    expect(t.escena[1].texto).toContain("é");
  });
  it("cada operación «listo» y cada salida admiten un caso válido", () => {
    const escena = [
      { op: "primitiva", tipo: "esfera", nombre: "Esfera", tam: 2, segmentos: 24 },
      { op: "transformar", objeto: "Esfera", ubicacion: [1, 2, 3], rotacion: [0, 45, 90], escala: [1, 2, 1] },
      { op: "material", objeto: "Esfera", color: [1, 0, 0, 1], metalico: 0.5, rugosidad: 0.2, emision_color: [0, 0, 0.2, 1], emision_fuerza: 5, alfa: 0.9 },
      { op: "modificador", objeto: "Esfera", tipo: "bisel", ancho: 0.05, cantidad: 3, relacion: 0.75, espesor: -0.01, desplazamiento: [0, 0, 1] },
      { op: "texto3d", nombre: "Rotulo", texto: "StarSeed ¡3D (v1)?" },
      { op: "camara", nombre: "Camara2", ubicacion: [0, -5, 0], mira_a: [0, 0, 0], lente_mm: 35, ortografica: true },
      { op: "luz", nombre: "Luz2", tipo: "foco", color: [1, 1, 0.9, 1], energia: 800, ubicacion: [2, -2, 4], rotacion: [0, 0, 0] },
      { op: "mundo", color: [0.05, 0.05, 0.1, 1], fuerza: 1, hdri: "fondos/noche.hdr" },
      { op: "importar", nombre: "Piezas", archivo: "entradas/piezas.obj" },
      { op: "animar", objeto: "Esfera", propiedad: "ubicacion", claves: [{ fotograma: 1, valor: [0, 0, 0] }, { fotograma: 10, valor: [1, 2, 3] }], interpolacion: "lineal" },
    ];
    const salidas = [
      { tipo: "render_png", ancho: 64, alto: 64, muestras: 8, motor: "workbench", fondo_transparente: true },
      { tipo: "render_mp4", ancho: 64, alto: 64, fps: 10, desde: 0, hasta: 9, muestras: 2, motor: "workbench" },
      { tipo: "render_exr", ancho: 32, alto: 32, muestras: 4, motor: "cycles-cpu" },
      { tipo: "exportar_glb", objetos: ["Esfera", "Piezas"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
    ];
    const t = bien(trabajo(escena, salidas));
    const listas = Object.entries(vocabulario.operaciones).filter(([, d]) => d.estado === "listo").map(([k]) => k);
    expect(t.escena.map((x) => x.op)).toEqual(listas);
    expect(t.salidas.map((x) => x.tipo)).toEqual(Object.keys(vocabulario.salidas));
    expect(t.salidas[3].objetos).toEqual(["Esfera", "Piezas"]);
    expect(t.escena[9].interpolacion).toBe("lineal");
  });
  it("estimarCoste: vértices con subdivisión y segundos por motor; tope de 30 min", () => {
    const escena = [cubo, { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 2 }];
    const c = estimarCoste(bien(trabajo(escena, [{ tipo: "render_png", ancho: 16, alto: 16, muestras: 1, motor: "workbench" }])));
    expect(c.vertices).toBe(128);
    expect(c.segundos).toBeCloseTo(256 / 200000, 10);
    mal(trabajo(escena, [{ tipo: "render_png", ancho: 4096, alto: 4096, muestras: 1024, motor: "eevee" }]), "segundos estimados");
  });
  it("necesitaConfirmacion pide mano humana donde toca", () => {
    const t = bien(trabajo(minimo, png));
    expect(necesitaConfirmacion(t, "estandar")).toBe(false);
    expect(necesitaConfirmacion(t, "ligero")).toBe(false);
    for (const [campo, valor] of [["ambito", "grupo"], ["ambito", "publica"], ["calidad", "final"]] as const) {
      expect(necesitaConfirmacion(bien(trabajo(minimo, png, { [campo]: valor })), "estandar")).toBe(true);
    }
    const conImportar = bien(trabajo([{ op: "importar", nombre: "Piezas", archivo: "entradas/x.stl" }], png));
    const pesada = bien(trabajo(minimo, [{ tipo: "render_mp4", ancho: 640, alto: 480, fps: 20, desde: 0, hasta: 39, muestras: 16, motor: "workbench" }]));
    expect(necesitaConfirmacion(conImportar, "estandar")).toBe(true);
    expect(necesitaConfirmacion(pesada, "ligero")).toBe(true);
  });
  it("guardia de pureza del módulo y clases cerradas del vocabulario", () => {
    const codigo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../trabajo.ts"), "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch(", "require(", "process."]) expect(codigo).not.toContain(prohibido);
    const clases = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    const halladas: string[] = [];
    const recogen = (e: Record<string, unknown>) => {
      if (typeof e.t !== "string") throw new Error(`espec sin clase: ${JSON.stringify(e)}`);
      halladas.push(e.t);
      if (e.de) recogen(e.de as Record<string, unknown>);
      if (e.campos) Object.values(e.campos).forEach((x) => recogen(x as Record<string, unknown>));
    };
    [...Object.values(vocabulario.operaciones), ...Object.values(vocabulario.salidas)].forEach((d) => Object.values(d.params).forEach((e) => recogen(e as Record<string, unknown>)));
    expect(halladas.filter((x) => !clases.includes(x))).toEqual([]);
    expect(Object.keys(vocabulario.operaciones)).toContain("remallar");
    expect(Object.values(vocabulario.operaciones).some((d) => d.estado === "proximamente")).toBe(true);
  });
});
