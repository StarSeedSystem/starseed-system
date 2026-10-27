import { describe, it, expect } from "vitest";
import {
  ClienteMcpStdio,
  ErrorMcp,
  LIMITE_LINEA,
  trocearLineas,
  type TransporteMcp,
  type RelojMcp,
} from "../mcp-stdio";

interface Mensaje { jsonrpc: string; id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } }

class TransporteFalso implements TransporteMcp {
  enviadas: Mensaje[] = [];
  cerrado = false;
  private cb: ((texto: string) => void) | null = null;
  escribir(linea: string) { this.enviadas.push(JSON.parse(linea) as Mensaje); }
  alRecibir(cb: (texto: string) => void) { this.cb = cb; }
  cerrar() { this.cerrado = true; }
  llegar(texto: string) { if (this.cb) this.cb(texto); }
  responder(m: Partial<Mensaje>, salto = true) { this.llegar(JSON.stringify({ jsonrpc: "2.0", ...m }) + (salto ? "\n" : "")); }
}

class RelojFalso implements RelojMcp {
  activos: { ms: number; cb: () => void }[] = [];
  tras(ms: number, cb: () => void) {
    const entrada = { ms, cb };
    this.activos.push(entrada);
    return () => { this.activos = this.activos.filter((r) => r.cb !== cb); };
  }
  disparar() { for (const r of [...this.activos]) r.cb(); this.activos = []; }
}

function crearPar() {
  const transporte = new TransporteFalso();
  const reloj = new RelojFalso();
  return { cliente: new ClienteMcpStdio(transporte, reloj), transporte, reloj };
}

const CONTEXTO = { name: "starseed-os", version: "1" };

async function clienteListo(tiempoMs = 100) {
  const par = crearPar();
  const arranque = par.cliente.iniciar(CONTEXTO, tiempoMs);
  par.transporte.responder({ id: 0, result: { serverInfo: { name: "figcraft-cli", version: "0.10.0" } } });
  await arranque;
  par.transporte.enviadas.length = 0;
  return par;
}

describe("trocearLineas", () => {
  it("separa por salto y deja lo pendiente sin salto como resto", () => {
    const t = trocearLineas("", "a\nbc\nihí");
    expect(t.lineas).toEqual(["a", "bc"]);
    expect(t.resto).toBe("ihí");
  });

  it("ignora el \\r final y las líneas vacías", () => {
    expect(trocearLineas("x\r\n", "\r\n\n").lineas).toEqual(["x"]);
  });

  it("junta el pendiente anterior con el trozo nuevo (línea partida)", () => {
    const t = trocearLineas("ab", "c\nde");
    expect(t.lineas).toEqual(["abc"]);
    expect(t.resto).toBe("de");
  });

  it("el límite es exactamente 32 MiB", () => {
    expect(LIMITE_LINEA).toBe(33554432);
  });
});

describe("ClienteMcpStdio", () => {
  it("handshake: initialize con protocolo, info e ids secuenciales, luego notificación initialized", async () => {
    const { cliente, transporte } = crearPar();
    const arranque = cliente.iniciar(CONTEXTO, 100);
    const msj = transporte.enviadas[0];
    expect(msj.method).toBe("initialize");
    expect(msj.id).toBe(0);
    const params = msj.params as Record<string, unknown>;
    expect(params.protocolVersion).toBe("2025-06-18");
    expect(params.clientInfo).toEqual(CONTEXTO);
    transporte.responder({ id: 0, result: {} });
    await arranque;
    expect(transporte.enviadas[1].method).toBe("notifications/initialized");
    expect(transporte.enviadas[1].id).toBeUndefined();
  });

  it("tools/list envía y resuelve el resultado", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.listar(100);
    expect(transporte.enviadas[0].method).toBe("tools/list");
    transporte.responder({ id: 1, result: { tools: [{ name: "export" }] } });
    await expect(promesa).resolves.toEqual({ tools: [{ name: "export" }] });
  });

  it("respuestas desordenadas: cada id resuelve su petición", async () => {
    const { cliente, transporte } = await clienteListo();
    const a = cliente.listar(100);
    const b = cliente.listar(100);
    transporte.responder({ id: 2, result: { marca: "b" } });
    transporte.responder({ id: 1, result: { marca: "a" } });
    await expect(a).resolves.toEqual({ marca: "a" });
    await expect(b).resolves.toEqual({ marca: "b" });
  });

  it("las notificaciones del servidor se ignoran y no desordenan los ids", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.listar(100);
    transporte.responder({ method: "notifications/progress", params: {} });
    transporte.responder({ method: "salida/parcial", params: { texto: "hola" } });
    transporte.responder({ id: 1, result: {} });
    await promesa;
    expect(transporte.enviadas).toHaveLength(1);
  });

  it("una línea ilegible no tumba el cliente y se cuenta", async () => {
    const { cliente, transporte } = await clienteListo();
    transporte.llegar("esto no es json\n");
    expect(cliente.cuentaIlegibles).toBe(1);
    const promesa = cliente.listar(100);
    transporte.responder({ id: 1, result: {} });
    await promesa;
  });

  it("resto enorme: corta la línea, no despacha más y lanza enorme", async () => {
    const { cliente, transporte, reloj } = await clienteListo();
    const promesa = cliente.listar(100);
    expect(reloj.activos).toHaveLength(1);
    transporte.llegar("x".repeat(LIMITE_LINEA + 1));
    await expect(promesa).rejects.toMatchObject({ tipo: "enorme" });
    await expect(cliente.listar(100)).rejects.toMatchObject({ tipo: "enorme" });
    const antes = transporte.enviadas.length;
    transporte.responder({ id: 1, result: { tarde: true } });
    expect(transporte.enviadas).toHaveLength(antes); // sin despachos nuevos
  });

  it("tiempo agotado: el reloj rechaza la petición", async () => {
    const { cliente, reloj } = await clienteListo();
    const promesa = cliente.listar(1500);
    expect(reloj.activos[0].ms).toBe(1500);
    reloj.disparar();
    await expect(promesa).rejects.toMatchObject({ tipo: "tiempo" });
  });

  it("un reloj cumedido se cancela cuando llega la respuesta", async () => {
    const { cliente, transporte, reloj } = await clienteListo();
    const promesa = cliente.listar(100);
    transporte.responder({ id: 1, result: {} });
    await promesa;
    expect(reloj.activos).toHaveLength(0);
  });

  it("error rpc del servidor sale como excepción tipada rpc", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.llamar("export", { archivo: "salida/hoja.png" }, 100);
    transporte.responder({ id: 1, error: { message: "hoja no encontrada" } });
    await expect(promesa).rejects.toMatchObject({ tipo: "rpc", message: "tools/call: hoja no encontrada" });
  });

  it("isError true devuelve { ok: false, texto } sin excepción", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.llamar("save_file", undefined, 100);
    transporte.responder({ id: 1, result: { isError: true, content: [{ type: "text", text: "permiso denegado" }] } });
    const r = await promesa;
    expect(r.ok).toBe(false);
    expect(r.texto).toBe("permiso denegado");
  });

  it("texto de result.content se concatena; una imagen entra como imagen con bytes decodificados", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.llamar("screenshot", undefined, 100);
    const base64 = Buffer.from("PNG1", "utf8").toString("base64");
    transporte.responder({
      id: 1,
      result: {
        content: [
          { type: "text", text: "captura" },
          { type: "image", mimeType: "image/png", data: base64 },
          { type: "image", mimeType: "image/png", data: Buffer.from("B", "utf8").toString("base64") },
        ],
      },
    });
    const r = await promesa;
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("captura");
    expect(r.contenido[0]).toEqual({ tipo: "texto", texto: "captura" });
    expect(r.contenido[1]).toEqual({ tipo: "imagen", mime: "image/png", bytes: new Uint8Array([80, 78, 71, 49]) });
    expect(r.contenido[2]).toEqual({ tipo: "imagen", mime: "image/png", bytes: new Uint8Array([66]) });
  });

  it("cierre con pendientes: fallan con cerrado y el transporte se cierra", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.listar(5000);
    cliente.cerrar();
    expect(transporte.cerrado).toBe(true);
    await expect(promesa).rejects.toMatchObject({ tipo: "cerrado" });
    await expect(cliente.listar(100)).rejects.toMatchObject({ tipo: "cerrado" });
  });

  it("una línea sin salto final queda pendiente y se completa con el trozo siguiente", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.llamar("inspect_document", undefined, 100);
    transporte.llegar('{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"t');
    transporte.llegar('ext","text":"ok"}]}}\n');
    const r = await promesa;
    expect(r.texto).toBe("ok");
    expect(cliente.cuentaIlegibles).toBe(0);
  });

  it("una respuesta tardía (id ya resuelto) se ignora sin romper las siguientes", async () => {
    const { cliente, transporte } = await clienteListo();
    const promesa = cliente.listar(100);
    transporte.responder({ id: 1, result: { n: 1 } });
    await promesa;
    transporte.responder({ id: 1, result: { n: 0 } });
    const segunda = cliente.listar(100);
    transporte.responder({ id: 2, result: { n: 2 } });
    await expect(segunda).resolves.toEqual({ n: 2 });
  });
});
