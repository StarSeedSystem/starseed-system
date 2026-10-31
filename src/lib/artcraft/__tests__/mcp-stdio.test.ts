import { describe, it, expect } from "vitest";
import { ClienteMcpStdio, trocearLineas, LIMITE_LINEA, type TransporteMcp, type RelojMcp } from "../mcp-stdio";
class TransporteFalso implements TransporteMcp {
  escritas: string[] = []; cerrado = false;
  private receptor?: (texto: string) => void;
  escribir(linea: string) { this.escritas.push(linea); }
  alRecibir(cb: (texto: string) => void) { this.receptor = cb; }
  cerrar() { this.cerrado = true; }
  enviar(texto: string) { this.receptor?.(texto); }
  responder(id: number, resultado: unknown) { this.enviar(`${JSON.stringify({ jsonrpc: "2.0", id, result: resultado })}\n`); }
  get ultima(): { id: number; method: string; params: Record<string, unknown> } {
    return JSON.parse(this.escritas[this.escritas.length - 1]);
  }
}
class RelojFalso implements RelojMcp {
  private tareas = new Map<number, () => void>(); private siguiente = 1;
  tras(_ms: number, cb: () => void) { const id = this.siguiente++; this.tareas.set(id, cb); return () => { this.tareas.delete(id); }; }
  disparar() { const tareas = Array.from(this.tareas.values()); this.tareas.clear(); for (const cb of tareas) cb(); }
}
const montar = () => {
  const transporte = new TransporteFalso(); const reloj = new RelojFalso();
  return { transporte, reloj, cliente: new ClienteMcpStdio(transporte, reloj) };
};
describe("trocearLineas", () => {
  it("separa por salto, descarta \\r y vacías, y junta trozos partidos", () => {
    expect(trocearLineas("ini\r\n", "uno\n\n dos \r\nresto")).toEqual({ lineas: ["ini", "uno", " dos "], resto: "resto" });
    expect(trocearLineas("hola", " mundo\notra")).toEqual({ lineas: ["hola mundo"], resto: "otra" });
  });
});

describe("ClienteMcpStdio", () => {
  it("hace el handshake y manda initialized", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.iniciar();
    expect(transporte.ultima.method).toBe("initialize");
    expect(transporte.ultima.params).toMatchObject({ protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } });
    transporte.responder(transporte.ultima.id, { capabilities: {} });
    await promesa;
    expect(transporte.escritas).toHaveLength(2);
    expect(JSON.parse(transporte.escritas[1])).toMatchObject({ method: "notifications/initialized" });
  });
  it("pide la lista de herramientas", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.listar(1000);
    expect(transporte.ultima.method).toBe("tools/list");
    transporte.responder(transporte.ultima.id, { tools: [{ name: "x" }] });
    expect(await promesa).toEqual({ tools: [{ name: "x" }] });
  });
  it("concatena los bloques de texto de una llamada", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.llamar("x", { a: 1 }, 1000);
    expect(transporte.ultima.params).toEqual({ name: "x", arguments: { a: 1 } });
    transporte.responder(transporte.ultima.id, { content: [{ type: "text", text: "ho" }, { type: "text", text: "la" }] });
    expect(await promesa).toEqual({ ok: true, texto: "hola" });
  });
  it("empareja respuestas desordenadas", async () => {
    const { transporte, cliente } = montar();
    const p1 = cliente.listar(1000); const id1 = transporte.ultima.id;
    const p2 = cliente.listar(1000); const id2 = transporte.ultima.id;
    transporte.responder(id2, { orden: 2 }); transporte.responder(id1, { orden: 1 });
    expect(await p1).toEqual({ orden: 1 }); expect(await p2).toEqual({ orden: 2 });
  });
  it("ignora notificaciones y líneas sin id, y cuenta las ilegibles", async () => {
    const { transporte, cliente } = montar();
    transporte.enviar('{"jsonrpc":"2.0","method":"notifications/message","params":{}}\n');
    transporte.enviar('{"jsonrpc":"2.0","result":{}}\n');
    transporte.enviar("no es json\n");
    expect(cliente.ilegibles).toBe(1);
    const promesa = cliente.listar(1000);
    transporte.responder(transporte.ultima.id, { ok: true });
    expect(await promesa).toEqual({ ok: true });
  });
  it("falla con tiempo agotado", async () => {
    const { reloj, cliente } = montar();
    const promesa = cliente.listar(50);
    const comprobacion = expect(promesa).rejects.toMatchObject({ tipo: "tiempo" });
    reloj.disparar();
    await comprobacion;
  });
  it("corta una línea enorme y deja de despachar", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.listar(1000);
    const comprobacion = expect(promesa).rejects.toMatchObject({ tipo: "enorme" });
    transporte.enviar("a".repeat(LIMITE_LINEA + 1));
    await comprobacion;
    await expect(cliente.listar(1000)).rejects.toMatchObject({ tipo: "enorme" });
    expect(transporte.escritas).toHaveLength(1);
  });
  it("devuelve isError como resultado fallido sin lanzar", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.llamar("x", {}, 1000);
    transporte.responder(transporte.ultima.id, { isError: true, content: [{ type: "text", text: "falló" }] });
    expect(await promesa).toEqual({ ok: false, texto: "falló" });
  });
  it("cierra el transporte y falla las pendientes", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.listar(1000);
    const comprobacion = expect(promesa).rejects.toMatchObject({ tipo: "cerrado" });
    cliente.cerrar();
    await comprobacion;
    expect(transporte.cerrado).toBe(true);
    await expect(cliente.listar(1000)).rejects.toMatchObject({ tipo: "cerrado" });
  });
  it("decodifica una imagen base64", async () => {
    const { transporte, cliente } = montar();
    const datos = new Uint8Array([0, 1, 2, 255]);
    const promesa = cliente.llamar("captura", {}, 1000);
    transporte.responder(transporte.ultima.id, { content: [{ type: "image", mime: "image/png", data: btoa(String.fromCharCode(...datos)) }] });
    const resultado = await promesa;
    if (!("tipo" in resultado)) throw new Error("se esperaba una imagen");
    expect(resultado.mime).toBe("image/png"); expect(Array.from(resultado.bytes)).toEqual(Array.from(datos));
  });
  it("convierte un error RPC en excepción tipada", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.llamar("x", {}, 1000);
    const comprobacion = expect(promesa).rejects.toMatchObject({ tipo: "rpc", mensaje: "boom" });
    transporte.enviar(`${JSON.stringify({ jsonrpc: "2.0", id: transporte.ultima.id, error: { message: "boom" } })}\n`);
    await comprobacion;
  });
});
