"use client";

/**
 * Diagrama 3D (Ola 1018D · L): pinta con @react-three/fiber la escena pura de
 * `src/lib/diagramas/diagrama-3d.ts`. Los textos son texturas locales dibujadas en canvas
 * (sin fuentes remotas) y siempre miran a la cámara. Se puede montar dentro de la escena
 * compartida con `ContenidoDiagrama3D` o usar `Diagrama3D` con su propio lienzo.
 * Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/).
 */

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Billboard, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { escena3d, estructuraDeSvg, type Arista3D, type Escena3D, type Nodo3D } from "@/lib/diagramas/diagrama-3d";
import { crearTexturaTexto } from "./texturas";

export interface PropsDiagrama3D {
  /** SVG o HTML del diagrama: solo se lee su estructura, nunca se inserta. */
  svg: string;
  tipo?: string;
  /** Alto del lienzo en px (mínimo 280). */
  alto?: number;
}

const COLOR: Record<Nodo3D["forma"], string> = { rect: "#007FFF", circulo: "#10B981", texto: "#FFBF00" };

function TextoNodo({ nodo }: { nodo: Nodo3D }) {
  const ancho = Math.max(0.6, nodo.tamano[0] * 0.92);
  const tex = useMemo(
    () => crearTexturaTexto(nodo.texto || " ", { color: "#F5F7FF", fondo: "rgba(10,14,29,0.88)", anchoMax: 420 }),
    [nodo.texto],
  );
  useEffect(() => () => tex?.textura.dispose(), [tex]);
  return (
    <Billboard position={[nodo.posicion[0], nodo.posicion[1], nodo.posicion[2] + nodo.tamano[2] / 2 + 0.02]}>
      <mesh>
        <planeGeometry args={[ancho, ancho / (tex?.aspecto ?? 2)]} />
        <meshBasicMaterial map={tex?.textura ?? null} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

function Nodo({ nodo }: { nodo: Nodo3D }) {
  return (
    <group>
      <mesh position={nodo.posicion}>
        <boxGeometry args={nodo.tamano} />
        <meshStandardMaterial color={COLOR[nodo.forma]} transparent opacity={0.42} roughness={0.3} metalness={0.15} />
      </mesh>
      <TextoNodo nodo={nodo} />
    </group>
  );
}

function Arista({ arista, porId }: { arista: Arista3D; porId: Map<string, Nodo3D> }) {
  const puntos = useMemo(() => {
    const a = porId.get(arista.de), b = porId.get(arista.a);
    return a && b ? [new THREE.Vector3(...a.posicion), new THREE.Vector3(...b.posicion)] : null;
  }, [arista, porId]);
  if (!puntos) return null;
  return <Line points={puntos} color="#7C8AA5" lineWidth={1.1} transparent opacity={0.72} />;
}

/** Contenido R3F sin Canvas: para montarlo dentro de una escena ya existente. */
export function ContenidoDiagrama3D({ escena }: { escena: Escena3D }) {
  const porId = useMemo(() => new Map(escena.nodos.map((n) => [n.id, n])), [escena.nodos]);
  return (
    <group rotation={[-0.32, 0.55, 0]}>
      {escena.nodos.map((n) => <Nodo key={n.id} nodo={n} />)}
      {escena.aristas.map((a) => <Arista key={a.id} arista={a} porId={porId} />)}
    </group>
  );
}

export function Diagrama3D({ svg, tipo = "auto", alto = 420 }: PropsDiagrama3D) {
  const escena = useMemo(() => escena3d(estructuraDeSvg(svg), tipo), [svg, tipo]);
  const camara = useMemo<[number, number, number]>(() => [escena.distancia * 0.55, escena.distancia * 0.35, escena.distancia], [escena.distancia]);
  return (
    <div style={{ width: "100%", height: Math.max(280, alto), minHeight: 280 }}>
      <Canvas dpr={[1, 2]} camera={{ position: camara, fov: 46 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0A0F1D"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 9, 7]} intensity={1.2} />
        <ContenidoDiagrama3D escena={escena} />
        <OrbitControls enableDamping target={[0, 0, escena.distancia * 0.15]} />
      </Canvas>
    </div>
  );
}
