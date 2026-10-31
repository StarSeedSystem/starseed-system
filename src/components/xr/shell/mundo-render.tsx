"use client";

/**
 * StarSeed XR · RENDER DEL MUNDO (XR1010V · contrato §3 g): pinta un `MundoSpec` validado —cielo,
 * terreno procedural, objetos, luces y marcas de spawn— recortado al nivel de calidad del aparato.
 * Toda la decisión es del módulo puro `mundo-render-puro.ts`; esto es el cascarón R3F. Los objetos
 * de la Biblioteca (glb/splat/imagen/audio/vrm), la física de Rapier y las reglas van en sus tareas
 * (XR1010AM, XR1010Z, XR1010X): aquí tocan un marcador honesto de «todavía no se carga», nunca una máscara.
 */
import { useMemo } from "react";
import { Html, Stars } from "@react-three/drei";
import { PlaneGeometry, DoubleSide } from "three";
import type { NivelCalidad } from "@/lib/xr/tipos";
import type { MundoSpec, ObjetoMundo, LuzMundo } from "@/lib/xr/mundo-tipos";
import { COLORES_NODO, CRISTAL } from "@/lib/xr/tokens-3d";
import { visualDe, PAISAJE, COLOR_ZONA, ARGS_PRIMITIVA, alturaTerreno, segmentosTerreno, materialObjeto, estrellasActivas, altoPantalla, type VisualMundo } from "./mundo-render-puro";
import { useFisica, type CanalPoses } from "./use-fisica";
import type { PoseCuerpo } from "./fisica-rapier";

type Props = { mundo: MundoSpec; nivel: NivelCalidad; esAnfitrion?: boolean; canal?: CanalPoses | null };

/** Geometría del suelo: cuadrícula del nivel, alturas de `alturaTerreno` (misma semilla en todos los equipos). */
function useGeometriaTerreno(mundo: MundoSpec, nivel: NivelCalidad) {
    const { terreno, semilla, tamano, alturaMax, colorSuelo } = mundo.entorno;
    return useMemo(() => {
        const seg = segmentosTerreno(nivel);
        const g = new PlaneGeometry(tamano, tamano, seg, seg);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i += 1) {
            const x = pos.getX(i), yPlano = pos.getY(i);
            pos.setZ(i, alturaTerreno(x, -yPlano, { terreno, semilla, tamano, alturaMax }));
        }
        g.rotateX(-Math.PI / 2);
        g.computeVertexNormals();
        return g;
    }, [nivel, terreno, semilla, tamano, alturaMax]); // colorSuelo se aplica en el material, no en la malla.
}

function Terreno({ mundo, nivel }: { mundo: MundoSpec; nivel: NivelCalidad }) {
    const { terreno, colorSuelo, tamano } = mundo.entorno;
    const geometria = useGeometriaTerreno(mundo, nivel);
    const material = materialObjeto(nivel);
    if (terreno === "vacio") return null;
    return (
        <group>
            {terreno === "agua" ? (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
                    <planeGeometry args={[tamano, tamano]} />
                    <meshStandardMaterial color={colorSuelo} transparent opacity={0.55} side={DoubleSide} />
                </mesh>
            ) : (
                <mesh geometry={geometria} receiveShadow={false}>
                    {material === "meshStandardMaterial"
                        ? <meshStandardMaterial color={colorSuelo} />
                        : <meshBasicMaterial color={colorSuelo} />}
                </mesh>
            )}
        </group>
    );
}

/** Cielo: color de fondo, niebla del mundo y estrellas del nivel (mínima no: cero partículas). */
function Cielo({ cielo }: { cielo: { conCielo: boolean; abajo: string; niebla: string; cerca: number; lejos: number; estrellas: boolean } }) {
    if (!cielo.conCielo) return null;
    return (
        <>
            <color attach="background" args={[cielo.abajo]} />
            <fog attach="fog" args={[cielo.niebla, cielo.cerca, cielo.lejos]} />
            {cielo.estrellas && <Stars radius={100} depth={30} count={2000} factor={2.2} fade speed={0.6} />}
        </>
    );
}

/** Un objeto del mundo: primitiva real; biblioteca/texto, marcador honesto (se carga en su tarea). */
function ObjetoVisual({ o, nivel, pose }: { o: ObjetoMundo; nivel: NivelCalidad; pose?: PoseCuerpo }) {
    const material = materialObjeto(nivel);
    const fuentePrimitiva = o.fuente.tipo === "primitiva" ? o.fuente : null;
    const esPrimitiva = fuentePrimitiva !== null;
    // La física manda solo sobre los dinámicos (XR1010W); fijos y cinemáticos conservan su sitio del spec.
    const movido = pose !== undefined && o.cuerpo?.tipo === "dinamico";
    return (
        <group position={movido ? pose.pos : o.pos} rotation={movido ? undefined : o.rot} quaternion={movido ? pose.rot : undefined} scale={o.esc}>
            <mesh name={`${o.id}`}>
                {fuentePrimitiva?.forma === "caja" && <boxGeometry args={ARGS_PRIMITIVA.caja} />}
                {fuentePrimitiva?.forma === "esfera" && <sphereGeometry args={ARGS_PRIMITIVA.esfera} />}
                {fuentePrimitiva?.forma === "cilindro" && <cylinderGeometry args={ARGS_PRIMITIVA.cilindro} />}
                {fuentePrimitiva?.forma === "cono" && <coneGeometry args={ARGS_PRIMITIVA.cono} />}
                {fuentePrimitiva?.forma === "toro" && <torusGeometry args={ARGS_PRIMITIVA.toro} />}
                {fuentePrimitiva?.forma === "plano" && <planeGeometry args={ARGS_PRIMITIVA.plano} />}
                {fuentePrimitiva?.forma === "capsula" && <capsuleGeometry args={ARGS_PRIMITIVA.capsula} />}
                {!esPrimitiva && <boxGeometry args={[0.4, 0.4, 0.4] as const} />}
                {material === "meshStandardMaterial"
                    ? <meshStandardMaterial color={o.color} transparent={!esPrimitiva} opacity={esPrimitiva ? 1 : 0.5} />
                    : <meshBasicMaterial color={o.color} />}
            </mesh>
        </group>
    );
}

/** Luces del mundo: ambiente, direccional, puntual y foco según el presupuesto del nivel. */
function LucesDe({ luces }: { luces: LuzMundo[] }) {
    return luces.map((l) =>
        l.clase === "ambiente" ? <ambientLight key={l.id} color={l.color} intensity={l.intensidad} />
        : l.clase === "direccional" ? <directionalLight key={l.id} color={l.color} intensity={l.intensidad} position={l.pos} />
        : l.clase === "puntual" ? <pointLight key={l.id} color={l.color} intensity={l.intensidad} distance={l.alcance} position={l.pos} />
        : <spotLight key={l.id} color={l.color} intensity={l.intensidad} distance={l.alcance} position={l.pos} />);
}

/** Marca de spawn: dónde aparecen las personas (pilón con orbe, acento zenith, transparente). */
function MarcasSpawn({ puntos }: { puntos: MundoSpec["spawns"] }) {
    return puntos.map((s) => (
        <group key={s.id} position={s.pos} rotation={[0, s.yaw, 0]}>
            <mesh position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.14, 0.18, 1.2, 12, 1, true]} />
                <meshBasicMaterial color={CRISTAL.fondoB.color} />
            </mesh>
            <mesh position={[0, 1.3, 0]}>
                <sphereGeometry args={[0.1, 12, 8]} />
                <meshBasicMaterial color={COLORES_NODO.zenith.base} transparent opacity={0.8} />
            </mesh>
        </group>
    ));
}

/** Portal: anillo en pie con disco translúcido (el destino lo elige el motor de reglas, no el render). */
function PortalesDe({ portales }: { portales: MundoSpec["portales"] }) {
    return portales.map((p) => (
        <group key={p.id} position={p.pos} rotation={p.rot}>
            <mesh rotation={[0, 0, 0]}>
                <torusGeometry args={[p.radio, 0.06, 12, 32]} />
                <meshBasicMaterial color={COLORES_NODO.horizon.vivo} />
            </mesh>
            <mesh position={[0, 0, 0]}>
                <circleGeometry args={[p.radio, 24]} />
                <meshBasicMaterial color={COLORES_NODO.horizon.base} transparent opacity={0.25} side={DoubleSide} />
            </mesh>
        </group>
    ));
}

/** Zonas: contorno guía en hilo con el color del efecto (no es un DataSet: no bloquea el paso). */
function ZonasDe({ zonas }: { zonas: MundoSpec["zonas"] }) {
    return zonas.map((z) => (
        <mesh key={z.id} position={z.pos}>
            {z.forma === "esfera" ? <sphereGeometry args={[Math.max(...z.tam) / 2, 12, 8]} /> : <boxGeometry args={z.tam} />}
            <meshBasicMaterial color={COLOR_ZONA[z.efecto]} wireframe transparent opacity={0.3} />
        </mesh>
    ));
}

/** Pantallas (vídeo/estación/llamada) y pizarras: paneles; el contenido lo da la tarea de pantallas. */
function Muebles({ visual }: { visual: VisualMundo }) {
    return visual.pantallas.visibles.map((p) => (
        <mesh key={p.id} position={p.pos} rotation={p.rot}>
            <planeGeometry args={[p.ancho, altoPantalla(p.ancho)]} />
            <meshBasicMaterial color={CRISTAL.fondoA.color} side={DoubleSide} />
        </mesh>
    )).concat(visual.pizarras.visibles.map((p) => (
        <mesh key={p.id} position={p.pos} rotation={p.rot}>
            <planeGeometry args={[p.ancho, p.alto]} />
            <meshBasicMaterial color={CRISTAL.texto} side={DoubleSide} />
        </mesh>
    )));
}

export default function MundoRender({ mundo, nivel, esAnfitrion = true, canal = null }: Props) {
    const visual = useMemo(() => visualDe(mundo, nivel), [mundo, nivel]);
    // XR1010W · §3 g: el anfitrión simula con Rapier y publica; los demás interpolan sus poses.
    const { poses, aviso } = useFisica({ mundo: visual.mundo, nivel, esAnfitrion, canal });
    const paisaje = PAISAJE[visual.mundo.entorno.cielo];
    const nieblaSegura = { cerca: visual.mundo.entorno.tamano * 0.35, lejos: visual.mundo.entorno.tamano * 0.95 };
    return (
        <group>
            <Cielo cielo={{
                conCielo: visual.mundo.entorno.cielo !== "ninguno", abajo: paisaje.abajo, niebla: paisaje.niebla,
                cerca: nieblaSegura.cerca, lejos: nieblaSegura.lejos,
                estrellas: estrellasActivas(nivel, visual.mundo.entorno.cielo),
            }} />
            {visual.luces.visibles.length > 0
                ? <LucesDe luces={visual.luces.visibles} />
                : <LucesDe luces={[{ id: "base", clase: "ambiente", pos: [0, 5, 0], color: "#F5F7FF", intensidad: 0.7, alcance: 0 }]} />}
            <Terreno mundo={visual.mundo} nivel={nivel} />
            {visual.mundo.objetos.map((o) => (o.oculto ? null : <ObjetoVisual key={o.id} o={o} nivel={nivel} pose={poses.get(o.id)} />))}
            {aviso !== null && (
                <Html center position={[0, 2.2, -2]} distanceFactor={8}>
                    <p role="alert" style={{ maxWidth: 280, padding: "6px 10px", borderRadius: 8, background: "#1E1E2E", color: "#F5F7FF", fontSize: 12, textAlign: "center" }}>{aviso}</p>
                </Html>
            )}
            <MarcasSpawn puntos={visual.spawns.visibles} />
            <PortalesDe portales={visual.portales.visibles} />
            <ZonasDe zonas={visual.zonas.visibles} />
            <Muebles visual={visual} />
        </group>
    );
}
