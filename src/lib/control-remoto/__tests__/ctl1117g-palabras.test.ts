/** CTL1117G · descartar el aviso fijo ya no es una parada: no hay frase para ella. */
import { describe, expect, it } from "vitest";
import { claveParadaNativa, palabrasMotivo } from "../palabras";

describe("CTL1117G · sin parada por «aviso descartado»", () => {
    it("un aparato anterior que aún dijera notificacion-descartada se muestra con su motivo, sin frase propia", () => {
        const clave = claveParadaNativa("parada-nativa", { detalle: { motivo: "notificacion-descartada" } });
        const f = palabrasMotivo(clave) ?? "";
        expect(f).not.toMatch(/sin aviso no hay control/);
    });
});
