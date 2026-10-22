/**
 * Errores de neurona (Ola 1020S · RLB1020J): formato Sentry, limpieza de datos
 * personales, huella estable por tipo + marco + ámbito y agrupación para la autocuración.
 */
import { describe, expect, it } from "vitest";
import {
    agrupar,
    huella,
    limpiarDatosPersonales,
    limpiarTexto,
    normalizarError,
    type AmbitoError,
    type EventoSentry,
} from "../errores-neurona";

const PILA = [
    "Error: fallo",
    "    at procesar (src/lib/mando/neurona.ts:10:5)",
    "    at node:internal/process/task_queues:95:5",
].join("\n");

function evento(mensaje: string, ambito: AmbitoError = "neurona", ahora = 1_000_000): EventoSentry {
    const error = new Error(mensaje);
    error.stack = PILA;
    return normalizarError(error, { ambito, neurona: "n1", proceso: "chat", ahora });
}

describe("errores de neurona", () => {
    it("produce el formato de evento del SDK de Sentry", () => {
        const e = evento("boom");
        expect(e.event_id).toMatch(/^[0-9a-f]{32}$/);
        expect(e.timestamp).toBe(1000);
        expect(e.level).toBe("error");
        expect(e.platform).toBe("javascript");
        expect(e.tags).toEqual({ ambito: "neurona", neurona: "n1", proceso: "chat" });
        expect(e.exception.values[0].type).toBe("Error");
        expect(e.exception.values[0].stacktrace.frames[0]).toMatchObject({ in_app: true, function: "procesar" });
    });

    it("limpia cada tipo de dato personal de un texto", () => {
        const sucio = [
            "correo ana@ejemplo.com",
            "tel +34 612 345 678",
            "ip 192.168.1.20",
            "token sk-abc123456789",
            "gsk_abc123456789",
            "Bearer abc.def.ghi",
            "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma",
            "ruta /Users/ana/Documentos/nota.txt",
        ].join(", ");
        const limpio = limpiarTexto(sucio);
        expect(limpio).toContain("[correo]");
        expect(limpio).toContain("[telefono]");
        expect(limpio).toContain("[ip]");
        expect(limpio).toContain("/[usuario]");
        expect(limpio).toContain("[token]");
        expect(limpio).not.toContain("ana@ejemplo.com");
        expect(limpio).not.toContain("612 345 678");
        expect(limpio).not.toContain("192.168.1.20");
        expect(limpio).not.toContain("sk-abc");
        expect(limpio).not.toContain("gsk_");
        expect(limpio).not.toContain("Bearer abc");
        expect(limpio).not.toContain("eyJhbGci");
        expect(limpio).not.toContain("/Users/ana");
    });

    it("limpia el evento completo sin mutar el original", () => {
        const error = new Error("escribe a ana@ejemplo.com");
        error.stack = "Error: x\n    at guardar (/Users/ana/app/neurona.ts:4:9)";
        const original = normalizarError(error, { ambito: "contenido", ahora: 0 });
        const limpio = limpiarDatosPersonales(original);

        expect(limpio.exception.values[0].value).toBe("escribe a [correo]");
        expect(limpio.exception.values[0].stacktrace.frames[0].filename).toBe("/[usuario]/app/neurona.ts");
        expect(original.exception.values[0].value).toContain("ana@ejemplo.com");
        expect(original.exception.values[0].stacktrace.frames[0].filename).toContain("/Users/ana");
    });

    it("dos errores iguales con mensajes de distinto id comparten huella", () => {
        const a = evento("fallo al guardar id 123");
        const b = evento("fallo al guardar id 987");
        expect(a.fingerprint).toEqual(b.fingerprint);
        expect(huella(a)).toEqual(huella(b));
    });

    it("el mismo error en otro ámbito no comparte huella", () => {
        const neurona = evento("fallo");
        const cerebro = evento("fallo", "cerebro");
        expect(huella(neurona)).not.toEqual(huella(cerebro));
    });

    it("agrupa por huella y resume veces, primero, último y ejemplo", () => {
        const a = evento("id 1", "neurona", 1_000_000);
        const b = evento("id 2", "neurona", 3_000_000);
        const c = evento("id 3", "cerebro", 2_000_000);
        const grupos = agrupar([a, b, c]);

        expect(grupos).toHaveLength(2);
        expect(grupos[0].huella).toEqual(huella(a));
        expect(grupos[0].veces).toBe(2);
        expect(grupos[0].primero).toBe(1000);
        expect(grupos[0].ultimo).toBe(3000);
        expect(grupos[0].ejemplo).toBe(a);
    });
});
