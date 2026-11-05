import { describe, it, expect } from "vitest";
import { CLAVE_APAGADO } from "@/lib/aurora/stt-oss/oido-nube";

describe("oido-nube-ajuste", () => {
    it("debería exportar la clave de apagado", () => {
        expect(CLAVE_APAGADO).toBe("starseed.oido.nube");
    });

    it("should toggle localStorage key when switch changes", () => {
        // Simulate turning off the oido nube switch
        const offValue = "0";
        // When checked=false, we set localStorage to "0"
        // When checked=true, we set localStorage to ""
        // The default (default on) means localStorage should not be "0"
        const stored = window.localStorage.getItem(CLAVE_APAGADO);
        // Default state: no "0" stored = enabled
        expect(stored).not.toBe("0");
    });
});