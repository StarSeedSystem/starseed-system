/**
 * Capas por entidad en el enrutador (Ola 1003 · §19): `capasEfectivasPara`
 * resuelve cuenta → personalidad → agente. Función pura, sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import { capasEfectivasPara, DEFAULT_INTELLIGENCE } from "@/ai/astraura/router";
import { AJUSTES_VACIOS, fijarCapa, type AjustesCapasEntidad } from "@/lib/astraura/capas-entidad";

const prefs = { ...DEFAULT_INTELLIGENCE };

describe("capasEfectivasPara (Ola 1003 · §19)", () => {
    it("sin ajustes por entidad devuelve exactamente la cuenta", () => {
        const r = capasEfectivasPara({ ...prefs, astraura158Activo: false, capa158Local: false }, true, AJUSTES_VACIOS, {});
        expect(r.preferencia.activo).toBe(false);
        expect(r.preferencia.capas.local).toBe(false);
        expect(r.contextoPersonal).toBe(true);
        const r2 = capasEfectivasPara(prefs, false, AJUSTES_VACIOS, {});
        expect(r2.contextoPersonal).toBe(false);
    });

    it("un agente con contextoPersonal apagado lo apaga solo para él", () => {
        let ajustes: AjustesCapasEntidad = AJUSTES_VACIOS;
        ajustes = fijarCapa(ajustes, "agente", "ag-1", "contextoPersonal", false);
        const paraEl = capasEfectivasPara(prefs, true, ajustes, { agenteId: "ag-1" });
        expect(paraEl.contextoPersonal).toBe(false);
        const paraOtro = capasEfectivasPara(prefs, true, ajustes, { agenteId: "ag-2" });
        expect(paraOtro.contextoPersonal).toBe(true);
    });

    it("una personalidad apaga el 1.58 para ella y el agente puede volver a encenderlo", () => {
        let ajustes: AjustesCapasEntidad = AJUSTES_VACIOS;
        ajustes = fijarCapa(ajustes, "personalidad", "aurora", "activo", false);
        const soloPersonalidad = capasEfectivasPara(prefs, true, ajustes, { personalidadId: "aurora" });
        expect(soloPersonalidad.preferencia.activo).toBe(false);
        // Otra personalidad no se ve afectada.
        expect(capasEfectivasPara(prefs, true, ajustes, { personalidadId: "hermione" }).preferencia.activo).toBe(true);
        // El agente manda sobre la personalidad y lo vuelve a encender.
        ajustes = fijarCapa(ajustes, "agente", "ag-1", "activo", true);
        const conAgente = capasEfectivasPara(prefs, true, ajustes, { personalidadId: "aurora", agenteId: "ag-1" });
        expect(conAgente.preferencia.activo).toBe(true);
    });
});
