import { describe, it, expect } from "vitest";
import {
    construirPeticion,
    decisionesDeModeracion,
    leerRespuesta,
    umbral,
    MODELO_JEV,
} from "@/lib/jev/decisiones";

describe("construirPeticion", () => {
    it("construye el cuerpo válido con las tres formas", () => {
        const p = construirPeticion(
            { feed: "global" },
            {
                a: { type: "noul", instructions: "¿Es válido?" },
                b: { type: "choice", instructions: "Elige", criteria: { x: "ex", y: "ey" } },
                c: { type: "score", instructions: "Puntúa", criteria: ["baja", "alta"] },
            },
        );
        expect(p.model).toBe(MODELO_JEV);
        expect(Object.keys(p.questions)).toEqual(["a", "b", "c"]);
    });

    it("rechaza preguntas vacías e instrucciones vacías", () => {
        expect(() => construirPeticion({}, {})).toThrow();
        expect(() =>
            construirPeticion({}, { a: { type: "noul", instructions: " " } }),
        ).toThrow();
    });

    it("rechaza choice con criteria array y score con criteria objeto", () => {
        expect(() =>
            construirPeticion({}, {
                a: { type: "choice", instructions: "i", criteria: [] as unknown as Record<string, string> },
            }),
        ).toThrow(/objeto/);
        expect(() =>
            construirPeticion({}, {
                a: { type: "score", instructions: "i", criteria: {} as unknown as string[] },
            }),
        ).toThrow(/array/);
    });

    it("rechaza más de 255 opciones", () => {
        const criteria: Record<string, string> = {};
        for (let i = 0; i < 256; i++) criteria[`o${i}`] = `opción ${i}`;
        expect(() =>
            construirPeticion({}, { a: { type: "choice", instructions: "i", criteria } }),
        ).toThrow(/255/);
    });
});

describe("leerRespuesta", () => {
    it("normaliza una respuesta medida", () => {
        const json = {
            answers: {
                permitida: { type: "noul", noul: 0.94, probabilities: {}, confidence: 0.91 },
                etiquetas: { type: "choice", choice: "ciencia", probabilities: { ciencia: 0.8, arte: 0.2 }, confidence: 0.8 },
                prioridad_feed: { type: "score", score: "alta", probabilities: { baja: 0.05, media: 0.2, alta: 0.75 }, confidence: 0.7 },
            },
            usage: { input_tokens: 120, output_tokens: 30, cost: 0.000019 },
        };
        const d = leerRespuesta(json);
        expect(d.permitida).toEqual({ tipo: "noul", valor: 0.94, probabilidades: {}, confianza: 0.91 });
        expect(d.etiquetas.valor).toBe("ciencia");
        expect(d.etiquetas.probabilidades.ciencia).toBe(0.8);
        expect(d.prioridad_feed.valor).toBe("alta");
        expect(d.prioridad_feed.confianza).toBe(0.7);
    });

    it("tolera respuestas parciales", () => {
        expect(leerRespuesta({})).toEqual({});
        const d = leerRespuesta({ answers: { x: { type: "noul" } } });
        expect(d.x.valor).toBe(0);
        expect(d.x.confianza).toBe(0);
    });
});

describe("umbral", () => {
    it("clasifica si/duda/no con los cortes por defecto", () => {
        expect(umbral(0.95)).toBe("si");
        expect(umbral(0.9)).toBe("si");
        expect(umbral(0.7)).toBe("duda");
        expect(umbral(0.59)).toBe("no");
    });

    it("respeta cortes personalizados", () => {
        expect(umbral(0.5, 0.8, 0.4)).toBe("duda");
    });
});

describe("decisionesDeModeracion", () => {
    it("devuelve las tres preguntas estándar con formas válidas sin o con parámetro", () => {
        const q1 = decisionesDeModeracion();
        const q2 = decisionesDeModeracion({ texto: "Hola mundo" });
        expect(Object.keys(q1)).toEqual(["permitida", "etiquetas", "prioridad_feed"]);
        expect(Object.keys(q2)).toEqual(["permitida", "etiquetas", "prioridad_feed"]);
        expect(q2.permitida.type).toBe("noul");
        expect(q2.etiquetas.type).toBe("choice");
        if (q2.etiquetas.type === "choice") {
            expect(Object.keys(q2.etiquetas.criteria)).toContain("ciencia");
            expect(Object.keys(q2.etiquetas.criteria).length).toBeGreaterThan(5);
        }
        if (q2.prioridad_feed.type === "score") {
            expect(q2.prioridad_feed.criteria).toEqual(["baja", "media", "alta"]);
        }
        expect(() => construirPeticion({ texto: "Hola mundis" }, q2)).not.toThrow();
    });
});
