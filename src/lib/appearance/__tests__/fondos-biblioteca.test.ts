import { describe, it, expect } from "vitest";
import {
  FONDOS_FOLDER_NAME, MIME_SET, esItemSet, guardarSet, listarSets, nombreArchivoSet, parsearSet,
  type DepsFondos, type DocBiblioteca,
} from "../fondos-biblioteca";
import type { SetFondo } from "../sets-fondo";
import type { ShaderCatalog } from "../catalogo-shaders";
import type { EntityRef } from "@/lib/library/entity-library";
import type { SaveMediaInput } from "@/lib/library/media-library";

const catalogo: ShaderCatalog = {};
const ref: EntityRef = { kind: "user", id: "u1" };
const vista = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8ZQ9QAAAABJRU5ErkJggg==";
const set = (over: Partial<SetFondo> = {}): SetFondo => ({
  formato: "starseed-fondo", version: 1, id: "set-luna", nombre: "Luna de Ñandú", autor: "Alex",
  licencias: [], base: null, capas: [], creado: "2026-10-26T10:00:00.000Z", vistaPrevia: vista, ...over,
});

/** Dobles sin red ni disco: solo registran lo que el módulo les pide. */
function dobles(opciones: { devuelveCarpeta?: string | null } = {}) {
  const docs: DocBiblioteca = { folders: [], items: [] };
  const estado = {
    entradas: [] as SaveMediaInput[],
    movidos: [] as Array<[string, string | null]>,
    creada: null as string | null,
  };
  const deps: DepsFondos = {
    carpetasMedia: async () => ({
      rootId: "media", subfolders: { Cámara: "c", Importadas: "i", Capturas: "p" },
    }),
    crearCarpeta: async (_ref, nombre, padre) => {
      estado.creada = `${padre}/${nombre}`;
      return "fondos";
    },
    listar: async () => docs,
    guardarArchivo: async (_ref, entrada) => {
      estado.entradas.push(entrada);
      return { ok: true, itemId: "item-1", folderId: opciones.devuelveCarpeta ?? entrada.destFolderId };
    },
    mover: async (_ref, itemId, carpetaId) => { estado.movidos.push([itemId, carpetaId]); },
    leer: async () => "",
    opciones: async () => ({ catalogo }),
  };
  return { deps, docs, estado };
}

describe("fondos-biblioteca · helpers puros", () => {
  it("nombreArchivoSet quita acentos, signos y añade la extensión del formato", () => {
    expect(nombreArchivoSet(set())).toBe("luna-de-nandu.starseed-fondo.json");
    expect(nombreArchivoSet(set({ nombre: "  " }))).toBe("set-luna.starseed-fondo.json");
    expect(nombreArchivoSet(set({ nombre: "Ola 1018F · Fondo" }))).toBe("ola-1018f-fondo.starseed-fondo.json");
  });

  it("esItemSet reconoce por MIME, por extensión o por etiqueta, nunca por texto suelto", () => {
    expect(esItemSet({ title: "x", mime: MIME_SET })).toBe(true);
    expect(esItemSet({ title: "Mi Fondo.STARSEED-FONDO.JSON" })).toBe(true);
    expect(esItemSet({ title: "x", tags: ["set-fondo"] })).toBe(true);
    expect(esItemSet({ title: "nota.md", mime: "text/markdown", tags: ["fondo"] })).toBe(false);
  });

  it("parsearSet valida con sets-fondo.ts y devuelve null si el texto no es un set", () => {
    expect(parsearSet(JSON.stringify(set()), { catalogo })?.id).toBe("set-luna");
    expect(parsearSet("no es json", { catalogo })).toBeNull();
    expect(parsearSet(JSON.stringify(set({ nombre: "" })), { catalogo })).toBeNull();
  });
});

describe("fondos-biblioteca · guardarSet", () => {
  it("sin carpeta elegida crea «Fondos» bajo la raíz de Media y guarda ahí el .starseed-fondo.json", async () => {
    const { deps, estado } = dobles();
    const r = await guardarSet(ref, set(), undefined, deps);
    expect(r).toEqual({
      ok: true, itemId: "item-1", carpetaId: "fondos", archivo: "luna-de-nandu.starseed-fondo.json",
    });
    expect(estado.creada).toBe(`media/${FONDOS_FOLDER_NAME}`);
    expect(estado.entradas).toHaveLength(1);
    const entrada = estado.entradas[0];
    expect(entrada).toMatchObject({ destFolderId: "fondos", name: "luna-de-nandu.starseed-fondo.json" });
    expect(entrada.tags).toEqual(["fondo", "set-fondo"]);
    expect(JSON.parse(await entrada.file.text())).toMatchObject({ id: "set-luna", vistaPrevia: vista });
    expect(estado.movidos).toEqual([]);
  });

  it("con carpeta elegida guarda directo y solo mueve si la Biblioteca devuelve otra carpeta", async () => {
    const { deps, estado } = dobles({ devuelveCarpeta: "otra" });
    const r = await guardarSet(ref, set(), "mia", deps);
    expect(r).toMatchObject({ ok: true, carpetaId: "mia" });
    expect(estado.creada).toBeNull();
    expect(estado.entradas[0].destFolderId).toBe("mia");
    expect(estado.movidos).toEqual([["item-1", "mia"]]);
  });

  it("un set inválido no llega a la Biblioteca y devuelve los motivos", async () => {
    const { deps, estado } = dobles();
    const r = await guardarSet(ref, set({ nombre: "" }), undefined, deps);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivos?.length).toBeTruthy();
    expect(estado.entradas).toHaveLength(0);
  });
});

describe("fondos-biblioteca · listarSets", () => {
  it("lee por content o por URL, valida y omite rotos y ajenos", async () => {
    const { deps, docs } = dobles();
    docs.items = [
      { id: "a", title: "uno.starseed-fondo.json", mime: MIME_SET, content: JSON.stringify(set()), folderId: "f1" },
      { id: "b", title: "dos.starseed-fondo.json", url: "https://biblioteca/dos", folderId: "f2" },
      { id: "c", title: "roto.starseed-fondo.json", content: "{no es json" },
      { id: "d", title: "nota.md", mime: "text/markdown", content: JSON.stringify(set({ id: "ajeno" })) },
    ];
    deps.leer = async (url) => {
      expect(url).toBe("https://biblioteca/dos");
      return JSON.stringify(set({ id: "set-dos" }));
    };
    const sets = await listarSets(ref, deps);
    expect(sets.map((s) => s.set.id)).toEqual(["set-luna", "set-dos"]);
    expect(sets.map((s) => s.carpetaId)).toEqual(["f1", "f2"]);
  });
});
