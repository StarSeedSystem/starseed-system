"use client";

import { useEffect, useRef, useState } from "react";
import type { Bot } from "../tipos";
import { mezclarPersonalidad, estadoEmocional, expresionCuerpo } from "../personalidad-adaptable";
import { PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
import { isEmotionalHearingEnabled, subscribeUserVoiceEmotion, type UserVoiceEmotion } from "@/lib/aurora/audio-emotion";
import { QuantumOrbParams, emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import { botPredeterminado } from "../predeterminado";
import { leerBots } from "./almacen-bots";

/**
 * Hook que escucha la personalidad activa de Aurora y el ánimo de voz,
 * calcula la expresión emocional del bot y la emite como parámetros del orbe cuántico.
 * Se ejecuta máximo 4 veces por segundo.
 */
export function useExpresionBot(bot: Bot | null): QuantumOrbParams | null {
  // Estado para la personalidad activa de Aurora (agente que encarna)
  const [auroraPersonality, setAuroraPersonality] = useState<Partial<Record<string, number>>>({});
  // Estado para el ánimo de voz
  const [voiceEmotion, setVoiceEmotion] = useState<{ valencia: number; activacion: number } | null>(null);
  // Estado para los parámetros del orbe
  const [params, setParams] = useState<QuantumOrbParams | null>(null);
  // Ref para el último estado emocional del bot (para inercia)
  const prevEstadoEmocionalRef = useRef<{ valencia: number; activacion: number } | null>(null);
  // Ref para el último tiempo de emisión (para throttling)
  const lastEmitRef = useRef(0);

  // Escuchar cambios en la personalidad de Aurora
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Asumimos que el detail contiene la personalidad activa de Aurora
      if (detail && typeof detail === "object") {
        setAuroraPersonality(detail as Partial<Record<string, number>>);
      }
    };
    window.addEventListener(PERSONALITY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PERSONALITY_CHANGED_EVENT, handler);
  }, []);

  // Suscribirse al ánimo de voz si está habilitado
  useEffect(() => {
    if (!isEmotionalHearingEnabled()) return;
    const unsubscribe = subscribeUserVoiceEmotion((e: UserVoiceEmotion) => {
      // Convertimos la emoción de voz a valencia y activacion (0..1)
      // Mapeamos el estado de ánimo a valencia y activacion simplificado
      // Esto es una simplificación; en realidad deberíamos usar una tabla de mapeo
      const moodMap: Record<UserVoiceEmotion["mood"], { valencia: number; activacion: number }> = {
        alegre: { valencia: 0.8, activacion: 0.7 },
        sereno: { valencia: 0.6, activacion: 0.3 },
        tenso: { valencia: -0.2, activacion: 0.8 },
        triste: { valencia: -0.6, activacion: 0.2 },
        enérgico: { valencia: 0.4, activacion: 0.9 },
        neutral: { valencia: 0.0, activacion: 0.0 },
      };
      setVoiceEmotion(moodMap[e.mood]);
    });
    return unsubscribe;
  }, [isEmotionalHearingEnabled]);

  // Calcular la expresión emocional del bot y emitir los parámetros del orbe
  useEffect(() => {
    if (!bot) {
      setParams(null);
      return;
    }

    // Obtener el bot predeterminado si no hay bots en almacenamiento o si no hay sesión
    // En esta versión simplificada, usamos el bot proporcionado o el predeterminado
    const currentBot = bot ?? botPredeterminado("local", "local");

    // Obtener la personalidad base del bot
    const basePersonalidad = currentBot.personalidad;

    // Obtener la personalidad del agente (de Aurora)
    const agentePersonalidad = auroraPersonality;

    // Obtener las señales de contexto (simplificado)
    const senales: any = {
      situacion: "neutra", // Por defecto
      sesion: "privada",   // Por defecto
      animo: voiceEmotion ? { valencia: voiceEmotion.valencia, activacion: voiceEmotion.activacion } : undefined,
    };

    // Mezclar la personalidad
    const personalidadMezclada = mezclarPersonalidad(basePersonalidad, senales, agentePersonalidad);

    // Calcular el estado emocional (con inercia)
    const estadoEmocionalActual = estadoEmocional(
      personalidadMezclada,
      senales,
      prevEstadoEmocionalRef.current
        ? { emocion: "calma", valencia: prevEstadoEmocionalRef.current.valencia, activacion: prevEstadoEmocionalRef.current.activacion }
        : undefined
    );

    // Actualizar el ref del estado emocional previo
    prevEstadoEmocionalRef.current = {
      valencia: estadoEmocionalActual.valencia,
      activacion: estadoEmocionalActual.activacion,
    };

    // Calcular la expresión corporal
    const expresion = expresionCuerpo(estadoEmocionalActual, currentBot.cuerpo);

    // Convertir a parámetros del orbe cuántico
    const newParams = aParametrosOrbe(expresion);

    // Emitir con throttling (máximo 4 veces por segundo)
    const ahora = Date.now();
    if (ahora - lastEmitRef.current >= 250) {
      emitQuantumOrbParams(newParams);
      lastEmitRef.current = ahora;
    }

    setParams(newParams);
  }, [bot, auroraPersonality, voiceEmotion]);

  return params;
}

/**
 * Convierte una expresión corporal a parámetros del orbe cuántico.
 * @param expresion - Objeto con tono, pulsoHz, escala y animacion
 * @returns Parámetros para el orbe cuántico (turbulencia, filo, simetría, matiz, respiración)
 */
export function aParametrosOrbe(
  expresion: {
    tono: number;
    pulsoHz: number;
    escala: number;
    animacion: "respira" | "escucha" | "piensa" | "habla" | "brilla" | "acoge" | "orbita";
  }
): QuantumOrbParams {
  // Mapeamos la expresión corporal a los parámetros del orbe
  // Estos mapeos son ejemplos y deben ajustarse según la definición de QuantumOrbParams
  const { tono, pulsoHz, escala, animacion } = expresion;

  // Normalizamos los valores a rangos apropiados (0..1) según la definición de QuantumOrbParams
  // Desde quantum-orb-theme.ts, vemos que los parámetros son:
  //   turbulencia: number; // 0..1
  //   filo: number;        // 0..1
  //   simetria: number;    // 0..1
  //   matiz: number;       // 0..1 (desplazamiento de tono)
  //   respiracion: number; // 0..1

  // Matiz: desplazamiento de tono (0..1) basado en el tono (0-360)
  const matiz = tono / 360;

  // Respiración: basada en el pulsoHz (esperamos alrededor de 0.2..1.2) -> mapear a 0..1
  const respiracion = Math.min(1, Math.max(0, (pulsoHz - 0.2) / 1.0));

  // Turbulencia: basada en la escala (esperamos alrededor de 0.5..1.5) -> mapear a 0..1
  const turbulencia = Math.min(1, Math.max(0, (escala - 0.5) / 1.0));

  // Filo: basado en la animación (ejemplo: algunas animaciones aumentan el filo)
  const filoMap: Record<
    | "respira"
    | "escucha"
    | "piensa"
    | "habla"
    | "brilla"
    | "acoge"
    | "orbita",
    number
  > = {
    respira: 0.1,
    escucha: 0.2,
    piensa: 0.3,
    habla: 0.4,
    brilla: 0.5,
    accueille: 0.6,
    orbita: 0.7,
  };
  const filo = filoMap[animacion] ?? 0.0;

  // Simetría: inverso del filo (ejemplo) o basado en otra cosa
  const simetria = 1.0 - filo;

  return {
    turbulencia,
    filo,
    simetria: Number.isFinite(simetria) ? simetria : 0.5,
    matiz: Number.isFinite(matiz) ? matiz : 0.0,
    respiracion: Number.isFinite(respiracion) ? respiracion : 0.0,
  };
}