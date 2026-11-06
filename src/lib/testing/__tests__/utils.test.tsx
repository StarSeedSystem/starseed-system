import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { hastaQue, hastaQueYaNo } from "../utils";

describe("hastaQue", () => {
    it("devuelve sin esperar el valor de una condición ya satisfecha", async () => {
        const marca = await hastaQue(() => "listo");
        expect(marca).toBe("listo");
    });

    it("espera hasta que la condición se cumple y devuelve su valor", async () => {
        const estado = { encendido: "" };
        setTimeout(() => { estado.encendido = "encendido"; }, 5);
        expect(estado.encendido).toBe("");
        const marca = await hastaQue(() => estado.encendido || null);
        expect(marca).toBe("encendido");
    });

    it("falla con un mensaje claro cuando el plazo se agota", async () => {
        await expect(hastaQue(() => null, { timeoutMs: 40, intervaloMs: 10 })).rejects.toThrow(
            /aún no se cumple/,
        );
    });
});

describe("hastaQueYaNo", () => {
    it("espera hasta que el elemento se retira", async () => {
        const sierra = document.createElement("div");
        document.body.appendChild(sierra);
        setTimeout(() => sierra.remove(), 5);
        await hastaQueYaNo(() => document.body.contains(sierra) ? sierra : null);
        expect(document.body.contains(sierra)).toBe(false);
    });

    it("no espera nada cuando el elemento ya se retiró", async () => {
        await expect(hastaQueYaNo(() => null)).resolves.toBeUndefined();
    });

    it("falla con un mensaje claro cuando sigue presente al agotar el plazo", async () => {
        await expect(hastaQueYaNo(() => "sigo", { timeoutMs: 40, intervaloMs: 10 })).rejects.toThrow(
            /sigue presente/,
        );
    });
});
