/** Pruebas de `mcp-stdio.ts` (contrato: `architecture/artcraft-y-rare.md` §2.1 y §3.1). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { bytesBase64, ClienteMcpStdio, contenidoDe, LIMITE_LINEA, trocearLineas } from "../mcp-stdio";
import type { RelojMcp, TransporteMcp } from "../mcp-stdio";

interface Temporizador { ms: number; cb: () => void; activo: boolean }

/** Transporte falso: recuerda lo escrito, deja disparar la recepción y contabiliza el cierre. */
class TransporteFalso implements TransporteMcp {
  escritas: string[] = [];
  cb: ((texto: string) => void) | null = null;
  cerrado = false;
  escribir(linea: string): void { this.escritas.push(linea); }
  alRecibir(cb: (texto: string) => void): void { this.cb = cb; }
  cerrar(): void { this.cerrado = true; }
  recibir(texto: string): void { this.cb?.(texto); }
  /** El servidor escribe LÍNEAS: cada respuesta acaba en `\n` (§2.1, JSON-RPC 2.0 por líneas). */
  respuesta(id: number, result: unknown): void {
    this.recibir(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }
}

/** Reloj falso: los temporizadores solo suenan cuando la prueba los dispara. */
class RelojFalso implements RelojMcp {
  timers: Temporizador[] = [];
  tras(ms: number, cb: () => void): () => void {
    const t: Temporizador = { ms, cb, activo: true };
    this.timers.push(t);
    return () => { t.activo = false; };
  }
  disparar(indice: number): void {
    const t = this.timers[indice];
    if (t?.activo) t.cb();
  }
}

const par = () => {
  const t = new TransporteFalso();
  const r = new RelojFalso();
  return { t, r, c: new ClienteMcpStdio(t, r) };
};

type RespuestaPromesa<T> = Promise<T>;

const espera = async <T>(p: RespuestaPromesa<T>): Promise<T> => await p;

describe("trocearLineas", () => {
  it("separa por \\n, quita el \\r final e ignora las líneas vacías", () => {
    expect(trocearLineas("a\r\n\r\nb\n", "c")).toEqual({ lineas: ["a", "b"], resto: "c" });
  });
  it("un trozo sin \\n no suelta líneas: todo se queda en el resto", () => {
    expect(trocearLineas("", "media línea")).toEqual({ lineas: [], resto: "media línea" });
  });
});

describe("bytesBase64", () => {
  it("cuenta los bytes decodificados, con y sin relleno", () => {
    expect(bytesBase64("")).toBe(0);
    expect(bytesBase64("aGVsbG8=")).toBe(5); // «hello»
    expect(bytesBase64("QQ==")).toBe(1); // «A»
    expect(bytesBase64("QUI=")).toBe(2); // «AB»
  });
});

describe("contenidoDe", () => {
  it("concatena los textos y junta las imágenes con sus bytes decodificados", () => {
    const r = contenidoDe({
      content: [
        { type: "text", text: "uno" },
        { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
        { type: "resource", uri: "figcraft://" },
        { type: "text", text: "dos" },
      ],
    });
    expect(r).toEqual({
      ok: true,
      texto: "uno\ndos",
      imagenes: [{ tipo: "imagen", mime: "image/png", bytes: 5 }],
    });
  });
  it("isError true llega como ok false, sin excepción", () => {
    expect(contenidoDe({ isError: true, content: [{ type: "text", text: "Falló" }] })).toEqual({
      ok: false,
      texto: "Falló",
      imagenes: [],
    });
  });
});

describe("ClienteMcpStdio · handshake y despacho", () => {
  it("iniciar manda initialize con versión y cliente, y tras la respuesta manda la notificación", async () => {
    const { t, c } = par();
    const p = espera(c.iniciar());
    const primero = JSON.parse(t.escritas[0]) as Record<string, unknown>;
    expect(primero).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } },
    });
    t.respuesta(1, { serverInfo: { name: "figcraft", version: "0.10.0" }, capabilities: {} });
    await p;
    const notificacion = JSON.parse(t.escritas[1]) as Record<string, unknown>;
    expect(notificacion).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notificacion.id).toBeUndefined();
  });

  it("los ids van secuenciales: initialize 1, luego list y call", async () => {
    const { t, c } = par();
    const p = espera(c.listar(1_000));
    expect((JSON.parse(t.escritas[0]) as { id: number }).id).toBe(1);
    t.respuesta(1, { tools: [] });
    await p;
    const p2 = espera(c.llamar("inspect_document", { path: "entrada/x.fig" }, 1_000));
    const crudo = JSON.parse(t.escritas[1]) as { id: number; params: Record<string, unknown> };
    expect(crudo.id).toBe(2);
    expect(crudo.params).toEqual({ name: "inspect_document", arguments: { path: "entrada/x.fig" } });
    t.respuesta(2, { isError: false });
    await p2;
  });

  it("respuestas desordenadas: cada id recibe la suya", async () => {
    const { t, c } = par();
    const p1 = espera(c.llamar("a", {}, 1_000));
    const p2 = espera(c.llamar("b", {}, 1_000));
    t.respuesta(2, { content: [{ type: "text", text: "segunda" }] });
    t.respuesta(1, { content: [{ type: "text", text: "primera" }] });
    expect((await p1).texto).toBe("primera");
    expect((await p2).texto).toBe("segunda");
  });

  it("la notificación del servidor y la línea ilegible se ignoran sin tumbar al cliente", async () => {
    const { t, c } = par();
    const p = espera(c.listar(1_000));
    t.recibir("{\"jsonrpc\":\"2.0\",\"method\":\"not/algo\"}\n");
    t.recibir("esta línea no es json");
    t.recibir('{"jsonrpc":"2.0","id":"texto","result":{}}\n');
    t.respuesta(1, { content: [{ type: "text", text: "llegó" }] });
    expect((await p).texto).toBe("llegó");
    expect(c.ilegibles).toBe(1); // solo la línea que no era JSON; el resto se ignora sin romper
  });
});

describe("ClienteMcpStdio · límites", () => {
  it("el tiempo agotado devuelve un ErrorMcp «tiempo» y la respuesta tardía ya no hace nada", async () => {
    const { t, r, c } = par();
    const p = espera(c.llamar("lento", {}, 5_000));
    r.disparar(0);
    await expect(p).rejects.toEqual({ tipo: "tiempo", mensaje: expect.stringContaining("5000") });
    // La respuesta que llega después no tiene a quién: ninguna escritura nueva, sin error suelto.
    t.respuesta(1, { content: [] });
    expect(t.escritas).toHaveLength(1);
  });

  it("una línea sin salto mayor que 32 MiB corta al cliente y ya no se despacha nada", async () => {
    const { t, c } = par();
    const p = espera(c.listar(10_000));
    t.recibir("x".repeat(LIMITE_LINEA + 1));
    await expect(p).rejects.toEqual({ tipo: "enorme", mensaje: expect.stringContaining("32 MiB") });
    expect(c.roto?.tipo).toBe("enorme");
    expect(t.escritas).toHaveLength(1);
    await expect(espera(c.llamar("otra", {}, 10_000))).rejects.toMatchObject({ tipo: "enorme" });
    expect(t.escritas).toHaveLength(1);
  });

  it("trozos partidos a mitad de línea se recomponen y la respuesta sale igual", async () => {
    const { t, c } = par();
    const p = espera(c.listar(2_000));
    t.recibir('{"jsonrpc":"2.0","i');
    t.recibir('d":1,"result":{"content":[{"type":"text","text":"completa"}]}}\n');
    expect((await p).texto).toBe("completa");
  });

  it("cierre con peticiones en vuelo: cada una falla con «cerrado» y el transporte se cierra", async () => {
    const { t, c } = par();
    const p = espera(c.llamar("quedada", {}, 5_000));
    c.cerrar();
    await expect(p).rejects.toMatchObject({ tipo: "cerrado" });
    expect(t.cerrado).toBe(true);
  });
});

describe("ClienteMcpStdio · resultado de herramientas", () => {
  it("isError del servidor llega como ok false, no como excepción", async () => {
    const { t, c } = par();
    const p = espera(c.llamar("export", {}, 1_000));
    t.respuesta(1, { isError: true, content: [{ type: "text", text: "La exportación falló" }] });
    const r = await p;
    expect(r).toEqual({ ok: false, texto: "La exportación falló", imagenes: [] });
  });

  it("un error rpc devuelto por el servidor rechaza con tipo «rpc» y su mensaje", async () => {
    const { t, c } = par();
    const p = espera(c.llamar("desconocida", {}, 1_000));
    t.recibir(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "No existe la herramienta." } }) + "\n");
    await expect(p).rejects.toEqual({ tipo: "rpc", mensaje: "No existe la herramienta." });
  });

  it("una imagen del resultado llega con sus bytes decodificados", async () => {
    const { t, c } = par();
    const p = espera(c.llamar("render", {}, 1_000));
    t.respuesta(1, { content: [{ type: "image", mimeType: "image/svg+xml", data: "aGVsbG8=" }] });
    const r = await p;
    expect(r.imagenes).toEqual([{ tipo: "imagen", mime: "image/svg+xml", bytes: 5 }]);
    expect(r.ok).toBe(true);
  });
});



