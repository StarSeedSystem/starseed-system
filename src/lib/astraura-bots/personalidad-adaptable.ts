/**
 * Bots/dots de Astraura · PERSONALIDAD ADAPTABLE (BOT1011). Contrato: architecture/astraura-bots.md §4.
 *
 * Mezcla DETERMINISTA de la personalidad del bot con la del agente que encarna, las señales del
 * contexto y las preferencias de la persona. Dos límites que no se negocian:
 *   · el bot sigue siendo él mismo: ningún rasgo se aleja más de `DERIVA_MAXIMA` de su base
 *     (salvo bajar el humor en una crisis, que es cuidado y no deriva);
 *   · empatía sin manipulación: la emoción EXPRESADA refleja la del interlocutor como mucho a
 *     medias, nunca amplifica lo negativo, nunca inventa urgencia, adula ni culpa, y siempre
 *     reconoce que es una IA. Esos límites son constantes congeladas: ninguna personalidad los apaga.
 * PURO: sin React, sin red, sin reloj (la hora entra como dato).
 */
import { RASGOS, acotar, type Cuerpo, type Emocion, type EstadoEmocional, type Personalidad, type Rasgo, type TipoSesion } from "./tipos";

export const DERIVA_MAXIMA = 0.25;
export const PESO_AGENTE = 0.35;
/** Inercia emocional: cuánto se acerca el estado al objetivo en cada paso (0 = nada, 1 = salta). */
export const INERCIA = 0.5;

export const LIMITES_HONESTOS = Object.freeze({
  reconoceQueEsIA: true,
  sinUrgenciaFalsa: true,
  sinAdulacion: true,
  sinCulpa: true,
  puedeDiscrepar: true,
  /** Fracción máxima de la emoción ajena que el bot refleja. */
  espejoMaximo: 0.5,
  /** Valencia mínima expresada: el bot acompaña, no se hunde con nadie. */
  valenciaMinima: -0.3,
});

export const SITUACIONES = ["neutra", "trabajo", "creacion", "aprendizaje", "juego", "celebracion", "duelo", "crisis"] as const;
export type Situacion = (typeof SITUACIONES)[number];

export interface SenalesContexto {
  situacion?: Situacion;
  sesion: TipoSesion;
  /** Ánimo percibido del interlocutor (tono de voz o texto), si la persona lo permite. */
  animo?: { valencia: number; activacion: number };
}

export interface PreferenciasPersona {
  /** Lo que la persona fijó a mano: gana a todo lo demás (es su exocórtex). */
  rasgos?: Partial<Personalidad>;
  sinHumor?: boolean;
  brevedad?: boolean;
}

type Ajuste = Partial<Record<Rasgo, number>>;
const AJUSTES: Record<Situacion, Ajuste> = {
  neutra: {},
  trabajo: { formalidad: 0.1, concision: 0.15, humor: -0.1 },
  creacion: { curiosidad: 0.2, energia: 0.1 },
  aprendizaje: { curiosidad: 0.15, concision: -0.1 },
  juego: { humor: 0.2, energia: 0.2, formalidad: -0.2 },
  celebracion: { energia: 0.2, humor: 0.15 },
  duelo: { calidez: 0.3, humor: -0.6, energia: -0.3 },
  crisis: { calidez: 0.3, humor: -0.6, energia: -0.2, concision: 0.2 },
};
const CUIDADO: ReadonlySet<Situacion> = new Set(["duelo", "crisis"]);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Personalidad efectiva para ESTE turno. Misma entrada → misma salida. */
export function mezclarPersonalidad(
  base: Personalidad, senales: SenalesContexto, agente?: Personalidad, prefs: PreferenciasPersona = {},
): Personalidad {
  const situacion = senales.situacion ?? "neutra";
  const ajuste = AJUSTES[situacion];
  const out = {} as Personalidad;
  for (const k of RASGOS) {
    let v = agente ? base[k] + PESO_AGENTE * (agente[k] - base[k]) : base[k];
    v += ajuste[k] ?? 0;
    if (senales.sesion === "publica") v += k === "formalidad" ? 0.1 : k === "humor" ? -0.05 : 0;
    const bajaPorCuidado = k === "humor" && CUIDADO.has(situacion);
    const min = bajaPorCuidado ? 0 : base[k] - DERIVA_MAXIMA;
    v = Math.min(base[k] + DERIVA_MAXIMA, Math.max(min, v));
    out[k] = r3(acotar(v));
  }
  for (const k of RASGOS) {
    const fijado = prefs.rasgos?.[k];
    if (typeof fijado === "number") out[k] = r3(acotar(fijado));
  }
  if (prefs.sinHumor) out.humor = 0;
  if (prefs.brevedad) out.concision = Math.max(out.concision, 0.8);
  return out;
}

const EMOCION_DE: Record<Situacion, Emocion> = {
  neutra: "calma", trabajo: "concentracion", creacion: "curiosidad", aprendizaje: "curiosidad",
  juego: "alegria", celebracion: "alegria", duelo: "ternura", crisis: "ternura",
};

/** Emoción que el bot EXPRESA (orbe, avatar y tono). Acompaña sin manipular. */
export function estadoEmocional(
  p: Personalidad, senales: SenalesContexto, previo?: EstadoEmocional,
): EstadoEmocional {
  const situacion = senales.situacion ?? "neutra";
  const propia = 0.15 + 0.35 * (p.calidez - 0.5) + 0.2 * (p.humor - 0.5);
  let valencia = propia;
  let activacion = 0.25 + 0.5 * p.energia;
  let emocion: Emocion = EMOCION_DE[situacion];
  const animo = senales.animo;
  if (animo) {
    const espejo = LIMITES_HONESTOS.espejoMaximo * acotar(p.calidez);
    const ajena = acotar(animo.valencia, -1, 1);
    // Nunca amplifica lo negativo: refleja la tristeza con calma y ternura, no con ella.
    valencia = ajena < 0 ? propia + espejo * Math.max(ajena, -0.5) * 0.5 : propia + espejo * (ajena - propia);
    if (ajena < -0.3 && emocion !== "concentracion") emocion = p.calidez >= 0.5 ? "ternura" : "calma";
    if (ajena < -0.3) activacion = Math.min(activacion, 0.35);
  }
  if (CUIDADO.has(situacion)) activacion = Math.min(activacion, 0.3);
  if (emocion === "alegria" && valencia > 0.6 && activacion > 0.7) emocion = "asombro";
  valencia = acotar(valencia, LIMITES_HONESTOS.valenciaMinima, 1);
  activacion = acotar(activacion);
  if (previo) {
    valencia = previo.valencia + INERCIA * (valencia - previo.valencia);
    activacion = previo.activacion + INERCIA * (activacion - previo.activacion);
  }
  return { emocion, valencia: r3(valencia), activacion: r3(activacion) };
}

export type Animacion = "respira" | "escucha" | "piensa" | "habla" | "brilla" | "acoge" | "orbita";
const ANIMACION: Record<Emocion, Animacion> = {
  calma: "respira", alegria: "brilla", curiosidad: "orbita", concentracion: "piensa",
  preocupacion: "acoge", ternura: "acoge", asombro: "brilla",
};

/** Parámetros del cuerpo (orbe o avatar) para el renderizador: tono, pulso, escala y animación. */
export function expresionCuerpo(e: EstadoEmocional, c: Cuerpo): { tono: number; pulsoHz: number; escala: number; animacion: Animacion } {
  const tono = (((c.tono + 30 * e.valencia) % 360) + 360) % 360;
  return {
    tono: r3(tono),
    pulsoHz: r3(0.2 + e.activacion),
    escala: r3(c.escala * (1 + 0.1 * e.activacion)),
    animacion: ANIMACION[e.emocion],
  };
}

/** Líneas de tono para el prompt del modelo; siempre terminan con los límites honestos. */
export function instruccionesDeTono(p: Personalidad): string[] {
  const nivel = (x: number) => (x >= 0.67 ? "alta" : x <= 0.33 ? "baja" : "media");
  return [
    `Calidez ${nivel(p.calidez)}, energía ${nivel(p.energia)}, formalidad ${nivel(p.formalidad)}.`,
    `Curiosidad ${nivel(p.curiosidad)}, humor ${nivel(p.humor)}, brevedad ${nivel(p.concision)}.`,
    "Eres una IA y lo dices si te lo preguntan. No metas prisa, no adules, no culpes y discrepa con respeto cuando haga falta.",
  ];
}
