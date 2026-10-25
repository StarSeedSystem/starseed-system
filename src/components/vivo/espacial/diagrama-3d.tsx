"use client";

// Componente 3D para diagramas. Pinta con @react-three/fiber
// dentro de escena-compartida (solo el componente).
// Usa módulo puro diagrama-3d.ts.

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { Escena3d } from "@/lib/diagramas/diagrama-3d";

export interface Diagrama3dProps {
  escena: Escena3d;
  altura?: number;
}

function Nodo({ nodo }: { nodo: Escena3d["nodos"][number] }) {
  if (nodo.tipo === "text") {
    return (
      <Text
        position={nodo.posicion}
        rotation={nodo.rotacion}
        fontSize={0.4}
        color="#f5f5f5"
        anchorX="center"
        anchorY="middle"
      >
        {nodo.etiqueta}
      </Text>
    );
  }
  return (
    <mesh position={nodo.posicion} rotation={nodo.rotacion} scale={nodo.escala}>
      <boxGeometry args={[1.2, 0.8, 0.1]} />
      <meshStandardMaterial color="#9aa0ad" transparent opacity={0.8} />
    </mesh>
  );
}

function Arista({ arista }: { arista: Escena3d["aristas"][number] }) {
  if (arista.puntos.length < 2) return null;
  const puntos = arista.puntos;
  return (
    <line>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          array={new Float32Array(puntos.flat())}
          count={puntos.length}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial attach="material" color="#bf4520" linewidth={1} />
    </line>
  );
}

export default function Diagrama3d({ escena, altura = 400 }: Diagrama3dProps) {
  return (
    <div style={{ width: "100%", height: altura }}>
      <Canvas camera={{ position: escena.camara.posicion, fov: 60 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          {escena.nodos.map((nodo) => (
            <Nodo key={nodo.id} nodo={nodo} />
          ))}
          {escena.aristas.map((arista) => (
            <Arista key={arista.id} arista={arista} />
          ))}
          <OrbitControls makeDefault />
        </Suspense>
      </Canvas>
    </div>
  );
}
