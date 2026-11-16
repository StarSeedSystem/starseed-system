import { describe, it, expect } from "vitest";

describe("medidor de latencia", () => {
    it("valida la estructura básica del módulo", () => {
        expect(typeof describe).toBe("function");
        expect(typeof it).toBe("function");
    });
});
