/**
 * IMA12 · Prueba de cargar-paquetes: cambios en cargarCatalogo para respetar preferirPaquete,
 * cargar paquetes instalados, y preferir integrados cuando no hay preferencia.
 */
/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { crearCatalogo } from "../catalogo";
import { cargarCatalogo } from "../catalogos/cargar.ts";
import { idiomasConCatalogo } from "../idiomas";

const memoria = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } => {
    const m: Record<string, string> = {};
    return {
        getItem: (k) => m[k] ?? null,
        setItem: (k, v) => { m[k] = v; },
    };
};

beforeEach(() => {
    window.localStorage = memoria();
    window.dispatchEvent = vi.fn();
});

describe("cargarCatalogo con cargadores integrados", () => {
    it("carga el cargador integrado 'en' y traduce", async () => {
        const cat = await cargarCatalogo("en");
        expect(cat).not.toBeNull();
        expect(cat?.codigo).toBe("en");
        expect(cat?.traducir("--reinstall")).toBe("--reinstall");
        expect(cat?.revisado).toBe(false);
    });
});

describe("idiomasConCatalogo", () => {
    it("devuelve idiomas integrados + paquetes instalados", () => {
        const idiomas = idiomasConCatalogo();
        expect(idiomas).toContain("en");
        expect(idiomas).toContain("pt");
        expect(idiomas).toContain("fr");
        expect(idiomas.length).toBe(3);
    });
});