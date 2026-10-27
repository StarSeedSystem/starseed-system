// Cliente JSON-RPC 2.0 de MCP por líneas (stdio). Puro: transporte y reloj inyectados.
export const LIMITE_LINEA = 32 * 1024 * 1024;

export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export class ErrorMcp extends Error {
  readonly tipo: TipoErrorMcp;
  constructor(tipo: TipoErrorMcp, mensaje: string) { super(mensaje); this.tipo = tipo; }
}
export interface TransporteMcp { escribir(linea: string): void; alRecibir(cb: (texto: string) => void): void; cerrar(): void; }
export interface RelojMcp { tras(ms: number, cb: () => void): () => void; }
export interface ContenidoMcp { tipo: "texto" | "imagen"; texto?: string; imagen?: { mime: string; bytes: Uint8Array }; }
export interface RespuestaMcp { ok: boolean; texto: string; contenido: ContenidoMcp[]; }

export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.length > 0);
  return { lineas, resto };
}

type Aviso = { resultado: unknown; rpcError?: string; error?: ErrorMcp };

export class ClienteMcpStdio {
  private siguienteId = 0;
  private pendientes = new Map<number, (v: Aviso) => void>();
  private ilegibles = 0;
  private enorme = false;
  private resto = "";
  private cerrada = false;

  constructor(private transporte: TransporteMcp, private reloj: RelojMcp) {
    transporte.alRecibir((texto) => this.alLlegar(texto));
  }

  iniciar(info: { name: string; version: string }, tiempoMs: number): Promise<void> {
    return this.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: info }, tiempoMs).then(
      () => this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })),
    );
  }
  listar(tiempoMs: number): Promise<unknown> {
    return this.pedir("tools/list", {}, tiempoMs);
  }
  llamar(herramienta: string, argumentos: Record<string, unknown> | undefined, tiempoMs: number): Promise<RespuestaMcp> {
    return this.pedir("tools/call", { name: herramienta, arguments: argumentos ?? {} }, tiempoMs).then((v) => this.aRespuesta(v));
  }
  cerrar(): void { this.cerrada = true; this.fallarTodas(new ErrorMcp("cerrado", "cliente cerrado")); this.transporte.cerrar(); }
  get cuentaIlegibles(): number { return this.ilegibles; }

  private fallarTodas(error: ErrorMcp): void {
    for (const resolver of this.pendientes.values()) resolver({ resultado: undefined, error });
    this.pendientes.clear();
  }

  private pedir(metodo: string, parametros: unknown, tiempoMs: number): Promise<unknown> {
    const id = this.siguienteId++;
    return new Promise((resolver, rechazar) => {
      if (this.enorme) { rechazar(new ErrorMcp("enorme", "línea superior al límite, cliente detenido")); return; }
      if (this.cerrada) { rechazar(new ErrorMcp("cerrado", "cliente cerrado")); return; }
      const quitarReloj = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        rechazar(new ErrorMcp("tiempo", `${metodo}: tiempo agotado (${tiempoMs} ms)`));
      });
      this.pendientes.set(id, (v) => {
        quitarReloj();
        if (v.error) rechazar(v.error);
        else if (v.rpcError) rechazar(new ErrorMcp("rpc", `${metodo}: ${v.rpcError}`));
        else resolver(v.resultado);
      });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params: parametros }));
    });
  }

  private alLlegar(texto: string): void {
    const { lineas, resto } = trocearLineas(this.resto, texto);
    this.resto = resto;
    if (resto.length > LIMITE_LINEA) {
      this.enorme = true;
      this.resto = "";
      this.fallarTodas(new ErrorMcp("enorme", "línea superior al límite, cliente detenido"));
    }
    for (const linea of lineas) this.despachar(linea);
  }

  private despachar(linea: string): void {
    let dato: unknown;
    try { dato = JSON.parse(linea); } catch { this.ilegibles++; return; }
    const msg = dato as { id?: number | string; error?: { message?: string }; result?: unknown };
    if (typeof msg.id !== "number") return; // notificaciones y líneas sin id se ignoran
    const resolver = this.pendientes.get(msg.id);
    if (!resolver) return; // respuesta tardía o duplicada: se ignora
    this.pendientes.delete(msg.id);
    resolver({ resultado: msg.result, rpcError: msg.error ? (msg.error.message ?? "error rpc") : undefined });
  }

  private aRespuesta(v: unknown): RespuestaMcp {
    const resultado = (v ?? {}) as {
      isError?: boolean;
      content?: { type?: string; text?: string; mimeType?: string; data?: string }[];
    };
    const contenido: ContenidoMcp[] = (resultado.content ?? []).map((c) =>
      c.type === "image" && c.mimeType && c.data
        ? { tipo: "imagen", mime: c.mimeType, bytes: aBytes(c.data) }
        : { tipo: "texto", texto: c.text ?? "" },
    );
    const texto = contenido.filter((c) => c.tipo === "texto").map((c) => c.texto ?? "").join("\n");
    return { ok: resultado.isError !== true, texto, contenido };
  }
}

function aBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
