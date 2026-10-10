/**
 * Test de `esDespliegueLocal` (Ola 253, 2026-09-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * La puerta de sesión de las rutas de voz solo debe abrirse sin sesión cuando
 * el OS corre en la propia neurona (modo ligero local); en Vercel jamás, aun
 * con cabeceras que simulen localhost.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { esDespliegueLocal } from "../puerta-local";

/** Crea una Request mínima con la cabecera `host` indicada. */
function peticionConHost(host: string): Request {
    return new Request("http://localhost/api/voz/salud", {
        headers: { host },
    });
}

afterEach(() => {
    // Cada prueba controla su propio entorno; al salir se restaura el real.
    vi.unstubAllEnvs();
});

describe("esDespliegueLocal", () => {
    it("host localhost con puerto → true", () => {
        expect(esDespliegueLocal(peticionConHost("localhost:9002"))).toBe(true);
    });

    it("host 127.0.0.1 con puerto → true", () => {
        expect(esDespliegueLocal(peticionConHost("127.0.0.1:9002"))).toBe(true);
    });

    it("host [::1] con puerto → true", () => {
        expect(esDespliegueLocal(peticionConHost("[::1]:9002"))).toBe(true);
    });

    it("host *.local → true", () => {
        expect(esDespliegueLocal(peticionConHost("macbook.local:9002"))).toBe(true);
    });

    it("dominio público (Vercel) → false", () => {
        expect(esDespliegueLocal(peticionConHost("starseed-os.vercel.app"))).toBe(false);
    });

    it("x-forwarded-host manda sobre host", () => {
        const req = new Request("http://localhost/api/voz/salud", {
            headers: { host: "starseed-os.vercel.app", "x-forwarded-host": "localhost:9002" },
        });
        expect(esDespliegueLocal(req)).toBe(true);
    });

    it("VERCEL=1 fuerza false aunque el host sea localhost", () => {
        vi.stubEnv("VERCEL", "1");
        expect(esDespliegueLocal(peticionConHost("localhost:9002"))).toBe(false);
    });

    it("STARSEED_LOCAL=1 fuerza true con dominio público", () => {
        vi.stubEnv("STARSEED_LOCAL", "1");
        expect(esDespliegueLocal(peticionConHost("starseed-os.vercel.app"))).toBe(true);
    });

    it("sin cabecera host → false", () => {
        const req = new Request("http://localhost/api/voz/salud");
        req.headers.delete("host");
        expect(esDespliegueLocal(req)).toBe(false);
    });
});

describe("esDespliegueLocal · túneles (2026-10-10)", () => {
    it("lo que llega por un túnel de Cloudflare nunca es local, ni con STARSEED_LOCAL=1", () => {
        const antes = process.env.STARSEED_LOCAL;
        process.env.STARSEED_LOCAL = "1";
        try {
            const r = new Request("http://localhost:9002/api/voz/salud", { headers: { host: "localhost:9002", "cf-connecting-ip": "1.2.3.4" } });
            expect(esDespliegueLocal(r)).toBe(false);
            const r2 = new Request("http://localhost:9002/api/voz/salud", { headers: { host: "localhost:9002", "x-forwarded-host": "algo.trycloudflare.com" } });
            expect(esDespliegueLocal(r2)).toBe(false);
            const r3 = new Request("http://localhost:9002/api/voz/salud", { headers: { host: "localhost:9002" } });
            expect(esDespliegueLocal(r3)).toBe(true);
        } finally {
            if (antes === undefined) delete process.env.STARSEED_LOCAL;
            else process.env.STARSEED_LOCAL = antes;
        }
    });
});
