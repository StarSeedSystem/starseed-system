import { describe, expect, it } from "vitest";
import { coverFor, storeItemToDetail } from "@/components/library/library-store-panel";
import type { StoreItem } from "@/lib/store/store-data";

describe("coverFor", () => {
  it("genera data URI SVG para cada categoría conocida", () => {
    const item: StoreItem = {
      id: "1",
      owner: "user1",
      category: "app",
      title: "Test App",
      description: "Test",
      payload: null,
      source_kind: "app",
      source_ref: null,
      license: "StarSeed Public",
      downloads: 0,
      rating: 0,
      ratings_count: 0,
      verified: false,
      shared: true,
    };
    const result = coverFor(item);
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("usa paleta por defecto para categoría desconocida", () => {
    const item: StoreItem = {
      id: "2",
      owner: "user1",
      category: "desconocida",
      title: "Test",
      description: "Test",
      payload: null,
      source_kind: null,
      source_ref: null,
      license: "StarSeed Public",
      downloads: 0,
      rating: 0,
      ratings_count: 0,
      verified: false,
      shared: true,
    };
    const result = coverFor(item);
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe("storeItemToDetail", () => {
  it("convierte StoreItem a LibraryDetailItem con cover local", () => {
    const item: StoreItem = {
      id: "3",
      owner: "user1",
      category: "app",
      title: "Mi App",
      description: "Una app de prueba",
      payload: null,
      source_kind: "app",
      source_ref: "ref1",
      license: "StarSeed Public",
      downloads: 42,
      rating: 4.5,
      ratings_count: 10,
      verified: true,
      shared: true,
    };
    const detail = storeItemToDetail(item);
    expect(detail.id).toBe("3");
    expect(detail.title).toBe("Mi App");
    expect(detail.category).toBe("app");
    expect(detail.categoryLabel).toBe("Apps");
    expect(detail.author).toBe("user1");
    expect(detail.license).toBe("StarSeed Public");
    expect(detail.rating).toBe(4.5);
    expect(detail.ratingsCount).toBe(10);
    expect(detail.downloads).toBe(42);
    expect(detail.verified).toBe(true);
    expect(detail.cover).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(detail.sourceLabel).toBe("Comunidad StarSeed");
    expect(detail.fileKind).toBe("app");
    expect(detail.origin).toBe("store");
    expect(detail.storeItem).toBe(item);
  });

  it("maneja owner null correctamente", () => {
    const item: StoreItem = {
      id: "4",
      owner: null,
      category: "widget",
      title: "Widget sin dueño",
      description: "Test",
      payload: null,
      source_kind: "widget",
      source_ref: null,
      license: "StarSeed Public",
      downloads: 0,
      rating: 0,
      ratings_count: 0,
      verified: false,
      shared: true,
    };
    const detail = storeItemToDetail(item);
    expect(detail.author).toBeUndefined();
  });
});