"use client";

/**
 * StarSeed XR · RENDER DEL MUNDO (XR1010V, contrato §3 g). Cascarón R3F: pinta lo que lista
 * `planDeEscena` (mundo adaptado al nivel) con las órdenes del motor de XR1010U. Los `splat`
 * y `avatar-vrm` son marcadores (los pintan XR1010AM y XR1010Z); el mundo es un dato.
 */
import { Suspense, useMemo, type ReactNode } from "react";
import { Html, Sky, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { planDeEscena, type PiezaEscena } from "@/lib/xr/terreno";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { paramsMaterial, type ParamsMaterial } from "@/lib/xr/tokens-3d";
import type { LuzMundo, MundoSpec } from "@/lib/xr/mundo-tipos";
import type { EstadoMotor } from "@/lib/xr/mundo-motor";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** Colores de fondo del degradado simple (niveles mínima/baja); media+ usa la malla `Sky` de drei. */
const COLOR_CIELO: Record<string, string> = { nebulosa: "#0B0722", amanecer: "#F2A65A", mediodia: "#8EC9FF", atardecer: "#3A1E4F", noche: "#05060F", estudio: "#191922" };

export type PiezaObjeto = Extract<PiezaEscena, { clase: "objeto" }>;
export type PiezaTerreno = Extract<PiezaEscena, { clase: "terreno" }>;

export type PropsMundoRender = { mundo: MundoSpec; nivel: NivelCalidad; estado?: EstadoMotor; recursos?: Record<string, string | null> };

export function materialDe(p: ParamsMaterial, color: string): THREE.Material {
    const base = { color, transparent: p.transparente, opacity: p.opacidad };
    if (p.clase === "MeshBasicMaterial") return new THREE.MeshBasicMaterial(base);
    if (p.clase === "MeshStandardMaterial") return new THREE.MeshStandardMaterial({ ...base, roughness: p.rugosidad ?? 1, metalness: p.metalico ?? 0 });
    return new THREE.MeshPhysicalMaterial({ ...base, roughness: p.rugosidad ?? 1, transmission: p.transmision ?? 0, thickness: p.grosor ?? 0, ior: p.ior ?? 1.5, dispersion: p.dispersion ?? 0 });
}

/** Primitivas del vocabulario cerrado: una geometría de three por forma de `FORMAS_PRIMITIVAS`. */
export function geometriaDe(forma: string): ReactNode {
    switch (forma) {
        case "esfera": return <sphereGeometry args={[0.5, 24, 16]} />;
        case "cilindro": return <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
        case "cono": return <coneGeometry args={[0.5, 1, 24]} />;
        case "toro": return <torusGeometry args={[0.4, 0.15, 16, 32]} />;
        case "plano": return <planeGeometry args={[1, 1]} />;
        case "capsula": return <capsuleGeometry args={[0.4, 0.6, 8, 16]} />;
        default: return <boxGeometry args={[1, 1, 1]} />;
    }
}

/** Sólo llega aquí una URL https (lo garantiza el plan): drei la carga dentro de Suspense. */
function PiezaGlb({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
}

function PiezaImagen({ url }: { url: string }) {
    const textura = useTexture(url);
    return <mesh><planeGeometry args={[1, 1]} /><meshBasicMaterial map={textura} toneMapped={false} /></mesh>;
}

function MallaTerreno({ pieza, params, sombras }: { pieza: PiezaTerreno; params: ParamsMaterial; sombras: boolean }) {
    const geo = useMemo(() => {
        const r = pieza.resolucion;
        const lado = r + 1;
        const d = pieza.datos;
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array(d.alturas.length * 3);
        const indices: number[] = [];
        for (let j = 0; j < lado; j += 1) {
            for (let i = 0; i < lado; i += 1) {
                const a = j * lado + i;
                pos.set([(i / r - 0.5) * d.ancho, d.alturas[a], (j / r - 0.5) * d.ancho], a * 3);
                if (j < r && i < r) indices.push(a, a + lado, a + 1, a + 1, a + lado, a + lado + 1);
            }
        }
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
    }, [pieza]);
    return <mesh geometry={geo} receiveShadow={sombras} material={materialDe(params, "#2a2838")} />;
}

function LuzDe({ luz, sombras }: { luz: LuzMundo; sombras: boolean }) {
    if (luz.clase === "ambiente") return <ambientLight color={luz.color} intensity={luz.intensidad} />;
    if (luz.clase === "direccional") return <directionalLight position={luz.pos} color={luz.color} intensity={luz.intensidad} castShadow={sombras} />;
    if (luz.clase === "puntual") return <pointLight position={luz.pos} color={luz.color} intensity={luz.intensidad} distance={luz.alcance || undefined} />;
    return <spotLight position={luz.pos} color={luz.color} intensity={luz.intensidad} distance={luz.alcance || undefined} />;
}

function ObjetoMundo({ pieza, params, sombras }: { pieza: PiezaObjeto; params: ParamsMaterial; sombras: boolean }) {
    const mat = useMemo(() => materialDe(params, pieza.color), [params, pieza.color]);
    if (!pieza.visible) return null;
    const hueco = { position: pieza.pos, rotation: pieza.rot, scale: pieza.esc };
    const f = pieza.fuente;
    if (f.tipo === "biblioteca" && pieza.url) {
        return <group {...hueco}>{f.formato === "imagen" ? <PiezaImagen url={pieza.url} /> : <PiezaGlb url={pieza.url} />}</group>;
    }
    if (f.tipo === "primitiva") {
        return <group {...hueco}><mesh material={mat} castShadow={sombras}>{geometriaDe(f.forma)}</mesh></group>;
    }
    // Marcador honesto de lo que pinta otra tarea (splat: XR1010AM; avatar-vrm: XR1010Z).
    return <group {...hueco}><mesh><octahedronGeometry args={[0.12]} /><meshBasicMaterial color={pieza.color} wireframe /></mesh></group>;
}

export function MundoRender({ mundo, nivel, estado, recursos = {} }: PropsMundoRender) {
    const plan = useMemo(() => planDeEscena(mundo, nivel, estado, recursos), [mundo, nivel, estado, recursos]);
    const perfil = PERFILES[nivel];
    const params = useMemo(() => paramsMaterial(perfil.material, "horizon"), [perfil.material]);
    const sombras = perfil.sombras.activas;
    return (
        <group data-testid="mundo-render">
            <Suspense fallback={null}>
                {plan.piezas.map((pieza, i) => {
                    if (pieza.clase === "cielo") {
                        return pieza.malla
                            ? <Sky key={i} sunPosition={[40, 12, -60]} turbidity={12} />
                            : <color key={i} attach="background" args={[COLOR_CIELO[pieza.cielo] ?? "#0E101E"]} />;
                    }
                    if (pieza.clase === "terreno") return <MallaTerreno key={i} pieza={pieza} params={params} sombras={sombras} />;
                    if (pieza.clase === "objeto") return <ObjetoMundo key={i} pieza={pieza} params={params} sombras={sombras} />;
                    if (pieza.clase === "luz") return <LuzDe key={i} luz={pieza.luz} sombras={sombras} />;
                    return <object3D key={i} position={pieza.spawn.pos} rotation={[0, pieza.spawn.yaw, 0]} />;
                })}
            </Suspense>
            {plan.aviso && <Html position={[0, 0.3, -2]} center><p data-testid="aviso-simplificado" className="cursor-default rounded bg-[#0E101E]/70 px-3 py-1 text-xs text-[#F5F7FF]">{plan.aviso}</p></Html>}
        </group>
    );
}

export default MundoRender;
