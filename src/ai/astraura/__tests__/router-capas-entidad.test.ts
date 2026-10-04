/**
 * Capas efectivas por entidad del enrutador (Ola 1003 · §19): `capasEfectivasPara`
 * resuelve cuenta → personalidad → agente sin red ni disco. Un agente puede apagar
 * el contexto personal solo para él; una personalidad puede apagar el 1.58 y el
 * agente volver a encenderlo encima.
 */
import { describe, expect, it } from "vitest";
import { capasEfectivasPara, DEFAULT_INTELLIGENCE } from "@/ai/astraura/router";
import { AJUSTES_VACIOS, fijarCapa, type AjustesCapasEntidad } from "@/lib/astraura/capas-entidad";

const prefs = { ...DEFAULT_INTELLIGENCE };

describe("capasEfectivasPara · capas por entidad", () => {
    it("sin ajustes guardados devuelve exactamente lo de la cuenta", () => {
        const ef = capasEfectivasPara(prefs, true, AJUSTES_VACIOS, { personalidadId: "aurora", agenteId: "a1" });
        expect(ef.preferencia.activo).toBe(true);
        expect(ef.preferencia.capas).toEqual({ local: true, mesh: true, nube: true, colectiva: true });
        expect(ef.contextoPersonal).toBe(true);
        const conCuentaApagada = capasEfectivasPara({ ...prefs, capa158Nube: false }, false, AJUSTES_VACIOS, {});
        expect(conCuentaApagada.preferencia.capas.nube).toBe(false);
        expect(conCuentaApagada.contextoPersonal).toBe(false);
    });

    it("un agente con contextoPersonal:false lo apaga solo para él", () => {
        const ajustes: AjustesCapasEntidad = fijarCapa(AJUSTES_VACIOS, "agente", "a1", "contextoPersonal", false);
        const conAgente = capasEfectivasPara(prefs, true, ajustes, { agenteId: "a1" });
        expect(conAgente.contextoPersonal).toBe(false);
        const otroAgente = capasEfectivasPara(prefs, true, ajustes, { agenteId: "a2" });
        expect(otroAgente.contextoPersonal).toBe(true);
        // el resto de campos sigue siendo el de la cuenta
        expect(conAgente.preferencia.activo).toBe(true);
    });

    it("personalidad con activo:false apaga el 1.58 y el agente puede reencenderlo", () => {
        let ajustes = fijarCapa(AJUSTES_VACIOS, "personalidad", "p1", "activo", false);
        const dePersonalidad = capasEfectivasPara(prefs, true, ajustes, { personalidadId: "p1" });
        expect(dePersonalidad.preferencia.activo).toBe(false);
        // el agente manda sobre la personalidad
        ajustes = fijarCapa(ajustes, "agente", "a1", "activo", true);
        const delAgente = capasEfectivasPara(prefs, true, ajustes, { personalidadId: "p1", agenteId: "a1" });
        expect(delAgente.preferencia.activo).toBe(true);
        // sin ese agente, sigue mandando la personalidad
        const sinAgente = capasEfectivasPara(prefs, true, ajustes, { personalidadId: "p1", agenteId: "otro" });
        expect(sinAgente.preferencia.activo).toBe(false);
    });
});
