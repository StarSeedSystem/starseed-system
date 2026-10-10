"use client";

/**
 * Un MEDIO abierto (una forma de abrir el OS: app nativa, Chrome en Vercel, Chrome en localhost…)
 * como satélite de su aparato. No tiene posición propia y el mapa no finge que la tiene: orbita al
 * aparato donde está abierto (o a «Tú» si es otro medio de este aparato). Verde = a la vista;
 * ámbar = abierto en segundo plano (ambos salen de la presencia en vivo). Si su aparato está
 * desconectado, se dibuja tenue.
 */

import { Line } from "@react-three/drei";
import { ANTENNA_COLOR } from "@/ai/astraura/mesh/signals";
import { COLOR_ESTADO } from "@/lib/senales/aparatos";
import type { MedioEscena } from "@/lib/senales/mapa-3d";
import { Etiqueta3D } from "./etiqueta-3d";

const PLANO: [number, number, number] = [-Math.PI / 2, 0, 0];

interface Props {
  m: MedioEscena;
  seleccionado: boolean;
  apuntado: boolean;
  onSeleccionar: (id: string) => void;
  onApuntar: (id: string | null) => void;
}

export function Medio3D({ m, seleccionado, apuntado, onSeleccionar, onApuntar }: Props) {
  const color = m.medio.visible ? COLOR_ESTADO.activa : COLOR_ESTADO["segundo-plano"];
  const opacidad = m.tenue ? 0.4 : 1;
  const escala = seleccionado ? 1.45 : apuntado ? 1.25 : 1;
  return (
    <group>
      <Line
        points={[[m.padre.x, m.padre.y, m.padre.z], [m.x, m.y, m.z]]}
        color={ANTENNA_COLOR.account}
        lineWidth={1}
        transparent
        opacity={0.4 * opacidad}
      />
      <group position={[m.x, m.y, m.z]} scale={escala}>
        <mesh>
          <octahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={seleccionado ? 0.95 : 0.55} transparent={m.tenue} opacity={opacidad} />
        </mesh>
        <mesh rotation={PLANO}>
          <torusGeometry args={[0.27, 0.014, 8, 32]} />
          <meshBasicMaterial color={ANTENNA_COLOR.account} transparent opacity={0.8 * opacidad} />
        </mesh>
        {seleccionado && (
          <mesh rotation={PLANO}>
            <torusGeometry args={[0.38, 0.02, 8, 36]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
        )}
        {/* Zona de pulsación cómoda (invisible): también para el dedo en móvil */}
        <mesh
          onClick={(e) => { e.stopPropagation(); onSeleccionar(m.id); }}
          onPointerOver={(e) => { e.stopPropagation(); onApuntar(m.id); }}
          onPointerOut={() => onApuntar(null)}
        >
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {(seleccionado || apuntado) && (
        <Etiqueta3D
          position={[m.x, m.y + 0.6, m.z]}
          titulo={m.medio.etiqueta}
          subtitulo={m.medio.visible ? "medio a la vista" : "medio en segundo plano"}
          color={color}
        />
      )}
    </group>
  );
}

export default Medio3D;

