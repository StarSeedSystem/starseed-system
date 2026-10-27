// Cliente JSON-RPC 2.0 de MCP por líneas (stdio). PURO: transporte y reloj inyectados.
// Contrato: architecture/artcraft-y-rare.md §3.1 (1 y 7) y §2.1 (líneas de hasta 32 MiB).

export const LIMITE_LINEA = 32 * 1024 * 1024;

export type ErrorMcp = {
  tipo: "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
  mensaje: string;
};

export type ImagenMcp = { tipo: "imagen"; mime: string; bytes: Uint8Array };

export type ResultadoMcp =
  | { ok: false; texto: string }
  | { ok: true; texto: string; imagenes: ImagenMcp[] };

export interface TransporteMcp {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}

/** Separa lo recibido en líneas completas; ignora «\r» finales y líneas vacías. */
export function trocearLineas(
  pendiente: string,
  trozo: string,
): { lineas: string[]; resto: string } {
  const juntado = pendiente + trozo;
  const lineas: string[] = [];
  let inicio = 0;
  while (true) {
    const i = juntado.indexOf("\n", inicio);
    if (i < 0) break;
    const linea = juntado.slice(inicio, i).replace(/\r$/, "");
    if (linea.length > 0) lineas.push(linea);
    inicio = i + 1;
  }
  return { lineas, resto: juntado.slice(inicio) };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodifica base64 a bytes sin Buffer ni node:*. */
export function decodificarBase64(texto: string): Uint8Array {
  let bits = 0;
  let n = 0;
  const salida: number[] = [];
  for (const c of texto) {
    if (c === "=" || /\s/.test(c)) continue;
    const v = B64.indexOf(c);
    if (v < 0) continue;
    n = (n << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((n >> bits) & 0xff);
    }
  }
  return new Uint8Array(salida);
}

type Pendiente = {
  resolver: (v: unknown) => void;
  rechazar: (e: ErrorMcp) => void;
  cancelarTiempo: () => void;
};

export class ClienteMcpStdio {
  private pendientes = new Map<number, Pendiente>();
  private siguienteId = 1;
  private pendienteTexto = "";
  private ilegibles = 0;
  private bloqueado = false;
  private cerrado = false;

  constructor(private transporte: TransporteMcp, private reloj: RelojMcp) {
    transporte.alRecibir((texto) => this.alLlegar(texto));
  }

  /** Letras sin JSON ni id contadas y descartadas. */
  get ilegiblesContadas(): number {
    return this.ilegibles;
  }

  /** Despacha una petición y espera su respuesta (o del tiempo agotado). */
  private pedir(metodo: string, args: Record<string, unknown>, tiempoMs: number): Promise<unknown> {
    if (this.bloqueado) return Promise.reject({ tipo: "enorme", mensaje: "flujo cortado por línea enorme" });
    const id = this.siguienteId;
    this.siguienteId += 1;
    return new Promise<unknown>((resolver, rechazar) => {
      const cancelarTiempo = this.reloj.tras(tiempoMs, () => {
        if (this.pendientes.delete(id)) rechazar({ tipo: "tiempo", mensaje: `tiempo agotado para ${metodo}` });
      });
      this.pendientes.set(id, { resolver, rechazar, cancelarTiempo });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params: args ?? {} }));
    });
  }

  /** Cierra el transporte; las peticiones pendientes fallan con «cerrado». */
  cerrar(): void {
    this.cerrado = true;
    const abiertas = [...this.pendientes.values()];
    this.pendientes.clear();
    for (const p of abiertas) {
      p.cancelarTiempo();
      p.rechazar({ tipo: "cerrado", mensaje: "cliente cerrado con peticiones pendientes" });
    }
    this.transporte.cerrar();
  }

  /** Alimenta el flujo de entrada: trocea y despacha solo respuestas con «id». */
  private alLlegar(trozo: string): void {
    const { lineas, resto } = trocearLineas(this.pendienteTexto, trozo);
    this.pendienteTexto = resto;
    if (resto.length > LIMITE_LINEA) {
      this.cercoTodos({ tipo: "enorme", mensaje: "línea sin salto que supera 32 MiB; flujo cortado" });
      return;
    }
    for (const linea of lineas) this.despachar(linea);
  }

  private cercoTodos(e: ErrorMcp): void {
    this.bloqueado = true;
    const abiertas = [...this.pendientes.values()];
    this.pendientes.clear();
    for (const p of abiertas) {
      p.cancelarTiempo();
      p.rechazar(e);
    }
  }

  /** Una línea: JSON sin id (notificación) se ignora; lo no JSON cuenta como ilegible. */
  private despachar(linea: string): void {
    let mensaje: unknown;
    try {
      mensaje = JSON.parse(linea) as unknown;
    } catch {
      this.ilegibles += 1;
      return;
    }
    const mensajeObj = (typeof mensaje === "object" && mensaje !== null ? mensaje : {}) as {
      id?: unknown;
      result?: unknown;
      error?: unknown;
    };
    if (typeof mensajeObj.id !== "number") return;
    const pendiente = this.pendientes.get(mensajeObj.id);
    if (!pendiente) return;
    this.pendientes.delete(mensajeObj.id);
    pendiente.cancelarTiempo();
    if (mensajeObj.error !== undefined) {
      pendiente.rechazar({ tipo: "rpc", mensaje: JSON.stringify(mensajeObj.error) });
      return;
    }
    pendiente.resolver(mensajeObj.result ?? null);
  }

  /** Handshake: initialize → respuesta → notifications/initialized. */
  async iniciar(): Promise<void> {
    await this.pedir(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "starseed-os", version: "1" },
      },
      10_000,
    );
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }

  /** tools/list con tiempo propio. */
  listar(tiempoMs: number): Promise<unknown> {
    return this.pedir("tools/list", {}, tiempoMs);
  }

  /** tools/call; isError llega como {ok:false} sin excepción. */
  async llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<ResultadoMcp> {
    const resultado = (await this.pedir("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs)) as {
      isError?: boolean;
      content?: unknown;
    } | null;
    const contenido = Array.isArray(resultado?.content) ? resultado.content : [];
    const partes: string[] = [];
    const imagenes: ImagenMcp[] = [];
    for (const pieza of contenido) extraerContenido(pieza, partes, imagenes);
    if (resultado?.isError === true) return { ok: false, texto: partes.join("\n") };
    return { ok: true, texto: partes.join("\n"), imagenes };
  }
}

/** Separa texto e imágenes de un fragmento de result.content. */
function extraerContenido(pieza: unknown, partes: string[], imagenes: ImagenMcp[]): void {
  const c = (typeof pieza === "object" && pieza !== null ? pieza : {}) as {
    type?: unknown;
    text?: unknown;
    mimeType?: unknown;
    data?: unknown;
  };
  if (c.type === "text" && typeof c.text === "string") partes.push(c.text);
  if (c.type === "image" && typeof c.mimeType === "string" && typeof c.data === "string")
    imagenes.push({ tipo: "imagen", mime: c.mimeType, bytes: decodificarBase64(c.data) });
}



