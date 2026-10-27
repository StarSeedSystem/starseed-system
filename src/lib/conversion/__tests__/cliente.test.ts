import { afterEach, describe, expect, it, vi } from "vitest";

import { _limpiarCacheConversion, consultarDestinos, convertirBlob, enlaceConversor } from "../cliente";
import { sanearServidores, urlApi, type ServidorMalla } from "../malla";

afterEach(() => _limpiarCacheConversion());

const SIN_SERVIDORES: ServidorMalla[] = [];

function fetchPorUrl(respuestas: Record<string, () => Response>): typeof fetch {
    return vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        for (const [trozo, responder] of Object.entries(respuestas)) {
            if (url.includes(trozo)) return responder();
        }
        return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
}

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

    it("con 404 y sin conversores de malla guardados lo dice como antes", async () => {
        const f = fetchPorUrl({ "/api/conversion": () => new Response("", { status: 404 }) });
        const c = await consultarDestinos("informe.pdf", f, { servidoresMalla: SIN_SERVIDORES });
        expect(c.disponible).toBe(false);
        expect(c.motivo).toMatch(/no hay una neurona que convierta/);
    });

    it("con 404 prueba con la malla y devuelve sus destinos (con token por referencia)", async () => {
        const tokenDe = vi.fn(async () => "valor-del-almacen");
        const f = fetchPorUrl({
            "otra-neurona.local": () =>
                Response.json({ filee: { instalado: true, version: "2.0.0" }, destinos: { nombre: "PDF", ids: ["pdf"], destinos: ["docx"], conMotor: [] } }),
            "/api/conversion": () => new Response("", { status: 404 }),
        });
        const c = await consultarDestinos("informe.pdf", f, {
            servidoresMalla: [{ url: "https://otra-neurona.local", tokenRef: "NOMBRE_EN_LA_BOVEDA" }],
            tokenDe,
        });
        expect(c.disponible).toBe(true);
        expect(c.version).toBe("2.0.0");
        expect(c.destinos?.destinos).toEqual(["docx"]);
        expect(c.via).toBe("https://otra-neurona.local");
        expect(tokenDe).toHaveBeenCalledWith("NOMBRE_EN_LA_BOVEDA");
        const llamada = (f as ReturnType<typeof vi.fn>).mock.calls.find((u) => String(u[0]).includes("otra-neurona.local"));
        const cabeceras = (llamada?.[1] as RequestInit).headers as Headers;
        expect(cabeceras.get("Authorization")).toBe("Bearer valor-del-almacen");
    });

    it("la malla también puede fallar: el motivo lo dice sin fingir", async () => {
        const f = fetchPorUrl({
            "leja.local": () => new Response("", { status: 503 }),
            "/api/conversion": () => new Response("", { status: 503 }),
        });
        const c = await consultarDestinos("a.md", f, { servidoresMalla: [{ url: "https://leja.local" }] });
        expect(c.disponible).toBe(false);
        expect(c.motivo).toMatch(/1 neuronas de tu malla/);
        expect(c.motivo).toMatch(/leja\.local/);
    });

    it("al convertir, un 503 local releva a la malla y trae el archivo (con calidad)", async () => {
        const f = fetchPorUrl({
            "leja.local": () =>
                new Response("ZIP", {
                    status: 200,
                    headers: { "X-Conversion-Nombre": encodeURIComponent("a.pdf"), "X-Conversion-Salidas": "3", "X-Conversion-Motor": "filee 2.0.0" },
                }),
            "/api/conversion": () => new Response("", { status: 503 }),
        });
        const c = await convertirBlob(new Blob(["x"]), "a.png", "pdf", {
            calidad: 90,
            fetchImpl: f,
            servidoresMalla: [{ url: "https://leja.local/", tokenRef: "NOMBRE_EN_LA_BOVEDA" }],
        });
        expect(c).toMatchObject({ nombre: "a.pdf", salidas: 3, via: "https://leja.local" });
        const llamada = (f as ReturnType<typeof vi.fn>).mock.calls.find((u) => String(u[0]).includes("leja.local"));
        expect(String(llamada?.[0])).toBe("https://leja.local/api/conversion");
        const cuerpo = (llamada?.[1] as RequestInit).body as FormData;
        expect(cuerpo.get("calidad")).toBe("90");
        expect(cuerpo.get("a")).toBe("pdf");
    });

    it("un 422 con motivo del servidor NO releva a la malla: el motivo llega tal cual", async () => {
        const f = fetchPorUrl({
            "leja.local": () => Response.json({ filee: { instalado: true } }),
            "/api/conversion": () => Response.json({ ok: false, motivo: "No engine can do this conversion (md → odt)" }, { status: 422 }),
        });
        await expect(
            convertirBlob(new Blob(["# hola"]), "a.md", "odt", { fetchImpl: f, servidoresMalla: [{ url: "https://leja.local" }] }),
        ).rejects.toThrow(/No engine/);
        expect((f as ReturnType<typeof vi.fn>).mock.calls.filter((u) => String(u[0]).includes("leja.local"))).toHaveLength(0);
    });

    it("la lista de la malla se sanea: solo http(s), sin tokens en claro, sin duplicados", () => {
        const sanea = sanearServidores([
            { url: "https://a.local", tokenRef: " REF_BOVEDA " },
            { url: "https://a.local" },
            "https://b.local",
            { url: "ftp://c.local" },
            { url: "https://d.local", token: "secreto-en-claro" },
            null,
        ]);
        expect(sanea).toEqual([{ url: "https://a.local", tokenRef: "REF_BOVEDA" }]);
        expect(urlApi("https://a.local///")).toBe("https://a.local/api/conversion");
        expect(urlApi("https://a.local/api/conversion")).toBe("https://a.local/api/conversion");
        expect(urlApi("no-es-una-url")).toBe("");
    });
});
