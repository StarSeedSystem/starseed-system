/**
 * /api/mando/director-chat — POST «decir» con entrega pendiente sin duplicar.
 * Mockea `@/lib/mando/chat-director` y `guardianMando`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/mando/chat-director", () => ({
    publicarMensaje: vi.fn(async (m: unknown) => ({ ...(typeof m === "object" && m ? m : {}), id: "md-test", t: new Date().toISOString() } as unknown)),
    publicarEntrega: vi.fn(async () => {}),
    leerFeedDirector: vi.fn(async () => ({ mensajes: [], entregas: {}, ultimoModelo: "claude-cowork/claude-opus-5-5" })),
    rutaChatDirector: vi.fn(() => "/tmp/director/chat.jsonl"),
}));

vi.mock("@/lib/mando/guardian", () => ({
    guardianMando: vi.fn(async () => null),
}));

import { POST } from "../route";
import { publicarEntrega, publicarMensaje, leerFeedDirector, rutaChatDirector } from "@/lib/mando/chat-director";

const URL_RUTA = "http://localhost:9002/api/mando/director-chat";

function post(cuerpo: unknown) {
    return POST(new Request(URL_RUTA, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("POST director-chat", () => {
    it("con modelo hermes/predeterminado y canales [] publica entrega pendiente una vez para hermes", async () => {
        const r = await post({ accion: "decir", texto: "Hola director", canales: [], modelo: "hermes/predeterminado" });
        expect(r.status).toBe(200);
        const d = await r.json();
        expect(d.pendiente).toBe(true);
        expect(publicarEntrega).toHaveBeenCalledTimes(1);
        expect(publicarEntrega).toHaveBeenCalledWith("md-test", "hermes", "pendiente");
    });

    it("con modelo por API (openrouter/x) no deja ninguna entrega pendiente", async () => {
        const r = await post({ accion: "decir", texto: "Pregunta técnica", canales: ["mando"], modelo: "openrouter/x" });
        // La ruta puede devolver 502 (modelo no disponible en el entorno de prueba),
        // lo importante es que no deje ninguna entrega pendiente.
        expect(publicarEntrega).toHaveBeenCalledTimes(0);
        const d = await r.json().catch(() => ({}));
        // No hay entrega pendiente ni para un motor ni para la API.
        expect((d as Record<string, unknown>).pendiente).toBeUndefined();
    });
});
