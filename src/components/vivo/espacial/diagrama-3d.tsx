"use client";

// Diagrama 3D y XR dentro de la escena compartida. Pinta la escena PURA de
// `diagrama-3d.ts` con @react-three/fiber; las etiquetas son sprites (siempre de cara a la
// cámara) con textura dibujada en canvas local: sin fuentes ni recursos de red.
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/), citada en
// architecture/diagramas.md §3-4 y ampliado por starseed-xr.md.

import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { escena3d, estructuraDeSvg, type Escena3d, type Nodo3d, type TipoEscena3d, type Vec3 } from "@/lib/diagramas/diagrama-3d";
import { crearTexturaTexto } from "./texturas";

const PALETA = ["#00F0FF", "#10B981", "#FFBF00", "#DC143C", "#7C3AED", "#4F5D75"] as const;
const FONDO = "#0b0f1f";

function Etiqueta({ texto, posicion }: { texto: string; posicion: Vec3 }) {
    const tex = useMemo(
        () => crearTexturaTexto(texto, { color: "#E8ECFF", fondo: "rgba(10,12,30,0.72)", anchoMax: 520 }),
        [texto],
    );
    useEffect(() => () => tex?.textura.dispose(), [tex]);
    if (!tex) return null;
    // Un sprite mira siempre a la cámara, en pantalla, VR y AR.
    const ancho = 1.1;
    return (
        <sprite position={posicion} scale={[ancho, ancho / tex.aspecto, 1]}>
            <spriteMaterial map={tex.textura} transparent depthWrite={false} toneMapped={false} />
        </sprite>
    );
}

function Nodo({ nodo, color }: { nodo: Nodo3d; color: string }) {
    const [ancho, alto, fondo] = nodo.tamano;
    return (
        <group position={nodo.posicion}>
            {nodo.forma === "circulo" ? (
                <mesh castShadow>
                    <sphereGeometry args={[Math.max(ancho, alto) / 2, 24, 16]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} roughness={0.35} metalness={0.25} />
                </mesh>
            ) : (
                <mesh castShadow>
                    <boxGeometry args={[ancho, alto, fondo]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.42} metalness={0.2} />
                </mesh>
            )}
        </group>
    );
}

/** Contenido sin Canvas: se puede montar dentro del lienzo de `escena-compartida`. */
export function ContenidoDiagrama3D({ escena }: { escena: Escena3d }) {
    const posiciones = useMemo(() => new Map(escena.nodos.map((n) => [n.id, n.posicion])), [escena]);
    const colorDe = useMemo(() => {
        const indice = new Map(escena.capas.map((c, i) => [c.id, i]));
        return (n: Nodo3d) => PALETA[(n.capa ? indice.get(n.capa) ?? 0 : 0) % PALETA.length];
    }, [escena]);
    return (
        <>
            <ambientLight intensity={0.55} />
            <hemisphereLight args={["#dff3ff", FONDO, 0.55]} />
            <directionalLight position={[4, 7, 6]} intensity={1.05} />
            {escena.aristas.map((a) => {
                const desde = posiciones.get(a.fuente);
                const hasta = posiciones.get(a.destino);
                if (!desde || !hasta) return null;
                return <Line key={a.id} points={[desde, hasta]} color="#6c7a9c" lineWidth={1} transparent opacity={0.6} />;
            })}
            {escena.nodos.map((n) => <Nodo key={n.id} nodo={n} color={colorDe(n)} />)}
            {escena.etiquetas.map((e) => <Etiqueta key={e.id} texto={e.texto} posicion={e.posicion} />)}
        </>
    );
}

export interface PropsDiagrama3D {
    /** SVG del diagrama (HTML completo o solo el bloque <svg>). */
    svg: string;
    tipo?: TipoEscena3d;
    className?: string;
    alto?: number;
}

export function Diagrama3D({ svg, tipo = "capas", className, alto = 420 }: PropsDiagrama3D) {
    const escena = useMemo(() => escena3d(estructuraDeSvg(svg), tipo), [svg, tipo]);
    return (
        <div
            className={className}
            style={{ height: alto }}
            data-diagrama-3d={tipo}
            role="img"
            aria-label={`Diagrama ${tipo} en 3D`}
        >
            <Canvas
                camera={{ position: escena.camara.posicion, fov: 45, near: 0.05, far: 200 }}
                dpr={[1, 2]}
                gl={{ antialias: true }}
            >
                <color attach="background" args={[FONDO]} />
                <Suspense fallback={null}>
                    <ContenidoDiagrama3D escena={escena} />
                </Suspense>
                <OrbitControls makeDefault target={escena.camara.objetivo} enableDamping minDistance={1} maxDistance={40} />
            </Canvas>
        </div>
    );
}

export default Diagrama3D;
