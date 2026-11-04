import { afterEach, describe, expect, it, vi } from "vitest";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";

const TUNEL = "ala-bosque-rio.trycloudflare.com";

function crearPeticion(cabeceras: Record<string, string>): Request {
    return new Request(`http://127.0.0.1:9012/api/mando/accesos`, { headers: cabeceras });
}

describe("esPeticionDeEstaMaquina en /api/mando/accesos", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("petición por el túnel con cabeceras de Cloudflare NO es local", () => {
        expect(
            esPeticionDeEstaMaquina(
                crearPeticion({
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

    it("petición desde localhost sí es local", () => {
        expect(esPeticionDeEstaMaquina(crearPeticion({ host: "localhost:9012" }))).toBe(true);
        expect(esPeticionDeEstaMaquina(crearPeticion({ host: "127.0.0.1:9012", "x-forwarded-for": "127.0.0.1" }))).toBe(true);
    });

    it("petición con STARSEED_LOCAL=1 pero origen externo sigue siendo no local", () => {
        vi.stubEnv("STARSEED_LOCAL", "1");
        expect(
            esPeticionDeEstaMaquina(
                crearPeticion({
                    host: TUNEL,
                    "cf-connecting-ip": "203.0.113.7",
                }),
            ),
        ).toBe(false);
    });
});