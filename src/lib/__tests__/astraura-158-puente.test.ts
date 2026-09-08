import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { baseParaNavegador, esBaseLocal } from "@/ai/providers/astraura-158";

/**
 * (Ola 278 · OS3 · 2026-09-08) Pruebas PURAS del puente «red privada ↔ proxy
 * del OS» de Astraura 1.58. Verifica que una base de bucle local se enruta por
 * el proxy del OS en el navegador (el navegador bloquea 127.0.0.1) y que una
 * base de nube/LAN NO se toca. Sin red, sin DOM real y sin módulos de Node.
 */

describe("esBaseLocal", () => {
    it("127.0.0.1 con puerto → bucle local", () => {
        expect(esBaseLocal("http://127.0.0.1:8000")).toBe(true);
    });

    it("localhost → bucle local", () => {
        expect(esBaseLocal("http://localhost:8000")).toBe(true);
    });

    it("[::1] con puerto → bucle local", () => {
        expect(esBaseLocal("http://[::1]:8000")).toBe(true);
    });

    it("dominio publicado → NO local", () => {
        expect(esBaseLocal("https://astraura.vercel.app")).toBe(false);
    });

    it("IP de LAN → NO local", () => {
        expect(esBaseLocal("http://192.168.1.40:8000")).toBe(false);
    });

    it("ruta relativa (el propio proxy) → NO local", () => {
        expect(esBaseLocal("/api/ai/astraura-158")).toBe(false);
    });
});

describe("baseParaNavegador", () => {
    // El entorno de vitest es `node` (sin DOM); `baseParaNavegador` solo enruta
    // al proxy cuando corre "en el navegador" (`typeof window !== "undefined"`).
    // Simulamos `window` para ejercitar la rama de navegador de forma aislada.
    beforeAll(() => {
        (globalThis as { window?: object }).window = {};
    });

    afterAll(() => {
        delete (globalThis as { window?: object }).window;
    });

    it("base de bucle local → ruta del proxy del OS", () => {
        expect(baseParaNavegador("http://127.0.0.1:8000")).toBe("/api/ai/astraura-158");
    });

    it("base de bucle local con subruta → proxy + subruta", () => {
        expect(baseParaNavegador("http://127.0.0.1:8000/api/ping")).toBe("/api/ai/astraura-158/api/ping");
    });

    it("base de nube publicada → NO se toca", () => {
        expect(baseParaNavegador("https://astraura.vercel.app")).toBe("https://astraura.vercel.app");
    });
});