/**
 * Pasarela ArtCraft · Cliente MCP por stdio, JSON-RPC 2.0 por líneas (§2.1 y §3.1;
 * línea hasta 32 MiB). PURO: transporte y reloj se inyectan; ART1025D los conecta al hijo.
 */

export const LIMITE_LINEA = 32 * 1024 * 1024;
export const TIEMPO_INICIO_MS = 30_000;
export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export interface ErrorMcp { tipo: TipoErrorMcp; mensaje: string }
/** Sin tuberías propias: la pasarela de servidor inyecta la suya (stdio del hijo). */
export interface TransporteMcp { escribir(linea: string): void; alRecibir(cb: (texto: string) => void): void; cerrar(): void }
/** Sin temporizadores de Node: la pasarela inyecta el suyo. */
export interface RelojMcp { tras(ms: number, cb: () => void): () => void }
export interface ImagenMcp { tipo: "imagen"; mime: string; bytes: number }
export interface RespuestaMcp { ok: boolean; texto: string; imagenes: ImagenMcp[] }

/** Parte el buffer pendiente + el trozo en líneas completas y un resto sin `\n`. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  // Cada línea deja atrás su `\n`; el `\r` final (vía CRLF) no se propaga y las vacías se ignoran.
  return {
    lineas: partes.slice(0, -1).map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.length > 0),
    resto: partes[partes.length - 1],
  };
}

/** Bytes decodificados de una imagen base64, por aritmética: puro, sin Buffer ni atob. */
export function bytesBase64(dato: string): number {
  const utiles = dato.replace(/[^A-Za-z0-9+/=]/g, "");
  const relleno = utiles.endsWith("==") ? 2 : utiles.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((utiles.length * 3) / 4) - relleno);
}

/** Traduce `result` de una herramienta: texto tipo «text» concatenado, imágenes con bytes decodificados. */
export function contenidoDe(resultado: unknown): RespuestaMcp {
  const r = (resultado && typeof resultado === "object" ? resultado : {}) as { isError?: unknown; content?: unknown };
  let texto = "";
  const imagenes: ImagenMcp[] = [];
  for (const c of Array.isArray(r.content) ? r.content : []) {
    const it = (c && typeof c === "object" ? c : {}) as { type?: unknown; text?: unknown; mimeType?: unknown; data?: unknown };
    if (it.type === "text" && typeof it.text === "string") texto += (texto ? "\n" : "") + it.text;
    else if (it.type === "image" && typeof it.data === "string")
      imagenes.push({ tipo: "imagen", mime: typeof it.mimeType === "string" ? it.mimeType : "application/octet-stream", bytes: bytesBase64(it.data) });
  }
  return { ok: r.isError !== true, texto, imagenes }; // isError no dispara excepción: llega con `ok: false`
}

interface Pendiente { resolver: (r: RespuestaMcp) => void; fallo: (e: ErrorMcp) => void; cancelar: () => void }
export class ClienteMcpStdio {
  private id = 0;
  private pendiente = "";
  private pendings = new Map<number, Pendiente>();
  private cuentaIlegibles = 0;
  private parada: ErrorMcp | null = null;
  constructor(private t: TransporteMcp, private reloj: RelojMcp) { t.alRecibir((trozo) => this.alEntrar(trozo)); }

  /** Handshake MCP: `initialize`, esperar respuesta y mandar `notifications/initialized`. */
  async iniciar(): Promise<void> {
    await this.mandar("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } }, TIEMPO_INICIO_MS);
    this.t.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }

  listar(tiempoMs: number): Promise<RespuestaMcp> { return this.mandar("tools/list", {}, tiempoMs); }
  llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<RespuestaMcp> { return this.mandar("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs); }
  /** Cierra el transporte y devuelve con «cerrado» lo que estuviera en vuelo. */
  cerrar(): void { this.pararTodo({ tipo: "cerrado", mensaje: "El cliente MCP se cerró." }); this.t.cerrar(); }
  get ilegibles(): number { return this.cuentaIlegibles; }
  get roto(): ErrorMcp | null { return this.parada; }

  /** Una petición en vuelo: id secuencial, temporizador cancelable del reloj inyectado. */
  private mandar(metodo: string, params: Record<string, unknown>, tiempoMs: number): Promise<RespuestaMcp> {
    if (this.parada !== null) return Promise.reject(this.parada);
    const id = ++this.id;
    return new Promise((resolver, fallo) => {
      const cancelar = this.reloj.tras(tiempoMs, () => {
        this.pendings.delete(id);
        fallo({ tipo: "tiempo", mensaje: `La petición «${metodo}» agotó ${tiempoMs} ms sin respuesta.` });
      });
      this.pendings.set(id, { resolver, fallo, cancelar });
      try { this.t.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params })); }
      catch { // el transporte puede estar roto
        this.pendings.delete(id); cancelar();
        fallo({ tipo: "protocolo", mensaje: `El transporte falló al escribir «${metodo}».` });
      }
    });
  }

  /** Entrada acumulada: saca líneas completas y corta si el resto sin salto supera 32 MiB. */
  private alEntrar(trozo: string): void {
    const { lineas, resto } = trocearLineas(this.pendiente, trozo);
    this.pendiente = resto;
    for (const linea of lineas) this.procesarLinea(linea);
    if (this.pendiente.length > LIMITE_LINEA) {
      this.pendiente = "";
      this.pararTodo({ tipo: "enorme", mensaje: "Línea de más de 32 MiB sin salto: se corta y no se despachan más peticiones." });
    }
  }

  /** Una línea JSON completa: respuesta con `id` conocido; notificaciones y ruido se ignoran. */
  private procesarLinea(linea: string): void {
    let m: unknown;
    try { m = JSON.parse(linea); } catch { this.cuentaIlegibles++; return; }
    if (m === null || typeof m !== "object" || Array.isArray(m)) { this.cuentaIlegibles++; return; }
    const r = m as Record<string, unknown>;
    if (typeof r.id !== "number" || !Number.isInteger(r.id)) return; // sin id: notificación, se ignora
    const p = this.pendings.get(r.id);
    if (!p) return; // id desconocido (ya respondido o ajeno): se ignora
    this.pendings.delete(r.id); p.cancelar();
    if (r.error === null || r.error === undefined) { p.resolver(contenidoDe(r.result)); return; }
    const e = (r.error && typeof r.error === "object" ? r.error : {}) as { message?: unknown };
    p.fallo({ tipo: "rpc", mensaje: typeof e.message === "string" ? e.message : "Error rpc del servidor MCP." });
  }

  private pararTodo(e: ErrorMcp): void {
    if (this.parada === null) this.parada = e;
    const vivo = [...this.pendings.values()];
    this.pendings.clear();
    for (const p of vivo) { p.cancelar(); p.fallo(e); }
  }
}
