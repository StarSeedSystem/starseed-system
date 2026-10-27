import { describe, expect, it } from "vitest";
import { ClienteMcpStdio, LIMITE_LINEA, trocearLineas } from "../mcp-stdio";
import type { ErrorMcp, RelojMcp, TransporteMcp } from "../mcp-stdio";

class TransporteFalso implements TransporteMcp {
  escritas: string[] = [];
  privada: ((texto: string) => void) | null = null;
  cerrado = false;

  escribir(linea: string): void {
    this.escritas.push(linea);
  }

  alRecibir(cb: (texto: string) => void): void {
    this.privada = cb;
  }

  cerrar(): void {
    this.cerrado = true;
  }

  recibir(texto: string): void {
    this.privada?.(texto);
  }

  linea(id: number, cuerpo: Record<string, unknown>): void {
    this.recibir(JSON.stringify({ jsonrpc: "2.0", id, ...cuerpo }));
  }
}

class RelojFalso implements RelojMcp {
  privados: { ms: number; cb: () => void; candado: () => void }[] = [];

  tras(ms: number, cb: () => void): () => void {
    let activo = true;
    const candado = () => {
      activo = false;
    };
    this.privados.push({
      ms,
      cb: () => {
        if (activo) cb();
      },
      candado,
    });
    return candado;
  }
}

function pareja(): { transporte: TransporteFalso; reloj: RelojFalso; cliente: ClienteMcpStdio } {
  const transporte = new TransporteFalso();
  const reloj = new RelojFalso();
  return { transporte, reloj, cliente: new ClienteMcpStdio(transporte, reloj) };
}

function respuesta(id: number, cuerpo: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: "2.0", id, ...cuerpo }) + "\n";
}

function fallo(p: Promise<unknown>): Promise<ErrorMcp> {
  return p.then(
    () => {
      throw new Error("no debió resolver");
      },
    (e: ErrorMcp) => e,
  );
}

describe("trocearLineas", () => {
  it("separa por \\n, ignora \\r final y líneas vacías", () => {
    expect(trocearLineas("", "a\r\n\r\nb\r\n")).toEqual({ lineas: ["a", "b"], resto: "" });
    expect(trocearLineas("par", "cial\njunto")).toEqual({ lineas: ["parcial"], resto: "junto" });
    expect(trocearLineas("", "\n")).toEqual({ lineas: [], resto: "" });
  });
});

describe("ClienteMcpStdio", () => {
  it("LIMITE_LINEA es 32 MiB", () => {
    expect(LIMITE_LINEA).toBe(32 * 1024 * 1024);
  });

  it("handshake completo: initialize con protocolo e info, luego notifications/initialized", async () => {
    const { transporte, cliente } = pareja();
    const mano = cliente.iniciar();
    transporte.linea(1, { result: { protocolVersion: "2025-06-18", serverInfo: { name: "figcraft-cli" } } });
    await mano;
    const segunda = JSON.parse(transporte.escritas[1] ?? "{}") as { method?: string };
    expect(JSON.parse(transporte.escritas[0] ?? "{}")).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } },
    });
    expect(segunda.method).toBe("notifications/initialized");
  });

  it("listar espera el array de tools del servidor", async () => {
    const { transporte, cliente } = pareja();
    const lista = cliente.listar(1_000);
    transporte.linea(1, { result: { tools: [{ name: "run_command" }, { name: "export" }] } });
    await expect(await lista).toEqual([{ name: "run_command" }, { name: "export" }]);
  });

  it("respuestas desordenadas: cada llamada recibe la suya", async () => {
    const { transporte, cliente } = pareja();
    const primera = cliente.llamar("a", {}, 1_000);
    const segunda = cliente.llamar("b", {}, 1_000);
    transporte.linea(2, { result: { content: [{ type: "text", text: "segunda" }] } });
    transporte.linea(1, { result: { content: [{ type: "text", text: "primera" }] } });
    expect((await primera).texto).toBe("primera");
    expect((await segunda).texto).toBe("segunda");
  });

  it("los ids son secuenciales y parten de uno", async () => {
    const { transporte, cliente } = pareja();
    cliente.llamar("a", {}, 1_000);
    cliente.llamar("b", {}, 1_000);
    expect(JSON.parse(transporte.escritas[0] ?? "{}")).toMatchObject({ id: 1, method: "tools/call", params: { name: "a", arguments: {} } });
    expect(JSON.parse(transporte.escritas[1] ?? "{}")).toMatchObject({ id: 2 });
  });

  it("las notificaciones del servidor y líneas sin id se ignoran", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", method: "tools/list_changed" }) + "\n");
    transporte.recibir(JSON.stringify({ jsonrpc: "2.0", id: 99, result: {} }) + "\n");
    transporte.linea(1, { result: { content: [{ type: "text", text: "ok" }] } });
    expect((await pendiente).texto).toBe("ok");
  });

  it("una línea ilegible no tumba al cliente y se cuenta", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    transporte.recibir("esto {{ no es json\n");
    expect(cliente.ilegibles()).toBe(1);
    transporte.linea(1, { result: { content: [{ type: "text", text: "ok" }] } });
    expect((await pendiente).texto).toBe("ok");
    expect(cliente.ilegibles()).toBe(1);
  });

  it("trozo partido a mitad de línea se reensambla con lo pendiente", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    const entera = respuesta(1, { result: { content: [{ type: "text", text: "hola" }] } });
    transporte.recibir(entera.slice(0, 10));
    transporte.recibir(entera);
    expect((await pendiente).texto).toBe("hola");
  });

  it("la respuesta completa llega en trozos partidos (reensamblado real)", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    const entera = respuesta(1, { result: { content: [{ type: "text", text: "hola" }] } });
    const mitad = Math.floor(entera.length / 2);
    transporte.recibir(entera.slice(0, mitad));
    transporte.recibir(entera.slice(mitad));
    expect((await pendiente).texto).toBe("hola");
  });

  it("línea enorme cortada: las pendientes fallan y no se despacha más", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    transporte.recibir("x".repeat(LIMITE_LINEA + 1));
    const error = await fallo(pendiente);
    expect(error.tipo).toBe("enorme");
    expect(transporte.escritas).toHaveLength(1);
    const siguiente = await fallo(cliente.llamar("b", {}, 1_000));
    expect(siguiente.tipo).toBe("enorme");
    expect(cliente.ilegibles()).toBe(0);
  });

  it("una línea completada mayor que el límite también corta", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    transporte.recibir("x".repeat(LIMITE_LINEA + 1) + "\n");
    expect((await fallo(pendiente)).tipo).toBe("enorme");
  });

  it("tiempo agotado: la pendiente rechaza con tipo tiempo", async () => {
    const { transporte, cliente, reloj } = pareja();
    const pendiente = cliente.llamar("despacio", {}, 5_000);
    expect(reloj.privados.some((t) => t.ms === 5_000)).toBe(true);
    reloj.privados.filter((t) => t.ms === 5_000).forEach((t) => t.cb());
    const error = await fallo(pendiente);
    expect(error.tipo).toBe("tiempo");
    transporte.linea(1, { result: { content: [{ type: "text", text: "tarde" }] } });
    expect(cliente.ilegibles()).toBe(0);
  });

  it("result.isError=true se devuelve como ok:false con el texto de content", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("run_command", {}, 1_000);
    transporte.linea(1, { result: { isError: true, content: [{ type: "text", text: "orden vetada" }] } });
    const r = await pendiente;
    expect(r).toEqual({ ok: false, texto: "orden vetada" });
  });

  it("respuesta rpc con error: se rechaza con tipo rpc y mensaje", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    transporte.linea(1, { error: { code: -32601, message: "Método desconocido" } });
    const error = await fallo(pendiente);
    expect(error.tipo).toBe("rpc");
    expect(error.mensaje).toBe("Método desconocido");
  });

  it("cierre con pendientes: fallan con tipo cerrado y el transporte se cierra", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("a", {}, 1_000);
    cliente.cerrar();
    expect((await fallo(pendiente)).tipo).toBe("cerrado");
    expect(transporte.cerrado).toBe(true);
    const siguiente = await fallo(cliente.llamar("b", {}, 1_000));
    expect(siguiente.tipo).toBe("cerrado");
  });

  it("texto de content tipo text se concatena", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("batch", {}, 1_000);
    transporte.linea(1, {
      result: { content: [{ type: "text", text: "parte 1" }, { type: "text", text: "parte 2" }] },
    });
    expect((await pendiente).texto).toBe("parte 1\nparte 2");
  });

  it("imagen base64: mime y bytes decodificados", async () => {
    const { transporte, cliente } = pareja();
    const pendiente = cliente.llamar("screenshot", {}, 1_000);
    const base64 = btoa("sal"); // 3 bytes, 25 sin relleno raído
    transporte.linea(1, { result: { content: [{ type: "image", mimeType: "image/png", data: base64 }] } });
    const r = await pendiente;
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("imposible");
    const imagen = r.contenidos[0];
    expect(imagen).toEqual({ tipo: "imagen", mime: "image/png", bytes: Uint8Array.from([115, 97, 108]) });
  });
});

