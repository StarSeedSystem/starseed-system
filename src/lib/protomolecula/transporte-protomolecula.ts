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
  latencia(): { muestras: number; minimoMs: number | null; p50Ms: number | null; p95Ms: number | null; texto: string };
  /** Por qué enlace va la sesión, o «solo en este aparato» si no hay ninguno. */
  canal(): string;
}

/* ═══════════════════════ Implementación ═══════════════════════ */

/** Arrastrar manda a 60 Hz: un gesto cada ≥ 16 ms (§6.2); el resto lo pone la confirmación al soltar. */
const REJILLA_GESTO_MS = 16;
/** Topes honestos: ecos sin respuesta y muestras de latencia que se recuerdan. */
const TOPE_ECOS = 64;
const TOPE_MUESTRAS = 48;
/** Un eco que tardara más que esto queda huérfano (enlace caído). */
const RTT_MAX_MS = 60_000;

export function crearEnlaceSesion(op: OpcionesEnlaceSesion): EnlaceSesion {
  const minMuestras = Math.max(1, op.muestrasMinimas ?? 5);
  const rtts: number[] = [];
  /** Ids de eco que este aparato preguntó (pendientes de vuelta) y que ya devolvió (anti tormenta). */
  const pendientesEco = new Map<string, number>();
  const atendidos = new Set<string>();
  let ultimoEnlace: VistaEnlace | null = null;
  let ultGesto = -Infinity;
  let nEco = 0;

  const por = (tipo: MensajeSesion["tipo"], extra: Partial<MensajeSesion> = {}): MensajeSesion =>
    ({ v: 1, sesion: op.sesion, de: op.dispositivo, tipo, ...extra });

  const mandar = (m: MensajeSesion): void => {
    const vista = op.puerta.enviar(m);
    if (vista) ultimoEnlace = vista;
  };

  op.puerta.recibir((m, enlace) => {
    if (enlace) ultimoEnlace = enlace;
    if (m.de === op.dispositivo || m.sesion !== op.sesion) return;
    if (m.tipo === "eco") {
      const eco = m.eco;
      if (!eco) return;
      const t0 = pendientesEco.get(eco.id);
      if (t0 !== undefined) {
        pendientesEco.delete(eco.id);
        const rtt = op.reloj.horaLocal() - t0;
        if (rtt >= 0 && rtt <= RTT_MAX_MS) {
          rtts.push(rtt);
          if (rtts.length > TOPE_MUESTRAS) rtts.shift();
        }
        return;
      }
      if (atendidos.has(eco.id)) return;
      if (atendidos.size >= TOPE_ECOS) atendidos.delete(atendidos.keys().next().value as string);
      atendidos.add(eco.id);
      mandar(por("eco", { eco: { id: eco.id, t: eco.t } }));
      return;
    }
    // P0 efímero: presencia y gesto se AVISAN y nunca se guardan (§6.2).
    if (m.tipo === "gesto" && m.datos && m.datos.valor !== undefined) {
      op.alGesto?.({ atomoId: m.datos.atomoId, parametroId: m.datos.parametroId, valor: m.datos.valor }, enlace ?? null);
      return;
    }
    if (m.tipo === "presencia" && m.datos) {
      op.alPresencia?.({ atomoId: m.datos.atomoId, parametroId: m.datos.parametroId, quien: m.datos.quien }, enlace ?? null);
      return;
    }
    if (m.tipo === "cambios" && m.elementos?.length) {
      const elementos = m.elementos;
      const fusion = moleculaDesdeElementos(op.molecula(), elementos);
      const valores: EstadoValores = { ...fusion.valores };
      let toco = false;
      for (const el of elementos) {
        if (el.tipo !== "parametro" || el.borrado) continue;
        const v = el.datos.valor;
        if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
          valores[el.id] = v;
          toco = true;
        }
      }
      const nueva: Molecula = toco
        ? { ...fusion, valores, version: fusion.version + 1, actualizadaEn: Math.max(fusion.actualizadaEn, ...elementos.map((e) => e.actualizadoEn)) }
        : fusion;
      op.alMolecula?.(nueva);
    }
  });

  return {
    /** P1: confirmación completa. El `t` de la operación ya lo puso el controlador con el reloj común. */
    difundir(operacion: Operacion, cambio: Cambio): void {
      mandar(por("cambios", { elementos: [elementoDeOperacion(operacion, cambio)] }));
    },
    gesto(atomoId: string, parametroId: string, valor: ValorParametro): void {
      const r = op.reloj.horaLocal();
      if (r - ultGesto < REJILLA_GESTO_MS) return;
      ultGesto = r;
      mandar(por("gesto", { datos: { atomoId, parametroId, valor } }));
    },
    presencia(datos: { atomoId: string; parametroId: string; quien: string }): void {
      mandar(por("presencia", { datos: { ...datos } }));
    },
    medir(): void {
      const id = `eco-${op.sesion}-${op.dispositivo}-${++nEco}`;
      if (pendientesEco.size >= TOPE_ECOS) {
        const viejo = pendientesEco.keys().next().value as string | undefined;
        if (viejo) pendientesEco.delete(viejo);
      }
      const t0 = op.reloj.horaLocal();
      pendientesEco.set(id, t0);
      mandar(por("eco", { eco: { id, t: t0 } }));
    },
    horaComun(): number {
      return op.reloj.hora();
    },
    /** El reloj común enseña su modo y su precisión; sin muestras, sin cifra. */
    informeReloj(): { modo: string; precisionMs: number | null; texto: string } {
      const e = op.reloj.informe();
      const texto = e.modo === "referencia"
        ? "referencia: la hora común es la de este aparato"
        : e.modo === "sincronizado"
          ? `sincronizado · precisión ±${e.precisionMs ?? "?"} ms`
          : "sin referencia · sin muestras";
      return { modo: e.modo, precisionMs: e.precisionMs, texto };
    },
    /** p50/p95 solo con las muestras mínimas; antes: «sin medir». */
    latencia() {
      const n = rtts.length;
      const minimoMs = n ? Math.min(...rtts) : null;
      if (n < minMuestras) return { muestras: n, minimoMs, p50Ms: null, p95Ms: null, texto: "sin medir" };
      const s = [...rtts].sort((a, b) => a - b);
      const mitad = Math.floor(n / 2);
      const p50Ms = Math.round(n % 2 ? s[mitad] : (s[mitad - 1] + s[mitad]) / 2);
      const p95Ms = Math.round(s[Math.ceil(n * 0.95) - 1]);
      return { muestras: n, minimoMs, p50Ms, p95Ms, texto: `p50 ${p50Ms} ms · p95 ${p95Ms} ms (${n} muestras)` };
    },
    canal(): string {
      return ultimoEnlace?.etiqueta ?? "solo en este aparato";
    },
  };
}
