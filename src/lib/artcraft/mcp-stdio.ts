// Cliente JSON-RPC 2.0 de MCP por líneas: puro, con transporte y reloj inyectados.
// Contrato: architecture/artcraft-y-rare.md §2.1 y §3.1 (puntos 1 y 7).
export const LIMITE_LINEA = 32 * 1024 * 1024;
const TIEMPO_INICIO_MS = 30_000;
export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export class ErrorMcp extends Error {
  constructor(public readonly tipo: TipoErrorMcp, mensaje: string) { super(mensaje); this.name = "ErrorMcp"; }
}
export interface TransporteMcpStdio { escribir(linea: string): void; alRecibir(cb: (texto: string) => void): void; cerrar(): void; }
export interface RelojMcp { tras(ms: number, cb: () => void): () => void; }
export interface HerramientaMcp { nombre: string; descripcion: string; esquema: unknown; }
export interface ImagenMcp { tipo: "imagen"; mime: string; bytes: Uint8Array; }
export interface ResultadoLlamada { ok: boolean; texto: string; imagenes: ImagenMcp[]; }
interface Pendiente { resolver: (valor: unknown) => void; rechazar: (error: ErrorMcp) => void; cancelar: () => void; }
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  return { lineas: partes.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.length > 0), resto };
}
const ALFABETO_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodificarBase64(texto: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const caracter of texto.replace(/[^A-Za-z0-9+/]/g, "")) {
    buffer = (buffer << 6) | ALFABETO_BASE64.indexOf(caracter);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  return new Uint8Array(bytes);
}
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
export class ClienteMcpStdio {
  ilegibles = 0;
  private siguienteId = 1; private pendiente = ""; private bloqueado = false; private cerrado = false;
  private readonly pendientes = new Map<number, Pendiente>();
  constructor(private readonly transporte: TransporteMcpStdio, private readonly reloj: RelojMcp) {
    transporte.alRecibir((texto) => this.recibir(texto));
  }
  async iniciar(): Promise<void> {
    await this.peticion("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "starseed-os", version: "1" } }, TIEMPO_INICIO_MS);
    this.escribir({ jsonrpc: "2.0", method: "notifications/initialized" });
  }
  async listar(tiempoMs: number): Promise<HerramientaMcp[]> {
    const resultado = await this.peticion("tools/list", {}, tiempoMs);
    const herramientas = esObjeto(resultado) && Array.isArray(resultado.tools) ? resultado.tools : [];
    return herramientas.filter(esObjeto).map((h) => ({ nombre: typeof h.name === "string" ? h.name : "", descripcion: typeof h.description === "string" ? h.description : "", esquema: h.inputSchema ?? null }));
  }
  async llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<ResultadoLlamada> {
    return this.interpretar(await this.peticion("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs));
  }
  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.rechazarPendientes("cerrado", "El cliente MCP se cerró");
    this.transporte.cerrar();
  }
  private peticion(metodo: string, parametros: Record<string, unknown>, tiempoMs: number): Promise<unknown> {
    if (this.bloqueado) return Promise.reject(new ErrorMcp("enorme", "Se cortó una línea MCP demasiado grande"));
    if (this.cerrado) return Promise.reject(new ErrorMcp("cerrado", "El cliente MCP está cerrado"));
    const id = this.siguienteId++;
    return new Promise<unknown>((resolver, rechazar) => {
      const cancelar = this.reloj.tras(tiempoMs, () => { this.pendientes.delete(id); rechazar(new ErrorMcp("tiempo", `La petición ${metodo} agotó ${tiempoMs} ms`)); });
      this.pendientes.set(id, { resolver, rechazar, cancelar });
      try { this.escribir({ jsonrpc: "2.0", id, method: metodo, params: parametros }); }
      catch (error) { cancelar(); this.pendientes.delete(id); rechazar(error instanceof ErrorMcp ? error : new ErrorMcp("protocolo", "No se pudo escribir en el transporte MCP")); }
    });
  }
  private escribir(mensaje: Record<string, unknown>): void {
    try { this.transporte.escribir(`${JSON.stringify(mensaje)}\n`); }
    catch { throw new ErrorMcp("protocolo", "No se pudo escribir en el transporte MCP"); }
  }
  private recibir(texto: string): void {
    if (this.cerrado) return;
    const { lineas, resto } = trocearLineas(this.pendiente, texto);
    this.pendiente = resto;
    if (resto.length > LIMITE_LINEA) {
      this.bloqueado = true;
      this.pendiente = "";
      this.rechazarPendientes("enorme", `Línea MCP mayor de ${LIMITE_LINEA} caracteres`);
      return;
    }
    for (const linea of lineas) this.despachar(linea);
  }
  private despachar(linea: string): void {
    let mensaje: unknown;
    try { mensaje = JSON.parse(linea); }
    catch { this.ilegibles++; return; }
    if (!esObjeto(mensaje) || typeof mensaje.id !== "number") return;
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id);
    pendiente.cancelar();
    if (esObjeto(mensaje.error)) pendiente.rechazar(new ErrorMcp("rpc", typeof mensaje.error.message === "string" ? mensaje.error.message : "El servidor MCP devolvió un error"));
    else if ("result" in mensaje) pendiente.resolver(mensaje.result);
    else pendiente.rechazar(new ErrorMcp("protocolo", "Respuesta MCP sin result ni error"));
  }
  private rechazarPendientes(tipo: TipoErrorMcp, mensaje: string): void {
    for (const pendiente of this.pendientes.values()) { pendiente.cancelar(); pendiente.rechazar(new ErrorMcp(tipo, mensaje)); }
    this.pendientes.clear();
  }
  private interpretar(resultado: unknown): ResultadoLlamada {
    const objeto = esObjeto(resultado) ? resultado : {};
    const partes = Array.isArray(objeto.content) ? objeto.content : [];
    let texto = "";
    const imagenes: ImagenMcp[] = [];
    for (const parte of partes) {
      if (!esObjeto(parte)) continue;
      if (parte.type === "text" && typeof parte.text === "string") texto += parte.text;
      else if (parte.type === "image" && typeof parte.data === "string") imagenes.push({ tipo: "imagen", mime: typeof parte.mimeType === "string" ? parte.mimeType : "application/octet-stream", bytes: decodificarBase64(parte.data) });
    }
    return { ok: objeto.isError !== true, texto, imagenes };
  }
}
