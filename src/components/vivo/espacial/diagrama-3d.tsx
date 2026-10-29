"use client";

/**
 * Diagrama 3D y XR: pinta la escena pura de `diagrama-3d.ts` con React-Three-Fiber.
 * Abre su propio lienzo para la vista de diagrama (3D/XR) y comparte la escena con
 * `escena-compartida`; se ve igual en pantalla, VR y AR. Basado en la skill MIT
 * diagram-design (vendor/habilidades/diagram-design/), citada en architecture/diagramas.md §3-4.
 */

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Arista3d, Escena3d, Nodo3d, TipoDiagrama3d } from "@/lib/diagramas/diagrama-3d";
import { escena3d, estructuraDeSvg } from "@/lib/diagramas/diagrama-3d";
import { crearTexturaTexto } from "./texturas";

export interface PropsDiagrama3D {
  svg: string;
  tipo?: TipoDiagrama3d;
  /** Escala global de la pieza dentro de la escena. */
  escala?: number;
  onSeleccionar?: (id: string) => void;
  /** Alto de la vista cuando el componente abre su propio lienzo. */
  alto?: number;
  /** Nombre accesible de la figura. */
  etiqueta?: string;
}

function Etiqueta({ nodo }: { nodo: Nodo3d }) {
  const textura = useMemo(
    () => crearTexturaTexto(nodo.texto, { color: "#ffffff", fondo: nodo.color, relleno: 24, anchoMax: 640 }),
    [nodo.texto, nodo.color],
  );
  useEffect(() => () => { textura?.textura.dispose(); }, [textura]);
  if (!textura) return null;
  const alto = Math.max(0.3, nodo.tamano[1] * 0.5);
  return (
    <sprite position={[nodo.posicion[0], nodo.posicion[1], nodo.posicion[2] + 0.12]} scale={[alto * textura.aspecto, alto, 1]}>
      <spriteMaterial map={textura.textura} transparent depthWrite={false} />
    </sprite>
  );
}

function Aristas({ aristas }: { aristas: Arista3d[] }) {
  const geometria = useMemo(() => {
    const posiciones = new Float32Array(aristas.length * 6);
    aristas.forEach((a, i) => { posiciones.set(a.desde, i * 6); posiciones.set(a.hasta, i * 6 + 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
    return g;
  }, [aristas]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  return (
    <lineSegments geometry={geometria}>
      <lineBasicMaterial color="#7dd3fc" transparent opacity={0.55} />
    </lineSegments>
  );
}

function Caja({ nodo, onSeleccionar }: { nodo: Nodo3d; onSeleccionar?: (id: string) => void }) {
  const tamano: [number, number, number] = [nodo.tamano[0], nodo.tamano[1], nodo.tamano[2]];
  return (
    <mesh
      position={nodo.posicion}
      scale={tamano}
      onClick={onSeleccionar ? (e) => { e.stopPropagation(); onSeleccionar(nodo.id); } : undefined}
      onPointerOver={onSeleccionar ? () => { document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={onSeleccionar ? () => { document.body.style.cursor = ""; } : undefined}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={nodo.color}
        emissive={nodo.color}
        emissiveIntensity={nodo.focal ? 0.55 : 0.18}
        roughness={0.42}
        metalness={0.16}
        transparent
        opacity={nodo.focal ? 0.92 : 0.78}
      />
    </mesh>
  );
}

function Contenido({ escena, escala, onSeleccionar }: { escena: Escena3d; escala: number; onSeleccionar?: (id: string) => void }) {
  return (
    <group scale={escala}>
      <Aristas aristas={escena.aristas} />
      {escena.capas.map((capa) => (
        <mesh key={capa.id} position={[0, 0, capa.z]}>
          <planeGeometry args={[9, 6]} />
          <meshBasicMaterial color="#007FFF" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {escena.nodos.map((nodo) => (
        <group key={nodo.id}>
          <Caja nodo={nodo} onSeleccionar={onSeleccionar} />
          <Etiqueta nodo={nodo} />
        </group>
      ))}
    </group>
  );
}

export function Diagrama3D({ svg, tipo = "capas", escala = 1, onSeleccionar, alto = 420, etiqueta = "Diagrama en 3D" }: PropsDiagrama3D) {
  const escena = useMemo(() => escena3d(estructuraDeSvg(svg), tipo), [svg, tipo]);
  if (!escena.nodos.length) {
    return (
      <div role="status" style={{ height: alto }} className="grid place-items-center rounded-2xl border border-white/10 bg-[#0b0d18] px-6 text-center text-[12.5px] text-white/60">
        Este diagrama no tiene nodos que llevar al espacio.
      </div>
    );
  }
  return (
    <figure aria-label={etiqueta} className="relative m-0 overflow-hidden rounded-2xl border border-white/10" style={{ height: alto }}>
      <Canvas dpr={[1, 2]} camera={{ position: escena.camara, fov: 45 }}>
        <color attach="background" args={["#0b0d18"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 12, 6]} intensity={1.5} />
        <pointLight position={[-8, -4, -6]} intensity={0.45} color="#00F0FF" />
        <Contenido escena={escena} escala={escala} onSeleccionar={onSeleccionar} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] text-white/65">
        Arrastra para girar · rueda o pellizca para recorrer · {escena.tipo}
      </figcaption>
    </figure>
  );
}

export default Diagrama3D;
