"use client";
/**
 * Bots de Astraura · EXPRESIÓN EN LA ORBE (BOT1011D2). Contrato: architecture/astraura-bots.md §4.
 *
 * La orbe flotante es el cuerpo del bot: su emoción EXPRESADA (personalidad adaptable del núcleo,
 * con los límites honestos) se traduce a `QuantumOrbParams` y se publica en el bus de la orbe
 * cuántica. El ánimo de la voz solo entra si la persona encendió el sentido «Oído emocional».
 */
import { useEffect, useRef, useState } from "react";
import { getActivePersonality, PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
import { isEmotionalHearingEnabled, subscribeUserVoiceEmotion } from "@/lib/aurora/audio-emotion";
import { emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";
import { uidActual } from "@/lib/consumo/usuario";
import { estadoEmocional, expresionCuerpo, mezclarPersonalidad, type SenalesContexto } from "../personalidad-adaptable";
import { ANIMO_DESDE_VOZ, rasgosDesdePersonalidad } from "../personalidad-desde-aurora";
import { botPredeterminado } from "../predeterminado";
import { acotar, type Bot, type EstadoEmocional } from "../tipos";
import { leerBots, suscribirBots } from "./almacen-bots";

export type ExpresionOrbe = ReturnType<typeof expresionCuerpo>;
/** Como mucho 4 emisiones por segundo. */
export const INTERVALO_MIN_MS = 250;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Expresión del cuerpo → parámetros de la orbe cuántica (todos en 0..1).
 * `tonoBase` es el tono de reposo del cuerpo: la diferencia con él es el desplazamiento de tono
 * (±30° por la valencia, que `hueShift` pinta en su escala de ±48°).
 */
export function aParametrosOrbe(expresion: ExpresionOrbe, tonoBase = 200): QuantumOrbParams {
  const delta = ((((expresion.tono - tonoBase) % 360) + 540) % 360) - 180;
  const valencia = acotar(delta / 30, -1, 1);
  const activacion = acotar(expresion.pulsoHz - 0.2);
  const sereno = expresion.animacion === "acoge" || expresion.animacion === "respira";
  return {
    hueShift: r3(acotar(0.5 + delta / 96)),
    breath: r3(acotar(0.2 + 0.7 * activacion)),
    turbulence: r3(acotar(0.1 + 0.6 * activacion)),
    symmetry: r3(acotar(0.5 + 0.4 * valencia)),
    spikiness: r3(sereno ? 0.1 : acotar(0.25 + 0.5 * activacion)),
  };
}

/** Rasgos de la personalidad activa de Aurora (niveladores 0-100) para el núcleo. */
function agenteDeAurora(base: Bot["personalidad"]): Bot["personalidad"] | undefined {
  const t = getActivePersonality()?.traits;
  if (!t) return undefined;
  return rasgosDesdePersonalidad({
    params: { calidez: t.calidez ?? t.empatia, energia: t.entusiasmo, formalidad: t.formalidad, curiosidad: t.curiosidad, humor: t.humor, concision: t.brevedad },
    emotions: { alegria: t.alegria, calma: t.serenidad },
  }, base);
}

/** Expresa en la orbe la emoción y la personalidad de `bot` (sin bot, no hace nada). */
export function useExpresionBot(bot: Bot | null): void {
  const ref = useRef(bot);
  ref.current = bot;
  const repintar = useRef<() => void>(() => {});
  const id = bot?.id ?? "";
  useEffect(() => { repintar.current(); }, [bot]); // editar el bot (rasgos, tono) se ve al momento
  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    let previo: EstadoEmocional | undefined;
    let animo: SenalesContexto["animo"];
    let ultimo = 0;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const emitir = () => {
      espera = null;
      const b = ref.current;
      if (!b) return;
      const senales: SenalesContexto = { sesion: b.dueno.tipo === "perfil" ? "privada" : "grupo", animo };
      // Solo el bot del perfil encarna la personalidad de Aurora de la persona.
      const p = mezclarPersonalidad(b.personalidad, senales, b.dueno.tipo === "perfil" ? agenteDeAurora(b.personalidad) : undefined);
      previo = estadoEmocional(p, senales, previo);
      emitQuantumOrbParams(aParametrosOrbe(expresionCuerpo(previo, b.cuerpo), b.cuerpo.tono));
      ultimo = Date.now();
    };
    const pedir = () => {
      if (espera) return;
      espera = setTimeout(emitir, Math.max(0, INTERVALO_MIN_MS - (Date.now() - ultimo)));
    };
    const quitarVoz = subscribeUserVoiceEmotion((e) => {
      animo = isEmotionalHearingEnabled() ? ANIMO_DESDE_VOZ[e?.mood] : undefined;
      pedir();
    });
    window.addEventListener(PERSONALITY_CHANGED_EVENT, pedir);
    repintar.current = pedir;
    pedir();
    return () => {
      repintar.current = () => {};
      quitarVoz();
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, pedir);
      if (espera) clearTimeout(espera);
    };
  }, [id]);
}

/** Bot predeterminado de la persona (el primero de su perfil); sin sesión, el de esta neurona. */
export function useBotPredeterminado(): Bot | null {
  const [bot, setBot] = useState<Bot | null>(null);
  useEffect(() => {
    let vivo = true, quitar = () => {};
    const fijar = (u: string | null) => {
      if (!vivo) return;
      const leer = () => setBot(u ? (leerBots(u, u)[0] ?? null) : botPredeterminado("local", "local"));
      leer();
      quitar = suscribirBots(leer);
    };
    uidActual().then(fijar, () => fijar(null));
    return () => { vivo = false; quitar(); };
  }, []);
  return bot;
}
