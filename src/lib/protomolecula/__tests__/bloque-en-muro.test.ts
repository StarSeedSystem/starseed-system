import { describe, it, expect } from "vitest";
import { blockHasContent } from "@/components/creation/lienzo-composer";
import type { PostBlock } from "@/lib/creation/post-blocks";

describe("blockHasContent for protomolecula", () => {
    it("returns false for undefined code", () => {
        const block: PostBlock = { id: "1", type: "protomolecula" };
        expect(blockHasContent(block)).toBe(false);
    });

    it("returns false for null code", () => {
        const block: PostBlock = { id: "1", type: "protomolecula", code: null as unknown as string };
        expect(blockHasContent(block)).toBe(false);
    });

    it("returns false for empty string", () => {
        const block: PostBlock = { id: "1", type: "protomolecula", code: "" };
        expect(blockHasContent(block)).toBe(false);
    });

    it("returns false for whitespace only", () => {
        const block: PostBlock = { id: "1", type: "protomolecula", code: "   " };
        expect(blockHasContent(block)).toBe(false);
    });

    it("returns true for non-empty code", () => {
        const block: PostBlock = { id: "1", type: "protomolecula", code: "{" };
        expect(blockHasContent(block)).toBe(true);
    });
});
