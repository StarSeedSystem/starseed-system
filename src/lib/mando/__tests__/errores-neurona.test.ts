import { describe, expect, it } from "vitest";
import {
    agrupar,
    limpiarDatosPersonales,
    limpiarTexto,
    normalizarError,
    huella,
    type EventoError,
} from "../errores-neurona";

function errorConPila(mensaje: string): Error {
    const error = new Error(mensaje);
    error.stack = `Error: ${mensaje}\n    at revisar (src/lib/mando/errores-neurona.ts:41:5)\n    at Object.<anonymous> (node_modules/vitest/dist/cjs:102:1)`;
    return error;
}

describe("normalizarError produce un evento estilo Sentry", () => {
    it("cumple la forma del evento: id, instante, nivel, plataforma y tipo + valor + pila", () => {
        const evento = normalizarError(errorConPila("algo se torció"), { ambito: "neurona", neurona: "a1", proceso: "autocuracion" });
        expect(evento.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(evento.timestamp).toBe(Math.floor(evento.timestamp));
        expect(evento.level).toBe("error");
        expect(evento.platform).toBe("javascript");
        const valor = evento.exception.values[0];
        expect(valor.type).toBe("Error");
        expect(valor.value).toBe("algo se torció");
        expect(valor.stacktrace.frames.map((f) => f.function)).toContain("revisar");
        expect(valor.stacktrace.frames.find((f) => f.filename.includes("node_modules"))?.in_app).toBe(false);
        expect(evento.tags).toEqual({ ambito: "neurona", neurona: "a1", proceso: "autocuracion" });
    });
    it("todos los ámbitos del contrato son válidos", () => {
        const eventos = (["neurona", "cerebro", "perfil", "cuenta", "pagina", "proceso", "contenido"] as const).map(
            (ambito) => huella(normalizarError(new Error("x"), { ambito }))[2],
        );
        expect(eventos).toHaveLength(7);
        expect(eventos[6]).toBe("contenido");
    });

    it("un valor que no es Error se lleva igualmente al formato", () => {
        const evento = normalizarError("fallo plano", { ambito: "pagina" });
        expect(evento.exception.values[0].value).toBe("fallo plano");
        expect(evento.tags.neurona).toBe("local");
    });
});

describe("limpiarDatosPersonales quita cada tipo de dato personal", () => {
    it("enmascara correo, teléfono e IP", () => {
        expect(limpiarTexto("escribió a alexbordo@gmail.com y llamó al +34 612 345 678")).toBe(
            "escribió a [correo] y llamó al [teléfono]",
        );
        expect(limpiarTexto("conexión desde 192.168.12.34 rechazada")).toBe(
            "conexión desde [ip] rechazada",
        );
    });

    it("enmascara tokens sk-, gsk_, Bearer y JWT eyJ…", () => {
        expect(limpiarTexto("clave sk-abc123def456ghij expuesta")).toContain("[token]");
        expect(limpiarTexto("otra gsk_zyx987654321wvuQ")).toContain("[token]");
        expect(limpiarTexto("con Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyMy5nN123.N3lkYk9Q4SsnvenaaCw")).toContain("Bearer [token]");
        expect(limpiarTexto("el eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE.NYzoWQ suelto")).not.toContain("eyJhbGci");
    });

    it("enmascara el nombre en rutas de usuario y deja intacto un número largo sin separadores", () => {
        expect(limpiarTexto("fallo en /Users/alex/Documents/b.ts:12")).toBe(
            "fallo en /Users/<usuario>/Documents/b.ts:12",
        );
        expect(limpiarTexto("id interno 1700000000000")).toBe("id interno 1700000000000");
    });

    it("limpia también el value y los nombres de archivo de la pila", () => {
        const evento = limpiarDatosPersonales(
            normalizarError(errorConPila("desde /Users/alex, escriba a a@b.com, Bearer zzzz2222333344556 en 10.0.0.1"), { ambito: "cuenta" }),
        );
        const valor = evento.exception.values[0];
        expect(valor.value).not.toContain("/Users/alex");
        expect(valor.value).not.toContain("a@b.com");
        expect(valor.value).not.toContain("zzzz2222333344556");
        expect(valor.value).not.toContain("10.0.0.1");
    });
});

describe("huella agrupa por tipo + primer marco propio + ámbito", () => {
    it("dos errores iguales con mensajes de distinto id comparten huella", () => {
        const primero = huella(limpiarDatosPersonales(normalizarError(errorConPila("fallo id 1"), { ambito: "neurona" })));
        const segundo = huella(limpiarDatosPersonales(normalizarError(errorConPila("fallo id 2"), { ambito: "neurona" })));
        expect(primero).toEqual(segundo);
        expect(segundo[0]).toBe("Error");
        expect(segundo[2]).toBe("neurona");
    });
    it("un error de otro ámbito no comparte la huella", () => {
        const deNeurona = huella(normalizarError(errorConPila("fallo id 1"), { ambito: "neurona" }));
        const deCerebro = huella(normalizarError(errorConPila("fallo id 1"), { ambito: "cerebro" }));
        expect(deNeurona[2]).not.toBe(deCerebro[2]);
        expect(deNeurona).not.toEqual(deCerebro);
    });
    it("sin marco propio usa el primero que haya", () => {
        const error = new Error("sin propios");
        error.stack = "    at externo (node_modules/lib/x.js:9:1)";
        const piezas = huella(normalizarError(error, { ambito: "proceso" }));
        expect(piezas[1]).toBe("node_modules/lib/x.js:9");
    });
});

describe("agrupar cuenta y ordena por huella", () => {
    function eventoCon(huella: string[], timestamp: number): EventoError {
        return { event_id: "id-" + timestamp, timestamp, level: "error", platform: "javascript", exception: { values: [] }, tags: { ambito: "neurona", neurona: "local", proceso: "genesis" }, fingerprint: huella };
    }

    it("cuenta veces, primera y última vez, y guarda el ejemplo", () => {
        const grupos = agrupar([
            eventoCon(["fallo", "", "pagina"], 1051),
            eventoCon(["fallo", "", "pagina"], 1000),
            eventoCon(["otro", "", "pagina"], 900),
        ]);
        expect(grupos.map((g) => g.veces)).toEqual([2, 1]);
        expect(grupos[0].primero).toBe(1000);
        expect(grupos[0].ultimo).toBe(1051);
        expect(grupos[0].ejemplo.fingerprint).toEqual(["fallo", "", "pagina"]);
    });
});