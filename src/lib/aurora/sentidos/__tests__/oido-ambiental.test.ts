import { describe, it, expect } from "vitest";
import {
    decidirEnvioAlOido,
    UMBRAL_ENERGIA_POR_DEFECTO,
    INTERVALO_MINIMO_MS_POR_DEFECTO,
    type EstadoSentidos,
    type FragmentoAudio,
} from "../oido-ambiental";

const ENCENDIDOS: EstadoSentidos = { encendidos: true, siempreEscuchando: true };
const APAGADOS: EstadoSentidos = { encendidos: false, siempreEscuchando: true };

function fragmento(cambios: Partial<FragmentoAudio> = {}): FragmentoAudio {
    return { id: "f-1", contieneVoz: false, energia: 0.6, timestamp: 10_000, ...cambios };
}

describe("decidirEnvioAlOido · puertas duras", () => {
    it("rechaza con los sentidos apagados aunque el fragmento sea perfecto", () => {
        const d = decidirEnvioAlOido(APAGADOS, fragmento(), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "sentidos-apagados" });
    });

    it("rechaza el fragmento que contiene voz: la voz va por el reconocimiento", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ contieneVoz: true }), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "contiene-voz" });
    });

    it("rechaza la energía por debajo del umbral (silencio no gasta CPU)", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0.49 }), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "energia-insuficiente" });
    });

    it("acepta la energía justo en el umbral", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0.5 }), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: true });
    });

    it("rechaza una energía no finita en vez de dejarla pasar", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: Number.NaN }), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "energia-insuficiente" });
    });

    it("acepta el primer fragmento (sin envío previo)", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento(), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: true });
    });
});

describe("decidirEnvioAlOido · cadencia (no gastar CPU)", () => {
    it("rechaza si no ha pasado el intervalo mínimo", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 1500 }), 1000, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "intervalo-demasiado-corto" });
    });

    it("acepta justo al cumplirse el intervalo mínimo", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 2000 }), 1000, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: true });
    });

    it("acepta cuando el intervalo ya se superó de sobra", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 9000 }), 1000, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: true });
    });

    it("con intervalo 0 nunca frena un fragmento válido", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: 1000 }), 1000, 0.5, 0);
        expect(d).toEqual({ enviarAlServicio: true });
    });

    it("rechaza una marca temporal no finita", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento({ timestamp: Number.NaN }), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "fragmento-invalido" });
    });

    it("rechaza un último envío no finito en vez de comparar contra NaN", () => {
        const d = decidirEnvioAlOido(ENCENDIDOS, fragmento(), Number.NaN, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: false, razon: "fragmento-invalido" });
    });
});

describe("decidirEnvioAlOido · valores por defecto y modo de escucha", () => {
    it("usa el umbral y el intervalo por defecto si no se pasan", () => {
        expect(UMBRAL_ENERGIA_POR_DEFECTO).toBeGreaterThan(0);
        expect(INTERVALO_MINIMO_MS_POR_DEFECTO).toBeGreaterThan(0);

        const callado = decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 0 }));
        expect(callado).toEqual({ enviarAlServicio: false, razon: "energia-insuficiente" });

        const fuerte = decidirEnvioAlOido(ENCENDIDOS, fragmento({ energia: 1 }));
        expect(fuerte).toEqual({ enviarAlServicio: true });

        const pronto = decidirEnvioAlOido(
            ENCENDIDOS,
            fragmento({ timestamp: INTERVALO_MINIMO_MS_POR_DEFECTO - 1 }),
            0,
        );
        expect(pronto).toEqual({ enviarAlServicio: false, razon: "intervalo-demasiado-corto" });
    });

    it("«siempre escuchando» apagado no bloquea un tramo ya capturado", () => {
        const soloAlHablar: EstadoSentidos = { encendidos: true, siempreEscuchando: false };
        const d = decidirEnvioAlOido(soloAlHablar, fragmento(), null, 0.5, 1000);
        expect(d).toEqual({ enviarAlServicio: true });
    });
});
