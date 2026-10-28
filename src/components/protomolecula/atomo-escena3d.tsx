"use client";

/**
 * Protomolécula · Vista del átomo «Escena 3D (three.js)» (PM1010F1E).
 *
 * three y React-Three-Fiber ya están en el bundle, así que la escena corre en la página
 * (cargada de forma perezosa por `VISTAS_COMPONENTE`), nunca en un iframe. La cámara y la luz
 * siguen a los valores del panel; sin rotación automática se pinta bajo demanda (`frameloop`).
 * Sin WebGL se dice con claridad en vez de enseñar un lienzo vacío.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Mesh, PerspectiveCamera } from "three";
import { leerEscena3d, posicionLuz3d, type FormaEscena3d, type ValoresEscena3d } from "@/lib/protomolecula/atomos/escena3d";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

const COMPROBANDO = "Comprobando si este dispositivo puede dibujar 3D…";
const SIN_WEBGL = "Este navegador no ofrece WebGL: la escena 3D no se puede dibujar. Prueba otro navegador o activa la aceleración gráfica.";

/** ¿Hay WebGL en este dispositivo? Solo se llama en el cliente, nunca durante el render del servidor. */
function hayWebgl(): boolean {
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Mantiene la cámara del lienzo en el encuadre que piden los parámetros. */
function Camara({ fov, distancia }: { fov: number; distancia: number }) {
  const camara = useThree((s) => s.camera);
  const invalidar = useThree((s) => s.invalidate);
  useEffect(() => {
    const c = camara as PerspectiveCamera;
    c.fov = fov;
    c.position.set(0, distancia * 0.45, distancia);
    c.lookAt(0, 0, 0);
    c.updateProjectionMatrix();
    invalidar();
  }, [camara, fov, distancia, invalidar]);
  return null;
}

function Geometria({ forma }: { forma: FormaEscena3d }) {
  if (forma === "esfera") return <sphereGeometry args={[0.75, 48, 32]} />;
  if (forma === "toroide") return <torusGeometry args={[0.55, 0.22, 24, 64]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

/** El objeto: forma, escala, tono y malla de alambre; gira solo si hay rotación automática. */
function Objeto({ escena, rotacion }: { escena: ValoresEscena3d; rotacion: number }) {
  const malla = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!malla.current || rotacion <= 0) return;
    malla.current.rotation.y += delta * rotacion * 0.6;
  });
  return (
    <group rotation={[0.32, 0, 0]}>
      <mesh ref={malla} scale={escena.escala}>
        <Geometria forma={escena.forma} />
        <meshStandardMaterial
          color={`hsl(${escena.tono}, 72%, 58%)`}
          wireframe={escena.malla}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

export default function VistaEscena3d({ atomoId, valores }: VistaProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducido, setReducido] = useState(false);
  const escena = useMemo(() => leerEscena3d(valores, atomoId), [valores, atomoId]);

  useEffect(() => {
    setWebgl(hayWebgl());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducido(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  if (webgl === null) {
    return <p role="status" className="p-3 text-sm text-muted-foreground">{COMPROBANDO}</p>;
  }
  if (!webgl) {
    return <p role="status" className="p-3 text-sm text-muted-foreground">{SIN_WEBGL}</p>;
  }

  const rotacion = reducido ? 0 : escena.rotacion;
  const [lx, ly, lz] = posicionLuz3d(escena.angulo);
  return (
    <div className="relative h-full min-h-64 w-full overflow-hidden rounded-md border bg-background">
      <Canvas
        role="img"
        aria-label={`Escena 3D de la forma ${escena.forma}`}
        className="!absolute inset-0 cursor-grab"
        camera={{ position: [0, escena.distancia * 0.45, escena.distancia], fov: escena.fov, near: 0.05, far: 200 }}
        dpr={[1, 2]}
        frameloop={rotacion > 0 ? "always" : "demand"}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <Camara fov={escena.fov} distancia={escena.distancia} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[lx, ly, lz]} intensity={escena.luz} />
        <Objeto escena={escena} rotacion={rotacion} />
        <OrbitControls enableDamping={!reducido} minDistance={0.6} maxDistance={40} />
      </Canvas>
    </div>
  );
}
