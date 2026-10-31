/**
 * Cliente JSON-RPC 2.0 de MCP por líneas (stdio).
 * Contrato: `architecture/artcraft-y-rare.md` §2.1 y §3.1.
 */
export const LIMITE_LINEA = 32 * 1024 * 1024;

export interface ResultadoMcp { ok: boolean; texto?: string; error?: string }
export interface ResultadoImagen { tipo: "imagen"; mime: string; bytes: Uint8Array }
export type Resultado = ResultadoMcp | ResultadoImagen;

export class ErrorMcp extends Error {
  constructor(public tipo: "tiempo" | "enorme" | "rpc" | "cerrado" | "protocolo", public mensaje: string) {
    super(mensaje);
    this.name = "ErrorMcp";
  }
}

interface Transporte {
  escribir(linea: string): void;
  alRecibir(cb: (texto: string) => void): void;
  cerrar(): void;
}

interface Reloj { tras(ms: number, cb: () => void): () => void }

/** Separa por `\n`, ignora `\r` final y líneas vacías. */
export function trocearLineas(pendiente: string, trozo: string): { lineas: string[]; resto: string } {
  const texto = pendiente + trozo;
  const partes = texto.split("\n");
  const resto = partes.pop() ?? "";
  const lineas = partes.map(l => l.endsWith("\r") ? l.slice(0, -1) : l).filter(l => l.length > 0);
  return { lineas, resto };
}

export class ClienteMcpStdio {
  private idSiguiente = 1;
  private esperando = new Map<number, (r: any) => void>();
  private ilegibles = 0;
  private cerrado = false;
  private enorme = false;

  constructor(private trans: Transporte, private reloj: Reloj) {
    this.trans.alRecibir((texto) => {
      if (this.enorme || this.cerrado) return;
      try {
        const msg = JSON.parse(texto);
        if (msg && typeof msg.id === "number") {
          const cb = this.esperando.get(msg.id);
          if (cb) { this.esperando.delete(msg.id); cb(msg); }
        }
      } catch { this.ilegibles++; }
    });
  }

  private async peticion(metodo: string, params: any, ms: number): Promise<any> {
    if (this.cerrado) throw new ErrorMcp("cerrado", "Cliente cerrado");
    if (this.enorme) throw new ErrorMcp("enorme", "Límite de línea excedido");
    const id = this.idSiguiente++;
    return new Promise((resolve, reject) => {
      const timeout = this.reloj.tras(ms, () => {
        if (this.esperando.delete(id)) reject(new ErrorMcp("tiempo", `Agotado tras ${ms}ms`));
      });
      this.esperando.set(id, (res) => { 
        timeout(); 
        if (res && (res.tipo === "tiempo" || res.tipo === "enorme" || res.tipo === "rpc" || res.tipo === "cerrado" || res.tipo === "protocolo")) reject(res);
        else resolve(res); 
      });
      this.trans.escribir(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }

  async iniciar(): Promise<void> {
    await this.peticion("initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "starseed-os", version: "1" },
    }, 5000);
    this.trans.escribir(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }));
  }

  async listar(ms: number): Promise<any> { return this.peticion("tools/list", {}, ms); }

  async llamar(herramienta: string, args: any, ms: number): Promise<Resultado> {
    const res = await this.peticion("tools/call", { name: herramienta, arguments: args }, ms);
    if (res.error) throw new ErrorMcp("rpc", res.error.message || "Error RPC");
    const result = res.result || {};
    const content = Array.isArray(result.content) ? result.content : [];
    if (result.isError) return { ok: false, texto: content.map((c: any) => c.text || "").join("") };

    const img = content.find((c: any) => c.type === "image");
    if (img) return { tipo: "imagen", mime: img.mime || "image/png", bytes: this.b64(img.data) };
    return { ok: true, texto: content.map((c: any) => c.text || "").join("") };
  }

  private b64(s: string): Uint8Array {
    const b = atob(s);
    const a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }

  procesarTrozo(pendiente: string, trozo: string): string {
    if (this.enorme) return "";
    const { lineas, resto } = trocearLineas(pendiente, trozo);
    if (resto.length > LIMITE_LINEA) {
      this.enorme = true;
      this.cerrar();
      throw new ErrorMcp("enorme", "Límite de línea excedido");
    }
    lineas.forEach(l => this.trans.alRecibir(l)); // Re-inyectar lineas ya procesadas
    return resto;
  }

  cerrar(): void {
    this.cerrado = true;
    const errores = Array.from(this.esperando.values());
    this.esperando.clear();
    errores.forEach(cb => cb(new ErrorMcp("cerrado", "Cliente cerrado")));
    this.trans.cerrar();
  }

  get erroresIlegibles(): number { return this.ilegibles; }
}
