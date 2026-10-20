/**
 * Una petición que llega por el túnel de MetaGenesis NUNCA pasa como «de esta máquina»
 * (2026-10-10). cloudflared conecta con Next desde 127.0.0.1, pero manda el Host del túnel y
 * sus cabeceras (`cf-connecting-ip`, `cf-ray`, `x-forwarded-for` con la IP de quien llama), y
 * la puerta de la Mac (`tunel_metagenesis.py`) las reenvía tal cual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { esPeticionDeEstaMaquina, estaPublicado } from "../misma-maquina";

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

/**
 * (2026-10-20 · COL1012Md) Genesis en el A1 va tras Caddy: el proceso de Next solo ve conexiones desde el
 * bucle local, así que «viene de localhost» no prueba nada. El servicio declara `STARSEED_PUBLICO=1` y
 * entonces NADA es de esta máquina.
 */
describe("servidor publicado tras un proxy (STARSEED_PUBLICO=1)", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("sin la variable, la Mac sigue igual: localhost es local y estaPublicado es falso", () => {
        expect(estaPublicado()).toBe(false);
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002" }))).toBe(true);
    });

    it("con la variable, una petición de bucle local puro ya no es de esta máquina", () => {
        vi.stubEnv("STARSEED_PUBLICO", "1");
        expect(estaPublicado()).toBe(true);
        expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002" }))).toBe(false);
        expect(esPeticionDeEstaMaquina(peticion({ host: "127.0.0.1:9002", "x-forwarded-for": "127.0.0.1" }))).toBe(false);
    });

    it("lo que entrega Caddy (Host público, X-Real-IP, X-Forwarded-*) tampoco, como antes", () => {
        vi.stubEnv("STARSEED_PUBLICO", "1");
        expect(
            esPeticionDeEstaMaquina(
                peticion({
                    host: "genesis.nodo.example",
                    "x-real-ip": "203.0.113.9",
                    "x-forwarded-for": "203.0.113.9",
                    "x-forwarded-host": "genesis.nodo.example",
                    "x-forwarded-proto": "https",
                }),
            ),
        ).toBe(false);
    });

    it("solo el valor «1» publica: «0», vacío o «true» no cambian nada", () => {
        for (const valor of ["0", "", "true", "si"]) {
            vi.stubEnv("STARSEED_PUBLICO", valor);
            expect(estaPublicado()).toBe(false);
            expect(esPeticionDeEstaMaquina(peticion({ host: "localhost:9002" }))).toBe(true);
        }
    });
});
