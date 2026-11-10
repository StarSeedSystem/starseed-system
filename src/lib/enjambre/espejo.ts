/**
 * espejo — un servidor HTTPS con `Range` como fuente más del enjambre (ENJ1110A · 2026-11-10). Contrato: §5 (d) y §9.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Equivale a las «web seeds» de BEP 19: cualquier URL https que sirva los mismos bytes (Supabase Storage, GitHub
 * Releases, un servidor propio, un CDN). Cada trozo se pide con `Range: bytes=a-b` y se verifica contra la capa de
 * piezas igual que uno de un par; si no casa, se descarta el espejo entero (como manda BEP 19).
 *
 *  · El `fetch` se INYECTA: en la app es el de la puerta (`fetchConPuerta`), que además de las reglas de aquí pasa por
 *    la segunda capa anti-SSRF de Node (resolver el DNS una vez y comprobar la IP ya resuelta, anti-rebinding).
 *  · `crearFetchEspejoSeguro` añade la primera capa (sintaxis, `redirect: "manual"` y revalidar cada salto).
 *  · Se exige 206 con `Content-Range` coherente y el largo exacto; un 200 solo vale si pedimos el recurso entero.
 *    Sin `Content-Encoding` (con compresión los rangos no son de los bytes que se verifican).
 *  · Capa de piezas: opcional en `<url>.enj-capa` (32 bytes por trozo); se verifica entera contra la raíz.
 * Nunca lanza hacia fuera: los fallos son null y cuentan para el estado del espejo.
 */

import { BYTES_HASH } from "./arbol";
import { validarUrlEspejo } from "./url-segura";

export interface RespuestaEspejo {
  status: number;
  headers: { get(nombre: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchEspejo = (url: string, init: { headers: Record<string, string>; redirect: "manual" | "error"; signal?: AbortSignal }) => Promise<RespuestaEspejo>;

export const SUFIJO_CAPA = ".enj-capa";

export function crearFetchEspejoSeguro(base: FetchEspejo, o: { maxRedirecciones?: number; validar?: (url: string) => string | null } = {}): FetchEspejo {
  const validar = o.validar ?? ((u: string) => validarUrlEspejo(u));
  const max = o.maxRedirecciones ?? 3;
  return async (url, init) => {
    let actual = validar(url);
    if (!actual) throw new Error("espejo: url no permitida");
    for (let salto = 0; salto <= max; salto++) {
      const r = await base(actual, { ...init, redirect: "manual" });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) throw new Error("espejo: redirección sin destino");
        let siguiente: string | null = null;
        try {
          siguiente = validar(new URL(loc, actual).href);
        } catch {
          siguiente = null;
        }
        if (!siguiente) throw new Error("espejo: redirección a destino no permitido");
        actual = siguiente;
        continue;
      }
      return r;
    }
    throw new Error("espejo: demasiadas redirecciones");
  };
}

export interface EstadoEspejo {
  url: string;
  vivo: boolean;
  aciertos: number;
  fallos: number;
  bytes: number;
}

export class FuenteEspejo {
  private ok = 0;
  private mal = 0;
  private seguidos = 0;
  private bytes = 0;
  private muerto = false;

  constructor(
    readonly url: string,
    private readonly fetch: FetchEspejo,
    /** Tamaño total del recurso (el de la semilla). */
    private readonly tamano: number,
    private readonly maxFallosSeguidos = 3,
  ) {}

  get estado(): EstadoEspejo {
    return { url: this.url, vivo: !this.muerto, aciertos: this.ok, fallos: this.mal, bytes: this.bytes };
  }

  get vivo(): boolean {
    return !this.muerto;
  }

  private fallo(): null {
    this.mal++;
    if (++this.seguidos >= this.maxFallosSeguidos) this.muerto = true;
    return null;
  }

  /** El trozo que bajó de aquí no casó con la capa: este espejo no sirve (BEP 19). */
  marcarMalo(): void {
    this.mal++;
    this.muerto = true;
  }

  /** Bytes [desde, hasta) del recurso, o null. */
  async leerRango(desde: number, hasta: number): Promise<Uint8Array | null> {
    if (this.muerto || !Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 0 || hasta <= desde || hasta > this.tamano) return null;
    const largo = hasta - desde;
    try {
      const r = await this.fetch(this.url, { headers: { Range: `bytes=${desde}-${hasta - 1}`, "Accept-Encoding": "identity" }, redirect: "manual" });
      const cod = r.headers.get("content-encoding");
      if (cod && cod.toLowerCase() !== "identity") return this.fallo();
      if (r.status === 206) {
        const cr = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(r.headers.get("content-range") ?? "");
        if (!cr || Number(cr[1]) !== desde || Number(cr[2]) !== hasta - 1) return this.fallo();
      } else if (r.status === 200) {
        if (desde !== 0 || hasta !== this.tamano) return this.fallo();
      } else return this.fallo();
      const cl = r.headers.get("content-length");
      if (cl !== null && Number(cl) !== largo) return this.fallo();
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length !== largo) return this.fallo();
      this.ok++;
      this.seguidos = 0;
      this.bytes += largo;
      return b;
    } catch {
      return this.fallo();
    }
  }

  /** Capa de piezas del sidecar (`<url>.enj-capa`). La verifica quien llama contra la raíz. */
  async leerCapa(nPiezas: number): Promise<Uint8Array[] | null> {
    if (this.muerto) return null;
    try {
      const u = new URL(this.url);
      u.pathname += SUFIJO_CAPA;
      const r = await this.fetch(u.href, { headers: { "Accept-Encoding": "identity" }, redirect: "manual" });
      if (r.status !== 200) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length !== nPiezas * BYTES_HASH) return null;
      const out: Uint8Array[] = [];
      for (let i = 0; i < nPiezas; i++) out.push(b.slice(i * BYTES_HASH, (i + 1) * BYTES_HASH));
      return out;
    } catch {
      return null;
    }
  }
}
