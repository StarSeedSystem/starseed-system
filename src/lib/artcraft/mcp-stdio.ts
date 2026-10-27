/**
 * Cliente MCP por stdio (JSON-RPC 2.0) — PURO.
 * Contrato: architecture/artcraft-y-rare.md §2.1 y §3.1.
 * No abre procesos: el transporte y el reloj se inyectan.
 */
export const LIMITE_LINEA = 32 * 1024 * 1024;
const TIEMPO_INICIO_MS = 30_000;

export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";

export class ErrorMcp extends Error {
  readonly tipo: TipoErrorMcp;
  readonly mensaje: string;
  constructor(tipo: TipoErrorMcp, mensaje: string) {
    super(mensaje);
    this.name = "ErrorMcp";
    this.tipo = tipo;
    this.mensaje = mensaje;
  }
}

export interface TransporteMcpStdio {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}

export interface HerramientaMcpListada {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ListaMcp {
  tools: HerramientaMcpListada[];
}

export interface InicializacionMcp {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: { name?: string; version?: string };
}

export type ContenidoMcp =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; mime: string; bytes: Uint8Array };

export interface LlamadaMcp {
  ok: boolean;
  texto: string;
  contenido: ContenidoMcp[];
}

interface Pendiente {
  resolver: (valor: unknown) => void;
  rechazar: (error: ErrorMcp) => void;
  cancelar: () => void;
}

export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes
    .map((linea) => (linea.endsWith("\r") ? linea.slice(0, -1) : linea))
    .filter((linea) => linea.length > 0);
  return { lineas, resto };
}

function decodificarBase64(datos: string): Uint8Array {
  try {
    const binario = atob(datos);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

function interpretarLlamada(resultado: unknown): LlamadaMcp {
  const objeto = (typeof resultado === "object" && resultado !== null ? resultado : {}) as Record<string, unknown>;
  const contenido: ContenidoMcp[] = [];
  let texto = "";
  const items = Array.isArray(objeto.content) ? objeto.content : [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const pieza = item as Record<string, unknown>;
    if (pieza.type === "text" && typeof pieza.text === "string") {
      texto += pieza.text;
      contenido.push({ tipo: "texto", texto: pieza.text });
    } else if (pieza.type === "image" && typeof pieza.data === "string") {
      const mime = typeof pieza.mimeType === "string" ? pieza.mimeType : typeof pieza.mime === "string" ? pieza.mime : "application/octet-stream";
      contenido.push({ tipo: "imagen", mime, bytes: decodificarBase64(pieza.data) });
    }
  }
  return { ok: objeto.isError !== true, texto, contenido };
}

export class ClienteMcpStdio {
  private readonly transporte: TransporteMcpStdio;
  private readonly reloj: RelojMcp;
  private readonly pendientes = new Map<number, Pendiente>();
  private siguienteId = 1;
  private buffer = "";
  private contadorIlegibles = 0;
  private estaCerrado = false;
  private enorme = false;

  constructor(transporte: TransporteMcpStdio, reloj: RelojMcp) {
    this.transporte = transporte;
    this.reloj = reloj;
    transporte.alRecibir((texto) => this.alRecibir(texto));
  }

  get ilegibles(): number {
    return this.contadorIlegibles;
  }

  async iniciar(tiempoMs = TIEMPO_INICIO_MS): Promise<InicializacionMcp> {
    const resultado = await this.enviar<InicializacionMcp>("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "starseed-os", version: "1" },
    }, tiempoMs);
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    return resultado;
  }

  listar(tiempoMs: number): Promise<ListaMcp> {
    return this.enviar<ListaMcp>("tools/list", {}, tiempoMs);
  }

  llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<LlamadaMcp> {
    return this.enviar<unknown>("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs)
      .then((resultado) => interpretarLlamada(resultado));
  }

  cerrar(): void {
    if (this.estaCerrado) return;
    this.estaCerrado = true;
    this.buffer = "";
    this.rechazarPendientes(new ErrorMcp("cerrado", "El cliente se cerró"));
    this.transporte.cerrar();
  }

  private enviar<T>(metodo: string, params: Record<string, unknown>, tiempoMs: number): Promise<T> {
    if (this.estaCerrado) return Promise.reject(new ErrorMcp("cerrado", "El cliente está cerrado"));
    if (this.enorme) return Promise.reject(new ErrorMcp("enorme", "Se cortó una línea mayor que el límite"));
    const id = this.siguienteId;
    this.siguienteId += 1;
    return new Promise<T>((resolver, rechazar) => {
      const cancelar = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        rechazar(new ErrorMcp("tiempo", `Sin respuesta a ${metodo} en ${tiempoMs} ms`));
      });
      this.pendientes.set(id, { resolver: (valor) => resolver(valor as T), rechazar, cancelar });
      try {
        this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
      } catch {
        this.pendientes.delete(id);
        cancelar();
        rechazar(new ErrorMcp("protocolo", "El transporte no pudo escribir"));
      }
    });
  }

  private alRecibir(trozo: string): void {
    if (this.estaCerrado || this.enorme) return;
    const { lineas, resto } = trocearLineas(this.buffer, trozo);
    this.buffer = resto;
    for (const linea of lineas) {
      if (linea.length > LIMITE_LINEA) {
        this.cortarPorEnorme();
        return;
      }
      this.procesarLinea(linea);
    }
    if (this.buffer.length > LIMITE_LINEA) this.cortarPorEnorme();
  }

  private procesarLinea(linea: string): void {
    let dato: unknown;
    try {
      dato = JSON.parse(linea);
    } catch {
      this.contadorIlegibles += 1;
      return;
    }
    if (typeof dato !== "object" || dato === null || Array.isArray(dato)) {
      this.contadorIlegibles += 1;
      return;
    }
    const objeto = dato as Record<string, unknown>;
    const id = objeto.id;
    if (typeof id !== "number" || !Number.isInteger(id)) return;
    const pendiente = this.pendientes.get(id);
    if (!pendiente) return;
    if (typeof objeto.method === "string" && !("result" in objeto) && !("error" in objeto)) return;
    this.pendientes.delete(id);
    pendiente.cancelar();
    if ("error" in objeto && objeto.error) {
      const error = objeto.error as Record<string, unknown>;
      const mensaje = typeof error.message === "string" ? error.message : "Error JSON-RPC";
      pendiente.rechazar(new ErrorMcp("rpc", mensaje));
    } else if ("result" in objeto) {
      pendiente.resolver(objeto.result);
    } else {
      pendiente.rechazar(new ErrorMcp("protocolo", "Respuesta sin result ni error"));
    }
  }

  private cortarPorEnorme(): void {
    if (this.enorme) return;
    this.enorme = true;
    this.buffer = "";
    this.rechazarPendientes(new ErrorMcp("enorme", `Línea mayor que ${LIMITE_LINEA} bytes`));
  }

  private rechazarPendientes(error: ErrorMcp): void {
    for (const [id, pendiente] of this.pendientes) {
      this.pendientes.delete(id);
      pendiente.cancelar();
      pendiente.rechazar(error);
    }
  }
}
