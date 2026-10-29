/** Cliente MCP por stdio, PURO (contrato: `architecture/artcraft-y-rare.md` §3.1 puntos 1 y 7, §2.1). Sin procesos: transporte y reloj inyectados; JSON-RPC 2.0 por líneas de hasta 32 MiB. */

export const LIMITE_LINEA = 32 * 1024 * 1024;

const TIEMPO_DEFECTO_MS = 120_000;

export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";

export class ErrorMcp extends Error {
  constructor(readonly tipo: TipoErrorMcp, mensaje: string) {
    super(mensaje);
    this.name = "ErrorMcp";
  }
}

export interface TransporteMcp {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}

export interface ImagenMcp {
  tipo: "imagen";
  mime: string;
  bytes: Uint8Array;
}

export interface ResultadoMcp {
  ok: boolean;
  texto: string;
  imagenes: ImagenMcp[];
}

interface ContenidoMcp {
  type?: unknown;
  text?: unknown;
  mimeType?: unknown;
  data?: unknown;
}

interface Pendiente {
  aceptar: (valor: unknown) => void;
  fallar: (e: ErrorMcp) => void;
  anularTiempo: () => void;
}

/** Separa por `\n`, quita el `\r` final y descarta las líneas vacías; lo último sin salto queda como resto. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const lineas = (pendiente + trozo).split("\n");
  const resto = lineas.pop() ?? "";
  return { lineas: lineas.map((l) => l.replace(/\r$/, "")).filter((l) => l !== ""), resto };
}

export class ClienteMcpStdio {
  ilegibles = 0;
  private resto = "";
  private siguienteId = 1;
  private pendientes = new Map<number, Pendiente>();
  private cerrado = false;
  private enorme = false;
  private iniciado = false;

  constructor(
    private transporte: TransporteMcp,
    private reloj: RelojMcp,
  ) {
    this.transporte.alRecibir((texto) => this.recibir(texto));
  }

  async iniciar(tiempoMs = TIEMPO_DEFECTO_MS): Promise<void> {
    if (this.iniciado) throw new ErrorMcp("protocolo", "el cliente ya se inició");
    this.iniciado = true;
    const resultado = await this.pedir<unknown>(
      "initialize",
      { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } },
      tiempoMs,
    );
    if (typeof resultado !== "object" || resultado === null)
      throw new ErrorMcp("protocolo", "initialize llegó sin `result`");
    this.transporte.escribir(`{"jsonrpc":"2.0","method":"notifications/initialized"}\n`);
  }

  listar(tiempoMs = TIEMPO_DEFECTO_MS): Promise<unknown> {
    return this.pedir<unknown>("tools/list", {}, tiempoMs);
  }

  llamar(herramienta: string, argumentos: object, tiempoMs = TIEMPO_DEFECTO_MS): Promise<ResultadoMcp> {
    return this.pedir<unknown>("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs).then(
      normalizarResultado,
    );
  }

  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.transporte.cerrar();
    this.fallarTodos(new ErrorMcp("cerrado", "el cliente se cerró con peticiones pendientes"));
  }

  private recibir(texto: string): void {
    const { lineas, resto } = trocearLineas(this.resto, texto);
    this.resto = resto;
    for (const linea of lineas) this.procesarLinea(linea);
    if (this.resto.length > LIMITE_LINEA) {
      this.resto = "";
      this.enorme = true;
      this.fallarTodos(new ErrorMcp("enorme", "una línea sin salto superó el límite de 32 MiB y se cortó"));
    }
  }

  /** Línea completa: si no es JSON cuenta como ilegible; sin `id` se ignora; con `id` resuelve o rechaza su espera. */
  private procesarLinea(linea: string): void {
    let valor: unknown;
    try {
      valor = JSON.parse(linea);
    } catch {
      this.ilegibles += 1;
      return;
    }
    if (typeof valor !== "object" || valor === null) return;
    const mensaje = valor as { id?: unknown; result?: unknown; error?: { message?: unknown } };
    if (typeof mensaje.id !== "number") return;
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id);
    pendiente.anularTiempo();
    if (mensaje.error) {
      const textoError = typeof mensaje.error.message === "string" ? mensaje.error.message : "respuesta de error";
      pendiente.fallar(new ErrorMcp("rpc", textoError));
      return;
    }
    pendiente.aceptar(mensaje.result);
  }

  private fallarTodos(e: ErrorMcp): void {
    for (const [id, pendiente] of this.pendientes) {
      this.pendientes.delete(id);
      pendiente.anularTiempo();
      pendiente.fallar(e);
    }
  }

  private pedir<T>(metodo: string, params: object, tiempoMs: number): Promise<T> {
    if (this.cerrado) return Promise.reject(new ErrorMcp("cerrado", "el cliente ya está cerrado"));
    if (this.enorme) return Promise.reject(new ErrorMcp("enorme", "no se despachan más peticiones tras cortar"));
    const id = this.siguienteId;
    this.siguienteId += 1;
    return new Promise<T>((aceptar, fallar) => {
      const anularTiempo = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        fallar(new ErrorMcp("tiempo", `${metodo}: sin respuesta en ${tiempoMs} ms`));
      });
      this.pendientes.set(id, { aceptar: (valor: unknown) => aceptar(valor as T), fallar, anularTiempo });
      this.transporte.escribir(`${JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params })}\n`);
    });
  }
}

/** Decodifica base64 a bytes con `atob` (global, sin `node:*`). */
function base64ABytes(base64: string): Uint8Array {
  const binaria = atob(base64);
  const bytes = new Uint8Array(binaria.length);
  for (let i = 0; i < binaria.length; i += 1) bytes[i] = binaria.charCodeAt(i);
  return bytes;
}

/** Aplana `result.content`: los `text` se concatenan; las imágenes van como `{ tipo, mime, bytes }`. */
function normalizarResultado(resultado: unknown): ResultadoMcp {
  const base = (typeof resultado === "object" && resultado !== null ? resultado : {}) as {
    isError?: unknown;
    content?: unknown;
  };
  const lista = Array.isArray(base.content) ? (base.content as ContenidoMcp[]) : [];
  const texto = lista.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text as string).join("");
  const imagenes: ImagenMcp[] = lista
    .filter((c) => c.type === "image" && typeof c.data === "string" && typeof c.mimeType === "string")
    .map((c) => ({ tipo: "imagen" as const, mime: c.mimeType as string, bytes: base64ABytes(c.data as string) }));
  if (base.isError === true) return { ok: false, texto, imagenes: [] };
  return { ok: true, texto, imagenes };
}
