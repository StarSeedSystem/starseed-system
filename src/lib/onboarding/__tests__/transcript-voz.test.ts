/**
 * Lectura del transcript de Aurora: el fallo no puede quedar en silencio.
 * ═══════════════════════════════════════════════════════════════════════════
 * La guía pregunta por voz al puente de Aurora cada 550 ms. Si `getState`
 * lanza (motor a medio montar, puente roto), la guía debe seguir en texto,
 * pero el fallo tiene que dejar su línea en el registro: antes se perdía en un
 * `catch` mudo. La decisión es pura —sin puente, sin audio y sin navegador— y
 * se prueba entrada → salida.
 */
import { describe, expect, it } from "vitest";
import {
    componerTranscript,
    evaluarLecturaTranscript,
} from "@/lib/onboarding/transcript-voz";

describe("componerTranscript", () => {
    it("une la parte final y la provisional, como las escucha la guía", () => {
        expect(componerTranscript({ transcript: "siguiente", interim: "contin" })).toBe(
            "siguiente contin",
        );
    });

    it("sin estado devuelve la cadena vacía que espera el sondeo", () => {
        expect(componerTranscript(null)).toBe("");
        expect(componerTranscript(undefined)).toBe("");
    });

    it("tolera un estado sin campos o con los dos vacíos", () => {
        expect(componerTranscript({})).toBe("");
        expect(componerTranscript({ transcript: "", interim: "" })).toBe("");
    });

    it("recorta los espacios sueltos y no deja uno colgando", () => {
        expect(componerTranscript({ transcript: "  siguiente  ", interim: "" })).toBe("siguiente");
        expect(componerTranscript({ transcript: "", interim: "  cerrar " })).toBe("cerrar");
    });
});

describe("evaluarLecturaTranscript", () => {
    it("una lectura buena devuelve el texto y no anota nada", () => {
        expect(evaluarLecturaTranscript({ tipo: "ok", estado: { transcript: "avanza" } })).toEqual({
            texto: "avanza",
            aviso: null,
        });
    });

    it("una excepción del puente deja aviso con su mensaje y la guía en texto", () => {
        expect(
            evaluarLecturaTranscript({ tipo: "excepcion", error: new Error("getState no responde") }),
        ).toEqual({
            texto: "",
            aviso: "guía: no se pudo leer el transcript de Aurora («getState no responde»)",
        });
    });

    it("acepta un error en texto y no inventa paréntesis si no hay mensaje", () => {
        expect(evaluarLecturaTranscript({ tipo: "excepcion", error: "puente caído" }).aviso).toBe(
            "guía: no se pudo leer el transcript de Aurora («puente caído»)",
        );
        expect(evaluarLecturaTranscript({ tipo: "excepcion", error: undefined }).aviso).toBe(
            "guía: no se pudo leer el transcript de Aurora",
        );
        expect(evaluarLecturaTranscript({ tipo: "excepcion", error: { status: 500 } }).aviso).toBe(
            "guía: no se pudo leer el transcript de Aurora",
        );
    });

    it("deja el aviso en una sola línea y lo recorta con puntos suspensivos", () => {
        expect(
            evaluarLecturaTranscript({ tipo: "excepcion", error: "fallo\n\tinesperado   del  puente" }).aviso,
        ).toBe("guía: no se pudo leer el transcript de Aurora («fallo inesperado del puente»)");

        const largo = evaluarLecturaTranscript({ tipo: "excepcion", error: "x".repeat(300) })
            .aviso as string;
        const detalle = largo.slice(largo.indexOf("«") + 1, largo.lastIndexOf("»"));
        expect(detalle).toHaveLength(160);
        expect(detalle.endsWith("…")).toBe(true);
    });
});
