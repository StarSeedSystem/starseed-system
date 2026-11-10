/**
 * puerta/actividad — qué pasa por la malla, en llano (PTA1110A · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Puro: sin red ni DOM.
 *
 *  · `clasificarTrafico`: de qué tipo es un túnel (navegación, datos de StarSeed, descarga, actualización, IA, capas) a
 *    partir de host y puerto. Solo host y puerto: el contenido va cifrado de punta a punta y nadie lo ve.
 *  · `AvisosRuta`: avisos de cambio de ruta SIN bucles (histéresis y un aviso por cambio real).
 *  · `textoIndicador` / `velocidadTexto`: «Internet por: MaggaBook · Bluetooth directo · 240 kb/s».
 */

import type { TipoUso } from "@/lib/malla/puerta/politica";
import { HOST_IA_NEURONA, PUERTOS_IA_LOCAL, hostEsPrivado } from "@/lib/malla/puerta/capas";

export const NOMBRE_USO: Record<TipoUso, string> = {
  navegacion: "navegación",
  datos: "datos de StarSeed",
  descargas: "descarga",
  actualizaciones: "actualización",
  ia: "IA",
  capas: "capas",
};

/** Un túnel que ha movido más que esto se considera una descarga grande. */
export const BYTES_DESCARGA_GRANDE = 1024 * 1024;

const RE_ACTUALIZACION = /(^|\.)(github\.com|githubusercontent\.com|releases\.github\.com)$|(^|\.)updates?\./i;
const RE_IA = /(^|\.)(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai|integrate\.api\.nvidia\.com|api\.groq\.com|api\.mistral\.ai|api\.together\.xyz|api\.cohere\.com)$/i;
const RE_CAPAS = /(^|\.)(huggingface\.co|hf\.co|cdn-lfs\.huggingface\.co|cdn-lfs-us-1\.hf\.co)$/i;

export interface ContextoTrafico {
  /** Hosts propios del OS (su Supabase, su dominio). */
  hostsStarSeed?: readonly string[];
}

export function clasificarTrafico(host: string, puerto: number, ctx: ContextoTrafico = {}): TipoUso {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === HOST_IA_NEURONA || (PUERTOS_IA_LOCAL.includes(puerto) && hostEsPrivado(h))) return "ia";
  if (hostEsPrivado(h)) return "capas";
  if (RE_IA.test(h)) return "ia";
  if (RE_CAPAS.test(h)) return "capas";
  if ((ctx.hostsStarSeed ?? []).some((x) => x && (h === x || h.endsWith("." + x))) || /(^|\.)supabase\.(co|in)$/.test(h) || /(^|\.)starseed[\w-]*\./.test(h)) return "datos";
  if (RE_ACTUALIZACION.test(h)) return "actualizaciones";
  return "navegacion";
}

/** «240 kb/s» (por debajo de 1000) o «1,2 Mb/s». `null` = sin medir. */
export function velocidadTexto(bytesPorSegundo: number | null | undefined): string {
  if (bytesPorSegundo == null || !Number.isFinite(bytesPorSegundo) || bytesPorSegundo < 0) return "sin medir";
  const kbps = (bytesPorSegundo * 8) / 1000;
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1).replace(".", ",")} Mb/s` : `${Math.round(kbps)} kb/s`;
}

export function bytesTexto(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MiB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KiB`;
  return `${Math.max(0, Math.round(b))} B`;
}

export interface EntradaIndicador {
  nombre: string;
  enlace: string;
  saltos: number;
  /** Bytes por segundo ahora mismo por ese carril, si se mide. */
  bytesPorSegundo: number | null;
}

/** «Internet por: MaggaBook · Bluetooth directo · 240 kb/s» (+ « · 1 salto»). */
export function textoIndicador(e: EntradaIndicador): string {
  const saltos = e.saltos > 0 ? ` · ${e.saltos} ${e.saltos === 1 ? "salto" : "saltos"}` : "";
  return `Internet por: ${e.nombre} · ${e.enlace}${saltos} · ${velocidadTexto(e.bytesPorSegundo)}`;
}

/* ───────────────────────── Avisos de cambio de ruta ───────────────────────── */

export interface ObservacionRuta {
  /** Esta neurona tiene salida propia ahora. */
  conInternet: boolean;
  /** Por quién sale cuando no la tiene (null = nadie / sin túneles). */
  por: { nombre: string; enlace: string } | null;
  /** Hay puertas conocidas (para decir «sin salida y nadie presta la suya»). */
  hayPuertas: boolean;
}

export interface AvisoRuta {
  id: string;
  tipo: "por-malla" | "salida-propia" | "cambio-puerta" | "sin-salida";
  texto: string;
  ts: number;
}

/**
 * Máquina de avisos sin bucles. Un aviso solo sale cuando el ESTADO ESTABLE cambia: una observación nueva debe repetirse
 * `CONFIRMACIONES` veces seguidas (o durar `ESTABLE_MS`) antes de contar, y entre dos avisos del mismo tipo pasan al menos
 * `ENFRIAMIENTO_MS`. Así un enlace que parpadea (Bluetooth que se cae y vuelve) no llena la pantalla de avisos.
 */
export const CONFIRMACIONES = 2;
export const ENFRIAMIENTO_MS = 45_000;

type Estable = { modo: "propia" } | { modo: "malla"; nombre: string; enlace: string } | { modo: "nada" };
const claveDe = (o: ObservacionRuta): string => (o.conInternet ? "propia" : o.por ? `malla|${o.por.nombre}|${o.por.enlace}` : "nada");

export class AvisosRuta {
  private estable: Estable | null = null;
  private candidata = "";
  private veces = 0;
  private ultimoPorTipo = new Map<string, number>();
  private seq = 0;

  constructor(private ahora: () => number = () => Date.now()) {}

  /** Anota una observación. Devuelve el aviso si toca darlo, o null. */
  observar(o: ObservacionRuta): AvisoRuta | null {
    const k = claveDe(o);
    const actual = this.estable ? this.claveEstable() : null;
    if (k === actual) {
      this.candidata = "";
      this.veces = 0;
      return null;
    }
    if (k !== this.candidata) {
      this.candidata = k;
      this.veces = 1;
    } else this.veces++;
    // El primer estado conocido se adopta sin avisar (no hay «cambio» que contar al arrancar).
    if (this.estable === null) {
      this.adoptar(o);
      return null;
    }
    if (this.veces < CONFIRMACIONES) return null;
    const previo = this.estable;
    this.adoptar(o);
    return this.avisoDe(previo, o);
  }

  private claveEstable(): string {
    const e = this.estable;
    if (!e) return "";
    return e.modo === "propia" ? "propia" : e.modo === "malla" ? `malla|${e.nombre}|${e.enlace}` : "nada";
  }

  private adoptar(o: ObservacionRuta): void {
    this.estable = o.conInternet ? { modo: "propia" } : o.por ? { modo: "malla", nombre: o.por.nombre, enlace: o.por.enlace } : { modo: "nada" };
    this.candidata = "";
    this.veces = 0;
  }

  private avisoDe(previo: Estable, o: ObservacionRuta): AvisoRuta | null {
    const t = this.ahora();
    let tipo: AvisoRuta["tipo"];
    let texto: string;
    if (o.conInternet) {
      tipo = "salida-propia";
      texto = "Volvió tu internet: ya sales por tu propia conexión.";
    } else if (o.por) {
      tipo = previo.modo === "malla" ? "cambio-puerta" : "por-malla";
      texto = previo.modo === "malla" ? `Ahora por ${o.por.nombre} vía ${o.por.enlace}.` : `Sin Wi‑Fi: ahora por ${o.por.nombre} vía ${o.por.enlace}.`;
    } else if (o.hayPuertas) {
      return null; // hay puertas pero aún no se abrió ningún túnel: no es un cambio que avisar
    } else {
      tipo = "sin-salida";
      texto = "Sin internet y ninguna neurona cercana presta la suya.";
    }
    const ult = this.ultimoPorTipo.get(tipo) ?? -Infinity;
    if (t - ult < ENFRIAMIENTO_MS) return null;
    this.ultimoPorTipo.set(tipo, t);
    return { id: `ruta-${++this.seq}`, tipo, texto, ts: t };
  }
}
