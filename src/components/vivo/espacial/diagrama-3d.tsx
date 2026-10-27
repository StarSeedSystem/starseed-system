"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { escena3d, estructuraDeSvg, type Escena3D, type EstructuraSvg } from "@/lib/diagramas/diagrama-3d";
import { EscenaCompartida } from "./escena-compartida";

export interface Diagrama3DProps {
  svg?: string;
  estructura?: EstructuraSvg;
  tipo?: "capas" | "despiece" | "planta-axonometrica" | "grafo";
  className?: string;
}

function NodoMesh({ posicion, rotacion, escala, datos }: {
  posicion: [number, number, number];
  rotacion: [number, number, number];
  escala: [number, number, number];
  datos: any;
}) {
  if (datos.tipo === "texto") {
    return (
      <Text position={posicion} rotation={rotacion} scale={escala} fontSize={0.8} color="#ffffff" anchorX="center" anchorY="middle">
        {datos.etiqueta}
      </Text>
    );
  }
  if (datos.tipo === "circulo") {
    const r = datos.radio ? datos.radio / 20 : 0.5;
    return (
      <mesh position={posicion} rotation={rotacion} scale={escala}>
        <sphereGeometry args={[r, 32, 32]} />
        <meshStandardMaterial color="#4f9deb" />
      </mesh>
    );
  }
  const w = datos.ancho ? datos.ancho / 20 : 1;
  const h = datos.alto ? datos.alto / 20 : 0.6;
  return (
    <mesh position={posicion} rotation={rotacion} scale={escala}>
      <boxGeometry args={[w, h, 0.1]} />
      <meshStandardMaterial color="#7aa2f7" />
    </mesh>
  );
}

function AristaMesh({ posicion }: { posicion: [number, number, number] }) {
  return (
    <mesh position={posicion}>
      <cylinderGeometry args={[0.02, 0.02, 4, 8]} />
      <meshStandardMaterial color="#9ece6a" />
    </mesh>
  );
}

function EscenaDiagrama({ escena }: { escena: Escena3D }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={0.8} />
      {escena.elementos.map((el) => {
        if (el.tipo === "nodo") {
          return (
            <NodoMesh
              key={el.id}
              posicion={el.posicion}
              rotacion={el.rotacion}
              escala={el.escala}
              datos={el.datos}
            />
          );
        }
        return <AristaMesh key={el.id} posicion={el.posicion} />;
      })}
      <OrbitControls makeDefault />
    </>
  );
}

export function Diagrama3D({ svg, estructura, tipo = "capas", className }: Diagrama3DProps) {
  const escena = useMemo(() => {
    let est: EstructuraSvg | undefined = estructura;
    if (!est && svg) {
      est = estructuraDeSvg(svg);
    }
    if (!est) {
      est = { nodos: [], aristas: [], capas: [] };
    }
    return escena3d(est, tipo);
  }, [svg, estructura, tipo]);

  return (
    <EscenaCompartida className={className}>
      <Canvas camera={{ position: [20, 15, 30], fov: 50 }}>
        <Suspense fallback={null}>
          <EscenaDiagrama escena={escena} />
        </Suspense>
      </Canvas>
    </EscenaCompartida>
  );
}

export default Diagrama3D;
