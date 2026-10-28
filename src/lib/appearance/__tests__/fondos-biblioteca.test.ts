// Pruebas de fondos-biblioteca (Ola 1018F · FSH1018I). Funciones puras + deps inyectables.
import { describe, it, expect, vi } from "vitest";
import { guardarSet, listarSets } from "../fondos-biblioteca";
import { libraryRef } from "@/lib/library/entity-library";
import type { SetFondo } from "../sets-fondo";

const setMin = (): SetFondo => ({
  formato: "starseed-fondo",
  version: 1,
  id: "s1",
  nombre: "Aurora",
  autor: "Alex",
  licencias: [],
  base: null,
  capas: [],
  creado: "2026-10-24T10:00:00.000Z",
});

describe("fondos-biblioteca · guardarSet", () => {
  it("guarda en carpeta elegida si se pasa carpetaId", async () => {
    const ref = libraryRef("user", "u1");
    const deps = {
      ensureMediaFolders: vi.fn(async () => ({ rootId: "r", subfolders: {} })),
      saveMediaToLibrary: vi.fn(async (_ref, input) => ({ ok: true, itemId: "it1", folderId: input.destFolderId })),
      listLibrary: vi.fn(async () => ({ folders: [], items: [] })),
    };
    const res = await guardarSet(ref, setMin(), "carp-123", { deps, opcionesSet: { catalogo: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.folderId).toBe("carp-123");
    expect(deps.saveMediaToLibrary).toHaveBeenCalled();
    const call = deps.saveMediaToLibrary.mock.calls[0][1];
    expect(call.destFolderId).toBe("carp-123");
    expect(call.name).toMatch(/\.starseed-fondo\.json$/);
    expect(call.origin).toBe("Importadas");
  });

  it("crea/usa carpeta «Fondos» si no se pasa carpetaId", async () => {
    const ref = libraryRef("user", "u1");
    const deps = {
      ensureMediaFolders: vi.fn(async () => ({ rootId: "root1", subfolders: {} })),
      saveMediaToLibrary: vi.fn(async (_ref, input) => ({ ok: true, itemId: "it2", folderId: input.destFolderId })),
      listLibrary: vi.fn(async () => ({ folders: [{ id: "f-fondos", parentId: null, name: "Fondos" }], items: [] })),
    };
    const res = await guardarSet(ref, setMin(), undefined, { deps, opcionesSet: { catalogo: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.folderId).toBe("f-fondos");
  });
});

describe("fondos-biblioteca · listarSets", () => {
  it("lee y valida con sets-fondo.ts", async () => {
    const ref = libraryRef("user", "u1");
    const s = setMin();
    const deps = { ensureMediaFolders: vi.fn(), saveMediaToLibrary: vi.fn() };
    const listLibrary = vi.fn(async () => ({ folders: [], items: [{ id: "i1", content: JSON.stringify(s) }] }));
    const res = await listarSets(ref, { deps, listLibrary, opcionesSet: { catalogo: {} } as any });
    expect(res.ok).toBe(true);
    expect(res.sets.length).toBe(1);
    expect(res.sets[0].id).toBe("s1");
    expect(res.sets[0].nombre).toBe("Aurora");
  });
});
