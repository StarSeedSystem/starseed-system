/**
 * Cliente MCP por stdio — JSON-RPC 2.0 por líneas (contrato:
 * `architecture/artcraft-y-rare.md` §2.1 y §3.1). PURO: no abre procesos ni
 * toca la red ni el disco; el transporte de E/S y el reloj se inyectan (§3.1
 * punto 1 y §2.1: cada línea de la salida limitada, FigCraft ≤ 32 MiB).
 */
export const LIMITE_LINEA = 32 * 1024 * 1024;

/** Transporte de líneas entre el OS y el proceso hijo `«app»-cli mcp` (§3.1 punto 1). */
export interface TransporteStdio {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}
/** Reloj inyectado para los tiempos por llamada (puramente funciones). */
export interface RelojInyectado { tras(ms: number, cb: () => void): () => void }

/** Error tipado de toda la pasarela MCP (§2.1): solo esta forma, sin leaks. */
export interface ErrorMcp {
  tipo: "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";
  mensaje: string;
}

const err = (tipo: ErrorMcp["tipo"], mensaje: string): ErrorMcp => ({ tipo, mensaje });

/** Bloque de `result.content`: texto concatenable o imagen base64 decodificada (§2.1). */
export type BloqueContenido =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; mime: string; bytes: Uint8Array };
export interface ResultadoLlamada { ok: boolean; contenido: BloqueContenido[]; texto: string }
export interface HerramientaMcp { nombre: string; descripcion: string | null; esquema: unknown }

/**
 * Separa `pendiente + trozo` por `\n`: ignora el `\r` final de cada línea y
 * las líneas vacías; lo que no acaba en salto queda de nuevo como pendiente.
 */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const partes = (pendiente + trozo).split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter((l) => l.length > 0);
  return { lineas, resto };
}

/** Base64 puro sin `Buffer` ni `node:*`: `atob` está en el navegador y en Node moderno. */
const decodificarBase64 = (b64: string): Uint8Array => {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** `tools/list` → fichas defensivas (nada del servidor se toma por bueno). */
const herramientaDe = (bruto: unknown): HerramientaMcp => {
  const o = esObjeto(bruto) ? bruto : {};
  return {
    nombre: typeof o.name === "string" ? o.name : "",
    descripcion: typeof o.description === "string" ? o.description : null,
    esquema: o.inputSchema ?? null,
  };
};

/** `result.content` → bloques: texto y `image` con base64 decodificado (§2.1 MCP). */
const extraerContenido = (bruto: unknown): BloqueContenido[] => {
  if (!Array.isArray(bruto)) return [];
  const bloques: BloqueContenido[] = [];
  for (const item of bruto) {
    const o = esObjeto(item) ? item : {};
    if (o.type === "text" && typeof o.text === "string")
      bloques.push({ tipo: "texto", texto: o.text });
    else if (o.type === "image" && typeof o.data === "string")
      bloques.push({
        tipo: "imagen",
        mime: typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream",
        bytes: decodificarBase64(o.data),
      });
  }
  return bloques;
};

const textoDe = (contenido: BloqueContenido[]): string =>
  contenido.filter((b) => b.tipo === "texto").map((b) => (b.tipo === "texto" ? b.texto : "")).join("");

interface Pendiente { resolver: (v: unknown) => void; fallar: (e: ErrorMcp) => void; anularTimer: () => void }

export class ClienteMcpStdio {
  /** Líneas del servidor que no fue JSON ni un objeto: se cuentan, no tumban nada. */
  ilegibles = 0;
  private readonly transporte: TransporteStdio;
  private readonly reloj: RelojInyectado;
  private readonly limiteLinea: number;
  private pendiente = "";
  private idSiguiente = 0;
  private readonly enVuelo = new Map<number, Pendiente>();
  private cortadaPorEnorme = false;
  private cerrado = false;

  constructor(transporte: TransporteStdio, reloj: RelojInyectado, limiteLinea = LIMITE_LINEA) {
    this.transporte = transporte;
    this.reloj = reloj;
    this.limiteLinea = limiteLinea;
    transporte.alRecibir((trozo) => this.recibirTrozo(trozo));
  }

  private recibirTrozo(trozo: string): void {
    const { lineas, resto } = trocearLineas(this.pendiente, trozo);
    this.pendiente = resto;
    if (resto.length > this.limiteLinea) {
      this.cortadaPorEnorme = true;
      this.pendiente = "";
      this.fallarTodos(err("enorme", "Sin salto de línea el resto supera el límite de la línea; se corta y no se despacha más."));
      return;
    }
    for (const linea of lineas) this.tratarLinea(linea);
  }

  private tratarLinea(linea: string): void {
    let datos: unknown;
    try { datos = JSON.parse(linea); } catch { this.ilegibles += 1; return; }
    if (datos === null || typeof datos !== "object" || Array.isArray(datos)) { this.ilegibles += 1; return; }
    const resp = datos as Record<string, unknown>;
    // Notificaciones del servidor y líneas sin `id`: se ignoran (§artcraft 2.1).
    if (typeof resp.id !== "number" || !Number.isInteger(resp.id)) return;
    const pendiente = this.enVuelo.get(resp.id);
    if (!pendiente) return; // respuesta ya vencida o desconocida
    this.enVuelo.delete(resp.id);
    pendiente.anularTimer();
    if ("error" in resp) {
      const e = esObjeto(resp.error) ? resp.error : {};
      pendiente.fallar(err("rpc", typeof e.message === "string" ? e.message : "Error RPC del servidor."));
    } else if ("result" in resp) pendiente.resolver(resp.result);
    else pendiente.fallar(err("protocolo", "Respuesta con id conocido sin result ni error."));
  }

  private fallarTodos(e: ErrorMcp): void {
    for (const p of this.enVuelo.values()) { p.anularTimer(); p.fallar(e); }
    this.enVuelo.clear();
  }

  private pedir(metodo: string, params: Record<string, unknown>, tiempoMs: number): Promise<unknown> {
    if (this.cortadaPorEnorme) return Promise.reject(err("enorme", "La línea del servidor se cortó; no se despacha más."));
    if (this.cerrado) return Promise.reject(err("cerrado", "El cliente MCP está cerrado."));
    this.idSiguiente += 1;
    const id = this.idSiguiente;
    return new Promise<unknown>((resolver, fallar) => {
      const anularTimer = this.reloj.tras(tiempoMs, () => {
        this.enVuelo.delete(id);
        fallar(err("tiempo", `Sin respuesta a «${metodo}» en ${tiempoMs} ms.`));
      });
      this.enVuelo.set(id, { resolver, fallar, anularTimer });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }

  /** `initialize` + `notifications/initialized` (§2.1 MCP, versión del contrato 2025-06-18). */
  async iniciar(tiempoMs = 10_000): Promise<void> {
    await this.pedir("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os", version: "1" } }, tiempoMs);
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }

  async listar(tiempoMs = 10_000): Promise<HerramientaMcp[]> {
    const resultado = (await this.pedir("tools/list", {}, tiempoMs)) as Record<string, unknown> | null;
    const lista = resultado !== null && Array.isArray(resultado.tools) ? resultado.tools : [];
    return lista.map((h) => herramientaDe(h));
  }

  async llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs = 120_000): Promise<ResultadoLlamada> {
    const resultado = (await this.pedir("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs)) as Record<string, unknown> | null;
    const contenido = extraerContenido(resultado !== null ? resultado.content : null);
    // `isError` de la herramienta: se devuelve, no se lanza (contrato de la tarea).
    return { ok: !(resultado !== null && resultado.isError === true), contenido, texto: textoDe(contenido) };
  }

  /** Al cerrar: las pendientes fallan con `cerrado` y se cierra el transporte (§3.1 punto 7). */
  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.fallarTodos(err("cerrado", "El cliente se cerró con peticiones pendientes."));
    this.transporte.cerrar();
  }
}
