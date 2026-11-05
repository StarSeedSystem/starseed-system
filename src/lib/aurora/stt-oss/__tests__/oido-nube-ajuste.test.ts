import { describe, it, expect } from "vitest";
import { CLAVE_APAGADO } from "../oido-nube";

describe("oido-nube", () => {
    it("debería exportar la clave de apagado", () => {
        expect(CLAVE_APAGADO).toBe("starseed.oido.nube");
    });
});
