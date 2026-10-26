/**
 * transporte-protomolecula — el canal «protomolecula» de una sesión (F3B, PM1010F3B).
 * ═══════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/protomolecula.md` §6. Sobre el canal de aplicación
 * «protomolecula» del transporte universal (`malla/transporte-universal.ts`) viajan:
 *   · confirmaciones de parámetro (P1): `ElementoSala` de `sesion-sincronia.ts`;
 *   · gestos y presencia (P0): mensajes EFÍMEROS, la fusión no los guarda;
 *   · eco para medir la latencia por enlace (p50/p95 solo con muestras).
 * `t` de cada operación sale del reloj común de la sesión, que enseña su precisión
 * y NO inventa una sin muestras. Sin enlace: «solo en este aparato».
 *
 * Módulo PURO: envío, recepción y reloj van INYECTADOS; en las pruebas no hay red.
 * El cableado real (enviarMensaje + alRecibirMensaje) es de una tarea posterior.
 */
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
import type { Cambio, EstadoValores, Molecula, Operacion, ValorParametro } from "./tipos";

export const CANAL_SESION = "protomolecula";

/** Cómo se ve un enlace de transporte (para decir «por dónde va»). */
export interface VistaEnlace {
  tipo: string;
  etiqueta: string;
}

/** Lo mínimo que el enlace pide al reloj común (`estaciones/reloj-comun.ts` ya lo cumple). */
export interface RelojSesion {
  /** Hora común del reloj compartido (ms). */
  hora(): number;
  /** Hora local de este aparato (ms): con ella se mide la latencia. */
  horaLocal(): number;
  /** Estado del reloj: modo y precisión (sin muestras, no la inventa). */
  informe(): EstadoReloj;
}

export interface MensajeSesion {
  v: 1;
  sesion: string;
  de: string;
  tipo: "cambios" | "gesto" | "presencia" | "eco";
  /** Solo en «cambios»: confirmaciones de operación (P1). */
  elementos?: ElementoSala[];
  /** En «gesto» y «presencia»: quién toca qué. */
  datos?: { atomoId: string; parametroId: string; valor?: ValorParametro; quien?: string };
  /** En «eco»: la pregunta que se devuelve tal cual (id + t0). */
  eco?: { id: string; t: number } | null;
}

export interface PuertaSesion {
  enviar(m: MensajeSesion): VistaEnlace | null;
  recibir(cb: (m: MensajeSesion, enlace: VistaEnlace | null) => void): void;
}

export interface OpcionesEnlaceSesion {
  /** Id de la sesión de la molécula (todos los mensajes lo llevan). */
  sesion: string;
  /** Id de este aparato: anti-eco y desempate de la fusión. */
  dispositivo: string;
  puerta: PuertaSesion;
  reloj: RelojSesion;
  /** La molécula de ESTE lado (el estado se aplica y se avisa por `alMolecula`). */
  molecula: () => Molecula;
  alMolecula?: (m: Molecula) => void;
  alGesto?: (datos: { atomoId: string; parametroId: string; valor?: ValorParametro }, enlace: VistaEnlace | null) => void;
  alPresencia?: (datos: { atomoId: string; parametroId: string; quien?: string }, enlace: VistaEnlace | null) => void;
  /** Muestras mínimas para dar p50/p95 (por defecto 5). */
  muestrasMinimas?: number;
}

export interface EnlaceSesion {
  /** Difunde una confirmación de operación por el canal (P1). */
  difundir(op: Operacion, cambio: Cambio): void;
  /** Gesto efímero (arrastrar): solo el último valor cada ≥ 16 ms. */
  gesto(atomoId: string, parametroId: string, valor: ValorParametro): void;
  /** Presencia P0: quién está moviendo qué. */
  presencia(datos: { atomoId: string; parametroId: string; quien: string }): void;
  /** Manda un ping para el medidor de latencia. */
  medir(): void;
  /** Hora común del reloj de la sesión (ms). */
  horaComun(): number;
  informeReloj(): { modo: string; precisionMs: number | null; texto: string };
  /** Latencia medida por el enlace. Sin muestras suficientes: «sin medir». */
  latencia(): { muestras: number; minimo: number; p50Ms: number | null; p95Ms: number | null; texto: string };
  /** Por qué enlace va la sesión, o «solo en este aparato» si no hay ninguno. */
  canal(): string;
}
