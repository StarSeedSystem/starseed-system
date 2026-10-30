import { describe, it, expect } from "vitest";
import {
  CARPETA_FONDOS,
  SET_FONDO_MIME,
  carpetaFondos,
  esSetFondo,
  guardarSet,
  itemParaSet,
  listarSets,
  moverSet,
  TAG_SET_FONDO,
  type DependenciasBiblioteca,
} from "../fondos-biblioteca";
import type { OpcionesSet, SetFondo } from "../sets-fondo";
import type { ShaderCatalog } from "../catalogo-shaders";
import type { EntityLibraryDoc, LibraryFolder, SavedItem, SavedItemType } from "@/lib/library/entity-library";

/** Catálogo mínimo: un componente conocido (el del preset de prueba) y la cámara marcada. */
const catalogo: ShaderCatalog = {
  Cálidos: [{
    name: "Gradient", category: "Cálidos", description: "", requiereCamara: false,
    interactivo: false, necesitaHijo: false, pesado: false, props: {},
  }],
};
const opciones: OpcionesSet = { catalogo };

/** Set de prueba completo y válido según sets-fondo (el PO del formato manda en la forma). */
const set = (id: string, extra: Partial<SetFondo> = {}): SetFondo => ({
  formato: "starseed-fondo", version: 1, id, nombre: `Fondo ${id}`, autor: "Alex", licencias: [],
  base: null, capas: [], creado: "2026-10-26T10:00:00.000Z", ...extra,
});

/** Biblioteca falsa: doc en memoria + deps que no tocan disco, red ni Supabase. */
interface Biblio { doc: EntityLibraryDoc; deps: DependenciasBiblioteca }
const biblio = (): Biblio => {
  const doc: EntityLibraryDoc = { items: [], folders: [], rev: 0, updatedAt: "" };
  let seq = 0;
  const deps: DependenciasBiblioteca = {
    listar: async () => doc,
    crearCarpeta: async (_ref, nombre, parentId) => {
      const f: LibraryFolder = { id: `folder-${++seq}`, name: nombre, parentId, createdAt: "", createdBy: "Alex" };
      doc.folders.push(f);
      return f.id;
    },
    guardar: async (_ref, item, folderId) => {
      const n = ++seq;
      const saved: SavedItem = { id: `item-${n}`, type: item.type as SavedItemType, title: item.title,
        tags: item.tags ?? [], folderId: folderId ?? null, addedAt: "", addedBy: "Alex",
        content: item.content, mime: item.mime, refId: item.refId, thumbnail: item.thumbnail };
      doc.items.push(saved);
      return { ok: true, id: saved.id };
    },
    mover: async (_ref, itemId, folderId) => {
      const i = doc.items.find((x) => x.id === itemId);
      if (i) i.folderId = folderId;
    },
    quitar: async (_ref, itemId) => {
      doc.items = doc.items.filter((x) => x.id !== itemId);
    },
  };
  return { doc, deps };
};

describe("fondos-biblioteca · carpetaFondos y esSetFondo (puros)", () => {
  const carpeta = (id: string, parentId: string | null, name = CARPETA_FONDOS): LibraryFolder =>
    ({ id, name, parentId, createdAt: "", createdBy: "a" });

  it("carpetaFondos solo encuentra «Fondos» en la RAÍZ", () => {
    expect(carpetaFondos([carpeta("f1", null)])?.id).toBe("f1");
    expect(carpetaFondos([carpeta("f2", "f1")])).toBeNull(); // anidada: no vale
    expect(carpetaFondos([carpeta("f3", null, "Imágenes y videos")])).toBeNull();
  });

  it("esSetFondo marca por MIME y etiqueta, y deja fuera los diseños .ssdesign.json", () => {
    const fondo: SetFondo = set("a");
    const itemSet = itemParaSet(fondo) as unknown as SavedItem;
    expect(esSetFondo(itemSet)).toBe(true);
    const marca = (type: SavedItem["type"], mime: string, tags: string[]): Pick<SavedItem, "type" | "mime" | "tags"> =>
      ({ type, mime, tags });
    expect(esSetFondo({ type: "design", mime: "application/vnd.starseed.design+json", tags: ["diseño"] })).toBe(false);
    expect(esSetFondo(marca("external", SET_FONDO_MIME, []))).toBe(false);
    const comoFichero = marca("file", "", [TAG_SET_FONDO]);
    expect(esSetFondo(comoFichero)).toBe(true);
  });
});

describe("fondos-biblioteca · itemParaSet (puro)", () => {
  it("el content es el JSON 1 a 1 del set y el refId lo reencuentra (Entidad Única)", () => {
    const s = set("aurora", { vistaPrevia: "data:image/png;base64,iVBORw0KGgoAAA=" });
    const item = itemParaSet(s);
    expect(item.type).toBe("design");
    expect(item.refId).toBe("fondo:aurora");
    expect(item.mime).toBe(SET_FONDO_MIME);
    expect(item.tags).toEqual([TAG_SET_FONDO, "shaders"]);
    expect(item.title).toBe("Fondo aurora");
    expect(item.content).toBe(JSON.stringify(s));
    expect(item.thumbnail).toBe("data:image/png;base64,iVBORw0KGgoAAA=");
    expect(item.note).toContain(".starseed-fondo.json");
  });

  it("sin vista previa no se inventa thumbnail", () => {
    expect(itemParaSet(set("liso")).thumbnail).toBeUndefined();
  });
});

describe("fondos-biblioteca · guardarSet (biblioteca falsa)", () => {
  it("crea «Fondos» en la raíz si falta y no la duplica al volver a guardar", async () => {
    const { doc, deps } = biblio();
    const una = await guardarSet({ kind: "user", id: "u1" }, set("a"), undefined, deps);
    if (!una.ok) throw new Error("el guardado debería pasar");
    expect(doc.folders).toHaveLength(1);
    expect(doc.folders[0].name).toBe(CARPETA_FONDOS);
    expect(doc.folders[0].parentId).toBeNull();
    expect(doc.items[0].folderId).toBe(una.carpetaId);
    await guardarSet({ kind: "user", id: "u1" }, set("b"), undefined, deps);
    expect(doc.folders).toHaveLength(1); // idempotente, como ensureMediaFolders
  });

  it("con carpeta elegida guarda dentro; con carpeta desconocida no guarda nada", async () => {
    const { doc, deps } = biblio();
    const otra = await deps.crearCarpeta({ kind: "user", id: "u1" }, "Página Aurora", null);
    const ok = await guardarSet({ kind: "user", id: "u1" }, set("a"), otra, deps);
    expect(ok).toEqual({ ok: true, carpetaId: otra, itemId: expect.any(String) });
    expect(doc.items[0].folderId).toBe(otra);
    expect(doc.folders.every((f) => f.name !== CARPETA_FONDOS)).toBe(true); // no crea la suya de regalo

    const falla = await guardarSet({ kind: "user", id: "u1" }, set("a"), "no-existe", deps);
    expect(falla).toEqual({ ok: false, motivo: "la carpeta elegida no existe" });
    expect(doc.items).toHaveLength(1);
  });

  it("reexportar el mismo set REEMPLAZA su ítem: uno por set y contenido al día", async () => {
    const { doc, deps } = biblio();
    const ref = { kind: "user", id: "u1" } as const;
    await guardarSet(ref, set("a"), undefined, deps);
    await guardarSet(ref, set("a", { base: "spline" }), undefined, deps);
    const delSet = doc.items.filter((it) => esSetFondo(it));
    expect(delSet).toHaveLength(1);
    expect(JSON.parse(delSet[0].content ?? "{}").base).toBe("spline");  });

  it("un set de más de 2 MB se rechaza antes de tocar la biblioteca", async () => {
    const { doc, deps } = biblio();
    const pesado = set("gigante", { autor: "x".repeat(2_100_000) });
    const r = await guardarSet({ kind: "user", id: "u1" }, pesado, undefined, deps);
    expect(r.ok).toBe(false);
    expect(doc.items).toHaveLength(0);
    expect(doc.folders).toHaveLength(0);
  });
});

describe("fondos-biblioteca · listarSets y moverSet", () => {
  it("lista y valida: el set con capa shader guardada vuelve completo, con su carpeta e ítem", async () => {
    const { doc, deps } = biblio();
    const rugoso = set("cristal", { capas: [{ id: "c1", kind: "shader", visible: true, opacity: 1,
      preset: { components: [{ type: "Gradient", id: "g1", props: {} }] } }] } as Partial<SetFondo>);
    const guardado = await guardarSet({ kind: "user", id: "u1" }, rugoso as unknown as SetFondo, undefined, deps);
    expect(guardado.ok).toBe(true);
    const lista = await listarSets({ kind: "user", id: "u1" }, opciones, deps);
    expect(lista).toHaveLength(1);
    const entrada = lista[0];
    expect(entrada.ok).toBe(true);
    if (entrada.ok) {
      expect(entrada.itemId).toBe(guardado.ok ? guardado.itemId : "");
      expect(entrada.set.id).toBe("cristal");
      expect(entrada.set.capas[0].kind).toBe("shader");
      expect(entrada.set.capas[0].preset?.components?.[0]?.type).toBe("Gradient");
      expect(entrada.carpetaId).toBe(doc.items[0].folderId);
    }
  });

  it("el JSON roto y el contenido prohibido se cuentan CON motivo (nunca en silencio)", async () => {
    const { doc, deps } = biblio();
    const ref = { kind: "user", id: "u1" } as const;
    await guardarSet(ref, set("a"), undefined, deps);
    // Un ítem cuyo content dejó de ser JSON (biblioteca sincronizada a mano, edición a mano…).
    doc.items.push({ id: "item-roto", type: "design", title: "Roto", tags: [TAG_SET_FONDO], folderId: null,
      addedAt: "", addedBy: "a", mime: SET_FONDO_MIME, content: "{no es json" });
    // Guardar NO valida (eso lo hace exportarSet/validarSet); listarSets sí, con sets-fondo: el
    // ítem del set con CSS prohibido entra, se lee y se cuenta con su motivo, sin fallo mudo.
    const prohibido = set("chispa", { capas: [{ id: "c1", kind: "color", visible: true, opacity: 1,
      value: "url(http://ajena.com/x)" }] } as Partial<SetFondo>);
    await guardarSet(ref, prohibido as unknown as SetFondo, undefined, deps);
    const lista = await listarSets(ref, opciones, deps);
    expect(lista).toHaveLength(3);
    const malos: string[] = [];
    for (const e of lista) if (!e.ok) malos.push(e.motivo);
    expect(malos).toHaveLength(2);
    expect(malos.join(" · ")).toContain("CSS no permitido");
    expect(malos.join(" · ")).toContain("JSON válido");
    expect(lista.some((e) => e.ok && e.set.id === "a")).toBeTruthy();
  });

  it("ignora los diseños .ssdesign.json y mueve los sets con moverSet", async () => {
    const { doc, deps } = biblio();
    await guardarSet({ kind: "user", id: "u1" }, set("a"), undefined, deps);
    doc.items.push({ id: "item-diseno", type: "design", title: "Tema Trinity", tags: ["diseño"],
      folderId: null, addedAt: "", addedBy: "a", mime: "application/vnd.starseed.design+json",
      content: "{\"formato\":\"ssdesign\"}" });
    expect(await listarSets({ kind: "user", id: "u1" }, opciones, deps)).toHaveLength(1);
    const setItem = doc.items[0];
    const carpetaOtra = await deps.crearCarpeta({ kind: "user", id: "u1" }, "Mi carpeta", null);
    await moverSet({ kind: "user", id: "u1" }, setItem.id, carpetaOtra, deps);
    expect(setItem.folderId).toBe(carpetaOtra);
  });
});
