import { describe, it, expect } from "vitest";
import {
    ajustesCapasEntidadGuardados,
} from "@/lib/astraura/use-capas-entidad";
import {
    AJUSTES_VACIOS,
    CLAVE_CAPAS_ENTIDAD,
} from "@/lib/astraura/capas-entidad";

function almacenFalso(valor: string | null): Pick<Storage, "getItem"> {
    return { getItem: () => valor };
}

describe("ajustesCapasEntidadGuardados", () => {
    it("sin almacén devuelve los ajustes vacíos", () => {
        expect(ajustesCapasEntidadGuardados(null)).toEqual(AJUSTES_VACIOS);
    });

    it("sin valor guardado devuelve los ajustes vacíos", () => {
        expect(ajustesCapasEntidadGuardados(almacenFalso(null))).toEqual(AJUSTES_VACIOS);
    });

    it("con JSON roto devuelve los ajustes vacíos", () => {
        expect(ajustesCapasEntidadGuardados(almacenFalso("{roto"))).toEqual(AJUSTES_VACIOS);
    });

    it("lee ajustes válidos y descarta campos que no son booleanos", () => {
        const guardado = JSON.stringify({
            personalidades: {
                sabia: { activo: true, local: false, trampa: "no-vale" },
            },
            agentes: {
                explorador: { mesh: true },
            },
        });
        expect(ajustesCapasEntidadGuardados(almacenFalso(guardado))).toEqual({
            personalidades: { sabia: { activo: true, local: false } },
            agentes: { explorador: { mesh: true } },
        });
    });

    it("un almacén que lanza devuelve los ajustes vacíos", () => {
        const roto: Pick<Storage, "getItem"> = {
            getItem: () => {
                throw new Error("denegado");
            },
        };
        expect(ajustesCapasEntidadGuardados(roto)).toEqual(AJUSTES_VACIOS);
        expect(CLAVE_CAPAS_ENTIDAD).toBe("starseed.astraura.capas-entidad.v1");
    });
});
