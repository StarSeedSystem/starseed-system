"use client";

/**
 * Icono 3D propio de cada TIPO de señal (ver `src/lib/senales/iconos.ts`). Primitivas sencillas de three
 * (cajas, cilindros, anillos): sin modelos externos, sin texturas, casi sin coste. El color y el brillo
 * siguen siendo los del marcador (núcleo = calidad medida); la forma dice QUÉ ES, no cuánto vale.
 * Unidad: `r` = radio del marcador (0,2–0,4 unidades de escena).
 */

import type { ReactElement } from "react";
import type { IconoId } from "@/lib/senales/iconos";

export interface PropsIcono3D {
  id: IconoId;
  r: number;
  color: string;
  brillo: number;
  /** El eje de altura no tiene dato: se dibuja translúcido. */
  translucido: boolean;
  opacidad: number;
}

const PANTALLA = "#0b1220";

export function Icono3D({ id, r, color, brillo, translucido, opacidad }: PropsIcono3D): ReactElement {
  // Elementos (no componentes): así React no desmonta y vuelve a montar las mallas en cada pintado.
  const M = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={brillo} transparent={translucido} opacity={opacidad} roughness={0.4} />;
  const pantalla = (w: number, h: number, z: number) => (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={PANTALLA} transparent opacity={0.85 * opacidad} />
    </mesh>
  );

  switch (id) {
    case "nodo-lora":
      return (
        <group>
          <mesh position={[0, -r * 0.45, 0]}><sphereGeometry args={[r * 0.9, 20, 20]} />{M}</mesh>
          <mesh position={[0, r * 0.55, 0]}><cylinderGeometry args={[r * 0.1, r * 0.1, r * 2.1, 8]} />{M}</mesh>
          <mesh position={[0, r * 1.7, 0]}><sphereGeometry args={[r * 0.3, 12, 12]} />{M}</mesh>
        </group>
      );
    case "rele":
      return (
        <group>
          <mesh><octahedronGeometry args={[r * 1.25, 0]} />{M}</mesh>
          <mesh rotation={[0, Math.PI / 4, 0]}><torusGeometry args={[r * 1.85, r * 0.08, 8, 36]} />{M}</mesh>
        </group>
      );
    case "movil":
      return (
        <group>
          <mesh><boxGeometry args={[r * 1.15, r * 2.1, r * 0.3]} />{M}</mesh>
          {pantalla(r * 0.92, r * 1.7, r * 0.155)}
        </group>
      );
    case "tablet":
      return (
        <group>
          <mesh><boxGeometry args={[r * 2.1, r * 1.55, r * 0.26]} />{M}</mesh>
          {pantalla(r * 1.85, r * 1.3, r * 0.135)}
        </group>
      );
    case "portatil":
      return (
        <group>
          <mesh position={[0, -r * 0.6, r * 0.1]}><boxGeometry args={[r * 2.3, r * 0.14, r * 1.5]} />{M}</mesh>
          <group position={[0, r * 0.2, -r * 0.6]} rotation={[-0.22, 0, 0]}>
            <mesh><boxGeometry args={[r * 2.2, r * 1.45, r * 0.1]} />{M}</mesh>
            {pantalla(r * 1.95, r * 1.2, r * 0.055)}
          </group>
        </group>
      );
    case "escritorio":
      return (
        <group>
          <mesh position={[0, r * 0.4, 0]}><boxGeometry args={[r * 2.3, r * 1.45, r * 0.18]} />{M}</mesh>
          <group position={[0, r * 0.4, 0]}>{pantalla(r * 2.05, r * 1.2, r * 0.095)}</group>
          <mesh position={[0, -r * 0.55, 0]}><cylinderGeometry args={[r * 0.13, r * 0.13, r * 0.6, 8]} />{M}</mesh>
          <mesh position={[0, -r * 0.88, 0]}><cylinderGeometry args={[r * 0.6, r * 0.6, r * 0.08, 16]} />{M}</mesh>
        </group>
      );
    case "servidor":
      return (
        <group>
          {[-0.72, 0, 0.72].map((y) => (
            <group key={y} position={[0, r * y, 0]}>
              <mesh><boxGeometry args={[r * 1.8, r * 0.58, r * 1.25]} />{M}</mesh>
              <mesh position={[r * 0.62, 0, r * 0.64]}><sphereGeometry args={[r * 0.07, 8, 8]} /><meshBasicMaterial color="#86efac" /></mesh>
            </group>
          ))}
        </group>
      );
    case "enlace-directo":
      return (
        <group>
          <mesh position={[-r * 0.55, 0, 0]}><torusGeometry args={[r * 0.9, r * 0.17, 10, 28]} />{M}</mesh>
          <mesh position={[r * 0.55, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r * 0.9, r * 0.17, 10, 28]} />{M}</mesh>
        </group>
      );
    case "red-ip":
      return (
        <group>
          <mesh position={[0, -r * 0.55, 0]}><cylinderGeometry args={[r * 1.3, r * 1.3, r * 0.3, 24]} />{M}</mesh>
          <mesh position={[0, r * 0.35, 0]}><sphereGeometry args={[r * 0.75, 18, 18]} />{M}</mesh>
        </group>
      );
    case "bluetooth":
      return (
        <group>
          <mesh><boxGeometry args={[r * 1.4, r * 1.4, r * 1.4]} />{M}</mesh>
          <mesh rotation={[0, Math.PI / 4, Math.PI / 4]}><boxGeometry args={[r * 1.4, r * 1.4, r * 1.4]} />{M}</mesh>
        </group>
      );
    case "usb":
      return (
        <group>
          <mesh position={[0, r * 0.3, 0]}><coneGeometry args={[r * 1.05, r * 1.8, 16]} />{M}</mesh>
          <mesh position={[0, -r * 0.85, 0]}><boxGeometry args={[r * 0.9, r * 0.5, r * 0.4]} />{M}</mesh>
        </group>
      );
    default:
      return <mesh><icosahedronGeometry args={[r * 1.2, 0]} />{M}</mesh>;
  }
}

export default Icono3D;
