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
    afterAll(() => {
        delete (globalThis as { window?: object }).window;
    });

    describe("página LOCAL (origen localhost/127.0.0.1 — la propia Mac)", () => {
        // (G1 · 2026-09-26) `paginaEsLocal()` lee `window.location.hostname`: aquí
        // la PÁGINA misma es un despliegue local, así que una base de bucle local
        // SÍ se reescribe al proxy del propio OS (el caso de siempre, Ola 278).
        beforeAll(() => {
            (globalThis as { window?: object }).window = { location: { hostname: "localhost" } };
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

    describe("página PÚBLICA (G1 · 2026-09-26 — p.ej. la app en una tablet cargando el OS desplegado)", () => {
        // La PÁGINA no es un despliegue local: una base de bucle local ya NO
        // significa "la neurona de la Mac que sirve el OS" — significa "el
        // backend de ESTE dispositivo". Reescribirla al proxy serviría la NUBE
        // bajo la etiqueta "local" sin avisar: el bug que G1 corrige. Se deja
        // TAL CUAL para que el navegador intente el `fetch` directo.
        beforeAll(() => {
            (globalThis as { window?: object }).window = { location: { hostname: "starseed-os.vercel.app" } };
        });

        it("base de bucle local → NO se reescribe al proxy", () => {
            expect(baseParaNavegador("http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000");
        });

        it("base de bucle local con subruta → NO se reescribe al proxy", () => {
            expect(baseParaNavegador("http://127.0.0.1:8000/api/ping")).toBe("http://127.0.0.1:8000/api/ping");
        });

        it("base de nube publicada → NO se toca (igual que en una página local)", () => {
            expect(baseParaNavegador("https://astraura.vercel.app")).toBe("https://astraura.vercel.app");
        });
    });

    describe("sin `window.location` (defensivo: no debe lanzar)", () => {
        beforeAll(() => {
            (globalThis as { window?: object }).window = {};
        });

        it("base de bucle local → NO se reescribe (paginaEsLocal() defensivo → false)", () => {
            expect(baseParaNavegador("http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000");
        });
    });
});