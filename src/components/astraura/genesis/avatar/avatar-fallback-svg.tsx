/**
 * avatar-fallback-svg.tsx — El mismo ser, sin WebGL.
 *
 * El encargo es explícito: "un respaldo estático digno derivado del mismo
 * ADN — un SVG, no un hueco gris". Así que esto NO es un icono genérico ni
 * las iniciales del nombre en un círculo: lee los mismos `RasgosAdn` que
 * `avatar-ser.tsx` y dibuja, en 2D, la misma silueta (nº de lados según
 * `solido`), la misma paleta, el mismo número de órbitas a radios
 * proporcionales, el mismo jitter de `rugosidad`/`simetria` y las mismas
 * líneas internas de faceta que crecen con `evolucion` — dos seres
 * distintos siguen sin producir el mismo SVG, igual que no producen el
 * mismo cuerpo 3D.
 *
 * Deliberadamente SIN animación: es el respaldo para cuando no hay WebGL,
 * no el caso de `prefers-reduced-motion` (para eso, `avatar-ser.tsx` sigue
 * montando el cuerpo 3D real, solo que quieto — ver `hooks.ts`). Mezclar
 * ambos casos habría sido tratar "sin WebGL" como si fuera "con menos
 * movimiento", y son cosas distintas.
 *
 * Sin dependencia de `three`/`@react-three/*` a propósito: si WebGL falló
 * o ni se ha comprobado, no tiene sentido que el bundle de este respaldo
 * cargue nada relacionado. Tampoco necesita hooks de cliente (nada de
 * `window`/`matchMedia` aquí) — es JSX puro a partir de props, así que
 * puede prerenderizarse igual de bien en un Server Component si algún día
 * hace falta.
 */

import type { RasgosAdn, SolidoBase } from "@/lib/astraura/genesis-dna";
import { applyAlpha } from "@/lib/utils";

export interface AvatarFallbackSvgProps {
  adn: RasgosAdn;
  /** Tamaño en px (el SVG es cuadrado). */
  tamano?: number;
  className?: string;
}

/** Nº de lados del polígono que representa cada sólido — no es literal (el
 * dodecaedro no tiene 8 caras), es una progresión de complejidad visual
 * creciente que seaprovecha para leerse igual: tetraedro < cubo < octaedro
 * < dodecaedro < icosaedro. "esfera" no usa polígono — un círculo liso. */
const LADOS_POR_SOLIDO: Record<Exclude<SolidoBase, "esfera">, number> = {
  tetraedro: 3,
  cubo: 4,
  octaedro: 6,
  dodecaedro: 8,
  icosaedro: 10,
};

/** xorshift de 32 bits sembrado — misma familia de mezcla que `tramo()` en
 * genesis-dna.ts, reescrita aquí (no exportada allí) para mantener este
 * fichero sin dependencias de three/React más allá de los tipos del ADN. */
function jitter01(semilla: number, indice: number): number {
  let x = (semilla ^ (0x9e3779b9 * (indice + 7))) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

const CX = 100;
const CY = 100;

export function AvatarFallbackSvg({ adn, tamano = 96, className }: AvatarFallbackSvgProps) {
  const idGrad = `avatar-halo-${adn.semilla}`;
  const idNucleo = `avatar-nucleo-${adn.semilla}`;

  // Cuántos vértices comparten el MISMO jitter — con simetria=1 todos leen
  // el mismo valor (silueta regular); con simetria=0, cada uno el suyo
  // (silueta caótica). Es la versión 2D de la mezcla simétrico/asimétrico
  // que geometria.ts hace con ruido en 3D — misma idea, sin necesitar un
  // generador de ruido para un dibujo plano.
  const lados = adn.solido === "esfera" ? 28 : LADOS_POR_SOLIDO[adn.solido];
  const grupoJitter = Math.max(1, Math.round(1 + (1 - adn.simetria) * (lados - 1)));

  const radioBase = 62;
  const puntos: [number, number][] = [];
  for (let i = 0; i < lados; i++) {
    const j = jitter01(adn.semilla, i % grupoJitter);
    const r = radioBase * (1 + (j - 0.5) * adn.rugosidad * 0.55);
    const a = (i / lados) * Math.PI * 2 - Math.PI / 2;
    puntos.push([CX + Math.cos(a) * r, CY + Math.sin(a) * r]);
  }

  // Estiramiento no uniforme por eje — visible incluso con rugosidad=0.
  const estiraX = 1 + (jitter01(adn.semilla, 201) - 0.5) * 0.34 * (1 - adn.simetria);
  const estiraY = 1 + (jitter01(adn.semilla, 202) - 0.5) * 0.34 * (1 - adn.simetria);
  const puntosEstirados = puntos.map(([x, y]): [number, number] => [
    CX + (x - CX) * estiraX,
    CY + (y - CY) * estiraY,
  ]);

  const nucleoPath =
    adn.solido === "esfera"
      ? undefined
      : `M ${puntosEstirados.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L ")} Z`;

  // Líneas internas de faceta — crecen con `evolucion` (vía `facetas`, que
  // ya lo hace en el ADN): un ser recién nacido (facetas=1) no lleva
  // ninguna, la silueta sola; uno desarrollado se ve "tallado" por dentro.
  const mostrarFacetas = adn.facetas > 1 && adn.solido !== "esfera";

  return (
    <svg
      viewBox="0 0 200 200"
      width={tamano}
      height={tamano}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={idGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={adn.paleta.acento} stopOpacity={adn.aura * 0.7} />
          <stop offset="45%" stopColor={adn.paleta.primario} stopOpacity={adn.aura * 0.28} />
          <stop offset="100%" stopColor={applyAlpha(adn.paleta.primario, "00", "0")} />
        </radialGradient>
        <linearGradient id={idNucleo} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={adn.paleta.primario} />
          <stop offset="100%" stopColor={adn.paleta.secundario} />
        </linearGradient>
      </defs>

      {/* Halo */}
      <circle cx={CX} cy={CY} r={96} fill={`url(#${idGrad})`} />

      {/* Órbitas — misma proyección elíptica "vista desde arriba" que usa
          quantum-orb.tsx (ry = rx * 0.85): familia visual reconocible. */}
      {adn.radiosOrbitales.map((r, i) => (
        <ellipse
          key={i}
          cx={CX}
          cy={CY}
          rx={radioBase * r * 0.62}
          ry={radioBase * r * 0.62 * 0.85}
          fill="none"
          stroke={i % 2 === 0 ? adn.paleta.secundario : adn.paleta.acento}
          strokeWidth={1.4}
          strokeOpacity={0.35 + adn.aura * 0.35}
        />
      ))}

      {/* Facetas internas — ausentes en un ser recién nacido. */}
      {mostrarFacetas && (
        <g stroke={adn.paleta.acento} strokeOpacity={0.35} strokeWidth={0.8}>
          {puntosEstirados.map(([x, y], i) => (
            <line key={i} x1={CX} y1={CY} x2={x} y2={y} />
          ))}
        </g>
      )}

      {/* Núcleo */}
      {adn.solido === "esfera" ? (
        <circle
          cx={CX}
          cy={CY}
          r={radioBase * (0.94 + adn.rugosidad * 0.1)}
          fill={`url(#${idNucleo})`}
          stroke={adn.paleta.acento}
          strokeWidth={1.5}
          transform={`translate(${CX} ${CY}) scale(${estiraX} ${estiraY}) translate(${-CX} ${-CY})`}
        />
      ) : (
        <path d={nucleoPath} fill={`url(#${idNucleo})`} stroke={adn.paleta.acento} strokeWidth={1.5} strokeLinejoin="round" />
      )}
    </svg>
  );
}

export default AvatarFallbackSvg;
