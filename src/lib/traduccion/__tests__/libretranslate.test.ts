import { describe, expect, it } from "vitest";
import { crearClienteLibreTranslate } from "../libretranslate";

const BASE = "http://127.0.0.1:5000";
type Peticion = { url: string; init?: RequestInit };

/** fetch simulado: guarda cada petición y contesta con una traducción válida. */
function fetchFalso() {
    const peticiones: Peticion[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        peticiones.push({ url: String(url), init });
        return new Response(JSON.stringify({ translatedText: "x" }), { status: 200 });
    };
    return { fetch, peticiones };
}

const cuerpoDe = (peticiones: Peticion[], n: number): Record<string, unknown> =>
    JSON.parse((peticiones[n]?.init?.body as string) ?? "{}");

describe("api_key de LibreTranslate", () => {
    it("solo viaja en la petición que la pasa y no queda guardada en el cliente", async () => {
        const { fetch, peticiones } = fetchFalso();
        const cliente = crearClienteLibreTranslate({ base: BASE, fetch });
        await cliente.traducir({ q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA" });
        await cliente.traducir({ q: "b", source: "es", target: "en", format: "text" });
        expect(cuerpoDe(peticiones, 0)).toEqual({
            q: "a", source: "es", target: "en", format: "text", api_key: "CLAVE-DE-PRUEBA",
        });
        expect(cuerpoDe(peticiones, 1)).toEqual({ q: "b", source: "es", target: "en", format: "text" });
        expect(cuerpoDe(peticiones, 1)).not.toHaveProperty("api_key");
    });
});
