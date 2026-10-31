import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    LayaDecisionesPanel, textoDeRespuesta, confianzaCalibrada, umbralesEfectivos,
    type DecisionLaya, type RespuestaLaya,
} from "@/components/astraura/laya-decisiones-panel";
import { PUNTOS_DECISION } from "@/lib/astraura/laya/puntos-decision";

afterEach(cleanup);

const decision = (extra: Partial<DecisionLaya> = {}): DecisionLaya => ({
    id: "d1", punto: "ejemplo.manual",
    respuesta: {
        type: "choice", choice: "publicar",
        probabilities: { publicar: 0.91, revisar: 0.09 }, answer_confidence: 0.91,
    },
    donde: "a1", ms: 1900, ...extra,
});

describe("respuestas nativas de Laya", () => {
    it("lee un choice con probabilities y answer_confidence", () => {
        const r: RespuestaLaya = {
            type: "choice", choice: "publicar",
            probabilities: { publicar: 0.91, revisar: 0.09 }, answer_confidence: 0.91,
        };
        expect(textoDeRespuesta(r)).toBe("publicar");
        expect(confianzaCalibrada(r)).toBe(0.91);
    });

    it("lee un score por su nivel elegido", () => {
        const r: RespuestaLaya = {
            type: "score", score: "alta", probabilities: { alta: 0.8 }, answer_confidence: 0.8,
        };
        expect(textoDeRespuesta(r)).toBe("alta");
        expect(confianzaCalibrada(r)).toBe(0.8);
    });

    it("lee un noul como sí o no con el corte en 0,5", () => {
        expect(textoDeRespuesta({
            type: "noul", noul: 0.72, probabilities: { true: 0.72 }, answer_confidence: 0.72,
        })).toBe("sí");
        expect(textoDeRespuesta({
            type: "noul", noul: 0.2, probabilities: { false: 0.8 }, answer_confidence: 0.8,
        })).toBe("no");
    });

    it("ignora `confidence`: solo cuenta `answer_confidence`", () => {
        const crudo = { type: "choice" as const, choice: "sí", confidence: 0.99 };
        expect(confianzaCalibrada(crudo)).toBeNull();
    });
});

describe("umbrales efectivos", () => {
    it("usa el umbral del catálogo sin casos suficientes", () => {
        const umbrales = umbralesEfectivos();
        expect(umbrales).toHaveLength(PUNTOS_DECISION.length);
        expect(umbrales.every((u) => !u.recalibrado)).toBe(true);
        expect(umbrales[0]?.umbral).toBe(PUNTOS_DECISION[0]?.umbral);
    });

    it("recalibra con al menos 30 casos del punto y ámbito", () => {
        const casos = Array.from({ length: 30 }, (_, i) => ({
            punto: "publicar.moderar", ambito: "personal", p: 0.9, donde: "a1" as const, ms: 100,
            resultado: "corregida" as const, estado: "corregido", privado: false, ts: i,
        }));
        const u = umbralesEfectivos(casos).find((x) => x.punto === "publicar.moderar");
        expect(u?.umbral).toBe(0.9);
        expect(u?.recalibrado).toBe(true);
    });
});

describe("LayaDecisionesPanel", () => {
    it("enseña dónde está Laya ahora y su última latencia", () => {
        render(<LayaDecisionesPanel estado={{ donde: "a1", ultimaLatenciaMs: 1900 }} />);
        expect(screen.getByText(/A1 \(servidor propio\)/)).toBeTruthy();
        expect(screen.getByText(/1900 ms/)).toBeTruthy();
    });

    it("enseña punto, respuesta, confianza, dónde y ms de cada decisión", () => {
        render(<LayaDecisionesPanel decisiones={[decision()]} />);
        expect(screen.getByText("ejemplo.manual")).toBeTruthy();
        expect(screen.getByText(/publicar \(confianza: 0\.91\)/)).toBeTruthy();
        expect(screen.getByText("A1")).toBeTruthy();
        expect(screen.getByText("1900 ms")).toBeTruthy();
    });

    it("muestra la respuesta nativa y solo la confianza calibrada, nunca `confidence`", () => {
        const bruto = {
            type: "choice", choice: "publicar",
            probabilities: { publicar: 0.4, revisar: 0.6 },
            confidence: 0.99, answer_confidence: 0.4,
        } satisfies RespuestaLaya & { confidence: number };
        render(<LayaDecisionesPanel decisiones={[decision({ respuesta: bruto })]} />);
        expect(screen.getByText(/publicar \(confianza: 0\.40\)/)).toBeTruthy();
        expect(screen.queryByText(/0\.99/)).toBeNull();
    });

    it("enseña las respuestas noul y score de Laya", () => {
        const noul = { type: "noul", noul: 0.72, probabilities: { true: 0.72 }, answer_confidence: 0.72 } satisfies RespuestaLaya;
        const score = { type: "score", score: "alta", probabilities: { alta: 0.8 }, answer_confidence: 0.8 } satisfies RespuestaLaya;
        render(<LayaDecisionesPanel decisiones={[
            decision({ id: "d-noul", punto: "respuesta.basta", respuesta: noul }),
            decision({ id: "d-score", punto: "plan.dificultad", respuesta: score }),
        ]} />);
        expect(screen.getByText(/sí \(confianza: 0\.72\)/)).toBeTruthy();
        expect(screen.getByText(/alta \(confianza: 0\.80\)/)).toBeTruthy();
    });

    it("oculta el texto de una decisión privada", () => {
        render(<LayaDecisionesPanel decisiones={[decision({
            privado: true,
            respuesta: {
                type: "choice", choice: "teléfono 555 123 4567",
                probabilities: { "teléfono 555 123 4567": 0.8 }, answer_confidence: 0.8,
            },
        })]} />);
        expect(screen.getByText(/Privada · sin texto/)).toBeTruthy();
        expect(screen.queryByText(/555/)).toBeNull();
    });

    it("enseña los umbrales efectivos", () => {
        render(<LayaDecisionesPanel />);
        expect(screen.getByText("Umbrales efectivos")).toBeTruthy();
        expect(screen.getByText("publicar.moderar")).toBeTruthy();
    });

    it("enciende todas las habilidades por defecto y las apaga al pulsar", async () => {
        const usuario = userEvent.setup();
        render(<LayaDecisionesPanel />);
        const interruptores = screen.getAllByRole("switch");
        expect(interruptores).toHaveLength(12);
        expect(interruptores.every((b) => b.getAttribute("aria-checked") === "true")).toBe(true);
        const tdd = screen.getByRole("switch", { name: /TDD/ });
        await usuario.click(tdd);
        expect(tdd.getAttribute("aria-checked")).toBe("false");
    });
});
