/**
 * Pruebas de la ruta MCP por ámbito con DEPENDENCIAS FALSAS (sin red ni disco).
 * Se prueba la lógica pura de `src/lib/genesis/mcp/ruta-ambito.ts` (nunca el
 * `route.ts`): autorización Bearer/sesión, filtro de herramientas por permiso,
 * límite de uso y registro de llamadas sin datos sensibles.
 */
import { describe, it, expect } from "vitest";
import {
    atenderPostMcp,
    conPermiso,
    filtrarHerramientas,
    type DepsRutaMcp,
    type RegistroLlamada,
} from "@/lib/genesis/mcp/ruta-ambito";
import type { RespuestaErrorJsonRpc } from "@/lib/genesis/mcp/protocolo";
import { crearAlmacenMemoria, crearToken } from "@/lib/genesis/mcp/tokens-externos";
import type { FichaHerramientaMcp, PermisoMcp } from "@/lib/genesis/mcp/herramientas";

function herramientaFalsa(nombre: string, permiso: PermisoMcp): FichaHerramientaMcp {
    return {
        nombre,
        descripcion: `Herramienta falsa ${nombre}`,
        permiso,
        esquema: { type: "object", properties: {} },
        ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `${nombre} ejecutada` }] }),
    };
}

const HERRAMIENTAS: FichaHerramientaMcp[] = [
    herramientaFalsa("estado", "estado:leer"),
    herramientaFalsa("tareas_listar", "tareas:listar"),
    herramientaFalsa("chat", "chat:enviar"),
];

interface Banco {
    deps: DepsRutaMcp;
    llamadas: RegistroLlamada[];
}

function banco(opciones: { limiteUsos?: number } = {}): Banco {
    const llamadas: RegistroLlamada[] = [];
    const deps: DepsRutaMcp = {
        herramientas: HERRAMIENTAS,
        almacen: crearAlmacenMemoria(),
        ahora: () => 1_700_000_000_000,
        registrarLlamada: (registro) => { llamadas.push(registro); },
        limiteUsos: opciones.limiteUsos,
    };
    return { deps, llamadas };
}

function errorDe(respuesta: unknown): RespuestaErrorJsonRpc["error"] {
    return (respuesta as RespuestaErrorJsonRpc).error;
}

async function tokenDe(deps: DepsRutaMcp, alcance: string[], ambito = "ambito-1"): Promise<string> {
    const { valor } = await crearToken(ambito, alcance, undefined, deps.almacen);
    return valor;
}

function peticionListar(): unknown {
    return { jsonrpc: "2.0", id: "l1", method: "tools/list" };
}

function peticionLlamar(nombre: string): unknown {
    return { jsonrpc: "2.0", id: "c1", method: "tools/call", params: { name: nombre, arguments: {} } };
}

describe("ruta MCP por ámbito · autorización", () => {
    it("sin Bearer ni ámbito de sesión responde No autorizado y anota la denegación", async () => {
        const { deps, llamadas } = banco();
        const respuesta = await atenderPostMcp(peticionListar(), null, null, deps);
        expect(errorDe(respuesta).code).toBe(-32001);
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0]?.tipo).toBe("denegado");
        expect(llamadas[0]?.statusCode).toBe(401);
    });

    it("una cabecera mal formada o con token desconocido también se deniega", async () => {
        const { deps } = banco();
        const respuesta = await atenderPostMcp(peticionListar(), "Bearer no-existe", null, deps);
        expect(errorDe(respuesta).code).toBe(-32001);
    });

    it("con sesión el tools/list muestra todas las herramientas", async () => {
        const { deps } = banco();
        const respuesta = await atenderPostMcp(peticionListar(), null, "ambito-1", deps);
        const herramientas = (respuesta as { result: { tools: { name: string }[] } }).result.tools;
        expect(herramientas.map((h) => h.name)).toEqual(["estado", "tareas_listar", "chat"]);
    });
});

describe("ruta MCP por ámbito · permisos y alcance del token", () => {
    it("un token solo lista las herramientas de su alcance", async () => {
        const { deps } = banco();
        const valor = await tokenDe(deps, ["estado:leer"]);
        const respuesta = await atenderPostMcp(peticionListar(), `Bearer ${valor}`, null, deps);
        const herramientas = (respuesta as { result: { tools: { name: string }[] } }).result.tools;
        expect(herramientas.map((h) => h.name)).toEqual(["estado"]);
    });

    it("una llamada dentro del alcance se ejecuta y se registra sin datos sensibles", async () => {
        const { deps, llamadas } = banco();
        const valor = await tokenDe(deps, ["estado:leer"]);
        const respuesta = await atenderPostMcp(peticionLlamar("estado"), `Bearer ${valor}`, null, deps);
        const resultado = (respuesta as { result: { contenido: { texto: string }[] } }).result;
        expect(resultado.contenido[0]?.texto).toBe("estado ejecutada");
        expect(llamadas[0]).toMatchObject({
            ambito: "ambito-1",
            tipo: "token",
            endpoint: "estado",
            metodo: "tools/call",
            statusCode: 200,
        });
        expect(JSON.stringify(llamadas[0])).not.toContain(valor);
    });

    it("una llamada fuera del alcance no encuentra la herramienta", async () => {
        const { deps } = banco();
        const valor = await tokenDe(deps, ["estado:leer"]);
        const respuesta = await atenderPostMcp(peticionLlamar("chat"), `Bearer ${valor}`, null, deps);
        expect(errorDe(respuesta).code).toBe(-32602);
    });

    it("un token expirado se deniega", async () => {
        const { deps, llamadas } = banco();
        const { valor } = await crearToken("ambito-1", ["estado:leer"], 1, deps.almacen);
        const respuesta = await atenderPostMcp(peticionListar(), `Bearer ${valor}`, null, deps);
        expect(errorDe(respuesta).code).toBe(-32001);
        expect(llamadas[0]?.tipo).toBe("denegado");
    });
});

describe("ruta MCP por ámbito · límite de uso", () => {
    it("alcanzar el límite responde 32002 y no ejecuta la herramienta", async () => {
        const { deps, llamadas } = banco({ limiteUsos: 1 });
        const valor = await tokenDe(deps, ["estado:leer"]);
        const primera = await atenderPostMcp(peticionLlamar("estado"), `Bearer ${valor}`, null, deps);
        expect("result" in primera).toBe(true);
        const segunda = await atenderPostMcp(peticionLlamar("estado"), `Bearer ${valor}`, null, deps);
        expect(errorDe(segunda).code).toBe(-32002);
        expect(llamadas[1]?.statusCode).toBe(429);
        expect(llamadas).toHaveLength(2);
    });
});

describe("ayudantes de permiso", () => {
    it("«*» concede todo y un permiso ajeno no concede", () => {
        const sesion = { ambito: "a", tipo: "sesion" as const, permisos: ["*"] };
        expect(conPermiso(sesion, "chat:enviar")).toBe(true);
        const token = { ambito: "a", tipo: "token" as const, permisos: ["estado:leer"] };
        expect(conPermiso(token, "chat:enviar")).toBe(false);
    });

    it("filtrarHerramientas respeta el permiso de cada ficha", () => {
        const token = { ambito: "a", tipo: "token" as const, permisos: ["tareas:listar"] };
        const visibles = filtrarHerramientas(HERRAMIENTAS, token);
        expect(visibles.map((h) => h.nombre)).toEqual(["tareas_listar"]);
    });
});
