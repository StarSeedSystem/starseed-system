import { describe, it, expect } from "vitest";
import {
    sanearIdAgente,
    parsearLineasMensajes,
    crearMensajeObjeto,
    formatearEstadoMensaje,
} from "../mensajes-agente";

describe("mensajes-agente", () => {
    it("sanea correctamente el id del agente", () => {
        expect(sanearIdAgente("AG-2/349")).toBe("AG-2_349");
        expect(sanearIdAgente("!!!")).toBe("sin-id");
        expect(sanearIdAgente("tarea_123")).toBe("tarea_123");
    });

    it("parsea líneas jsonl de mensajes ignorando las rotas", () => {
        const jsonl = `{"t":"2026-09-20T23:00:00","de":"alex","texto":"Hola agente"}
linea invalida
{"de":"alex","texto":"   segundo mensaje   ","entregado":"2026-09-20T23:01:00"}`;
        const res = parsearLineasMensajes(jsonl);
        expect(res).toHaveLength(2);
        expect(res[0].texto).toBe("Hola agente");
        expect(res[1].texto).toBe("segundo mensaje");
        expect(res[1].entregado).toBe("2026-09-20T23:01:00");
    });

    it("crea un objeto mensaje seguro recortando texto a 2000 caracteres", () => {
        const largo = "a".repeat(3000);
        const obj = crearMensajeObjeto(largo, "alex", "2026-09-20T23:00:00Z");
        expect(obj.t).toBe("2026-09-20T23:00:00Z");
        expect(obj.de).toBe("alex");
        expect(obj.texto).toHaveLength(2000);
    });

    it("formatea el estado del mensaje según leido y entregado", () => {
        expect(formatearEstadoMensaje({ t: "1", de: "alex", texto: "h" })).toBe("enviado");
        expect(formatearEstadoMensaje({ t: "1", de: "alex", texto: "h", entregado: "2026-09-20T23:15:00" })).toBe("entregado al worktree 23:15");
        expect(formatearEstadoMensaje({ t: "1", de: "alex", texto: "h", entregado: "2026-09-20T23:15:00", leido: "2026-09-20T23:20:00" })).toBe("leído por el agente 23:20");
    });
});
