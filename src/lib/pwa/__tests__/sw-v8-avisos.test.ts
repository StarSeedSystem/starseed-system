/**
 * (NOT1108A) El service worker de verdad (`public/sw-v8.js`): pulsar la notificación de un mensaje nuevo
 * (web/PWA) enfoca la app y le dice qué chat abrir; sin ventana, abre una en esa ruta; nunca otra web.
 *   NODE_ENV=test npx vitest run src/lib/pwa/__tests__/sw-v8-avisos.test.ts
 */
import { describe, expect, it } from "vitest";

import { montarSW } from "./sw-entorno-prueba";

const sw = () => montarSW({ servidor: () => new Response("no", { status: 404 }) });

describe("sw-v8 · notificación de un mensaje pulsada", () => {
    it("con la app abierta: la enfoca y le pide abrir el chat (sin recargar)", async () => {
        const s = sw();
        const cerrada = await s.notificacion({ ruta: "/messages?vista=neuronas&neurona=n%3Amac", id: "m1" });
        expect(cerrada).toBe(true);
        expect(s.estado.enfocada).toBe(1);
        expect(s.estado.mensajes).toContainEqual({ type: "starseed:abrir-ruta", ruta: "/messages?vista=neuronas&neurona=n%3Amac" });
        expect(s.estado.abiertas).toEqual([]);
    });

    it("sin ninguna ventana: abre una en la ruta del chat", async () => {
        const s = sw();
        await s.notificacion({ ruta: "/messages?vista=mensajes&hilo=h1" }, { sinVentanas: true });
        expect(s.estado.abiertas).toEqual(["/messages?vista=mensajes&hilo=h1"]);
    });

    it("una ruta que no es interna (otra web, `//`, `\\`) no abre nada", async () => {
        for (const ruta of ["https://evil.com", "//evil.com/x", "/\\evil.com", 42, undefined]) {
            const s = sw();
            const cerrada = await s.notificacion({ ruta });
            expect(cerrada).toBe(true);
            expect(s.estado.enfocada).toBe(0);
            expect(s.estado.abiertas).toEqual([]);
            expect(s.estado.mensajes).toEqual([]);
        }
    });
});
