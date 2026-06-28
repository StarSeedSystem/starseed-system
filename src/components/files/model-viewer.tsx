"use client";

// ════════════════════════════════════════════════════════════════════════════
// ModelViewer — visor 3D ligero para .glb/.gltf usado por <FilePreview>.
// Carga sólo en cliente (lo importa <FilePreview> vía next/dynamic, ssr:false).
// Usa @react-three/fiber + drei (ya presentes en el proyecto). Tolerante: si el
// modelo falla, el <ErrorBoundary> del padre degrada a miniatura.
// ════════════════════════════════════════════════════════════════════════════

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF, Html } from "@react-three/drei";

function Model({ src }: { src: string }) {
    const { scene } = useGLTF(src);
    return <primitive object={scene} />;
}

export function ModelViewer({ src }: { src: string }) {
    return (
        <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]} className="size-full">
            <Suspense
                fallback={
                    <Html center>
                        <span className="text-[11px] text-white/40">Cargando modelo…</span>
                    </Html>
                }
            >
                <Stage environment="city" intensity={0.5} adjustCamera>
                    <Model src={src} />
                </Stage>
            </Suspense>
            <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={1.2} />
        </Canvas>
    );
}

export default ModelViewer;
