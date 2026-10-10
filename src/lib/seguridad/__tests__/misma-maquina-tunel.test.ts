/**
 * Una petición que llega por el túnel de MetaGenesis NUNCA pasa como «de esta máquina»
 * (2026-10-10). cloudflared conecta con Next desde 127.0.0.1, pero manda el Host del túnel y
 * sus cabeceras (`cf-connecting-ip`, `cf-ray`, `x-forwarded-for` con la IP de quien llama), y
 * la puerta de la Mac (`tunel_metagenesis.py`) las reenvía tal cual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { esPeticionDeEstaMaquina } from "../misma-maquina";

const TUNEL = "ala-bosque-rio.trycloudflare.com";

function peticion(cabeceras: Record<string, string>) {
    return new Request("http://127.0.0.1:9012/api/mando/estado", { headers: cabeceras });
}

describe("petición por el túnel de MetaGenesis", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("tal como la entrega cloudflared: no es local", () => {
        expect(
            esPeticionDeEstaMaquina(
                peticion({
                    host: TUNEL,
                    "cf-connecting-ip": "203.0.113.7",
                    "cf-ray": "8c1f-MAD",
                    "x-forwarded-for": "203.0.113.7",
                    "x-forwarded-proto": "https",
                    "cdn-loop": "cloudflare",
                }),
            ),
        ).toBe(false);
    });

    it("aunque alguien hiciera que el Host dijera localhost, las cabeceras de Cloudflare lo delatan", () => {
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002", "cf-connecting-ip": "203.0.113.7" }))).toBe(false);
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002", "cf-ray": "8c1f-MAD" }))).toBe(false);
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002", "x-forwarded-for": "203.0.113.7" }))).toBe(false);
    });

    it("las cabeceras que añade la puerta de la Mac (X-Real-IP, Forwarded) bastan por sí solas", () => {
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002", "x-real-ip": "tunel" }))).toBe(false);
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002", forwarded: 'for="_metagenesis-tunel"' }))).toBe(false);
    });

    it("con STARSEED_LOCAL=1 (como en la Mac) tampoco: esa variable no abre esta puerta", () => {
        vi.stubEnv("STARSEED_LOCAL", "1");
        expect(esPeticionDeEstaMaquina(peticion({ host: TUNEL, "cf-connecting-ip": "203.0.113.7" }))).toBe(false);
    });

    it("la propia Mac sí es local", () => {
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002" }))).toBe(true);
        expect(esPeticionDeEstaMaquina(peticion({ host: "127.0.0.1:9002", "x-forwarded-for": "127.0.0.1" }))).toBe(true);
    });
});
