import { describe, it, expect } from "vitest";
import { permitirEntrada } from "./rele-salas";

describe("rele-salas", () => {
    it("debería permitir entrar con tema válido y dentro de límites", () => {
        // Assuming the function takes a tema (string) and returns a boolean
        // We don't know the exact valid temas, so we test with a non-empty string as an example
        expect(permitirEntrada("tema1")).toBe(true);
        // We also expect that an empty string is not allowed
        expect(permitirEntrada("")).toBe(false);
    });
});