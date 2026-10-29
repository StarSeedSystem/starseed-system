/**
 * Bots · ADN DE AVATAR DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §3 y §8.
 * Con forma «avatar-3d» o «vrm» el cuerpo apunta al ADN de la Biblioteca. Este adaptador lo carga (almacén de
 * ESTE aparato, sin red ni sondeos) o cae a `adnPorDefecto` con el tono de su orbe y dueño `{ tipo: "bot" }`.
 * También traduce la emoción EXPRESADA a expresiones VRM y a un gesto del motor único. PURO salvo el cargador.
 */
import { adnPorDefecto, esRefInterna, sanearAdn, type AdnAvatar, type Expresion } from "@/lib/avatares/adn/adn";
import { gestoDesdeTexto } from "@/lib/avatares/movimiento/sincronia-voz";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import { acotar, type Bot, type Emocion, type EstadoEmocional } from "@/lib/astraura-bots/tipos";

export const FORMAS_AVATAR_3D = ["avatar-3d", "vrm"] as const;
export type FormaAvatar3d = (typeof FORMAS_AVATAR_3D)[number];

/** ¿El cuerpo del bot se dibuja con un ADN 3D (y no con su orbe)? */
export function usaAvatar3d(bot: Pick<Bot, "cuerpo">): boolean {
  return (FORMAS_AVATAR_3D as readonly string[]).includes(bot.cuerpo.forma);
}

/** Cargador inyectable: `ref` interno → ADN válido, o `null` si no está en la Biblioteca. */
export type CargarAdnDeBot = (ref: string) => Promise<AdnAvatar | null>;

/** Id del ADN: el de la referencia si es interna; si no, uno estable por bot. */
export function idAdnDeBot(bot: Pick<Bot, "id" | "cuerpo">): string {
  const ref = bot.cuerpo.avatarRef;
  if (ref?.startsWith("biblioteca:") && esRefInterna(ref)) return ref.slice("biblioteca:".length).slice(0, 80);
  return `adn-bot-${bot.id}`.slice(0, 80);
}

/** ADN de partida del bot: su orbe de siempre, con su tono, listo para personalizar. */
export function adnPorDefectoDeBot(bot: Bot): AdnAvatar {
  return adnPorDefecto(idAdnDeBot(bot), bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

async function cargarDeBiblioteca(ref: string): Promise<AdnAvatar | null> {
  if (typeof window === "undefined") return null;
  const { loadAdnEntry, parseAdnEntry } = await import("./almacen-adn");
  const entrada = await loadAdnEntry(ref);
  return entrada ? parseAdnEntry(entrada) : null;
}

/** El ADN del bot: el guardado bajo su `avatarRef` («biblioteca:…») o el de por defecto. Una referencia externa
 * no se carga nunca; un ADN que no pasa `sanearAdn` tampoco. Sin sondeos: cada llamada lee una vez. */
export async function adnDeBot(bot: Bot, cargar: CargarAdnDeBot = cargarDeBiblioteca): Promise<AdnAvatar> {
  const ref = bot.cuerpo.avatarRef;
  if (usaAvatar3d(bot) && ref?.startsWith("biblioteca:") && esRefInterna(ref)) {
    try {
      const crudo = await cargar(ref);
      const adn = crudo ? sanearAdn(crudo) : null;
      if (adn) return adn;
    } catch { /* almacén ilegible: se usa el de por defecto, nunca se inventa uno */ }
  }
  return adnPorDefectoDeBot(bot);
}

/** Punto de partida por emoción (VRM 1.0); la valencia y la activación lo modulan después. */
const BASE_POR_EMOCION: Record<Emocion, Partial<Record<Expresion, number>>> = {
  calma: { relaxed: 0.6 }, alegria: { happy: 0.8 }, curiosidad: { surprised: 0.2, relaxed: 0.15 },
  concentracion: { neutral: 0.5 }, preocupacion: { sad: 0.45 }, ternura: { relaxed: 0.65 }, asombro: { surprised: 0.8 },
};
const EMOCIONES_VRM: readonly Expresion[] = ["happy", "sad", "angry", "surprised", "relaxed", "neutral"];

/** Emoción expresada → pesos de las expresiones emocionales de VRM 1.0 (0…1). Determinista. */
export function expresionesDeEmocion(estado: EstadoEmocional): Partial<Record<Expresion, number>> {
  const valencia = acotar(estado.valencia, -1, 1);
  const activacion = acotar(estado.activacion);
  const pesos: Partial<Record<Expresion, number>> = { ...(BASE_POR_EMOCION[estado.emocion] ?? {}) };
  const sumar = (clave: Expresion, valor: number) => { pesos[clave] = acotar((pesos[clave] ?? 0) + valor); };
  if (valencia >= 0) sumar("happy", valencia * 0.65); else sumar("sad", -valencia * 0.7);
  if (activacion < 0.35) sumar("relaxed", (0.35 - activacion) * 1.3);
  if (activacion > 0.65) {
    if (valencia < -0.15) sumar("angry", (activacion - 0.65) * 1.6);
    else if (valencia > 0.15) sumar("happy", (activacion - 0.65) * 0.7);
    else sumar("surprised", (activacion - 0.65) * 1.4);
  }
  sumar("neutral", Math.max(0, 0.3 - Math.abs(valencia) * 0.2 - activacion * 0.15));
  const salida: Partial<Record<Expresion, number>> = {};
  for (const clave of EMOCIONES_VRM) {
    const peso = pesos[clave] ?? 0;
    if (peso > 0.01) salida[clave] = Math.round(peso * 1000) / 1000;
  }
  return salida;
}

/** Fuerza del aura: si está ligada a la emoción, respira con la activación; si no, no se toca. */
export function intensidadAuraDeEmocion(adn: AdnAvatar, estado: EstadoEmocional): number {
  return adn.aura.ligadaEmocion ? acotar(adn.aura.intensidad * (0.7 + 0.6 * acotar(estado.activacion))) : adn.aura.intensidad;
}

/** Copia del ADN con las expresiones de la emoción y el aura modulada; conserva visemas y demás claves. */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional): AdnAvatar {
  const expresionBase = { ...adn.expresionBase };
  const emociones = expresionesDeEmocion(estado);
  for (const clave of EMOCIONES_VRM) expresionBase[clave] = emociones[clave] ?? 0;
  return { ...adn, expresionBase, aura: { ...adn.aura, intensidad: intensidadAuraDeEmocion(adn, estado) } };
}

/** Gesto de habla con el carácter del ADN: energía, amplitud, ritmo y postura viajan al motor único. */
export function gestoDeBot(adn: AdnAvatar, estado: EstadoEmocional, texto: string | null | undefined): Gesto | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  const m = adn.movimiento;
  const energia = acotar(m.energia * 0.7 + acotar(estado.activacion) * 0.3);
  const base = gestoDesdeTexto(limpio, { emocion: estado.emocion, energia });
  return {
    ...base,
    prompt: `${base.prompt}; movement energy ${m.energia.toFixed(2)}, amplitude ${m.amplitud.toFixed(2)}, rhythm ${m.ritmo.toFixed(2)}, posture ${m.postura.toFixed(2)}`,
    energia,
  };
}

