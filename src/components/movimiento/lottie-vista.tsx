"use client";

import { useEffect, useRef, useState } from "react";
import { useIntersectionObserver } from "@/components/layout/use-intersection-observer";
import { useReducedMotion } from "@/lib/aurora/accesibilidad";
import { leerNivelMovimiento } from "@/lib/movimiento/nivel";
import type { NivelMovimiento } from "@/lib/movimiento/nivel";

/**
 * LottieVista — reproductor de animaciones Lottie para el OS
 * ─────────────────────────────────────────────────────────────────────────────
 * Reproduce un .lottie o .json de la Biblioteca, respeta «reducir movimiento»
 * (muestra el primer fotograma), se pausa fuera de pantalla y muestra la
 * licencia y el autor si los trae.
 * 
 * Props:
 *   - src: URL del archivo Lottie (.lottie o .json)
 *   - autor: nombre del autor (opcional)
 *   - licencia: tipo de licencia (opcional)
 *   - descripcion: descripción breve (opcional)
 */

interface LottieVistaProps {
  src: string;
  autor?: string;
  licencia?: string;
  descripcion?: string;
}

export function LottieVista({
  src,
  autor,
  licencia,
  descripcion,
}: LottieVistaProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reproductor, setReproductor] = useState<any>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { ref: observadorRef, estaVisible } = useIntersectionObserver();
  const reducirMovimiento = useReducedMotion();
  const nivelMovimiento = leerNivelMovimiento();
  
  useEffect(() => {
    // Importación dinámica del reproductor Lottie
    import("@lottiefiles/dotlottie-react")
      .then(({ Lottie }) => {
        setReproductor(Lottie);
        setCargando(false);
      })
      .catch((err) => {
        console.error("Error al cargar el reproductor Lottie:", err);
        setError("No se pudo cargar el reproductor de animaciones");
        setCargando(false);
      });
  }, []);

  useEffect(() => {
    if (!reproductor || !contenedorRef.current) return;
    
    // Lógica de reproducción basada en visibilidad y preferencias de movimiento
    if (reducirMovimiento || nivelMovimiento === "minimo") {
      // Mostrar solo el primer fotograma
      // La lógica se implementará en siguientes ediciones
    } else if (estaVisible) {
      // Reproducir animación cuando es visible
      // La lógica se implementará en siguientes ediciones
    } else {
      // Pausar animación cuando no es visible
      // La lógica se implementará en siguientes ediciones
    }
  }, [estaVisible, reducirMovimiento, nivelMovimiento, reproductor]);
  
  // Renderizado se implementará en siguientes ediciones
  
  return (
    <div ref={observadorRef} data-testid="lottie-vista-contenedor">
      {/* Contenido se implementará en siguientes ediciones */}
    </div>
  );
}

export default LottieVista;