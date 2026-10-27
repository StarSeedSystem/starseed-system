/**
 * ArtCraft · Cliente MCP por stdio (JSON-RPC 2.0, una petición por línea). Módulo PURO:
 * no abre procesos; el transporte y el reloj se inyectan, así que las pruebas usan falsos.
 * Límite de FigCraft: cada línea ≤ 32 MiB; lo que venga sin salto de línea y lo supere se corta.
 *
 * Errores `ErrorMcp`: «tiempo» (respuesta no llegó), «enorme» (línea sobre el límite, se corta y
 * no se despacha nada más), «rpc» (error JSON-RPC del servidor), «cerrado» (transporte cerrado con
 * peticiones pendientes), «protocolo» (respuesta que no casa con ninguna petición viva).
 * Un `result.isError` de la herramienta NO es excepción: se devuelve `{ ok: false, texto }`.
 */

export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export class ErrorMcp extends Error {
  tipo: TipoErrorMcp;
  constructor(tipo: TipoErrorMcp, mensaje: string) {
    super(mensaje);
    this.tipo = tipo;
  }
}

/** Límite por línea de FigCraft (§2.1): 32 MiB. */
export const LIMITE_LINEA = 32 * 1024 * 1024;

/** Transporte inyectado: escribe líneas y nos avisa de lo que llega. */
export interface TransporteMcp {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

/** Reloj inyectado para los tiempos (inyectable para poder probarlo sin dormidas). */
export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}

export interface RespuestaMcp {
  ok: boolean;
  texto: string;
  contenido?: ContenidoMcp[];
}
export interface ContenidoMcp {
  tipo: "texto" | "imagen";
  texto?: string;
  mime?: string;
  bytes?: Uint8Array;
}

interface Pendiente {
  resolver: (r: RespuestaMcp) => void;
  rechazar: (e: ErrorMcp) => void;
  cancelarTiempo: () => void;
}

/** Separa lo recibido en líneas completas y devuelve lo que quedó sin salto. Ignora «\r» final y líneas vacías. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const todo = pendiente + trozo;
  const partes = todo.split("\n");
  const resto = partes.pop() ?? "";
  const lineas: string[] = [];
  for (const p of partes) {
    const limpio = p.endsWith("\r") ? p.slice(0, -1) : p;
    if (limpio.trim().length > 0) lineas.push(limpio);
  }
  return { lineas, resto };
}

const VERSION_PROTOCOLO = "2025-06-18";

export class ClienteMcpStdio {
  private readonly t: TransporteMcp;
  private readonly reloj: RelojMcp;
  private readonly pendientes = new Map<number, Pendiente>();
  private acumulado = "";
  private siguienteId = 1;
  private cerrado = false;
  private enorme = false;
  ilegibles = 0;

  constructor(t: TransporteMcp, reloj: RelojMcp) {
    this.t = t;
    this.reloj = reloj;
    t.alRecibir((texto: string) => this.recibir(texto));
  }

  /** Procesa lo que llega del transporte: trocea en líneas y despacha respuestas. */
  private recibir(texto: string): void {
    if (this.cerrado || this.enorme) return;
    const { lineas, resto } = trocearLineas(this.acumulado, texto);
    this.acumulado = resto;
    if (resto.length > LIMITE_LINEA) {
      this.enorme = true;
      this.falloATodos(new ErrorMcp("enorme", "Una línea sin salto supera LIMITE_LINEA; se corta y no se despacha nada más."));
      return;
    }
    for (const linea of lineas) this.despachar(linea);
  }

  private despachar(linea: string): void {
    let mensaje: Record<string, unknown>;
    try {
      mensaje = JSON.parse(linea) as Record<string, unknown>;
    } catch {
      this.ilegibles++;
      return;
    }
    if (typeof mensaje.id !== "number") return;
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id);
    pendiente.cancelarTiempo();
    if (mensaje.error) {
      const e = mensaje.error as { message?: string };
      pendiente.rechazar(new ErrorMcp("rpc", e.message ?? "Error del servidor."));
      return;
    }
    const result = (mensaje.result ?? {}) as { isError?: boolean; content?: unknown };
    pendiente.resolver(leerContenido(result));
  }

  /** Envía una petición y resuelve/rechaza con la respuesta o con el tiempo agotado. */
  private pedir(metodo: string, params: Record<string, unknown>, tiempoMs: number): Promise<RespuestaMcp> {
    if (this.enorme) return Promise.reject(new ErrorMcp("enorme", "Línea enorme: no se despachan más peticiones."));
    if (this.cerrado) return Promise.reject(new ErrorMcp("cerrado", "El cliente está cerrado."));
    const id = this.siguienteId++;
    return new Promise((resolver, rechazar) => {
      const cancelarTiempo = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        rechazar(new ErrorMcp("tiempo", `Sin respuesta a «${metodo}» en ${tiempoMs} ms.`));
      });
      this.pendientes.set(id, { resolver, rechazar, cancelarTiempo });
      this.t.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }

  /** Handshake: initialize › esperar respuesta › notifications/initialized. */
  async iniciar(): Promise<RespuestaMcp> {
    const r = await this.pedir("initialize", {
      protocolVersion: VERSION_PROTOCOLO,
      clientInfo: { name: "starseed-os", version: "1" },
    }, 30_000);
    this.t.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    return r;
  }

  /** Lista de herramientas del servidor. */
  listar(tiempoMs = 30_000): Promise<RespuestaMcp> {
    return this.pedir("tools/list", {}, tiempoMs);
  }

  /** Llama a una herramienta. `result.isError` se devuelve como `{ ok: false, texto }`, sin excepción. */
  llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs = 120_000): Promise<RespuestaMcp> {
    return this.pedir("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs);
  }

  /** Cierra el transporte; las peticiones pendientes fallan con «cerrado». */
  cerrar(): void {
    this.cerrado = true;
    for (const [, p] of this.pendientes) {
      p.cancelarTiempo();
      p.rechazar(new ErrorMcp("cerrado", "El transporte se cerró con la petición pendiente."));
    }
    this.pendientes.clear();
    this.t.cerrar();
  }

  private falloATodos(e: ErrorMcp): void {
    for (const [, p] of this.pendientes) {
      p.cancelarTiempo();
      p.rechazar(e);
    }
    this.pendientes.clear();
  }
}

/** Concatena los `content` tipo texto y decodifica las imágenes base64. */
function leerContenido(result: { isError?: boolean; content?: unknown }): RespuestaMcp {
  const contenido: ContenidoMcp[] = [];
  let texto = "";
  for (const c of Array.isArray(result.content) ? result.content : []) {
    const pieza = c as { type?: string; text?: string; mimeType?: string; data?: string };
    if (pieza.type === "text" && typeof pieza.text === "string") {
      texto += pieza.text;
      contenido.push({ tipo: "texto", texto: pieza.text });
    } else if (pieza.type === "image" && typeof pieza.data === "string") {
      contenido.push({ tipo: "imagen", mime: pieza.mimeType ?? "application/octet-stream", bytes: base64ABytes(pieza.data) });
    }
  }
  return { ok: result.isError !== true, texto, contenido };
}

/** Decodifica base64 sin `node:*`: atob + charCodeAt. */
function base64ABytes(b64: string): Uint8Array {
  const limpia = b64.replace(/[\s]/g, "");
  const cruda = atob(limpia);
  const bytes = new Uint8Array(cruda.length);
  for (let i = 0; i < cruda.length; i++) bytes[i] = cruda.charCodeAt(i);
  return bytes;
}

