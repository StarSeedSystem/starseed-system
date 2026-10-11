/**
 * (2026-09-25) Los agentes externos (Claude en Cowork, subagentes, Hermes) aparecen en el
 * Genesis con su sitio dicho para personas.
 */
import { describe, expect, it } from "vitest";

import { dondeLegible } from "@/lib/mando/medidores";

describe("dondeLegible", () => {
    it("la Mac, Cowork y Hermes se dicen para personas; lo demás tal cual", () => {
        expect(dondeLegible("mac")).toBe("Mac de Alex (local)");
        expect(dondeLegible(undefined)).toBe("Mac de Alex (local)");
        expect(dondeLegible("cowork")).toMatch(/Cowork/);
        expect(dondeLegible("hermes")).toMatch(/Hermes/);
        // (PDA1012) La nube de GitHub y el A1 de Oracle también, para que el medidor «Agentes»
        // diga dónde trabaja cada uno; lo que no se conoce, tal cual.
        expect(dondeLegible("nube-gh")).toBe("GitHub Actions (nube)");
        expect(dondeLegible("oracle")).toMatch(/A1 de Oracle/);
        expect(dondeLegible("otro-medio")).toBe("otro-medio");
    });
});
