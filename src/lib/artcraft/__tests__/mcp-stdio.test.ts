/** Pruebas del cliente MCP por stdio: transporte y reloj falsos, sin red ni procesos (art §2.1). */
import { describe, it, expect } from "vitest";
import {
  LIMITE_LINEA,
  trocearLineas,
  ClienteMcpStdio,
  type TransporteMcp,
  type RelojMcp,
  type ErrorMcp,
} from "../mcp-stdio";

class TransporteFalso implements TransporteMcp {
  escritas: string[] = [];
  cerradas = 0;
  private receptor: (texto: string) => void = () => {};
  escribir(linea: string): void {
    this.escritas.push(linea);
  }
  alRecibir(cb: (texto: string) => void): void {
    this.receptor = cb;
  }
  cerrar(): void {
    this.cerradas++;
  }
  recibe(texto: string): void {
    this.receptor(texto);
  }
  ultima(): Record<string, unknown> {
    return JSON.parse(this.escritas[this.escritas.length - 1]);
  }
}

class RelojFalso implements RelojMcp {
  private temporizadores: Array<{ ms: number; cb: () => void; vivo: boolean }> = [];
  tras(ms: number, cb: () => void): () => void {
    const t = { ms, cb, vivo: true };
    this.temporizadores.push(t);
    return () => {
      t.vivo = false;
    };
  }
  avanza(ms: number): void {
    for (const t of this.temporizadores) {
      if (t.vivo && t.ms <= ms) {
        t.vivo = false;
        t.cb();
      }
    }
  }
}

function respuesta(id: number, cuerpo: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: "2.0", id, ...cuerpo }) + "\n";
}

function tipoDe(e: unknown): ErrorMcp["tipo"] {
  return (e as Error & ErrorMcp).tipo;
}

describe("trocearLineas", () => {
  it("separa por salto y devuelve el resto", () => {
    expect(trocearLineas("", "a\nb\nc")).toEqual({ lineas: ["a", "b"], resto: "c" });
  });

  it("ignora \\r final y líneas vacías", () => {
    expect(trocearLineas("", "a\r\n\r\nb\n")).toEqual({ lineas: ["a", "b"], resto: "" });
  });

  it("continúa a mitad de línea acumulando pendiente", () => {
    const paso1 = trocearLineas("", '{"id":1,"res');
    expect(paso1).toEqual({ lineas: [], resto: '{"id":1,"res' });
    const paso2 = trocearLineas(paso1.resto, 'ult":"ok"}\n');
    expect(paso2.lineas).toEqual(['{"id":1,"result":"ok"}']);
    expect(paso2.resto).toBe("");
  });
});

describe("ClienteMcpStdio · handshake", () => {
  it("handshake completo: initialize y luego notifications/initialized", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.iniciar();
    const peticion = t.ultima();
    expect(peticion["method"]).toBe("initialize");
    expect(peticion["protocolVersion"]).toBeUndefined();
    const params = peticion["params"] as Record<string, unknown>;
    expect(params["protocolVersion"]).toBe("2025-06-18");
    expect(params["clientInfo"]).toEqual({ name: "starseed-os", version: "1" });
    expect(peticion["id"]).toBe(1);
    t.recibe(respuesta(1, { result: { serverInfo: { name: "figcraft", version: "0.10.0" } } }));
    await promesa;
    expect(t.ultima()["method"]).toBe("notifications/initialized");
    expect(t.ultima()["id"]).toBeUndefined();
  });

  it("initialize con result inválido falla de protocolo", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    let fallo: unknown = null;
    const promesa = c.iniciar().catch((e) => (fallo = e));
    t.recibe(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }) + "\n");
    await promesa;
    expect(tipoDe(fallo)).toBe("protocolo");
  });
});

describe("ClienteMcpStdio · respuestas", () => {
  it("listar devuelve tools", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.listar(1000);
    expect(t.ultima()["method"]).toBe("tools/list");
    t.recibe(respuesta(1, { result: { tools: [{ name: "read_range" }] } }));
    const herramientas = await promesa;
    expect(herramientas).toEqual([{ name: "read_range" }]);
  });

  it("respuestas desordenadas: cada promesa recibe su respuesta", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const p1 = c.listar(1000);
    const p2 = c.listar(1000);
    expect(t.ultima()["id"]).toBe(2);
    t.recibe(respuesta(2, { result: { tools: [{ name: "segunda" }] } }));
    t.recibe(respuesta(1, { result: { tools: [{ name: "primera" }] } }));
    expect(await p1).toEqual([{ name: "primera" }]);
    expect(await p2).toEqual([{ name: "segunda" }]);
  });

  it("notificación del servidor sin id se ignora", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.listar(1000);
    t.recibe(JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } }) + "\n");
    t.recibe(respuesta(1, { result: { tools: [] } }));
    expect(await promesa).toEqual([]);
  });

  it("línea que no es JSON se cuenta en ilegibles y no tumba al cliente", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.listar(1000);
    t.recibe("<html>error del servidor</html>\n");
    t.recibe(respuesta(1, { result: { tools: [] } }));
    expect(await promesa).toEqual([]);
    expect(c.cuentaIlegibles).toBe(1);
  });
});

describe("ClienteMcpStdio · errores", () => {
  it("tiempo agotado rechaza con tipo tiempo", async () => {
    const reloj = new RelojFalso();
    const c = new ClienteMcpStdio(new TransporteFalso(), reloj);
    let fallo: unknown = null;
    const promesa = c.llamar("export", {}, 120000).catch((e) => (fallo = e));
    reloj.avanza(120000);
    await promesa;
    expect(tipoDe(fallo)).toBe("tiempo");
    expect((fallo as Error).message).toContain("sin respuesta");
  });

  it(" respuesta rpc con error rechaza con tipo rpc", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    let fallo: unknown = null;
    const promesa = c.llamar("run_command", { comando: "collab.share" }, 1000).catch((e) => (fallo = e));
    t.recibe(respuesta(1, { error: { code: -32602, message: "comando vetado" } }));
    await promesa;
    expect(tipoDe(fallo)).toBe("rpc");
    expect((fallo as Error).message).toBe("comando vetado");
  });

  it("línea enorme corta al cliente: no se despachan más peticiones", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    let falloUno: unknown = null;
    const pendiente = c.listar(1000).catch((e) => (falloUno = e));
    t.recibe("x".repeat(LIMITE_LINEA + 1));
    await pendiente;
    expect(tipoDe(falloUno)).toBe("enorme");
    const escritas = t.escritas.length;
    let falloDos: unknown = null;
    await c.listar(1000).catch((e) => (falloDos = e));
    expect(tipoDe(falloDos)).toBe("enorme");
    expect(t.escritas.length).toBe(escritas);
  });

  it("cierre con peticiones pendientes falla con cerrado y ya no escribe", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    let fallo: unknown = null;
    const pendiente = c.listar(1000).catch((e) => (fallo = e));
    c.cerrar();
    await pendiente;
    expect(tipoDe(fallo)).toBe("cerrado");
    expect(t.cerradas).toBe(1);
    let falloDos: unknown = null;
    await c.listar(1000).catch((e) => (falloDos = e));
    expect(tipoDe(falloDos)).toBe("cerrado");
    expect(JSON.parse(t.escritas[t.escritas.length - 1])["method"]).toBe("tools/list");
  });
});

describe("ClienteMcpStdio · llamar", () => {
  it("isError true se devuelve como ok false, sin excepción", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.llamar("export", { ruta: "salida/x.svg" }, 1000);
    t.recibe(
      respuesta(1, {
        result: { isError: true, content: [{ type: "text", text: "ruta fuera del directorio" }] },
      })
    );
    const r = await promesa;
    expect(r.ok).toBe(false);
    expect(r.texto).toBe("ruta fuera del directorio");
    expect(r.imagenes).toEqual([]);
  });

  it("varios fragmentos text se concatenan", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.llamar("inspect_document", {}, 1000);
    t.recibe(
      respuesta(1, {
        result: {
          content: [
            { type: "text", text: "primer" },
            { type: "text", text: "segundo" },
          ],
        },
      })
    );
    const r = await promesa;
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("primer\nsegundo");
  });

  it("imagen con base64 se decodifica a bytes", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.llamar("screenshot", {}, 1000);
    t.recibe(
      respuesta(1, {
        result: { content: [{ type: "image", mimeType: "image/png", data: "aGVsbG8=" }] },
      })
    );
    const r = await promesa;
    expect(r.ok).toBe(true);
    expect(r.imagenes).toHaveLength(1);
    expect(r.imagenes[0].tipo).toBe("imagen");
    expect(r.imagenes[0].mime).toBe("image/png");
    expect(Array.from(r.imagenes[0].bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("contenido vacío devuelve texto vacío", async () => {
    const t = new TransporteFalso();
    const c = new ClienteMcpStdio(t, new RelojFalso());
    const promesa = c.llamar("undo", {}, 1000);
    t.recibe(respuesta(1, { result: {} }));
    const r = await promesa;
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("");
  });
});
