"use client";

import { useEffect, useRef, useState } from "react";
import type { Bot } from "../tipos";
import { mezclarPersonalidad, estadoEmocional, expresionCuerpo, type EstadoEmocional, type Personalidad } from "../personalidad-adaptable";
import { PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
import { subscribeUserVoiceEmotion, isEmotionalHearingEnabled, type UserVoiceEmotion } from "@/lib/aurora/audio-emotion";
import { leerBots } from "./almacen-bots";
import { emitQuantumOrbParams, type QuantumOrbParams, mergeQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import { uidActual } from "@/lib/consumo/usuario";
import { botPredeterminado } from "../predeterminado";

/**
 * Hook que escucha la personalidad activa de Aurora y el ánimo de voz,
 * calcula la expresión emocional y emite parámetros para la orbe cuántica.
 * 
 * @param bot - El bot para el cual calcular la expresión (opcional, por defecto usa el bot predeterminado)
 * @returns void
 */
export function useExpresionBot(bot?: Bot | null): void {
  const [estadoEmocionalPrev, setEstadoEmocionalPrev] = useState<EstadoEmocional | null>(null);
  const [botActual, setBotActual] = useState<Bot | null>(null);
  const ultimaEmisionRef = useRef<number>(0);
  const intervaloMinimo = 250; // 4 veces por segundo máximo = 250ms mínimo entre emisiones
  const vozEmocionRef = useRef<UserVoiceEmotion | null>(null);

  // Obtener el bot actual (predeterminado si no se proporciona)
  useEffect(() => {
    async function inicializarBot() {
      let botParaUsar: Bot | null = bot;
      
      // Si no se proporciona un bot, usar el predeterminado
      if (!botParaUsar) {
        const uid = await uidActual();
        const perfilId = uid ?? "local";
        const cuentaId = uid ?? "local";
        botParaUsar = botPredeterminado(perfilId, cuentaId);
      }
      
      setBotActual(botParaUsar);
    }
    
    inicializarBot();
  }, [bot]);

  // Escuchar cambios en la personalidad de Aurora
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const manejarCambioPersonalidad = (event: Event) => {
      const detalle = (event as CustomEvent).detail;
      // El detalle contiene el estilo de voz derivado de la personalidad
      // Pero necesitamos obtener la personalidad completa para mezclarla
      // Por ahora, recalcularemos la expresión cuando cambie la personalidad
      if (botActual) {
        calcularYEmitirExpresion();
      }
    };
    
    window.addEventListener(PERSONALITY_CHANGED_EVENT, manejarCambioPersonalidad);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, manejarCambioPersonalidad);
    };
  }, [botActual]);

  // Suscribirse a las emociones de voz del usuario (si está habilitado)
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if (isEmotionalHearingEnabled()) {
      const unsubscribe = subscribeUserVoiceEmotion((emocion) => {
        vozEmocionRef.current = emocion;
        // Cuando llega una nueva emoción de voz, recalculamos inmediatamente
        // pero respetamos el límite de emisión mínima
        calcularYEmitirExpresion();
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [isEmotionalHearingEnabled()]);

  // Función para calcular y emitir la expresión emocional
  const calcularYEmitirExpresion = () => {
    if (!botActual) return;
    
    const ahora = Date.now();
    // Limitar la emisión a máximo 4 veces por segundo
    if (ahora - ultimaEmisionRef.current < intervaloMinimo) {
      return;
    }
    
    try {
      // 1. Obtener la personalidad activa de Aurora desde el engine
      // Para simplificar, usaremos la personalidad del bot actual como base
      // En una implementación más completa, obtendríamos la personalidad activa de Aurora
      const personalidadBase = botActual.personalidad;
      
      // 2. Preparar señales de contexto (simplificado)
      const senalesContexto = {
        situacion: undefined, // neutra por defecto
        sesion: "privada",    // asumimos sesión privada por defecto
        animo: vozEmocionRef.current ? {
          valencia: vozEmocionRef.current.pitchLevel * 2 - 1, // Convertir 0..1 a -1..1
          activacion: vozEmocionRef.current.energy
        } : undefined
      };
      
      // 3. Mezclar personalidad (con agente vacío y prefs vacías para simplificar)
      const personalidadEfectiva = mezclarPersonalidad(
        personalidadBase,
        senalesContexto,
        undefined, // agente
        {}         // prefs
      );
      
      // 4. Calcular estado emocional con inercia
      const estadoActual = estadoEmocional(
        personalidadEfectiva,
        senalesContexto,
        estadoEmocionalPrev
      );
      
      // 5. Calcular expresión corporal
      const expresion = expresionCuerpo(
        estadoActual,
        botActual.cuerpo
      );
      
      // 6. Convertir a parámetros de orbe cuántica
      const parametros = aParametrosOrbe(expresion);
      
      // 7. Emitir los parámetros (máximo 4 veces por segundo)
      emitQuantumOrbParams(parametros);
      
      // 8. Actualizar estado previo y timestamp
      setEstadoEmocionalPrev(estadoActual);
      ultimaEmisionRef.current = ahora;
    } catch (error) {
      console.error("Error en useExpresionBot:", error);
    }
  };

  // Emitir expresion inicial cuando tengamos el bot
  useEffect(() => {
    if (botActual) {
      calcularYEmitirExpresion();
    }
  }, [botActual]);
}

/**
 * Convierte una expresión corporal a parámetros de orbe cuántica.
 * 
 * @param expresion - Objeto con tono, pulsoHz, escala y animacion
 * @returns Parámetros para la orbe cuántica (turbulence, spikiness, symmetry, hueShift, breath)
 */
export function aParametrosOrbe(
  expresion: { tono: number; pulsoHz: number; escala: number; animacion: string }
): QuantumOrbParams {
  // Mapeamos los valores de expresión a los parámetros de la orbe cuántica
  // tono: 0-360 grados -> hueShift: 0-1 (normalize)
  const hueShift = ((expresion.tono % 360) + 360) % 360 / 360;
  
  // pulsoHz: 0.2-1.2 (aprox) -> breath: 0-1 (normalize y invertir ligeramente)
  // Un pulso más rápido indica más activación, lo que mapeamos a breath
  const breath = Math.min(1, Math.max(0, (expresion.pulsoHz - 0.2) / 1.0));
  
  // escala: 0.5-2 (aprox) -> turbulence: 0-1 (menos escala = más turbulencia)
  // Una escala más pequeña indica más energía concentrada = más turbulencia
  const turbulence = Math.min(1, Math.max(0, (2 - expresion.escala) / 1.5));
  
  // animacion -> spikiness: 0-1 (basado en el tipo de animación)
  // Las animaciones más agitadas tienen más spikiness
  const animacionSpikinessMap: Record<string, number> = {
    respira: 0.1,    // suave y regular
    escucha: 0.2,    // ligeramente atento
    piensa: 0.4,     // pensativo, algo de irregularidad
    habla: 0.6,      // expresivo, variable
    brilla: 0.8,     // brillante, pico de energía
    acogee: 0.3,     // acogedor, suave
    orbita: 0.5      // orbital, movimiento regular
  };
  const spikiness = animacionSpikinessMap[expresion.animacion] || 0.5;
  
  // symmetry: basado en la escala y pulso (equilibrio entre elementos)
  // Valores extremos de escala o pulso reducen la simetría percibida
  const symmetryFactor1 = Math.min(1, Math.max(0, 1 - Math.abs(expresion.escala - 1) / 1));
  const symmetryFactor2 = Math.min(1, Math.max(0, 1 - Math.abs(expresion.pulsoHz - 0.7) / 0.5));
  const symmetry = (symmetryFactor1 + symmetryFactor2) / 2;
  
  return {
    turbulence,
    spikiness,
    symmetry,
    hueShift,
    breath
  };
}