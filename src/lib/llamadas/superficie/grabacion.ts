/**
 * Grabación de la llamada con consentimiento visible (LLA1108C) — PURO + orquestación con dependencias
 * inyectadas. Reglas:
 *  · apagada por defecto; solo empieza con una orden explícita de quien graba;
 *  · ANTES de grabar se avisa a TODOS los participantes por el canal de datos de la llamada; si el aviso no
 *    llega a alguno, NO se graba (falla cerrado);
 *  · en cada neurona de la llamada se ve un indicador rojo «Grabando» mientras alguien graba;
 *  · quien se une tarde recibe el aviso al entrar;
 *  · al terminar se ofrece Archivos, Biblioteca o descartar. La grabación es local (MediaRecorder).
 */

export const TIPO_AVISO_GRABACION = "grabacion" as const;

export interface AvisoGrabacion {
  k: typeof TIPO_AVISO_GRABACION;
  /** Id de la grabación (idempotencia: un aviso repetido no cuenta dos veces). */
  id: string;
  /** Neurona/participante que graba. */
  de: string;
  nombre: string;
  activa: boolean;
  en: number;
}

export type FaseGrabacion = "apagada" | "avisando" | "grabando" | "decidiendo";
export type DestinoGrabacion = "archivos" | "biblioteca" | "descartar";

export interface EstadoGrabacion {
  fase: FaseGrabacion;
  /** Id de MI grabación, si grabo yo. */
  miId: string | null;
  /** Quién graba ahora (yo incluido), por participante. */
  graban: Record<string, { id: string; nombre: string; desde: number }>;
  /** Motivo si el último intento no arrancó. */
  error: string | null;
}

export const GRABACION_INICIAL: EstadoGrabacion = { fase: "apagada", miId: null, graban: {}, error: null };

/** Aplica un aviso (propio o recibido). Idempotente. */
export function aplicarAviso(s: EstadoGrabacion, a: AvisoGrabacion): EstadoGrabacion {
  const graban = { ...s.graban };
  if (a.activa) {
    if (graban[a.de]?.id === a.id) return s;
    graban[a.de] = { id: a.id, nombre: a.nombre, desde: a.en };
  } else {
    if (!graban[a.de] || graban[a.de].id !== a.id) return s;
    delete graban[a.de];
  }
  return { ...s, graban };
}

/** Un participante se fue: su grabación (si la hacía) deja de contar. */
export function quitarParticipante(s: EstadoGrabacion, id: string): EstadoGrabacion {
  if (!s.graban[id]) return s;
  const graban = { ...s.graban };
  delete graban[id];
  return { ...s, graban };
}

/** Indicador rojo en TODAS las neuronas: se ve mientras alguien grabe. */
export function hayGrabacion(s: EstadoGrabacion): boolean {
  return Object.keys(s.graban).length > 0;
}

export function textoIndicador(s: EstadoGrabacion, yo: string): string {
  const otros = Object.entries(s.graban).filter(([id]) => id !== yo).map(([, v]) => v.nombre);
  const grabaYo = !!s.graban[yo];
  if (grabaYo && otros.length) return `Grabando (tú y ${otros.join(", ")})`;
  if (grabaYo) return "Grabando (tú)";
  if (otros.length) return `${otros.join(", ")} ${otros.length === 1 ? "está grabando" : "están grabando"} esta llamada`;
  return "";
}

/** Avisos que hay que mandar a quien entra tarde: uno por cada grabación en marcha. */
export function avisosParaNuevo(s: EstadoGrabacion): AvisoGrabacion[] {
  return Object.entries(s.graban).map(([de, v]) => ({ k: TIPO_AVISO_GRABACION, id: v.id, de, nombre: v.nombre, activa: true, en: v.desde }));
}

export function esAvisoGrabacion(v: unknown): v is AvisoGrabacion {
  const o = v as Record<string, unknown> | null;
  return !!o && o.k === TIPO_AVISO_GRABACION && typeof o.id === "string" && typeof o.de === "string" && typeof o.activa === "boolean";
}

export interface DepsGrabacion {
  yo: string;
  nombre: string;
  ahora: () => number;
  nuevoId: () => string;
  /** Participantes de la llamada que no son yo. */
  otros: () => string[];
  /** Manda el aviso a todos; devuelve los ids a los que SÍ se entregó. */
  avisar: (a: AvisoGrabacion) => Promise<string[]>;
  /** Arranca el MediaRecorder local. */
  arrancar: () => Promise<void>;
}

export interface ResultadoInicio {
  ok: boolean;
  estado: EstadoGrabacion;
  motivo?: string;
}

/** Orden explícita de grabar. Falla cerrado si el aviso no llega a todos. */
export async function iniciarGrabacion(s: EstadoGrabacion, d: DepsGrabacion): Promise<ResultadoInicio> {
  if (s.fase !== "apagada") return { ok: false, estado: s, motivo: "Ya hay una grabación en marcha o por resolver." };
  const id = d.nuevoId();
  const aviso: AvisoGrabacion = { k: TIPO_AVISO_GRABACION, id, de: d.yo, nombre: d.nombre, activa: true, en: d.ahora() };
  const otros = d.otros();
  let entregado: string[] = [];
  try {
    entregado = otros.length ? await d.avisar(aviso) : [];
  } catch {
    entregado = [];
  }
  const sinAviso = otros.filter((o) => !entregado.includes(o));
  if (sinAviso.length) {
    return {
      ok: false,
      estado: { ...s, error: "No se grabó: el aviso no llegó a todos los participantes." },
      motivo: "No se grabó: el aviso de grabación no llegó a todos los participantes y todos tienen que saberlo.",
    };
  }
  try {
    await d.arrancar();
  } catch {
    // Se retira el aviso: no hay grabación real.
    try {
      await d.avisar({ ...aviso, activa: false, en: d.ahora() });
    } catch {
      /* nada */
    }
    return { ok: false, estado: { ...s, error: "No se pudo abrir la grabadora de este aparato." }, motivo: "No se pudo abrir la grabadora de este aparato." };
  }
  const estado = aplicarAviso({ ...s, fase: "grabando", miId: id, error: null }, aviso);
  return { ok: true, estado };
}

/** Parar: se avisa a todos (el indicador se apaga) y se pasa a decidir el destino. */
export async function pararGrabacion(s: EstadoGrabacion, d: Pick<DepsGrabacion, "yo" | "nombre" | "ahora" | "avisar">): Promise<EstadoGrabacion> {
  if (s.fase !== "grabando" || !s.miId) return s;
  const aviso: AvisoGrabacion = { k: TIPO_AVISO_GRABACION, id: s.miId, de: d.yo, nombre: d.nombre, activa: false, en: d.ahora() };
  try {
    await d.avisar(aviso);
  } catch {
    /* el aviso de parada es mejor esfuerzo; el indicador ajeno caduca al irse */
  }
  return { ...aplicarAviso(s, aviso), fase: "decidiendo" };
}

/** Resolver el destino. «descartar» borra; las otras dos devuelven qué guardar. */
export function resolverDestino(s: EstadoGrabacion, destino: DestinoGrabacion): { estado: EstadoGrabacion; guardar: Exclude<DestinoGrabacion, "descartar"> | null } {
  if (s.fase !== "decidiendo") return { estado: s, guardar: null };
  return { estado: { ...s, fase: "apagada", miId: null }, guardar: destino === "descartar" ? null : destino };
}
