'use client';

// ════════════════════════════════════════════════════════════════
// ModelViewer — visor 3D (GLB/GLTF · Three.js / React-Three-Fiber)
// Se carga con next/dynamic (ssr:false) desde viewer-registry para
// no penalizar el peso inicial. Órbita libre, autocentrado, luces.
// ════════════════════════════════════════════════════════════════

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, useGLTF } from "@react-three/drei";
import type { ContentResource } from "./content-types";

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
}

export default function ModelViewer({ resource }: { resource: ContentResource }) {
    if (!resource.url) {
        return <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Modelo sin origen.</div>;
    }
    return (
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/10">
            <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 6, 5]} intensity={1.1} />
                <directionalLight position={[-5, -3, -5]} intensity={0.4} />
                <Suspense fallback={null}>
                    <Center>
                        <Model url={resource.url} />
                    </Center>
                </Suspense>
                <OrbitControls makeDefault enablePan autoRotate autoRotateSpeed={0.6} />
            </Canvas>
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.16em] font-bold text-white/50">
                arrastra para orbitar · rueda para zoom
            </p>
        </div>
    );
}
