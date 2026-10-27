import { describe, it, expect } from "vitest";
import {
    validarRegla,
    aplicarReglas,
    type HiloRegla,
    type ReglaCorreo,
} from "../reglas-correo";
import {
    clasificarHilo,
    resumenSeguimiento,
    CONFIG_POR_DEFECTO,
    type HiloLite,
} from "../seguimiento-respuestas";

const HORA = 3_600_000;

const hiloBase: HiloRegla = {
    id: "h1",
    creatorId: "alex",
    subject: "Propuesta de colaboración",
    ultimoDe: "laura@ejemplo.com",
    tieneAdjunto: false,
    etiqueta: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastMsgAt: "2026-01-05T00:00:00.000Z",
};

const ahora = new Date("2026-01-10T00:00:00.000Z");

function reglaBase(): ReglaCorreo {
    return {
        id: "r1",
        texto: "Destacar lo de Laura",
        cuando: { de: "laura@ejemplo.com" },
        hacer: "destacar",
    };
}

describe("validarRegla", () => {
    it("acepta una regla bien formada", () => {
        expect(validarRegla(reglaBase())).toEqual(reglaBase());
    });

    it("rechaza acciones de envío, borrado y reenvío (R2)", () => {
        for (const hacer of ["enviar", "responder", "borrar", "reenviar", "responder-solo"]) {
            expect(validarRegla({ ...reglaBase(), hacer })).toBeNull();
        }
    });

    it("rechaza campos extra", () => {
        expect(validarRegla({ ...reglaBase(), borrar: true })).toBeNull();
        expect(validarRegla({ ...reglaBase(), cuando: { de: "x@y.com", spin: 1 } })).toBeNull();
    });

    it("rechaza textos largos", () => {
        expect(validarRegla({ ...reglaBase(), texto: "a".repeat(201) })).toBeNull();
        expect(
            validarRegla({ ...reglaBase(), cuando: { asuntoContiene: "a".repeat(121) } }),
        ).toBeNull();
    });

    it("rechaza mover o etiquetar sin parámetro y con parámetro inválido", () => {
        expect(validarRegla({ ...reglaBase(), hacer: "mover" })).toBeNull();
        const conParametro: ReglaCorreo = {
            ...reglaBase(),
            hacer: "etiquetar",
            parametro: "lienzo",
        };
        expect(validarRegla(conParametro)).toEqual(conParametro);
        expect(validarRegla({ ...reglaBase(), hacer: "etiquetar", parametro: "" })).toBeNull();
    });

    it("rechaza condiciones mal tipadas", () => {
        expect(validarRegla({ ...reglaBase(), cuando: { tieneAdjunto: "sí" } })).toBeNull();
        expect(validarRegla({ ...reglaBase(), cuando: { antiguedadHorasMin: -2 } })).toBeNull();
        expect(validarRegla({ ...reglaBase(), cuando: {} })).toBeNull();
    });
});

describe("aplicarReglas", () => {
    it("propone acciones en orden de regla y sin repetir", () => {
        const r1 = validarRegla(reglaBase())!;
        const rAdjunto = validarRegla({
            id: "r2",
            texto: "con adjunto",
            cuando: { tieneAdjunto: true },
            hacer: "mover",
            parametro: "postulaciones",
        })!;
        const rOtro = validarRegla({
            id: "r3",
            texto: "otro",
            cuando: { de: "otro@x.com" },
            hacer: "sugerir-borrador",
        })!;
        const propuestas = aplicarReglas([r1, rAdjunto, rOtro], hiloBase, ahora);
        expect(propuestas.map((p) => p.reglaId)).toEqual(["r1"]);
        expect(propuestas[0].hacer).toBe("destacar");
        expect(propuestas[0].parametro).toBeUndefined();

        const conAdjuntos = { ...hiloBase, tieneAdjunto: true };
        expect(aplicarReglas([r1, rAdjunto, rOtro], conAdjuntos, ahora).map((p) => p.reglaId)).toEqual([
            "r1",
            "r2",
        ]);
        const repetida = validarRegla({
            id: "r4",
            texto: "dup",
            cuando: { de: "laura@ejemplo.com" },
            hacer: "destacar",
        })!;
        expect(aplicarReglas([r1, repetida], hiloBase, ahora)).toHaveLength(1);
    });

    it("respeta dominio, asunto, etiqueta, adjuntos y antigüedad", () => {
        const r = validarRegla({
            id: "d1",
            texto: "dominio",
            cuando: { dominio: "ejemplo.com" },
            hacer: "mover",
            parametro: "colaboraciones",
        })!;
        const deOtro = { ...hiloBase, ultimoDe: "juan@otra.com" };
        expect(aplicarReglas([r], deOtro, ahora)).toHaveLength(0);
        expect(aplicarReglas([r], hiloBase, ahora)).toHaveLength(1);
        const rAsunto = validarRegla({
            ...reglaBase(),
            id: "a1",
            cuando: { asuntoContiene: "COLABORACIÓN" },
            hacer: "etiquetar",
            parametro: "prioridad",
        })!;
        expect(aplicarReglas([rAsunto], hiloBase, ahora)).toHaveLength(1);
        const rEtiqueta = validarRegla({
            ...reglaBase(),
            id: "e1",
            cuando: { etiqueta: "lienzo" },
            hacer: "destacar",
        })!;
        expect(aplicarReglas([rEtiqueta], hiloBase, ahora)).toHaveLength(0);
        const rAntiguo = validarRegla({
            ...reglaBase(),
            id: "t1",
            cuando: { antiguedadHorasMin: 120 },
            hacer: "sugerir-borrador",
        })!;
        expect(aplicarReglas([rAntiguo], hiloBase, ahora)).toHaveLength(1);
        const tarde = new Date(ahora.getTime() + 100 * HORA);
        expect(aplicarReglas([rAntiguo], hiloBase, tarde)).toHaveLength(1);
        const pronto = new Date(ahora.getTime() - 200 * HORA);
        expect(aplicarReglas([rAntiguo], hiloBase, pronto)).toHaveLength(0);
    });
});

describe("clasificarHilo", () => {
    const yo = "alex";

    function lite(ultimoDe: string | null, horasAtras: number): HiloLite {
        return {
            id: "h",
            creatorId: yo,
            ultimoDe,
            lastMsgAt: new Date(ahora.getTime() - horasAtras * HORA).toISOString(),
        };
    }

    it("marca por-responder cuando el último mensaje es de otro Y pasaron más de N horas", () => {
        expect(clasificarHilo(lite("laura@ejemplo.com", 30), yo, ahora)).toBe("por-responder");
        expect(clasificarHilo(lite("laura@ejemplo.com", 5), yo, ahora)).toBe("resuelto");
    });

    it("marca esperando cuando el último es mío y pasaron más de D días (14 por defecto)", () => {
        expect(clasificarHilo(lite(yo, 24 * 15), yo, ahora)).toBe("esperando");
        expect(CONFIG_POR_DEFECTO.diasEsperando).toBe(14);
        expect(clasificarHilo(lite(yo, 24 * 10), yo, ahora)).toBe("resuelto");
    });

    it("usa la configuración inyectada", () => {
        const cfg = { horasPorResponder: 2, diasEsperando: 1 };
        expect(clasificarHilo(lite("laura", 3), yo, ahora, cfg)).toBe("por-responder");
        expect(clasificarHilo(lite(yo, 25), yo, ahora, cfg)).toBe("esperando");
    });

    it("degrada a resuelto con fechas inválidas o hilo vacío", () => {
        expect(clasificarHilo(lite(null, 10), yo, ahora)).toBe("resuelto");
        expect(
            clasificarHilo(
                { id: "x", creatorId: yo, ultimoDe: "a", lastMsgAt: "no-es-fecha" },
                yo,
                ahora,
            ),
        ).toBe("resuelto");
    });
});

describe("resumenSeguimiento", () => {
    it("reparte los ids por estado", () => {
        const hilos: HiloLite[] = [
            { id: "a", creatorId: "alex", ultimoDe: "b@x.com", lastMsgAt: new Date(ahora.getTime() - 30 * HORA).toISOString() },
            { id: "b", creatorId: "alex", ultimoDe: "alex", lastMsgAt: new Date(ahora.getTime() - 20 * 24 * HORA).toISOString() },
            { id: "c", creatorId: "alex", ultimoDe: "alex", lastMsgAt: new Date(ahora.getTime() - 1 * HORA).toISOString() },
        ];
        const resumen = resumenSeguimiento(hilos, "alex", ahora);
        expect(resumen).toEqual({ porResponder: ["a"], esperando: ["b"], resuelto: 1 });
    });
});
