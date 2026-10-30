import { describe, it, expect } from "vitest";
import { crearAlmacenMemoria, crearToken, revocarToken } from "@/lib/genesis/mcp/tokens-externos";
import { HERRAMIENTAS_MCP, type FichaHerramientaMcp } from "@/lib/genesis/mcp/herramientas";
import {
  atenderMcpConPermisos,
  extraerBearer,
  filtrarHerramientas,
  recurso405,
  resolverAcceso,
  LIMITE_USOS_DEFECTO,
  type DependenciasRuta,
  type RegistroLlamada,
  type SesionResuelta,
} from "@/lib/genesis/mcp/ruta";

const sesionFalsa: SesionResuelta = {
  ambito: "cuenta:user-1",
  alcance: ["ver-resumen", "encolar"],
  creador: "user-1",
};

interface DepsFalsas {
  deps: DependenciasRuta;
  registros: RegistroLlamada[];
}

/** Almacén y registro falsos, sin red ni disco: la prueba es pura. */
function depsFalsas(limite = LIMITE_USOS_DEFECTO): DepsFalsas {
  const registros: RegistroLlamada[] = [];
  return {
    registros,
    deps: {
      almacen: crearAlmacenMemoria(),
      reloj: () => 1_800_000_000_000,
      registrar: async (l) => {
        registros.push(l);
        return true;
      },
      limiteUsos: limite,
    },
  };
}

describe("ruta MCP con permisos (tarea S)", () => {
  it("extraerBearer devuelve solo el valor del token", () => {
    expect(extraerBearer("Bearer supersu valor de prueba")).toBeNull();
    expect(extraerBearer("Bearer supersede-larga-1234567890")).toBe("supersede-larga-1234567890");
    expect(extraerBearer("Basic usuario:clave")).toBeNull();
    expect(extraerBearer(null)).toBeNull();
  });

  it("recurso405 es la respuesta del método no permitido (GET → 405)", () => {
    const respuesta = recurso405();
    expect("error" in respuesta).toBe(true);
    if (!("error" in respuesta)) return;
    expect(respuesta.error.code).toBe(-32600);
    expect(respuesta.error.message).toContain("solo acepta POST");
  });

  it("filtrarHerramientas deja solo las herramientas del alcance", () => {
    expect(filtrarHerramientas(HERRAMIENTAS_MCP, ["chatear"]).map((h) => h.nombre)).toEqual(["chat"]);
    expect(filtrarHerramientas(HERRAMIENTAS_MCP, [])).toEqual([]);
    const todas = ["ver-resumen", "encolar", "ver-detalle", "chatear"];
    expect(filtrarHerramientas(HERRAMIENTAS_MCP, todas).length).toBe(HERRAMIENTAS_MCP.length);
  });

  it("prefiere el token sobre la sesión y devuelve su ámbito", async () => {
    const { deps } = depsFalsas();
    const r = await crearToken("ambito-uno", ["ver-resumen"], undefined, deps.almacen);
    expect(await resolverAcceso(deps, r.valor, sesionFalsa)).toMatchObject({
      ok: true, via: "token", ambito: "ambito-uno",
    });
  });

  it("rechaza con 401 un token revocado o desconocido", async () => {
    const { deps } = depsFalsas();
    const r = await crearToken("ambito-dos", ["chatear"], undefined, deps.almacen);
    revocarToken(r.huella, deps.almacen, deps.reloj());
    expect(await resolverAcceso(deps, r.valor, null)).toMatchObject({ ok: false, status: 401 });
    expect(await resolverAcceso(deps, "token que jamás existió", null)).toMatchObject({ ok: false, status: 401 });
  });
  it("aplica el límite de uso del token", async () => {
    const { deps } = depsFalsas(2);
    const r = await crearToken("ambito-tres", ["chatear"], undefined, deps.almacen);
    expect((await resolverAcceso(deps, r.valor, null)).ok).toBe(true);
    expect((await resolverAcceso(deps, r.valor, null)).ok).toBe(true);
    expect(await resolverAcceso(deps, r.valor, null)).toMatchObject({
      ok: false, status: 429, via: "token", ambito: "ambito-tres",
    });
  });

  it("sin token ni sesión da 401 y con sesión entra por sesión", async () => {
    const { deps, registros } = depsFalsas();
    expect(await resolverAcceso(deps, null, null)).toMatchObject({ ok: false, status: 401 });
    expect(await resolverAcceso(deps, null, sesionFalsa)).toMatchObject({
      ok: true, via: "sesion", ambito: "cuenta:user-1",
    });
    const rechazada = await atenderMcpConPermisos({}, HERRAMIENTAS_MCP, deps, null, null, "/api/mcp/genesis");
    expect(rechazada).toMatchObject({
      status: 401,
      salida: { error: expect.stringContaining("token Bearer") },
    });
    expect(registros.length).toBe(0);
  });

  it("tools/list sale filtrada por el alcance y el registro no lleva datos sensibles", async () => {
    const { deps, registros } = depsFalsas();
    const r = await crearToken("ambito-mcp", [], undefined, deps.almacen);
    const dirigido = await atenderMcpConPermisos(
      { jsonrpc: "2.0", id: 1, method: "tools/list" }, HERRAMIENTAS_MCP, deps, r.valor, null, "/api/mcp/genesis",
    );
    expect(dirigido.status).toBe(200);
    expect((dirigido.salida as { result: { tools: Array<{ name: string }> } }).result.tools).toEqual([]);
    expect(registros.length).toBe(1);
    expect(registros[0]).toEqual({
      via: "token", ambito: "ambito-mcp", metodo: "POST", endpoint: "/api/mcp/genesis", tipo: "tools/list", statusCode: 200,
    });
    expect(JSON.stringify(registros)).not.toContain(r.valor);
  });

  it("tools/call sin permiso del alcance falla y con permiso pasa", async () => {
    const { deps } = depsFalsas();
    const r = await crearToken("ambito-mcp", ["ver-resumen"], undefined, deps.almacen);
    const bloqueada = await atenderMcpConPermisos(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "chat", arguments: { destino: "x", contenido: "hola" } } },
      HERRAMIENTAS_MCP, deps, r.valor, null, "/api/mcp/genesis",
    );
    expect(bloqueada.status).toBe(200);
    expect((bloqueada.salida as { error: { code: number } }).error.code).toBe(-32602);
    const { deps: deps2 } = depsFalsas();
    const r2 = await crearToken("ambito-chat", ["chatear"], undefined, deps2.almacen);
    const permitida = await atenderMcpConPermisos(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "chat", arguments: { destino: "x", contenido: "hola" } } },
      HERRAMIENTAS_MCP, deps2, r2.valor, null, "/api/mcp/genesis",
    );
    expect(permitida.status).toBe(200);
    expect((permitida.salida as { result: { contenido: Array<{ texto: string }> } }).result.contenido.some(
      (c) => c.texto.includes("hola"),
    )).toBe(true);
  });

  it("un cuerpo que no es JSON-RPC da 400 y queda registrado", async () => {
    const { deps, registros } = depsFalsas();
    const r = await crearToken("ambito-invalido", ["chatear"], undefined, deps.almacen);
    const invalida = await atenderMcpConPermisos(
      { hola: true }, HERRAMIENTAS_MCP, deps, r.valor, null, "/api/mcp/genesis",
    );
    expect(invalida.status).toBe(400);
    expect((invalida.salida as { error: string }).error).toContain("JSON-RPC");
    expect(registros[0]).toMatchObject({ tipo: "solicitud-invalida", statusCode: 400, via: "token" });
  });

  it("el token agotado se rechaza con 429 y se registra con su ámbito", async () => {
    const { deps, registros } = depsFalsas(0);
    const r = await crearToken("ambito-tres", ["chatear"], undefined, deps.almacen);
    const agotada = await atenderMcpConPermisos(
      { jsonrpc: "2.0", id: 4, method: "initialize" }, HERRAMIENTAS_MCP, deps, r.valor, null, "/api/mcp/genesis",
    );
    expect(agotada.status).toBe(429);
    expect(registros.length).toBe(1);
    expect(registros[0]).toMatchObject({ tipo: "initialize", statusCode: 429, via: "token", ambito: "ambito-tres" });
  });

  it("una llamada con permiso se registra como tools/call sin guardar el token", async () => {
    const { deps, registros } = depsFalsas();
    const r = await crearToken("ambito-llamada", ["ver-resumen"], undefined, deps.almacen);
    const respuesta = await atenderMcpConPermisos(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "estado", arguments: {} } },
      HERRAMIENTAS_MCP, deps, r.valor, null, "/api/mcp/genesis",
    );
    expect(respuesta.status).toBe(200);
    expect((respuesta.salida as { result: { contenido: Array<{ texto: string }> } }).result.contenido[0]?.texto)
      .toContain("StarSeed OS");
    expect(registros).toEqual([{
      via: "token", ambito: "ambito-llamada", metodo: "POST", endpoint: "/api/mcp/genesis", tipo: "tools/call", statusCode: 200,
    }]);
    expect(JSON.stringify(registros)).not.toContain(r.valor);
  });

  it("alcanzar el límite no ejecuta la herramienta y anota el 429", async () => {
    const { deps, registros } = depsFalsas(1);
    let ejecuciones = 0;
    const herramienta: FichaHerramientaMcp = {
      nombre: "contar", descripcion: "Cuenta sus ejecuciones", permiso: "estado:leer", esquema: { type: "object", properties: {} },
      ejecutar: async () => {
        ejecuciones += 1;
        return { contenido: [{ tipo: "texto", texto: "contada" }] };
      },
    };
    const r = await crearToken("ambito-limite", ["ver-resumen"], undefined, deps.almacen);
    const peticion = { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "contar", arguments: {} } };
    const primera = await atenderMcpConPermisos(peticion, [herramienta], deps, r.valor, null, "/api/mcp/genesis");
    expect(primera.status).toBe(200);
    const segunda = await atenderMcpConPermisos(peticion, [herramienta], deps, r.valor, null, "/api/mcp/genesis");
    expect(segunda).toMatchObject({ status: 429, salida: { error: expect.stringContaining("límite") } });
    expect(ejecuciones).toBe(1);
    expect(registros.map((l) => l.statusCode)).toEqual([200, 429]);
    expect(registros[1]).toMatchObject({ via: "token", ambito: "ambito-limite", tipo: "tools/call", statusCode: 429 });
  });
});
