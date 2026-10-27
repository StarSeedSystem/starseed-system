/** Pruebas del cliente MCP por stdio (transporte y reloj falsos, todo síncrono). */
import { describe, it, expect } from "vitest";
import {
  ClienteMcpStdio, ErrorMcp, LIMITE_LINEA, trocearLineas,
  type TransporteMcp,
} from "../mcp-stdio";

const LIBRES = 32 * 1024 * 1024;

/** Transporte falso: guarda lo escrito y deja al test inyectar líneas. */
class TransporteFalso implements TransporteMcp {
  escritas: string[] = [];
  cb: ((texto: string) => void) | null = null;
  cerrado = false;
  escribir(l: string) { this.escritas.push(l); }
  alRecibir(cb: (texto: string) => void) { this.cb = cb; }
  cerrar() { this.cerrado = true; }
  llega(linea: string) { this.cb?.(linea); }
}

/** Reloj falso: los temporizadores se disparan a mano en el test. */
class RelojFalso {
  temporizadores: Array<{ ms: number; cb: () => void; activo: boolean }> = [];
  tras(ms: number, cb: () => void): () => void {
    const t = { ms, cb, activo: true };
    this.temporizadores.push(t);
    return () => { t.activo = false; };
  }
  disparar(ultimo: number) { this.temporizadores[ultimo]?.cb(); }
}

const respInit = (id: number): string =>
  JSON.stringify({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "figcraft", version: "1" } } });

/** Cliente con falsos; devuelve t también para inyectar líneas. */
function crear(tiempoMs = 30_000): { t: TransporteFalso; reloj: RelojFalso; c: ClienteMcpStdio } {
  const t = new TransporteFalso();
  const reloj = new RelojFalso();
  return { t, reloj, c: new ClienteMcpStdio(t, reloj) };
}

describe("trocearLineas", () => {
  it("separa por \\n, quita \\r final y descarta líneas vacías", () => {
    expect(trocearLineas("", "{\"a\":1}\n\n{\"b\":2}\r\n")).toEqual({ lineas: ['{"a":1}', '{"b":2}'], resto: "" });
  });
  it("devuelve el resto sin salto de línea y lo junta con lo siguiente", () => {
    expect(trocearLineas("", "{\"par")).toEqual({ lineas: [], resto: "{\"par" });
    expect(trocearLineas("{\"par", "cial}\n")).toEqual({ lineas: ["{\"parcial}"], resto: "" });
  });
});

describe("ClienteMcpStdio", () => {
  it("handshake completo: initialize con versión y clientInfo, y luego notifications/initialized", async () => {
    const { t, c } = crear();
    const promesa = c.iniciar();
    const envio = JSON.parse(t.escritas[0]) as { id: number; method: string; params: Record<string, unknown> };
    expect(envio.method).toBe("initialize");
    expect(envio.params.protocolVersion).toBe("2025-06-18");
    expect(envio.params.clientInfo).toEqual({ name: "starseed-os", version: "1" });
    t.llega(respInit(envio.id));
    await promesa;
    expect(JSON.parse(t.escritas[1])).toMatchObject({ method: "notifications/initialized" });
    expect(JSON.parse(t.escritas[1]).jsonrpc).toBeUndefined;
  });

  it("handshake también funciona si la notificación llega antes de la respuesta", async () => {
    const { t, c } = crear();
    const promesa = c.iniciar();
    t.llega(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const envio = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(respInit(envio.id));
    await promesa;
    expect(t.escritas).toHaveLength(2);
  });

  it("listar y llamar: ids secuenciales y sin pantalla", async () => {
    const { t, c } = crear();
    await (async () => {
      const p = c.listar();
      const listar = JSON.parse(t.escritas[0]) as { id: number };
      t.llega(JSON.stringify({ jsonrpc: "2.0", id: listar.id, result: { tools: [] } }));
      await p;
      const q = c.llamar("screenshot", { zoom: 1 });
      const llamada = JSON.parse(t.escritas[1]) as { id: number; params: Record<string, unknown> };
      expect(llamada.params).toEqual({ name: "screenshot", arguments: { zoom: 1 } });
      t.llega(JSON.stringify({ jsonrpc: "2.0", id: llamada.id, result: { content: [{ type: "text", text: "hecho" }] } }));
      const r = await q;
      expect(r).toEqual({ ok: true, texto: "hecho", contenido: [{ tipo: "texto", texto: "hecho" }] });
    })();
  });

  it("respuestas desordenadas: cada promesa coge la suya", async () => {
    const { t, c } = crear();
    const p1 = c.listar();
    const p2 = c.listar();
    const [id1, id2] = (t.escritas.map((l) => JSON.parse(l) as { id: number })).map((m) => m.id);
    expect(id2).toBe(id1 + 1);
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: id2, result: { content: [] } }));
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: id1, result: { content: [{ type: "text", text: "uno" }] } }));
    expect((await p1).texto).toBe("uno");
    expect((await p2).ok).toBe(true);
  });

  it("notificaciones y líneas sin id se ignoran y no rompen nada", async () => {
    const { t, c } = crear();
    const p = c.listar();
    t.llega(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progreso" }));
    t.llega(JSON.stringify({ jsonrpc: "2.0", method: "otra-notificacion", params: { a: 1 } }));
    t.llega(JSON.stringify({ result: { content: [] } }));
    const listar = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: listar.id, result: { content: [] } }));
    await expect(p).resolves.toMatchObject({ ok: true });
    expect(c.ilegibles).toBe(0);
  });

  it("respuesta sin petición viva: se ignora como «protocolo» muerto, sin colgar el resto", async () => {
    const { t, c } = crear();
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: 99, result: { content: [] } }));
    const p = c.listar();
    const listar = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: listar.id, result: { content: [] } }));
    await expect(p).resolves.toMatchObject({ ok: true });
  });

  it("línea ilegible: no es JSON, se cuenta y el cliente sigue vivo", async () => {
    const { t, c } = crear();
    t.llega("basura}{");
    expect(c.ilegibles).toBe(1);
    const p = c.listar();
    t.llega(JSON.stringify({ jsonrpc: "2.0", method: "notifications/x" }));
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [] } }));
    await p;
  });

  it("línea enorme: se corta, falla con «enorme» y no se despachan más", async () => {
    const { t, c } = crear();
    const p = c.listar().catch((e) => e as ErrorMcp);
    expect(LIMITE_LINEA).toBe(LIBRES);
    t.llega("x".repeat(LIBRES + 1));
    const e = await p;
    expect(e).toBeInstanceOf(ErrorMcp);
    expect((e as ErrorMcp).tipo).toBe("enorme");
    const antes = t.escritas.length;
    await expect(c.llamar("undo", {})).rejects.toMatchObject({ tipo: "enorme" });
    expect(t.escritas.length).toBe(antes);
  });

  it("tiempo agotado: rechaza con «tiempo» y libera el id", async () => {
    const { t, reloj, c } = crear();
    const p = c.listar(5).catch((e) => e as ErrorMcp);
    expect(reloj.temporizadores.at(-1)?.ms).toBe(5);
    reloj.temporizadores.forEach((x) => { if (x.cb) x.cb(); });
    const e = await p;
    expect((e as ErrorMcp).tipo).toBe("tiempo");
    // El mismo id puede reutilizarse: se lava la pendiente y sigue funcionando.
    const p2 = c.listar(5);
    const lista = JSON.parse(t.escritas.at(-1) as string) as { id: number };
    expect(lista.id).toBe(2);
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: lista.id, result: { content: [] } }));
    await expect(p2).resolves.toMatchObject({ ok: true });
  });

  it("result.isError === true: se devuelve ok:false con el texto, sin excepción", async () => {
    const { t, c } = crear();
    const p = c.llamar("export", {}, 10);
    const llamada = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({
      jsonrpc: "2.0", id: llamada.id,
      result: { isError: true, content: [{ type: "text", text: "La ruta sale del directorio de trabajo." }] },
    }));
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.texto).toBe("La ruta sale del directorio de trabajo.");
  });

  it("error JSON-RPC del servidor: rechaza con «rpc»", async () => {
    const { t, c } = crear();
    const p = c.llamar("no-existe", {}).catch((e) => e as ErrorMcp);
    const llamada = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({ jsonrpc: "2.0", id: llamada.id, error: { code: -32602, message: "Herramienta desconocida." } }));
    expect((await p).tipo).toBe("rpc");
  });

  it("cierre con peticiones pendientes: todas fallan con «cerrado» y el transporte se cierra", async () => {
    const { t, c } = crear();
    const p = c.listar().catch((e) => e as ErrorMcp);
    void JSON.parse(t.escritas[0]) as { id: number };
    c.cerrar();
    expect(t.cerrado).toBe(true);
    expect((await p).tipo).toBe("cerrado");
    await expect(c.listar()).rejects.toMatchObject({ tipo: "cerrado" });
  });

  it("contenido a trozos: textos de varios content se concatenan", async () => {
    const { t, c } = crear();
    const p = c.llamar("inspect_workbook", {});
    const llamada = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({
      jsonrpc: "2.0", id: llamada.id,
      result: { content: [{ type: "text", text: "Hoja: " }, { type: "text", text: "Ventas" }] },
    }));
    const r = await p;
    expect(r.texto).toBe("Hoja: Ventas");
    expect(r.contenido).toHaveLength(2);
  });

  it("imagen base64: mime y bytes decodificados", async () => {
    const { t, c } = crear();
    const p = c.llamar("screenshot", {});
    const llamada = JSON.parse(t.escritas[0]) as { id: number };
    t.llega(JSON.stringify({
      jsonrpc: "2.0", id: llamada.id,
      result: { content: [{ type: "image", mimeType: "image/png", data: "AQIDBA==" }] },
    }));
    const r = await p;
    expect(r.contenido?.[0]).toMatchObject({ tipo: "imagen", mime: "image/png" });
    expect(Array.from((r.contenido?.[0]?.bytes ?? new Uint8Array()) as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  it("trozos partidos a mitad de línea: se acumulan hasta el salto", async () => {
    const { t, c } = crear();
    const p = c.listar();
    const listar = JSON.parse(t.escritas[0]) as { id: number };
    const respuesta = JSON.stringify({ jsonrpc: "2.0", id: listar.id, result: { content: [] } });
    t.llega(respuesta.slice(0, 10));
    t.llega(respuesta.slice(10, 25));
    t.llega(respuesta.slice(25) + "\n");
    await expect(p).resolves.toMatchObject({ ok: true });
  });
});


