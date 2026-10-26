// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { convertirConMalla, destinosConversorMalla, estadoConversorMalla } from "../malla";

afterEach(() => {
    delete process.env.STARSEED_CONVERSOR_URL;
    delete process.env.STARSEED_CONVERSOR_TOKEN;
});

/** fetch falso contesta como el conversor de verdad (Hono). */
function falso(
    respuestas: { "/salud"?: unknown; "/formatos"?: unknown; "/convertir"?: { body?: Uint8Array; status?: number; cabeceras?: Record<string, string> } },
    tokenEsperado?: string,
): typeof fetch {
    return (async (url: string, init?: RequestInit) => {
        const ruta = String(url).replace(/^https?:\/\/[^/]+/, "");
        if (tokenEsperado) expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${tokenEsperado}`);
        if (init?.method === "POST") {
            const p = respuestas["/convertir"] ?? {};
            return new Response(new Uint8Array(p.body ?? []), { status: p.status ?? 200, headers: p.cabeceras ?? {} });
        }
        const clave = ruta.startsWith("/formatos") ? "/formatos" : ruta;
        const cuerpo = respuestas[clave as "/salud" | "/formatos"];
        return new Response(JSON.stringify(cuerpo ?? {}), { status: cuerpo === undefined ? 500 : 200 });
    }) as unknown as typeof fetch;
}

describe("Conversor por la malla", () => {
    it("salud diga si la neurona vecina tiene Filee", async () => {
        const estado = await estadoConversorMalla({ fetchImpl: falso({ "/salud": { ok: true, version: "1.0.0", filee: { instalado: true, version: "2.0.0" } } }), url: "http://127.0.0.1:4481/" });
        expect(estado).toEqual({ disponible: true, version: "2.0.0" });
    });

    it("sin conversor en la nota vecina: no disponible y sin destino", async () => {
        const fetchQueMuere = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
        expect(await estadoConversorMalla({ fetchImpl: fetchQueMuere })).toEqual({ disponible: false, version: null });
        expect(await destinosConversorMalla("md", { fetchImpl: fetchQueMuere })).toBeNull();
    });

    it("destinos de la neurona vecina para un formato conocido", async () => {
        const d = await destinosConversorMalla("nota.md", {
            fetchImpl: falso({ "/formatos": { ok: true, filee: { instalado: true, version: "2.0.0" }, de: "md", nombre: "Markdown", ids: ["md"], destinos: ["pdf", "docx"], conMotor: [] } }),
        });
        expect(d?.destinos.destinos).toEqual(["pdf", "docx"]);
        expect(d?.version).toBe("2.0.0");
    });

    it("formato que la vecina no conoce: null, no error", async () => {
        const fetchSinDestinos = (async (_url: URL | string) => new Response(JSON.stringify({ ok: true, filee: { instalado: true }, destinos: null }), { status: 404 })) as unknown as typeof fetch;
        expect(await destinosConversorMalla("rar", { fetchImpl: fetchSinDestinos })).toBeNull();
    });

    it("convertir devuelve los bytes de la vecina con nombre y salidas", async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const r = await convertirConMalla({ bytes, nombre: "informe.md", a: "PDF" }, {
            fetchImpl: falso({
                "/convertir": { body: bytes, cabeceras: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename*=UTF-8''informe.pdf", "X-Conversor-Salidas": "1" } },
            }),
        });
        expect(r).toMatchObject({ ok: true, nombre: "informe.pdf", tipo: "application/pdf", salidas: 1 });
        expect(r.bytes).toEqual(bytes);
    });

    it("si la vecina tiene otra conversión en curso, lo dice con su motivo", async () => {
        const r = await convertirConMalla({ bytes: new Uint8Array([1]), nombre: "a.md", a: "pdf" }, {
            fetchImpl: falso({ "/convertir": { status: 429 } }),
        });
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain("en curso");
    });

    it("pide el token de malla en los encabezados si se le da uno", async () => {
        const estado = await estadoConversorMalla({ fetchImpl: falso({ "/salud": { ok: true, filee: { instalado: true } } }, "secreto"), token: "secreto" });
        expect(estado.disponible).toBe(true);
    });
});
