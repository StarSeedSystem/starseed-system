import { describe, expect, it } from "vitest";
import { FICHAS_REPOS_1028 } from "../packages";

describe("packages.ts · re-export de tanda 1028", () => {
    it("expone FICHAS_REPOS_1028 a través de packages.ts", () => {
        expect(FICHAS_REPOS_1028).toBeDefined();
        expect(Array.isArray(FICHAS_REPOS_1028)).toBe(true);
        expect(FICHAS_REPOS_1028).toHaveLength(1);
        expect(FICHAS_REPOS_1028[0].id).toBe("lib-leann");
    });

    it("la ficha re-exportada tiene los campos esperados de LEANN", () => {
        const leann = FICHAS_REPOS_1028.find((p) => p.id === "lib-leann");
        expect(leann).toBeDefined();
        expect(leann?.kind).toBe("ai-source");
        expect(leann?.payload?.corre_aqui).toBe(false);
        expect(leann?.payload?.licencia).toMatch(/MIT/);
    });
});
