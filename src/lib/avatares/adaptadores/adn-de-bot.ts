/**
 * Avatares 3D · ADN de un BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6, §8
 * y architecture/astraura-bots.md §12 (la orbe del bot puede ser su avatar 3D).
 *
 * Un bot con `cuerpo.forma` `avatar-3d` o `vrm` guarda en `cuerpo.avatarRef` la referencia de su
 * ADN (`biblioteca:…`; nunca una URL externa suelta). `adnDeBot` usa ese ADN si se lo entrega
 * quien lo leyó del almacén (una lectura por sesión y revisión) o crea el de por defecto con el
 * tono de la orbe y dueño `{tipo:'bot'}`. La emoción expresada (valencia + activación) se traduce
 * a expresiones VRM 1.0 y modula el aura; el habla se traduce a visemas y a un gesto para el motor
 * único de movimiento, respetando el carácter `adn.movimiento`.
 *
 * PURO: sin React, red, disco, reloj ni azar. El almacén y el motor se inyectan desde el cliente.
 */
import { acotar, type Bot, type Emocion, type EstadoEmocional } from "@/lib/astraura-bots/tipos";
import { adnPorDefecto, esRefInterna, sanearAdn, type AdnAvatar, type Expresion } from "@/lib/avatares/adn/adn";
import { gestoDesdeTexto } from "@/lib/avatares/movimiento/sincronia-voz";
import type { Gesto } from "@/lib/avatares/movimiento/motor";

/** Lo mínimo que hace falta para resolver el ADN de un bot (no la personalidad ni los sentidos). */
export type BotParaAdn = Pick<Bot, "id" | "nombre" | "cuerpo">;

/** Formas de cuerpo que pueden vestir un ADN 3D (las demás siguen su camino: orbe, ser o robot). */
export function esFormaAvatar3d(forma: Bot["cuerpo"]["forma"]): boolean {
  return forma === "avatar-3d" || forma === "vrm";
}

/** Referencia `biblioteca:` del ADN del bot, o `null` si la forma no es 3D o la referencia no es interna. */
export function refAdnDeBot(bot: Pick<Bot, "cuerpo">): string | null {
  if (!esFormaAvatar3d(bot.cuerpo.forma)) return null;
  const ref = bot.cuerpo.avatarRef;
  return esRefInterna(ref) && ref.startsWith("biblioteca:") ? ref : null;
}

const ID_DE_REF = (ref: string): string => ref.slice("biblioteca:".length);

/**
 * ADN del bot. `fuente` puede ser el ADN ya leído del almacén o un cargador puro `(ref) => ADN`.
 * Solo se acepta el ADN guardado si es de ESTE bot y de ESTA referencia; si no, se crea el de por
 * defecto con el tono de su orbe. Nunca se inventa una base ni se guarda una URL externa.
 */
export function adnDeBot(bot: BotParaAdn, fuente?: unknown): AdnAvatar {
  const ref = refAdnDeBot(bot);
  const candidato = ref && typeof fuente === "function" ? (fuente as (r: string) => unknown)(ref) : fuente;
  const guardado = sanearAdn(candidato);
  if (
    ref && guardado && guardado.id === ID_DE_REF(ref) &&
    guardado.dueno.tipo === "bot" && guardado.dueno.id === bot.id
  ) return guardado;

  const id = ref ? ID_DE_REF(ref) : `adn-bot-${bot.id}`;
  return adnPorDefecto(id, bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

/* ───────────────────── Emoción expresada → cara y aura ───────────────────── */

/** Las cinco expresiones emocionales del contrato (VRM 1.0). */
export const EXPRESIONES_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
export type ExpresionEmocion = (typeof EXPRESIONES_EMOCION)[number];

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export interface EntradaEmocion {
  valencia: number;
  activacion: number;
  emocion?: Emocion;
}

/**
 * Expresión (o expresiones) que expresa el estado. Manda la valencia y la activación, con el
 * nombre de la emoción solo para desambiguar el asombro. Siempre devuelve valores en 0…1.
 */
export function expresionesDeEmocion(e: EntradaEmocion): Partial<Record<ExpresionEmocion, number>> {
  const v = acotar(Number.isFinite(e.valencia) ? e.valencia : 0, -1, 1);
  const a = acotar(Number.isFinite(e.activacion) ? e.activacion : 0, 0, 1);
  const intensidad = r3(0.45 + 0.55 * Math.max(Math.abs(v), a));

  if (e.emocion === "asombro" && a >= 0.5) return { surprised: intensidad };
  if (v <= -0.35) return a >= 0.6 ? { angry: intensidad } : { sad: intensidad };
  if (v >= 0.35) return { happy: intensidad };
  if (a >= 0.8) return { surprised: intensidad };
  return { relaxed: intensidad };
}

/** Intensidad del aura para este estado: si no está ligada a la emoción, la del ADN no cambia. */
export function auraDeEmocion(adn: Pick<AdnAvatar, "aura">, e: EntradaEmocion): number {
  const base = acotar(adn.aura.intensidad);
  if (!adn.aura.ligadaEmocion) return base;
  const v = acotar(Number.isFinite(e.valencia) ? e.valencia : 0, -1, 1);
  const a = acotar(Number.isFinite(e.activacion) ? e.activacion : 0, 0, 1);
  const brillo = 0.75 + 0.5 * ((v + 1) / 2); // 0,75 (apagado) … 1,25 (luminoso)
  const pulso = 0.9 + 0.2 * a;               // 0,9 (reposo) … 1,1 (muy activo)
  return r3(acotar(base * brillo * pulso));
}

/**
 * ADN listo para dibujar este fotograma emocional: una sola expresión emocional activa, las demás
 * a cero (sin caras contradictorias), y el aura modulada si está ligada. No muta ni sube `rev`:
 * es una proyección de pantalla, no un cambio guardado.
 */
export function adnConEmocion(adn: AdnAvatar, e: EntradaEmocion): AdnAvatar {
  const activa = expresionesDeEmocion(e);
  const expresionBase: AdnAvatar["expresionBase"] = { ...adn.expresionBase };
  for (const k of EXPRESIONES_EMOCION) expresionBase[k] = activa[k] ?? 0;
  return {
    ...adn,
    expresionBase,
    aura: { ...adn.aura, intensidad: auraDeEmocion(adn, e) },
  };
}

/* ───────────────────────── Habla: visemas y gesto ───────────────────────── */

/** Vocales del español → visemas de VRM 1.0 (la boca que se abre al hablar). */
const VISEMA_POR_VOCAL: Record<string, Expresion> = {
  a: "aa", á: "aa", e: "ee", é: "ee", i: "ih", í: "ih", o: "oh", ó: "oh", u: "ou", ú: "ou", ü: "ou",
};
/** Los cinco visemas que dibuja la boca. */
export const VISEMAS = ["aa", "ih", "ou", "ee", "oh"] as const;

/**
 * Visemas que produce un texto, en orden y sin repetir el mismo dos veces seguidas. Las consonantes
 * no abren boca por sí solas: se apoyan en la vocal siguiente (igual que el troceo de
 * `sincronia-voz.ts`, que da el gesto de la misma frase). Devuelve `[]` sin vocales.
 */
export function visemasDeTexto(texto: string): Expresion[] {
  const out: Expresion[] = [];
  for (const letra of (texto ?? "").toLowerCase()) {
    const visema = VISEMA_POR_VOCAL[letra];
    if (!visema || out[out.length - 1] === visema) continue;
    out.push(visema);
    if (out.length >= 64) break;
  }
  return out;
}

/** ADN con la boca en un visema (y los otros cuatro a cero); conserva la expresión emocional. */
export function adnConVisema(adn: AdnAvatar, visema: Expresion, intensidad = 0.8): AdnAvatar {
  if (!(VISEMAS as readonly string[]).includes(visema)) return adn;
  const valor = acotar(intensidad);
  const expresionBase: AdnAvatar["expresionBase"] = { ...adn.expresionBase };
  for (const v of VISEMAS) expresionBase[v] = 0;
  expresionBase[visema] = r3(valor);
  return { ...adn, expresionBase };
}

/**
 * Gesto para `moverAvatar` con el MISMO carácter del ADN: `energia` y `amplitud` modulan la
 * energía del gesto; `ritmo` estira o comprime su duración. La emoción solo tiñe el prompt.
 */
export function gestoDeBot(adn: AdnAvatar, texto: string, e?: EntradaEmocion): Gesto {
  const base = gestoDesdeTexto(texto, {
    ...(e?.emocion ? { emocion: e.emocion } : {}),
  });
  const m = adn.movimiento;
  const factor = 0.55 + 0.5 * acotar(m.energia) + 0.25 * acotar(m.amplitud);
  const energia = r3(acotar((base.energia ?? 0.5) * factor));
  const duracionMs = Math.max(400, Math.round((base.duracionMs ?? 2400) * (0.7 + 0.6 * acotar(m.ritmo))));
  return { ...base, energia, duracionMs };
}
