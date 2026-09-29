// @vitest-environment jsdom
/**
 * Centro «Configurar Neurona»: el «ya pasé por aquí» con la cuenta (2026-09-29, persistencia
 * entre medios). Antes solo vivía en `starseed.aurora.setup.v1` y cada medio nuevo lo ofrecía de
 * nuevo mientras su localStorage estuviera vacío.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    AURORA_SETUP_KEY,
    AVISO_SETUP_CENTRO,
    SETUP_VERSION,
    copiarSetupLocalACuenta,
    isSetupPending,
    markSetupDone,
    resetSetupState,
} from "../setup-config";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

function cuenta(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

beforeEach(() => {
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
});

describe("isSetupPending / markSetupDone con la cuenta", () => {
    it("medio vacío y cuenta vacía: pendiente", () => {
        expect(isSetupPending()).toBe(true);
    });

    it("markSetupDone lo deja hecho aquí Y en la cuenta", () => {
        markSetupDone();
        expect(isSetupPending()).toBe(false);
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
        expect(JSON.parse(localStorage.getItem(AURORA_SETUP_KEY)!).done).toBe(true);
    });

    it("un medio NUEVO con la cuenta ya bajada (solo avisos) no lo ofrece de nuevo", () => {
        cuenta({ [AVISO_SETUP_CENTRO]: { estado: "hecho", ts: 5 } });
        expect(localStorage.getItem(AURORA_SETUP_KEY)).toBeNull();
        expect(isSetupPending()).toBe(false);
    });

    it("un «hecho» antiguo solo en la clave local se respeta y se copia a la cuenta", () => {
        localStorage.setItem(AURORA_SETUP_KEY, JSON.stringify({ done: true, version: SETUP_VERSION, at: "2026-08-01T00:00:00Z" }));
        expect(isSetupPending()).toBe(false);
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBeNull();
        copiarSetupLocalACuenta();
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
        copiarSetupLocalACuenta(); // idempotente
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBe("hecho");
    });

    it("hecho con un esquema ANTERIOR sigue pendiente (salvo que la cuenta lo tenga de la versión actual)", () => {
        localStorage.setItem(AURORA_SETUP_KEY, JSON.stringify({ done: true, version: 0, at: "" }));
        expect(isSetupPending()).toBe(true);
        copiarSetupLocalACuenta(); // no copia un «hecho» de un esquema viejo
        expect(estadoAviso(AVISO_SETUP_CENTRO).estado).toBeNull();
        cuenta({ [AVISO_SETUP_CENTRO]: { estado: "hecho", ts: 9 } });
        expect(isSetupPending()).toBe(false);
    });

    it("«reconfigurar desde cero» vuelve a dejarlo pendiente aunque la cuenta lo tuviera hecho", () => {
        markSetupDone();
        expect(isSetupPending()).toBe(false);
        resetSetupState();
        expect(isSetupPending()).toBe(true);
        expect(estadoAviso(AVISO_SETUP_CENTRO)).toMatchObject({ estado: "luego", hasta: 0 });
    });

    it("el id lleva la versión del esquema (si sube, se vuelve a ofrecer)", () => {
        expect(AVISO_SETUP_CENTRO).toBe(`aurora.setup.centro.v${SETUP_VERSION}`);
    });
});
