/**
 * Pruebas de las reglas de correo como datos y del seguimiento de respuestas
 * (Ola 1025R · INV1025I). Solo funciones puras: reloj inyectado, sin red, sin
 * disco, sin procesos. R2: nada de lo probado puede enviar nada.
 */
import { describe, expect, it } from "vitest";
import {
    ACCIONES_VALIDAS,
    aplicarReglas,
    validarRegla,
    type HiloLite,
    type MensajeLite,
    type ReglaCorreo,
} from "../reglas-correo";
import { CFG_POR_DEFECTO, clasificarHilo, configurar, resumenSeguimiento } from "../seguimiento-respuestas";

const AHORA = new Date("2026-10-25T12:00:00.000Z");

function msg(m: { en: string; de?: string; adj?: boolean }): MensajeLite {
    return { en: m.en, de: m.de ?? "otro@externo.org", tieneAdjunto: !!m.adj };
}

function hilo(p: Partial<HiloLite> & { mensajes?: MensajeLite[] }): HiloLite {
    return {
        id: "t1",
        asunto: p.asunto ?? "Propuesta",
        creatorId: p.creatorId ?? "yo",
        memberIds: p.memberIds ?? ["yo", "otro"],
        etiqueta: p.etiqueta ?? null,
        mensajes: p.mensajes ?? [],
    };
}

const REGLA_BASE: ReglaCorreo = {
    id: "r1",
    texto: "Marcar como importante lo del .org",
    cuando: { dominio: "externo.org" },
    hacer: "destacar",
};

const T3 = "2026-10-25T09:00:00.000Z"; // 3 h antes de AHORA

function reglas(...rs: (ReglaCorreo | null)[]): ReglaCorreo[] {
    return rs.filter(Boolean) as ReglaCorreo[];
}

describe("validarRegla", () => {
    it("acepta una regla completa y recorta los textos", () => {
        const r = validarRegla({ id: " a1 ", texto: " Etiquetar lo del presupuesto ", cuando: { de: "@ana", tieneAdjunto: true }, hacer: "etiquetar", parametro: "presupuesto" });
        expect(r).toEqual({ id: "a1", texto: "Etiquetar lo del presupuesto", cuando: { de: "@ana", tieneAdjunto: true }, hacer: "etiquetar", parametro: "presupuesto" });
    });

    it("rechaza cualquier acción fuera de la lista (jamás enviar ni borrar)", () => {
        for (const mala of ["enviar", "borrar", "responder-solo", "reenviar", "", "destacar "]) {
            expect(validarRegla({ ...REGLA_BASE, hacer: mala })).toBeNull();
        }
        expect(ACCIONES_VALIDAS).not.toContain("enviar");
        expect(ACCIONES_VALIDAS).not.toContain("borrar");
    });

    it("rechaza campos extra", () => {
        expect(validarRegla({ ...REGLA_BASE, enviar: true })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, cuando: { ...REGLA_BASE.cuando, borrado: true } })).toBeNull();
    });

    it("rechaza textos largos, vacíos o del tipo equivocado", () => {
        expect(validarRegla({ ...REGLA_BASE, id: "x".repeat(81) })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, texto: "" })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, texto: "x".repeat(241) })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, parametro: "x".repeat(121) })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, cuando: { asuntoContiene: 5 } })).toBeNull();
        expect(validarRegla(null)).toBeNull();
        expect(validarRegla("prime")).toBeNull();
    });

    it("rechaza un `cuando` inválido: objeto, campos negativos o vacíos", () => {
        expect(validarRegla({ ...REGLA_BASE, cuando: [] })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, cuando: { antiguedadHorasMin: -1 } })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, cuando: { etiqueta: "" } })).toBeNull();
        expect(validarRegla({ ...REGLA_BASE, cuando: { tieneAdjunto: "sí" } })).toBeNull();
    });
});

describe("aplicarReglas", () => {
    const h = hilo({
        asunto: "Propuesta de ausencia",
        etiqueta: "importante",
        mensajes: [msg({ en: "2026-10-25T09:00:00.000Z", de: "ana@externo.org", adj: true })],
    });

    it("propone las acciones en orden, sin repetir", () => {
        const r = validarRegla({ id: "a", texto: "item", hacer: "etiquetar", cuando: { de: "ana@externo.org" }, parametro: "filtro" });
        const r2 = validarRegla({ id: "b", texto: "item", hacer: "esperar-respuesta", cuando: { tieneAdjunto: true } });
        const r3 = validarRegla({ id: "c", texto: "item", hacer: "etiquetar", cuando: { etiqueta: "IMPORTANTE" }, parametro: "prioridad" });
        const out = aplicarReglas(reglas(r, r2, r3), h, AHORA);
        expect(out).toEqual([
            { reglaId: "a", hacer: "etiquetar", parametro: "filtro" },
            { reglaId: "b", hacer: "esperar-respuesta", parametro: "" },
            { reglaId: "c", hacer: "etiquetar", parametro: "prioridad" },
        ]);
    });

    it("sin repetir la misma acción con el mismo parámetro", () => {
        const a = validarRegla(REGLA_BASE);
        const b = validarRegla({ ...REGLA_BASE, id: "r2", texto: "duplicada", cuando: { asuntoContiene: "propuesta" }, parametro: "urgente" });
        const out = aplicarReglas(reglas(a, b), h, AHORA);
        expect(out).toEqual([
            { reglaId: "r1", hacer: "destacar", parametro: "" },
            { reglaId: "r2", hacer: "destacar", parametro: "urgente" },
        ]);
        const innecesaria = validarRegla({ ...REGLA_BASE, id: "r3", texto: "tercera vía al mismo parámetro" });
        const out2 = aplicarReglas(reglas(a, b, innecesaria), h, AHORA);
        expect(out2).toHaveLength(2);
        for (const x of out2) expect(x.hacer).toBe("destacar");
    });

    it("no aplica si el dominio, el asunto o la etiqueta no coinciden", () => {
        const r = validarRegla({ ...REGLA_BASE, cuando: { dominio: "otro.org" } });
        expect(aplicarReglas(reglas(r), h, AHORA)).toHaveLength(0);
        const r2 = validarRegla({ ...REGLA_BASE, id: "x", texto: "t", hacer: "sugerir-borrador", cuando: { asuntoContiene: "salario" } });
        expect(aplicarReglas(reglas(r2), h, AHORA)).toHaveLength(0);
        const r3 = validarRegla({ ...REGLA_BASE, id: "y", texto: "t", hacer: "etiquetar", cuando: { etiqueta: "vieja" }, parametro: "x" });
        expect(aplicarReglas(reglas(r3), h, AHORA)).toHaveLength(0);
    });

    it("respeta la antigüedad mínima con reloj inyectado", () => {
        const r = validarRegla({ ...REGLA_BASE, id: "ant", texto: "t", hacer: "destacar", cuando: { antiguedadHorasMin: 3, asuntoContiene: "propuesta" } });
        const si = aplicarReglas(reglas(r), h, AHORA);
        expect(si.map((x) => x.reglaId)).toContain("ant");
        const antes = new Date("2026-10-25T10:00:00.000Z");
        expect(aplicarReglas(reglas(r), h, antes)).toHaveLength(0);
    });

    it("una regla sin condiciones no decide nada; un hilo vacío tampoco genera", () => {
        const r = validarRegla({ id: "nc", texto: "t", hacer: "mover", cuando: {}, parametro: "archivado" });
        expect(aplicarReglas(reglas(r), h, AHORA)).toHaveLength(0);
        expect(aplicarReglas(reglas(validarRegla(REGLA_BASE)), hilo({ mensajes: [] }), AHORA)).toHaveLength(0);
    });
});

describe("clasificarHilo", () => {
    const T3 = "2026-10-25T09:00:00.000Z"; // 3 h antes de AHORA

    it("por-responder: último de otro y pasaron más de N horas", () => {
        expect(CFG_POR_DEFECTO.horasSinResponder).toBe(24);
        expect(clasificarHilo(hilo({ mensajes: [msg({ en: T3 })] }), "yo", AHORA)).toBe("resuelto");
        const tarde = new Date("2026-10-26T12:00:00.000Z");
        expect(clasificarHilo(hilo({ mensajes: [msg({ en: T3 })] }), "yo", tarde)).toBe("por-responder");
    });

    it("por-responder con umbral propio (cfg)", () => {
        const r = clasificarHilo(hilo({ mensajes: [msg({ en: T3 })] }), "yo", AHORA, { horasSinResponder: 2 });
        expect(r).toBe("por-responder");
    });

    it("esperando: último mio y pasaron más de D días (14 por defecto)", () => {
        expect(CFG_POR_DEFECTO.diasEsperando).toBe(14);
        const mio = msg({ en: "2026-10-15T00:00:00.000Z", de: "yo" });
        expect(clasificarHilo(hilo({ mensajes: [mio] }), "yo", AHORA)).toBe("resuelto");
        const seguido = new Date("2026-11-20T12:00:00.000Z");
        expect(clasificarHilo(hilo({ mensajes: [mio] }), "yo", seguido)).toBe("esperando");
        const pronto = new Date("2026-10-20T12:00:00.000Z"); // 5,5 días: menos de 14
        expect(clasificarHilo(hilo({ mensajes: [mio] }), "yo", pronto)).toBe("resuelto");
    });

    it("hilos vacíos, fechas inválidas o nulos: resuelto, nunca lanza", () => {
        expect(clasificarHilo(hilo({ mensajes: [] }), "yo", AHORA)).toBe("resuelto");
        expect(clasificarHilo(hilo({ mensajes: [msg({ en: "sin fecha" })] }), "yo", AHORA)).toBe("resuelto");
        expect(clasificarHilo(null, "yo", AHORA)).toBe("resuelto");
        expect(clasificarHilo(undefined, "yo", AHORA)).toBe("resuelto");
    });

    it("configurar rellena solo lo que falta y descarta lo inválido", () => {
        expect(configurar()).toEqual(CFG_POR_DEFECTO);
        expect(configurar({ horasSinResponder: 12 })).toEqual({ horasSinResponder: 12, diasEsperando: 14 });
        expect(configurar({ diasEsperando: -3 })).toEqual(CFG_POR_DEFECTO);
    });
});

describe("resumenSeguimiento", () => {
    it("cuenta los tres estados de la bandeja", () => {
        const mio = msg({ en: "2026-10-01T00:00:00.000Z", de: "yo" });
        const hilos = [
            hilo({ id: "a", mensajes: [msg({ en: T3 })] }),
            hilo({ id: "b", mensajes: [mio] }),
            hilo({ id: "c", mensajes: [] }),
            hilo({ id: "d", mensajes: [msg({ en: "2026-10-25T09:30:00.000Z", de: "otra@feria.norte" })] }),
        ];
        const r = resumenSeguimiento(hilos, "yo", AHORA, { horasSinResponder: 2, diasEsperando: 5 });
        expect(r).toEqual({ total: 4, porResponder: 2, esperando: 1, resuelto: 1 });
    });

    it("bandeja nula o vacía: ceros por defecto", () => {
        expect(resumenSeguimiento(null, "yo", AHORA)).toEqual({ total: 0, porResponder: 0, esperando: 0, resuelto: 0 });
        expect(resumenSeguimiento([], "yo", AHORA)).toEqual({ total: 0, porResponder: 0, esperando: 0, resuelto: 0 });
    });
});
