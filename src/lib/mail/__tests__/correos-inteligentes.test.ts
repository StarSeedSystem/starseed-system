import { describe, it, expect } from "vitest";
import { ACCIONES_PERMITIDAS, esAccionValida, validarRegla, aplicarReglas, type HiloCorreoLite } from "../reglas-correo";
import {
    CFG_SEGUIMIENTO_DEFECTO, cfgNormalizada, clasificarHilo, resumenSeguimiento,
    type HiloLite,
} from "../seguimiento-respuestas";

// Umbrales del alcance (24 h por responder, 14 días esperando) rigen cada caso.
const MS_H = 3600000, MS_D = 24 * MS_H;

/** Hilo base del alcance, con dominio y etiqueta propias. */
const HILO: HiloCorreoLite = {
    id: "t1", asunto: "Propuesta de colaboración", deUltimo: "matias@yosoy.earth",
    dominioUltimo: "yosoy.earth", tieneAdjunto: false, etiquetas: ["alcance"], horasDesdeUltimo: 4,
};

const REGLA_BASE = {
    id: "r1", texto: "Si escribe Matías, destacar y esperar su respuesta",
    cuando: { dominio: "yosoy.earth", etiqueta: "alcance" }, hacer: "esperar-respuesta",
};

describe("reglas-correo · R2: ninguna regla envía", () => {
    it("la lista cerrada tiene exactamente las cinco acciones", () => {
        expect([...ACCIONES_PERMITIDAS].sort()).toEqual(["destacar", "esperar-respuesta", "etiquetar", "mover", "sugerir-borrador"]);
        for (const a of ACCIONES_PERMITIDAS) expect(esAccionValida(a)).toBe(true);
        for (const a of ["enviar", "responder", "borrar", "reenviar", 42]) expect(esAccionValida(a)).toBe(false);
    });

    it("valida una regla bien formada y recorta espacios", () => {
        expect(validarRegla({ ...REGLA_BASE, id: " r1 ", texto: " regla " })).toMatchObject({
            ok: true, regla: { id: "r1", texto: "regla", cuando: REGLA_BASE.cuando },
        });
    });

    it("rechaza acciones ajenas a la lista cerrada (R2)", () => {
        for (const hacer of ["enviar", "responder", "borrar", "reenviar", "enviar-automatico"]) {
            expect(validarRegla({ ...REGLA_BASE, hacer }).ok).toBe(false);
        }
    });

    it("rechaza campos extra en la regla y en «cuando»", () => {
        expect(validarRegla({ ...REGLA_BASE, prioridad: 1 })).toEqual({ ok: false, error: "Campo extra: «prioridad»." });
        expect(validarRegla({ ...REGLA_BASE, cuando: { dominio: "a.com", para: "x" } }).ok).toBe(false);
        expect(validarRegla({ ...REGLA_BASE, cuando: { ...REGLA_BASE.cuando, etiqueta2: "y" } }).ok).toBe(false);
    });

    it("rechaza textos largos, tipos equivocados y datos vacíos", () => {
        expect(validarRegla({ ...REGLA_BASE, texto: "a".repeat(301) }).ok).toBe(false);
        expect(validarRegla({ ...REGLA_BASE, id: "a".repeat(49) }).ok).toBe(false);
        expect(validarRegla({ ...REGLA_BASE, cuando: { de: null } }).ok).toBe(false);
        expect(validarRegla({ ...REGLA_BASE, cuando: { tieneAdjunto: "sí" } }).ok).toBe(false);
        expect(validarRegla({ ...REGLA_BASE, cuando: { antiguedadHorasMin: -1 } }).ok).toBe(false);
        expect(validarRegla(null).ok).toBe(false);
    });

    it("aplica en orden y sin repetir; salta inválidas y acciones cerradas", () => {
        const reglas = [
            { ...REGLA_BASE }, // espera-respuesta (dominio+etiqueta encajan)
            { id: "r2", texto: "Destacar lo suyo", cuando: {}, hacer: "destacar" },
            { id: "r3", texto: "Otra igual", cuando: {}, hacer: "destacar" }, // repetida
            { id: "r4", texto: "Borrar", cuando: {}, hacer: "borrar" }, // R2
            { id: "x", texto: "" }, // inválida
        ];
        expect(aplicarReglas(reglas, HILO)).toEqual([
            { reglaId: "r1", hacer: "esperar-respuesta" },
            { reglaId: "r2", hacer: "destacar" },
        ]);
    });

    it("exige TODAS las condiciones presentes (AND) y respeta la antigüedad", () => {
        expect(aplicarReglas([{ id: "r", texto: "t", cuando: { de: "matias" } }], HILO)).toHaveLength(1);
        expect(aplicarReglas([{ id: "r", texto: "t", cuando: { de: "outra" } }], HILO)).toEqual([]);
        expect(aplicarReglas([{ id: "r", texto: "t", cuando: { tieneAdjunto: true } }], HILO)).toEqual([]);
        const r = { id: "r", texto: "t", hacer: "mover", cuando: { antiguedadHorasMin: 24 }, parametro: "alcance" };
        expect(aplicarReglas([r], { ...HILO, horasDesdeUltimo: 20 })).toEqual([]);
        expect(aplicarReglas([r], { ...HILO, horasDesdeUltimo: 25 })).toEqual([{ reglaId: "r", hacer: "mover", parametro: "alcance" }]);
    });
});

/** Hilo de seguimiento: una réplica previa de Alex y el último mensaje. */
function hiloSeguimiento(id: string, haceHoras: number, mio: boolean, ahora: number): HiloLite {
    const de = mio ? "alex" : "matias";
    const creadoEl = new Date(ahora - haceHoras * MS_H).toISOString();
    return { id, mensajes: [{ de: "alex", creadoEl: new Date(ahora - 40 * MS_H).toISOString() }, { de, creadoEl }] };
}

describe("seguimiento-respuestas · Reply Zero", () => {
    const AHORA = Date.parse("2026-10-25T12:00:00.000Z");

    it("por-responder: el último es de otro y pasaron más de N horas", () => {
        expect(clasificarHilo(hiloSeguimiento("h", 30, false, AHORA), "alex", AHORA)).toBe("por-responder");
        expect(clasificarHilo(hiloSeguimiento("h", 5, false, AHORA), "alex", AHORA)).toBe("resuelto");
    });

    it("esperando: el último es mío y pasaron más de D días (14 por defecto)", () => {
        expect(CFG_SEGUIMIENTO_DEFECTO.diasEsperando).toBe(14);
        expect(clasificarHilo(hiloSeguimiento("h", 15 * MS_D / MS_H, true, AHORA), "alex", AHORA)).toBe("esperando");
        expect(clasificarHilo(hiloSeguimiento("h", 10 * MS_D / MS_H, true, AHORA), "alex", AHORA)).toBe("resuelto");
    });

    it("respeta la configuración inyectada y sana los valores imposibles", () => {
        expect(clasificarHilo(hiloSeguimiento("h", 5, false, AHORA), "alex", AHORA, { horasPorResponder: 2 })).toBe("por-responder");
        expect(cfgNormalizada({ horasPorResponder: -3, diasEsperando: NaN })).toEqual(CFG_SEGUIMIENTO_DEFECTO);
    });

    it("sin mensaje válido es resuelto; las inválidas no cuelgan nada", () => {
        expect(clasificarHilo({ id: "h", mensajes: [] }, "alex", AHORA)).toBe("resuelto");
        expect(clasificarHilo(null, "alex", AHORA)).toBe("resuelto");
        expect(clasificarHilo({ id: "h", mensajes: [{ de: "x", creadoEl: "no-es-fecha" }] }, "alex", AHORA)).toBe("resuelto");
    });

    it("resumenSeguimiento cuenta y lista las ids agrupadas por estado", () => {
        const r = resumenSeguimiento([hiloSeguimiento("a", 30, false, AHORA), hiloSeguimiento("b", 400, true, AHORA), hiloSeguimiento("c", 5, false, AHORA)], "alex", AHORA);
        expect(r.porResponder).toBe(1);
        expect(r.esperando).toBe(1);
        expect(r.resuelto).toBe(1);
        expect(r.idsPorResponder).toEqual(["a"]);
        expect(r.idsEsperando).toEqual(["b"]);
    });
});
