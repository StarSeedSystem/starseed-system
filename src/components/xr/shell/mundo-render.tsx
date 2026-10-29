"use client";

/**
 * StarSeed XR · RENDER DEL MUNDO (XR1010Vs · contrato `architecture/starseed-xr.md` §3 g, fase 3).
 * Pinta un MundoSpec en la escena R3F: cúpula de cielo y niebla, terreno PROCEDURAL por semilla,
 * objetos primitivos reales, luces limitadas al nivel y marcadores de spawn. El plan y los recortes
 * salen de `mundo-render-plan.ts` (puro): un mundo inválido NO se pinta y sus objetos de Biblioteca
 * o de texto son marcadores honestos — el modelo real lo cargan las tareas de splats y VRM.
 * La física (Rapier) y las reglas viven en su tarea propia del enjambre.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type {} from "@react-three/fiber";
import type { LuzMundo, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { COLORES_NODO } from "@/lib/xr/tokens-3d";
import { COLOR_AGUA, COLOR_MARCADOR, alturaTerreno, planificarMundo, type MundoPlano } from "./mundo-render-plan";

export interface PropsMundoRender { mundo?: unknown; nivel?: NivelCalidad }

/** Cúpula y fondo; en AR passthrough (`sinFondo`) no se pinta NADA del cielo: el fondo es tu cuarto. */
export function CieloDe({ plan }: { plan: MundoPlano }) {
    if (plan.cielo.sinFondo) return null;
    return (
        <group>
            <color attach="background" args={[plan.cielo.abajo]} />
            <fog attach="fog" args={[plan.cielo.abajo, plan.mundo.entorno.tamano * 1.1, plan.radioCielo]} />
            <mesh renderOrder={-1}>
                <sphereGeometry args={[plan.radioCielo, 24, 12]} />
                <meshBasicMaterial color={plan.cielo.arriba} side={THREE.BackSide} depthWrite={false} />
            </mesh>
        </group>
    );
}

/** Suelo plano o procedural (colinas/islas/agua) con la altura determinista del plan; mar a y=0. */
export function TerrenoDe({ plan }: { plan: MundoPlano }) {
    const geometria = useMemo(() => {
        const t = plan.terreno;
        if (!t) return null;
        const g = new THREE.PlaneGeometry(t.tamano, t.tamano, t.segmentos, t.segmentos);
        g.rotateX(-Math.PI / 2);
        const puntos = g.attributes.position;
        for (let i = 0; i < puntos.count; i++) puntos.setY(i, alturaTerreno(plan.mundo.entorno, puntos.getX(i), puntos.getZ(i)));
        g.computeVertexNormals();
        return g;
    }, [plan]);
    if (!geometria || !plan.terreno) return null;
    return (
        <group>
            <mesh geometry={geometria} receiveShadow={plan.sombras.activas}>
                <meshStandardMaterial color={plan.mundo.entorno.colorSuelo} roughness={0.85} />
            </mesh>
            {plan.mar && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[plan.terreno.tamano, plan.terreno.tamano]} />
                    <meshStandardMaterial color={COLOR_AGUA} transparent opacity={0.7} roughness={0.2} />
                </mesh>
            )}
        </group>
    );
}

/** Moldes de las primitivas del vocabulario cerrado (unitarias: la `esc` del objeto las escala). */
function GeometriaMolde({ forma }: { forma: string }) {
    switch (forma) {
        case "esfera": return <sphereGeometry args={[0.5, 16, 12]} />;
        case "cilindro": return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />;
        case "cono": return <coneGeometry args={[0.5, 1, 16]} />;
        case "toro": return <torusGeometry args={[0.4, 0.16, 12, 24]} />;
        case "plano": return <planeGeometry args={[1, 1]} />;
        case "capsula": return <capsuleGeometry args={[0.35, 0.3, 4, 10]} />;
        default: return <boxGeometry args={[1, 1, 1]} />;
    }
}

/**
 * Un objeto del mundo: la primitiva REAL con su color; lo que aún no se puede cargar (Biblioteca
 * o texto) es un marcador honesto del tamaño del objeto, no el modelo fingido (§0.4).
 */
export function ObjetoDe({ o, sombras }: { o: ObjetoMundo; sombras: boolean }) {
    if (o.fuente.tipo !== "primitiva") {
        const r = Math.max(0.12, Math.min(o.esc[0], o.esc[1], o.esc[2]) * 0.3);
        return (
            <mesh position={o.pos} rotation={o.rot}>
                <sphereGeometry args={[r, 8, 6]} />
                <meshBasicMaterial color={COLOR_MARCADOR} transparent opacity={0.55} />
            </mesh>
        );
    }
    return (
        <mesh position={o.pos} rotation={o.rot} scale={o.esc} castShadow={sombras}>
            <GeometriaMolde forma={o.fuente.forma} />
            <meshStandardMaterial color={o.color} roughness={0.6} />
        </mesh>
    );
}

/** Luz limitada al nivel: ambiente, direccional (con sombras si el perfil las activa), puntual y foco. */
export function LuzDe({ l, sombras }: { l: LuzMundo; sombras: boolean }) {
    const alcance = l.alcance > 0 ? l.alcance : undefined;
    switch (l.clase) {
        case "ambiente": return <ambientLight intensity={l.intensidad} color={l.color} />;
        case "direccional": return <directionalLight position={l.pos} intensity={l.intensidad} color={l.color} castShadow={sombras} />;
        case "foco": return <spotLight position={l.pos} intensity={l.intensidad} color={l.color} distance={alcance} angle={0.6} />;
        default: return <pointLight position={l.pos} intensity={l.intensidad} color={l.color} distance={alcance} />;
    }
}

/** Dónde aparece cada persona: anillo del color Anchor al nivel del suelo local (determinista). */
export function SpawnsDe({ plan }: { plan: MundoPlano }) {
    return (
        <group>
            {plan.spawns.map((s) => (
                <mesh
                    key={s.id}
                    position={[s.pos[0], alturaTerreno(plan.mundo.entorno, s.pos[0], s.pos[2]) + 0.03, s.pos[2]]}
                    rotation={[-Math.PI / 2, 0, 0]}
                >
                    <ringGeometry args={[0.3, 0.42, 24]} />
                    <meshBasicMaterial color={COLORES_NODO.anchor.vivo} transparent opacity={0.9} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
}

/** Render del MundoSpec para la escena del OS; lo monta su tarea de integración en `escena-os.tsx`. */
export function MundoRender({ mundo = null, nivel = "media" }: PropsMundoRender) {
    const { plan } = useMemo(() => planificarMundo(mundo, nivel), [mundo, nivel]);
    if (!plan) return null;
    return (
        <group>
            <CieloDe plan={plan} />
            <TerrenoDe plan={plan} />
            {plan.objetos.map((o) => <ObjetoDe key={o.id} o={o} sombras={plan.sombras.activas} />)}
            {plan.luces.map((l) => <LuzDe key={l.id} l={l} sombras={plan.sombras.activas} />)}
            <SpawnsDe plan={plan} />
        </group>
    );
}

export default MundoRender;
