import { afterEach, describe, expect, it, vi } from "vitest";

import { _limpiarCacheConversion, consultarDestinos, convertirBlob, enlaceConversor } from "../cliente";

afterEach(() => _limpiarCacheConversion());

describe("cliente de conversión", () => {
    it("sin neurona que convierta (404 en la web pública) lo dice", async () => {
        const f = vi.fn(async () => new Response("", { status: 404 }));
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch);
        expect(c.disponible).toBe(false);
        expect(c.motivo).toMatch(/no hay una neurona que convierta/);
        expect(f).toHaveBeenCalledWith("/api/conversion?de=pdf", expect.anything());
    });

    it("con Filee devuelve destinos y los guarda 5 min por formato", async () => {
        const f = vi.fn(async () => Response.json({ filee: { instalado: true, version: "2.0.0" }, destinos: { nombre: "PDF", ids: ["pdf"], destinos: ["docx"], conMotor: [] } }));
        const a = await consultarDestinos("a.pdf", f as unknown as typeof fetch);
        const b = await consultarDestinos("b.PDF", f as unknown as typeof fetch);
        expect(a).toMatchObject({ disponible: true, version: "2.0.0" });
        expect(b.destinos?.destinos).toEqual(["docx"]);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it("el motivo del servidor llega a la persona", async () => {
        const f = vi.fn(async () => Response.json({ ok: false, motivo: "No engine can do this conversion (md → odt)" }, { status: 422 }));
        await expect(convertirBlob(new Blob(["# hola"]), "a.md", "odt", { fetchImpl: f as unknown as typeof fetch })).rejects.toThrow(/No engine/);
    });

    it("lee el nombre y las salidas del resultado", async () => {
        const f = vi.fn(async () => new Response("PDF", { status: 200, headers: { "X-Conversion-Nombre": encodeURIComponent("Mi nota.pdf"), "X-Conversion-Salidas": "1", "X-Conversion-Motor": "filee 2.0.0" } }));
        const c = await convertirBlob(new Blob(["# hola"]), "Mi nota.md", "pdf", { fetchImpl: f as unknown as typeof fetch });
        expect(c).toMatchObject({ nombre: "Mi nota.pdf", salidas: 1, motor: "filee 2.0.0" });
    });

    it("enlace al conversor con lo que haya", () => {
        expect(enlaceConversor()).toBe("/convertir");
        expect(enlaceConversor({ url: "https://x/y.pdf", nombre: "y.pdf", a: "DOCX" })).toBe("/convertir?url=https%3A%2F%2Fx%2Fy.pdf&nombre=y.pdf&a=docx");
    });
});
