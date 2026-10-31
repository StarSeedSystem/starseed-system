/** Cliente JSON-RPC 2.0 de MCP por líneas (art §2.1, §3.1). Puro: transporte y reloj inyectados. */

export const LIMITE_LINEA = 32 * 1024 * 1024;
export type ErrorMcp = { tipo: "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo"; mensaje: string };
export type ImagenMcp = { tipo: "imagen"; mime: string; bytes: Uint8Array };
export type RespuestaMcp = { ok: boolean; texto: string; imagenes: ImagenMcp[] };
export interface TransporteMcp {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}
export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}
type Pendiente = { resolver: (r: Record<string, unknown>) => void; rechazar: (e: Error & ErrorMcp) => void; cancelar?: () => void };
function err(tipo: ErrorMcp["tipo"], mensaje: string): Error & ErrorMcp {
  return Object.assign(new Error(mensaje), { tipo }) as Error & ErrorMcp;
}
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const lineas: string[] = [];
  let resto = pendiente + trozo;
  let salto = resto.indexOf("\n");
  while (salto !== -1) {
    const linea = resto.slice(0, salto).replace(/\r$/, "");
    if (linea !== "") lineas.push(linea);
    resto = resto.slice(salto + 1);
    salto = resto.indexOf("\n");
  }
  return { lineas, resto };
}
function decodificarBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
export class ClienteMcpStdio {
  private seq = 0; private resto = "";
  private ilegibles = 0; private cortado = false; private cerrado = false;
  private pendientes = new Map<number, Pendiente>();
  constructor(private transporte: TransporteMcp, private reloj: RelojMcp) {
    this.transporte.alRecibir((texto) => this.recibir(texto));
  }
  get cuentaIlegibles(): number { return this.ilegibles; }
  async iniciar(): Promise<void> {
    const r = await this.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "starseed-os", version: "1" } }, 10000);
    if (!r || typeof r !== "object") throw err("protocolo", "respuesta de initialize inválida");
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }
  async listar(tiempoMs: number): Promise<Array<Record<string, unknown>>> {
    const resultado = await this.pedir("tools/list", {}, tiempoMs);
    const herramientas = resultado["tools"];
    return Array.isArray(herramientas) ? (herramientas as Array<Record<string, unknown>>) : [];
  }
  async llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<RespuestaMcp> {
    const resultado = await this.pedir("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs);
    return this.leerContenido(resultado);
  }
  cerrar(): void {
    this.cerrado = true;
    this.terminar(err("cerrado", "cliente cerrado con peticiones pendientes"));
    this.transporte.cerrar();
  }
  private pedir(metodo: string, params: unknown, tiempoMs: number): Promise<Record<string, unknown>> {
    if (this.cortado) return Promise.reject(err("enorme", "línea del servidor sobre el límite; cliente cortado"));
    if (this.cerrado) return Promise.reject(err("cerrado", "el cliente está cerrado"));
    return new Promise((resolver, rechazar) => {
      const id = ++this.seq;
      const cancelar = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        rechazar(err("tiempo", `sin respuesta a ${metodo} en ${tiempoMs} ms`));
      });
      this.pendientes.set(id, { resolver, rechazar, cancelar });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }
  private recibir(texto: string): void {
    const { lineas, resto } = trocearLineas(this.resto, texto);
    this.resto = resto;
    if (this.resto.length > LIMITE_LINEA) {
      this.resto = "";
      return this.terminar(err("enorme", "línea del servidor sin salto de línea supera 32 MiB"));
    }
    lineas.forEach((linea) => this.tratar(linea));
  }
  private terminar(e: Error & ErrorMcp): void {
    if (e.tipo === "enorme") this.cortado = true;
    for (const p of this.pendientes.values()) { if (p.cancelar) p.cancelar(); p.rechazar(e); }
    this.pendientes.clear();
  }
  private leerContenido(resultado: Record<string, unknown>): RespuestaMcp {
    const contenido = Array.isArray(resultado["content"]) ? resultado["content"] : [];
    const textos: string[] = [];
    const imagenes: ImagenMcp[] = [];
    for (const item of contenido) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      if (c["type"] === "text" && typeof c["text"] === "string") textos.push(c["text"]);
      else if (c["type"] === "image" && typeof c["data"] === "string" && typeof c["mimeType"] === "string")
        imagenes.push({ tipo: "imagen", mime: c["mimeType"], bytes: decodificarBase64(c["data"]) });
    }
    return { ok: resultado["isError"] !== true, texto: textos.join("\n"), imagenes };
  }
  private tratar(linea: string): void {
    let msg: unknown;
    try { msg = JSON.parse(linea); } catch { this.ilegibles++; return; }
    if (!msg || typeof msg !== "object") { this.ilegibles++; return; }
    const m = msg as Record<string, unknown>;
    const id = m["id"];
    if (typeof id !== "number") return;
    const pendiente = this.pendientes.get(id);
    if (!pendiente) return;
    this.pendientes.delete(id);
    if (pendiente.cancelar) pendiente.cancelar();
    const error = m["error"] as { message?: unknown } | undefined;
    if (error) pendiente.rechazar(err("rpc", typeof error.message === "string" ? error.message : "error rpc"));
    else if (m["result"] && typeof m["result"] === "object") pendiente.resolver(m["result"] as Record<string, unknown>);
    else pendiente.rechazar(err("protocolo", "respuesta sin result"));
  }
}