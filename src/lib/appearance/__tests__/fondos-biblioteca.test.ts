import { describe, it, expect, vi } from "vitest";
import { libraryRef, type EntityRef, type SavedItem, type LibraryFolder } from "@/lib/library/entity-library";
import { validarSet, exportarSet, type SetFondo, type OpcionesSet, FORMATO_SET, EXTENSION_SET } from "../sets-fondo";
import { construirCatalogo, type ShaderCatalog } from "../catalogo-shaders";
import { guardarSet, listarSets, type GuardarSetInput, type ListarSetsResult, FONDOS_FOLDER_NAME } from "../fondos-biblioteca";

const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Gradients", propsMetadata: { colorA: { default: "#000000" } } },
  { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "Aurora", category: "Gradients", propsMetadata: {} },
  { name: "FilmGrain", category: "Stylize", propsMetadata: {} },
]);
const BIB = "https://proyecto.supabase.co/storage/v1/object/public/os-files/";
const OPTS: OpcionesSet = { catalogo, biblioteca: [BIB] };
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`;

const createLayer = (kind: "shader" | "difusion", extra: Record<string, unknown> = {}): any => ({
  id: "l1",
  kind,
  name: "capa",
  visible: true,
  opacity: 1,
  blend: "normal",
  ...extra,
});

const shader = (components: unknown[]): any => ({
  ...createLayer("shader"),
  id: "s1",
  preset: { components },
});

const setBase = (capas: any[], extra: Record<string, unknown> = {}): SetFondo => ({
  formato: FORMATO_SET,
  version: 1,
  id: "set-1",
  nombre: "Aurora",
  base: null,
  capas,
  autor: "Alex",
  licencias: [],
  creado: "2026-10-23T10:00:00.000Z",
  ...extra,
});

const ref: EntityRef = { kind: "user", id: "user-123" };

const folderFondos: LibraryFolder = { id: "folder-fondos", name: FONDOS_FOLDER_NAME, parentId: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-123" };
const folderOtro: LibraryFolder = { id: "folder-otro", name: "Otra", parentId: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-123" };

const makeSavedItem = (item: Partial<SavedItem> = {}): SavedItem => ({
  id: "item-1",
  type: "design",
  title: "test.starseed-fondo.json",
  note: "{}",
  tags: [],
  folderId: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  addedBy: "user-123",
  ...item,
});

describe("fondos-biblioteca · guardarSet", () => {
  it("crea la carpeta 'Fondos' si no existe y guarda el set", async () => {
    const listLibrary = vi.fn().mockResolvedValue({ items: [], folders: [] });
    const createFolder = vi.fn().mockResolvedValue("folder-fondos");
    const saveItem = vi.fn().mockResolvedValue({ ok: true, id: "item-new" });

    const input: GuardarSetInput = {
      ref,
      set: setBase([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]),
      catalogo,
    };

    const res = await guardarSet({ ...input, listLibrary, createFolder, saveItem } as any);
    expect(res.ok).toBe(true);
    expect(res.itemId).toBe("item-new");
    expect(res.folderId).toBe("folder-fondos");
    expect(createFolder).toHaveBeenCalledWith(ref, FONDOS_FOLDER_NAME, null);
  });

  it("usa la carpeta indicada si se pasa carpetaId", async () => {
    const listLibrary = vi.fn().mockResolvedValue({ items: [], folders: [folderFondos, folderOtro] });
    const createFolder = vi.fn();
    const saveItem = vi.fn().mockResolvedValue({ ok: true, id: "item-new" });

    const input: GuardarSetInput = {
      ref,
      set: setBase([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]),
      carpetaId: "folder-otro",
      catalogo,
    };

    const res = await guardarSet({ ...input, listLibrary, createFolder, saveItem } as any);
    expect(res.ok).toBe(true);
    expect(res.folderId).toBe("folder-otro");
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("rechaza sets inválidos (componente desconocido)", async () => {
    const listLibrary = vi.fn().mockResolvedValue({ items: [], folders: [] });
    const createFolder = vi.fn().mockResolvedValue("folder-fondos");
    const saveItem = vi.fn();

    const input: GuardarSetInput = {
      ref,
      set: setBase([shader([{ type: "Minador" }])]),
      catalogo,
    };

    const res = await guardarSet({ ...input, listLibrary, createFolder, saveItem } as any);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/desconocido/);
    expect(saveItem).not.toHaveBeenCalled();
  });

  it("inyecta la licencia MIT de shaders cuando hay capas shader", async () => {
    const listLibrary = vi.fn().mockResolvedValue({ items: [], folders: [] });
    const createFolder = vi.fn().mockResolvedValue("folder-fondos");
    const saveItem = vi.fn().mockImplementation(async (_ref: EntityRef, item: any) => {
      const note = JSON.parse(item.note);
      expect(note.licencias).toContain("MIT · paquete npm «shaders» (Shader Effects Inc.)");
      return { ok: true, id: "item-new" };
    });

    const input: GuardarSetInput = {
      ref,
      set: setBase([shader([{ type: "Aurora" }])]),
      catalogo,
    };

    const res = await guardarSet({ ...input, listLibrary, createFolder, saveItem } as any);
    expect(res.ok).toBe(true);
  });
});

describe("fondos-biblioteca · listarSets", () => {
  it("lee y valida los sets de la carpeta Fondos", async () => {
    const exportRes = exportarSet(
      { nombre: "Aurora", base: "spline", capas: [shader([{ type: "Aurora" }])], autor: "Alex", vistaPrevia: PNG },
      { ...OPTS, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "set-fijo" }
    );
    if (!exportRes.ok) throw new Error(exportRes.motivos.join());

    const listLibrary = vi.fn().mockResolvedValue({
      items: [
        makeSavedItem({ id: "item-1", note: JSON.stringify(exportRes.set), folderId: "folder-fondos" }),
        makeSavedItem({ id: "item-2", note: '{"formato":"otro"}', folderId: "folder-fondos" }),
      ],
      folders: [folderFondos],
    });

    const res = await listarSets({ ref, catalogo, listLibrary } as any);
    expect(res.ok).toBe(true);
    expect(res.sets).toHaveLength(1);
    expect(res.sets[0]).toMatchObject({
      itemId: "item-1",
      folderId: "folder-fondos",
      folderName: FONDOS_FOLDER_NAME,
      nombre: "Aurora",
    });
  });

  it("ignora items que no son sets válidos", async () => {
    const listLibrary = vi.fn().mockResolvedValue({
      items: [
        makeSavedItem({ id: "item-1", note: '{"formato":"starseed-fondo","version":1,"id":"x","nombre":" ","base":null,"capas":[],"autor":"","licencias":[],"creado":"invalid"}' }),
        makeSavedItem({ id: "item-2", note: "no es json", folderId: "folder-fondos" }),
      ],
      folders: [folderFondos],
    });

    const res = await listarSets({ ref, catalogo, listLibrary } as any);
    expect(res.ok).toBe(true);
    expect(res.sets).toHaveLength(0);
  });

  it("incluye el nombre de la carpeta en el resultado", async () => {
    const exportRes = exportarSet(
      { nombre: "Cristal", base: null, capas: [shader([{ type: "LinearGradient", props: { colorA: "#fff" } }])], autor: "Alex" },
      { ...OPTS, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "set-fijo" }
    );
    if (!exportRes.ok) throw new Error(exportRes.motivos.join());

    const listLibrary = vi.fn().mockResolvedValue({
      items: [makeSavedItem({ id: "item-1", note: JSON.stringify(exportRes.set), folderId: "folder-otro" })],
      folders: [folderOtro],
    });

    const res = await listarSets({ ref, catalogo, listLibrary } as any);
    expect(res.ok).toBe(true);
    expect(res.sets[0].folderName).toBe("Otra");
  });

  it("devuelve error si falla listLibrary", async () => {
    const listLibrary = vi.fn().mockRejectedValue(new Error("Red caída"));
    const res = await listarSets({ ref, catalogo, listLibrary } as any);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Red caída/);
  });
});