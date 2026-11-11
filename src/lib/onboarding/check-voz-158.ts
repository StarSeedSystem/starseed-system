"use client";

/**
 * CHECK EXPLÍCITO 1.58-BIT VOZ (IMG-diaria-onboarding-fusionado-voz-paso-1-c)
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifica si el motor nativo 1.58-bit de Astraura está disponible en este
 * dispositivo. Se usa en el paso de bienvenida para que el usuario sepa
 * INMEDIATAMENTE qué voz va a sonar, sin sorpresas ni fricción.
 *
 * Devuelve un objeto con: disponible, motor, nota explicativa.
 */

import { hay158, motorPreferido, type MotorVoz } from "@/lib/aurora/motor-voz";

export interface CheckVoz158 {
  /** ¿Está el motor 1.58-bit nativo listo para hablar? */
  disponible: boolean;
  /** Motor que se usará AHORA (1.58, kokoro, omnivoice, sistema, ninguno). */
  motor: MotorVoz["id"];
  /** Nombre legible del motor. */
  nombre: string;
  /** Nota honesta para el usuario: qué implica este motor. */
  nota: string;
  /** ¿Corre entero en local, sin red? */
  local: boolean;
}

/**
 * Ejecuta el check explícito 1.58-bit. Nunca lanza: ante cualquier fallo
 * informa del suelo honesto (voz del sistema o ninguno).
 */
export async function checkVoz158Explicito(): Promise<CheckVoz158> {
  if (typeof window === "undefined") {
    return {
      disponible: false,
      motor: "sistema",
      nombre: "Voz del sistema (servidor)",
      nota: "Ejecutándose en servidor; en el navegador se detectará el motor real.",
      local: false,
    };
  }

  // 1. ¿Está el 1.58-bit nativo listo?
  const nativoListo = await hay158();
  if (nativoListo) {
    return {
      disponible: true,
      motor: "astraura-158",
      nombre: "Astraura 1.58-bit (local)",
      nota: "Nuestro motor nativo en CPU: sin red, sin cuenta y funciona en cualquier dispositivo.",
      local: true,
    };
  }

  // 2. Si no, preguntar al motor preferido qué usará
  const preferido = await motorPreferido();
  return {
    disponible: false,
    motor: preferido.id,
    nombre: preferido.nombre,
    nota: preferido.nota,
    local: preferido.local,
  };
}

/**
 * Versión síncrona que usa solo lo que hay en caché/localStorage.
 * Útil para mostrar algo inmediato mientras se resuelve la async.
 */
export function checkVoz158Rapido(): CheckVoz158 {
  if (typeof window === "undefined") {
    return {
      disponible: false,
      motor: "sistema",
      nombre: "Voz del sistema (servidor)",
      nota: "Ejecutándose en servidor; en el navegador se detectará el motor real.",
      local: false,
    };
  }

  // Señal de respaldo en localStorage
  try {
    const raw = window.localStorage.getItem("starseed.astraura.intelligence.v1");
    if (raw && /astraura-158|1\.58/i.test(raw)) {
      return {
        disponible: true,
        motor: "astraura-158",
        nombre: "Astraura 1.58-bit (local · caché)",
        nota: "Detectado por configuración previa; se confirmará al hablar.",
        local: true,
      };
    }
  } catch { /* sin almacenamiento */ }

  // Fallback: voz del sistema si hay voces
  try {
    if (window.speechSynthesis && window.speechSynthesis.getVoices().length > 0) {
      return {
        disponible: false,
        motor: "sistema",
        nombre: "Voz del sistema (provisional)",
        nota: "Depende del navegador y suena distinta en cada equipo. En cuanto instales el 1.58-bit local, deja de usarse.",
        local: false,
      };
    }
  } catch { /* */ }

  return {
    disponible: false,
    motor: "ninguno",
    nombre: "sin motor disponible",
    nota: "Ningún motor de voz responde en este equipo; la guía sigue en texto.",
    local: false,
  };
}