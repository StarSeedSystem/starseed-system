import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
    CLAVE_SERVIDORES_MALLA,
    _limpiarCacheConversion,
    consultarDestinos,
    convertirBlob,
    enlaceConversor,
    parsearServidoresMalla,
} from "../cliente";

afterEach(() => _limpiarCacheConversion());

/** Fetch falso: responde según la URL y el método, como haría la red. */
function fetchFalso(responde: (url: string, init: RequestInit) => Response | Promise<Response>): Mock {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => responde(String(input), init ?? {}));
}

const destinosPdf = { nombre: "PDF", ids: ["pdf"], destinos: ["docx"], conMotor: [] };

const RESPUESTA_FILEE = () =>
    Response.json({ filee: { instalado: true, version: "2.0.0" }, destinos: destinosPdf });

describe("cliente de conversión", () => {
    it("sin Filee en ninguna parte (404 en la web pública) lo dice con honestidad", async () => {
        const f = fetchFalso(() => new Response("", { status: 404 }));
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, { servidores: [] });
        expect(c.disponible).toBe(false);
        expect(c.viaMalla).toBeUndefined();
        expect(c.motivo).toMatch(/Ninguna neurona de tu malla convierte archivos ahora mismo/);
        expect(f).toHaveBeenCalledWith("/api/conversion?de=pdf", expect.anything());
    });

    it("con Filee devuelve destinos y los guarda 5 min por formato", async () => {
        const f = fetchFalso(() => RESPUESTA_FILEE());
        const a = await consultarDestinos("a.pdf", f as unknown as typeof fetch);
        const b = await consultarDestinos("b.PDF", f as unknown as typeof fetch);
        expect(a).toMatchObject({ disponible: true, version: "2.0.0" });
        expect(b.destinos?.destinos).toEqual(["docx"]);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it("el motivo del servidor llega a la persona", async () => {
        const f = fetchFalso(() => Response.json({ ok: false, motivo: "No engine can do this conversion (md → odt)" }, { status: 422 }));
        await expect(convertirBlob(new Blob(["# hola"]), "a.md", "odt", { fetchImpl: f as unknown as typeof fetch })).rejects.toThrow(/No engine/);
    });

    it("lee el nombre y las salidas del resultado", async () => {
        const f = fetchFalso(() => new Response("PDF", { status: 200, headers: { "X-Conversion-Nombre": encodeURIComponent("Mi nota.pdf"), "X-Conversion-Salidas": "1", "X-Conversion-Motor": "filee 2.0.0" } }));
        const c = await convertirBlob(new Blob(["# hola"]), "Mi nota.md", "pdf", { fetchImpl: f as unknown as typeof fetch });
        expect(c).toMatchObject({ nombre: "Mi nota.pdf", salidas: 1, motor: "filee 2.0.0" });
    });

    it("enlace al conversor con lo que haya", () => {
        expect(enlaceConversor()).toBe("/convertir");
        expect(enlaceConversor({ url: "https://x/y.pdf", nombre: "y.pdf", a: "DOCX" })).toBe("/convertir?url=https%3A%2F%2Fx%2Fy.pdf&nombre=y.pdf&a=docx");
    });
});

describe("conversores de la malla (CNV1023D)", () => {
    it("la lista guardada se parsea limpia: {url, tokenRef}, sin secretos en claro", () => {
        const s = parsearServidoresMalla(JSON.stringify([
            { url: "https://malla.ejemplo/", tokenRef: "malla-conversion" },
            { url: "no-es-url", tokenRef: "x" },
            { url: "javascript:alert(1)" },
            { url: "https://otra.ejemplo", tokenRef: "valor-secreto al descubierto" },
        ]));
        expect(s).toEqual([
            { url: "https://malla.ejemplo", tokenRef: "malla-conversion" },
            { url: "https://otra.ejemplo" },
        ]);
        const texto = JSON.stringify(s);
        expect(texto).not.toMatch(/al descubierto/);
        expect(parsearServidoresMalla(null)).toEqual([]);
        expect(parsearServidoresMalla("{\"url\":\"https://x\"}")).toEqual([]);
    });

    it("a lo sumo 8 conversores por seguridad", () => {
        const lista: unknown[] = [];
        for (let i = 0; i < 12; i++) lista.push({ url: `https://n${i}.ejemplo` });
        expect(parsearServidoresMalla(JSON.stringify(lista))).toHaveLength(8);
    });

    it("404 en la local y una neurona de la malla con Filee: pregunta con su token", async () => {
        const f = fetchFalso((url) => (url.startsWith("/api/conversion")
            ? new Response("", { status: 404 })
            : RESPUESTA_FILEE()));
        const servirToken = vi.fn(async () => "tok-de-la-boveda");
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            servidores: [{ url: "https://malla.ejemplo", tokenRef: "malla-conversion" }],
            servirToken,
        });
        expect(c).toMatchObject({ disponible: true, version: "2.0.0", viaMalla: "https://malla.ejemplo" });
        expect(c.destinos?.destinos).toEqual(["docx"]);
        expect(servirToken).toHaveBeenCalledWith("malla-conversion");
        expect(f).toHaveBeenCalledWith(
            "https://malla.ejemplo/api/conversion?de=pdf",
            expect.objectContaining({ headers: { Authorization: "Bearer tok-de-la-boveda" } }),
        );
    });

    it("503 en la local y la primera neurona sin Filee: sigue con la segunda, sin fingir", async () => {
        const f = fetchFalso(async (url) => {
            if (url.startsWith("/api/conversion") && !url.includes("malla")) return new Response("", { status: 503 });
            if (url.includes("primera")) return Response.json({ filee: { instalado: false }, motivo: "Filee no está instalado en esta neurona." });
            return RESPUESTA_FILEE();
        });
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            servidores: [
                { url: "https://primera.ejemplo" },
                { url: "https://segunda.ejemplo" },
            ],
        });
        expect(c.disponible).toBe(true);
        expect(c.viaMalla).toBe("https://segunda.ejemplo");
        expect(f).toHaveBeenCalledWith(
            "https://primera.ejemplo/api/conversion?de=pdf",
            expect.objectContaining({ headers: {} }),
        );
    });

    it("la malla tampoco puede: el mensaje sigue siendo honesto", async () => {
        const f = fetchFalso((url) => (url.includes("malla")
            ? new Response("", { status: 503 })
            : new Response("", { status: 404 })));
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            servidores: [{ url: "https://malla.ejemplo", tokenRef: "malla-conversion" }],
            servirToken: async () => null,
        });
        expect(c.disponible).toBe(false);
        expect(c.motivo).toMatch(/Ninguna neurona de tu malla convierte archivos ahora mismo/);
    });

    it("sin conexión con la local, prueba la malla igual", async () => {
        const f = fetchFalso((url) => { if (url.includes("malla")) return RESPUESTA_FILEE(); throw new Error("red rota"); });
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            servidores: [{ url: "https://malla.ejemplo", tokenRef: "malla-conversion" }],
            servirToken: async () => "tok",
        });
        expect(c.disponible).toBe(true);
        expect(c.viaMalla).toBe("https://malla.ejemplo");
    });

    it("la lista salió del almacén, no de la nada", async () => {
        const f = fetchFalso((url) => (url.includes("malla") ? RESPUESTA_FILEE() : new Response("", { status: 404 })));
        const c = await consultarDestinos("informe.pdf", f as unknown as typeof fetch, {
            almacenGet: (clave) => clave === CLAVE_SERVIDORES_MALLA
                ? JSON.stringify([{ url: "https://malla.ejemplo", tokenRef: "malla-conversion" }])
                : null,
            servirToken: async () => "tok",
        });
        expect(c.viaMalla).toBe("https://malla.ejemplo");
    });

    it("convertir: la local no (404) y la malla convierte con el token de la bóveda", async () => {
        const f = fetchFalso((url, init) => {
            if (String(init.method ?? "GET") === "POST" && url.includes("malla")) {
                return new Response("DOCX", {
                    status: 200,
                    headers: { "X-Conversion-Nombre": encodeURIComponent("a.docx"), "X-Conversion-Motor": "filee 2.0.0 vía malla" },
                });
            }
            return new Response("", { status: 404 });
        });
        const servirToken = vi.fn(async () => "tok-de-la-boveda");
        const c = await convertirBlob(new Blob(["# hola"]), "a.md", "pdf", {
            fetchImpl: f as unknown as typeof fetch,
            malla: {
                servidores: [{ url: "https://malla.ejemplo", tokenRef: "malla-conversion" }],
                servirToken,
            },
        });
        expect(c).toMatchObject({ nombre: "a.docx", motor: "filee 2.0.0 vía malla" });
        expect(servirToken).toHaveBeenCalledWith("malla-conversion");
        expect(f).toHaveBeenCalledWith(
            "https://malla.ejemplo/api/conversion",
            expect.objectContaining({
                method: "POST",
                headers: { Authorization: "Bearer tok-de-la-boveda" },
            }),
        );
    });

    it("convertir: si la malla tampoco puede, lanza un error honesto", async () => {
        const f = fetchFalso(() => new Response("", { status: 404 }));
        await expect(convertirBlob(new Blob(["# hola"]), "a.md", "pdf", {
            fetchImpl: f as unknown as typeof fetch,
            malla: { servidores: [{ url: "https://malla.ejemplo" }] },
        })).rejects.toThrow(/Ninguna neurona de tu malla convierte archivos ahora mismo/);
    });
});
