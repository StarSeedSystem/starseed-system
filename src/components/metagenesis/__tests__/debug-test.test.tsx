import { describe, it, expect } from "vitest";
import { botonesNeurona } from "@/lib/metagenesis/colmena";

describe("debug", () => {
    it("debug property keys", () => {
        const b = botonesNeurona({ nodo: "mac-a1b2c3", vivo: true, so: "macos", enCurso: 1 });
        const keys = Object.keys(b.desconectar);
        console.log("keys:", keys);
        console.log("expla:", b.desconector?.excla);
        console.log("expla2:", b.desconectar.excla);
        console.log("expla3:", b.desconectar.expla);
        // Check all properties
        for (const key of keys) {
            console.log(`${key}:`, b.desconectar[key]);
        }
        expect(true).toBe(true);
    });
});
