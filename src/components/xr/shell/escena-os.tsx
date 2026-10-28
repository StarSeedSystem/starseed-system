"use client";

import { Canvas } from "@react-three/fiber";
import { XR, XROrigin } from "@react-three/xr";
import { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
import type { ModoSesion } from "@/app/(app)/xr/os/page";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { obtenerAlmacenXR } from "@/components/xr/shell/almacen-xr";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { PERFILES } from "@/lib/xr/calidad-perfiles";

const PERFIL = PERFILES.media;

export function EscenaOS({ modo }: { modo: ModoSesion | null }) {
    const { capacidades } = useCapacidadesXR({ modo: modo ?? "auto" });
    const almacen = obtenerAlmacenXR({ perfil: PERFIL, capacidades });

    return (
        <Canvas
            camera={{ position: [0, 1.6, 0], fov: 70 }}
            gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
            style={{ width: "100%", height: "100%", background: CRISTAL.fondoB.color }}
        >
            <Suspense fallback={null}>
                <XR store={almacen} emulate={false}>
                    <XROrigin>
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[5, 10, 5]} intensity={0.8} />
                        {modo === "3d-pantalla" && <OrbitControls enablePan={false} minDistance={1} maxDistance={50} />}
                    </XROrigin>
                </XR>
            </Suspense>
        </Canvas>
    );
}