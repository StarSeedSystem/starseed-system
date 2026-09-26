import { describe, expect, it, vi } from "vitest";

import { CLAVE_RECARGA, esErrorDeVersionNueva, MARGEN_RECARGA_MS, recargarPorVersionNueva } from "@/lib/pwa/recarga-por-version";

function almacen(inicial: Record<string, string> = {}) {
    const datos = { ...inicial };
    return { getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => void (datos[k] = v), datos };
}

describe("esErrorDeVersionNueva", () => {
    it("reconoce los errores de trozos que ya no existen", () => {
        const e = new Error("Loading chunk 51375 failed.\n(error: http://localhost:9002/_next/static/chunks/51375.js)");
        e.name = "ChunkLoadError";
        expect(esErrorDeVersionNueva(e)).toBe(true);
        expect(esErrorDeVersionNueva(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
        expect(esErrorDeVersionNueva("Loading CSS chunk 12 failed")).toBe(true);
    });
    it("no confunde otros errores", () => {
        expect(esErrorDeVersionNueva(new Error("Cannot read properties of undefined"))).toBe(false);
        expect(esErrorDeVersionNueva(null)).toBe(false);
        expect(esErrorDeVersionNueva({ message: "Loading chunk 1 failed" })).toBe(false);
    });
});

describe("recargarPorVersionNueva", () => {
    it("recarga una vez y anota cuándo", () => {
        const a = almacen();
        const recargar = vi.fn();
        expect(recargarPorVersionNueva(1_000_000, a, recargar)).toBe(true);
        expect(recargar).toHaveBeenCalledTimes(1);
        expect(a.datos[CLAVE_RECARGA]).toBe("1000000");
    });
    it("no entra en bucle: dentro del minuto no vuelve a recargar", () => {
        const a = almacen({ [CLAVE_RECARGA]: "1000000" });
        const recargar = vi.fn();
        expect(recargarPorVersionNueva(1_000_000 + MARGEN_RECARGA_MS - 1, a, recargar)).toBe(false);
        expect(recargar).not.toHaveBeenCalled();
        expect(recargarPorVersionNueva(1_000_000 + MARGEN_RECARGA_MS, a, recargar)).toBe(true);
    });
    it("sin almacenamiento no recarga (no puede evitar el bucle)", () => {
        const recargar = vi.fn();
        expect(recargarPorVersionNueva(1, null, recargar)).toBe(false);
        expect(recargar).not.toHaveBeenCalled();
    });
});
