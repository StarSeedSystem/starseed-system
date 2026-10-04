/**
 * Pruebas del módulo puro `chat-director-respuesta` (Ola 1004):
 * historial de turnos para el modelo y validación del POST del chat.
 */

import { describe, expect, it } from "vitest";

import {
    historialParaModelo,
    pedidoDeAccion,
} from "../chat-director-respuesta";
import { MODELO_DIRECTOR_DEFECTO, type MensajeDirector } from "../chat-director-tipos";

function mensaje(parcial: Partial<MensajeDirector>): MensajeDirector {
    return {
        id: "md-1-0000",
        t: "2026-10-04T08:00:00.000Z",
        de: "alex",
        rol: "alex",
        tipo: "mensaje",
        texto: "hola",
        canal: "mando",
        ...parcial,
    };
}

describe("historialParaModelo", () => {
    it("queda vacío sin mensajes o sin ids md- válidos", () => {
        expect(historialParaModelo([])).toEqual([]);
        expect(historialParaModelo([mensaje({ id: "cn-1-x" })])).toEqual([]);
    });

    it("mapea alex a user y director a assistant, respetando el tope", () => {
        const lista: MensajeDirector[] = [
            mensaje({ id: "md-1-aaaa", texto: "uno" }),
            mensaje({ id: "md-2-bbbb", rol: "director", de: "claude-cowork", tipo: "respuesta", texto: "dos" }),
            mensaje({ id: "md-3-cccc", rol: "agente", texto: "tres" }),
            mensaje({ id: "md-4-dddd", texto: "cuatro" }),
        ];
        expect(historialParaModelo(lista, 2)).toEqual([
            { rol: "assistant", texto: "dos" },
            { rol: "user", texto: "cuatro" },
        ]);
        expect(historialParaModelo(lista)).toEqual([
            { rol: "user", texto: "uno" },
            { rol: "assistant", texto: "dos" },
            { rol: "user", texto: "cuatro" },
        ]);
    });

    it("ignora mensajes con texto vacío y tope no positivo usa el defecto", () => {
        const lista = [mensaje({ id: "md-1-aaaa", texto: "   " })];
        expect(historialParaModelo(lista)).toEqual([]);
        expect(historialParaModelo([mensaje({ id: "md-2-aaaa" })], 0)).toHaveLength(1);
    });
});

describe("pedidoDeAccion", () => {
    it("rechaza cuerpos que no son objeto o acciones desconocidas", () => {
        expect(pedidoDeAccion(null)).toEqual({ error: "Cuerpo JSON inválido." });
        expect(pedidoDeAccion("decir")).toEqual({ error: "Cuerpo JSON inválido." });
        const r = pedidoDeAccion({ accion: "borrar" });
        expect("error" in r && r.error).toContain("Acción desconocida");
    });

    it("«decir»: valida texto, modelo por defecto y canales", () => {
        expect(pedidoDeAccion({ accion: "decir", texto: "  " })).toEqual({
            error: "Falta el texto o pasa de 20000 caracteres.",
        });
        expect(pedidoDeAccion({ accion: "decir", texto: "x".repeat(20001) })).toEqual({
            error: "Falta el texto o pasa de 20000 caracteres.",
        });
        const largo = pedidoDeAccion({ accion: "decir", texto: "x".repeat(20000) });
        expect("accion" in largo && largo.accion).toBe("decir");
        const sinCanal = pedidoDeAccion({ accion: "decir", texto: "hola", canales: ["ovni"] });
        expect(sinCanal).toEqual({ error: "Alguno de los canales pedidos no existe." });
        const ok = pedidoDeAccion({ accion: "decir", texto: "hola", canales: ["hermes", "hermes"] });
        expect(ok).toEqual({
            accion: "decir", texto: "hola", modelo: MODELO_DIRECTOR_DEFECTO, canales: ["hermes"],
        });
        const conModelo = pedidoDeAccion({ accion: "decir", texto: "hola", modelo: "nim/llama" });
        expect("modelo" in conModelo && conModelo.modelo).toBe("nim/llama");
    });

    it("«responder» y «reenviar»: validan ids y canales", () => {
        expect(pedidoDeAccion({ accion: "responder" })).toEqual({ error: "Falta el mensaje al que responder." });
        const resp = pedidoDeAccion({ accion: "responder", respondeA: "md-1-aaaa" });
        expect(resp).toEqual({ accion: "responder", respondeA: "md-1-aaaa", modelo: MODELO_DIRECTOR_DEFECTO });
        expect(pedidoDeAccion({ accion: "reenviar", reenviar: "md-1-aaaa" })).toEqual({
            error: "Indica al menos un canal válido.",
        });
        const re = pedidoDeAccion({ accion: "reenviar", reenviar: "md-1-aaaa", canales: ["telegram", "ide"] });
        expect(re).toEqual({ accion: "reenviar", reenviar: "md-1-aaaa", canales: ["telegram", "ide"] });
    });
});
