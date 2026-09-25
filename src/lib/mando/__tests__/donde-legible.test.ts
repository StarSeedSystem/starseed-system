/**
 * (2026-09-25) Los agentes externos (Claude en Cowork, subagentes, Hermes) aparecen en el
 * Mando con su sitio dicho para personas.
 */
import { describe, expect, it } from "vitest";

import { dondeLegible } from "@/lib/mando/medidores";

describe("dondeLegible", () => {
    it("la Mac, Cowork y Hermes se dicen para personas; lo demás tal cual", () => {
        expect(dondeLegible("mac")).toBe("Mac de Alex (local)");
        expect(dondeLegible(undefined)).toBe("Mac de Alex (local)");
        expect(dondeLegible("cowork")).toMatch(/Cowork/);
        expect(dondeLegible("hermes")).toMatch(/Hermes/);
        expect(dondeLegible("nube-gh")).toBe("nube-gh");
    });
});
