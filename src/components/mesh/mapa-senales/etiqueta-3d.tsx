"use client";

/**
 * Etiqueta flotante del mapa 3D (DOM sobre la escena, vía drei `Html`). Una sola
 * hechura para todos: marcadores, antenas propias, anillos de alcance y sectores.
 * Sin eventos de puntero (no tapa el mapa): ni en el contenido ni en los
 * contenedores que crea drei, que por defecto los captura y robaba al lienzo los
 * clics y arrastres que caían bajo una etiqueta. Con el z-index acotado para que la
 * cabecera y los controles del mapa queden SIEMPRE por encima de las etiquetas.
 */

import { Html } from "@react-three/drei";

export const ZINDEX_ETIQUETAS: [number, number] = [10, 0];
/** `distanceFactor` de drei: a mayor valor, etiquetas más grandes a igual distancia. */
export const FACTOR_ETIQUETA = 18;
const SIN_PUNTERO = { pointerEvents: "none" } as const;

interface Props {
  position: [number, number, number];
  titulo: string;
  subtitulo?: string;
  /** Color de acento (borde). */
  color?: string;
  /** Tamaño reducido para rótulos de referencia (sectores, anillos). */
  discreta?: boolean;
  distanceFactor?: number;
}

export function Etiqueta3D({ position, titulo, subtitulo, color = "#ffffff", discreta = false, distanceFactor = FACTOR_ETIQUETA }: Props) {
  return (
    <Html position={position} center distanceFactor={distanceFactor} zIndexRange={ZINDEX_ETIQUETAS} pointerEvents="none" wrapperClass="pointer-events-none" style={SIN_PUNTERO}>
      {discreta ? (
        <span
          className="pointer-events-none select-none whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider"
          style={{ color, textShadow: "0 0 4px #000, 0 0 2px #000" }}
        >
          {titulo}
        </span>
      ) : (
        <div
          className="pointer-events-none select-none whitespace-nowrap rounded-lg border bg-black/80 px-2 py-1 text-center text-[10px] leading-tight text-white/90"
          style={{ borderColor: `${color}77` }}
        >
          <span className="block max-w-[190px] truncate font-medium">{titulo}</span>
          {subtitulo ? <span className="block text-white/55">{subtitulo}</span> : null}
        </div>
      )}
    </Html>
  );
}

export default Etiqueta3D;
