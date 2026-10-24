import { describe, it, expect } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";
import { importarSet, type SetFondo } from "../sets-fondo";
import {
  guardarSet, listarSets, nombreArchivoSet, esItemDeSet, idCarpetaFondos, prefijosBibliotecaDe,
  bytesVistaPrevia, CARPETA_FONDOS, MIME_SET,
  type CarpetaRef, type DepsFondos, type DocBiblioteca, type ItemRef,
} from "../fondos-biblioteca";

const catalogo = construirCatalogo([{ name: "LinearGradient", category: "Degradados" }]);
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(41)}`;
const set = (extra: Partial<SetFondo> = {}): SetFondo => ({
  formato: "starseed-fondo", version: 1, id: "set-1", nombre: "Aurora Cristalina", autor: "Alex",
  licencias: [], base: null, capas: [], creado: "2026-10-24T10:00:00.000Z", vistaPrevia: PNG, ...extra,
});

interface Estado { doc: DocBiblioteca; guardados: Map<string, string>; movidos: Array<[string, string | null]>; creadas: string[] }

function deps(inicial: Partial<DocBiblioteca> = {}): { d: DepsFondos; e: Estado } {
  const e: Estado = { doc: { folders: inicial.folders ?? [], items: inicial.items ?? [] }, guardados: new Map(), movidos: [], creadas: [] };
  let n = 0;
  const d: DepsFondos = {
    catalogo,
    leerBiblioteca: async () => e.doc,
    crearCarpeta: async (_r, nombre, padreId) => {
      const id = `carpeta-${++n}`;
      e.doc.folders.push({ id, name: nombre, parentId: padreId });
      e.creadas.push(nombre);
      return id;
    },
    guardarArchivo: async (_r, entrada) => {
      const itemId = `item-${++n}`, texto = await entrada.blob.text();
      e.guardados.set(itemId, texto);
      e.doc.items.push({ id: itemId, title: entrada.name, mime: entrada.mime, content: texto });
      return { ok: true, itemId, folderId: null };
    },
    mover: async (_r, itemId, carpetaId) => {
      e.movidos.push([itemId, carpetaId]);
      const it = e.doc.items.find((x) => x.id === itemId);
      if (it) it.folderId = carpetaId;
    },
    leerTexto: async (it) => e.guardados.get(it.id) ?? it.content ?? "",
  };
  return { d, e };
}

describe("fondos-biblioteca · piezas puras", () => {
  it("nombre de archivo estable, sin acentos y con la extensión del contrato", () => {
    expect(nombreArchivoSet({ nombre: "Aurora · Ñandú" })).toBe("aurora-nandu.starseed-fondo.json");
    expect(nombreArchivoSet({ nombre: "   " })).toBe("fondo.starseed-fondo.json");
  });

  it("reconoce sets por nombre, MIME o contenido, y solo la carpeta «Fondos» de la raíz", () => {
    expect(esItemDeSet({ title: "a.STARSEED-FONDO.JSON" })).toBe(true);
    expect(esItemDeSet({ title: "x", mime: MIME_SET })).toBe(true);
    expect(esItemDeSet({ title: "x", content: '{"formato":"starseed-fondo"}' })).toBe(true);
    expect(esItemDeSet({ title: "x.png" })).toBe(false);
    const f = (id: string, name: string, parentId: string | null): CarpetaRef => ({ id, name, parentId });
    expect(idCarpetaFondos([f("1", "Fondos", "otra"), f("2", " fondos ", null)])).toBe("2");
    expect(idCarpetaFondos([f("1", "Fondos", "x")])).toBeUndefined();
  });

  it("deriva el prefijo de la Biblioteca y decodifica la vista previa PNG", () => {
    expect(prefijosBibliotecaDe(["https://p.supabase.co/storage/v1/object/public/os-files/uid/a.png", "https://otro/x"]))
      .toEqual(["https://p.supabase.co/storage/v1/object/public/os-files/"]);
    expect(bytesVistaPrevia(PNG)?.byteLength).toBe(39);
    expect(bytesVistaPrevia("data:image/png;base64,@@")).toBeUndefined();
    expect(bytesVistaPrevia("data:image/jpeg;base64,AAAA")).toBeUndefined();
  });
});

describe("fondos-biblioteca · guardarSet", () => {
  it("crea «Fondos», guarda el JSON y la vista previa, y los mueve a la carpeta", async () => {
    const { d, e } = deps();
    const r = await guardarSet({ kind: "user", id: "u1" }, set(), null, d);
    if (!r.ok || !r.itemId || !r.vistaItemId) throw new Error(r.error || "no se guardó");
    expect(e.creadas).toEqual([CARPETA_FONDOS]);
    expect(r.archivo).toBe("aurora-cristalina.starseed-fondo.json");
    expect(e.guardados.get(r.itemId)).toContain('"formato":');
    expect(importarSet(e.guardados.get(r.itemId)!, { catalogo }).ok).toBe(true);
    expect(e.movidos).toEqual([[r.itemId, r.carpetaId], [r.vistaItemId, r.carpetaId]]);
    expect(e.doc.items.find((i) => i.id === r.vistaItemId)?.title).toBe("aurora-cristalina-vista.png");
  });

  it("usa la carpeta elegida sin crear «Fondos» y rechaza una carpeta que ya no existe", async () => {
    const carpeta: CarpetaRef = { id: "mia", name: "Mis fondos", parentId: null };
    const { d, e } = deps({ folders: [carpeta] });
    const ok = await guardarSet({ kind: "user", id: "u1" }, set(), "mia", d);
    expect(ok.ok && ok.carpetaId).toBe("mia");
    expect(e.creadas).toEqual([]);
    const malo = await guardarSet({ kind: "user", id: "u1" }, set(), "fantasma", d);
    expect(malo.ok).toBe(false);
    expect(malo.error).toMatch(/ya no existe/);
  });

  it("un set inválido no toca la Biblioteca y devuelve los motivos", async () => {
    const { d, e } = deps();
    const capa = { id: "c", kind: "shader" as const, visible: true, opacity: 1, blend: "normal" as const, preset: { components: [{ type: "Minador" }] } };
    const r = await guardarSet({ kind: "user", id: "u1" }, set({ capas: [capa] }), null, d);
    expect(r.ok).toBe(false);
    expect(r.motivos?.join(" ")).toMatch(/Minador/);
    expect(e.doc.items).toEqual([]);
  });
});

describe("fondos-biblioteca · listarSets", () => {
  it("lee, valida y separa lo que no cumple el contrato", async () => {
    const items: ItemRef[] = [
      { id: "a", title: "aurora.starseed-fondo.json", mime: MIME_SET, content: JSON.stringify(set()), folderId: "f" },
      { id: "b", title: "roto.starseed-fondo.json", content: "{no es json" },
      { id: "c", title: "aurora-vista.png", mime: "image/png" },
    ];
    const { d } = deps({ items });
    const r = await listarSets({ kind: "page", id: "p1" }, d);
    expect(r.sets.map((s) => s.set.nombre)).toEqual(["Aurora Cristalina"]);
    expect(r.sets[0]).toMatchObject({ itemId: "a", carpetaId: "f" });
    expect(r.invalidos).toHaveLength(1);
    expect(r.invalidos[0].motivos.join(" ")).toMatch(/JSON/);
  });
});
