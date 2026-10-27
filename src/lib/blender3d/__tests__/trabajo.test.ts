import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarTrabajo, estimarCoste, necesitaConfirmacion, VERSION_VOCABULARIO, type Trabajo3D } from "../trabajo";
import vocabulario from "../vocabulario.json";

const cubo = { op: "primitiva", tipo: "cubo", nombre: "cubo", tam: 1 };
const camara = { op: "camara", nombre: "cam", ubicacion: [5, 5, 5], mira_a: [0, 0, 0] };
const luz = { op: "luz", nombre: "sol", tipo: "sol", energia: 3 };
const renderPng = { tipo: "render_png", ancho: 512, alto: 512, muestras: 16, motor: "workbench" };

const trabajo = (extra: Record<string, unknown> = {}) => ({
  v: 1, titulo: "Escena", calidad: "borrador", ambito: "personal", origen: "api",
  quien: "persona", escena: [cubo, camara, luz], salidas: [renderPng], ...extra,
});
const valido = (t: unknown): Trabajo3D => {
  const r = validarTrabajo(t);
  if (!r.ok) throw new Error(r.motivos.join(" | "));
  return r.trabajo;
};
const motivos = (t: unknown): string[] => {
  const r = validarTrabajo(t);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.motivos;
};

describe("vocabulario", () => {
  it("usa solo las clases de especificación permitidas y la versión 1", () => {
    const clases = ["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"];
    type Spec = Record<string, unknown>;
    const recorrer = (spec: Spec) => {
      expect(clases).toContain(spec.t);
      if (spec.de) recorrer(spec.de as Spec);
      for (const sub of Object.values((spec.campos ?? {}) as Record<string, Spec>)) recorrer(sub);
    };
    const v = vocabulario as unknown as { version: number; operaciones: Record<string, { params: Record<string, Spec> }>; salidas: Record<string, { params: Record<string, Spec> }> };
    expect(v.version).toBe(1);
    expect(VERSION_VOCABULARIO).toBe(1);
    for (const def of [...Object.values(v.operaciones), ...Object.values(v.salidas)]) for (const s of Object.values(def.params)) recorrer(s);
  });
});

describe("validarTrabajo", () => {
  it("acepta el trabajo mínimo", () => {
    expect(valido(trabajo()).escena).toHaveLength(3);
  });
  it("rechaza campos desconocidos en el trabajo y en una operación", () => {
    expect(motivos(trabajo({ extra: 1 })).join(" ")).toContain("campo desconocido");
    expect(motivos(trabajo({ escena: [{ ...cubo, veneno: true }] })).join(" ")).toContain("campo desconocido");
  });
  it("rechaza NaN e Infinity", () => {
    expect(motivos(trabajo({ escena: [{ ...cubo, tam: NaN }] })).join(" ")).toContain("finito");
    expect(motivos(trabajo({ escena: [{ ...cubo, tam: Infinity }] })).join(" ")).toContain("finito");
    expect(motivos(trabajo({ salidas: [{ ...renderPng, ancho: NaN }] })).join(" ")).toContain("finito");
  });
  it("rechaza más de 256 operaciones", () => {
    const ops = Array.from({ length: 257 }, (_, i) => ({ op: "primitiva", tipo: "cubo", nombre: `c${i}`, tam: 1 }));
    expect(motivos(trabajo({ escena: ops })).join(" ")).toContain("hasta 256");
  });
  it("rechaza nombre repetido y ref a un objeto inexistente", () => {
    expect(motivos(trabajo({ escena: [cubo, { ...cubo }] })).join(" ")).toContain("repetido");
    expect(motivos(trabajo({ escena: [{ op: "transformar", objeto: "fantasma" }] })).join(" ")).toContain("no existe");
  });
  it("rechaza rutas con «..», absolutas, .blend y .py", () => {
    for (const archivo of ["../secreto.glb", "/etc/passwd", "modelo.blend", "script.py", "modelo.glb.exe"]) {
      expect(motivos(trabajo({ escena: [{ op: "importar", archivo, nombre: "imp" }] })).length).toBeGreaterThan(0);
    }
    expect(valido(trabajo({ escena: [cubo, { op: "importar", archivo: "sub/modelo.glb", nombre: "imp" }] })).salidas).toHaveLength(1);
  });
  it("rechaza remallar con su motivo", () => {
    expect(motivos(trabajo({ escena: [{ op: "remallar", objeto: "cubo", modo: "voxel", caras: 100 }] })).join(" ")).toContain("servicios/taller-3d");
  });
  it("rechaza inyección en nombre y texto, y el texto limpio queda como dato", () => {
    expect(motivos(trabajo({ escena: [{ op: "primitiva", tipo: "cubo", nombre: '"); import os', tam: 1 }] })).join(" ")).toContain("nombre no válido");
    expect(motivos(trabajo({ escena: [{ op: "texto3d", nombre: "txt", texto: 'x"); import os\n', extrusion: 0, tam: 1 }] })).join(" ")).toContain("caracteres no permitidos");
    const limpio = valido(trabajo({ escena: [cubo, { op: "texto3d", nombre: "txt", texto: "Hola, ¿qué tal? ¡Ñandú! (3)", extrusion: 0, tam: 1 }] }));
    expect((limpio.escena[1] as { texto: string }).texto).toBe("Hola, ¿qué tal? ¡Ñandú! (3)");
  });
  it("acepta una operación válida de cada clase", () => {
    const ops = [
      cubo,
      { op: "transformar", objeto: "cubo", ubicacion: [0, 0, 0], rotacion: [0, 0, 0], escala: [1, 1, 1] },
      { op: "material", objeto: "cubo", color: [1, 0, 0, 1], metalico: 0.5, rugosidad: 0.5, emision_color: [1, 1, 1, 1], emision_fuerza: 2, alfa: 1 },
      { op: "modificador", objeto: "cubo", tipo: "subdivision", niveles: 2, ancho: 0.1, espesor: 0.1, cantidad: 2, relacion: 0.5, desplazamiento: [0, 0, 0] },
      { op: "texto3d", nombre: "titulo", texto: "Hola, ñandú", extrusion: 1, tam: 1 },
      { op: "camara", nombre: "cam2", ubicacion: [0, 0, 5], mira_a: [0, 0, 0], lente_mm: 50, ortografica: false },
      { op: "luz", nombre: "luz2", tipo: "punto", color: [1, 1, 1, 1], energia: 100, ubicacion: [1, 1, 1], rotacion: [0, 0, 0] },
      { op: "mundo", color: [0, 0, 0, 1], fuerza: 1, hdri: "cielo.hdr" },
      { op: "importar", archivo: "modelo.glb", nombre: "imp" },
      { op: "animar", objeto: "cubo", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 10, valor: [1, 1, 1] }], interpolacion: "suave" },
    ];
    expect(valido(trabajo({ escena: ops })).escena).toHaveLength(ops.length);
  });
  it("acepta una salida válida de cada tipo", () => {
    const salidas = [renderPng,
      { tipo: "render_mp4", ancho: 640, alto: 480, fps: 24, desde: 0, hasta: 10, muestras: 8, motor: "workbench" },
      { tipo: "render_exr", ancho: 640, alto: 480, muestras: 8, motor: "cycles-cpu" },
      { tipo: "exportar_glb", objetos: ["cubo"], y_arriba: true, aplicar_modificadores: false, draco: false, meshopt: false }];
    for (const salida of salidas) expect(valido(trabajo({ salidas: [salida] })).salidas[0]).toEqual(salida);
  });
  it("estima vértices y segundos", () => {
    const base = estimarCoste(valido(trabajo()));
    expect(base.vertices).toBe(8); expect(base.segundos).toBeGreaterThan(0);
    const sub = valido(trabajo({ escena: [cubo, { op: "modificador", objeto: "cubo", tipo: "subdivision", niveles: 2 }] }));
    expect(estimarCoste(sub).vertices).toBe(8 * 16);
    const mp4 = valido(trabajo({ salidas: [{ tipo: "render_mp4", ancho: 640, alto: 480, fps: 24, desde: 0, hasta: 9, muestras: 8, motor: "cycles-cpu" }] }));
    expect(estimarCoste(mp4).segundos).toBeGreaterThan(base.segundos);
  });
  it("pide confirmación por ámbito, importar, calidad o coste", () => {
    expect(necesitaConfirmacion(valido(trabajo()), "estandar")).toBe(false);
    expect(necesitaConfirmacion(valido(trabajo({ ambito: "grupo" })), "estandar")).toBe(true); expect(necesitaConfirmacion(valido(trabajo({ calidad: "final" })), "estandar")).toBe(true);
    expect(necesitaConfirmacion(valido(trabajo({ escena: [cubo, { op: "importar", archivo: "modelo.glb", nombre: "imp" }] })), "estandar")).toBe(true); expect(necesitaConfirmacion(valido(trabajo()), "ninguno")).toBe(true);
    const grande = valido(trabajo({ salidas: [{ tipo: "render_png", ancho: 4096, alto: 4096, muestras: 1024, motor: "cycles-cpu" }] }));
    expect(necesitaConfirmacion(grande, "ligero")).toBe(true); expect(necesitaConfirmacion(grande, "estudio")).toBe(true);
  });
  it("trabajo.ts no toca Node, red ni código dinámico", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/blender3d/trabajo.ts"), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch("]) expect(src).not.toContain(prohibido);
  });
});
