"use client";

/**
 * Lienzo 3D de la escena compartida (L5 · 2026-09-28). Pesado (three + R3F + drei): se carga
 * SIEMPRE con `next/dynamic` y `ssr:false` desde `escena-compartida.tsx`.
 *
 * Contiene: ambiente (cielo, luces, suelo), objetos, gizmo de transformación, avatares de los
 * demás, emisión de mi pose (la de la cámara), y el puente WebXR (VR/AR + agarre con mandos).
 * En modo eco: sin sombras ni antialias, menos píxeles, menos estrellas y menos segmentos.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, Sky, Stars, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { objetosVivos, PRESETS_CIELO, type DocEscena, type Vec3 } from "@/lib/vivo/espacial/modelo";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";
import type { SesionEscena } from "@/lib/vivo/espacial/sesion";
import { Objeto3D } from "./objeto-3d";
import { AvatarRemoto } from "./avatar-remoto";
import { AgarreXR, transformacionDe, type TransformacionXR } from "./agarre-xr";
import { useSesionXR, type EstadoXR } from "./use-sesion-xr";

export type ModoGizmo = "translate" | "rotate" | "scale";

export interface CamaraCompartida {
    pos: Vec3;
    dir: Vec3;
}

export interface PropsLienzoEscena {
    sesion: SesionEscena;
    doc: DocEscena;
    otros: MetaAvatar[];
    seleccion: string | null;
    onSeleccionar: (id: string | null) => void;
    modoGizmo: ModoGizmo;
    puedeEditar: boolean;
    eco: boolean;
    reducido: boolean;
    camaraRef: React.MutableRefObject<CamaraCompartida | null>;
    raizOverlay: HTMLElement | null;
    onXR: (e: EstadoXR) => void;
    onErrorObjeto: (id: string, mensaje: string) => void;
}

const CAMARA_INICIAL: Vec3 = [4.5, 3.2, 6.5];

/** Punto al que mira la órbita (constante: un array nuevo por render reiniciaría el encuadre). */
const OBJETIVO_ORBITA: Vec3 = [0, 1, 0];

/** Desplazamiento del mundo al entrar en XR: la escena aparece delante de ti, no a tus pies. */
const DESFASE_XR: Record<"immersive-vr" | "immersive-ar", Vec3> = {
    "immersive-vr": [0, 0, -3],
    "immersive-ar": [0, 0, -2],
};

function Ambiente({ doc, eco, enAR }: { doc: DocEscena; eco: boolean; enAR: boolean }) {
    const preset = PRESETS_CIELO[doc.ambiente.cielo];
    const { scene } = useThree();
    useEffect(() => {
        if (enAR) {
            scene.background = null;
            scene.fog = null;
            return;
        }
        scene.background = preset.cieloFisico ? null : new THREE.Color(preset.fondo);
        scene.fog = new THREE.Fog(preset.fondo, 25, eco ? 70 : 110);
    }, [scene, preset, eco, enAR]);
    return (
        <>
            <hemisphereLight args={[preset.hemi.cielo, preset.hemi.suelo, preset.hemi.intensidad]} />
            <directionalLight
                position={preset.sol.pos}
                color={preset.sol.color}
                intensity={preset.sol.intensidad}
                castShadow={!eco && !enAR}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
            />
            {!enAR && preset.cieloFisico && <Sky sunPosition={preset.cieloFisico} distance={450000} turbidity={6} rayleigh={1.4} />}
            {!enAR && preset.estrellas && <Stars radius={90} depth={40} count={eco ? 700 : 2600} factor={3.2} fade speed={eco ? 0 : 0.6} />}
        </>
    );
}

function Suelo({ doc, eco }: { doc: DocEscena; eco: boolean }) {
    const preset = PRESETS_CIELO[doc.ambiente.cielo];
    return (
        <group>
            {/* Disco opaco: da horizonte (nada de estrellas bajo los pies) y recibe las sombras. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow={!eco}>
                <circleGeometry args={[200, eco ? 32 : 64]} />
                <meshStandardMaterial color={preset.suelo} roughness={1} metalness={0} />
            </mesh>
            {doc.ambiente.suelo && (
                <Grid
                    infiniteGrid
                    cellSize={eco ? 1 : 0.5}
                    sectionSize={eco ? 5 : 2.5}
                    cellThickness={0.6}
                    sectionThickness={1.1}
                    cellColor="#3a3f63"
                    sectionColor={preset.rejilla}
                    fadeDistance={eco ? 30 : 45}
                    fadeStrength={1.4}
                />
            )}
        </group>
    );
}

/** Emite mi pose (la cámara, en coordenadas de la escena) y deja a mano dónde miro. */
function EmisorPose({ sesion, camaraRef, mundo }: { sesion: SesionEscena; camaraRef: React.MutableRefObject<CamaraCompartida | null>; mundo: React.RefObject<THREE.Group | null> }) {
    const pos = useRef(new THREE.Vector3());
    const quat = useRef(new THREE.Quaternion());
    const dir = useRef(new THREE.Vector3());
    useFrame(({ camera }) => {
        camera.getWorldPosition(pos.current);
        camera.getWorldQuaternion(quat.current);
        camera.getWorldDirection(dir.current);
        const m = mundo.current;
        if (m) pos.current.sub(m.position); // el mundo solo se desplaza (no gira) en XR
        const p: Vec3 = [pos.current.x, pos.current.y, pos.current.z];
        camaraRef.current = { pos: p, dir: [dir.current.x, dir.current.y, dir.current.z] };
        sesion.emitirPose({ p, q: [quat.current.x, quat.current.y, quat.current.z, quat.current.w] });
    });
    return null;
}

function PuenteXR({ raizOverlay, onXR }: { raizOverlay: HTMLElement | null; onXR: (e: EstadoXR) => void }) {
    const gl = useThree((s) => s.gl);
    const xr = useSesionXR(gl, raizOverlay);
    useEffect(() => {
        onXR(xr);
    }, [onXR, xr]);
    return null;
}

function Contenido(p: PropsLienzoEscena & { xrModo: "immersive-vr" | "immersive-ar" | null; gizmoHasta: React.MutableRefObject<number> }) {
    const { sesion, doc, otros, seleccion, puedeEditar, eco, reducido, xrModo } = p;
    const mundo = useRef<THREE.Group>(null);
    const registro = useRef(new Map<string, THREE.Object3D>());
    const arrastrandoLocal = useRef(new Set<string>());
    const [versionRegistro, setVersionRegistro] = useState(0);
    const vivos = useMemo(() => objetosVivos(doc), [doc]);
    const enXR = xrModo !== null;

    const registrar = useCallback((id: string, o: THREE.Object3D | null) => {
        if (o) registro.current.set(id, o);
        else registro.current.delete(id);
        setVersionRegistro((v) => v + 1);
    }, []);

    const camara = useThree((s) => s.camera);
    const antesEnXR = useRef(false);
    useEffect(() => {
        const m = mundo.current;
        if (!m) return;
        const d = xrModo ? DESFASE_XR[xrModo] : ([0, 0, 0] as Vec3);
        m.position.set(d[0], d[1], d[2]);
        // Al salir de VR/AR la cámara vuelve a su encuadre de siempre (el visor la dejó en tu cabeza).
        if (!xrModo && antesEnXR.current) {
            camara.position.set(CAMARA_INICIAL[0], CAMARA_INICIAL[1], CAMARA_INICIAL[2]);
            camara.lookAt(OBJETIVO_ORBITA[0], OBJETIVO_ORBITA[1], OBJETIVO_ORBITA[2]);
        }
        antesEnXR.current = xrModo !== null;
    }, [xrModo, camara]);

    const onSeleccionar = p.onSeleccionar;
    const onErrorObjeto = p.onErrorObjeto;
    const seleccionado = seleccion ? doc.objetos[seleccion] : undefined;
    const objetivo = seleccion ? registro.current.get(seleccion) ?? null : null;
    void versionRegistro; // re-render al registrar: el gizmo necesita el objeto ya montado
    const puedeGizmo = puedeEditar && !!seleccionado && !seleccionado.borrado && !seleccionado.bloqueado && !!objetivo && !enXR;

    const commit = useCallback(
        (id: string, t: TransformacionXR) => {
            arrastrandoLocal.current.delete(id);
            sesion.actualizar(id, { pos: t.pos, rot: t.rot, esc: t.esc });
        },
        [sesion],
    );

    return (
        <>
            <Ambiente doc={doc} eco={eco} enAR={xrModo === "immersive-ar"} />
            <group ref={mundo}>
                {xrModo !== "immersive-ar" && <Suelo doc={doc} eco={eco} />}
                {vivos.map((o) => (
                    <Objeto3D
                        key={o.id}
                        obj={o}
                        seleccionado={o.id === seleccion && !enXR}
                        eco={eco}
                        reducido={reducido}
                        interactivo={!enXR}
                        arrastres={sesion.arrastres}
                        arrastrandoLocal={arrastrandoLocal.current}
                        registrar={registrar}
                        onSeleccionar={onSeleccionar}
                        onError={onErrorObjeto}
                    />
                ))}
                {otros.map((a) => (
                    <AvatarRemoto key={a.clave} meta={a} poses={sesion.poses} reducido={reducido} eco={eco} />
                ))}
            </group>
            {puedeGizmo && objetivo && seleccion && (
                <TransformControls
                    object={objetivo}
                    mode={p.modoGizmo}
                    size={0.9}
                    onMouseDown={() => {
                        p.gizmoHasta.current = Date.now() + 400;
                        arrastrandoLocal.current.add(seleccion);
                    }}
                    onObjectChange={() => sesion.previsualizar(seleccion, transformacionDe(objetivo))}
                    onMouseUp={() => {
                        // El clic que suelta el gizmo no debe deseleccionar el objeto.
                        p.gizmoHasta.current = Date.now() + 400;
                        commit(seleccion, transformacionDe(objetivo));
                    }}
                />
            )}
            {!enXR && (
                <OrbitControls
                    makeDefault
                    target={OBJETIVO_ORBITA}
                    enableDamping={!reducido}
                    maxDistance={60}
                    minDistance={0.6}
                    maxPolarAngle={Math.PI * 0.495}
                />
            )}
            <EmisorPose sesion={sesion} camaraRef={p.camaraRef} mundo={mundo} />
            <PuenteXR raizOverlay={p.raizOverlay} onXR={p.onXR} />
            {enXR && (
                <AgarreXR
                    registro={registro}
                    puedeAgarrar={(id) => puedeEditar && !doc.objetos[id]?.bloqueado}
                    onInicio={(id) => arrastrandoLocal.current.add(id)}
                    onMover={(id, t) => sesion.previsualizar(id, t)}
                    onFin={commit}
                />
            )}
        </>
    );
}

export default function LienzoEscena(p: PropsLienzoEscena) {
    const [xrModo, setXrModo] = useState<"immersive-vr" | "immersive-ar" | null>(null);
    const gizmoHasta = useRef(0);
    const onXR = p.onXR;
    const alXR = useCallback(
        (e: EstadoXR) => {
            setXrModo(e.activa ? e.modo : null);
            onXR(e);
        },
        [onXR],
    );
    return (
        <Canvas
            className="!absolute inset-0"
            shadows={!p.eco}
            dpr={p.eco ? [1, 1.25] : [1, 2]}
            camera={{ position: CAMARA_INICIAL, fov: 55, near: 0.05, far: 500 }}
            gl={{ antialias: !p.eco, alpha: true, powerPreference: p.eco ? "low-power" : "high-performance" }}
            onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
            }}
            onPointerMissed={() => {
                if (Date.now() > gizmoHasta.current) p.onSeleccionar(null);
            }}
            aria-label="Escena 3D compartida"
        >
            <Suspense fallback={null}>
                <Contenido {...p} onXR={alXR} xrModo={xrModo} gizmoHasta={gizmoHasta} />
            </Suspense>
        </Canvas>
    );
}
