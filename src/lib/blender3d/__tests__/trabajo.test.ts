import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { validarTrabajo, estimarCoste, necesitaConfirmacion, VERSION_VOCABULARIO, type Trabajo3D } from "../trabajo";
import vocab from "../vocabulario.json";

const fondo = () => JSON.parse(JSON.stringify({
  v: 1,
  titulo: "Prueba mínima",
  calidad: "normal",
  ambito: "personal",
  origen: "estudio",
  quien: "agente",
  escena: [
    { op: "primitiva", tipo: "cubo", nombre: "Bloque", tam: 1 },
    { op: "camara", nombre: "Ojo", ubicacion: [0, -5, 2], mira_a: [0, 0, 0] },
    { op: "luz", nombre: "Sol", tipo: "sol", energia: 1000 },
  ],
  salidas: [{ tipo: "render_png", ancho: 320, alto: 240, muestras: 16, motor: "workbench" }],
})) as Record<string, unknown>;

const bien = () => expect(validarTrabajo(fondo())).toEqual({ ok: true, trabajo: fondo() });
const bienTodo = (t: unknown) => {
  const r = validarTrabajo(t);
  if (!r.ok) throw new Error(`motivos: ${r.motivos.join(" · ")}`);
};
const ESC = (t: Record<string, unknown>) => (t.escena as unknown as Record<string, unknown>[]);
const SAL = (t: Record<string, unknown>) => (t.salidas as unknown as Record<string, unknown>[]);
const rechaza = (t: unknown, trozo: string) => {
  const r = validarTrabajo(t);
  if (r.ok) return false;
  return r.motivos.some((m) => m.includes(trozo));
};

describe("validarTrabajo · trabajo mínimo válido", () => {
  it("acepta un cubo, una cámara, una luz y un render_png", () => { bien(); });
  it("informa VERSION_VOCABULARIO", () => expect(VERSION_VOCABULARIO).toBe(1));
});

describe("validarTrabajo · rechazos", () => {
  it("rechaza campos desconocidos", () => {
    const t = fondo(); ESC(t).push({ op: "primitiva", tipo: "cubo", nombre: "Raro", truco: 1 });
    expect(rechaza(t, "campo desconocido «truco»")).toBe(true);
    const t2 = fondo(); (t2 as Record<string, unknown>).inferno = true;
    expect(rechaza(t2, "campo desconocido «inferno»")).toBe(true);
  });
  it("rechaza NaN e Infinity y fuera de rango", () => {
    const t = fondo(); SAL(t)[0].ancho = NaN;
    expect(rechaza(t, "número inválido")).toBe(true);
    const t2 = fondo(); (ESC(t2)[0] as Record<string, unknown>).tam = Infinity;
    expect(rechaza(t2, "fuera de rango")).toBe(true);
  });
  it("rechaza demasiadas operaciones", () => {
    const t = fondo();
    t.escena = Array.from({ length: 257 }, (_, i) => ({ op: "transformar", objeto: "Bloque", ubicacion: [i % 100 - 50, 0, 0] }));
    expect(rechaza(t, "operaciones")).toBe(true);
  });
  it("rechaza nombres repetidos y referencias a objetos que no existen", () => {
    const t = fondo(); ESC(t).push({ op: "primitiva", tipo: "esfera", nombre: "Bloque", tam: 1 });
    expect(rechaza(t, "ya usada")).toBe(true);
    const t2 = fondo(); ESC(t2).splice(1, 0, { op: "transformar", objeto: "Fantasma", escala: [2, 2, 2] });
    expect(rechaza(t2, "creado antes")).toBe(true);
  });
  it("rechaza rutas con «..», absolutas, .blend y .py; admite glb", () => {
    const coge = (archivo: unknown) => { const t = fondo(); ESC(t).push({ op: "importar", archivo, nombre: "Pieza" }); return rechaza(t, "ruta no admisible"); };
    expect(coge("../salir/m.glb")).toBe(true);
    expect(coge("/etc/passwd.glb")).toBe(true);
    expect(coge("piezas/m.blend")).toBe(true);
    expect(coge("scripts/truco.py")).toBe(true);
    const sinc = fondo(); ESC(sinc).push({ op: "importar", archivo: "piezas/modelo.glb", nombre: "Pieza" });
    expect(rechaza(sinc, "ruta no admisible")).toBe(false);
  });
  it("rechaza remallar con su motivo de «próximamente»", () => {
    const t = fondo(); ESC(t).push({ op: "remallar", objeto: "Bloque" });
    expect(rechaza(t, "no está disponible todavía")).toBe(true);
  });
  it("rechaza o queda como dato los textos de inyección", () => {
    const ataques = ['"); import os', "linea\r\nsalto", "日本語<>"];
    for (const a of ataques) {
      const dn = fondo(); ESC(dn).push({ op: "primitiva", tipo: "cubo", nombre: a, tam: 1 });
      expect(rechaza(dn, "denominación")).toBe(true);
      const dt = fondo(); ESC(dt).push({ op: "texto3d", nombre: "Cartel", texto: a });
      expect(rechaza(dt, "texto no admisible")).toBe(true);
    }
    const sinC = fondo(); ESC(sinC).push({ op: "texto3d", nombre: "Cartel", texto: "Año ña: ¿Hola! (1+2), verdad''" });
    expect(rechaza(sinC, "texto no admisible")).toBe(false);
  });
  it("acepta un caso válido de cada operación y cada salida", () => {
    const t = fondo();
    t.escena = [
      { op: "primitiva", tipo: "esfera", nombre: "E", tam: 2, segmentos: 24 },
      { op: "transformar", objeto: "E", escala: [1, 1, 1] },
      { op: "material", objeto: "E", color: [1, 0, 0, 1], metalico: 0.5, alfa: 1 },
      { op: "modificador", objeto: "E", tipo: "subdivision", niveles: 1 },
      { op: "texto3d", nombre: "Cartel", texto: "Año, ña", extrusion: 1, tam: 1 },
      { op: "mundo", color: [0, 0, 0, 1], fuerza: 1 },
      { op: "importar", archivo: "piezas/vela.svg", nombre: "Vela" },
      { op: "animar", objeto: "E", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 60, valor: [1, 0, 0] }], interpolacion: "lineal" },
      { op: "camara", nombre: "Ojo", ubicacion: [0, -5, 2], mira_a: [0, 0, 0], lente_mm: 50 },
      { op: "luz", nombre: "Sol", tipo: "sol", energia: 1000, ubicacion: [3, -3, 5] },
      { op: "mundo", fuerza: 1 },
    ];
    t.salidas = [
      { tipo: "render_png", ancho: 320, alto: 240, muestras: 16, motor: "workbench", fondo_transparente: true },
      { tipo: "render_exr", ancho: 320, alto: 240, muestras: 8, motor: "cycles-cpu" },
      { tipo: "render_mp4", ancho: 320, alto: 240, fps: 24, desde: 0, hasta: 90, muestras: 16, motor: "cycles-cpu" },
      { tipo: "exportar_glb", objetos: ["E"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
    ];
    bienTodo(t);
  });
  it("estima el coste: vértices de primitivas por 4^niveles y segundos de las salidas", () => {
    const c = { escena: [{ op: "primitiva", tipo: "cubo", nombre: "B" }, { op: "modificador", objeto: "B", tipo: "subdivision", niveles: 2 }], salidas: [{ tipo: "render_png", ancho: 64, alto: 64, muestras: 1, motor: "workbench" }] } as unknown as Trabajo3D;
    expect(estimarCoste(c).vertices).toBe(8 * 4 ** 2);
    expect(estimarCoste(fondo() as unknown as Trabajo3D).segundos).toBeGreaterThan(0);
  });
  it("necesitaConfirmacion: ámbito compartido, importar, calidad final o coste alto", () => {
    const t = fondo() as unknown as Trabajo3D;
    expect(necesitaConfirmacion(t, "ligero")).toBe(false);
    expect(necesitaConfirmacion(t, "ninguno")).toBe(true);
    (t as Record<string, unknown>).ambito = "publica"; expect(necesitaConfirmacion(t, "ligero")).toBe(true);
    t.ambito = "personal"; t.calidad = "final"; expect(necesitaConfirmacion(t, "ligero")).toBe(true);
    t.calidad = "normal"; ESC(t).push({ op: "importar", archivo: "piezas/vela.glb", nombre: "Vela" }); expect(necesitaConfirmacion(t, "ligero")).toBe(true);
  });
  it("guarda de pureza: el módulo no toca Node, ni evalúa, ni pide red", () => {
    const texto = readFileSync("src/lib/blender3d/trabajo.ts", "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch(", "execFile", "child_process"]) expect(texto).not.toContain(prohibido);
  });
  it("el vocabulario solo usa clases de especificación permitidas", () => {
    const PERMIT = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    type Marcas = { t: string; opc?: boolean; def?: unknown };
      const v = vocab as unknown as Record<string, Record<string, { params: Record<string, Marcas> }>>;
      for (const zeta of Object.values(v.operaciones)) expect(Object.keys(zeta.params ?? {}).length >= 0).toBe(true);
    for (const tabla of [v.operaciones, v.salidas]) for (const zeta of Object.values(tabla)) for (const e of Object.values(zeta.params ?? {})) {
      expect(PERMIT).toContain(e.t);
      expect(e.def === undefined || e.opc === true || e.t === "nombre" || e.t === "ref").toBe(true);
    }
  });
});
