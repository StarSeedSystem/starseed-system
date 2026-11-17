// MQC3 · Ramas por proveedor: 6 perfiles (móvil de 4 GB, portátil sin GPU de 16 GB, Mac de 8/32/64 GB, servidor ARM de 12 GB).
// El catálogo de las pruebas es un SUBCONJUNTO de la semilla real (tamaños y puntuaciones comprobados el 2026-11-10
// en catalogo-datos.ts), recortado a la familia Qwen3.5 para aislar las reglas: nada inventado, cada entrada es real.
// La 2b queda fuera del recorte para que la 4b sea el modelo más pequeño del catálogo de pruebas.
import { describe, expect, it } from "vitest";
import { MODELOS_SEMILLA, MODELOS_SIN_FILTROS_SEMILLA } from "../catalogo-datos";
import { MODELOS_API } from "../modelos-api";
import { construirPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { NOTA_CPU, ramasPorProveedor, type Rama } from "../ramas-proveedor";
import type { ModeloLocal } from "../tipos";

const BASES = ["qwen3.5:4b", "qwen3.5:9b", "qwen3.5:27b", "qwen3.5:35b-a3b"];
const VARIANTES = ["huihui_ai/qwen3.5-abliterated:4B", "huihui_ai/qwen3.5-abliterated:9b", "huihui_ai/qwen3.5-abliterated:27b"];
const limpio = (): ModeloLocal[] => MODELOS_SEMILLA.filter((m) => BASES.includes(m.id)).map((m) => ({ ...m }));
const conVariantes = (): ModeloLocal[] => [
  ...limpio(),
  ...MODELOS_SIN_FILTROS_SEMILLA.filter((m) => VARIANTES.includes(m.id)).map((m) => ({ ...m })),
];

const escritorio = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true };
const movil4 = construirPerfilNeurona({ id: "movil4", nombre: "Móvil", plataforma: "android", ramGb: 4, discoLibreGb: 30, webgpu: true, enchufada: false });
const cpu16 = construirPerfilNeurona({ ...escritorio, id: "cpu16", nombre: "Portátil sin GPU", gpuRenderer: "Intel(R) UHD Graphics", ramGb: 16 });
const mac8 = construirPerfilNeurona({ ...escritorio, id: "mac8", nombre: "Mac 8", gpuRenderer: "Apple M1", ramGb: 8 });
const mac32 = construirPerfilNeurona({ ...escritorio, id: "mac32", nombre: "Mac 32", gpuRenderer: "Apple M2 Max", ramGb: 32 });
const mac64 = construirPerfilNeurona({ ...escritorio, id: "mac64", nombre: "Mac 64", gpuRenderer: "Apple M2 Ultra", ramGb: 64 });
const servidor12 = construirPerfilNeurona({ ...escritorio, id: "arm12", nombre: "Servidor ARM", gpuRenderer: "", ramGb: 12 });

const ramas = (catalogo: ModeloLocal[], perfil: PerfilNeurona, sinFiltros = true) =>
  ramasPorProveedor(catalogo, MODELOS_API, perfil, { sinFiltrosPermitido: sinFiltros });
const rama = (lista: Rama[], proveedor: string): Rama | undefined => lista.find((r) => r.proveedor === proveedor);
const ids = (r: Rama | undefined): string[] => (r ? r.modelos.map((x) => x.id) : []);

describe("ramas locales: de MÁS a MENOS capaz, con el mejor y el más ligero que caben", () => {
  it("Mac de 32: la puntuación manda (35b, 9b), luego el tamaño (27b, 4b); mejor la 35b, ligera la 4b", () => {
    const o = rama(ramas(conVariantes(), mac32), "Ollama");
    expect(ids(o)).toEqual(["qwen3.5:35b-a3b", "qwen3.5:9b", "qwen3.5:27b", "qwen3.5:4b"]);
    expect(o?.modelos.map((x) => x.veredicto)).toEqual(["justo", "recomendado", "recomendado", "recomendado"]);
    expect(o?.mejorQueCabe).toBe("qwen3.5:35b-a3b");
    expect(o?.masLigero).toBe("qwen3.5:4b");
    expect(o?.nota).toBeNull();
  });
  it("Mac de 8: solo la 4b cabe (justo) y es a la vez el mejor y el más ligero; las otras quedan listadas como «no-cabe»", () => {
    const o = rama(ramas(limpio(), mac8), "Ollama");
    expect(o?.mejorQueCabe).toBe("qwen3.5:4b");
    expect(o?.masLigero).toBe("qwen3.5:4b");
    expect(o?.modelos.filter((x) => x.veredicto === "no-cabe")).toHaveLength(3);
  });
  it("Mac de 64: la 35b cabe holgada y encabeza; todos recomendados", () => {
    const o = rama(ramas(limpio(), mac64), "Ollama");
    expect(o?.mejorQueCabe).toBe("qwen3.5:35b-a3b");
    expect(o?.modelos.every((x) => x.veredicto === "recomendado")).toBe(true);
  });
});

describe("regla de CPU (página de referencia): sin tarjeta gráfica, SOLO el modelo más pequeño que cabe", () => {
  it("el servidor ARM de 12 GB recibe la 4b y NO la 9b; el portátil sin GPU de 16 GB, igual, con la línea de aviso", () => {
    for (const perfil of [servidor12, cpu16]) {
      const locales = ramas(limpio(), perfil).filter((r) => r.via === "local");
      expect(locales, perfil.nombre).toHaveLength(1);
      expect(locales[0].proveedor).toBe("Ollama");
      expect(ids(locales[0])).toEqual(["qwen3.5:4b"]);
      expect(ids(locales[0])).not.toContain("qwen3.5:9b");
      expect(locales[0].mejorQueCabe).toBe("qwen3.5:4b");
      expect(locales[0].masLigero).toBe("qwen3.5:4b");
      expect(locales[0].nota).toBe(NOTA_CPU);
    }
  });
  it("una Mac (con GPU) sí recibe la lista completa, sin la nota de CPU", () => {
    expect(ids(rama(ramas(limpio(), mac32), "Ollama"))).toHaveLength(4);
  });
});

describe("con memoria por debajo del mínimo de todos: solo la rama de API", () => {
  it("el móvil de 4 GB (sin Ollama) no ejecuta nada local: solo «abliteration.ai», sin el modelo obsoleto", () => {
    const lista = ramas(limpio(), movil4);
    expect(lista.map((r) => r.proveedor)).toEqual(["abliteration.ai"]);
    expect(lista[0].via).toBe("api");
    expect(lista[0].mejorQueCabe).toBeNull();
    expect(ids(lista[0])).toEqual(["abliterated-model-large-flash", "abliterated-model-large-v2", "abliterated-model"]);
    expect(ids(lista[0])).not.toContain("abliterated-model-large");
  });
  it("sin permiso de lo sin filtros no hay rama de API: el móvil se queda sin nada y la Mac de 32 solo con Ollama", () => {
    expect(ramas(limpio(), movil4, false)).toEqual([]);
    expect(ramas(limpio(), mac32, false).map((r) => r.proveedor)).toEqual(["Ollama"]);
  });
});

describe("rama de huihui_ai (variantes sin filtros): solo con permiso, ordenada por la puntuación de su base", () => {
  it("con permiso: la rama se lista junto a las demás y marca su mejor y su más ligera", () => {
    const lista = ramas(conVariantes(), mac32);
    expect(lista.map((r) => r.proveedor)).toEqual(["Ollama", "huihui_ai", "abliteration.ai"]);
    const h = rama(lista, "huihui_ai");
    expect(ids(h)).toEqual(["huihui_ai/qwen3.5-abliterated:9b", "huihui_ai/qwen3.5-abliterated:27b", "huihui_ai/qwen3.5-abliterated:4B"]);
    expect(h?.mejorQueCabe).toBe("huihui_ai/qwen3.5-abliterated:9b");
    expect(h?.masLigero).toBe("huihui_ai/qwen3.5-abliterated:4B");
  });
  it("sin permiso: ni rama de huihui_ai ni de API", () => {
    expect(ramas(conVariantes(), mac32, false).map((r) => r.proveedor)).toEqual(["Ollama"]);
  });
});

describe("pura y estable", () => {
  it("dos llamadas seguidas dan el mismo resultado", () => {
    expect(JSON.stringify(ramas(conVariantes(), mac32))).toBe(JSON.stringify(ramas(conVariantes(), mac32)));
  });
  it("no muta el catálogo, la lista de API ni el perfil", () => {
    const catalogo = conVariantes();
    const apis = MODELOS_API.map((x) => ({ ...x }));
    const antes = JSON.stringify([catalogo, apis, mac32]);
    ramasPorProveedor(catalogo, apis, mac32, { sinFiltrosPermitido: true });
    expect(JSON.stringify([catalogo, apis, mac32])).toBe(antes);
  });
});
