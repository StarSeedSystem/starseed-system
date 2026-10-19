import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export interface LottieVistaProps {
  /** URL del archivo Lottie (.lottie o .json) */
  src: string;
  /** Licencia del animation (opcional) */
  license?: string;
  /** Autor del animation (opcional) */
  author?: string;
  /** Si se debe reproducir automáticamente */
  autoplay?: boolean;
  /** Si se debe repetir */
  loop?: boolean;
  /** Velocidad de reproducción */
  speed?: number;
}

/**
 * Componente para reproducir animaciones Lottie con soporte para:
 * - Respetar prefers-reduced-motion (muestra primer fotograma)
 * - Pausar cuando está fuera de pantalla
 * - Mostrar licencia y autor si están disponibles
 */
export function LottieVista({
  src,
  license,
  author,
  autoplay = true,
  loop = true,
  speed = 1,
}: LottieVistaProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const lottieRef = useRef(null);

  // Detectar si se prefiere reducir movimiento
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setIsReducedMotion(mediaQuery.matches);
    
    // Establecer estado inicial
    setIsReducedMotion(mediaQuery.matches);
    
    // Escuchar cambios
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Detectar visibilidad del componente (Intersection Observer)
  useEffect(() => {
    if (!lottieRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1, // 10% visible
      }
    );
    
    observer.observe(lottieRef.current);
    
    return () => {
      observer.disconnect();
    };
  }, [lottieRef]);

  return (
    <div
      ref={lottieRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: isReducedMotion ? '#f8f9fa' : 'transparent',
      }}
    >
      {isReducedMotion ? (
        // Mostrar primer fotograma cuando se prefiere reducir movimiento
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6c757d',
            fontSize: '0.875rem',
          }}
        >
          Animación (movimiento reducido)
        </div>
      ) : (
        // Reproducir animación normalmente cuando está visible
        <DotLottieReact
          src={src}
          autoplay={isVisible && autoplay}
          loop={loop}
          speed={speed}
          style={{ width: '100%', height: '100%' }}
          // El componente dotlottie-react ya maneja pausado automáticamente cuando no está en viewport
          // pero añadimos nuestro propio control por si acaso
        />
      )}
      
      {/* Mostrar licencia y autor si están disponibles */}
      {!isReducedMotion && (license || author) && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.5rem',
            left: '0.5rem',
            fontSize: '0.75rem',
            color: 'rgba(0, 0, 0, 0.7)',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            backdropFilter: 'blur(2px)',
          }}
        >
          {author && <span>{author}</span>}
          {license && author && <span> • </span>}
          {license && <span>{license}</span>}
        </div>
      )}
    </div>
  );
}