"use client";

/**
 * StarSeed XR · RENDER DEL MUNDOSPEC (XR1010V · contrato §3 g). Pinta un mundo declarativo con
 * three/R3F: cielo (presets de `vivo/espacial`), terreno procedural por semilla, objetos, luces y
 * puntos de aparición. Todo lo caro (segmentos, estrellas, sombras, luces, objetos) lo recorta el
 * nivel de calidad; el mundo original no se toca (`adaptarANivel`). La lógica pura vive aparte.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Sky, Stars } from "@react-three/drei";
import type { NivelCalidad } from "@/lib/xr/tipos";
import type { LuzMundo, MundoSpec, ObjetoMundo, SpawnMundo } from "@/lib/xr/mundo-tipos";
import { COLORES_NODO } from "@/lib/xr/tokens-3d";
import {
    argsPrimitiva, cieloDeMundo, colorAgua, distanciaNiebla, estrellasDeNivel, generarTerreno,
    lucesVisibles, mundoParaNivel, segmentosObjeto, segmentosTerreno, sombraDeNivel,
    type FormaPrimitiva,
} from "./mundo-render-logica";

export interface PropsMundoRender {
    mundo: MundoSpec;
    nivel: NivelCalidad;
    /** En AR el cielo es tu habitación: ni fondo, ni estrellas, ni cielo físico. */
    enAR?: boolean;
    /** Marcadores de los puntos donde aparece cada persona. */
    mostrarSpawns?: boolean;
    /** `prefers-reduced-motion`: las estrellas no giran. */
    movimientoReducido?: boolean;
}

export function Cielo({ mundo, nivel, enAR, movimientoReducido }: { mundo: MundoSpec; nivel: NivelCalidad; enAR: boolean; movimientoReducido: boolean }) {
    const preset = cieloDeMundo(mundo.entorno.cielo);
    if (preset === null) return <ambientLight intensity={0.6} />;
    const estrellas = estrellasDeNivel(nivel, preset.estrellas);
    return (
        <>
            {!enAR && <color attach="background" args={[preset.fondo]} />}
            {!enAR && <fog attach="fog" args={[preset.fondo, 25, distanciaNiebla(nivel)]} />}
            <hemisphereLight args={[preset.hemi.cielo, preset.hemi.suelo, preset.hemi.intensidad]} />
            <directionalLight position={preset.sol.pos} color={preset.sol.color} intensity={preset.sol.intensidad} />
            {!enAR && preset.cieloFisico && <Sky sunPosition={preset.cieloFisico} distance={450000} turbidity={6} rayleigh={1.4} />}
            {!enAR && estrellas > 0 && <Stars radius={90} depth={40} count={estrellas} factor={3.2} fade speed={movimientoReducido ? 0 : 0.4} />}
        </>
    );
}

export function Terreno({ mundo, nivel }: { mundo: MundoSpec; nivel: NivelCalidad }) {
    const e = mundo.entorno;
    const geometria = useMemo(() => {
        const malla = generarTerreno({ terreno: e.terreno, semilla: e.semilla, tamano: e.tamano, alturaMax: e.alturaMax, segmentos: segmentosTerreno(nivel) });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(malla.posiciones, 3));
        g.setIndex(malla.indices);
        g.computeVertexNormals();
        return g;
    }, [e.terreno, e.semilla, e.tamano, e.alturaMax, nivel]);
    if (e.terreno === "vacio") return null;
    const barato = nivel === "minima";
    return (
        <group>
            <mesh geometry={geometria} receiveShadow={!barato}>
                {barato ? <meshBasicMaterial color={e.colorSuelo} /> : <meshStandardMaterial color={e.colorSuelo} roughness={1} metalness={0} />}
            </mesh>
            {e.terreno === "agua" && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <planeGeometry args={[e.tamano, e.tamano]} />
                    <meshStandardMaterial color={colorAgua(e.cielo)} transparent opacity={0.72} roughness={0.12} metalness={0.2} />
                </mesh>
            )}
        </group>
    );
}

export function Luz({ luz, sombras, resolucion }: { luz: LuzMundo; sombras: boolean; resolucion: number }) {
    const conSombra = sombras && (luz.clase === "direccional" || luz.clase === "foco");
    const mapa = conSombra ? resolucion : undefined;
    switch (luz.clase) {
        case "ambiente": return <ambientLight color={luz.color} intensity={luz.intensidad} />;
        case "direccional": return <directionalLight position={luz.pos} color={luz.color} intensity={luz.intensidad} castShadow={conSombra} shadow-mapSize-width={mapa} shadow-mapSize-height={mapa} />;
        case "puntual": return <pointLight position={luz.pos} color={luz.color} intensity={luz.intensidad} distance={luz.alcance || undefined} decay={2} />;
        case "foco": return <spotLight position={luz.pos} color={luz.color} intensity={luz.intensidad} distance={luz.alcance || undefined} angle={Math.PI / 5} penumbra={0.4} castShadow={conSombra} shadow-mapSize-width={mapa} shadow-mapSize-height={mapa} />;
    }
}

export function Primitiva({ forma, nivel }: { forma: FormaPrimitiva; nivel: NivelCalidad }) {
    const g = argsPrimitiva(forma, segmentosObjeto(nivel));
    switch (g.tipo) {
        case "box": return <boxGeometry args={g.args} />;
        case "sphere": return <sphereGeometry args={g.args} />;
        case "cylinder": return <cylinderGeometry args={g.args} />;
        case "cone": return <coneGeometry args={g.args} />;
        case "torus": return <torusGeometry args={g.args} />;
        case "plane": return <planeGeometry args={g.args} />;
        case "capsule": return <capsuleGeometry args={g.args} />;
    }
}

export function Objeto({ objeto, nivel, sombras }: { objeto: ObjetoMundo; nivel: NivelCalidad; sombras: boolean }) {
    const barato = nivel === "minima";
    const comun = { position: objeto.pos, rotation: objeto.rot, scale: objeto.esc, castShadow: sombras, receiveShadow: sombras };
    if (objeto.fuente.tipo === "primitiva") {
        return (
            <mesh {...comun}>
                <Primitiva forma={objeto.fuente.forma} nivel={nivel} />
                {barato ? <meshBasicMaterial color={objeto.color} /> : <meshStandardMaterial color={objeto.color} roughness={0.55} metalness={0.12} />}
            </mesh>
        );
    }
    if (objeto.fuente.tipo === "texto") {
        return (
            <mesh {...comun}>
                <planeGeometry args={[1, 0.5]} />
                <meshBasicMaterial color={objeto.color} transparent opacity={0.85} side={THREE.DoubleSide} />
            </mesh>
        );
    }
    return (
        <mesh {...comun} userData={{ fuente: "biblioteca", id: objeto.fuente.id, formato: objeto.fuente.formato }}>
            <icosahedronGeometry args={[0.5, barato ? 0 : 1]} />
            <meshStandardMaterial color={objeto.color} wireframe transparent opacity={0.7} />
        </mesh>
    );
}

export function MarcadorSpawn({ spawn }: { spawn: SpawnMundo }) {
    return (
        <group position={spawn.pos} rotation={[0, spawn.yaw, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.42, 0.52, 32]} />
                <meshBasicMaterial color={COLORES_NODO.horizon.vivo} transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

export function MundoRender({ mundo, nivel, enAR = false, mostrarSpawns = true, movimientoReducido = false }: PropsMundoRender) {
    return null;
}

export default MundoRender;
