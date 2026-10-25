import { describe, it, expect } from "vitest";
import { validarRegla, aplicarReglas, type ReglaCorreo } from "@/lib/mail/reglas-correo";
import {
    clasificarHilo,
    resumenSeguimiento,
    type HiloSeguible,
} from "@/lib/mail/seguimiento-respuestas";

const UNA_REGLA = {
    id: "r1",
    texto: "Si es de coordinacion, destacarla",
    cuando: { dominio: "starseed.example" },
    hacer: "destacar",
};

describe("validarRegla — reglas como datos", () => {
    it("acepta una regla bien formada con sus campos", () => {
        const r = validarRegla({ ...UNA_REGLA, parametro: "Alcance" });
        expect(r).not.toBeNull();
        expect(r?.hacer).toBe("destacar");
        expect(r?.parametro).toBe("Alcance");
    });

    it("rechaza acciones fuera de la lista (jamás enviar, borrar ni reenviar)", () => {
        for (const accion of ["enviar", "responder", "borrar", "reenviar", "auto-responder"]) {
            expect(validarRegla({ ...UNA_REGLA, hacer: accion })).toBeNull();
        }
    });

    it("rechaza campos extra, condición vacía y textos largos", () => {
        expect(validarRegla({ ...UNA_REGLA, gratis: true })).toBeNull();
        expect(validarRegla({ ...UNA_REGLA, cuando: { campoInventado: "x" } })).toBeNull();
        expect(validarRegla({ ...UNA_REGLA, texto: "a".repeat(301) })).toBeNull();
        expect(validarRegla(null)).toBeNull();
    });
});

describe("aplicarReglas — acciones propuestas en orden y sin repetir", () => {
    const reglas: ReglaCorreo[] = [
        validarRegla({ id: "a", texto: "destacar lo propio", cuando: { dominio: "starseed.example" }, hacer: "destacar" }),
        validarRegla({ id: "b", texto: "etiquetar propuestas", cuando: { asuntoContiene: "propuesta" }, hacer: "etiquetar", parametro: "Alcance" }),
        validarRegla({ id: "c", texto: "esperar respuesta propia", cuando: { antiguedadHorasMin: 336 }, hacer: "esperar-respuesta" }),
        validarRegla({ id: "d", texto: "destacar repetida", cuando: { etiqueta: "Alcance" }, hacer: "destacar" }),
    ].filter((r): r is ReglaCorreo => r !== null);

    it("devuelve cada acción una sola vez y en orden de regla", () => {
        const salida = aplicarReglas(reglas, {
            id: "h1",
            de: "YO@STARSEED.EXAMPLE",
            asunto: "Propuesta de colaboración",
            horasDesdeUltimo: 400,
        });
        expect(salida.map((a) => a.reglaId)).toEqual(["a", "b", "c"]);
        expect(salida[0].hacer).toBe("destacar");
    });

    it("un hilo que no cumple nada no recibe acciones", () => {
        expect(aplicarReglas(reglas, { id: "h2", de: "otro@ex.com", asunto: "Hola" })).toEqual([]);
    });

    it("distingue dominio del remitente y adjuntos", () => {
        const conAdjuntos = validarRegla({
            id: "e",
            texto: "los adjuntos, a mover",
            cuando: { tieneAdjunto: true },
            hacer: "mover",
            parametro: "Con archivos",
        });
        expect(conAdjuntos).not.toBeNull();
        const accion = aplicarReglas(conAdjuntos ? [conAdjuntos] : [], {
            id: "h3",
            de: "yo@starseed.example",
            tieneAdjunto: true,
        });
        expect(accion.length).toBe(1);
        expect(accion[0].parametro).toBe("Con archivos");
    });
});

const ahora = new Date("2026-10-25T12:00:00Z");
const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();

describe("clasificarHilo — «Reply Zero» propio", () => {
    it("por-responder: el último es de otro y pasaron más de N horas", () => {
        const hilo: HiloSeguible = {
            id: "h1",
            mensajes: [
                { de: "yo", createdAt: hace(72) },
                { de: "otro", createdAt: hace(30) },
            ],
        };
        expect(clasificarHilo(hilo, "yo", ahora)).toBe("por-responder");
        expect(clasificarHilo(hilo, "yo", ahora, { horasPorResponder: 48 })).toBe("resuelto");
    });

    it("esperando: el último es mío y pasaron más de D días (14 por defecto)", () => {
        const hilo: HiloSeguible = { id: "h2", mensajes: [{ de: "yo", createdAt: hace(24 * 15) }] };
        expect(clasificarHilo(hilo, "yo", ahora)).toBe("esperando");
        expect(clasificarHilo(hilo, "yo", ahora, { diasEsperando: 30 })).toBe("resuelto");
    });

    it("resuelto: la respuesta es reciente y no hay nada que escalar", () => {
        const hilo: HiloSeguible = { id: "h3", mensajes: [{ de: "otro", createdAt: hace(2) }] };
        expect(clasificarHilo(hilo, "yo", ahora)).toBe("resuelto");
    });

    it("hilo vacío: pendiente, no silenciado; y fechas inválidas no lanzan", () => {
        expect(clasificarHilo({ id: "h4", mensajes: [] }, "yo", ahora)).toBe("por-responder");
        expect(clasificarHilo({ id: "h5", mensajes: [{ de: "otro", createdAt: "fecha-ronsa" }] }, "yo", ahora)).toBe("por-responder");
    });
});

describe("resumenSeguimiento — cuenta por estado", () => {
    const hilos: HiloSeguible[] = [
        { id: "a", mensajes: [{ de: "otro", createdAt: hace(50) }] },
        { id: "b", mensajes: [{ de: "yo", createdAt: hace(24 * 20) }] },
        { id: "c", mensajes: [{ de: "otro", createdAt: hace(1) }] },
    ];
    it("reparte ids y cuenta los resueltos", () => {
        const r = resumenSeguimiento(hilos, "yo", ahora);
        expect(r.porResponder).toEqual(["a"]);
        expect(r.esperando).toEqual(["b"]);
        expect(r.resuelto).toBe(1);
        expect(r.total).toBe(3);
    });
});
