/** Pruebas del cliente MCP por stdio (art §2.1 y §3.1), módulo puro. */
import { describe, it, expect } from "vitest";
import { ClienteMcpStdio, trocearLineas, LIMITE_LINEA, ErrorMcp } from "../mcp-stdio";

class RelojFalso {
  private tareas: { ms: number; cb: () => void; viva: boolean }[] = [];
  tras(ms: number, cb: () => void) { const t = { ms, cb, viva: true }; this.tareas.push(t); return () => { t.viva = false; }; }
  avanzar(ms: number) { for (const t of [...this.tareas]) if (t.viva && t.ms <= ms) { t.viva = false; t.cb(); } }
}

class TransporteFalso {
  escritos: string[] = []; cerrado = false; private receptor?: (t: string) => void;
  alRecibir(cb: (t: string) => void) { this.receptor = cb; }
  escribir(l: string) { this.escritos.push(l); }
  cerrar() { this.cerrado = true; }
  enviar(t: string) { this.receptor?.(t); }
  enviarJson(o: unknown) { this.enviar(JSON.stringify(o) + "\n"); }
  id(i = 0): number { return (JSON.parse(this.escritos[i]) as { id: number }).id; }
}

function montar() {
  const transporte = new TransporteFalso(); const reloj = new RelojFalso();
  return { transporte, reloj, cliente: new ClienteMcpStdio(transporte, reloj) };
}
function responder(transporte: TransporteFalso, id: number, result: unknown) {
  transporte.enviarJson({ jsonrpc: "2.0", id, result });
}

describe("trocearLineas", () => {
  it("separa por saltos e ignora \\r y líneas vacías", () => {
    expect(trocearLineas("ini\r\n", "uno\n\ndos\r\nresto")).toEqual({ lineas: ["ini", "uno", "dos"], resto: "resto" });
  });
  it("conserva el resto partido a mitad de línea", () => {
    expect(trocearLineas("hola", " mundo\notra")).toEqual({ lineas: ["hola mundo"], resto: "otra" });
  });
});

describe("ClienteMcpStdio", () => {
  it("hace el handshake completo", async () => {
    const { transporte, cliente } = montar();
    const promesa = cliente.iniciar();
    const enviado = JSON.parse(transporte.escritos[0]) as { method: string; params: unknown };
    expect(enviado.method).toBe("initialize");
    expect(enviado.params).toEqual({ protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } });
    responder(transporte, transporte.id(0), { protocolVersion: "2025-06-18" });
    await promesa;
    expect(JSON.parse(transporte.escritos[1])).toMatchObject({ method: "notifications/initialized" });
  });
  it("resuelve respuestas desordenadas por id", async () => {
    const { transporte, cliente } = montar();
    const uno = cliente.listar(1000); const dos = cliente.listar(1000);
    responder(transporte, transporte.id(1), { tools: ["dos"] });
    responder(transporte, transporte.id(0), { tools: ["uno"] });
    await expect(uno).resolves.toEqual({ tools: ["uno"] });
    await expect(dos).resolves.toEqual({ tools: ["dos"] });
  });
  it("ignora notificaciones y líneas sin id", () => {
    const { transporte, cliente } = montar();
    transporte.enviarJson({ jsonrpc: "2.0", method: "notifications/progress", params: {} });
    transporte.enviarJson({ jsonrpc: "2.0", result: {} });
    expect(cliente.ilegibles).toBe(0);
  });
  it("cuenta una línea que no es JSON", () => {
    const { transporte, cliente } = montar();
    transporte.enviar("no es json\n");
    expect(cliente.ilegibles).toBe(1);
  });
  it("corta una línea enorme y no despacha más", async () => {
    const { transporte, cliente } = montar();
    const pendiente = cliente.listar(1000);
    transporte.enviar("a".repeat(LIMITE_LINEA + 1));
    await expect(pendiente).rejects.toMatchObject({ tipo: "enorme" });
    const antes = transporte.escritos.length;
    await expect(cliente.listar(1000)).rejects.toMatchObject({ tipo: "enorme" });
    expect(transporte.escritos.length).toBe(antes);
  });
  it("rechaza por tiempo agotado", async () => {
    const { reloj, cliente } = montar(); const pendiente = cliente.listar(50);
    reloj.avanzar(50);
    await expect(pendiente).rejects.toBeInstanceOf(ErrorMcp);
    await expect(pendiente).rejects.toMatchObject({ tipo: "tiempo" });
  });
  it("devuelve isError como resultado y no como excepción", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.llamar("x", {}, 1000);
    responder(transporte, transporte.id(0), { isError: true, content: [{ type: "text", text: "falló" }] });
    await expect(pendiente).resolves.toEqual({ ok: false, texto: "falló" });
  });
  it("falla las pendientes al cerrar", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.listar(1000);
    cliente.cerrar();
    await expect(pendiente).rejects.toMatchObject({ tipo: "cerrado" });
    expect(transporte.cerrado).toBe(true);
  });
  it("reconstruye una respuesta partida a mitad de línea", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.listar(1000);
    const linea = JSON.stringify({ jsonrpc: "2.0", id: transporte.id(0), result: { tools: [] } });
    transporte.enviar(linea.slice(0, 12)); transporte.enviar(linea.slice(12) + "\n");
    await expect(pendiente).resolves.toEqual({ tools: [] });
  });
  it("decodifica una imagen base64", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.llamar("screenshot", {}, 1000);
    responder(transporte, transporte.id(0), { content: [{ type: "image", mime: "image/png", data: "aG9sYQ==" }] });
    await expect(pendiente).resolves.toEqual({ tipo: "imagen", mime: "image/png", bytes: new Uint8Array([104, 111, 108, 97]) });
  });
  it("convierte un error JSON-RPC en ErrorMcp rpc", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.llamar("x", {}, 1000);
    transporte.enviarJson({ jsonrpc: "2.0", id: transporte.id(0), error: { message: "sin permiso" } });
    await expect(pendiente).rejects.toMatchObject({ tipo: "rpc", mensaje: "sin permiso" });
  });
  it("concatena los textos de una llamada correcta", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.llamar("x", {}, 1000);
    responder(transporte, transporte.id(0), { content: [{ type: "text", text: "uno " }, { type: "text", text: "dos" }] });
    await expect(pendiente).resolves.toEqual({ ok: true, texto: "uno dos" });
  });
  it("marca protocolo si la respuesta no trae result", async () => {
    const { transporte, cliente } = montar(); const pendiente = cliente.listar(1000);
    transporte.enviarJson({ jsonrpc: "2.0", id: transporte.id(0) });
    await expect(pendiente).rejects.toMatchObject({ tipo: "protocolo" });
  });
});
