/** Cliente JSON-RPC 2.0 de MCP por líneas (stdio), puro: transporte y reloj inyectados. */
export const LIMITE_LINEA = 32 * 1024 * 1024;
export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
export class ErrorMcp extends Error {
  constructor(readonly tipo: TipoErrorMcp, readonly mensaje: string) { super(mensaje); this.name = "ErrorMcp"; }
}
export interface TransporteMcp { escribir(linea: string): void; alRecibir(cb: (texto: string) => void): void; cerrar(): void }
export interface RelojMcp { tras(ms: number, cb: () => void): () => void }
export interface ResultadoTexto { ok: boolean; texto: string }
export interface ResultadoImagen { tipo: "imagen"; mime: string; bytes: Uint8Array }
export type ResultadoLlamada = ResultadoTexto | ResultadoImagen;
interface MensajeRpc { id?: unknown; method?: unknown; result?: unknown; error?: unknown }
interface Pendiente { resolver: (m: MensajeRpc) => void; rechazar: (e: ErrorMcp) => void; cancelar: () => void }
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Separa por `\n`, descarta el `\r` final y las líneas vacías. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => l.length > 0);
  return { lineas, resto };
}
const esTexto = (b: unknown): b is { type: "text"; text: string } => esObjeto(b) && b.type === "text" && typeof b.text === "string";
const esImagen = (b: unknown): b is { type: "image"; mime?: unknown; data: string } => esObjeto(b) && b.type === "image" && typeof b.data === "string";
function textoError(error: unknown): string {
  if (!esObjeto(error)) return "Error RPC del servidor";
  if (typeof error.message === "string" && error.message) return error.message;
  return typeof error.code === "number" ? `Error RPC ${error.code}` : "Error RPC del servidor";
}
const decodificarBase64 = (datos: string): Uint8Array => Uint8Array.from(atob(datos), (c) => c.charCodeAt(0));

export class ClienteMcpStdio {
  private idSiguiente = 1; private ilegiblesContador = 0; private pendienteTexto = "";
  private pendientes = new Map<number, Pendiente>(); private cerrado = false; private enorme = false;
  constructor(private readonly transporte: TransporteMcp, private readonly reloj: RelojMcp) {
    this.transporte.alRecibir((trozo) => this.recibir(trozo));
  }

  get ilegibles(): number { return this.ilegiblesContador; }

  private recibir(trozo: string): void {
    if (this.cerrado || this.enorme) return;
    const { lineas, resto } = trocearLineas(this.pendienteTexto, trozo);
    this.pendienteTexto = resto;
    for (const linea of lineas) this.despachar(linea);
    if (this.pendienteTexto.length > LIMITE_LINEA) this.cortarPorTamano();
  }

  private despachar(linea: string): void {
    let mensaje: unknown;
    try { mensaje = JSON.parse(linea); } catch { this.ilegiblesContador += 1; return; }
    if (!esObjeto(mensaje) || typeof mensaje.id !== "number") return;
    if (typeof mensaje.method === "string" && mensaje.result === undefined && mensaje.error === undefined) return;
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id);
    pendiente.cancelar();
    pendiente.resolver(mensaje as MensajeRpc);
  }

  private cortarPorTamano(): void {
    this.enorme = true;
    this.pendienteTexto = "";
    this.fallarPendientes(new ErrorMcp("enorme", `Línea mayor de ${LIMITE_LINEA} bytes`));
  }

  private fallarPendientes(error: ErrorMcp): void {
    const pendientes = Array.from(this.pendientes.values());
    this.pendientes.clear();
    for (const pendiente of pendientes) { pendiente.cancelar(); pendiente.rechazar(error); }
  }

  private peticion(metodo: string, params: unknown, ms: number): Promise<MensajeRpc> {
    if (this.cerrado) return Promise.reject(new ErrorMcp("cerrado", "El cliente ya está cerrado"));
    if (this.enorme) return Promise.reject(new ErrorMcp("enorme", "Se superó el límite de línea"));
    const id = this.idSiguiente++;
    return new Promise<MensajeRpc>((resolver, rechazar) => {
      const cancelar = this.reloj.tras(ms, () => {
        if (this.pendientes.delete(id)) rechazar(new ErrorMcp("tiempo", `Sin respuesta en ${ms} ms`));
      });
      this.pendientes.set(id, { resolver, rechazar, cancelar });
      try {
        this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
      } catch { this.pendientes.delete(id); cancelar(); rechazar(new ErrorMcp("protocolo", "No se pudo escribir en el transporte")); }
    });
  }

  async iniciar(): Promise<void> {
    const respuesta = await this.peticion("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "starseed-os", version: "1" } }, 10_000);
    if (respuesta.error !== undefined) throw new ErrorMcp("rpc", textoError(respuesta.error));
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }));
  }

  async listar(ms: number): Promise<unknown> {
    const respuesta = await this.peticion("tools/list", {}, ms);
    if (respuesta.error !== undefined) throw new ErrorMcp("rpc", textoError(respuesta.error));
    if (respuesta.result === undefined) throw new ErrorMcp("protocolo", "Respuesta sin resultado");
    return respuesta.result;
  }

  async llamar(herramienta: string, argumentos: Record<string, unknown>, ms: number): Promise<ResultadoLlamada> {
    const respuesta = await this.peticion("tools/call", { name: herramienta, arguments: argumentos }, ms);
    if (respuesta.error !== undefined) throw new ErrorMcp("rpc", textoError(respuesta.error));
    if (!esObjeto(respuesta.result)) throw new ErrorMcp("protocolo", "Respuesta sin resultado");
    const contenido = Array.isArray(respuesta.result.content) ? respuesta.result.content : [];
    const texto = contenido.filter(esTexto).map((bloque) => bloque.text).join("");
    if (respuesta.result.isError === true) return { ok: false, texto };
    const imagen = contenido.find(esImagen);
    if (imagen) return { tipo: "imagen", mime: typeof imagen.mime === "string" && imagen.mime ? imagen.mime : "image/png", bytes: decodificarBase64(imagen.data) };
    return { ok: true, texto };
  }

  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.pendienteTexto = "";
    this.fallarPendientes(new ErrorMcp("cerrado", "El cliente se cerró con peticiones pendientes"));
    this.transporte.cerrar();
  }
}
