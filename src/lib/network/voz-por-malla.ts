/**
 * voz-por-malla — manejadores PUROS de `voz.hablar` y `oido.transcribir` para el
 * relé `capacidad.*` (Ola 1018V · VST1018K). Una neurona con VoiceStudio sirve
 * voz y oído a su cuenta o a un grupo autorizado. Sin red, disco, reloj ni audio:
 * todo entra por parámetros (así se prueba sin micrófono ni altavoz).
 *
 * Reglas (architecture/voz-voicestudio.md §3-§4): misma cuenta o grupo con
 * `permiteVoz` y sus dos cuentas dentro; voz o audio ajeno exige permiso de
 * `clonacion.ts`; `personal` nunca en grupo/comunidad/público/comercial y
 * `desconocida` nunca. `licencia-voz.ts` aún no existe en main: la regla de
 * `vigia-modelos.md` §3-§4 se aplica aquí sobre la clase de cada motor.
 */
import { puedeClonar, type PermisoVoz, type UsoVoz } from "@/lib/aurora/voz-starseed/clonacion";

export type { PermisoVoz };

export type ContextoVozMalla = UsoVoz;
export type ClaseLicenciaVoz = "libre" | "condicionada" | "personal" | "desconocida";

export interface MotorVozMalla {
  id: string; claseLicencia: ClaseLicenciaVoz;
  /** La condición de la licencia se cumple en este contexto. */
  condicionCumplida?: boolean;
  /** Menor gana; a igualdad, el orden de la lista. */
  prioridad?: number;
}

export interface GrupoVozMalla {
  id: string; miembros: string[];
  /** El grupo autorizó prestar voz y oído a sus miembros. */
  permiteVoz: boolean;
}

export interface PeticionVozMalla {
  /** Cuenta que pide. */ solicitante: string;
  /** Cuenta dueña de la neurona. */ anfitrion: string;
  /** Contexto de uso; obligatorio (nunca se asume «personal»). */ contexto: ContextoVozMalla;
  grupo?: GrupoVozMalla;
  /** Voz pedida y su titular (por defecto, el propio solicitante). */ voz?: string; titularVoz?: string;
  /** Persona dueña del audio transcrito (por defecto, el solicitante). */ audioDe?: string;
  /** Permisos de clonación registrados (módulo puro `clonacion.ts`). */ permisos?: PermisoVoz[];
  /** Motores de esa neurona con su clase de licencia. */ motores?: MotorVozMalla[];
  /** Reloj inyectable, en ms. */ ahora: number;
}

export interface ResultadoVozMalla { ok: boolean; motor?: string; motivo: string; }

export const CONTEXTOS_VOZ_MALLA: readonly ContextoVozMalla[] = [
  "personal", "grupo", "comunidad", "publico", "comercial",
];

export function esContextoVozMalla(x: unknown): x is ContextoVozMalla {
  return typeof x === "string" && (CONTEXTOS_VOZ_MALLA as readonly string[]).includes(x);
}

/** `libre` siempre; `condicionada` con su condición; `personal` solo en lo personal. */
export function licenciaAdmitida(
  clase: ClaseLicenciaVoz, contexto: ContextoVozMalla, condicionCumplida = false,
): boolean {
  if (clase === "desconocida") return false;
  if (clase === "personal") return contexto === "personal";
  if (clase === "libre") return true;
  return condicionCumplida;
}

/** Motor preferido (menor `prioridad`) entre los que la licencia permite. */
export function elegirMotorVoz(motores: MotorVozMalla[], contexto: ContextoVozMalla): MotorVozMalla | null {
  let mejor: MotorVozMalla | null = null;
  for (const motor of motores) {
    const admitido = licenciaAdmitida(motor.claseLicencia, contexto, motor.condicionCumplida === true);
    if (!admitido) continue;
    if (!mejor || (motor.prioridad ?? 100) < (mejor.prioridad ?? 100)) mejor = motor;
  }
  return mejor;
}

/** Solo la misma cuenta o un grupo con la voz compartida y sus dos cuentas dentro. */
export function motivoAccesoVoz(p: PeticionVozMalla): string | null {
  if (p.solicitante === p.anfitrion) return null;
  if (p.contexto === "personal") return "Un préstamo entre cuentas no puede usar el contexto personal.";
  const g = p.grupo;
  if (!g || !g.permiteVoz) return "Solo se atiende a la misma cuenta o a un grupo con la voz compartida.";
  if (!g.miembros.includes(p.solicitante)) return "El solicitante no pertenece al grupo.";
  if (!g.miembros.includes(p.anfitrion)) return "La neurona que sirve no pertenece al grupo.";
  return null;
}

/** Voz/audio propio o permiso vigente del titular. Puro: el reloj viene en `p.ahora`. */
export function motivoPermisoVoz(p: PeticionVozMalla, sujeto: string): string | null {
  if (!sujeto || sujeto === p.solicitante) return null;
  const r = puedeClonar({
    solicitante: p.solicitante, titular: sujeto, uso: p.contexto, permisos: p.permisos ?? [], ahora: p.ahora,
  });
  return r.ok ? null : r.motivo ?? "No hay permiso válido para usar esta voz.";
}

function atender(p: PeticionVozMalla, sujeto: string): ResultadoVozMalla {
  if (!esContextoVozMalla(p.contexto)) {
    return { ok: false, motivo: "Contexto no válido: personal, grupo, comunidad, público o comercial." };
  }
  const acceso = motivoAccesoVoz(p);
  if (acceso) return { ok: false, motivo: acceso };
  const permiso = motivoPermisoVoz(p, sujeto);
  if (permiso) return { ok: false, motivo: permiso };
  const motor = elegirMotorVoz(p.motores ?? [], p.contexto);
  if (!motor) return { ok: false, motivo: `No hay motor con licencia admitida para «${p.contexto}».` };
  return { ok: true, motor: motor.id, motivo: `Servido por «${motor.id}» (licencia ${motor.claseLicencia}) para «${p.contexto}».` };
}

/** `voz.hablar`: sintetiza con la voz pedida (por defecto la del solicitante). */
export function manejarVozHablar(p: PeticionVozMalla): ResultadoVozMalla {
  return atender(p, p.titularVoz ?? p.solicitante);
}

/** `oido.transcribir`: transcribe el audio (por defecto el del solicitante). */
export function manejarOidoTranscribir(p: PeticionVozMalla): ResultadoVozMalla {
  return atender(p, p.audioDe ?? p.solicitante);
}
