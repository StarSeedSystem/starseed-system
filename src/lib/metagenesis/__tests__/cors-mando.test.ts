/**
 * CORS de /api/mando/* (2026-10-10): solo los orígenes del OS, Authorization permitido en la
 * pregunta previa, nunca credenciales entre orígenes, y nada cambia para la propia Mac.
 */
import { describe, expect, it } from "vitest";
import { aplicarCorsMando, origenesPermitidos, preflightCorsMando } from "../cors-mando";

const MOTOR = "https://ala-bosque-rio.trycloudflare.com";
const OS = "https://starseed-os.vercel.app";

function pregunta(origen: string, ruta = "/api/mando/estado") {
    return new Request(`${MOTOR}${ruta}`, {
        method: "OPTIONS",
        headers: { Origin: origen, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
}

describe("pregunta previa (OPTIONS)", () => {
    it("origen del OS → 204 con Authorization permitido y sin credenciales", () => {
        const r = preflightCorsMando(pregunta(OS))!;
        expect(r.status).toBe(204);
        expect(r.headers.get("access-control-allow-origin")).toBe(OS);
        expect(r.headers.get("access-control-allow-headers")).toMatch(/Authorization/);
        expect(r.headers.get("access-control-allow-methods")).toMatch(/POST/);
        expect(r.headers.get("access-control-allow-credentials")).toBeNull();
        expect(r.headers.get("vary")).toMatch(/Origin/);
    });

    it("localhost:9002 también es del OS", () => {
        expect(preflightCorsMando(pregunta("http://localhost:9002"))!.status).toBe(204);
    });

    it("cualquier otro origen → 403 sin cabeceras CORS", () => {
        const r = preflightCorsMando(pregunta("https://evil.example.com"))!;
        expect(r.status).toBe(403);
        expect(r.headers.get("access-control-allow-origin")).toBeNull();
        expect(preflightCorsMando(pregunta("http://localhost:3000"))!.status).toBe(403);
    });

    it("fuera de /api/mando o sin ser pregunta previa → sigue el camino normal", () => {
        expect(preflightCorsMando(pregunta(OS, "/api/ai/openrouter"))).toBeNull();
        expect(preflightCorsMando(new Request(`${MOTOR}/api/mando/estado`, { method: "OPTIONS" }))).toBeNull();
        expect(preflightCorsMando(new Request(`${MOTOR}/api/mando/estado`, { headers: { Origin: OS } }))).toBeNull();
    });
});

describe("respuestas normales", () => {
    it("añade el origen admitido a la respuesta del mando, sin credenciales", () => {
        const req = new Request(`${MOTOR}/api/mando/estado`, { headers: { Origin: OS, Authorization: "Bearer x" } });
        const res = aplicarCorsMando(req, new Response("{}"));
        expect(res.headers.get("access-control-allow-origin")).toBe(OS);
        expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    });

    it("origen no admitido u otra ruta → la respuesta queda igual", () => {
        const malo = aplicarCorsMando(new Request(`${MOTOR}/api/mando/estado`, { headers: { Origin: "https://evil.example.com" } }), new Response("{}"));
        expect(malo.headers.get("access-control-allow-origin")).toBeNull();
        const otra = aplicarCorsMando(new Request(`${MOTOR}/api/ai/openrouter`, { headers: { Origin: OS } }), new Response("{}"));
        expect(otra.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("la propia Mac (mismo origen) no cambia nada", () => {
        const req = new Request("http://localhost:9002/api/mando/estado", { method: "POST", headers: { Origin: "http://localhost:9002" } });
        const res = aplicarCorsMando(req, new Response("{}"));
        expect([...res.headers.keys()].filter((k) => k.startsWith("access-control") || k === "vary")).toEqual([]);
    });
});

describe("orígenes extra", () => {
    it("solo https o localhost con puerto; nunca comodines", () => {
        expect(origenesPermitidos("https://os.starseed.example, *, http://otra.web, http://localhost:3000")).toEqual([
            "https://starseed-os.vercel.app",
            "http://localhost:9002",
            "https://os.starseed.example",
            "http://localhost:3000",
        ]);
        expect(origenesPermitidos("")).toEqual(["https://starseed-os.vercel.app", "http://localhost:9002"]);
    });
});
