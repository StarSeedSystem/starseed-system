import { describe, expect, it } from "vitest";

import { cadenaDeRespaldo, motivoLegible, proveedorDe } from "@/lib/mando/respaldo-chat";

const catalogo = [
    { id: "nim/moonshotai/kimi-k3", proveedor: "nim", gratis: true, escritor: true },
    { id: "nim/deepseek-ai/deepseek-v4-flash", proveedor: "nim", gratis: true, escritor: true },
    { id: "nim/deepseek-ai/deepseek-v4-pro", proveedor: "nim", gratis: true, escritor: true },
    { id: "apinex/free/gemini-3.8-flash", proveedor: "apinex", gratis: true, escritor: true },
    { id: "openrouter/qwen/qwen3-coder", proveedor: "openrouter", gratis: true, escritor: true },
];

describe("proveedorDe", () => {
    it("parte por la primera barra", () => {
        expect(proveedorDe("nim/deepseek-ai/deepseek-v4-flash")).toBe("nim");
        expect(proveedorDe("suelto")).toBe("suelto");
    });
});

describe("cadenaDeRespaldo", () => {
    it("pone primero el modelo que pidió la persona", () => {
        const c = cadenaDeRespaldo("nim/moonshotai/kimi-k3", catalogo);
        expect(c[0]).toBe("nim/moonshotai/kimi-k3");
    });

    it("el segundo intento cambia de proveedor", () => {
        const c = cadenaDeRespaldo("nim/moonshotai/kimi-k3", catalogo);
        expect(proveedorDe(c[1])).not.toBe("nim");
    });

    it("respeta el tope y no repite modelos", () => {
        const c = cadenaDeRespaldo("nim/moonshotai/kimi-k3", catalogo, 3);
        expect(c).toHaveLength(3);
        expect(new Set(c).size).toBe(3);
    });

    it("descarta los de pago y los sin cupo, pero nunca al pedido", () => {
        const c = cadenaDeRespaldo("nim/moonshotai/kimi-k3", [
            ...catalogo,
            { id: "anthropic/claude-x", proveedor: "anthropic", gratis: false, escritor: true },
            { id: "nim/agotado", proveedor: "nim", gratis: true, escritor: true, salud: "sinCupo" },
        ]);
        expect(c).not.toContain("anthropic/claude-x");
        expect(c).not.toContain("nim/agotado");
    });

    it("con un pedido enfermo lo intenta igual: la elección es de la persona", () => {
        const c = cadenaDeRespaldo("nim/enfermo", [
            { id: "nim/enfermo", proveedor: "nim", gratis: true, escritor: true, salud: "caido" },
            ...catalogo,
        ]);
        expect(c[0]).toBe("nim/enfermo");
        expect(c.length).toBeGreaterThan(1);
    });

    it("sin catálogo devuelve solo el pedido en vez de romperse", () => {
        expect(cadenaDeRespaldo("nim/x", [])).toEqual(["nim/x"]);
    });

    it("agota todos los proveedores antes de repetir casa", () => {
        const c = cadenaDeRespaldo("", catalogo, 5);
        const casas = c.slice(0, 3).map(proveedorDe);
        expect(new Set(casas).size).toBe(3);
    });
});

describe("motivoLegible", () => {
    it("traduce el aborto a segundos, no a jerga", () => {
        const m = motivoLegible(new Error("This operation was aborted"), "nim/moonshotai/kimi-k3", 120_000);
        expect(m).toBe("kimi-k3 no respondió en 120 s");
        expect(m).not.toMatch(/aborted/i);
    });

    it("explica el 410 como modelo retirado", () => {
        expect(motivoLegible(new Error("nim respondió 410."), "nim/deepseek-ai/deepseek-v4-pro", 60_000)).toContain("ya no existe");
    });

    it("explica el 429 como falta de cupo", () => {
        expect(motivoLegible(new Error("nim respondió 429."), "nim/x", 60_000)).toContain("sin cupo");
    });

    it("no se rompe con un fallo sin mensaje", () => {
        expect(motivoLegible(null, "nim/x", 60_000)).toContain("fallo sin mensaje");
    });
});
