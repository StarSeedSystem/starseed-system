/**
 * Pruebas del cliente MCP por stdio (contrato: `architecture/artcraft-y-rare.md`
 * §2.1 y §3.1). Todo con transporte y reloj falsos: sin procesos, sin red.
 * Nada con forma de clave: los datos se montan en el momento.
 */
import { describe, expect, it } from "vitest";
import { ClienteMcpStdio, LIMITE_LINEA, trocearLineas } from "../mcp-stdio";
import type { RelojInyectado, TransporteStdio } from "../mcp-stdio";

interface ParFalso {
  cliente: ClienteMcpStdio;
  escritas: string[];
  temporizadores: { ms: number; cb: () => void; cancelada: boolean }[];
  recibir(texto: string): void;
  responder(id: number, resultado: unknown): void;
  temporizadorVivo(): { cb: () => void };
}

const crearPar = (limiteLinea = LIMITE_LINEA): ParFalso => {
  const escritas: string[] = [];
  const temporizadores: ParFalso["temporizadores"] = [];
  let alRecibir: ((texto: string) => void) | null = null;
  const transporte: TransporteStdio = {
    escribir: (linea) => escritas.push(linea),
    alRecibir: (cb) => { alRecibir = cb; },
    cerrar: () => {},
  };
  const reloj: RelojInyectado = {
    tras: (ms, cb) => {
      const t = { ms, cb, cancelada: false };
      temporizadores.push(t);
      return () => { t.cancelada = true; };
    },
  };
  const cliente = new ClienteMcpStdio(transporte, reloj, limiteLinea);
  return {
    cliente, escritas, temporizadores,
    recibir: (texto) => alRecibir?.(texto),
    responder: (id, resultado) => alRecibir?.(`${JSON.stringify({ jsonrpc: "2.0", id, result: resultado })}\n`),
    temporizadorVivo: () => temporizadores.filter((t) => !t.cancelada)[0],
  };
};

/** Sesión abierta: handshake `initialize` → respuesta id 1 → `initialized`. */
const conSesion = async (limiteLinea = LIMITE_LINEA): Promise<ParFalso> => {
  const par = crearPar(limiteLinea);
  const abierta = par.cliente.iniciar();
  par.responder(1, { protocolVersion: "2025-06-18" });
  await abierta;
  return par;
};

describe("trocearLineas", () => {
  it("separa por salto, ignora el \\r final y las líneas vacías", () => {
    expect(trocearLineas("", "a\nb\r\nc\r\n\n")).toEqual({ lineas: ["a", "b", "c"], resto: "" });
  });
  it("lo que no acaba en salto queda como pendiente y se reensambla", () => {
    expect(trocearLineas("", "ab")).toEqual({ lineas: [], resto: "ab" });
    expect(trocearLineas("ab", "cd\nef\n")).toEqual({ lineas: ["abcd", "ef"], resto: "" });
  });
});

describe("ClienteMcpStdio · handshake", () => {
  it("iniciar manda initialize con la versión y el cliente, y cierra con la notificación", async () => {
    const par = crearPar();
    const abierta = par.cliente.iniciar();
    const pedida = JSON.parse(par.escritas[0]) as Record<string, unknown>;
    expect(pedida.method).toBe("initialize");
    expect(pedida.params).toEqual({
      protocolVersion: "2025-06-18",
      clientInfo: { name: "starseed-os", version: "1" },
    });
    par.responder(1, { protocolVersion: "2025-06-18" });
    await abierta;
    expect(JSON.parse(par.escritas[1])).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
  });
  it("listar mapea tools/list a fichas defensivas", async () => {
    const par = await conSesion();
    const pedido = par.cliente.listar(1000);
    par.recibir(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "export", description: "Guarda", inputSchema: { type: "object" } }, "mal"] } }) + "\n");
    const herramientas = await pedido;
    expect(herramientas).toEqual([
      { nombre: "export", descripcion: "Guarda", esquema: { type: "object" } },
      { nombre: "", descripcion: null, esquema: null },
    ]);
  });
});

describe("ClienteMcpStdio · despacho y avatares de línea", () => {
  it("respuestas desordenadas se emparejan por id", async () => {
    const par = await conSesion();
    const primera = par.cliente.llamar("uno", {}, 1000);
    const segunda = par.cliente.llamar("dos", { x: 1 }, 1000);
    par.responder(3, { content: [{ type: "text", text: "dos" }] });
    par.responder(2, { isError: false, content: [{ type: "text", text: "uno" }] });
    expect((await primera).texto).toBe("uno");
    expect((await segunda).ok).toBe(true);
  });
  it("notificaciones del servidor y respuesta de id desconocido se ignoran", async () => {
    const par = await conSesion();
    par.recibir('{"jsonrpc":"2.0","method":"tools/list_changed"}\n');
    par.recibir('{"jsonrpc":"2.0","id":77,"result":{"tools":[]}}\n');
    const pedido = par.cliente.listar(1000);
    par.responder(2, { tools: [{ name: "get_cell" }] });
    expect((await pedido)[0].nombre).toBe("get_cell");
    expect(par.cliente.ilegibles).toBe(0);
  });
  it("una línea que no es JSON se cuenta en ilegibles y no tumba nada", async () => {
    const par = await conSesion();
    par.recibir("<xml de la app>\n");
    par.recibir("[el servidor, una lista suelta]\n");
    const pedido = par.cliente.listar(1000);
    par.responder(2, { tools: [{ name: "undo" }] });
    expect((await pedido)[0].nombre).toBe("undo");
    expect(par.cliente.ilegibles).toBe(2);
  });
  it("trozo partido a mitad de línea se reensambla igual", async () => {
    const par = await conSesion();
    const pedido = par.cliente.listar(1000);
    const linea = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "export" }] } });
    par.recibir(linea.slice(0, 9));
    par.recibir(linea.slice(9) + "\n");
    expect((await pedido)[0].nombre).toBe("export");
  });
});

describe("ClienteMcpStdio · límites, tiempos y cierre", () => {
  it("el resto sin salto que supera el límite corta y ya no se despacha nada", async () => {
    const par = await conSesion(16);
    const enorme = par.cliente.llamar("g", {}, 1000);
    const fallo = expect(enorme).rejects.toMatchObject({ tipo: "enorme" });
    par.recibir("0123456789abcdef" + "g"); // 17 sin salto, límite 16
    await fallo;
    await expect(par.cliente.listar(1000)).rejects.toMatchObject({ tipo: "enorme" });
    expect(par.escritas).toHaveLength(3); // la de «g» ya salió; la de listar fue rechazada sin despachar
  });
  it("el tiempo agotado falla con «tiempo»", async () => {
    const par = await conSesion();
    const pedido = par.cliente.listar(50);
    const fallo = expect(pedido).rejects.toMatchObject({ tipo: "tiempo" });
    par.temporizadorVivo().cb();
    await fallo;
  });
  it("cerrar falla las pendientes con «cerrado» y no acepta más", async () => {
    const par = await conSesion();
    const pendiente = par.cliente.llamar("export", {}, 50_000);
    par.cliente.cerrar();
    await expect(pendiente).rejects.toMatchObject({ tipo: "cerrado" });
    await expect(par.cliente.listar(1000)).rejects.toMatchObject({ tipo: "cerrado" });
  });
});

describe("ClienteMcpStdio · result de herramientas", () => {
  it("isError true se devuelve como ok false sin excepción", async () => {
    const par = await conSesion();
    const pedido = par.cliente.llamar("export", {}, 1000);
    par.responder(2, { isError: true, content: [{ type: "text", text: "El archivo está abierto." }] });
    const r = await pedido;
    expect(r.ok).toBe(false);
    expect(r.texto).toBe("El archivo está abierto.");
  });
  it("varias bloques de texto se concatenan en texto", async () => {
    const par = await conSesion();
    const pedido = par.cliente.llamar("inspect", {}, 1000);
    par.responder(2, { content: [{ type: "text", text: "capa uno" }, { type: "text", text: " y dos" }] });
    const r = await pedido;
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("capa uno y dos");
  });
  it("los bloques que no son texto conocido se descartan sin romper", async () => {
    const par = await conSesion();
    const pedido = par.cliente.llamar("eso", {}, 1000);
    par.responder(2, { content: [{ type: "resource", uri: "figcraft://doc" }, { type: "text", text: "solo esto" }] });
    expect((await pedido).texto).toBe("solo esto");
  });
  it("imagen base64 se decodifica a bytes con su mime", async () => {
    const par = await conSesion();
    const pedido = par.cliente.llamar("screenshot", { ventana: "lienzo" }, 1000);
    par.responder(2, { content: [
      { type: "text", text: "captura:" },
      { type: "image", mimeType: "image/png", data: btoa("hi") },
    ] });
    const r = await pedido;
    expect(r.texto).toBe("captura:");
    expect(r.contenido[1]).toEqual({ tipo: "imagen", mime: "image/png", bytes: new Uint8Array([104, 105]) });
  });
});

describe("limite de línea del contrato §2.1", () => {
  it("LIMITE_LINEA son los 32 MiB de FigCraft", () => {
    expect(LIMITE_LINEA).toBe(32 * 1024 * 1024);
  });
});
