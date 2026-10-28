import { describe, it, expect } from "vitest";
import {
    MOVIMIENTO_POR_DEFECTO,
    normalizarRegistroMovimiento,
    registroMovimientoEfectivo,
    type TemaEntidad,
} from "@/lib/design/entity-theme-scope";
import { variacionPara, type ContextoVisual } from "@/lib/design/variaciones-contexto";
import type { RegistroMovimiento } from "@/lib/design/registros-movimiento";

const VALIDOS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];

/** Contexto mínimo y estable para probar la variación pública. */
function contexto(parcial?: Partial<ContextoVisual>): ContextoVisual {
    return {
        area: "/network/politics",
        horaLocal: 14,
        densidadInformacion: "media",
        movimientoReducido: false,
        dispositivoModesto: false,
        ...parcial,
    };
}

describe("normalizarRegistroMovimiento", () => {
    it("conserva los tres registros conocidos", () => {
        for (const registro of VALIDOS) {
            expect(normalizarRegistroMovimiento(registro)).toBe(registro);
        }
    });

    it("cualquier valor desconocido vuelve al defecto «sobrio»", () => {
        const desconocidos: unknown[] = ["", "caótico", "SOBRIO", null, undefined, 7, true, {}, []];
        for (const valor of desconocidos) {
            expect(normalizarRegistroMovimiento(valor)).toBe(MOVIMIENTO_POR_DEFECTO);
        }
        expect(MOVIMIENTO_POR_DEFECTO).toBe("sobrio");
    });
});

describe("registroMovimientoEfectivo — defecto y retrocompatibilidad", () => {
    it("sin capas o sin movimiento propio devuelve «sobrio»", () => {
        expect(registroMovimientoEfectivo({})).toBe("sobrio");
        expect(registroMovimientoEfectivo({ cuenta: null, pagina: null, grupo: null })).toBe("sobrio");
    });

    it("un tema guardado sin el campo sigue igual y no se muta", () => {
        const guardado: TemaEntidad = { themeId: "aurora", themeMix: null };
        const copia = { ...guardado };
        expect(registroMovimientoEfectivo({ cuenta: guardado })).toBe("sobrio");
        expect(guardado).toEqual(copia);
        expect("movimiento" in guardado).toBe(false);
    });
});

describe("registroMovimientoEfectivo — herencia cuenta › página › grupo", () => {
    const cuenta: TemaEntidad = { movimiento: "expresivo" };
    const pagina: TemaEntidad = { movimiento: "experimental" };
    const grupo: TemaEntidad = { movimiento: "sobrio" };

    it("la cuenta es el piso cuando nadie más declara movimiento", () => {
        expect(registroMovimientoEfectivo({ cuenta })).toBe("expresivo");
        expect(registroMovimientoEfectivo({ cuenta, pagina: null, grupo: {} })).toBe("expresivo");
    });

    it("la página pisa a la cuenta y el grupo (lo más concreto) pisa a la página", () => {
        expect(registroMovimientoEfectivo({ cuenta, pagina })).toBe("experimental");
        expect(registroMovimientoEfectivo({ cuenta, pagina, grupo })).toBe("sobrio");
        expect(registroMovimientoEfectivo({ pagina, grupo })).toBe("sobrio");
    });

    it("si la capa concreta no declara movimiento, hereda de la anterior", () => {
        expect(registroMovimientoEfectivo({ pagina: { themeId: "x" } })).toBe("sobrio");
        expect(registroMovimientoEfectivo({ cuenta, pagina: { themeId: "x" } })).toBe("expresivo");
        expect(registroMovimientoEfectivo({ cuenta, pagina, grupo: { themeMix: null } })).toBe("experimental");
    });

    it("un valor desconocido en la capa concreta vuelve al defecto, no hereda", () => {
        const roto = { movimiento: "ruidoso" } as unknown as TemaEntidad;
        expect(registroMovimientoEfectivo({ cuenta, pagina, grupo: roto })).toBe("sobrio");
    });
});

describe("variacionPara — la variación pública lleva su registro", () => {
    it("por defecto viaja «sobrio»", () => {
        expect(variacionPara(contexto()).movimiento).toBe("sobrio");
    });

    it("conserva el registro pedido y rechaza los desconocidos", () => {
        expect(variacionPara(contexto({ movimiento: "expresivo" })).movimiento).toBe("expresivo");
        expect(variacionPara(contexto({ movimiento: "experimental" })).movimiento).toBe("experimental");
        const roto = { movimiento: "caótico" } as unknown as ContextoVisual;
        expect(variacionPara({ ...contexto(), ...roto }).movimiento).toBe("sobrio");
    });

    it("el registro no cambia la variante ni rompe el determinismo", () => {
        const sinRegistro = variacionPara(contexto({ semilla: "perfil-7" }));
        const conRegistro = variacionPara(contexto({ semilla: "perfil-7", movimiento: "experimental" }));
        expect(conRegistro.variante).toBe(sinRegistro.variante);
        expect(conRegistro.velocidad).toBe(sinRegistro.velocidad);
        expect(conRegistro.intensidad).toBe(sinRegistro.intensidad);
        expect(variacionPara(contexto({ semilla: "perfil-7", movimiento: "experimental" }))).toEqual(conRegistro);
    });
});
