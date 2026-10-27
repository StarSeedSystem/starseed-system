import { describe, it, expect } from "vitest";
import {
    lineaContextoOido,
    CADUCIDAD_OID_MS,
    TOPE_CONTEXTO_OID,
    type EtiquetaOida,
} from "../contexto-oido";

const AHORA = 100_000;

function etiqueta(cambios: Partial<EtiquetaOida>): EtiquetaOida {
    return { etiqueta: "timbre", confianza: 0.8, timestamp: AHORA, ...cambios };
}

describe("lineaContextoOido · formato", () => {
    it("escribe la línea con coma decimal española", () => {
        const linea = lineaContextoOido(
            [etiqueta({ etiqueta: "timbre", confianza: 0.8123 }), etiqueta({ etiqueta: "lluvia", confianza: 0.64 })],
            AHORA,
            CADUCIDAD_OID_MS,
        );
        expect(linea).toBe("Se oye: timbre (0,81), lluvia (0,64)");
    });

    it("ordena de la etiqueta más sonora a la menos", () => {
        const linea = lineaContextoOido(
            [etiqueta({ etiqueta: "lluvia", confianza: 0.64 }), etiqueta({ etiqueta: "timbre", confianza: 0.82 })],
            AHORA,
            CADUCIDAD_OID_MS,
        );
        expect(linea).toBe("Se oye: timbre (0,82), lluvia (0,64)");
    });

    it("devuelve cadena vacía si nada suena ahora mismo", () => {
        expect(lineaContextoOido([], AHORA, CADUCIDAD_OID_MS)).toBe("");
    });

    it("no devuelve solo el prefijo vacío: o línea con etiquetas o vacía", () => {
        const linea = lineaContextoOido([etiqueta({ timestamp: AHORA - CADUCIDAD_OID_MS - 1 })], AHORA, CADUCIDAD_OID_MS);
        expect(linea).toBe("");
        expect(linea).not.toContain("Se oye");
    });
});

describe("lineaContextoOido · caducidad (2 minutos)", () => {
    it("cuenta la etiqueta justo al borde de los 2 minutos", () => {
        const linea = lineaContextoOido([etiqueta({ timestamp: AHORA - CADUCIDAD_OID_MS })], AHORA, CADUCIDAD_OID_MS);
        expect(linea).toBe("Se oye: timbre (0,80)");
    });

    it("suelta la etiqueta que ya se le fue (más de 2 min)", () => {
        const linea = lineaContextoOido([etiqueta({ timestamp: AHORA - CADUCIDAD_OID_MS - 1 })], AHORA, CADUCIDAD_OID_MS);
        expect(linea).toBe("");
    });

    it("respetan la caducidad que entra por parámetro", () => {
        const linea = lineaContextoOido([etiqueta({ timestamp: AHORA - 5_000 })], AHORA, 3_000);
        expect(linea).toBe("");
    });
});

describe("lineaContextoOido · sin repetir etiqueta", () => {
    it("mantiene la mejor confianza cuando la misma etiqueta se oye dos veces", () => {
        const linea = lineaContextoOido(
            [etiqueta({ confianza: 0.51 }), etiqueta({ confianza: 0.77, timestamp: AHORA - 1_000 })],
            AHORA,
            CADUCIDAD_OID_MS,
        );
        expect(linea).toBe("Se oye: timbre (0,77)");
    });

    it("no arrastra la repetición caducada de otra etiqueta", () => {
        const linea = lineaContextoOido(
            [etiqueta({ etiqueta: "perro", confianza: 0.4 }), etiqueta({ etiqueta: "perro", timestamp: AHORA - 10_000 })],
            AHORA,
            5_000,
        );
        expect(linea).toBe("Se oye: perro (0,40)");
    });
});

describe("lineaContextoOido · tope y valores inválidos", () => {
    it("corta antes de pasarse de 200 caracteres", () => {
        const etiquetas: EtiquetaOida[] = [];
        for (let i = 0; i < 30; i++) {
            etiquetas.push(etiqueta({ etiqueta: `sonido-largo-${i}`, confianza: 0.9 - i * 0.01 }));
        }
        const linea = lineaContextoOido(etiquetas, AHORA, CADUCIDAD_OID_MS);
        expect(linea.length).toBeLessThanOrEqual(TOPE_CONTEXTO_OID);
        expect(linea.startsWith("Se oye: ")).toBe(true);
        // no se trunca a medias: la última etiqueta que entra está completa
        expect(linea.endsWith(")")).toBe(true);
    });

    it("ignora etiquetas vacías, blancas o con confianza inválida", () => {
        const linea = lineaContextoOido(
            [
                null,
                etiqueta({ etiqueta: "" }),
                etiqueta({ etiqueta: "   " }),
                etiqueta({ etiqueta: "viento", confianza: Number.NaN }),
            ] as unknown as EtiquetaOida[],
            AHORA,
            CADUCIDAD_OID_MS,
        );
        expect(linea).toBe("");
    });

    it("ignora una entrada que no sea una lista", () => {
        expect(lineaContextoOido(null as unknown as EtiquetaOida[], AHORA, CADUCIDAD_OID_MS)).toBe("");
        const linea = lineaContextoOido([etiqueta({ etiqueta: "lluvia" })], Number.NaN, CADUCIDAD_OID_MS);
        expect(linea).toBe("");
    });
});


