import { describe, it, expect, vi } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";
import { createLayer, type BackgroundLayer } from "../background-layers";
import { guardarSet, listarSets } from "../fondos-biblioteca";
import { currentUserRef } from "@/lib/sync/entity-state";

vi.mock("@/lib/sync/entity-state", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    currentUserRef: async () => ({ kind: "user", id: "test-user" }),
  };
});

vi.mock("@/lib/consumo/usuario", () => ({
  uidActual: async () => "test-user",
}));

vi.mock("@/utils/supabase/client", () => {
  const chan = { on: () => chan, subscribe: () => chan, send: async () => ({}) };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: { id: "test-user" } } }),
      onAuthStateChange: (cb: any) => {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: () => {
      const table = {
        select: () => table,
        eq: () => table,
        single: () => table,
        insert: () => table,
        update: () => table,
        upsert: () => table,
        delete: () => table,
      };
      return table;
    },
  };
  return { createClient: () => client };
});

vi.mock("@/lib/files/os-files", () => ({
  uploadFile: async (file: any, options: any) => {
    return { ok: true, file: { url: `https://example.com/${options.folder}/${file.name}`, name: file.name, mime: file.type, id: "test-file-id" } };
  },
  deleteFile: async () => true,
}));

vi.mock("@/lib/library/entity-library", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    saveItem: async (ref: any, item: any, folderId?: any) => {
      return { ok: true, id: "saved-item-id" };
    },
    listLibrary: async (ref: any) => {
      return {
        items: [
          {
            id: "saved-item-id",
            type: "file",
            title: "Fondo Test",
            note: "Fondo con shader guardado",
            tags: ["fondo", "shader"],
            folderId: "test-folder-id",
            mime: "application/json",
            content: JSON.stringify({
              formato: "starseed-fondo",
              version: 1,
              id: "test-id",
              nombre: "Fondo Test",
              autor: "Test Author",
              licencias: [],
              base: "spline",
              capas: [{ kind: "difusion", difusion: { modo: "tono", tono: "#ffffff" } }],
              vistaPrevia: `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`,
              creado: "2026-10-23T10:00:00.000Z",
            }),
            createdAt: "2026-10-23T10:00:00.000Z",
            createdBy: "test-user",
          },
          {
            id: "saved-item-id2",
            type: "file",
            title: "Fondo A",
            note: "Fondo con shader guardado",
            tags: ["fondo", "shader"],
            folderId: "test-folder-id",
            mime: "application/json",
            content: JSON.stringify({
              formato: "starseed-fondo",
              version: 1,
              id: "test-id2",
              nombre: "Fondo A",
              autor: "Author",
              licencias: [],
              base: "spline",
              capas: [{ kind: "difusion", difusion: { modo: "tono", tono: "#ffffff" } }],
              vistaPrevia: `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`,
              creado: "2026-10-23T10:00:00.000Z",
            }),
            createdAt: "2026-10-23T10:00:00.000Z",
            createdBy: "test-user",
          },
          {
            id: "saved-item-id3",
            type: "file",
            title: "Fondo B",
            note: "Fondo con shader guardado",
            tags: ["fondo", "shader"],
            folderId: "test-folder-id",
            mime: "application/json",
            content: JSON.stringify({
              formato: "starseed-fondo",
              version: 1,
              id: "test-id3",
              nombre: "Fondo B",
              autor: "Author",
              licencias: [],
              base: "webgl",
              capas: [{ kind: "imagen", value: "https://example.com/test.png" }],
              vistaPrevia: `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`,
              creado: "2026-10-23T10:00:00.000Z",
            }),
            createdAt: "2026-10-23T10:00:00.000Z",
            createdBy: "test-user",
          },
        ],
        folders: [],
        rev: 0,
        updatedAt: "",
      };
    },
    createFolder: async (ref: any, name: string, parentId: any) => {
      return "new-folder-id";
    },
  };
});

const catalogo = construirCatalogo([
  { name: "LinearGradient", category: "Gradients", propsMetadata: { colorA: { default: "#000000" } } },
  { name: "ImageTexture", category: "Textures", propsMetadata: { url: { default: "https://shaders.com/sample.jpg" } } },
  { name: "Text", category: "Textures", propsMetadata: { text: { default: "Hola" } } },
  { name: "WebcamTexture", category: "Textures" },
]);
const BIB = "https://proyecto.supabase.co/storage/v1/object/public/os-files/";
const o = { catalogo, biblioteca: [BIB] };
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(40)}`;
const shader = (components: unknown[]): BackgroundLayer => ({ ...createLayer("shader"), id: "s1", preset: { components } });

const createTestSet = (nombre: string, autor: string, base: string | null = null, capas: unknown[] = []): any => (
  { formato: "starseed-fondo", version: 1, id: "test-id", nombre, autor, licencias: [], base, capas, vistaPrevia: PNG, creado: "2026-10-23T10:00:00.000Z" }
);

describe("fondos-biblioteca · guardar y listar", () => {
  const ref = { kind: "user", id: "test-user" };

  it("guarda un set de fondos en la biblioteca y luego lo lista", async () => {
    const set = createTestSet("Fondo Test", "Test Author", "spline", [shader([{ type: "LinearGradient", id: "g", props: { colorA: "#7C3AED" } }])]);

    const guardar = await guardarSet({ ref, set });
    expect(guardar.ok).toBe(true);
    expect(guardar.setId).toBeDefined();
    expect(guardar.archivo).toContain("fondo-test");

    const listar = await listarSets(ref);
    expect(listar.ok).toBe(true);
    expect(listar.sets).toBeDefined();
    expect(listar.sets?.length).toBeGreaterThan(0);
    expect(listar.sets?.[0].nombre).toBe("Fondo Test");
  });

  it("guarda un set en una carpeta específica", async () => {
    const set = createTestSet("Fondo Carpeta", "Author", null, [createLayer("difusion")]);

    const guardar = await guardarSet({ ref, set, carpetaId: "custom-folder-id" });
    expect(guardar.ok).toBe(true);
    expect(guardar.setId).toBeDefined();
  });

  it("lista fondos después de guardar varios", async () => {
    const sets = [
      createTestSet("Fondo A", "A", "spline", [createLayer("difusion")]),
      createTestSet("Fondo B", "B", "webgl", [createLayer("imagen"), { kind: "imagen", value: `${BIB}test.png` }]),
    ];

    for (const set of sets) {
      const guardar = await guardarSet({ ref, set });
      expect(guardar.ok).toBe(true);
    }

    const listar = await listarSets(ref);
    expect(listar.ok).toBe(true);
    expect(listar.sets?.length).toBeGreaterThanOrEqual(2);
    const nombres = listar.sets?.map((s: any) => s.nombre);
    expect(nombres).toContain("Fondo A");
    expect(nombres).toContain("Fondo B");
  });
});
