/**
 * Invitar a más gente a una llamada en curso (LLA1108C) — PURO. Una llamada 1:1 pasa a ser una llamada de
 * grupo en malla completa (cada aparato envía a los demás) dentro de los límites de hoy
 * (`MAX_GRUPO_MALLA`, `MAX_VIDEO_GRUPO_MALLA`). Se explican los límites en vez de fallar en silencio.
 */
import { MAX_GRUPO_MALLA, MAX_VIDEO_GRUPO_MALLA } from "@/lib/llamadas/grupo-malla";

export type ClaseInvitable = "usuario" | "neurona" | "grupo";
export interface Invitable {
  id: string;
  nombre: string;
  clase: ClaseInvitable;
  /** Para un grupo: cuántas personas aporta (sin contar a quien ya está). */
  miembros?: number;
}

export interface PlanInvitacion {
  /** Quién entra. */
  entran: Invitable[];
  /** Quién se queda fuera por el tope, con el motivo. */
  fuera: Array<{ invitable: Invitable; motivo: string }>;
  /** Tamaño final de la llamada. */
  total: number;
  /** El vídeo se degrada a voz (demasiada gente para la malla con vídeo). */
  degradaVideo: boolean;
  /** Se pasa de 1:1 a grupo. */
  pasaAGrupo: boolean;
  /** Explicación honesta de los límites, siempre presente. */
  texto: string;
}

export const TEXTO_LIMITES = `Una llamada de grupo sin servidor admite hasta ${MAX_GRUPO_MALLA} personas, y hasta ${MAX_VIDEO_GRUPO_MALLA} con vídeo: cada aparato envía su imagen a todos los demás y más gente saturaría la red local.`;

export function planInvitar(e: { actuales: number; conVideo: boolean; invitar: Invitable[] }): PlanInvitacion {
  const entran: Invitable[] = [];
  const fuera: PlanInvitacion["fuera"] = [];
  const vistos = new Set<string>();
  let total = Math.max(1, e.actuales);
  for (const inv of e.invitar) {
    if (vistos.has(inv.id)) continue;
    vistos.add(inv.id);
    const aporta = inv.clase === "grupo" ? Math.max(1, inv.miembros ?? 1) : 1;
    if (total + aporta > MAX_GRUPO_MALLA) {
      fuera.push({
        invitable: inv,
        motivo: inv.clase === "grupo" ? `«${inv.nombre}» aporta ${aporta} personas y no caben (máximo ${MAX_GRUPO_MALLA}).` : `No cabe nadie más (máximo ${MAX_GRUPO_MALLA}).`,
      });
      continue;
    }
    entran.push(inv);
    total += aporta;
  }
  const degradaVideo = e.conVideo && total > MAX_VIDEO_GRUPO_MALLA;
  const pasaAGrupo = entran.length > 0 && e.actuales <= 2;
  const partes: string[] = [];
  if (pasaAGrupo) partes.push("La llamada pasa a ser de grupo.");
  if (degradaVideo) partes.push(`Con ${total} personas el vídeo se pasa a solo voz (el vídeo admite ${MAX_VIDEO_GRUPO_MALLA}).`);
  if (fuera.length) partes.push(`${fuera.length === 1 ? "Una invitación no cabe" : `${fuera.length} invitaciones no caben`}.`);
  partes.push(TEXTO_LIMITES);
  return { entran, fuera, total, degradaVideo, pasaAGrupo, texto: partes.join(" ") };
}
