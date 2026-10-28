import { describe, it, expect } from "vitest";
import {
  blobDeDataUrl, esSetGuardado, guardarSet, listarSets, nombreArchivoSet,
  CARPETA_FONDOS, MIME_SET, MIME_VISTA, type DepsFondos, type EntradaArchivo,
} from "../fondos-biblioteca";
import type { SetFondo } from "../sets-fondo";
import type { BackgroundLayer } from "../background-layers";
import type { LibraryFolder, SavedItem } from "@/lib/library/entity-library";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const REF = { kind: "user", id: "u1" } as const;
const set = (over: Partial<SetFondo> = {}): SetFondo => ({
  formato: "starseed-fondo", version: 1, id: "set-a", nombre: "Aurora Nandú", autor: "Alex",
  licencias: [], base: null, capas: [], creado: "2026-10-24T10:00:00.000Z", ...over,
});
const item = (over: Partial<SavedItem> = {}): SavedItem => ({
  id: "i1", type: "file", title: "a.starseed-fondo.json", mime: "application/json", tags: [],
  addedAt: "2026-10-24T10:00:00.000Z", addedBy: "u1", folderId: null, ...over,
});
const carpeta = (id: string, nombre: string): LibraryFolder => ({
  id, name: nombre, parentId: null, createdAt: "", createdBy: "u1",
});

/** Dobles de la Biblioteca: sin red, disco, DOM ni Supabase. */
function dobles(o: { items?: SavedItem[]; carpetas?: LibraryFolder[]; textos?: Record<string, string>; fallaVista?: boolean } = {}) {
  const guardados: EntradaArchivo[] = [], creadas: Array<{ nombre: string; padre: string | null }> = [];
  const d: DepsFondos = {
    listar: async () => ({ items: o.items ?? [], folders: o.carpetas ?? [] }),
    crearCarpeta: async (_ref, nombre, padre) => { creadas.push({ nombre, padre }); return "nueva"; },
    guardarArchivo: async (_ref, e) => {
      if (o.fallaVista && e.mime === MIME_VISTA) return { ok: false, error: "sin espacio" };
      guardados.push(e);
      return { ok: true, id: `id-${guardados.length}` };
    },
    leer: async (it) => o.textos?.[it.id] ?? "",
    catalogo: async () => ({}),
  };
  return { d, guardados, creadas };
}

describe("fondos-biblioteca · piezas puras", () => {
  it("nombra el archivo con slug y extensión, sin acentos ni símbolos", () => {
    expect(nombreArchivoSet("Aurora Nandú")).toBe("aurora-nandu.starseed-fondo.json");
    expect(nombreArchivoSet("  ... ")).toBe("fondo.starseed-fondo.json");
  });

  it("reconoce solo los sets guardados (título .starseed-fondo.json y MIME JSON)", () => {
    expect(esSetGuardado(item())).toBe(true);
    expect(esSetGuardado(item({ mime: "image/png" }))).toBe(false);
    expect(esSetGuardado(item({ title: "foto.png" }))).toBe(false);
  });

  it("convierte un data: PNG a Blob real y rechaza lo que no lo es", async () => {
    const blob = blobDeDataUrl(PNG);
    expect(blob?.type).toBe(MIME_VISTA);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([137, 80, 78, 71]);
    expect(blobDeDataUrl("data:image/png;base64,@@")).toBeNull();
    expect(blobDeDataUrl("https://ejemplo/fondo.png")).toBeNull();
  });
});
describe("fondos-biblioteca · guardarSet", () => {
  it("guarda el JSON y su vista previa en la carpeta elegida", async () => {
    const { d, guardados } = dobles({ carpetas: [carpeta("f1", "Mis fondos")] });
    const r = await guardarSet(REF, set({ vistaPrevia: PNG }), "f1", d);
    expect(r).toMatchObject({ ok: true, carpetaId: "f1", itemId: "id-1", vistaId: "id-2", archivo: "aurora-nandu.starseed-fondo.json" });
    expect(guardados).toHaveLength(2);
    expect(guardados[0]).toMatchObject({ nombre: "aurora-nandu.starseed-fondo.json", mime: MIME_SET, carpetaId: "f1" });
    expect(guardados[1]).toMatchObject({ nombre: "aurora-nandu.vista.png", mime: MIME_VISTA, carpetaId: "f1" });
    expect(JSON.parse(await guardados[0].file.text())).toMatchObject({ formato: "starseed-fondo", id: "set-a", nombre: "Aurora Nandú" });
  });

  it("sin carpeta crea «Fondos» en la raíz; si ya existe, la reutiliza", async () => {
    const nuevo = dobles();
    expect(await guardarSet(REF, set(), null, nuevo.d)).toMatchObject({ ok: true, carpetaId: "nueva" });
    expect(nuevo.creadas).toEqual([{ nombre: CARPETA_FONDOS, padre: null }]);
    const ya = dobles({ carpetas: [carpeta("f9", CARPETA_FONDOS)] });
    expect(await guardarSet(REF, set(), null, ya.d)).toMatchObject({ ok: true, carpetaId: "f9" });
    expect(ya.creadas).toEqual([]);
  });

  it("un set inválido no se guarda y explica el motivo", async () => {
    const { d, guardados } = dobles({ carpetas: [carpeta("f1", "X")] });
    const capa: BackgroundLayer = { id: "s1", kind: "shader", visible: true, opacity: 1, blend: "normal", preset: { components: [{ type: "NoExiste" }] } };
    const r = await guardarSet(REF, set({ capas: [capa] }), "f1", d);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivos.join(" ")).toMatch(/desconocido/);
    expect(guardados).toHaveLength(0);
  });

  it("una carpeta que ya no existe no crea nada", async () => {
    const { d, guardados } = dobles();
    expect(await guardarSet(REF, set(), "fantasma", d)).toMatchObject({ ok: false });
    expect(guardados).toHaveLength(0);
  });

  it("si la vista previa falla, el set queda guardado y se avisa", async () => {
    const { d } = dobles({ carpetas: [carpeta("f1", "X")], fallaVista: true });
    expect(await guardarSet(REF, set({ vistaPrevia: PNG }), "f1", d)).toMatchObject({ ok: true, aviso: "sin espacio" });
  });
});
describe("fondos-biblioteca · listarSets", () => {
  it("lee los sets de cualquier carpeta, los valida y separa los rotos o ajenos", async () => {
    const { d } = dobles({
      items: [item({ id: "ok" }), item({ id: "roto", title: "roto.starseed-fondo.json" }), item({ id: "foto", title: "foto.png", mime: "image/png" })],
      textos: { ok: JSON.stringify(set()), roto: "{no es json" },
    });
    const r = await listarSets(REF, d);
    expect(r.sets).toHaveLength(1);
    expect(r.sets[0]).toMatchObject({ item: { id: "ok" }, carpetaId: null, set: { id: "set-a" } });
    expect(r.descartados).toHaveLength(1);
    expect(r.descartados[0].item.id).toBe("roto");
    expect(r.descartados[0].motivos.join(" ")).toMatch(/JSON/);
  });

  it("si la Biblioteca no se puede leer, lo dice sin lanzar", async () => {
    const d: DepsFondos = { listar: async () => { throw new Error("sin conexión"); }, catalogo: async () => ({}) };
    expect(await listarSets(REF, d)).toMatchObject({ sets: [], descartados: [], error: "sin conexión" });
  });
});
