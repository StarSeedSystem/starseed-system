/**
 * StarSeed OS — Conversación fluida (VZR1011D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Plática fluida con latencia medida, voz por trozos, interrupción y capas.
 * Elige motor por latencia MEDIDA en esta neurona (primer audio y RTF),
 * no por teórica. Empieza con primera frase mientras el LLM sigue escribiendo
 * y sintetiza la siguiente mientras suena la anterior.
 */

import { trocearTexto } from "@/lib/voces/trocear";

export interface MedidaLatenciaMotor {
  primerAudioMs: number;
  rtf: number;
  muestras: number;
  ultimaMedidaAt: number;
}

export interface CandidatoMotor {
  id: string;
  capa: "aparato" | "otra_neurona" | "malla_grupo" | "spaces" | "sistema";
  disponible: boolean;
  prioridad?: number;
}

export interface OpcionesConversacionFluida {
  presupuestoMs?: number;
  reloj?: () => number;
  onInicioTrozo?: (trozo: string, indice: number) => void;
  onAudioListo?: (trozo: string, indice: number, blobOrUrl: unknown) => void;
  onInterrumpido?: () => void;
  sintetizar?: (motorId: string, trozo: string) => Promise<unknown>;
}

const CLAVE_LATENCIAS = "starseed.voz.latencia.medida.v1";
const PRESUPUESTO_DEFECTO = 800;

function leerLatencias(): Record<string, MedidaLatenciaMotor> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CLAVE_LATENCIAS);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, MedidaLatenciaMotor>;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export function guardarMedidaLatencia(
  motorId: string,
  medida: MedidaLatenciaMotor,
): void {
  if (typeof window === "undefined") return;
  try {
    const all = leerLatencias();
    const prev = all[motorId];
    const muestras = (prev?.muestras || 0) + (medida.muestras || 1);
    const primerAudioMs = prev
      ? (prev.primerAudioMs * (muestras - 1) + medida.primerAudioMs) / muestras
      : medida.primerAudioMs;
    const rtf = prev
      ? (prev.rtf * (muestras - 1) + medida.rtf) / muestras
      : medida.rtf;
    all[motorId] = {
      primerAudioMs: Math.round(primerAudioMs),
      rtf: Math.round(rtf * 1000) / 1000,
      muestras,
      ultimaMedidaAt: Date.now(),
    };
    window.localStorage.setItem(CLAVE_LATENCIAS, JSON.stringify(all));
  } catch {
    /* */
  }
}

export function obtenerMedidaLatencia(
  motorId: string,
): MedidaLatenciaMotor | null {
  const all = leerLatencias();
  return all[motorId] || null;
}

function ahora(reloj?: () => number): number {
  if (reloj) return reloj();
  if (typeof performance !== "undefined" && performance.now) return performance.now();
  return Date.now();
}

export function elegirMotorPorLatenciaMedida(
  candidatos: CandidatoMotor[],
  presupuestoMs = PRESUPUESTO_DEFECTO,
): CandidatoMotor | null {
  const lat = leerLatencias();
  const ordenCapa: Record<CandidatoMotor["capa"], number> = {
    aparato: 0,
    otra_neurona: 1,
    malla_grupo: 2,
    spaces: 3,
    sistema: 4,
  };
  const viables = candidatos
    .filter((c) => c.disponible)
    .map((c) => {
      const m = lat[c.id];
      const primer = m?.primerAudioMs ?? Number.POSITIVE_INFINITY;
      const cabe = primer <= presupuestoMs;
      return { c, primer, cabe };
    })
    .filter((x) => x.cabe)
    .sort((a, b) => {
      if (a.primer !== b.primer) return a.primer - b.primer;
      const ca = ordenCapa[a.c.prioridad != null ? a.c.capa : a.c.capa];
      const cb = ordenCapa[b.c.prioridad != null ? b.c.capa : b.c.capa];
      if (a.c.prioridad != null && b.c.prioridad != null && a.c.prioridad !== b.c.prioridad) {
        return (a.c.prioridad || 0) - (b.c.prioridad || 0);
      }
      if (ca !== cb) return ca - cb;
      return 0;
    });
  if (viables.length) return viables[0].c;
  const porCapa = candidatos
    .filter((c) => c.disponible)
    .sort((a, b) => {
      const ca = ordenCapa[a.capa];
      const cb = ordenCapa[b.capa];
      if (ca !== cb) return ca - cb;
      if ((a.prioridad || 0) !== (b.prioridad || 0)) return (a.prioridad || 0) - (b.prioridad || 0);
      return 0;
    });
  return porCapa[0] || null;
}

export function construirCapasPorDefecto(): CandidatoMotor[] {
  return [
    { id: "aparato", capa: "aparato", disponible: true },
    { id: "otra_neurona", capa: "otra_neurona", disponible: true },
    { id: "malla_grupo", capa: "malla_grupo", disponible: true },
    { id: "spaces", capa: "spaces", disponible: true },
    { id: "sistema", capa: "sistema", disponible: true },
  ];
}

export function pasarASiguienteCapa(
  capas: CandidatoMotor[],
  actualId: string,
): CandidatoMotor | null {
  const idx = capas.findIndex((c) => c.id === actualId);
  if (idx < 0) return elegirMotorPorLatenciaMedida(capas) || capas.find((c) => c.disponible) || null;
  for (let i = idx + 1; i < capas.length; i++) {
    if (capas[i].disponible) return capas[i];
  }
  return null;
}
