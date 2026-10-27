import { describe, expect, it } from "vitest";
import * as modulo from "../libretranslate";

/** TRD1020A · parte 2 de 2 — pruebas del cliente puro de LibreTranslate. El contrato fija el TRÁFICO (endpoints, cuerpo JSON, api_key solo si quien llama la pasa, lotes por límite de caracteres con orden, errores en español claro) pero NO el nombre de la fábrica ni la forma del objeto devuelto: eso se resuelve con tolerancia en `montarCliente` y en los lectores. `fetch` INYECTADO: nada de red, sin `vi.mock` ni importar `route.ts`. */

const BASE = "http://127.0.0.1:5000";

type ClienteLibre = {
    traducir(opciones: Record<string, unknown>): Promise<unknown>;
    idiomas(): Promise<unknown>; detectar(q: string): Promise<unknown>; salud(): Promise<unknown>;
};
type LlamadaHttp = { url: string; opciones?: Record<string, unknown> };

function esCliente(valor: unknown): valor is ClienteLibre {
    const o = (valor ?? null) as Record<string, unknown> | null;
    return !!o && ["traducir", "idiomas", "detectar", "salud"].every((m) => typeof o[m] === "function");
}

/** El contrato fija los MÉTODOS, no el nombre de la fábrica: se prueban todas las exportaciones de función (llamada o new) con las formas probables de opciones juntas — duplicar claves es inofensivo. */
function montarCliente(transporte: typeof fetch): ClienteLibre {
    const opciones: Record<string, unknown> = { base: BASE, baseUrl: BASE, url: BASE, fetch: transporte };
    for (const fabrica of Object.values(modulo as unknown as Record<string, unknown>).filter((v): v is ((o: Record<string, unknown>) => unknown) => typeof v === "function")) {
        try { const hecho = fabrica(opciones); if (esCliente(hecho)) return hecho; } catch { /* siguiente */ }
        try { const hecho = new (fabrica as unknown as new (o: Record<string, unknown>) => unknown)(opciones); if (esCliente(hecho)) return hecho; } catch { /* siguiente */ }
    }
    throw new Error("La parte 1 (cliente) no está integrada o no exporta una fábrica reconocible de ../libretranslate.");
}

/** fetch de prueba: guarda cada llamada y responde con la siguiente respuesta en cola (la última se repite). */
function fetchSimulado(respuestas: { estado: number; cuerpo: string }[], llamadas: LlamadaHttp[]): typeof fetch {
    let i = 0;
    return ((url: RequestInfo | URL, init?: Record<string, unknown>) => {
        llamadas.push({ url: String(url), opciones: init });
        const r = respuestas[Math.min(i++, respuestas.length - 1)];
        return Promise.resolve(new Response(r.cuerpo, { status: r.estado }));
    }) as typeof fetch;
}

/** Prepara cliente + registro de llamadas con las respuestas dadas (en orden). */
function preparar(respuestas: { estado: number; cuerpo: string }[]): [ClienteLibre, LlamadaHttp[]] {
    const llamadas: LlamadaHttp[] = [];
    return [montarCliente(fetchSimulado(respuestas, llamadas)), llamadas];
}

/** Lectores tolerantes de la RESPUESTA del cliente: el contrato fija lo que devuelven los ENDPOINTS (translatedText, detectedLanguage…), no la forma del objeto que el cliente entrega a quien llama. */
function textoDe(r: unknown): string | string[] {
    if (typeof r === "string") return r;
    const t = ((r ?? {}) as Record<string, unknown>).translatedText ?? ((r ?? {}) as Record<string, unknown>).texto;
    return typeof t === "string" ? t : Array.isArray(t) ? (t as unknown[]).map(String) : "";
}

function idiomaDe(r: unknown): string | null {
    if (Array.isArray(r)) return idiomaDe(r[0]); // respuesta cruda: [{confidence, language}]
    const o = (r ?? {}) as Record<string, unknown>;
    const bruto = typeof r === "string" ? r : (o.detectedLanguage ?? o.idiomaDetectado ?? o.idioma);
    if (typeof bruto === "string") return bruto;
    if (Array.isArray(bruto)) return idiomaDe(bruto[0]);
    return typeof ((bruto ?? {}) as Record<string, unknown>).language === "string" ? ((bruto ?? {}) as Record<string, unknown>).language as string : null;
}

function cuerpoDe(l?: LlamadaHttp): Record<string, unknown> {
    try { return JSON.parse(typeof l?.opciones?.body === "string" ? l.opciones.body : "") as Record<string, unknown>; } catch { return {}; }
}

describe("Cliente puro de LibreTranslate · TRD1020A (parte 2)", () => {
    it("traducir: POST {base}/translate con solo lo pedido; api_key SOLO si quien llama la pasa", async () => {
        const [cliente, llamadas] = preparar([{ estado: 200, cuerpo: '{"translatedText":"Hello"}' }]);
        expect(textoDe(await cliente.traducir({ q: "Hola", source: "es", target: "en", format: "text" }))).toBe("Hello");
        expect(cuerpoDe(llamadas[0])).toEqual({ q: "Hola", source: "es", target: "en", format: "text" });
        await cliente.traducir({ q: "Hola", source: "es", target: "en", apiKey: "clave-de-prueba", api_key: "clave-de-prueba" });
        expect(cuerpoDe(llamadas[1]).api_key).toBe("clave-de-prueba");
        expect(llamadas[0]?.url).toContain("/translate");
    });

    it("source «auto»: el idioma detectado por el endpoint se ve en la respuesta", async () => {
        const [cliente, llamadas] = preparar([{ estado: 200, cuerpo: '{"translatedText":"Hello","detectedLanguage":{"confidence":0.99,"language":"en"}}' }]);
        expect(idiomaDe(await cliente.traducir({ q: "Hola", source: "auto", target: "en" }))).toBe("en");
        expect(cuerpoDe(llamadas[0]).source).toBe("auto");
    });
    it("lista larga: parte en lotes por el límite de caracteres configurado, sin perder ítems ni desordenar", async () => {
        const items = Array.from({ length: 6 }, (_, i) => `item-${i}` + "x".repeat(700)); // ~4.200 caracteres
        const llamadas: LlamadaHttp[] = [];
        const eco: typeof fetch = ((url: RequestInfo | URL, init?: Record<string, unknown>) => {
            llamadas.push({ url: String(url), opciones: init });
            const pedido = (JSON.parse(String(init?.body)) as { q?: unknown }).q;
            const lote = Array.isArray(pedido) ? (pedido as string[]) : [String(pedido)];
            return Promise.resolve(new Response(JSON.stringify({ translatedText: lote.map((t) => t.toUpperCase()) }), { status: 200 }));
        }) as typeof fetch;
        const fusion = [textoDe(await montarCliente(eco).traducir({ q: items, source: "es", target: "en", loteCaracteres: 3000, limiteCaracteres: 3000 }))].flat();
        expect(fusion).toEqual(items.map((t) => t.toUpperCase()));
        for (const l of llamadas) expect((Array.isArray(cuerpoDe(l).q) ? (cuerpoDe(l).q as string[]).join("") : String(cuerpoDe(l).q)).length).toBeLessThanOrEqual(3000);
    });

    it("idiomas(): GET {base}/languages", async () => {
        const [cliente, llamadas] = preparar([{ estado: 200, cuerpo: '[{"code":"es","name":"spanish"},{"code":"en","name":"english"}]' }]);
        expect(await cliente.idiomas()).toHaveLength(2); // [{code, name}] crudo o normalizado con 2 idiomas
        expect(llamadas[0]?.opciones?.method).toBe("GET"); expect(llamadas[0]?.url).toContain("/languages");
    });
    it("detectar(q): POST {base}/detect con el texto en el cuerpo", async () => {
        const [cliente, llamadas] = preparar([{ estado: 200, cuerpo: '[{"confidence":0.99,"language":"es"}]' }]);
        expect(idiomaDe(await cliente.detectar("Hola"))).toBe("es"); expect(cuerpoDe(llamadas[0]).q).toBe("Hola");
        expect(llamadas[0]?.url).toContain("/detect");
    });
    it("salud(): GET {base}/health", async () => {
        const [cliente, llamadas] = preparar([{ estado: 200, cuerpo: '{"success":true}' }]);
        expect(((v: unknown) => v === true || ((v ?? {}) as Record<string, unknown>).success === true)(await cliente.salud())).toBe(true);
        expect(llamadas[0]?.url).toContain("/health"); expect(llamadas[0]?.opciones?.method).toBe("GET");
    });
    for (const estado of [400, 403, 429, 500]) {
        it(`HTTP ${estado}: error en español claro, sin volcar el cuerpo crudo`, async () => {
            const [cliente] = preparar([{ estado, cuerpo: '{"error":"más detalles"}' }]);
            let mensaje = "";
            await cliente.traducir({ q: "Hola", source: "es", target: "en" }).catch((e: unknown) => { mensaje = e instanceof Error ? e.message : String(e); });
            expect(mensaje.length > 8 && !mensaje.startsWith("{") && !mensaje.includes("más detalles")).toBe(true);
        });
    }
});
