"use client";

/**
 * NARRACIÓN DE VENTANA (Adenda 193) — la voz que acompaña, sin cola ni retraso.
 * ----------------------------------------------------------------------------
 * Problema real (reportado en vivo): la ventana de sistemas hablaba TARDE y
 * decía pasos que el usuario ya había pasado; al cerrarla, seguía sonando sobre
 * otra pantalla. Causa: cada paso ENCOLABA su frase en el motor de voz, y una
 * cola no sabe que te moviste.
 *
 * Regla de este helper: **solo se narra lo que está en pantalla AHORA**.
 *   · Antes de hablar, corta lo que estuviera sonando o encolado (`interrupt`).
 *   · Si cambias de pestaña o se cierra la ventana antes de empezar, no suena.
 *   · Al desmontar, corta: nada se reproduce «después», en otra ventana.
 *   · Continuidad de voz: usa el MISMO puente que la bienvenida
 *     (`window.STARSEED_AURORA`), así Astraura sigue sonando igual desde el
 *     primer «hola» hasta que tú decidas cambiar su voz en OmniVoice.
 *
 * Silencioso por defecto: si el usuario no activó la voz en la bienvenida, no
 * habla (la marca de sesión `starseed.voz.rito` la deja el rito al empezar).
 */

import { useEffect } from "react";
import { auroraBridge } from "@/components/onboarding/aurora-guide-voice";

const MARCA_VOZ = "starseed.voz.rito";

/** El rito marca que el usuario eligió acompañamiento por voz. */
export function marcarVozDelRito(activa: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (activa) window.sessionStorage.setItem(MARCA_VOZ, "1");
    else window.sessionStorage.removeItem(MARCA_VOZ);
  } catch { /* sin sessionStorage: se sigue en texto */ }
}

/** ¿Vamos en modo voz (el usuario lo eligió al empezar la bienvenida)? */
export function vozDelRitoActiva(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(MARCA_VOZ) === "1"; } catch { return false; }
}

/** Corta cualquier voz en curso o encolada. Nunca lanza. */
export function cortarVoz(): void {
  try { auroraBridge()?.interrupt?.(); } catch { /* sin puente: nada que cortar */ }
}

/**
 * Narra `texto` mientras esté montado y `activo`. Cambiar el texto sustituye la
 * narración al instante (no se encola). Desmontar corta.
 */
export function useNarracionVentana(texto: string | null | undefined, activo = true): void {
  useEffect(() => {
    const t = (texto ?? "").trim();
    if (!activo || !t || !vozDelRitoActiva()) return;
    let vigente = true;
    cortarVoz(); // fuera la cola anterior: solo suena lo de esta pantalla
    // Micro-retardo: deja que el motor corte de verdad antes de arrancar.
    const id = window.setTimeout(() => {
      if (!vigente) return;
      try { auroraBridge()?.speak?.(t); } catch { /* degradamos a texto */ }
    }, 80);
    return () => {
      vigente = false;
      window.clearTimeout(id);
      cortarVoz(); // al cambiar de pestaña o cerrar: silencio inmediato
    };
  }, [texto, activo]);
}
