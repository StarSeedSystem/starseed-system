"use client";

/**
 * Diagrama 3D y XR (architecture/diagramas.md §3.5, tarea DGM1018L).
 * Pinta la escena que sale de `estructuraDeSvg` + `escena3d` con @react-three/fiber: se gira
 * arrastrando y se recorre con rueda o pellizco. `EscenaDiagrama3D` es un `<group>` para montarlo
 * DENTRO del lienzo de `escena-compartida` (o de una sala XR); `Diagrama3D` añade su propio Canvas.
 * Sin red y sin recursos externos: las etiquetas son sprites con la tipografía del OS (texturas.ts).
 * Skill MIT diagram-design, citada en architecture/diagramas.md §3 y §4.
 */

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { escena3d, estructuraDeSvg, type Escena3D, type TipoEscenaDiagrama } from "@/lib/diagramas/diagrama-3d";
import { crearTexturaTexto } from "./texturas";

export interface PropsEscenaDiagrama3D {
  escena: Escena3D;
  /** Sin giro automático ni animación: respeta `prefers-reduced-motion`. */
  reducido?: boolean;
}

export interface PropsDiagrama3D {
  /** HTML del diagrama (el mismo que se muestra en el iframe aislado). */
  svg: string;
  tipo?: TipoEscenaDiagrama;
  reducido?: boolean;
  className?: string;
}

function Etiqueta({ texto, pos, alto }: { texto: string; pos: [number, number, number]; alto: number }) {
  const tex = useMemo(
    () => crearTexturaTexto(texto, { color: "#ffffff", fondo: "rgba(10,12,30,0.78)", anchoMax: 520 }),
    [texto],
  );
  useEffect(() => () => tex?.textura.dispose(), [tex]);
  if (!tex) return null;
  const h = Math.max(0.16, alto);
  return (
    <sprite position={pos} scale={[h * tex.aspecto, h, 1]} renderOrder={2}>
      <spriteMaterial map={tex.textura} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** La escena como grupo: úsala dentro de un Canvas ya abierto (escena compartida, sala XR). */
export function EscenaDiagrama3D({ escena, reducido = false }: PropsEscenaDiagrama3D) {
  const lineas = useMemo(() => {
    const puntos: number[] = [];
    for (const a of escena.aristas) puntos.push(...a.desde, ...a.hasta);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    return g;
  }, [escena]);
  useEffect(() => () => lineas.dispose(), [lineas]);
  return (
    <group name="diagrama-3d" rotation={[0, reducido ? 0 : 0.18, 0]}>
      {escena.nodos.map((n) => (
        <group key={n.id} position={n.pos} name={`nodo:${n.id}`}>
          <mesh>
            <boxGeometry args={n.tamano} />
            <meshStandardMaterial color={n.color} roughness={0.55} metalness={0.15} transparent opacity={0.94} />
          </mesh>
          {n.billboard && n.texto && (
            <Etiqueta texto={n.texto} pos={[0, n.tamano[1] / 2 + 0.22, n.tamano[2] / 2 + 0.02]} alto={Math.min(0.34, 0.12 + n.tamano[0] * 0.04)} />
          )}
        </group>
      ))}
      {escena.aristas.length > 0 && (
        <lineSegments geometry={lineas}>
          <lineBasicMaterial color="#9aa7ff" transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
}

/** Vista autónoma: canvas oscuro del OS, luces, órbita y la escena del diagrama. */
export function Diagrama3D({ svg, tipo = "capas", reducido = false, className }: PropsDiagrama3D) {
  const escena = useMemo(() => escena3d(estructuraDeSvg(svg), tipo), [svg, tipo]);
  if (!escena.nodos.length) {
    return (
      <p className={className} role="status">
        Este diagrama no tiene formas que llevar a 3D.
      </p>
    );
  }
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: 280, cursor: "grab" }}>
      <Canvas camera={{ position: [0, 3.4, 9.5], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#0b1020"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 8, 6]} intensity={1.35} />
        <EscenaDiagrama3D escena={escena} reducido={reducido} />
        <OrbitControls makeDefault autoRotate={!reducido} autoRotateSpeed={0.55} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}

export default Diagrama3D;
