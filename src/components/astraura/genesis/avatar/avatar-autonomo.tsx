"use client";

/**
 * avatar-autonomo.tsx — `<AvatarAutonomo adn={...} />`: un ser suelto y
 * completo — Canvas, luces y respaldo ya resueltos.
 *
 * `avatar-ser.tsx` explica por qué `AvatarSer` NO trae su propio `<Canvas>`
 * (treinta contextos WebGL simultáneos en el mundo compartido sería un
 * desastre). Este componente es el otro extremo: el sitio donde SÍ hace
 * falta un Canvas autocontenido porque el consumidor quiere UN ser suelto
 * — una tarjeta de perfil, una fila de lista, la cabecera de una ficha.
 * De hecho `../ser-avatar-slot.tsx` (de otro subagente, la puerta de
 * entrada de Génesis a este módulo) ya usa exactamente esto así.
 *
 * Aquí vive todo lo que un `<AvatarSer>` suelto necesita alrededor:
 *   · Sonda de WebGL + límite de error → respaldo SVG (`hooks.ts`,
 *     `webgl-error-boundary.tsx`, `avatar-fallback-svg.tsx`).
 *   · Cupo de contextos WebGL — Génesis puede mostrar MUCHOS
 *     `AvatarAutonomo` sueltos a la vez (listas, fichas), y cada uno con
 *     Canvas propio es un contexto WebGL propio; los navegadores limitan
 *     los contextos simultáneos POR PÁGINA (Chrome ronda 16). Pasado un
 *     techo prudente, las instancias de más usan el respaldo SVG en vez de
 *     arriesgarse a agotar el límite o robarle el contexto a las que ya
 *     estaban vivas.
 *   · Luces coherentes con la paleta del propio ser.
 *   · El nombre como texto real al lado (nunca dentro del Canvas/SVG).
 *
 * No es SSR-safe montar un Canvas en el servidor — como el resto de 3D del
 * proyecto, quien use esto en una página debe importarlo con
 * `next/dynamic({ ssr: false })` (así lo documenta ya `ser-avatar-slot.tsx`).
 */

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { RasgosAdn } from "@/lib/astraura/genesis-dna";
import { cn } from "@/lib/utils";
import { AvatarSer } from "./avatar-ser";
import { AvatarFallbackSvg } from "./avatar-fallback-svg";
import { LimiteErrorWebGL } from "./webgl-error-boundary";
import { useTieneWebGL } from "./hooks";
import { colorDesdeHsl, type NivelDetalle } from "./geometria";

export interface AvatarAutonomoProps {
  adn: RasgosAdn;
  detalle?: NivelDetalle;
  /** Tamaño en px del visual (Canvas o SVG), cuadrado. Sin especificar,
   * rellena al 100% el contenedor que le dé quien lo use, en vez de que un
   * número fijo pise un tamaño puesto por CSS (p. ej. `aspect-square
   * w-full` en una tarjeta de lista). */
  tamano?: number;
  /** Si se da, se muestra como TEXTO REAL al lado — el visual en sí sigue
   * siendo decorativo (`aria-hidden`) porque el nombre vive aquí, no
   * incrustado en píxeles de canvas ni en el SVG. */
  nombre?: string;
  className?: string;
}

/** Techo prudente, por debajo del límite típico de contextos WebGL de un
 * navegador — deja margen para la orbe, el mundo 3D si está abierto a la
 * vez, y cualquier otro consumidor de WebGL de la página. */
const LIMITE_BLANDO_CANVAS = 8;
let canvasActivos = 0;

/** Concede "cupo" de Canvas real en el montaje y lo libera al desmontar. No
 * reintenta si se libera cupo más tarde (una instancia que nació sin cupo
 * se queda con el SVG mientras viva) — es una salvaguarda de degradación,
 * no una cola de espera; mantenerlo simple evita condiciones de carrera. */
function useCupoCanvas(): boolean {
  const [concedido, setConcedido] = useState(false);
  useEffect(() => {
    if (canvasActivos >= LIMITE_BLANDO_CANVAS) return;
    canvasActivos++;
    setConcedido(true);
    return () => {
      canvasActivos--;
    };
  }, []);
  return concedido;
}

/**
 * `<AvatarAutonomo adn={...} nombre="Aurora" />` — todo incluido: Canvas,
 * luces a juego con la paleta del ser, cupo de contextos y respaldo SVG.
 */
export function AvatarAutonomo({ adn, detalle = "alto", tamano, nombre, className }: AvatarAutonomoProps) {
  const tieneWebGL = useTieneWebGL();
  const cupo = useCupoCanvas();
  const colorLuz = colorDesdeHsl(adn.paleta.primario);

  const respaldo = <AvatarFallbackSvg adn={adn} tamano={tamano ?? 96} className="h-full w-full" />;
  const monta3d = tieneWebGL && cupo;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="relative block shrink-0 overflow-hidden rounded-full"
        style={tamano ? { width: tamano, height: tamano } : { width: "100%", height: "100%" }}
      >
        {monta3d ? (
          <LimiteErrorWebGL respaldo={respaldo}>
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 0.35, 2.5], fov: 40 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
              }}
            >
              <Suspense fallback={null}>
                <ambientLight intensity={0.55} />
                <pointLight position={[2, 2.4, 2]} intensity={1.1} color={colorLuz} />
                <pointLight position={[-2, -1.2, -1.5]} intensity={0.35} color={colorLuz} />
                <AvatarSer adn={adn} detalle={detalle} radio={0.62} />
              </Suspense>
            </Canvas>
          </LimiteErrorWebGL>
        ) : (
          respaldo
        )}
      </span>
      {nombre ? <span className="text-sm font-medium leading-none">{nombre}</span> : null}
    </span>
  );
}

export default AvatarAutonomo;
