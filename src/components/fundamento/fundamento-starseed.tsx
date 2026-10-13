'use client';

import * as React from 'react';
import { Gem, Sprout, FlaskConical } from 'lucide-react';
import { useReducedMotion, useSpring, useTransform, useMotionValue, useMotionTemplate, useAnimation } from 'framer-motion';

// Constants
const CITA_FUNDAMENTO = "El diamante es la luz congelada de la verdad, y la piedra filosofal es la semilla que la convierte en oro.";
const SIMBOLOS = {
  piedraPhilosophal: {
    nombre: "Piedra Filosofal",
    queEs: "La sustancia que transforma los metales comunes en oro y otorga la inmortalidad.",
    pregunta: "¿Qué es lo que realmente buscas transformar en tu vida?"
  },
  mercurio: {
    nombre: "Mercurio",
    queEs: "El principio volátil que representa la mente y la comunicación en la obra alquímica.",
    pregunta: "¿Cómo purificas tus pensamientos para alcanzar la claridad?"
  },
  azufre: {
    nombre: "Azufre",
    queEs: "El principio activo que representa la voluntad y la energía en la transformación.",
    pregunta: "¿Qué fuego interno impulsa tu camino hacia la realización?"
  }
};

export default function FundamentoStarSeed() {
  const reduceMotion = useReducedMotion();

  // Insert keyframes for diamond animation if not in reduced motion
  React.useEffect(() => {
    if (typeof document !== 'undefined' && !reduceMotion) {
      const style = document.createElement('style');
      style.id = 'diamond-keyframes';
      style.innerHTML = `
        @keyframes diamondRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes diamondPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, [reduceMotion]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6 bg-background">
      {/* Cita */}
      <div className="text-center mb-8 max-w-2xl">
        <p className="text-xl font-semibold text-foreground/90">
          «{CITA_FUNDAMENTO}»
        </p>
        <p className="mt-2 text-sm text-foreground/60">
          — Alex Bordón Garrigós
        </p>
      </div>

      {/* Contenedor principal */}
      <div className="relative w-full max-w-4xl grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
        {/* Diamond center */}
        <div className="relative col-span-1 md:col-span-2 flex items-center justify-center">
          <svg
            role="img"
            aria-label="Diamante con facetas que representa la pureza y la luz"
            className="w-24 h-24 md:w-32 md:h-32 text-primary/80"
            style={{
              animation: reduceMotion 
                ? 'none' 
                : 'diamondRotate 10s linear infinite, diamondPulse 2s ease-in-out infinite'
            }}
          >
            {/* Diamond shape */}
            <path
              d="M12 2 L20 12 L12 22 L4 12 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            {/* Facets */}
            <path
              d="M12 2 L12 22 M4 12 L20 12"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* Cards */}
        {Object.entries(SIMBOLOS).map(([key, symbol]) => (
          <div key={key} className="relative flex flex-col items-center p-6 bg-card/50 backdrop-blur-sm rounded-2xl border border-foreground/10 transition-all duration-300 hover:bg-card/70">
            {/* Icon */}
            <div className="mb-4">
              {key === 'piedraPhilosophal' && <Gem className="h-8 w-8 text-primary/80" />}
              {key === 'mercurio' && <Sprout className="h-8 w-8 text-primary/80" />}
              {key === 'azufre' && <FlaskConical className="h-8 w-8 text-primary/80" />}
            </div>

            {/* Name */}
            <h3 className="mb-2 font-semibold text-foreground">{symbol.nombre}</h3>

            {/* What it is */}
            <p className="mb-4 text-sm text-foreground/70 text-center">{symbol.queEs}</p>

            {/* Question */}
            <p className="text-xs text-foreground/60 italic text-center">{symbol.pregunta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}