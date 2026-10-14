/**
 * Pruebas de la ruta POST /api/genesis/proponer (2026-10-10).
 * Se mockea Supabase (sesión) y la comprobación de máquina; el fetch al modelo
 * se stubbea por caso. Sin red ni disco.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

var usuario: { id: string } | null = null;

vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: usuario } }) },
    }),
}));

vi.mock("@/lib/seguridad/misma-maquina", () => ({
    esPeticionDeEstaMaquina: () => false,
}));

import { POST } from "../route";

const VARIABLES = [
    "GROQ_API_KEY",
    "NVIDIA_SHARED_KEY",
    "NVIDIA_API_KEY",
    "OPENROUTER_SHARED_KEY",
    "OPENROUTER_API_KEY",
    "FREELLMAPI_KEY",
    "GEMINI_API_KEY",
] as const;

const guardadas: Record<string, string | undefined> = {};

function peticion(cuerpo: unknown): NextRequest {
    return new Request("http://x/api/genesis/proponer", {
        method: "POST",
        body: JSON.stringify(cuerpo),
    }) as unknown as NextRequest;
}

beforeEach(() => {
    usuario = null;
    for (const v of VARIABLES) {
        guardadas[v] = process.env[v];
        delete process.env[v];
    }
});

afterEach(() => {
    for (const v of VARIABLES) {
        if (guardadas[v] === undefined) delete process.env[v];
        else process.env[v] = guardadas[v];
    }
    vi.unstubAllGlobals();
});

describe("POST /api/genesis/proponer", () => {
    it("sin sesión devuelve 401", async () => {
        usuario = null;
        const r = await POST(peticion({ mensaje: "hola" }));
        expect(r.status).toBe(401);
    });

    it("con sesión y mensaje vacío devuelve 400", async () => {
        usuario = { id: "u-1" };
        const r = await POST(peticion({ mensaje: "   " }));
        expect(r.status).toBe(400);
    });

    it("sin ninguna variable de modelos devuelve 503 con sinModelos", async () => {
        usuario = { id: "u-2" };
        const r = await POST(peticion({ mensaje: "Pon mi perfil en verde" }));
        expect(r.status).toBe(503);
        const j = await r.json();
        expect(j.sinModelos).toBe(true);
    });

    it("con GROQ y respuesta del modelo filtra operaciones inválidas", async () => {
        usuario = { id: "u-3" };
        process.env.GROQ_API_KEY = "prueba";
        const contenido = JSON.stringify({
            respuesta: "ok",
            operaciones: [
                { tipo: "dock.añadir", elemento: { id: "decisiones" }, motivo: "m" },
                { tipo: "dock.quitar", id: "settings", motivo: "m" },
            ],
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ choices: [{ message: { content: contenido } }] }),
            })),
        );
        const r = await POST(peticion({ mensaje: "Añade decisiones al dock" }));
        expect(r.status).toBe(200);
        const j = await r.json();
        expect(j.modelo).toMatch(/^groq\//);
        expect(j.operaciones).toHaveLength(1);
        expect(j.operaciones[0].op.tipo).toBe("dock.añadir");
        expect(j.rechazadas).toHaveLength(1);
        expect(j.rechazadas[0].indice).toBe(1);
    });
});
