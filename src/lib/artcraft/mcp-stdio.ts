// Cliente MCP por stdio: JSON-RPC 2.0 por líneas. Puro: transporte y reloj inyectados.
// Contrato: architecture/artcraft-y-rare.md §3.1 (puntos 1 y 7) y §2.1 (líneas hasta 32 MiB).

export const LIMITE_LINEA = 32 * 1024 * 1024;

export type TipoErrorMcp = "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo";

export interface ErrorMcp {
  tipo: TipoErrorMcp;
  mensaje: string;
}

export interface TransporteMcp {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

export interface RelojMcp {
  tras(ms: number, cb: () => void): () => void;
}

export type ContenidoMcp =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; mime: string; bytes: Uint8Array };

export type RespuestaHerramienta =
  | { ok: true; texto: string; contenidos: ContenidoMcp[] }
  | { ok: false; texto: string };

export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const sinCr = trozo.replace(/\r/g, "");
  const juntas = pendiente + sinCr;
  const partes = juntas.split("\n");
  return { lineas: partes.slice(0, -1).filter((l) => l.length > 0), resto: partes[partes.length - 1] ?? "" };
}

interface Pendiente {
  resolver: (resultado: unknown) => void;
  rechazar: (e: ErrorMcp) => void;
  cancelar: () => void;
}

export class ClienteMcpStdio {
  private pendientes = new Map<number, Pendiente>();
  private siguienteId = 1;
  private ilegiblesCount = 0;
  private estado: "vivo" | "enorme" | "cerrado" = "vivo";
  private resto = "";

  constructor(private transporte: TransporteMcp, private reloj: RelojMcp) {
    this.transporte.alRecibir((texto) => this.recibir(texto));
  }

  ilegibles(): number {
    return this.ilegiblesCount;
  }

  private recibir(texto: string): void {
    if (this.estado === "enorme") return;
    const troceado = trocearLineas(this.resto, texto);
    this.resto = troceado.resto;
    if (this.resto.length > LIMITE_LINEA) return this.cortarEnorme();
    for (const linea of troceado.lineas) this.despachar(linea);
  }

  private cortarEnorme(): void {
    const error: ErrorMcp = { tipo: "enorme", mensaje: "Línea sin salto mayor que el límite de 32 MiB" };
    for (const p of this.pendientes.values()) {
      p.cancelar();
      p.rechazar(error);
    }
    this.pendientes.clear();
    this.estado = "enorme";
  }

  private despachar(linea: string): void {
    if (linea.length > LIMITE_LINEA) return this.cortarEnorme();
    let mensaje: { id?: unknown; result?: unknown; error?: unknown; method?: unknown };
    try {
      mensaje = JSON.parse(linea) as typeof mensaje;
    } catch {
      this.ilegiblesCount += 1;
      return;
    }
    const id = typeof mensaje.id === "number" ? mensaje.id : null;
    if (id === null || !this.pendientes.has(id)) return; // notificación u respuesta tardía: ignorada
    const p = this.pendientes.get(id);
    this.pendientes.delete(id);
    p?.cancelar();
    if (mensaje.error !== undefined && mensaje.error !== null) {
      const error = mensaje.error as { message?: unknown };
      p?.rechazar({
        tipo: "rpc",
        mensaje: typeof error.message === "string" ? error.message : "Error del servidor MCP",
      });
    } else if (mensaje.result === undefined) p?.rechazar({ tipo: "protocolo", mensaje: "Respuesta sin result ni error" });
    else p?.resolver(mensaje.result);
  }

  private async pedir(metodo: string, params: Record<string, unknown>, tiempoMs: number): Promise<unknown> {
    if (this.estado === "cerrado") throw { tipo: "cerrado", mensaje: "Cliente cerrado" } satisfies ErrorMcp;
    if (this.estado === "enorme") throw { tipo: "enorme", mensaje: "Línea enorme: sin más despachos" } satisfies ErrorMcp;
    const id = this.siguienteId++;
    return new Promise<unknown>((resolver, rechazar) => {
      const cancelar = this.reloj.tras(tiempoMs, () => {
        this.pendientes.delete(id);
        rechazar({ tipo: "tiempo", mensaje: `Sin respuesta a ${metodo} en ${tiempoMs} ms` } satisfies ErrorMcp);
      });
      this.pendientes.set(id, { resolver, rechazar, cancelar });
      this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    }) as Promise<unknown>;
  }

  async iniciar(): Promise<void> {
    await this.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "starseed-os", version: "1" } }, 10_000);
    this.transporte.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  }

  async listar(tiempoMs: number): Promise<unknown[]> {
    const resultado = (await this.pedir("tools/list", {}, tiempoMs)) as { tools?: unknown[] } | null;
    return resultado?.tools ?? [];
  }

  async llamar(herramienta: string, argumentos: Record<string, unknown>, tiempoMs: number): Promise<RespuestaHerramienta> {
    const resultado = (await this.pedir("tools/call", { name: herramienta, arguments: argumentos }, tiempoMs)) as
      | { isError?: boolean; content?: unknown }
      | null;
    const contenidos = Array.isArray(resultado?.content) ? (resultado.content as Record<string, unknown>[]) : [];
    let texto = "";
    const piezas: ContenidoMcp[] = [];
    for (const c of contenidos) {
      if (c.type === "text" && typeof c.text === "string") {
        texto += texto ? "\n" : "";
        texto += c.text;
        piezas.push({ tipo: "texto", texto: c.text });
      } else if (c.type === "image" && typeof c.mimeType === "string" && typeof c.data === "string") {
        piezas.push({ tipo: "imagen", mime: c.mimeType, bytes: Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0)) });
      }
    }
    if (resultado?.isError === true) return { ok: false, texto };
    return { ok: true, texto, contenidos: piezas };
  }

  cerrar(): void {
    const error: ErrorMcp = { tipo: "cerrado", mensaje: "Cliente cerrado" };
    for (const p of this.pendientes.values()) {
      p.cancelar();
      p.rechazar(error);
    }
    this.pendientes.clear();
    this.estado = "cerrado";
    this.transporte.cerrar();
  }
}
