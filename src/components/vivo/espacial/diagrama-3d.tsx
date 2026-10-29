"use client";

// Componente React Three Fiber para diagramas 3D (L5 · 2026-10-18)
// Pinta la escena generada por src/lib/diagramas/diagrama-3d.ts dentro de
// `escena-compartida` (solo este componente). El SVG se extrae, la estructura
// se convierte a nodos y aristas 3D, y se renderiza con @react-three/fiber.
// Compatibilidad: @react-three/fiber ^9.x, three ^0.160.x.

import { useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { EstructuraSvg } from "@/lib/diagramas/diagrama-3d";
import { escena3d } from "@/lib/diagramas/diagrama-3d";

import type { CamaraCompartida, ModoXR } from "./lienzo-escena";
import { useSesionEscena } from "./use-sesion-escena";
import { usePerfilRendimiento } from "./rendimiento";

import type { FuenteEscena } from "@/lib/vivo/espacial/sesion";
import { objetosVivos, type TipoObjeto, type Vec3 } from "@/lib/vivo/espacial/modelo";

export interface Diagrama3DProps {
  fuente: FuenteEscena;
  /** Tiempos activos para fondos de shaders (opcional). */
  tiemposShader?: Record<string, number>;
  /** Modo XR (vr|ar) desde una llamada. */
  modoPedido?: ModoXR | null;
  /** Si la entrada a XR va al frente (desde una sala). */
  enfoqueXR?: boolean;
  /** Callback al seleccionar un objeto (ID o null). */
  onSeleccionar?: (id: string | null) => void;
  /** Para interfaces accesibles y lenguajes no ingleses. */
  ariaLabel?: string;
}

// Nodo 3D reutilizable para nodos y aristas del diagrama.
function NodoDiagrama3D({
  posicion,
  rotacion,
  tipo,
  datos,
  color = "#ffffff",
  enSeleccion = false,
  onClick,
}: {
  posicion: [number, number, number];
  rotacion: [number, number, number];
  tipo: string;
  datos?: any;
  color?: string;
  enSeleccion?: boolean;
  onClick?: () => void;
}): ReactNode {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.01;
      if (enSeleccion) {
        ref.current.scale.setScalar(1.2);
      } else {
        ref.current.scale.setScalar(1);
      }
    }
  });

  const geometria =
    tipo === "rect"
      ? new THREE.BoxGeometry(1, 1, 0.1)
      : tipo === "circulo"
        ? new THREE.SphereGeometry(0.5, 32, 32)
        : tipo === "texto"
          ? new THREE.BoxGeometry(2, 0.5, 0.1)
          : new THREE.BoxGeometry(1, 1, 0.1);

  const material = new THREE.MeshStandardMaterial({
    color: enSeleccion ? "#ffbf00" : color,
    emissive: enSeleccion ? "#ffbf00" : "#000000",
    emissiveIntensity: enSeleccion ? 0.2 : 0,
    metalness: 0.5,
    roughness: 0.5,
  });

  return (
    <mesh ref={ref} position={posicion as any} rotation={rotacion as any} onClick={onClick}>
      <primitive object={geometria} />
      <primitive object={material} />
      {tipo === "texto" && datos?.contenido ? (
        <Text
          position={[0, 0, 0.11]}
          fontSize={0.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {datos.contenido}
        </Text>
      ) : null}
    </mesh>
  );
}

// Conector 3D para aristas entre nodos.
function AristaDiagrama3D({
  posicion,
  rotacion,
  tipo,
  color = "#666666",
}: {
  posicion: [number, number, number];
  rotacion: [number, number, number];
  tipo: string;
  color?: string;
}): ReactNode {
  const longitud = 5;
  const geometria = new THREE.CylinderGeometry(0.05, 0.05, longitud, 8);
  const material = new THREE.MeshStandardMaterial({ color });

  return (
    <mesh position={posicion as any} rotation={rotacion as any}>
      <primitive object={geometria} />
      <primitive object={material} />
    </mesh>
  );
}

// Capa 3D para capas del diagrama.
function CapaDiagrama3D({
  posicion,
  rotacion,
  tipo,
}: {
  posicion: [number, number, number];
  rotacion: [number, number, number];
  tipo: string;
}): ReactNode {
  const radio = tipo === "superior" ? 1.5 : tipo === "base" ? 0.8 : 1.2;
  const geometria = new THREE.TorusGeometry(radio, 0.1, 16, 100);
  const material = new THREE.MeshStandardMaterial({
    color: tipo === "superior" ? "#ff6b6b" : tipo === "base" ? "#4ecdc4" : "#95e1d3",
    metalness: 0.7,
    roughness: 0.3,
    transparent: true,
    opacity: 0.6,
  });

  return (
    <mesh position={posicion as any} rotation={rotacion as any}>
      <primitive object={geometria} />
      <primitive object={material} />
    </mesh>
  );
}

// Lámpara para resaltar nodos seleccionados.
function Resaltador({
  activo,
  posicion,
}: {
  activo: boolean;
  posicion: [number, number, number];
}): ReactNode {
  if (!activo) return null;

  return (
    <pointLight position={posicion as any} intensity={2} distance={10} color="#ffbf00" />
  );
}

// Estructura principal del diagrama 3D.
function EstructuraDiagrama3D({
  estructura,
  tipo,
  enSeleccion,
  nodoSeleccionado,
  onSeleccionar,
}: {
  estructura: EstructuraSvg;
  tipo: string;
  enSeleccion?: boolean;
  nodoSeleccionado?: string | null;
  onSeleccionar?: (id: string) => void;
}): ReactNode {
  const escena3D = useMemo(() => escena3d(estructura, tipo), [estructura, tipo]);

  return (
    <>
      {estructura.capas.map((capa) => {
        const capa3D = escena3D.capas3D.find((c) => c.id === capa.id);
        if (!capa3D) return null;
        return (
          <CapaDiagrama3D
            key={capa.id}
            posicion={capa3D.posicion}
            rotacion={capa3D.rotacion}
            tipo={capa3D.tipo}
          />
        );
      })}

      {Object.entries(estructura.nodos).map(([id, nodo]) => {
        const nodo3D = escena3D.nodos3D[id];
        if (!nodo3D) return null;
        return (
          <NodoDiagrama3D
            key={id}
            posicion={nodo3D.posicion}
            rotacion={nodo3D.rotacion}
            tipo={nodo3D.tipo}
            datos={nodo}
            color="#ffffff"
            enSeleccion={nodoSeleccionado === id}
            onClick={() => onSeleccionar && onSeleccionar(id)}
          />
        );
      })}

      {Object.entries(estructura.aristas).map(([id, arista]) => {
        const arista3D = escena3D.aristas3D[id];
        if (!arista3D) return null;
        return (
          <AristaDiagrama3D
            key={id}
            posicion={arista3D.posicion}
            rotacion={arista3D.rotacion}
            tipo={arista3D.tipo}
            color="#666666"
          />
        );
      })}

      {nodoSeleccionado && (<Resaltador activo={true} posicion={escena3D.nodos3D[nodoSeleccionado]?.posicion as [number, number, number] || [0, 0, 0]} />)}
    </>
  );
}

// Componente de cámara 3D con controles Orbit y soporte XR.
function Camara3D({
  enfoqueXR = false,
  modoPedido = null,
}: {
  enfoqueXR?: boolean;
  modoPedido?: ModoXR | null;
}): ReactNode {
  const { camera } = useThree();
  const [modoXR, setModoXR] = useState<ModoXR | null>(modoPedido);

  useFrame(() => {
    if (enfoqueXR) {
      camera.position.z = 5;
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
    }
  });

  return <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />;
}

// Componente principal del diagrama 3D.
export function Diagrama3D({
  fuente,
  tiemposShader,
  modoPedido,
  enfoqueXR = false,
  onSeleccionar,
  ariaLabel = "Diagrama 3D",
}: Diagrama3DProps): ReactNode {
  const { sesion } = useSesionEscena(fuente);
  const perfil = usePerfilRendimiento();
  const [nodoSeleccionado, setNodoSeleccionado] = useState<string | null>(null);
  const [svgOriginal, setSvgOriginal] = useState<string | null>(null);

  const estructura = useMemo(() => {
    if (!svgOriginal) return null;
    try {
      return escena3d(estructuraDeSvg(svgOriginal), "arbol");
    } catch (error) {
      console.error("Error al extraer estructura del SVG:", error);
      return null;
    }
  }, [svgOriginal]);

  useEffect(() => {
    if (sesion?.doc?.atributos?.svg) {
      setSvgOriginal(sesion.doc.atributos.svg as string);
    }
  }, [sesion?.doc?.atributos?.svg]);

  return (
    <figure
      className="w-full h-full relative"
      role="img"
      aria-label={ariaLabel}
    >
      <Canvas
        shadows
        gl={{ alpha: false, antialias: true }}
        camera={{ position: [10, 10, 10], fov: 50 }}
        className="w-full h-full"
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        {estructura ? (
          <EstructuraDiagrama3D
            estructura={estructura}
            tipo="arbol"
            nodoSeleccionado={nodoSeleccionado}
            onSeleccionar={setNodoSeleccionado}
          />
        ) : (
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[5, 5, 5]} />
            <meshStandardMaterial color="#666666" />
          </mesh>
        )}

        <Camara3D enfoqueXR={enfoqueXR} modoPedido={modoPedido} />
      </Canvas>

      {svgOriginal && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs p-1 rounded">
          Diagrama 3D
        </div>
      )}
    </figure>
  );
}

export default Diagrama3D;
