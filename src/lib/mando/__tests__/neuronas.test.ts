import { describe, expect, it } from "vitest";

import { construirFilasNeuronas, variableSegura } from "@/lib/mando/neuronas";

const AHORA = "2026-09-17T00:20:00.000Z";
const informe = {
    t: "2026-09-17T00:18:00.000Z",
    pasarelas: [
        {
            clave: "neurona",
            modelo: "qwen2.5:0.5b",
            variable: null,
            tiene_clave: false,
            estado: "escribe",
        },
        {
            clave: "nvidia",
            modelo: "moonshotai/kimi-k3",
            variable: "NVIDIA_API_KEY",
            tiene_clave: true,
            estado: "escribe",
        },
    ],
};

describe("variableSegura", () => {
    it("admite un nombre de variable de entorno válido", () => {
        expect(variableSegura("NVIDIA_API_KEY")).toBe("NVIDIA_API_KEY");
        expect(variableSegura("OPENAI_API_KEY_7")).toBe("OPENAI_API_KEY_7");
    });

    it("rechaza cualquier cadena que no tenga forma de variable de entorno", () => {
        expect(variableSegura("xai-clave.local")).toBe("");
        expect(variableSegura("valor-secreto")).toBe("");
        expect(variableSegura("sk-abc123PERMUTATION")).toBe("");
        expect(variableSegura("")).toBe("");
    });

    it("rechaza un nombre que exceda el tope de 64 caracteres", () => {
        expect(variableSegura("A".repeat(65))).toBe("");
        expect(variableSegura("A".repeat(64))).toBe("A".repeat(64));
    });
});

describe("construirFilasNeuronas", () => {
    it("separa esta máquina, nube y motor local con sus modelos", () => {
        const filas = construirFilasNeuronas(informe, [
            { tarea: "NE1", donde: "mac", modelo: "nvidia/kimi-k3", minutos: 7 },
            { tarea: "NE2", donde: "nube", modelo: "xkiro/qwen", minutos: 2 },
        ], AHORA);

        expect(filas.map((fila) => fila.tipo)).toEqual(["esta máquina", "motor local", "nube"]);
        expect(filas.find((fila) => fila.id === "mac")).toMatchObject({ procesos: 1, responde: true });
        expect(filas.find((fila) => fila.id === "nube")?.modelos).toEqual([
            "moonshotai/kimi-k3",
            "xkiro/qwen",
        ]);
        expect(filas.find((fila) => fila.id === "motor-local")?.modelos).toEqual(["qwen2.5:0.5b"]);
    });

    it("dice cuánto lleva sin señal cuando supera diez minutos", () => {
        const filas = construirFilasNeuronas({
            t: "2026-09-16T23:55:00.000Z",
            pasarelas: [{ clave: "neurona", modelo: "qwen", estado: "escribe" }],
        }, [], AHORA);
        const motor = filas.find((fila) => fila.id === "motor-local");

        expect(motor).toMatchObject({
            responde: false,
            sinSenalMinutos: 25,
            estado: "Sin señal desde hace 25 min",
        });
    });

    it("cuenta procesos y conserva desde cuándo trabaja cada medio", () => {
        const filas = construirFilasNeuronas({}, [
            { tarea: "A", donde: "nube", modelo: "m1", minutos: 15, vistoEn: AHORA },
            { tarea: "B", donde: "nube", modelo: "m2", minutos: 3, vistoEn: AHORA },
        ], AHORA);
        const nube = filas.find((fila) => fila.id === "nube");

        expect(nube?.procesos).toBe(2);
        expect(nube?.desde).toBe("2026-09-17T00:05:00.000Z");
    });

    it("publica solo nombres de variable válidos y nunca sus valores", () => {
        const informeConValor = {
            ...informe,
            pasarelas: [
                ...informe.pasarelas,
                {
                    clave: "xai",
                    modelo: "grok",
                    variable: "XAI_CLAVE_LOCAL",
                    tiene_clave: true,
                    estado: "escribe",
                    valor: "secreto-real-123",
                },
            ],
        };
        const nube = construirFilasNeuronas(informeConValor, [], AHORA).find((fila) => fila.id === "nube");
        const serializado = JSON.stringify(nube);

        expect(nube?.credenciales).toEqual([
            { variable: "NVIDIA_API_KEY", presente: true },
            { variable: "XAI_CLAVE_LOCAL", presente: true },
        ]);
        expect(serializado).not.toContain("secreto-real-123");
    });

    it("omite cualquier variable que no sea un nombre de entorno válido", () => {
        const informeConValor = {
            ...informe,
            pasarelas: [
                ...informe.pasarelas,
                { clave: "xai", modelo: "grok", variable: "xai-clave.local", tiene_clave: true, estado: "escribe" },
            ],
        };
        const nube = construirFilasNeuronas(informeConValor, [], AHORA).find((fila) => fila.id === "nube");

        expect(nube?.credenciales).toEqual([{ variable: "NVIDIA_API_KEY", presente: true }]);
    });

    it("no publica una credencial cuyo campo variable tenga forma de secreto", () => {
        const informeConSecreto = {
            ...informe,
            pasarelas: [
                ...informe.pasarelas,
                { clave: "xai", modelo: "grok", variable: "sk-abc123supersecreto", tiene_clave: true, estado: "escribe" },
            ],
        };
        const filas = construirFilasNeuronas(informeConSecreto, [], AHORA);
        const nube = filas.find((fila) => fila.id === "nube");
        const serializado = JSON.stringify(filas);

        expect(nube?.credenciales).toEqual([{ variable: "NVIDIA_API_KEY", presente: true }]);
        expect(serializado).not.toContain("sk-abc123supersecreto");
        expect(serializado).not.toContain("supersecreto");
    });
});