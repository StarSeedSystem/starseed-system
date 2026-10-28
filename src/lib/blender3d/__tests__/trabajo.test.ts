/**
 * Pruebas del núcleo puro del «trabajo 3D» (contrato architecture/blender-3d.md §4 · BLD1025C-d3).
 * Solo se prueban las funciones puras exportadas (`validarTrabajo`, `estimarCoste`,
 * `necesitaConfirmacion`) y el vocabulario de datos; el módulo bajo prueba no lleva `node:*`,
 * evaluación dinámica ni red, y una guardia lo comprueba leyendo el propio archivo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vocabulario from "../vocabulario.json";
import {
  VERSION_VOCABULARIO,
  estimarCoste,
  necesitaConfirmacion,
  validarTrabajo,
  type Trabajo3D,
} from "../trabajo";

type Bruto = Record<string, unknown>;

const CUBO: Bruto = { op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 2 };
const CAMARA: Bruto = { op: "camara", nombre: "Camara", ubicacion: [0, -6, 2], mira_a: [0, 0, 0] };
const LUZ: Bruto = { op: "luz", nombre: "Sol", tipo: "sol", energia: 1000 };
const PNG: Bruto = { tipo: "render_png", ancho: 512, alto: 512, muestras: 8, motor: "workbench" };

/** Devuelve un trabajo mínimo válido con los cambios aplicados encima. */
function base(cambios: Bruto = {}): Bruto {
  return {
    v: 1,
    titulo: "Cubo de prueba",
    calidad: "borrador",
    ambito: "personal",
    origen: "estudio",
    quien: "persona",
    escena: [CUBO, CAMARA, LUZ],
    salidas: [PNG],
    ...cambios,
  };
}

/** Devuelve los motivos por los que el validador rechaza (da fallo si lo acepta). */
function motivosDe(bruto: unknown): string[] {
  const r = validarTrabajo(bruto);
  if (r.ok) throw new Error("se esperaba un trabajo rechazado");
  return r.motivos;
}

/** Une los motivos en un solo texto para `toContain`. */
function motivo(bruto: unknown): string {
  return motivosDe(bruto).join(" · ");
}

/** Devuelve el trabajo validado (da fallo, con los motivos, si se rechaza). */
function bienDe(bruto: unknown, contexto: string): Trabajo3D {
  const r = validarTrabajo(bruto);
  if (!r.ok) throw new Error(`${contexto}: ${r.motivos.join("; ")}`);
  return r.trabajo;
}

describe("trabajo mínimo válido", () => {
  it("acepta cubo + cámara + luz + render_png y aplica los valores por defecto", () => {
    const trabajo = bienDe(base(), "mínimo");
    expect(trabajo.v).toBe(1);
    expect(trabajo.titulo).toBe("Cubo de prueba");
    expect(trabajo.escena).toHaveLength(3);
    expect(trabajo.salidas).toHaveLength(1);
    expect(trabajo.escena[1].lente_mm).toBe(50);
    expect(trabajo.escena[1].ortografica).toBe(false);
    expect(trabajo.salidas[0].fondo_transparente).toBe(false);
    expect(trabajo.limites).toBeUndefined();
  });

  it("comprueba la versión, el título y los límites", () => {
    expect(VERSION_VOCABULARIO).toBe(1);
    expect(VERSION_VOCABULARIO).toBe(vocabulario.version);
    expect(motivo(base({ v: 2 }))).toBe("v debe ser 1");
    expect(motivo(base({ titulo: "   " }))).toContain("titulo");
    expect(motivo(base({ titulo: "x".repeat(81) }))).toContain("titulo");
    expect(motivo(base({ titulo: 12 }))).toContain("titulo");
    const conLimites = bienDe(base({ limites: { segundos: 300, memoriaMB: 2048 } }), "limites");
    expect(conLimites.limites).toEqual({ segundos: 300, memoriaMB: 2048 });
    expect(motivo(base({ limites: { segundos: 2000 } }))).toContain("limites");
    expect(motivo(base({ limites: { segundos: -1 } }))).toContain("limites");
  });
});

describe("rechazos del contrato", () => {
  it("rechaza campos desconocidos en el trabajo, la operación, la salida y los límites", () => {
    expect(motivo(base({ tipo_extra: false }))).toContain("campo desconocido en el trabajo");
    expect(motivo(base({ escena: [{ ...CUBO, magia: 1 }] }))).toContain("campo desconocido: magia");
    expect(motivo(base({ salidas: [{ ...PNG, filtro: "malo" }] }))).toContain("campo desconocido: filtro");
    expect(motivo(base({ limites: { segundos: 100, gpu: "nada" } }))).toContain("campo desconocido en limites: gpu");
  });

  it("rechaza NaN, Infinity, valores fuera de rango y enteros donde toca", () => {
    expect(motivo(base({ escena: [{ ...CUBO, tam: NaN }] }))).toContain("número en rango");
    expect(motivo(base({ escena: [{ ...LUZ, energia: Infinity }] }))).toContain("número en rango");
    expect(motivo(base({ escena: [CUBO, { ...CAMARA, ubicacion: [NaN, 0, 0] }] }))).toContain("vector de 3 números");
    expect(motivo(base({ escena: [CUBO, { op: "material", objeto: "Cubo", color: [1, NaN, 0.5, 1] }] }))).toContain("rgba");
    expect(motivo(base({ escena: [CUBO, { op: "material", objeto: "Cubo", alfa: 2 }] }))).toContain("número en rango");
    expect(motivo(base({ salidas: [{ ...PNG, ancho: 512.5 }] }))).toContain("entero");
  });

  it("imputa los topes duros de operaciones y salidas, y lo desconocido", () => {
    const demasiadas = Array.from({ length: 257 }, (_, i) => ({ op: "primitiva", tipo: "cubo", nombre: `P${i}`, tam: 1 }));
    expect(motivo(base({ escena: demasiadas }))).toBe("demasiadas operaciones: máximo 256");
    expect(motivo(base({ salidas: [] }))).toContain("entre 1 y 4");
    expect(motivo(base({ salidas: [PNG, PNG, PNG, PNG, PNG] }))).toContain("entre 1 y 4");
    expect(motivo(base({ escena: [{ op: "teleportar", nombre: "N" }] }))).toContain("operacion desconocida");
    expect(motivo(base({ salidas: [{ ...PNG, tipo: "render_gif" }] }))).toContain("salida desconocida");
  });

  it("exige nombres únicos y referencias a objetos ya creados", () => {
    expect(motivo(base({ escena: [CUBO, { ...CUBO }] }))).toContain("repetido");
    expect(motivo(base({ escena: [{ op: "transformar", objeto: "Fantasma" }] }))).toContain("no existe");
    const conReferencias = bienDe(base({ escena: [CUBO, { op: "transformar", objeto: "Cubo" }] }), "referencias");
    expect(conReferencias.escena[1].escala).toEqual([1, 1, 1]);
  });
});

describe("rutas y remallar", () => {
  it("rechaza rutas con «..», absolutas y extensiones prohibidas (.blend, .py)", () => {
    expect(motivo(base({ escena: [{ op: "mundo", hdri: "../../pasado.hdr" }] }))).toContain("ruta");
    expect(motivo(base({ escena: [{ op: "mundo", hdri: "/etc/pasado.hdr" }] }))).toContain("ruta");
    expect(motivo(base({ escena: [{ op: "importar", archivo: "escena.blend", nombre: "Modelo" }] }))).toContain("ruta");
    expect(motivo(base({ escena: [{ op: "importar", archivo: "guion.py", nombre: "Modelo" }] }))).toContain("ruta");
    expect(motivo(base({ escena: [{ op: "importar", archivo: "todo//subir", nombre: "Modelo" }] }))).toContain("ruta");
  });

  it("acepta rutas relativas con subcarpetas y extensiones de la lista", () => {
    const conImporte = bienDe(base({ escena: [{ op: "importar", archivo: "piezas/modelo.glb", nombre: "Modelo" }] }), "importar");
    expect(conImporte.escena).toHaveLength(1);
    const conMundo = bienDe(base({ escena: [CUBO, { op: "mundo", hdri: "fondos/amanecer.hdr", fuerza: 1 }] }), "mundo");
    expect(conMundo.escena).toHaveLength(2);
  });

  it("rechaza remallar con su motivo de «próximamente»", () => {
    const m = motivo(base({ escena: [CUBO, { op: "remallar", objeto: "Cubo", modo: "voxel", caras: 100 }] }));
    expect(m).toContain("remallar: próximamente");
    expect(m).toContain("hoy lo hace servicios/taller-3d; llega en una ola posterior");
  });
});

describe("textos de inyección", () => {
  it("rechaza nombres con inyección, saltos de línea y unicode fuera de la lista", () => {
    expect(motivo(base({ escena: [{ ...CUBO, nombre: '"); import os' }] }))).toContain("nombre");
    expect(motivo(base({ escena: [{ ...CUBO, nombre: "Cubo\nrm -rf /" }] }))).toContain("nombre");
    expect(motivo(base({ escena: [{ ...CUBO, nombre: "Cuboño" }] }))).toContain("nombre");
    expect(motivo(base({ escena: [{ ...CUBO, nombre: "立立方方" }] }))).toContain("nombre");
    expect(motivo(base({ escena: [{ ...CUBO, nombre: "a".repeat(33) }] }))).toContain("nombre");
    expect(motivo(base({ escena: [{ ...CUBO, nombre: "2empieza" }] }))).toContain("nombre");
  });

  it("rechaza textos 3D con inyección, saltos de línea y unicode ajeno", () => {
    const textoMalo = (texto: string): string =>
      motivo(base({ escena: [CUBO, { op: "texto3d", nombre: "Texto", texto, extrusion: 0.2, tam: 1.2 }] }));
    expect(textoMalo('"); import os')).toContain("texto");
    expect(textoMalo("línea uno\nlínea dos")).toContain("texto");
    expect(textoMalo("Cubo\u2028 业")).toContain("texto");
    expect(textoMalo("x".repeat(65))).toContain("más largo de 64");
  });

  it("un texto 3D válido queda como DATO (tildes, ñ y signos), nunca como código", () => {
    const texto = "¿Versión con ñ? ¡Sí! (n.1) 'cosas'";
    const trabajo = bienDe(base({ escena: [CUBO, { op: "texto3d", nombre: "Texto", texto, extrusion: 0.2, tam: 1.2 }] }), "texto3d");
    expect(trabajo.escena[1]).toMatchObject({ op: "texto3d", texto });
  });
});

describe("un caso válido por cada operación y salida del vocabulario", () => {
  it("valida las 10 operaciones listas con las 4 salidas (remallar va en su propia prueba)", () => {
    const escena: Bruto[] = [
      { op: "primitiva", tipo: "cubo", nombre: "Cubo", tam: 2 },
      { op: "material", objeto: "Cubo" },
      { op: "transformar", objeto: "Cubo", rotacion: [30, -15, 90] },
      { op: "modificador", objeto: "Cubo", tipo: "subdivision", niveles: 1 },
      { op: "texto3d", nombre: "Texto", texto: "¡Versión con ñ!", extrusion: 0.2, tam: 1.2 },
      { op: "camara", nombre: "Camara", ubicacion: [0, -6, 2], mira_a: [0, 0, 0] },
      { op: "luz", nombre: "Sol", tipo: "sol", color: [1, 1, 1, 1], energia: 1000, ubicacion: [0, -5, 5], rotacion: [0, 0, 0] },
      { op: "mundo", color: [0, 0, 0, 1], fuerza: 1 },
      { op: "importar", archivo: "piezas/modelo.glb", nombre: "Modelo" },
      { op: "animar", objeto: "Cubo", propiedad: "ubicacion", claves: [{ fotograma: 0, valor: [0, 0, 0] }, { fotograma: 30, valor: [5, 0, 0] }], interpolacion: "bezier" },
    ];
    const salidas: Bruto[] = [
      { tipo: "render_png", ancho: 256, alto: 256, muestras: 8, motor: "workbench" },
      { tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 30, muestras: 4, motor: "workbench" },
      { tipo: "render_exr", ancho: 256, alto: 256, muestras: 16, motor: "workbench" },
      { tipo: "exportar_glb", objetos: ["Cubo", "Modelo"], y_arriba: true, aplicar_modificadores: true, draco: false, meshopt: false },
    ];
    const trabajo = bienDe(base({ escena, salidas, titulo: "Todas las operaciones" }), "completo");
    expect(trabajo.escena).toHaveLength(10);
    expect(trabajo.escena[0]).toMatchObject({ op: "primitiva", tipo: "cubo" });
    expect(trabajo.escena[1].color).toEqual([0.8, 0.8, 0.8, 1]);
    expect(trabajo.escena[5].lente_mm).toBe(50);
    expect(trabajo.escena[9].interpolacion).toBe("bezier");
    expect(trabajo.salidas).toHaveLength(4);
    expect(trabajo.salidas[3].objetos).toEqual(["Cubo", "Modelo"]);
  });

  it("enums y modificadores cubren sus opciones de la lista cerrada", () => {
    const tipos: string[] = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro", "plano", "circulo"];
    for (const [i, tipo] of tipos.entries()) {
      expect(bienDe(base({ escena: [{ op: "primitiva", tipo, nombre: `Obj${i}`, tam: 1 }] }), `primitiva ${tipo}`).escena).toHaveLength(1);
    }
    const modificadores: string[] = ["subdivision", "bisel", "solidificar", "espejo", "matriz", "decimar", "malla_alambre"];
    for (const tipo of modificadores) {
      expect(bienDe(base({ escena: [CUBO, { op: "modificador", objeto: "Cubo", tipo }] }), `modificador ${tipo}`).escena).toHaveLength(2);
    }
    const luces: string[] = ["sol", "punto", "foco", "area"];
    for (const [i, tipo] of luces.entries()) {
      expect(bienDe(base({ escena: [{ op: "luz", nombre: `L${i}`, tipo, energia: 10 }] }), `luz ${tipo}`).escena).toHaveLength(1);
    }
  });
});

describe("estimarCoste", () => {
  const escenaEstrella = [
    { op: "primitiva", tipo: "esfera", nombre: "Estrella", tam: 4 },
    { op: "modificador", objeto: "Estrella", tipo: "subdivision", niveles: 2 },
  ];

  it("cuenta los vértices de la base y los multiplica por los niveles de subdivisión", () => {
    const trabajo = bienDe(base({ escena: escenaEstrella }), "coste de vértices");
    expect(estimarCoste(trabajo).vertices).toBe(7712);
    const cubos = estimarCoste(bienDe(
      base({ escena: [CUBO, { op: "primitiva", tipo: "plano", nombre: "Suelo", tam: 10 }], salidas: [{ tipo: "exportar_glb" }] }),
      "cubos",
    ));
    expect(cubos.vertices).toBe(12);
  });

  it("estima segundos con píxeles, muestras, fotogramas y motor", () => {
    const rinde = { tipo: "render_png", ancho: 256, alto: 256, muestras: 16, motor: "workbench" };
    const trabajo = estimarCoste(bienDe(base({ escena: escenaEstrella, salidas: [rinde] }), "png"));
    expect(trabajo.segundos).toBeCloseTo(2.996, 3);
    const enCiclos = estimarCoste(bienDe(base({ escena: escenaEstrella, salidas: [{ ...rinde, motor: "cycles-cpu" }] }), "ciclos"));
    expect(enCiclos.segundos).toBeCloseTo(8.738, 2);
    expect(enCiclos.segundos).toBeGreaterThan(trabajo.segundos);
  });

  it("cuenta los fotogramas del mp4 y no añade coste en el GLB", () => {
    const mp4 = estimarCoste(bienDe(base({ salidas: [{ tipo: "render_mp4", ancho: 320, alto: 240, fps: 12, desde: 0, hasta: 60, muestras: 16, motor: "workbench" }] }), "mp4"));
    expect(mp4.segundos).toBeCloseTo(214.162, 2);
    const soloGlb = estimarCoste(bienDe(base({ salidas: [{ tipo: "exportar_glb" }] }), "glb"));
    expect(soloGlb.segundos).toBe(0);
    expect(soloGlb.vertices).toBe(8);
  });
});

describe("necesitaConfirmacion", () => {
  it("el trabajo mínimo ligero no pide confirmación en estándar ni ligero", () => {
    const trabajo = bienDe(base(), "mínimo");
    expect(necesitaConfirmacion(trabajo, "estandar")).toBe(false);
    expect(necesitaConfirmacion(trabajo, "ligero")).toBe(false);
  });

  it("pide confirmación por ámbito, calidad final, importar o perfil sin recursos", () => {
    const trabajo = bienDe(base(), "base");
    expect(necesitaConfirmacion(bienDe(base({ ambito: "grupo" }), "grupo"), "estandar")).toBe(true);
    expect(necesitaConfirmacion(bienDe(base({ ambito: "publica" }), "publica"), "estandar")).toBe(true);
    expect(necesitaConfirmacion(bienDe(base({ calidad: "final" }), "final"), "estandar")).toBe(true);
    expect(necesitaConfirmacion(
      bienDe(base({ escena: [CUBO, { op: "importar", archivo: "modelo.glb", nombre: "Modelo" }] }), "importar"),
      "ligero",
    )).toBe(true);
    expect(necesitaConfirmacion(trabajo, "ninguno")).toBe(true);
  });

  it("el perfil ligero recorta dimensiones, fotogramas y límites que no cabe", () => {
    expect(necesitaConfirmacion(
      bienDe(base({ salidas: [{ tipo: "render_png", ancho: 1920, alto: 1080, muestras: 16, motor: "workbench" }] }), "grande"),
      "ligero",
    )).toBe(true);
    const borde = { ancho: 320, alto: 240, fps: 12, muestras: 1, motor: "workbench" };
    expect(necesitaConfirmacion(
      bienDe(base({ salidas: [{ tipo: "render_mp4", ...borde, desde: 0, hasta: 119 }] }), "mp4 al borde"),
      "ligero",
    )).toBe(false);
    expect(necesitaConfirmacion(
      bienDe(base({ salidas: [{ tipo: "render_mp4", ...borde, desde: 0, hasta: 120 }] }), "mp4 fuera"),
      "ligero",
    )).toBe(true);
    const conMemoria = bienDe(base({ limites: { segundos: 300, memoriaMB: 4096 } }), "memoria");
    expect(necesitaConfirmacion(conMemoria, "ligero")).toBe(true);
    expect(necesitaConfirmacion(conMemoria, "estandar")).toBe(false);
  });

  it("el perfil ligero pide confirmación cuando el coste en vértices pesa", () => {
    const pesada = bienDe(base({
      escena: [
        { op: "primitiva", tipo: "esfera", nombre: "Estrella", tam: 4 },
        { op: "modificador", objeto: "Estrella", tipo: "subdivision", niveles: 4 },
      ],
      salidas: [{ tipo: "render_png", ancho: 128, alto: 128, muestras: 1, motor: "workbench" }],
    }), "vértices");
    expect(necesitaConfirmacion(pesada, "ligero")).toBe(true);
    expect(necesitaConfirmacion(pesada, "estandar")).toBe(false);
  });
});

type EspecJson = { t?: unknown; de?: EspecJson; campos?: Record<string, EspecJson>; min?: unknown; max?: unknown; patron?: unknown; ext?: unknown; v?: unknown };
type DefJson = { estado?: string; motivo?: string; params: Record<string, EspecJson> };
type VocabJson = { version: number; topes: Record<string, number>; operaciones: Record<string, DefJson>; salidas: Record<string, DefJson> };

const CLASES = new Set(["num", "enum", "bool", "vec", "rgba", "nombre", "ref", "txt", "ruta", "lista", "obj"]);

/** Recorre una especificación (y sus anidadas) y apunta las clases prohibidas o malas. */
function revisarEspec(e: EspecJson, ruta: string, malas: string[]): void {
  if (!CLASES.has(String(e.t))) { malas.push(`${ruta}: clase ${String(e.t)}`); return; }
  if ((e.t === "num" || e.t === "vec") && (typeof e.min !== "number" || typeof e.max !== "number")) malas.push(`${ruta}: sin rango`);
  if (e.t === "txt" && typeof e.patron !== "string") malas.push(`${ruta}: sin patrón`);
  if (e.t === "ruta" && !(Array.isArray(e.ext) && e.ext.length > 0)) malas.push(`${ruta}: sin extensiones`);
  if (e.t === "enum" && !(Array.isArray(e.v) && e.v.length > 0)) malas.push(`${ruta}: sin valores`);
  if (e.t === "lista") revisarEspec(e.de ?? {}, `${ruta}.de`, malas);
  if (e.t === "obj") for (const [campo, sub] of Object.entries(e.campos ?? {})) revisarEspec(sub, `${ruta}.${campo}`, malas);
}

describe("vocabulario", () => {
  it("solo tiene clases permitidas y las listas cerradas del contrato", () => {
    const V = vocabulario as unknown as VocabJson;
    expect(V.version).toBe(1);
    expect(Object.keys(V.operaciones)).toEqual(["primitiva", "material", "transformar", "modificador", "texto3d", "camara", "luz", "mundo", "importar", "animar", "remallar"]);
    expect(Object.keys(V.salidas)).toEqual(["render_png", "render_mp4", "render_exr", "exportar_glb"]);
    const malas: string[] = [];
    for (const [nom, def] of Object.entries(V.operaciones)) {
      expect(def.estado, `${nom}.estado`).toBe(nom === "remallar" ? "proximamente" : "listo");
      if (def.estado !== "listo") expect(def.motivo, `${nom}.motivo`).toBeTruthy();
      for (const [campo, espec] of Object.entries(def.params ?? {})) revisarEspec(espec, `operaciones.${nom}.${campo}`, malas);
    }
    for (const [nom, def] of Object.entries(V.salidas)) {
      for (const [campo, espec] of Object.entries(def.params ?? {})) revisarEspec(espec, `salidas.${nom}.${campo}`, malas);
    }
    expect(malas).toEqual([]);
    expect(V.operaciones.remallar.motivo).toContain("taller-3d");
  });
});

describe("guarda de pureza", () => {
  it("trabajo.ts no contiene node:, eval(, new Function ni fetch(", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/lib/blender3d/trabajo.ts"), "utf8");
    for (const prohibido of ["node:", "eval(", "new Function", "fetch("]) {
      expect(fuente.includes(prohibido), `${prohibido} aparece en trabajo.ts`).toBe(false);
    }
  });
});
