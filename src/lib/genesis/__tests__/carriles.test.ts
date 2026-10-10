import { afterEach, describe, expect, it, vi } from "vitest";
import { carrilesGenesis, preguntarCarriles } from "../carriles-servidor";

const VARIABLES = ["GROQ_API_KEY", "NVIDIA_SHARED_KEY", "NVIDIA_API_KEY", "OPENROUTER_SHARED_KEY", "OPENROUTER_API_KEY", "FREELLMAPI_KEY", "GEMINI_API_KEY", "STARSEED_GENESIS_OPENROUTER"];

function conEntorno(valores: Record<string, string>, fn: () => void) {
    const antes = Object.fromEntries(VARIABLES.map((k) => [k, process.env[k]]));
    for (const k of VARIABLES) delete process.env[k];
    Object.assign(process.env, valores);
    try {
        fn();
    } finally {
        for (const k of VARIABLES) {
            if (antes[k] === undefined) delete process.env[k];
            else process.env[k] = antes[k];
        }
    }
}

afterEach(() => vi.unstubAllGlobals());

describe("carriles gratuitos de Genesis", () => {
    it("sin variables no hay carriles (la ruta lo dice con un 503)", () => {
        conEntorno({}, () => expect(carrilesGenesis({ local: true })).toEqual([]));
    });

    it("orden gratis-primero, nunca un modelo de pago de OpenRouter y FreeLLMAPI solo en local", () => {
        conEntorno({ GROQ_API_KEY: "g", NVIDIA_SHARED_KEY: "n1,n2", OPENROUTER_SHARED_KEY: "o", FREELLMAPI_KEY: "f", GEMINI_API_KEY: "m" }, () => {
            const local = carrilesGenesis({ local: true }).map((c) => c.nombre.split("/")[0]);
            expect(local).toEqual(["groq", "nim", "openrouter", "freellmapi", "gemini"]);
            expect(carrilesGenesis({ local: false }).map((c) => c.nombre.split("/")[0])).not.toContain("freellmapi");
            // La clave rotada usa solo la primera y nunca aparece en el nombre.
            const nim = carrilesGenesis({ local: false }).find((c) => c.nombre.startsWith("nim/"))!;
            expect(nim.cabeceras.Authorization).toBe("Bearer n1");
            expect(carrilesGenesis({ local: false }).every((c) => !c.nombre.includes("n1"))).toBe(true);
        });
        conEntorno({ OPENROUTER_API_KEY: "o", STARSEED_GENESIS_OPENROUTER: "openai/gpt-5" }, () => {
            expect(carrilesGenesis({ local: false })).toEqual([]);
        });
    });

    it("releva al siguiente carril ante 429 y devuelve el primero que contesta", async () => {
        const respuestas = [new Response("{}", { status: 429 }), new Response(JSON.stringify({ choices: [{ message: { content: '{"respuesta":"ok"}' } }] }), { status: 200 })];
        vi.stubGlobal("fetch", vi.fn(async () => respuestas.shift()!));
        const carriles = [
            { nombre: "a/x", url: "https://a", cabeceras: {}, cuerpo: {} },
            { nombre: "b/y", url: "https://b", cabeceras: {}, cuerpo: {} },
        ];
        const r = await preguntarCarriles(carriles, [{ role: "user", content: "hola" }]);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.carril).toBe("b/y");
            expect(r.intentos).toEqual([{ carril: "a/x", motivo: "sin cupo ahora (429)" }]);
        }
    });

    it("si ninguno contesta, lo dice carril por carril", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })));
        const r = await preguntarCarriles([{ nombre: "a/x", url: "https://a", cabeceras: {}, cuerpo: {} }], [{ role: "user", content: "hola" }]);
        expect(r).toEqual({ ok: false, intentos: [{ carril: "a/x", motivo: "respuesta vacía" }] });
    });
});
