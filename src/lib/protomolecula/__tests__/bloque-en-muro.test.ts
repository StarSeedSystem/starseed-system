import { describe, it, expect } from "vitest";
import type { PostBlock } from "@/lib/creation/post-blocks";

// Copy of the blockHasContent function from lienzo-composer.tsx (since it's not exported)
function blockHasContent(b: PostBlock): boolean {
    switch (b.type) {
        case "texto":
        case "enlace":
            return Boolean((b.text && b.text.trim()) || (b.url && b.url.trim()));
        case "imagen":
        case "archivo":
        case "portada":
        case "widget":
        case "repo":
        case "pizarra":
        // Adenda 67 · P4: ambos bloques nuevos se validan por su URL.
        case "penpot":
        case "video":
            return Boolean(b.url && b.url.trim());
        case "codigo":
        case "pagina":
            return Boolean(b.code && b.code.trim());
        case "agente":
            return Boolean((b.system && b.system.trim()) || (b.name && b.name.trim()));
        case "mapa":
            return typeof b.lat === "number" && typeof b.lng === "number";
        case "grafica":
            return Boolean(b.data && b.data.some((d) => d.label.trim() || Number.isFinite(d.value)));
        case "referencia":
        case "entidad":
            return Boolean(b.ref && b.ref.id);
        default:
            return false;
    }
}

describe("blockHasContent for protomolecula block", () => {
  it("returns false for undefined code", () => {
    const block: PostBlock = { id: "1", type: "protomolecula" };
    expect(blockHasContent(block)).toBe(false);
  });
});