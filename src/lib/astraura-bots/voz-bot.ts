/**
 * Bots/dots de Astraura · VOZ PROPIA DE CADA BOT (VZR1011E · 2026-10-24).
 * Contrato: architecture/astraura-voces-y-robots.md §3 (voz de cada bot) y §2.5 (viaja con la
 * memoria compartida, así suena igual en todas las neuronas): se fusiona con `fusionarVozBot`;
 * sin el motor en una neurona, `adaptarVozANeurona` elige el más parecido y lo dice.
 * La unión con chatterbox.ts (dial 0,25…0,9), openvoice2.ts (estilos), engine-registry.ts
 * (motores y cadena AUTO) y clonacion.ts (consentimiento registrado) va en el cableado.
 * PURO: sin React, red, DOM, reloj ni node:* (guardia en __tests__/pureza.test.ts); semilla
 * determinista por id de bot — nada de azar — y motores disponibles como argumento, sin sondeos.
 */
import { EMOCIONES, acotar, type Emocion } from "./tipos";

/** Motores que la voz de un bot puede preferir (ids del registro de voz del OS). */
export const MOTORES_VOZ = [
  "chatterbox", "openvoice2", "omnivoice", "voice158", "vibevoice", "voxcpm", "voicebox", "gpt-sovits", "bark",
] as const;
export type MotorVoz = (typeof MOTORES_VOZ)[number];

/** Estilos EXACTOS que acepta el Space de OpenVoice V2 (openvoice2.ts:84). */
export const ESTILOS_OPENVOICE = [
  "en_default", "en_us", "en_br", "en_au", "en_in",
  "es_default", "fr_default", "jp_default", "zh_default", "kr_default",
] as const;
export type EstiloOpenVoice = (typeof ESTILOS_OPENVOICE)[number];

/** De dónde sale el timbre del bot. `propia` exige consentimiento registrado. */
export type OrigenTimbre = "semilla" | "catalogo" | "propia";

/** Estilo que el bot aplica cuando siente una emoción: exageración (dial de Chatterbox
 * 0,25…0,9, 0,5 neutro) + estilo del Space de OpenVoice V2 + tono natural (instruct). */
export interface EstiloDeEmocion {
  exageracion: number;
  estilo: EstiloOpenVoice;
  tono: string;
}

/** La voz clonada del DUEÑO del bot (timbre id [a-z0-9-], 2-40, en el daemon de voz local,
 * guardado por cuenta). «Consentimiento» ya se pidió y se registró vía clonacion.ts:
 * sin `true` este clón NO se usa (nunca se imita a una persona real sin él). */
export interface ReferenciaClon {
  timbreId: string;
  duenoCuentaId: string;
  consentimiento: boolean;
}

/** Perfil de voz de un bot: timbre + motor preferido + mapa emoción → estilo. La semilla
 * es una voz INVENTADA determinista (nunca la de una persona real); «timbreCatalogo» apunta
 * a `src/lib/aurora/timbres.ts` y «clon» es la voz del dueño con consentimiento registrado;
 * «actualizado» lo escribe quien guarda y ordena las fusiones de sync. */
export interface VozBot {
  botId: string;
  origen: OrigenTimbre;
  semilla: string;
  timbreCatalogo?: string;
  clon?: ReferenciaClon;
  motorPreferido: MotorVoz;
  emociones: Record<Emocion, EstiloDeEmocion>;
  actualizado: number;
}

/** Estilo con que el bot vive cada emoción, de fábrica (dial 0,25…0,9; estilo OpenVoice). */
const TABLA_DE: Record<Emocion, [number, EstiloOpenVoice, string]> = {
  calma: [0.35, "es_default", "voz calmada y respirada"],
  alegria: [0.7, "es_default", "voz luminosa, con compás rápido"],
  curiosidad: [0.55, "es_default", "voz curiosa, alargando la pregunta"],
  concentracion: [0.3, "es_default", "voz firme y precisa"],
  preocupacion: [0.45, "es_default", "voz baja y cuidadosa"],
  ternura: [0.5, "es_default", "voz suave y cercana"],
  asombro: [0.75, "es_default", "voz amplia, con pausa de asombro"],
};

/** El estilo con que el bot vive una emoción, según la tabla del perfil. */
export function estiloDe(e: Emocion): EstiloDeEmocion {
  const [exageracion, estilo, tono] = TABLA_DE[e];
  return { exageracion, estilo, tono };
}

/** Llena el mapa de emociones con lo que la parte escriba; lo inválido cae al defecto. */
function mapaEmociones(entrada: unknown): Record<Emocion, EstiloDeEmocion> {
  const base = entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? (entrada as Record<string, Partial<EstiloDeEmocion>>) : {};
  const mapa = {} as Record<Emocion, EstiloDeEmocion>;
  for (const e of EMOCIONES) {
    const c = base[e];
    const def = estiloDe(e);
    if (!c || typeof c !== "object") { mapa[e] = def; continue; }
    const x = Number(c.exageracion);
    mapa[e] = {
      exageracion: Number.isFinite(x) ? acotar(x, 0.25, 0.9) : def.exageracion,
      estilo: (ESTILOS_OPENVOICE as readonly string[]).includes(String(c.estilo)) ? c.estilo as EstiloOpenVoice : def.estilo,
      tono: typeof c.tono === "string" && c.tono.trim() ? c.tono.trim().slice(0, 120) : def.tono,
    };
  }
  return mapa;
}

/** Hash FNV-1a de 32 bits en hex (la misma técnica de `semillaEstable` de chatterbox.ts). */
function hashHex(s: string): string {
  let h = 5381;
  for (const t of s) h = ((h << 5) + h + t.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Semilla sintética determinista del bot: la misma en todas las neuronas. */
export function semillaDeBot(botId: string): string { return `st-${hashHex(`voz:${botId}`)}`; }

/** Perfil por defecto: semilla sintética del bot, Chatterbox de motor y el mapa de fábrica. */
export function vozBotDefecto(botId: string, ahora: number): VozBot {
  return { botId, origen: "semilla", semilla: semillaDeBot(botId), motorPreferido: "chatterbox",
    emociones: mapaEmociones(null), actualizado: ahora };
}

const TIMBRE_RE = /^[a-z0-9-]{2,40}$/;

/** Acepta un perfil (habitualmente llegado de red) y devuelve uno SANADO, o `null`. */
export function normalizarVozBot(x: unknown): VozBot | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const v = x as Partial<VozBot>;
  if (!v.botId || typeof v.botId !== "string") return null;
  const c = v.clon && typeof v.clon === "object" && !Array.isArray(v.clon) ? v.clon as Partial<ReferenciaClon> : null;
  // REGLA DURA: un clón sin consentimiento EXPLÍCITO registrado nunca viaja ni se usa.
  const clon = c && c.consentimiento && typeof c.duenoCuentaId === "string" && c.duenoCuentaId
    && TIMBRE_RE.test(String(c.timbreId ?? ""))
    ? { timbreId: String(c.timbreId), duenoCuentaId: String(c.duenoCuentaId), consentimiento: true }
    : undefined;
  const timbreCatalogo = typeof v.timbreCatalogo === "string" && TIMBRE_RE.test(v.timbreCatalogo) ? v.timbreCatalogo : undefined;
  let origen: OrigenTimbre = "semilla";
  if (v.origen === "catalogo" && timbreCatalogo) origen = "catalogo";
  else if (v.origen === "propia" && clon) origen = "propia";
  return {
    botId: v.botId, origen,
    semilla: typeof v.semilla === "string" && v.semilla.trim() ? v.semilla.trim().slice(0, 64) : semillaDeBot(v.botId),
    ...(timbreCatalogo ? { timbreCatalogo } : {}),
    ...(clon ? { clon } : {}),
    motorPreferido: (MOTORES_VOZ as readonly string[]).includes(String(v.motorPreferido))
      ? v.motorPreferido as MotorVoz : "chatterbox",
    emociones: mapaEmociones(v.emociones),
    actualizado: typeof v.actualizado === "number" && Number.isFinite(v.actualizado) && v.actualizado >= 0 ? v.actualizado : 0,
  };
}

/** Timbre que el bot usa EN REALIDAD: «propia» solo con consentimiento registrado. */
export function timbreUsableDe(v: VozBot): { origen: OrigenTimbre; semilla: string; timbreId?: string } {
  if (v.origen === "propia" && v.clon?.consentimiento) return { origen: "propia", semilla: v.semilla, timbreId: v.clon.timbreId };
  if (v.origen === "catalogo" && v.timbreCatalogo) return { origen: "catalogo", semilla: v.semilla, timbreId: v.timbreCatalogo };
  return { origen: "semilla", semilla: v.semilla };
}

/**
 * El motor más PARECIDO de cada motor (familia de voz: clonación por referencia, estilos,
 * multilingüe). Orden local a cada entrada, deducido de `AUTO_ENDPOINT_ORDER` (engine-registry.ts).
 */
const PARECIDO: Record<MotorVoz, readonly MotorVoz[]> = {
  chatterbox: ["openvoice2", "voicebox", "omnivoice", "bark"],
  openvoice2: ["chatterbox", "voicebox", "omnivoice", "gpt-sovits", "bark"],
  omnivoice: ["openvoice2", "chatterbox", "voice158", "vibevoice", "gpt-sovits"],
  voice158: ["omnivoice", "openvoice2", "chatterbox", "vibevoice"],
  vibevoice: ["voice158", "omnivoice", "voxcpm", "gpt-sovits"],
  voxcpm: ["vibevoice", "voicebox", "omnivoice", "gpt-sovits"],
  voicebox: ["openvoice2", "chatterbox", "voxcpm", "gpt-sovits", "omnivoice"],
  "gpt-sovits": ["voicebox", "openvoice2", "chatterbox", "voxcpm", "omnivoice"],
  bark: ["chatterbox", "voicebox", "omnivoice", "openvoice2"],
} as const;

/** Qué motor hablará este bot en ESTA neurona; `motor: null` = la voz del sistema. */
type Adaptacion = { motor: MotorVoz | null; aviso: string };
export function adaptarVozANeurona(v: VozBot, motores: readonly MotorVoz[]): Adaptacion {
  const disponibles = new Set(motores);
  if (disponibles.has(v.motorPreferido)) return { motor: v.motorPreferido, aviso: "" };
  for (const m of PARECIDO[v.motorPreferido]) {
    if (disponibles.has(m)) {
      return { motor: m, aviso: `Esta neurona no tiene ${v.motorPreferido}; habla con ${m}, el más parecido.` };
    }
  }
  return { motor: null, aviso: "Esta neurona no tiene ningún motor de voz: hablará con la voz del sistema." };
}

/** Serializa el perfil en un orden FIJO de claves: la misma cadena en todas partes. */
export function serializarVozBot(v: VozBot): string {
  return JSON.stringify({ botId: v.botId, origen: v.origen, semilla: v.semilla,
    timbreCatalogo: v.timbreCatalogo ?? null, clon: v.clon ?? null, motorPreferido: v.motorPreferido,
    emociones: v.emociones, actualizado: v.actualizado } as const);
}

/** Revive una cadena serializada (o llegada de red); `null` si no es un perfil válido. */
export function deserializarVozBot(texto: string): VozBot | null {
  try { return normalizarVozBot(JSON.parse(texto)); } catch { return null; }
}

/** Huella corta del perfil: comprobar en un vistazo que dos neuronas llevan la misma voz. */
export function huellaVoz(v: VozBot): string { return hashHex(serializarVozBot(v)).slice(0, 8); }
/** Une lo local y lo remoto por botId: gana el más reciente; lo remoto inválido se descarta. */
export function fusionarVozBot(l: VozBot | null, r: VozBot | null): VozBot | null {
  const lv = l ? normalizarVozBot(l) : null;
  const rv = r ? normalizarVozBot(r) : null;
  if (lv && rv && lv.botId === rv.botId) return lv.actualizado >= rv.actualizado ? lv : rv;
  return lv ?? rv;
}
