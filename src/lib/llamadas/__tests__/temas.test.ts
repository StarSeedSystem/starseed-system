/**
 * Nombres de los canales privados (llamadas y apps en vivo) y clasificación de los errores de
 * suscripción. Puro.
 */
import { describe, expect, it } from "vitest";
import {
    analizarTema,
    clasificarErrorCanal,
    esTokenPublico,
    MENSAJE_CANAL_PRIVADO,
    temaEsDeSesion,
    temaLlamada,
    temaSesion,
    temaVivo,
} from "@/lib/llamadas/temas";

const ID = "3F1C2A9E-7B1D-4C3E-9F00-1234567890AB";
const id = ID.toLowerCase();
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

describe("temas de los canales privados", () => {
    it("miembros: `llamada:<id>` / `vivo:<id>` (id en minúsculas)", () => {
        expect(temaLlamada(ID)).toBe(`llamada:${id}`);
        expect(temaVivo(ID)).toBe(`vivo:${id}`);
        expect(temaSesion("llamada", ID, null)).toBe(`llamada:${id}`);
    });

    it("enlace público: `<prefijo>:<id>:<token>` solo con un token con forma de token", () => {
        expect(temaLlamada(ID, TOKEN)).toBe(`llamada:${id}:${TOKEN}`);
        expect(temaVivo(ID, TOKEN)).toBe(`vivo:${id}:${TOKEN}`);
        // Token corto, con «:» o con caracteres raros → tema de miembros (el servidor decidirá).
        expect(temaLlamada(ID, "corto")).toBe(`llamada:${id}`);
        expect(temaLlamada(ID, `${TOKEN}:extra`)).toBe(`llamada:${id}`);
        expect(temaLlamada(ID, "a b c d e f g h i j k l")).toBe(`llamada:${id}`);
        expect(esTokenPublico(TOKEN)).toBe(true);
        expect(esTokenPublico("x".repeat(129))).toBe(false);
    });

    it("un id que no es uuid no produce tema (nada de inyectar «:» en el nombre)", () => {
        expect(temaLlamada("s1")).toBeNull();
        expect(temaLlamada(`${ID}:otro`)).toBeNull();
        expect(temaLlamada(null)).toBeNull();
        expect(temaVivo(undefined, TOKEN)).toBeNull();
    });

    it("analiza temas (con o sin el prefijo `realtime:`) y comprueba de qué sesión son", () => {
        expect(analizarTema(`llamada:${id}`)).toEqual({ prefijo: "llamada", sesionId: id, token: null });
        expect(analizarTema(`realtime:vivo:${ID}:${TOKEN}`)).toEqual({ prefijo: "vivo", sesionId: id, token: TOKEN });
        expect(analizarTema(`otra:${id}`)).toBeNull();
        expect(analizarTema(`llamada:${id}:corto`)).toBeNull();
        expect(analizarTema(`llamada:${id}:${TOKEN}:mas`)).toBeNull();
        expect(analizarTema(42 as unknown as string)).toBeNull();
        expect(temaEsDeSesion(`llamada:${id}:${TOKEN}`, "llamada", ID)).toBe(true);
        expect(temaEsDeSesion(`vivo:${id}`, "llamada", ID)).toBe(false);
        expect(temaEsDeSesion(`llamada:${id}`, "llamada", "00000000-0000-4000-8000-000000000000")).toBe(false);
    });
});

describe("errores de suscripción", () => {
    it("«Unauthorized» y compañía son denegaciones (no se reintenta)", () => {
        expect(clasificarErrorCanal(new Error('"Unauthorized: You do not have permissions to read from this Channel topic: llamada:x"'))).toBe("denegado");
        expect(clasificarErrorCanal(new Error("permission denied for table messages"))).toBe("denegado");
        expect(clasificarErrorCanal("Forbidden")).toBe("denegado");
        expect(clasificarErrorCanal(new Error("new row violates row-level security policy"))).toBe("denegado");
    });

    it("fallos del socket son de red (realtime-js reconecta solo)", () => {
        expect(clasificarErrorCanal(undefined)).toBe("red");
        expect(clasificarErrorCanal({ type: "error" })).toBe("red");
        expect(clasificarErrorCanal(new Error("WebSocket connection closed"))).toBe("red");
        expect(clasificarErrorCanal(new Error(""))).toBe("red");
    });

    it("otros rechazos del servidor quedan como «rechazado»", () => {
        expect(clasificarErrorCanal(new Error("TooManyChannels"))).toBe("rechazado");
    });

    it("el mensaje para la persona explica las dos causas y que no se baja a un canal público", () => {
        expect(MENSAJE_CANAL_PRIVADO).toMatch(/canal privado/);
        expect(MENSAJE_CANAL_PRIVADO).toMatch(/actualización de llamadas/);
        expect(MENSAJE_CANAL_PRIVADO).toMatch(/enlace se revocó/);
        expect(MENSAJE_CANAL_PRIVADO).toMatch(/no se usa un canal público/);
    });
});
