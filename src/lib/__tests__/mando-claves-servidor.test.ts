/**
 * Pruebas de guardar/probar/olvidar claves de proveedor (Ola 286 · 2026-09-08 · F1).
 * Solo funciones puras más `guardarClave` con `node:fs/promises` parcheado por
 * `vi.mock`. Ninguna clave real: se usa «gsk_» + «x».repeat(40) como valor ficticio.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import path from "node:path";

/** Contenido del archivo de entorno simulado y modo de permisos aplicado. */
const api = vi.hoisted(() => {
    const estado: {
        archivos: Map<string, string>;
        chmods: Array<{ ruta: string; modo: number }>;
    } = {
        archivos: new Map(),
        chmods: [],
    };
    return { estado };
});

vi.mock("node:fs/promises", async (importOriginal) => {
    const real = await importOriginal<typeof import("node:fs/promises")>();
    return {
        ...real,
        readFile: async (ruta: string) => {
            const contenido = api.estado.archivos.get(ruta);
            if (contenido === undefined) throw new Error("ENOENT");
            return contenido;
        },
        writeFile: async (ruta: string, datos: string) => {
            api.estado.archivos.set(ruta, datos);
        },
        rename: async (origen: string, destino: string) => {
            const contenido = api.estado.archivos.get(origen);
            if (contenido === undefined) throw new Error("ENOENT");
            api.estado.archivos.set(destino, contenido);
            api.estado.archivos.delete(origen);
        },
        chmod: async (ruta: string, modo: number) => {
            api.estado.chmods.push({ ruta, modo });
        },
    };
});

import { guardarClave, huellaClave, validarClaveDeProveedor } from "../mando/claves-servidor";

let homeOriginal: string | undefined;

beforeEach(() => {
    api.estado.archivos.clear();
    api.estado.chmods.length = 0;
    homeOriginal = process.env.HOME;
    // El archivo vive en `~/.starseed/env`; apuntamos HOME a una ruta ficticia.
    process.env.HOME = "/tmp/fake-home";
    api.estado.archivos.set(path.join("/tmp/fake-home", ".starseed", "env"), "");
});

afterEach(() => {
    if (homeOriginal === undefined) delete process.env.HOME;
    else process.env.HOME = homeOriginal;
});

describe("huellaClave (F1)", () => {
    it("no revela más de 6 caracteres del valor", () => {
        const h = huellaClave("gsk_" + "x".repeat(40));
        expect(h).toBe(`gsk_xx…(44)`);
    });
});

describe("validarClaveDeProveedor (F1)", () => {
    it("acepta groq con prefijo gsk_ y longitud válida", () => {
        expect(validarClaveDeProveedor("groq", "gsk_" + "x".repeat(40)).ok).toBe(true);
    });
    it("rechaza groq con prefijo distinto", () => {
        const r = validarClaveDeProveedor("groq", "abc");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("gsk_");
    });
});

describe("guardarClave (F1)", () => {
    it("rechaza una variable inventada que no es del proveedor", async () => {
        const r = await guardarClave("groq", "CLAVE_INVENTADA", "gsk_" + "x".repeat(40));
        expect(r.ok).toBe(false);
    });
    it("conserva las demás líneas y sustituye la que ya existía", async () => {
        const ruta = path.join("/tmp/fake-home", ".starseed", "env");
        const inicial = "OPENROUTER_API_KEY=sk-or-algo-anterior\nAIHUBMIX_API_KEY=sk-otro\n";
        api.estado.archivos.set(ruta, inicial);

        const r = await guardarClave("groq", "GROQ_API_KEY", "gsk_" + "x".repeat(40));
        expect(r.ok).toBe(true);

        const contenido = api.estado.archivos.get(ruta) ?? "";
        const lineas = contenido.split("\n").filter(Boolean);
        // La línea de GROQ se sustituyó por el nuevo valor.
        expect(lineas).toContain("GROQ_API_KEY=" + "gsk_" + "x".repeat(40));
        // Las demás líneas quedaron intactas.
        expect(lineas).toContain("OPENROUTER_API_KEY=sk-or-algo-anterior");
        expect(lineas).toContain("AIHUBMIX_API_KEY=sk-otro");
        // El archivo quedó con chmod 600 (modo Unix 0o600 = 384).
        expect(api.estado.chmods).toContainEqual({ ruta, modo: 384 });
    });
});