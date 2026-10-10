"use client";

/**
 * Marcador 3D de UNA señal detectada. Cada canal visual dice una cosa real:
 *   · núcleo  = calidad medida (verde fuerte · ámbar media · rosa débil · gris sin métrica)
 *   · contorno (aro) = familia de antena · icono 3D = TIPO de señal (nodo LoRa, móvil, tablet, relé…)
 *   · foto sobre la marca = la de tu perfil en tus aparatos, o la que otra cuenta decidió mostrar
 *   · altura  = el eje elegido (calidad, frescura, saltos); sin dato ⇒ suelo y translúcido
 *   · halo    = rango de precisión de su posición (continuo = GPS · punteado = RF/sector)
 *   · punto blanco = declara una cuenta StarSeed · aro ámbar = viene del simulador
 *   · pulso   = oída hace menos de 30 s
 *   · línea al centro = el ENLACE real hasta ti: su trazo dice la clase (P2P en red local, por
 *     internet, por TURN, directo sin internet, relé, radio LoRa); punteada y tenue = sin enlace
 *   · punto sobre la marca (aparatos) = estado en vivo: verde activa · ámbar segundo plano · gris
 *     en línea o desconectada; los aparatos desconectados se dibujan tenues
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { lineaResumen, type MarcadorEscena } from "@/lib/senales/mapa-3d";
import { subtituloAparato } from "@/lib/senales/aparatos";
import { ESTILO_ENLACE } from "@/lib/senales/enlaces";
import { Etiqueta3D, FACTOR_ETIQUETA, ZINDEX_ETIQUETAS } from "./etiqueta-3d";
import { FotoPerfil } from "./foto-perfil";
import { Icono3D } from "./icono-3d";
import { AnilloPunteado } from "./suelo-3d";

const PLANO: [number, number, number] = [-Math.PI / 2, 0, 0];
const COLOR_SIMULADA = "#fbbf24";

/** Onda que nace del marcador y se desvanece: solo para lo oído «ahora mismo». */
function Pulso({ radio, color }: { radio: number; color: string }) {
  const malla = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = malla.current;
    if (!m) return;
    const t = (clock.elapsedTime % 2.4) / 2.4;
    m.scale.setScalar(1 + t * 2.4);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
  });
  return (
    <mesh ref={malla} rotation={PLANO}>
      <ringGeometry args={[radio * 1.4, radio * 1.55, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

interface Props {
  m: MarcadorEscena;
  seleccionada: boolean;
  apuntada: boolean;
  conEtiqueta: boolean;
  reducido: boolean;
  onSeleccionar: (id: string) => void;
  onApuntar: (id: string | null) => void;
}

export function Marcador3D({ m, seleccionada, apuntada, conEtiqueta, reducido, onSeleccionar, onApuntar }: Props) {
  const s = m.senal;
  const escala = seleccionada ? 1.35 : apuntada ? 1.2 : 1;
  const r = m.radio;
  const mode = s.placement.mode;
  const colorAro = m.simulada ? COLOR_SIMULADA : m.colorContorno;
  const opacidad = (m.alturaMedida ? 1 : 0.6) * (m.tenue ? 0.45 : 1);
  const estiloEnlace = m.enlaceMapa ? ESTILO_ENLACE[m.enlaceMapa.clase] : null;
  const colorPunto = m.colorEstado ?? (m.conCuenta ? "#ffffff" : null);
  const subtitulo = seleccionada || apuntada
    ? lineaResumen(s)
    : m.esAparato && m.enlaceMapa
      ? subtituloAparato(m.estado, m.enlaceMapa)
      : undefined;
  const rellenoHalo = (mode === "gps" ? 0.14 : mode === "rf" ? 0.07 : 0.04) + (seleccionada ? 0.07 : 0);

  return (
    <group>
      {/* Enlace real hasta ti, sobre el suelo (la distancia no se deforma con la altura) */}
      {m.enlaceMapa && (
        <Line
          points={[[0, 0.04, 0], [m.x, 0.04, m.z]]}
          color={estiloEnlace!.color}
          lineWidth={estiloEnlace!.ancho}
          dashed={estiloEnlace!.discontinua}
          dashSize={m.enlaceMapa.clase === "sin-enlace" ? 0.1 : 0.25}
          gapSize={m.enlaceMapa.clase === "sin-enlace" ? 0.16 : 0.2}
          transparent
          opacity={estiloEnlace!.opacidad * (m.tenue ? 0.6 : 1) * (seleccionada || apuntada ? 1 : 0.85)}
        />
      )}

      <group position={[m.x, 0, m.z]}>
        {/* Halo de precisión, en el suelo */}
        <mesh rotation={PLANO} position={[0, 0.012, 0]}>
          <circleGeometry args={[m.radioHalo, 48]} />
          <meshBasicMaterial color={colorAro} transparent opacity={rellenoHalo} depthWrite={false} />
        </mesh>
        {mode === "gps" ? (
          <mesh rotation={PLANO} position={[0, 0.016, 0]}>
            <ringGeometry args={[Math.max(0.05, m.radioHalo - 0.025), m.radioHalo + 0.025, 48]} />
            <meshBasicMaterial color={colorAro} transparent opacity={seleccionada ? 0.9 : 0.55} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ) : (
          <AnilloPunteado radio={m.radioHalo} color={colorAro} opacidad={seleccionada ? 0.95 : 0.5} y={0.016} />
        )}

        {/* Pie (marca en el suelo) y tallo hasta el marcador */}
        <mesh rotation={PLANO} position={[0, 0.02, 0]}>
          <circleGeometry args={[Math.max(0.07, r * 0.35), 16]} />
          <meshBasicMaterial color={colorAro} transparent opacity={0.9} depthWrite={false} />
        </mesh>
        {m.y > 0.05 && (
          <mesh position={[0, m.y / 2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, m.y, 6]} />
            <meshBasicMaterial color={colorAro} transparent opacity={0.55} />
          </mesh>
        )}

        {/* Cuerpo */}
        <group position={[0, m.y + r + 0.05, 0]} scale={escala}>
          <Icono3D
            id={m.icono}
            r={r}
            color={m.colorNucleo}
            brillo={seleccionada ? 0.95 : apuntada ? 0.75 : 0.5}
            translucido={!m.alturaMedida}
            opacidad={opacidad}
          />
          <mesh rotation={PLANO}>
            <torusGeometry args={[r * 1.55, 0.022, 8, 40]} />
            <meshBasicMaterial color={colorAro} />
          </mesh>
          {colorPunto && (
            <mesh position={[0, r * 1.9, 0]}>
              <sphereGeometry args={[m.colorEstado ? 0.08 : 0.055, 10, 10]} />
              <meshBasicMaterial color={colorPunto} />
            </mesh>
          )}
          {seleccionada && (
            <mesh rotation={PLANO}>
              <torusGeometry args={[r * 2.3, 0.03, 8, 48]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
            </mesh>
          )}
          {m.reciente && !reducido && !m.tenue && <Pulso radio={r} color={colorAro} />}
          {/* Zona de pulsación cómoda (invisible): también para el dedo en móvil */}
          <mesh
            onClick={(e) => { e.stopPropagation(); onSeleccionar(m.id); }}
            onPointerOver={(e) => { e.stopPropagation(); onApuntar(m.id); }}
            onPointerOut={() => onApuntar(null)}
          >
            <sphereGeometry args={[Math.max(0.45, r * 2.2), 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>

        {/* Foto: la de tu perfil en tus aparatos, o la que una cuenta ajena decidió mostrar; si no, nada */}
        {m.avatarUrl && (
          <Html position={[0, m.y + r * 2.1 + 0.2, 0]} center distanceFactor={FACTOR_ETIQUETA} zIndexRange={ZINDEX_ETIQUETAS} pointerEvents="none" wrapperClass="pointer-events-none" style={{ pointerEvents: "none" }}>
            <FotoPerfil url={m.avatarUrl} iniciales="" size={22} color={colorAro} className="pointer-events-none" />
          </Html>
        )}

        {conEtiqueta && (
          <Etiqueta3D
            position={[0, m.y + r * 2.6 + 0.35 + (m.avatarUrl ? 0.38 : 0), 0]}
            titulo={m.simulada ? `${s.label} (simulada)` : s.label}
            subtitulo={subtitulo}
            color={colorAro}
          />
        )}
      </group>
    </group>
  );
}

export default Marcador3D;
