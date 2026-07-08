"use client";

/*
 * Material3DScene — escena react-three-fiber aislada (para cargarse vía
 * next/dynamic con ssr:false desde Material3DPanel, siguiendo el mismo
 * patrón que el resto de visores 3D del repo, p.ej.
 * src/components/dashboard/apps/content/model-viewer.tsx).
 *
 * `Environment` (drei) trae luz de entorno realista descargando un HDRI de
 * una CDN — si esa red falla (entorno offline/restringido), un ErrorBoundary
 * local lo retira SIN tirar el resto de la escena: las luces directas ya
 * dejan el material perfectamente legible sin entorno.
 */

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";

export interface Material3DSceneProps {
    shape: "sphere" | "panel";
    color: string; // hex
    roughness: number; // 0-1
    metalness: number; // 0-1
    transmission: number; // 0-1 (vidrio/transmisión)
}

class EnvBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { failed: false };
    }
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}

function MaterialBlob({ shape, color, roughness, metalness, transmission }: Material3DSceneProps) {
    return (
        <mesh rotation={[0.3, 0.5, 0]}>
            {shape === "sphere" ? <sphereGeometry args={[1.15, 64, 64]} /> : <boxGeometry args={[1.8, 1.8, 0.18]} />}
            <meshPhysicalMaterial
                color={color}
                roughness={roughness}
                metalness={metalness}
                transmission={transmission}
                thickness={1.2}
                ior={1.4}
                clearcoat={0.35}
                envMapIntensity={1.1}
            />
        </mesh>
    );
}

export function Material3DScene(props: Material3DSceneProps) {
    return (
        <Canvas camera={{ position: [0, 0, 3.4], fov: 40 }} dpr={[1, 2]}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[4, 5, 4]} intensity={1.2} />
            <directionalLight position={[-4, -2, -3]} intensity={0.35} />
            <Suspense fallback={null}>
                <EnvBoundary>
                    <Environment preset="city" />
                </EnvBoundary>
                <MaterialBlob {...props} />
            </Suspense>
            <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={1.1} />
        </Canvas>
    );
}

export default Material3DScene;
