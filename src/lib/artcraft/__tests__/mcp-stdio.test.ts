import { describe, it, expect } from "vitest";
import {
  ClienteMcpStdio,
  ErrorMcp,
  LIMITE_LINEA,
  trocearLineas,
  type RelojMcp,
  type TransporteMcpStdio,
} from "../mcp-stdio";

class TransporteFalso implements TransporteMcpStdio {
  readonly enviadas: string[] = [];
  cerrado = false;
  private receptor: ((texto: string) => void) | null = null;
  escribir(linea: string): void {
    this.enviadas.push(linea);
  }
  alRecibir(cb: (texto: string) => void): void {
    this.receptor = cb;
  }
  cerrar(): void {
    this.cerrado = true;
  }
  recibir(texto: string): void {
    this.receptor?.(texto);
  }
  linea(n: number): Record<string, unknown> {
    return JSON.parse(this.enviadas[n]) as Record<string, unknown>;
  }
}

class RelojFalso implements RelojMcp {
  private tareas: Array<{ ms: number; cb: () => void; cancelada: boolean }> = [];
  tras(ms: number, cb: () => void): () => void {
    const tarea = { ms, cb, cancelada: false };
    this.tareas.push(tarea);
    return () => {
      tarea.cancelada = true;
    };
  }
  avanzar(ms: number): void {
    for (const tarea of this.tareas) {
      if (!tarea.cancelada && tarea.ms <= ms) {
        tarea.cancelada = true;
        tarea.cb();
      }
    }
  }
}

const respuesta = (id: number, result: unknown): string =>
  JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";

const crear = (): { transporte: TransporteFalso; reloj: RelojFalso; cliente: ClienteMcpStdio } => {
  const transporte = new TransporteFalso();
  const reloj = new RelojFalso();
  return { transporte, reloj, cliente: new ClienteMcpStdio(transporte, reloj) };
};

describe("trocearLineas", () => {
  it("separa las líneas completas y conserva el resto sin salto", () => {
    expect(trocearLineas("par", "te\ncompleta\nresto")).toEqual({
      lineas: ["parte", "completa"],
      resto: "resto",
    });
  });

  it("ignora el retorno de carro final y las líneas vacías", () => {
    expect(trocearLineas("", "a\r\n\n\r\nb\n")).toEqual({ lineas: ["a", "b"], resto: "" });
  });
});

describe("ClienteMcpStdio", () => {
  it("hace el handshake completo y manda la notificación initialized", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.iniciar(1000);
    const init = transporte.linea(0);
    expect(init.method).toBe("initialize");
    expect(init.id).toBe(1);
    expect(init.params).toMatchObject({
      protocolVersion: "2025-06-18",
      clientInfo: { name: "starseed-os", version: "1" },
    });
    transporte.recibir(respuesta(1, { protocolVersion: "2025-06-18", serverInfo: { name: "figcraft" } }));
    const resultado = await promesa;
    expect(resultado.serverInfo?.name).toBe("figcraft");
    expect(transporte.linea(1)).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
  });

  it("numera los ids de forma secuencial", () => {
    const { transporte, cliente } = crear();
    void cliente.listar(1000);
    void cliente.listar(1000);
    expect(transporte.linea(0).id).toBe(1);
    expect(transporte.linea(1).id).toBe(2);
  });

  it("empareja respuestas desordenadas por id", async () => {
    const { transporte, cliente } = crear();
    const primera = cliente.listar(1000);
    const segunda = cliente.listar(1000);
    transporte.recibir(respuesta(2, { tools: [{ name: "segunda" }] }));
    transporte.recibir(respuesta(1, { tools: [{ name: "primera" }] }));
    await expect(primera).resolves.toEqual({ tools: [{ name: "primera" }] });
    await expect(segunda).resolves.toEqual({ tools: [{ name: "segunda" }] });
  });

  it("ignora notificaciones y líneas sin id", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} }) + "\n");
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", result: { tools: [] } }) + "\n");
    expect(cliente.ilegibles).toBe(0);
    transporte.recibir(respuesta(1, { tools: [] }));
    await expect(pendiente).resolves.toEqual({ tools: [] });
  });

  it("cuenta las líneas ilegibles y sigue funcionando", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    transporte.recibir("esto no es json\n");
    expect(cliente.ilegibles).toBe(1);
    transporte.recibir(respuesta(1, { tools: [] }));
    await expect(pendiente).resolves.toEqual({ tools: [] });
  });

  it("corta una línea enorme y no despacha más peticiones", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    transporte.recibir("x".repeat(LIMITE_LINEA + 1));
    await expect(pendiente).rejects.toBeInstanceOf(ErrorMcp);
    await expect(pendiente).rejects.toMatchObject({ tipo: "enorme" });
    const antes = transporte.enviadas.length;
    await expect(cliente.listar(1000)).rejects.toMatchObject({ tipo: "enorme" });
    expect(transporte.enviadas.length).toBe(antes);
  });

  it("falla con tiempo agotado", async () => {
    const { reloj, cliente } = crear();
    const pendiente = cliente.listar(5000);
    reloj.avanzar(5000);
    await expect(pendiente).rejects.toMatchObject({ tipo: "tiempo" });
  });

  it("devuelve ok false cuando la herramienta marca isError", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.llamar("x", {}, 1000);
    expect(transporte.linea(0)).toMatchObject({ method: "tools/call", params: { name: "x", arguments: {} } });
    transporte.recibir(respuesta(1, { isError: true, content: [{ type: "text", text: "falló" }] }));
    await expect(pendiente).resolves.toEqual({
      ok: false,
      texto: "falló",
      contenido: [{ tipo: "texto", texto: "falló" }],
    });
  });

  it("al cerrar falla las pendientes y cierra el transporte", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    cliente.cerrar();
    await expect(pendiente).rejects.toMatchObject({ tipo: "cerrado" });
    expect(transporte.cerrado).toBe(true);
    await expect(cliente.listar(1000)).rejects.toMatchObject({ tipo: "cerrado" });
  });

  it("junta una respuesta partida a mitad de línea", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    const texto = respuesta(1, { tools: [{ name: "partida" }] });
    const corte = Math.floor(texto.length / 2);
    transporte.recibir(texto.slice(0, corte));
    transporte.recibir(texto.slice(corte));
    await expect(pendiente).resolves.toEqual({ tools: [{ name: "partida" }] });
  });

  it("decodifica las imágenes base64", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.llamar("captura", {}, 1000);
    transporte.recibir(respuesta(1, { content: [{ type: "image", mimeType: "image/png", data: "aG9sYQ==" }] }));
    const resultado = await pendiente;
    expect(resultado.ok).toBe(true);
    expect(resultado.contenido).toEqual([
      { tipo: "imagen", mime: "image/png", bytes: new Uint8Array([104, 111, 108, 97]) },
    ]);
  });

  it("concatena los textos del contenido", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.llamar("x", {}, 1000);
    transporte.recibir(respuesta(1, { content: [{ type: "text", text: "hola " }, { type: "text", text: "mundo" }] }));
    const resultado = await pendiente;
    expect(resultado.texto).toBe("hola mundo");
  });

  it("convierte un error JSON-RPC en ErrorMcp de tipo rpc", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "No existe" } }) + "\n");
    await expect(pendiente).rejects.toMatchObject({ tipo: "rpc", mensaje: "No existe" });
  });

  it("rechaza una respuesta con id sin result ni error", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(1000);
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", id: 1 }) + "\n");
    await expect(pendiente).rejects.toMatchObject({ tipo: "protocolo" });
  });
});
