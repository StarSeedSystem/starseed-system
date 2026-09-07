/**
 * Pruebas de almacenamiento de la neurona (Ola 273 · 2026-09-07).
 * Se prueban las funciones puras (`interpretarDf`, `explicarSwap`) y la regla
 * de seguridad de `limpiarRegenerables` (un id fuera de la lista blanca se
 * rechaza sin ejecutar nada), con `execFile` simulado para no tocar el disco.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Simulamos execFile ANTES de importar el módulo (el módulo lo convierte con
// promisify, así que el simulacro debe seguir la firma de callback).
const llamadas: Array<{ binario: string; args: string[] }> = [];
vi.mock("node:child_process", () => ({
    execFile: (binario: string, args: string[], _opts: unknown, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) => {
        llamadas.push({ binario, args });
        // pgrep SIN encontrar «next build» (código 1 = no hay build en marcha).
        if (binario === "pgrep") cb(new Error("exit 1"), { stdout: "", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
    },
    spawn: () => ({ unref: () => undefined, pid: 123 }),
}));

import { interpretarDf, explicarSwap, limpiarRegenerables, UMBRAL_SWAP_MB } from "../mando/almacenamiento";

describe("interpretarDf (Ola 273 · disco)", () => {
    it("lee una salida real de macOS y convierte bloques de 1 KB a MB", () => {
        const salida = [
            "Filesystem       1024-blocks      Used Available Capacity Mounted on",
            "/dev/disk3s1s1    488245288 149682344 10760940    94%    /",
        ].join("\n");
        const r = interpretarDf(salida);
        expect(r).not.toBeNull();
        expect(r?.totalMb).toBe(Math.round(488245288 / 1024));
        expect(r?.libreMb).toBe(Math.round(10760940 / 1024));
        expect(r?.usadoPct).toBe(Math.round((149682344 / 488245288) * 100));
    });
    it("devuelve null si la salida no tiene dos líneas", () => {
        expect(interpretarDf("Filesystem 1024-blocks Used Available Capacity Mounted on")).toBeNull();
        expect(interpretarDf("")).toBeNull();
    });
});

describe("explicarSwap (Ola 273 · honestidad del swap)", () => {
    it("con swap alto menciona que es memoria comprimida y NO promete que Drive lo baje", () => {
        const texto = explicarSwap(4000, 6144);
        expect(texto).toContain("comprimida");
        expect(texto).toContain("no RAM");
        expect(texto.toLowerCase()).toContain("no baja el swap");
    });
    it("bajo el umbral no alarma", () => {
        const texto = explicarSwap(UMBRAL_SWAP_MB, 6144);
        expect(texto).toContain("normal");
    });
});

describe("limpiarRegenerables (Ola 273 · lista blanca)", () => {
    beforeEach(() => {
        llamadas.length = 0;
    });
    it("rechaza un id que no está en la lista sin ejecutar nada", async () => {
        const r = await limpiarRegenerables(["../../etc", "starseed_memory_root"]);
        expect(r.ok).toBe(false);
        expect(r.limpiados).toEqual([]);
        // Solo el pgrep: jamás un rm con una ruta que no vino de medirRegenerables.
        expect(llamadas.filter((l) => l.binario === "rm")).toEqual([]);
    });
});
