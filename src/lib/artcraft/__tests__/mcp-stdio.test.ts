/** Pruebas de `mcp-stdio.ts` (contrato: `architecture/artcraft-y-rare.md` §3.1 y §2.1). Solo funciones puras, transporte y reloj falsos. */
import { describe, expect, it } from "vitest";
import { ClienteMcpStdio, ErrorMcp, LIMITE_LINEA, trocearLineas } from "../mcp-stdio";
import type { RelojMcp, TransporteMcp } from "../mcp-stdio";

class TransporteFalso implements TransporteMcp {
  enviadas: string[] = [];
  cerrada = false;
  private cb: ((texto: string) => void) | null = null;

  escribir(linea: string): void {
    this.enviadas.push(linea);
  }

  alRecibir(cb: (texto: string) => void): void {
    this.cb = cb;
  }

  cerrar(): void {
    this.cerrada = true;
  }

  recibir(texto: string): void {
    this.cb?.(texto);
  }
}

class RelojFalso implements RelojMcp {
  pendientes: { cb: () => void }[] = [];

  tras(_ms: number, cb: () => void): () => void {
    const item = { cb };
    this.pendientes.push(item);
    return () => {
      this.pendientes = this.pendientes.filter((x) => x !== item);
    };
  }

  disparar(): void {
    const todos = this.pendientes;
    this.pendientes = [];
    for (const p of todos) p.cb();
  }
}

const crear = (): { transporte: TransporteFalso; reloj: RelojFalso; cliente: ClienteMcpStdio } => {
  const transporte = new TransporteFalso();
  const reloj = new RelojFalso();
  return { transporte, reloj, cliente: new ClienteMcpStdio(transporte, reloj) };
};

const ultima = (t: TransporteFalso): Record<string, unknown> =>
  JSON.parse(t.enviadas[t.enviadas.length - 1]) as Record<string, unknown>;

const responder = (t: TransporteFalso, id: number, resultado: unknown): void => {
  t.recibir(`${JSON.stringify({ jsonrpc: "2.0", id, result: resultado })}\n`);
};

describe("LIMITE_LINEA y trocearLineas", () => {
  it("LIMITE_LINEA es 32 MiB", () => {
    expect(LIMITE_LINEA).toBe(32 * 1024 * 1024);
  });

  it("separa por \\n y devuelve el resto sin salto", () => {
    expect(trocearLineas("", '{"a":1}\n{"b":2}\n{"c"')).toEqual({
      lineas: ['{"a":1}', '{"b":2}'],
      resto: '{"c"',
    });
  });

  it("quita el \\r final y descarta las líneas vacías", () => {
    expect(trocearLineas("", "uno\r\n\r\n\ndos\r\n")).toEqual({ lineas: ["uno", "dos"], resto: "" });  });
});

describe("iniciar · handshake", () => {
  it("envía initialize con protocolVersion y clientInfo, y al responder manda notifications/initialized", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.iniciar();
    const enviada = ultima(transporte);
    expect(enviada).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } },
    });
    expect(transporte.enviadas).toHaveLength(1);
    responder(transporte, 1, { serverInfo: { name: "figcraft" } });
    await promesa;
    expect(transporte.enviadas).toHaveLength(2);
    expect(ultima(transporte)).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
  });

  it("`initialize` con `result` nulo → ErrorMcp de protocolo y sin notificación", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.iniciar();
    transporte.recibir(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: null })}\n`);
    await expect(promesa).rejects.toMatchObject({ tipo: "protocolo" });
    expect(transporte.enviadas).toHaveLength(1);
  });

  it("iniciar dos veces → ErrorMcp de protocolo", async () => {
    const { transporte, cliente } = crear();
    const primero = cliente.iniciar();
    responder(transporte, 1, {});
    await primero;
    await expect(cliente.iniciar()).rejects.toMatchObject({ tipo: "protocolo" });
  });
});

describe("listar y llamar", () => {
  it("listar envía tools/list con id e incluye el result en la respuesta", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    expect(ultima(transporte)).toMatchObject({ method: "tools/list", params: {} });
    responder(transporte, 1, { tools: [{ name: "list_commands" }] });
    await expect(promesa).resolves.toMatchObject({ tools: [{ name: "list_commands" }] });
  });

  it("llamar envía tools/call con name y arguments, y aplana el texto de content", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.llamar("read_range", { hoja: "datos" }, 5_000);
    expect(ultima(transporte)).toMatchObject({
      method: "tools/call",
      params: { name: "read_range", arguments: { hoja: "datos" } },
    });
    responder(transporte, 1, {
      content: [
        { type: "text", text: "a=1\n" },
        { type: "text", text: "b=2" },
      ],
    });
    await expect(promesa).resolves.toEqual({ ok: true, texto: "a=1\nb=2", imagenes: [] });
  });

  it("`isError` de la herramienta → `{ ok: false, texto }` sin excepción", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.llamar("export", {}, 5_000);
    responder(transporte, 1, { isError: true, content: [{ type: "text", text: "ruta fuera del área" }] });
    await expect(promesa).resolves.toEqual({ ok: false, texto: "ruta fuera del área", imagenes: [] });
  });

  it("imagen base64 decodificada a bytes", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.llamar("screenshot", {}, 5_000);
    responder(transporte, 1, {
      content: [{ type: "image", mimeType: "image/png", data: "AERB" }],
    });
    const r = await promesa;
    expect(r.imagenes).toEqual([
      { tipo: "imagen", mime: "image/png", bytes: new Uint8Array([0, 68, 65]) },
    ]);
  });
});

describe("desorden, notificaciones y líneas raras", () => {
  it("respuestas desordenadas: cada una desbloquea su propia petición", async () => {
    const { transporte, cliente } = crear();
    const primera = cliente.listar(5_000);
    const segunda = cliente.listar(5_000);
    responder(transporte, 2, { orden: "segunda" });
    responder(transporte, 1, { orden: "primera" });
    await expect(segunda).resolves.toMatchObject({ orden: "segunda" });
    await expect(primera).resolves.toMatchObject({ orden: "primera" });
  });

  it("una notificación del servidor sin `id` se ignora y no desbloquea nada", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    transporte.recibir(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })}\n`);
    expect(transporte.enviadas).toHaveLength(1);
    responder(transporte, 1, { tools: [] });
    await promesa;
  });

  it("una línea que no es JSON no tumba nada: cuenta en `ilegibles` y la respuesta siguiente llega", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    transporte.recibir("esto no es json\n");
    expect(cliente.ilegibles).toBe(1);
    responder(transporte, 1, { tools: [] });
    await expect(promesa).resolves.toMatchObject({ tools: [] });
  });

  it("un trozo partido a mitad de línea se reensambla con el siguiente", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    transporte.recibir('{"jsonrpc":"2.0","id":1,');
    transporte.recibir('"result":{"tools":[]}}\n');
    await expect(promesa).resolves.toMatchObject({ tools: [] });
  });

  it("error rpc del servidor → ErrorMcp tipo rpc con su mensaje", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    transporte.recibir(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "método no hallado" } })}\n`,
    );
    await expect(promesa).rejects.toMatchObject({ tipo: "rpc", message: "método no hallado" });
  });
});

describe("límites, tiempo y cierre", () => {
  it("una línea sin salto mayor que LIMITE_LINEA se corta, falla las pendientes y no se despacha más", async () => {
    const { transporte, cliente } = crear();
    const pendiente = cliente.listar(5_000);
    transporte.recibir("x".repeat(LIMITE_LINEA + 1));
    await expect(pendiente).rejects.toMatchObject({ tipo: "enorme" });
    await expect(cliente.listar()).rejects.toMatchObject({ tipo: "enorme" });
    expect(transporte.enviadas).toHaveLength(1);
  });

  it("tiempo agotado → ErrorMcp tipo tiempo y el reloj queda anulado si llega la respuesta antes", async () => {
    const { transporte, reloj, cliente } = crear();
    const promesa = cliente.listar(2_000);
    reloj.disparar();
    await expect(promesa).rejects.toMatchObject({ tipo: "tiempo" });
    const enCurso = cliente.listar(2_000);
    responder(transporte, 2, { tools: [] });
    await expect(enCurso).resolves.toMatchObject({ tools: [] });
    expect(reloj.pendientes).toHaveLength(0);
  });

  it("cerrar() con peticiones pendientes las falla con `cerrado`, cierra el transporte y ya no despacha", async () => {
    const { transporte, cliente } = crear();
    const promesa = cliente.listar(5_000);
    cliente.cerrar();
    expect(transporte.cerrada).toBe(true);
    await expect(promesa).rejects.toMatchObject({ tipo: "cerrado" });
    await expect(cliente.listar()).rejects.toMatchObject({ tipo: "cerrado" });
  });

  it("los errores rechazados son ErrorMcp y no Error común", async () => {
    const { cliente } = crear();
    cliente.cerrar();
    const error = await cliente.listar().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorMcp);
    expect((error as ErrorMcp).tipo).toBe("cerrado");
  });
});
