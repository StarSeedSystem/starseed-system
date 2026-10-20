import { describe, it, expect } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

describe("debug", () => {
    it("debug property keys", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 });
        const keys = Object.keys(b.desconectar);
        console.log("keys:", keys);
        console.log("expla:", b.desconectar.explica);
        console.log("expla2:", b.desconectar.explica);
        console.log("expla3:", b.desconectar.explica);
        // Check all properties
        for (const key of keys) {
            console.log(`${key}:`, (b.desconectar as unknown as Record<string, unknown>)[key]);
        }
        expect(true).toBe(true);
    });
});
