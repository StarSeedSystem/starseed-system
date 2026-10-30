import { describe, it, expect } from "vitest";

describe("jsdom · viewport", () => {
    it("asignación de innerWidth", () => {
        window.innerWidth = 390;
        expect(window.innerWidth).toBe(390);
    });
});
