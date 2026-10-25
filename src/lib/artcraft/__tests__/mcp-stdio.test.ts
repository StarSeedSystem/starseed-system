import { describe, expect, it } from "vitest";
import { ClienteMcpStdio, ErrorMcp, LIMITE_LINEA, trocearLineas } from "@/lib/artcraft/mcp-stdio";

function montar() {
  const escritas: string[] = [];
  const timers = new Map<number, { ms: number; cb: () => void }>();
  let idTimer = 1;
  let recibir: ((texto: string) => void) | null = null;
  let cerrado = false;
  const transporte = {
    escribir: (linea: string) => { escritas.push(linea); },
    alRecibir: (cb: (texto: string) => void) => { recibir = cb; },
    cerrar: () => { cerrado = true; },
  };
  const reloj = { tras: (ms: number, cb: () => void) => { const id = idTimer++; timers.set(id, { ms, cb }); return () => { timers.delete(id); }; } };
  const cliente = new ClienteMcpStdio(transporte, reloj);
  return {
    cliente, escritas,
    responder: (objeto: unknown) => recibir?.(`${JSON.stringify(objeto)}\n`),
    enviar: (texto: string) => recibir?.(texto),
    disparar: (ms: number) => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.cb(); } },
    estaCerrado: () => cerrado,
  };
}
function pedido(escritas: string[], indice: number): Record<string, unknown> {
  return JSON.parse(escritas[indice]) as Record<string, unknown>;
}
function ultimo(escritas: string[]): Record<string, unknown> {
  return pedido(escritas, escritas.length - 1);
}

describe("ClienteMcpStdio", () => {
  it("trocea líneas, quita el CR final e ignora las vacías", () => {
    expect(trocearLineas("", "uno\r\n\r\ndos")).toEqual({ lineas: ["uno"], resto: "dos" });
    expect(trocearLineas("dos", " tres\n")).toEqual({ lineas: ["dos tres"], resto: "" });
  });
  it("hace el handshake completo", async () => {
    const m = montar();
    const inicio = m.cliente.iniciar();
    expect(pedido(m.escritas, 0)).toMatchObject({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } } });
    m.responder({ jsonrpc: "2.0", id: 1, result: {} });
    await inicio;
    expect(ultimo(m.escritas)).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
  });
});
