import { describe, expect, it } from "vitest";

import {
    claveExportable,
    construirExportacion,
    entradasDeStorage,
    esClaveSensible,
    nombreArchivoExportacion,
    podarSecretos,
} from "../exportar";

describe("esClaveSensible", () => {
    it.each([
        "starseed.ai.key.openai",
        "starseed.auth.token",
        "starseed.session.v1",
        "starseed.hermes.SECRET",
        "starseed.user.password",
        "starseed.connectors.creds.v1",
        "starseed.ai.salt",
        "sb-abc-auth-token",
    ])("«%s» es sensible", (k) => {
        expect(esClaveSensible(k)).toBe(true);
    });

    it.each(["starseed.dock.items.v2", "starseed.mi-mando.ajustes.v1", "starseed.privacy.ghost", "starseed.neuron.device-id"])(
        "«%s» no es sensible",
        (k) => {
            expect(esClaveSensible(k)).toBe(false);
        },
    );
});

describe("claveExportable", () => {
    it("solo claves starseed.* no sensibles y no marcadas por el sistema", () => {
        expect(claveExportable("otra.cosa")).toBe(false);
        expect(claveExportable("starseed.dock.items.v2")).toBe(true);
        expect(claveExportable("starseed.ai.providers", (k) => k === "starseed.ai.providers")).toBe(false);
    });

    it("si el predicado del sistema falla, la clave se trata como secreta", () => {
        expect(
            claveExportable("starseed.dock.items.v2", () => {
                throw new Error("roto");
            }),
        ).toBe(false);
    });
});

describe("podarSecretos", () => {
    it("quita campos con nombre de secreto a cualquier profundidad sin tocar el original", () => {
        const original = { nombre: "chat", apiKey: "sk-123", ajustes: { modo: "custom", token: "x", lista: [{ password: "p", ok: 1 }] } };
        const podado = podarSecretos(original);
        expect(podado).toEqual({ nombre: "chat", ajustes: { modo: "custom", lista: [{ ok: 1 }] } });
        expect(original.apiKey).toBe("sk-123");
    });
});

describe("construirExportacion", () => {
    const entradas: Array<[string, string]> = [
        ["starseed.dock.items.v2", JSON.stringify([{ id: "mando" }])],
        ["starseed.aurora.chats.v1", JSON.stringify([{ titulo: "hola", apiKey: "sk-secreta" }])],
        ["starseed.ai.key.openai", "sk-no-debe-salir"],
        ["starseed.ai.providers", "{\"x\":1}"],
        ["starseed.privacy.ghost", "1"],
        ["sb-proyecto-auth-token", "jwt"],
        ["otra-app.ajuste", "1"],
    ];

    it("incluye solo lo seguro, poda los valores y cuenta lo omitido (sin nombrarlo)", () => {
        const r = construirExportacion(entradas, {
            esSecretaDelSistema: (k) => k === "starseed.ai.providers",
            ahora: new Date("2026-09-25T10:00:00Z"),
        });
        expect(Object.keys(r.ajustes)).toEqual(["starseed.aurora.chats.v1", "starseed.dock.items.v2", "starseed.privacy.ghost"]);
        expect(r.ajustes["starseed.aurora.chats.v1"]).toEqual([{ titulo: "hola" }]);
        expect(r.ajustes["starseed.privacy.ghost"]).toBe("1");
        expect(r.omitidas).toBe(2);
        expect(r.exportado).toBe("2026-09-25T10:00:00.000Z");
        const texto = JSON.stringify(r);
        expect(texto).not.toContain("sk-");
        expect(texto).not.toContain("jwt");
        expect(texto).not.toContain("starseed.ai.key");
    });

    it("un valor que parece JSON pero no lo es se exporta como texto", () => {
        const r = construirExportacion([["starseed.nota", "{roto"]]);
        expect(r.ajustes["starseed.nota"]).toBe("{roto");
    });
});

describe("entradasDeStorage", () => {
    it("lee todos los pares de un Storage", () => {
        const datos = new Map([
            ["a", "1"],
            ["b", "2"],
        ]);
        const falso = {
            get length() {
                return datos.size;
            },
            key: (i: number) => [...datos.keys()][i] ?? null,
            getItem: (k: string) => datos.get(k) ?? null,
        };
        expect(entradasDeStorage(falso)).toEqual([
            ["a", "1"],
            ["b", "2"],
        ]);
    });

    it("no lanza si el Storage está bloqueado", () => {
        const bloqueado = {
            get length(): number {
                throw new Error("SecurityError");
            },
            key: () => null,
            getItem: () => null,
        };
        expect(entradasDeStorage(bloqueado)).toEqual([]);
    });
});

describe("nombreArchivoExportacion", () => {
    it("lleva la fecha", () => {
        expect(nombreArchivoExportacion(new Date("2026-09-25T23:00:00Z"))).toBe("starseed-ajustes-2026-09-25.json");
    });
});
