import { afterEach, describe, expect, it, vi } from "vitest";

import {
    _limpiarCacheConversion,
    CLAVE_SERVIDORES_CONVERSION,
    consultarDestinos,
    convertirBlob,
    enlaceConversor,
    leerServidoresConversion,
    normalizarServidoresConversion,
} from "../cliente";

afterEach(() => _limpiarCacheConversion());

const llavero = (valores: Record<string, string>) => ({
    leer: (ref: string) => valores[ref] ?? null,
});

const servidor = (url: string, tokenRef: string | null = "conversion/nodo") => ({ url, tokenRef });

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

    it("si esta neurona no convierte, pregunta a un conversor de la malla", async () => {
        const f = vi.fn(async (url: string) => {
            if (url === "/api/conversion?de=pdf") return new Response("", { status: 404 });
            return Response.json({
                ok: true,
                filee: { instalado: true, version: "1.0.0" },
                de: "pdf",
                nombre: "PDF",
                ids: ["pdf"],
                destinos: ["docx"],
                conMotor: ["odt"],
            });
        });
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            servidores: [servidor("https://nodo-1.example")],
            credenciales: llavero({ "conversion/nodo": "t0k-1" }),
        });
        expect(c).toMatchObject({ disponible: true, via: "malla", version: "1.0.0" });
        expect(c.destinos).toEqual({ nombre: "PDF", ids: ["pdf"], destinos: ["docx"], conMotor: ["odt"] });
        expect(f).toHaveBeenNthCalledWith(2, "https://nodo-1.example/formatos?de=pdf", expect.objectContaining({
            headers: { Authorization: "Bearer t0k-1" },
        }));
    });

    it("sin la credencial no finge: no llama a la malla y lo dice", async () => {
        const f = vi.fn(async () => new Response("", { status: 404 }));
        const c = await consultarDestinos("a.pdf", f as unknown as typeof fetch, {
            servidores: [servidor("https://nodo-1.example")],
            credenciales: llavero({}),
        });
        expect(f).toHaveBeenCalledTimes(1);
        expect(c.disponible).toBe(false);
        expect(c.motivo).toMatch(/no hay una neurona que convierta/);
    });

    it("convierte por la malla con el token del almacén y lee sus cabeceras", async () => {
        const f = vi.fn(async (url: string) => {
            if (url === "/api/conversion") {
                return Response.json({ ok: false, motivo: "Filee no está instalado en esta neurona." }, { status: 503 });
            }
            return new Response("DOCX", {
                status: 200,
                headers: {
                    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("Mi nota.docx")}`,
                    "X-Conversor-Salidas": "2",
                    "X-Conversor-Ms": "42",
                },
            });
        });
        const c = await convertirBlob(new Blob(["# hola"]), "Mi nota.md", "docx", {
            fetchImpl: f as unknown as typeof fetch,
            servidores: [servidor("https://nodo-1.example")],
            credenciales: llavero({ "conversion/nodo": "t0k-1" }),
        });
        expect(c).toMatchObject({ nombre: "Mi nota.docx", salidas: 2, motor: "filee en la malla", ms: 42, via: "malla" });
        expect(await c.blob.text()).toBe("DOCX");
        expect(f).toHaveBeenNthCalledWith(2, "https://nodo-1.example/convertir", expect.objectContaining({
            method: "POST",
            headers: { Authorization: "Bearer t0k-1" },
        }));
    });

    it("ante 429 o 402 releva al siguiente conversor de la malla", async () => {
        const llamadas: string[] = [];
        const f = vi.fn(async (url: string) => {
            llamadas.push(url);
            if (url === "/api/conversion") return Response.json({ ok: false, motivo: "sin Filee" }, { status: 503 });
            if (url.startsWith("https://nodo-1")) return Response.json({ ok: false, motivo: "al límite" }, { status: 429 });
            return new Response("PDF", { status: 200, headers: { "Content-Disposition": 'attachment; filename="a.pdf"' } });
        });
        const c = await convertirBlob(new Blob(["x"]), "a.md", "pdf", {
            fetchImpl: f as unknown as typeof fetch,
            servidores: [servidor("https://nodo-1.example", "nodo-1"), servidor("https://nodo-2.example", "nodo-2")],
            credenciales: llavero({ "nodo-1": "t0k-1", "nodo-2": "t0k-2" }),
        });
        expect(c).toMatchObject({ nombre: "a.pdf", via: "malla", motor: "filee en la malla" });
        expect(llamadas.filter((u) => u.startsWith("https://"))).toEqual([
            "https://nodo-1.example/convertir",
            "https://nodo-2.example/convertir",
        ]);
    });

    it("si ningún conversor de la malla puede, lo dice sin mostrar el token", async () => {
        const token = "secreto-que-no-debe-salir";
        const f = vi.fn(async (url: string) => {
            if (url === "/api/conversion") return new Response("", { status: 404 });
            return Response.json({ ok: false, motivo: "sin Filee" }, { status: 503 });
        });
        let mensaje = "";
        try {
            await convertirBlob(new Blob(["x"]), "a.md", "pdf", {
                fetchImpl: f as unknown as typeof fetch,
                servidores: [servidor("https://nodo-1.example")],
                credenciales: llavero({ "conversion/nodo": token }),
            });
        } catch (e) {
            mensaje = (e as Error).message;
        }
        expect(mensaje).toMatch(/ninguno pudo/);
        expect(mensaje).not.toContain(token);
    });

    it("la lista guarda referencias, no tokens, y descarta lo que no es http(s)", () => {
        const bruto = [
            { url: "https://nodo-1.example/", "token-ref": "conversion/nodo1" },
            { url: "javascript:alert(1)", "token-ref": "x" },
            { url: "https://nodo-2.example", tokenRef: "conversion/nodo2" },
            { url: "https://nodo-1.example" },
            { url: "https://nodo-3.example", token: "en-claro" },
            { url: 42 },
        ];
        expect(normalizarServidoresConversion(bruto)).toEqual([
            { url: "https://nodo-1.example", tokenRef: "conversion/nodo1" },
            { url: "https://nodo-2.example", tokenRef: "conversion/nodo2" },
            { url: "https://nodo-3.example", tokenRef: null },
        ]);
        const almacen = { getItem: (k: string) => (k === CLAVE_SERVIDORES_CONVERSION ? JSON.stringify(bruto) : null) };
        expect(leerServidoresConversion(almacen)).toHaveLength(3);
        expect(leerServidoresConversion({ getItem: () => "{malo" })).toEqual([]);
    });

    it("enlace al conversor con lo que haya", () => {
        expect(enlaceConversor()).toBe("/convertir");
        expect(enlaceConversor({ url: "https://x/y.pdf", nombre: "y.pdf", a: "DOCX" })).toBe("/convertir?url=https%3A%2F%2Fx%2Fy.pdf&nombre=y.pdf&a=docx");
    });
});
