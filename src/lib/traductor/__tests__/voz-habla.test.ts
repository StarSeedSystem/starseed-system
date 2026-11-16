import { describe, expect, it, beforeEach } from "vitest";
import {
    hablar,
    detener,
    vocesDe,
    __resetParaPruebas,
    type EntornoVoz,
    type VozDisponible,
    type ResultadoHablar,
} from "../voz-habla";

function crearEntorno(voces: readonly VozDisponible[]): EntornoVoz {
    let utterances: SpeechSynthesisUtterance[] = [];
    const speechSynthesis = {
        getVoices: () => voces.map((v) => ({ name: v.nombre, lang: v.lang })),
        speak: (u: SpeechSynthesisUtterance) => {
            utterances.push(u);
            setTimeout(() => {
                u.onend?.(new Event("end"));
            }, 0);
        },
        cancel: () => {
            for (const u of utterances) {
                u.onerror?.(new SpeechSynthesisErrorEvent("error", { error: "canceled" }));
            }
            utterances = [];
        },
        pending: false,
        speaking: false,
        paused: false,
    } as unknown as SpeechSynthesis;
    return { speechSynthesis, voces };
}

beforeEach(() => {
    __resetParaPruebas();
});

describe("voz-habla", () => {
    describe("vocesDe", () => {
        it("devuelve voces con lang exacto", () => {
            const entorno = crearEntorno([
                { nombre: "Voz ES", lang: "es-ES" },
                { nombre: "Voz EN", lang: "en-US" },
            ]);
            const resultado = vocesDe("es", entorno);
            expect(resultado).toHaveLength(1);
            expect(resultado[0].nombre).toBe("Voz ES");
        });

        it("devuelve voces con lang por prefijo (es-ES, es-MX, etc.)", () => {
            const entorno = crearEntorno([
                { nombre: "Voz ES-ES", lang: "es-ES" },
                { nombre: "Voz ES-MX", lang: "es-MX" },
                { nombre: "Voz EN", lang: "en-US" },
            ]);
            const resultado = vocesDe("es", entorno);
            expect(resultado).toHaveLength(2);
            expect(resultado.map((v) => v.nombre)).toEqual(["Voz ES-ES", "Voz ES-MX"]);
        });

        it("devuelve array vacío si no hay voces del idioma", () => {
            const entorno = crearEntorno([
                { nombre: "Voz EN", lang: "en-US" },
                { nombre: "Voz FR", lang: "fr-FR" },
            ]);
            const resultado = vocesDe("es", entorno);
            expect(resultado).toHaveLength(0);
        });
    });

    describe("hablar", () => {
        it("habla con voz de lang exacto y resuelve ok", async () => {
            const entorno = crearEntorno([{ nombre: "Voz ES", lang: "es-ES" }]);
            const resultado = await hablar("hola", "es", entorno);
            expect(resultado).toEqual({ ok: true });
        });

        it("habla con voz por prefijo (es-MX para es) y resuelve ok", async () => {
            const entorno = crearEntorno([{ nombre: "Voz ES-MX", lang: "es-MX" }]);
            const resultado = await hablar("hola", "es", entorno);
            expect(resultado).toEqual({ ok: true });
        });

        it("devuelve error si no hay voz del idioma y NO usa otra voz", async () => {
            const entorno = crearEntorno([{ nombre: "Voz EN", lang: "en-US" }]);
            const resultado = await hablar("hola", "es", entorno);
            expect(resultado).toEqual({ ok: false, motivo: "No hay una voz de es en este aparato" });
        });

        it("cola varias frases y las reproduce en orden", async () => {
            const entorno = crearEntorno([{ nombre: "Voz ES", lang: "es-ES" }]);
            const orden: string[] = [];
            const p1 = hablar("primero", "es", entorno, { alTerminar: () => orden.push("1") });
            const p2 = hablar("segundo", "es", entorno, { alTerminar: () => orden.push("2") });
            const p3 = hablar("tercero", "es", entorno, { alTerminar: () => orden.push("3") });
            await Promise.all([p1, p2, p3]);
            expect(orden).toEqual(["1", "2", "3"]);
        });

        it("detener cancela la actual y limpia la cola", async () => {
            const entorno = crearEntorno([{ nombre: "Voz ES", lang: "es-ES" }]);
            const p1 = hablar("primero", "es", entorno);
            const p2 = hablar("segundo", "es", entorno);
            detener();
            const r1 = await p1;
            const r2 = await p2;
            expect(r1.ok).toBe(false);
            expect(r2.ok).toBe(false);
        });
    });
});