/**
 * servidor-voz-sesion.ts — elección autogestionada del servidor de voz de la
 * sesión (Ola 1015V · S · architecture/voz-fusionada-astraura.md §5). Puro:
 * decide QUIÉN oye y QUIÉN habla para una sesión (solo, grupo o llamada)
 * entre las fichas medidas de §5, con histéresis y relevo. Nada de red,
 * disco ni relojes internos: todo entra inyectado.
 */

/** Máxima edad del latido de una ficha para considerarla viva (contrato §5). */
export const LATIDO_MAX_MS = 2 * 60 * 1000;
/** RAM mínima para SERVIR oído (Phonon-2 pesa 164 MB) y habla (Q4_K_M ≈ 600 MB). */
export const OIDO_RAM_MIN_MB = 200;
export const HABLA_RAM_MIN_MB = 600;
/** Histéresis: para cambiar el servidor vivo, el nuevo debe ser un 30 % mejor. */
export const MEJORA_MINIMA = 0.3;

/** Capacidad de oído de una neurona, MEDIDA (§5): menor `latenciaMs`, mejor. */
export interface OidoCandidato { motor: string; latenciaMs: number }
/** Capacidad de habla medida (§5): `latenciaMs` = mediana del primer sonido. */
export interface HablaCandidato { motor: string; latenciaMs: number }

/** Lo que persona llamada pulsa latido, a la altura del anuncio de §5. */
export interface FichaServidorVoz {
  id: string;
  /** Cuenta de quien publica la ficha; la confianza se decide con ella. */
  duenio?: string;
  /** true si es tuya (lo sabe quien llama, aquí no se inventa). */
  propia?: boolean;
  /** El Oracle A1 (24/7), servidor de oído para quien no tenga motor propio. */
  esA1?: boolean;
  /** Última señal viva de la neurona (ms desde el epoch). */
  t: number;
  ramLibreMb: number;
  oido?: OidoCandidato[];
  habla?: HablaCandidato[];
}

export interface SesionVoz {
  /** Identificadores de cuenta de los miembros (tú incluido, si quieres). */
  miembros: string[];
  tipo: "solo" | "grupo" | "llamada";
}

/** Elección anterior, para la histéresis y el relevo. */
export interface ServidorVozActual { oido?: string; habla?: string }

export interface EleccionServidorVoz {
  oido?: string;
  habla?: string;
  /** Por qué quedó así: texto para la interfaz y para saber que no falló. */
  motivo: string;
}

const esPositivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const esMotor = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.length <= 64;

/** Sanea una lista media de la ficha: nada inventado, lo inválido se descarta. */
function listaCapacidades(l: unknown): { motor: string; latenciaMs: number }[] {
  if (!Array.isArray(l)) return [];
  const res: { motor: string; latenciaMs: number }[] = [];
  for (const e of l) {
    const v = e as Partial<OidoCandidato>;
    if (v && esMotor(v.motor) && esPositivo(v.latenciaMs)) {
      res.push({ motor: v.motor, latenciaMs: v.latenciaMs });
    }
  }
  return res;
}

/** Convierte una ficha de malla (quizá ajena o corrupta) en ficha saneada; inválida → null. */
export function fichaValida(x: unknown): FichaServidorVoz | null {
  try {
    if (!x || typeof x !== "object") return null;
    const f = x as Partial<FichaServidorVoz>;
    if (typeof f.id !== "string" || f.id.trim() === "" || f.id.length > 128) return null;
    if (!esPositivo(f.t) || !esPositivo(f.ramLibreMb)) return null;
    const saneada = fichaDe(f);
    return saneada.oido.length > 0 || saneada.habla.length > 0 ? saneada : null;
  } catch {
    return null;
  }
}

function fichaDe(f: Partial<FichaServidorVoz>): FichaServidorVoz {
  return {
    id: f.id as string,
    duenio: typeof f.duenio === "string" ? f.duenio : undefined,
    propia: f.propia === true,
    esA1: f.esA1 === true,
    t: f.t as number,
    ramLibreMb: f.ramLibreMb as number,
    oido: listaCapacidades(f.oido),
    habla: listaCapacidades(f.habla),
  };
}

/* ---- Elección (§5) ---- */

export interface EntradaElegirServidorVoz {
  sesion: SesionVoz;
  /** Fichas medidas de §5 (las tuyas, las de los miembros y las que lleguen). */
  fichas: readonly unknown[];
  /** Ahora, en ms desde el epoch (inyectado: la elección es pura). */
  ahora: number;
  /** Elección anterior: la histéresis y el relevo parten de ella. */
  actual?: ServidorVozActual;
}

const esViva = (f: FichaServidorVoz, ahora: number): boolean =>
  esPositivo(f.t) && ahora - f.t >= 0 && ahora - f.t < LATIDO_MAX_MS;

/** Confianza (§5): tus neuronas, las de los miembros de la sesión o el A1 (24/7). */
const esDeConfianza = (f: FichaServidorVoz, miembros: string[]): boolean =>
  f.propia === true || f.esA1 === true ||
  (typeof f.duenio === "string" && miembros.includes(f.duenio));

/** Mejor medida (menor latencia) de una lista; null si no hay ninguna. */
function mejorDe(l: { motor: string; latenciaMs: number }[]): { motor: string; latenciaMs: number } | null {
  if (l.length === 0) return null;
  return [...l].sort((a, b) => a.latenciaMs - b.latenciaMs || a.motor.localeCompare(b.motor))[0];
}

type Rol = "oido" | "habla";
const RAM_MIN: Record<Rol, number> = { oido: OIDO_RAM_MIN_MB, habla: HABLA_RAM_MIN_MB };

interface EleccionRol { id: string; relevado: boolean }

/**
 * Elige uno de los dos papeles entre las fichas ya filtradas (vivas y de
 * confianza). Con `actualId` vivo y con capacidad: histéresis (cambia solo
 * si el mejor es un 30 % mejor). Con el actual muerto o sin capacidad: relevo.
 */
function elegirRol(
  fichas: FichaServidorVoz[], rol: Rol, actualId: string | undefined,
): EleccionRol | null {
  const candidatas = fichas
    .filter((f) => (f[rol]?.length ?? 0) > 0 && f.ramLibreMb >= RAM_MIN[rol])
    .map((f) => ({ f, mejor: mejorDe(f[rol] ?? []) }))
    .filter((r): r is { f: FichaServidorVoz; mejor: { motor: string; latenciaMs: number } } => r.mejor !== null)
    .sort((a, b) => a.mejor.latenciaMs - b.mejor.latenciaMs || a.f.id.localeCompare(b.f.id));
  if (candidatas.length === 0) return null;
  const nueva = candidatas[0];
  const activa = actualId === undefined ? undefined : fichas.find((f) => f.id === actualId);
  const conCapacidad = activa?.[rol]?.length ?? 0;
  if (activa !== undefined && conCapacidad > 0 && activa.ramLibreMb >= RAM_MIN[rol]) {
    const latActual = mejorDe(activa[rol] ?? [])!.latenciaMs;
    if (nueva.mejor.latenciaMs > latActual * (1 - MEJORA_MINIMA)) {
      return { id: activa.id, relevado: false };
    }
  }
  return { id: nueva.f.id, relevado: activa !== undefined };
}

/**
 * elegirServidorVoz — elige el oído y la voz de la sesión entre las fichas medidas:
 * menor latencia, RAM libre suficiente, viva (latido < 2 min) y de confianza, con
 * histéresis (solo cambia si el nuevo es un 30 % mejor o el actual dejó de latir).
 * Nunca lanza; sin candidato devuelve solo el motivo (jamás una excepción).
 */
export function elegirServidorVoz(e: EntradaElegirServidorVoz): EleccionServidorVoz {
  try {
    const miembros = e.sesion?.miembros ?? [];
    const fichas = (e.fichas ?? [])
      .map((x) => fichaValida(x))
      .filter((f): f is FichaServidorVoz => f !== null)
      .filter((f) => esViva(f, e.ahora) && esDeConfianza(f, miembros));
    if (fichas.length === 0) return { motivo: "sin fichas vivas y de confianza" };
    const oido = elegirRol(fichas, "oido", e.actual?.oido);
    const habla = elegirRol(fichas, "habla", e.actual?.habla);
    const partes: string[] = [];
    if (oido) partes.push(`oído en ${oido.id}${oido.relevado ? " (relevado)" : ""}`);
    if (habla) partes.push(`voz en ${habla.id}${habla.relevado ? " (relevado)" : ""}`);
    if (!oido) partes.push("sin oído con RAM suficiente");
    if (!habla) partes.push("sin voz con RAM suficiente");
    return {
      ...(oido ? { oido: oido.id } : {}),
      ...(habla ? { habla: habla.id } : {}),
      motivo: partes.join(" · "),
    };
  } catch {
    return { motivo: "no se pudo elegir servidor" };
  }
}
