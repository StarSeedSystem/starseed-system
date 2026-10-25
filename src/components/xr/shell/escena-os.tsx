"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, XROrigin, createXRStore, useXR } from "@react-three/xr";
import { OrbitControls } from "@react-three/drei";
import { SoftWhitePointLight } from "@react-three/drei";
import { Suspense } from "react";
import type { ModoXR } from "@/lib/xr/tipos";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import { BotonEntradaXR } from "./boton-entrada-xr";
import Link from "next/link";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { useCapacidadesXR } from "./use-capacidades-xr";

export type ModoSesion = "vr-inmersivo" | "ar-passthrough" | "ar-mano" | null;

export function debeAutoEntrar({ modo, plan, yaIntentado }: { modo: ModoXR | null; plan: PlanEntrada; yaIntentado: boolean }): ModoSesion {
  if (!plan || plan.estrategia !== "auto-al-abrir") return null;
  if (yaIntentado) return null;
  if (!modo) return null;
  if (!["vr-inmersivo", "ar-passthrough", "ar-mano"].includes(modo)) return null;
  return modo as ModoSesion;
}

interface EscenaOSProps {
  modo?: ModoXR | null;
}

export function EscenaOS({ modo }: EscenaOSProps) {
  const almacen = createXRStore({
    emulate: false,
    profile: {
      level: "media",
    },
  });
  const [yaIntentado, setYaIntentado] = useState(false);
  const [eyeglassHeight, setEyeglassHeight] = useState<number | null>(null);
  const recentradoRef = useRef<boolean>(false);
  
  const { estado, capacidades, plan } = useCapacidadesXR({ modo });
  
  const modoAuto = debeAutoEntrar({ modo, plan, yaIntentado });
  
  useEffect(() => {
    if (modoAuto) {
      setYaIntentado(true);
    }
  }, [modoAuto]);
  
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ background: CRISTAL.fondoB.color }}
      >
        <XR store={almacen} emulate={false}>
          <XROrigin position={[0, eyeglassHeight || 0, 0]} />
          <SoftWhitePointLight intensity={0.5} position={[0, 5, 5]} />
          <Suspense fallback={null}>
            <mesh>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="white" opacity={0.5} transparent />
            </mesh>
          </Suspense>
        </XR>
      </Canvas>
      
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-4 left-4 pointer-events-auto">
          <Link href="/dashboard" className="cursor-pointer inline-flex items-center px-4 py-2 bg-[#0E101E]/90 hover:bg-[#0E101E] text-[#F5F7FF] rounded-full border border-white/15 shadow transition-colors">
            Salir al sistema
          </Link>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
          <BotonEntradaXR variante="insertado" alEntrar={(m) => setYaIntentado(true)} />
        </div>
      </div>
    </div>
  );
}
