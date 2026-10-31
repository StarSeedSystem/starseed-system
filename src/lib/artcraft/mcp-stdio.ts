/**
 * Cliente JSON-RPC 2.0 de MCP por líneas (stdio), puro: transporte y reloj inyectados.
 * Contrato: `architecture/artcraft-y-rare.md` §2.1 (líneas de hasta 32 MiB) y §3.1.
 */
export const LIMITE_LINEA = 32 * 1024 * 1024;
const TIEMPO_HANDSHAKE_MS = 30_000;
export interface ResultadoTexto { ok: boolean; texto: string }
export interface ResultadoImagen { tipo: "imagen"; mime: string; bytes: Uint8Array }
export type Resultado = ResultadoTexto | ResultadoImagen;
export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export class ErrorMcp extends Error {
  constructor(public readonly tipo: TipoErrorMcp, public readonly mensaje: string) {
    super(mensaje); this.name = "ErrorMcp";
  }
}
export interface Transporte {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}
export interface Reloj { tras(ms: number, cb: () => void): () => void }
type Json = Record<string, unknown>;
interface Pendiente { resolver: (r: unknown) => void; rechazar: (e: ErrorMcp) => void; cancelar: () => void }
function esObjeto(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Separa por `\n`, ignora un `\r` final y las líneas vacías. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.length > 0);
  return { lineas, resto };
}
function decodificarBase64(datos: string): Uint8Array {
  const binario = atob(datos);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
export class ClienteMcpStdio {
  private idSiguiente = 1;
  private pendientes = new Map<number, Pendiente>();
  private pendienteTexto = "";
  private ilegiblesInternos = 0;
  private cerrado = false;
  private enorme = false;
  constructor(private readonly transporte: Transporte, private readonly reloj: Reloj) {
    this.transporte.alRecibir((texto) => this.recibirTrozo(texto));
  }
  get ilegibles(): number { return this.ilegiblesInternos; }
  private recibirTrozo(trozo: string): void {
    if (this.cerrado || this.enorme) return;
    const { lineas, resto } = trocearLineas(this.pendienteTexto, trozo);
    this.pendienteTexto = resto;
    if (resto.length > LIMITE_LINEA) {
      this.enorme = true; this.pendienteTexto = "";
      this.fallarPendientes(new ErrorMcp("enorme", "Línea mayor que 32 MiB"));
      return;
    }
    for (const linea of lineas) this.procesarLinea(linea);
  }
  private procesarLinea(linea: string): void {
    let mensaje: unknown;
    try { mensaje = JSON.parse(linea); } catch { this.ilegiblesInternos++; return; }
    if (!esObjeto(mensaje) || typeof mensaje.id !== "number" || "method" in mensaje) return;
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id); pendiente.cancelar();
    if (esObjeto(mensaje.error)) {
      const detalle = mensaje.error.message;
      pendiente.rechazar(new ErrorMcp("rpc", typeof detalle === "string" ? detalle : "Error RPC"));
    } else if (!("result" in mensaje)) {
      pendiente.rechazar(new ErrorMcp("protocolo", "Respuesta sin result"));
    } else {
      pendiente.resolver(mensaje.result);
    }
  }
  private fallarPendientes(error: ErrorMcp): void {
    const vivos = Array.from(this.pendientes.values()); this.pendientes.clear();
    for (const pendiente of vivos) { pendiente.cancelar(); pendiente.rechazar(error); }
  }
  private peticion(metodo: string, params: unknown, ms: number): Promise<unknown> {
    if (this.cerrado) return Promise.reject(new ErrorMcp("cerrado", "Cliente cerrado"));
    if (this.enorme) return Promise.reject(new ErrorMcp("enorme", "Límite de línea excedido"));
    const id = this.idSiguiente++;
    return new Promise((resolver, rechazar) => {
      const cancelar = this.reloj.tras(ms, () => {
        if (this.pendientes.delete(id)) rechazar(new ErrorMcp("tiempo", `Agotado tras ${ms} ms`));
      });
      this.pendientes.set(id, { resolver, rechazar, cancelar });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }
  async iniciar(): Promise<void> {
    await this.peticion("initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "starseed-os", version: "1" },
    }, TIEMPO_HANDSHAKE_MS);
    if (this.cerrado) throw new ErrorMcp("cerrado", "Cliente cerrado");
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }
  listar(tiempoMs: number): Promise<unknown> { return this.peticion("tools/list", {}, tiempoMs); }
  async llamar(herramienta: string, argumentos: unknown, tiempoMs: number): Promise<Resultado> {
    const resultado = await this.peticion("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs);
    const cuerpo = esObjeto(resultado) ? resultado : {};
    const contenido = Array.isArray(cuerpo.content) ? cuerpo.content.filter(esObjeto) : [];
    const texto = contenido.filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string).join("");
    if (cuerpo.isError === true) return { ok: false, texto };
    const imagen = contenido.find((c) => c.type === "image" && typeof c.data === "string");
    if (imagen) return { tipo: "imagen", mime: typeof imagen.mime === "string" ? imagen.mime : "image/png", bytes: decodificarBase64(imagen.data as string) };
    return { ok: true, texto };
  }
  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.fallarPendientes(new ErrorMcp("cerrado", "Cliente cerrado"));
    this.transporte.cerrar();
  }
}
