"use client";

/**
 * StarSeed OS — INDICADOR DE PROCESAMIENTO DE VOZ (Adenda V2-VOZ).
 * ============================================================================
 * Elemento ANIMADO precioso que indica que el sistema de voz está DANDO VOZ a la
 * respuesta (sintetizando). Ecualizador líquido de 5 barras con gradiente Crystal
 * + halo respirando, 100% CSS (sin librerías). Accesible (aria-live) y compacto
 * (~28 px de alto). Se monta SOBRE cada chat y se muestra con fade 200 ms mientras
 * el motor de voz procesa.
 *
 * Escucha el evento global `starseed:voice-processing`
 *   { detail: { state: 'start' | 'end', engine?, personalityId? } }
 * que emite `speak-router.ts` alrededor de la síntesis. Autoprotegido: si el
 * `end` no llega (motor colgado), se oculta solo tras un máximo. NUNCA lanza.
 */

import { useEffect, useRef, useState } from "react";
import { AudioLines } from "lucide-react";

/** Nombre del evento global de procesamiento de voz. */
export const VOICE_PROCESSING_EVENT = "starseed:voice-processing";

/** Detalle del evento `starseed:voice-processing`. */
export interface VoiceProcessingDetail {
  state: "start" | "end";
  engine?: string;
  personalityId?: string;
}

/** Emite el evento de procesamiento de voz (helper compartido). SSR-safe. */
export function emitVoiceProcessing(detail: VoiceProcessingDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(VOICE_PROCESSING_EVENT, { detail }));
  } catch {
    /* */
  }
}

/** Máximo que permanece visible sin recibir `end` (red de seguridad, ms). */
const MAX_VISIBLE_MS = 90_000;

export interface VoiceProcessingIndicatorProps {
  /**
   * "inline" (por defecto): pastilla en línea, para barras de estado.
   * "float": pastilla flotante centrada sobre el chat (el contenedor padre debe
   * ser `position: relative`).
   */
  variant?: "inline" | "float";
  /** Clases extra del contenedor. */
  className?: string;
  /**
   * Si se pasa, el indicador SOLO reacciona a la voz de ESA personalidad (para
   * chats atados a una personalidad concreta). Sin ella, reacciona a cualquiera.
   */
  personalityId?: string;
  /** Texto accesible/visible (por defecto el estándar del sistema). */
  label?: string;
}

/**
 * Indicador animado de "Astraura está dando voz a la respuesta…". Se muestra
 * mientras hay una síntesis en curso del chat visible.
 */
export default function VoiceProcessingIndicator({
  variant = "inline",
  className = "",
  personalityId,
  label = "Astraura está dando voz a la respuesta…",
}: VoiceProcessingIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const clearHide = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
    const onEvent = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as VoiceProcessingDetail | undefined;
        if (!detail || (detail.state !== "start" && detail.state !== "end")) return;
        // Filtro por personalidad (si el chat está atado a una).
        if (personalityId && detail.personalityId && detail.personalityId !== personalityId) {
          return;
        }
        if (detail.state === "start") {
          clearHide();
          setMounted(true);
          // Siguiente frame → activa el fade-in (evita el salto).
          requestAnimationFrame(() => setVisible(true));
          hideTimer.current = setTimeout(() => {
            setVisible(false);
          }, MAX_VISIBLE_MS);
        } else {
          clearHide();
          setVisible(false);
        }
      } catch {
        /* */
      }
    };
    window.addEventListener(VOICE_PROCESSING_EVENT, onEvent);
    return () => {
      window.removeEventListener(VOICE_PROCESSING_EVENT, onEvent);
      clearHide();
    };
  }, [personalityId]);

  // Al terminar el fade-out, desmonta del DOM (200 ms después de visible=false).
  useEffect(() => {
    if (visible) return;
    if (!mounted) return;
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [visible, mounted]);

  if (!mounted) return null;

  const isFloat = variant === "float";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={[
        "ssvp-root",
        isFloat ? "ssvp-float" : "ssvp-inline",
        visible ? "ssvp-on" : "ssvp-off",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="ssvp-halo" aria-hidden="true" />
      <AudioLines className="ssvp-icon" aria-hidden="true" strokeWidth={2} />
      <span className="ssvp-eq" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="ssvp-bar" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
      <span className="ssvp-label">{label}</span>

      <style jsx>{`
        .ssvp-root {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 28px;
          padding: 0 12px 0 10px;
          border-radius: 999px;
          position: relative;
          isolation: isolate;
          font-size: 12px;
          line-height: 1;
          color: rgba(226, 240, 255, 0.92);
          background: linear-gradient(
            135deg,
            rgba(0, 127, 255, 0.16),
            rgba(16, 185, 129, 0.12)
          );
          border: 1px solid rgba(120, 190, 255, 0.28);
          box-shadow: 0 2px 14px rgba(0, 127, 255, 0.18), inset 0 0 12px rgba(120, 190, 255, 0.08);
          backdrop-filter: blur(10px) saturate(1.2);
          -webkit-backdrop-filter: blur(10px) saturate(1.2);
          transition: opacity 200ms ease, transform 200ms ease;
          will-change: opacity, transform;
          pointer-events: none;
          user-select: none;
          white-space: nowrap;
        }
        .ssvp-off {
          opacity: 0;
          transform: translateY(2px) scale(0.98);
        }
        .ssvp-on {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .ssvp-float {
          position: absolute;
          top: 10px;
          left: 50%;
          margin-left: -0.5px;
          transform-origin: top center;
          z-index: 40;
        }
        .ssvp-float.ssvp-off {
          transform: translate(-50%, -4px) scale(0.98);
        }
        .ssvp-float.ssvp-on {
          transform: translate(-50%, 0) scale(1);
        }
        .ssvp-halo {
          position: absolute;
          inset: -3px;
          border-radius: 999px;
          z-index: -1;
          background: radial-gradient(
            60% 120% at 50% 50%,
            rgba(0, 127, 255, 0.35),
            rgba(0, 127, 255, 0) 70%
          );
          animation: ssvp-breathe 2.6s ease-in-out infinite;
        }
        .ssvp-icon {
          width: 14px;
          height: 14px;
          color: rgba(150, 210, 255, 0.95);
          flex: 0 0 auto;
        }
        .ssvp-eq {
          display: inline-flex;
          align-items: center;
          gap: 2.5px;
          height: 16px;
        }
        .ssvp-bar {
          width: 3px;
          height: 40%;
          border-radius: 2px;
          background: linear-gradient(
            180deg,
            rgba(150, 220, 255, 0.98),
            rgba(0, 127, 255, 0.85) 60%,
            rgba(16, 185, 129, 0.85)
          );
          box-shadow: 0 0 6px rgba(80, 180, 255, 0.55);
          animation: ssvp-bounce 1s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .ssvp-label {
          font-weight: 500;
          letter-spacing: 0.2px;
        }
        @keyframes ssvp-bounce {
          0%,
          100% {
            height: 28%;
            opacity: 0.7;
          }
          50% {
            height: 100%;
            opacity: 1;
          }
        }
        @keyframes ssvp-breathe {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(0.96);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.05);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ssvp-bar,
          .ssvp-halo {
            animation-duration: 0.001ms;
            animation-iteration-count: 1;
          }
          .ssvp-root {
            transition: opacity 200ms ease;
          }
        }
      `}</style>
    </div>
  );
}
