import { describe, expect, it } from "vitest";

import { tocaRecoger } from "../creditos-pago-tipos";

describe("tocaRecoger", () => {
    const ahora = 1_000_000;

    it("nunca recoge de nuevo en el mismo instante", () => {
        expect(tocaRecoger(ahora, false, ahora)).toBe(false);
    });

    it("recoge la primera vez", () => {
        expect(tocaRecoger(null, false, ahora)).toBe(true);
    });

    it("espera si han pasado menos de 60 segundos", () => {
        expect(tocaRecoger(ahora - 59_999, false, ahora)).toBe(false);
    });

    it("recoge al cumplir 60 segundos", () => {
        expect(tocaRecoger(ahora - 60_000, false, ahora)).toBe(true);
    });

    it("no recoge mientras otra recogida está en marcha", () => {
        expect(tocaRecoger(null, true, ahora)).toBe(false);
        expect(tocaRecoger(ahora - 60_000, true, ahora)).toBe(false);
    });
});
