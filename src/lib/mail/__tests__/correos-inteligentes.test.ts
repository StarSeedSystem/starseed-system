import { describe, it, expect } from "vitest";
import {
    validarRegla,
    aplicarReglas,
    ACCIONES_CORREO,
    LIMITES_REGLA,
    type HiloCorreosLite,
    type ReglaCorreo,
} from "@/lib/mail/reglas-correo";
import {
    clasificarHilo,
    resumenSeguimiento,
    DEFECTO_SEGUIMIENTO,
    type HiloLite,
} from "@/lib/mail/seguimiento-respuestas";

const hilo = (sobre: Partial<HiloCorreosLite>): HiloCorreosLite => ({
    id: "h1",
    remitente: "ana@example.org",
    asunto: "Propuesta de colaboración",
    tieneAdjunto: false,
    etiquetas: ["alcance"],
    horasDesdeUltimoMensaje: 3,
    ...sobre,
});

describe("validarRegla", () => {
    it("acepta una regla bien formada", () => {
        const r = validarRegla({
            id: "r1",
            texto: "Etiquetar lo de Ana",
            cuando: { dominio: "example.org" },
            hacer: "etiquetar",
            parametro: "prioridad",
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.regla.hacer).toBe("etiquetar");
    });

    it("rechaza acciones fuera de la lista: nunca enviar, responder, borrar ni reenviar", () => {
        for (const mala of ["enviar", "responder", "borrar", "reenviar", "", "etiquetar "]) {
            const r = validarRegla({
                id: "x",
                texto: "t",
                cuando: { dominio: "example.org" },
                hacer: mala,
            });
            expect(r.ok).toBe(false);
        }
        expect(ACCIONES_CORREO).not.toContain("enviar");
    });

    it("rechaza campos extra en la regla y en «cuando»", () => {
        const extra = validarRegla({
            id: "x",
            texto: "t",
            cuando: { dominio: "a.org" },
            hacer: "destacar",
            enviar: true,
        });
        expect(extra.ok).toBe(false);
        const extraCuando = validarRegla({
            id: "x",
            texto: "t",
            cuando: { dominio: "a.org", servidoresTimeout: 5 },
            hacer: "destacar",
        });
        expect(extraCuando.ok).toBe(false);
    });

    it("rechaza textos largos y datos de tipo incorrecto", () => {
        const larga: ReglaCorreo = {
            id: "x",
            texto: "a".repeat(LIMITES_REGLA.texto + 1),
            cuando: { dominio: "a.org" },
            hacer: "mover",
        };
        expect(validarRegla(larga).ok).toBe(false);
        expect(validarRegla(null).ok).toBe(false);
        expect(
            validarRegla({ id: "x", texto: "t", cuando: { tieneAdjunto: "sí" }, hacer: "destacar" }).ok,
        ).toBe(false);
        expect(
            validarRegla({ id: "x", texto: "t", cuando: { antiguedadHorasMin: -3 }, hacer: "mover" }).ok,
        ).toBe(false);
        expect(
            validarRegla({ id: "x", texto: "t", cuando: {}, hacer: "mover" }).ok,
        ).toBe(false);
    });
});

describe("aplicarReglas", () => {
    const et = { id: "e1", texto: "Ana al alcance", cuando: { dominio: "example.org" }, hacer: "etiquetar", parametro: "alcance" } as const;
    const deAdj = { id: "e2", texto: "Con adjunto, destacar", cuando: { tieneAdjunto: true }, hacer: "destacar" } as const;
    const viejo = { id: "e3", texto: "Antiguo, esperar", cuando: { antiguedadHorasMin: 72 }, hacer: "esperar-respuesta" } as const;
    const repetida = { id: "e4", texto: "Ana otra vez", cuando: { dominio: "example.org" }, hacer: "etiquetar", parametro: "alcance" } as const;

    it("aplica en orden de reglas solo las que encajan y sin repetir", () => {
        const r = aplicarReglas([et, deAdj, viejo, repetida], hilo({ tieneAdjunto: true, horasDesdeUltimoMensaje: 100 }));
        expect(r).toEqual([
            { hacer: "etiquetar", parametro: "alcance" },
            { hacer: "destacar" },
            { hacer: "esperar-respuesta" },
        ]);
    });

    it("respetar cada condición concreta: remitente, dominio, asunto, adjunto y etiqueta", () => {
        expect(aplicarReglas([et], hilo({ remitente: "Ana@Example.org" }))).toHaveLength(1);
        expect(aplicarReglas([et], hilo({ remitente: "luis@otro.org" }))).toHaveLength(0);
        expect(
            aplicarReglas([{ ...et, cuando: { de: "ana@example.org" } }], hilo({})),
        ).toHaveLength(1);
        expect(
            aplicarReglas(
                [{ id: "t1", texto: "t", cuando: { asuntoContiene: "colaboración" }, hacer: "mover" }],
                hilo({}),
            ),
        ).toHaveLength(1);
        expect(
            aplicarReglas(
                [{ id: "e5", texto: "solo adjuntos", cuando: { tieneAdjunto: true }, hacer: "destacar" }],
                hilo({ tieneAdjunto: false }),
            ),
        ).toHaveLength(0);
        expect(
            aplicarReglas(
                [{ id: "g1", texto: "g", cuando: { etiqueta: "alcance" }, hacer: "destacar" }],
                hilo({ etiquetas: ["otra"] }),
            ),
        ).toHaveLength(0);
    });
});

const YO = "yo@star.seed";
/** Hilo con UN mensaje de `de` escrito «horas» antes de AHORA. */
const desde = (de: string, horas: number): HiloLite => ({
    id: "t",
    mensajes: [{ de, fecha: new Date(AHORA.getTime() - horas * 3_600_000).toISOString() }],
});
// Reloj fijo e injectado: 100 h después del epoch.
const AHORA = new Date(100 * 3_600_000);

describe("clasificarHilo", () => {
    it("sin mensajes queda resuelto", () => {
        expect(clasificarHilo({ id: "v", mensajes: [] }, YO, AHORA)).toBe("resuelto");
        expect(clasificarHilo({ id: "v", mensajes: [] }, YO, AHORA, { horasPorResponder: 1 })).toBe("resuelto");
    });

    it("último de otro: por-responder tras N horas, resuelto dentro", () => {
        expect(clasificarHilo(desde("otro@x.org", 10), YO, AHORA)).toBe("resuelto");
        expect(clasificarHilo(desde("otro@x.org", 30), YO, AHORA)).toBe("por-responder");
        expect(
            clasificarHilo(desde("otro@x.org", 50), YO, AHORA, { horasPorResponder: 48, diasEsperaMax: 14 }),
        ).toBe("por-responder");
        expect(DEFECTO_SEGUIMIENTO).toEqual({ horasPorResponder: 24, diasEsperaMax: 14 });
    });

    it("último mío: esperando tras D días (14 por defecto), resuelto dentro", () => {
        expect(clasificarHilo(desde(YO, 4), YO, AHORA)).toBe("resuelto"); // 4 h bajo el umbral
        expect(clasificarHilo(desde(YO, 400), YO, AHORA)).toBe("esperando"); // > 14 días
        expect(
            clasificarHilo(desde(YO, 100), YO, AHORA, { diasEsperaMax: 3 }),
        ).toBe("esperando");
    });

    it("ignora mensajes con fecha inválida y usa el ÚLTIMO por fecha, no por orden", () => {
        const desordenado: HiloLite = {
            id: "d",
            mensajes: [
                { de: YO, fecha: "no-es-fecha" },
                { de: YO, fecha: new Date(AHORA.getTime() - 50 * 3_600_000).toISOString() },
                { de: "otro@x.org", fecha: new Date(AHORA.getTime() - 30 * 3_600_000).toISOString() },
            ],
        };
        expect(clasificarHilo(desordenado, YO, AHORA)).toBe("por-responder");
    });
});

describe("resumenSeguimiento", () => {
    it("cuenta los hilos por estado", () => {
        const r = resumenSeguimiento(
            [desde("otro@x.org", 30), desde(YO, 400), desde(YO, 5), { id: "z", mensajes: [] }],
            YO,
            AHORA,
        );
        expect(r).toEqual({ "por-responder": 1, esperando: 1, resuelto: 2 });
    });
});

