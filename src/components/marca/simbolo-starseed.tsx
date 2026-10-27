"use client";

/**
 * SIMBOLO-STARSEED — Componente cliente del símbolo oficial con animación de siembra
 * 
 * Animación: punto → círculos → ojo → facetas en ~2400 ms con movimiento.ts
 * Respeta prefers-reduced-motion (estado final sin moverse)
 * Solo transform y opacity se animan
 */

import { useEffect, useMemo, useState } from "react";
import { DURACION, CURVA } from "@/lib/design/movimiento";
import { generarRutasSVG, SIMBOLO_BASE, COLORES_DISCOS, OJO } from "@/lib/design/simbolo-geometria";

export interface SimboloStarseedProps {
  tamano?: number;
  siembra?: boolean;
  ariaLabel?: string;
}

type EtapaAnimacion = 'punto' | 'circulos' | 'ojo' | 'facetas' | 'completo';

export function SimboloStarseed({ 
  tamano = 64, 
  siembra = false, 
  ariaLabel = "Símbolo StarSeed" 
}: SimboloStarseedProps) {
  const [etapa, setEtapa] = useState<EtapaAnimacion>(siembra ? 'punto' : 'completo');
  const [movimientoReducido, setMovimientoReducido] = useState(false);

  const rutas = useMemo(() => generarRutasSVG(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMovimientoReducido(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMovimientoReducido(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!siembra || movimientoReducido) {
      setEtapa('completo');
      return;
    }

    // Animación: punto → círculos → ojo → facetas en ~2400 ms
    const tiempos = {
      circulos: DURACION.rapido + DURACION.instantaneo, // ~240ms
      ojo: DURACION.rapido + DURACION.normal, // ~370ms
      facetas: DURACION.rapido + DURACION.normal + DURACION.pausado, // ~670ms base
      completo: DURACION.escena * 5, // ~2400ms
    };

    const t1 = setTimeout(() => setEtapa('circulos'), tiempos.circulos);
    const t2 = setTimeout(() => setEtapa('ojo'), tiempos.ojo);
    const t3 = setTimeout(() => setEtapa('facetas'), tiempos.facetas);
    const t4 = setTimeout(() => setEtapa('completo'), tiempos.completo);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [siembra, movimientoReducido]);

  const escala = tamano / SIMBOLO_BASE.ancho;
  const mostrarPunto = etapa === 'punto' || etapa === 'circulos' || etapa === 'ojo' || etapa === 'facetas' || etapa === 'completo';
  const mostrarCirculos = etapa === 'circulos' || etapa === 'ojo' || etapa === 'facetas' || etapa === 'completo';
  const mostrarOjo = etapa === 'ojo' || etapa === 'facetas' || etapa === 'completo';
  const mostrarFacetas = etapa === 'facetas' || etapa === 'completo';

  const duracionMs = movimientoReducido ? 0 : DURACION.normal;
  const curva = CURVA.entrada;

  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox={`0 0 ${SIMBOLO_BASE.ancho} ${SIMBOLO_BASE.alto}`}
      role="img"
      aria-label={ariaLabel}
      style={{ cursor: "pointer" }}
    >
      {/* Punto inicial */}
      {mostrarPunto && (
        <circle
          cx={SIMBOLO_BASE.centroX}
          cy={SIMBOLO_BASE.centroY}
          r={2}
          fill="#DCDCDC"
          opacity={etapa === 'punto' ? 1 : etapa === 'circulos' ? 0.7 : 0}
          style={{
            transition: movimientoReducido ? "none" : `opacity ${DURACION.rapido}ms ${CURVA.entrada}`,
            transformOrigin: "center",
          }}
        />
      )}

      {/* Círculos */}
      {mostrarCirculos && (
        <g opacity={etapa === 'circulos' ? 1 : (etapa === 'ojo' || etapa === 'facetas' || etapa === 'completo') ? 1 : 0}>
          <path
            d={rutas.circulos.superior}
            fill={COLORES_DISCOS.superior.izquierda}
            style={{
              transition: movimientoReducido ? "none" : `opacity ${duracionMs}ms ${curva}`,
            }}
          />
          <path
            d={rutas.circulos.inferior}
            fill={COLORES_DISCOS.inferior.izquierda}
            style={{
              transition: movimientoReducido ? "none" : `opacity ${duracionMs}ms ${curva}`,
            }}
          />
        </g>
      )}

      {/* Ojo */}
      {mostrarOjo && (
        <g opacity={(etapa === 'ojo' || etapa === 'facetas' || etapa === 'completo') ? 1 : 0}>
          <path d={rutas.ojo.contorno} fill={OJO.contorno} />
          <circle cx={OJO.blancoCentro.x} cy={OJO.blancoCentro.y} r={OJO.blancoRadio} fill="white" />
          <circle cx={OJO.blancoCentro.x} cy={OJO.blancoCentro.y} r={OJO.pupilaRadio} fill={OJO.pupila} />
          <circle cx={OJO.brillo.x} cy={OJO.brillo.y} r={OJO.brilloRadio} fill="white" />
        </g>
      )}

      {/* Facetas */}
      {mostrarFacetas && (
        <g opacity={(etapa === 'facetas' || etapa === 'completo') ? 1 : 0}>
          {rutas.facetas.map((faceta) => (
            <path
              key={faceta.id}
              d={faceta.ruta}
              fill={faceta.color}
              style={{
                transition: movimientoReducido ? "none" : `opacity ${DURACION.pausado}ms ${CURVA.suave}`,
              }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

export default SimboloStarseed;
