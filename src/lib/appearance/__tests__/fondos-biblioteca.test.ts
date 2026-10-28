import { describe, it, expect, vi } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";
import { createLayer, type BackgroundLayer } from "../background-layers";
import { exportarSet, importarSet, validarSet, type SetFondo, type OpcionesSet } from "../sets-fondo";
import { guardarSet, listarSets, FONDOS_FOLDER_NAME, SET_EXTENSION } from "../fondos-biblioteca";
import type { EntityRef, SavedItem, LibraryFolder, MediaFolders, SaveMediaResult } from "@/lib/library/media-library";
import type { EntityLibraryDoc } from "@/lib/library/entity-library";

const catalogo = construirCatalogo([
    { name: "LinearGradient", category: "Gradients", propsMetadata: { colorA: { default: "#000000" } } },
    { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
    { name: "WebcamTexture", category: "Textures" },
]);
const BIB = "https://proyecto.supabase.co/storage/v1/object/public/os-files/";
const o: OpcionesSet = { catalogo, biblioteca: [BIB] };
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`;
const shader = (components: unknown[]): BackgroundLayer => ({ ...createLayer("shader"), id: "s1", preset: { components } });
const baseSet = (capas: BackgroundLayer[], extra: Record<string, unknown> = {}): SetFondo => ({
    formato: "starseed-fondo",
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
const ref: EntityRef = { kind: "user", id: "user-1" };
const mediaFolders: MediaFolders = {
    rootId: "folder-root",
    subfolders: { Cámara: "folder-cam", Importadas: "folder-imp", Capturas: "folder-cap" },
};
const fondossFolder: LibraryFolder = { id: "folder-fondos", name: FONDOS_FOLDER_NAME, parentId: "folder-root", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-1" };
const rootFolder: LibraryFolder = { id: "folder-root", name: "Imágenes y videos", parentId: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-1" };

function makeSavedItem(overrides: Partial<SavedItem> = {}): SavedItem {
    return {
        id: "item-1",
        type: "file",
        title: "test.starseed-fondo.json",
        note: undefined,
        tags: ["fondo", "set"],
        folderId: "folder-fondos",
        addedAt: "2026-10-23T10:00:00.000Z",
        addedBy: "user-1",
        mime: "application/json",
        url: "https://example.com/test.starseed-fondo.json",
        ...overrides,
    };
}

function makeLibraryDoc(items: SavedItem[] = [], folders: LibraryFolder[] = [rootFolder, fondossFolder]): EntityLibraryDoc {
    return {
        items,
        folders,
        rev: 1,
        updatedAt: "2026-10-23T10:00:00.000Z",
        version: 3,
    };
}

describe("fondos-biblioteca · guardarSet", () => {
    it("guarda el set JSON y la vista previa en la carpeta Fondos (creándola si falta)", async () => {
        const set = baseSet([shader([{ type: "LinearGradient", id: "g", props: { colorA: "#7C3AED" } }]), createLayer("difusion")], { vistaPrevia: PNG });
        const ensureFolders = vi.fn().mockResolvedValue(mediaFolders);
        const saveMedia = vi.fn().mockImplementation(async (_ref: EntityRef, input: { name: string }) => {
            const ok: SaveMediaResult = { ok: true, itemId: `item-${input.name}`, folderId: "folder-fondos" };
            return ok;
        });
        const moveItem = vi.fn().mockResolvedValue(undefined);
        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc([], [rootFolder]));

        const res = await guardarSet(ref, { set }, o, {
            ensureFolders,
            saveMedia,
            moveItem,
        });

        expect(res.ok).toBe(true);
        expect(res.itemId).toBeDefined();
        expect(res.previewItemId).toBeDefined();
        expect(ensureFolders).toHaveBeenCalledWith(ref);
        expect(saveMedia).toHaveBeenCalledTimes(2);
    });

    it("usa carpetaId proporcionada en lugar de crear/usar Fondos", async () => {
        const set = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const saveMedia = vi.fn().mockImplementation(async (_ref: EntityRef, input: { name: string, destFolderId: string }) => {
            const ok: SaveMediaResult = { ok: true, itemId: `item-${input.name}`, folderId: input.destFolderId };
            return ok;
        });
        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc());

        const res = await guardarSet(ref, { set, carpetaId: "folder-custom" }, o, {
            saveMedia,
            ensureFolders: vi.fn().mockResolvedValue(mediaFolders),
            moveItem: vi.fn().mockResolvedValue(undefined),
        });

        expect(res.ok).toBe(true);
        // saveMedia fue llamado con algún ref y los params correctos; verificamos el destFolderId
        const calledWith = saveMedia.mock.calls[0];
        expect(calledWith).toBeDefined();
        expect(calledWith[1]).toMatchObject({ destFolderId: "folder-custom" });
    });

    it("rechaza un set inválido antes de intentar guardar", async () => {
        const setInvalido = baseSet([shader([{ type: "ComponenteInexistente" }])]);
        const res = await guardarSet(ref, { set: setInvalido }, o, {
            ensureFolders: vi.fn().mockResolvedValue(mediaFolders),
            saveMedia: vi.fn(),
            moveItem: vi.fn(),
        });

        expect(res.ok).toBe(false);
        expect(res.error).toContain("Set inválido");
    });

    it("guarda solo el JSON si no hay vistaPrevia", async () => {
        const set = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const saveMedia = vi.fn().mockResolvedValue({ ok: true, itemId: "item-set", folderId: "folder-fondos" });

        const res = await guardarSet(ref, { set }, o, {
            ensureFolders: vi.fn().mockResolvedValue(mediaFolders),
            saveMedia,
            moveItem: vi.fn().mockResolvedValue(undefined),
            listLibrary: vi.fn().mockResolvedValue(makeLibraryDoc()),
        });

        expect(res.ok).toBe(true);
        expect(res.previewItemId).toBeUndefined();
        expect(saveMedia).toHaveBeenCalledTimes(1);
    });

    it("propaga errores de saveMedia", async () => {
        const set = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const saveMedia = vi.fn().mockResolvedValue({ ok: false, error: "Error de red" });

        const res = await guardarSet(ref, { set }, o, {
            ensureFolders: vi.fn().mockResolvedValue(mediaFolders),
            saveMedia,
            moveItem: vi.fn().mockResolvedValue(undefined),
            listLibrary: vi.fn().mockResolvedValue(makeLibraryDoc()),
        });

        expect(res.ok).toBe(false);
        expect(res.error).toContain("Error de red");
    });
});

describe("fondos-biblioteca · listarSets", () => {
    it("lee y valida todos los .starseed-fondo.json de la biblioteca", async () => {
        const setValido = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const e = exportarSet({ nombre: "Aurora", base: "spline", capas: setValido.capas, autor: "Alex", vistaPrevia: PNG }, { ...o, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "set-1" });
        if (!e.ok) throw new Error(e.motivos.join());

        const item = makeSavedItem({ title: "set-1.starseed-fondo.json", url: "https://example.com/set-1.starseed-fondo.json" });
        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc([item]));
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(e.json) });
        vi.stubGlobal("fetch", fetchMock);

        const res = await listarSets(ref, o, { listLibrary: listLib });

        expect(res.ok).toBe(true);
        expect(res.sets).toHaveLength(1);
        expect(res.sets[0].id).toBe("set-1");
        expect(fetchMock).toHaveBeenCalledWith("https://example.com/set-1.starseed-fondo.json");
    });

    it("ignora archivos que no son sets (otros JSON, imágenes, etc.)", async () => {
        const items = [
            makeSavedItem({ title: "otro.json", mime: "application/json", url: "https://example.com/otro.json" }),
            makeSavedItem({ title: "imagen.png", mime: "image/png", url: "https://example.com/imagen.png" }),
            makeSavedItem({ title: "set-1.starseed-fondo.json", url: "https://example.com/set-1.starseed-fondo.json" }),
        ];
        const setValido = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const e = exportarSet({ nombre: "Aurora", base: "spline", capas: setValido.capas, autor: "Alex", vistaPrevia: PNG }, { ...o, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "set-1" });
        if (!e.ok) throw new Error(e.motivos.join());

        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc(items));
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(e.json) });
        vi.stubGlobal("fetch", fetchMock);

        const res = await listarSets(ref, o, { listLibrary: listLib });

        expect(res.ok).toBe(true);
        expect(res.sets).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("ignora sets que fallan la validación al importar", async () => {
        const itemValido = makeSavedItem({ title: "set-ok.starseed-fondo.json", url: "https://example.com/set-ok.starseed-fondo.json" });
        const itemInvalido = makeSavedItem({ title: "set-bad.starseed-fondo.json", url: "https://example.com/set-bad.starseed-fondo.json" });
        const setValido = baseSet([shader([{ type: "LinearGradient", props: { colorA: "#7C3AED" } }])]);
        const e = exportarSet({ nombre: "Aurora", base: "spline", capas: setValido.capas, autor: "Alex", vistaPrevia: PNG }, { ...o, ahora: () => new Date("2026-10-23T10:00:00Z"), crearId: () => "set-ok" });
        if (!e.ok) throw new Error(e.motivos.join());

        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc([itemValido, itemInvalido]));
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(e.json) })
            .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("{no es json}") });
        vi.stubGlobal("fetch", fetchMock);

        const res = await listarSets(ref, o, { listLibrary: listLib });

        expect(res.ok).toBe(true);
        expect(res.sets).toHaveLength(1);
    });

    it("devuelve error si listLibrary falla", async () => {
        const listLib = vi.fn().mockRejectedValue(new Error("Error de red"));

        const res = await listarSets(ref, o, { listLibrary: listLib });

        expect(res.ok).toBe(false);
        expect(res.error).toContain("Error de red");
        expect(res.sets).toEqual([]);
    });

    it("devuelve lista vacía si no hay sets", async () => {
        const listLib = vi.fn().mockResolvedValue(makeLibraryDoc([]));

        const res = await listarSets(ref, o, { listLibrary: listLib });

        expect(res.ok).toBe(true);
        expect(res.sets).toEqual([]);
    });
});