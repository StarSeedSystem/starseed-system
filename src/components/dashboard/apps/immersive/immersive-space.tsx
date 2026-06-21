'use client';

// ════════════════════════════════════════════════════════════════
// ImmersiveSpace — fundación VR/AR (WebXR) del StarSeed OS
// ----------------------------------------------------------------
// Escena React-Three-Fiber con estética "Solarpunk / geometría sagrada":
//   • Fondo estelar + nebuloso (Stars + Sparkles de drei, luces frías/cálidas).
//   • Flor de la Vida girando lento en el centro (geometría sagrada viva).
//   • Suelo sutilmente reflejante (MeshReflectorMaterial).
//   • Portales flotantes (paneles curvos + orbe + glow del acento) para las
//     apps `vrCapable` y clave del OS: Audiomorphic, Multiverso (Nexus),
//     Omnifrecuencias, Nexus. Al hacer clic se abren con el launcher nativo
//     (ruta interna, ventana del OS o pestaña — según el `open` de cada app).
//
// Entra en VR/AR cuando el dispositivo lo soporta (useWebXR sobre el renderer
// de R3F, sin @react-three/xr) y degrada con elegancia si no.
//
// SSR-safe: este módulo se carga vía next/dynamic (ssr:false) desde la ruta
// y el widget — NUNCA se importa directamente en un Server Component.
// Respeta prefers-reduced-motion (rotación casi estática).
// ════════════════════════════════════════════════════════════════

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Stars,
    Sparkles,
    Float,
    Html,
    RoundedBox,
    MeshReflectorMaterial,
} from '@react-three/drei';
import * as THREE from 'three';
import { Headset, ScanEye, LogOut, Sparkle, Loader2 } from 'lucide-react';
import { getApp } from '../app-catalog';
import type { StarseedApp } from '../launcher-types';
import { useAppLauncher } from '../app-launch';
import { useWebXR, type WebXRState, type XRMode } from './use-webxr';

// ── Catálogo de portales del espacio inmersivo ───────────────────────
// Apps clave del OS + las marcadas vrCapable. "Multiverso" aún no es una app
// del catálogo, así que la mapeamos a Nexus (portal del ecosistema) con su
// propia etiqueta inmersiva.
const PORTAL_APP_IDS = ['audiomorphic', 'omnifrecuencias', 'nexus', 'cafe'] as const;

interface PortalDef {
    app: StarseedApp;
    label: string;
    accent: string;
}

function buildPortals(): PortalDef[] {
    const seen = new Set<string>();
    const defs: PortalDef[] = [];
    for (const id of PORTAL_APP_IDS) {
        const app = getApp(id);
        if (!app || seen.has(app.id)) continue;
        seen.add(app.id);
        defs.push({ app, label: app.short ?? app.name, accent: app.accent });
    }
    return defs;
}

// ── Hook: prefers-reduced-motion (cliente) ───────────────────────────
function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const apply = () => setReduced(mq.matches);
        apply();
        mq.addEventListener?.('change', apply);
        return () => mq.removeEventListener?.('change', apply);
    }, []);
    return reduced;
}

// ════════════════════════════════════════════════════════════════
// Geometría sagrada — Flor de la Vida (anillos en patrón hexagonal)
// ════════════════════════════════════════════════════════════════
function FlowerOfLife({ reduced }: { reduced: boolean }) {
    const group = useRef<THREE.Group>(null);

    // Construimos los anillos como objetos THREE.Line dentro de un Group y los
    // montamos con <primitive>. Así evitamos la ambigüedad JSX de <line> (que TS
    // resuelve como elemento SVG) y reutilizamos una sola geometría circular.
    const ringsGroup = useMemo(() => {
        const r = 1; // radio de cada círculo = paso de la malla hexagonal

        // Centros de los 19 círculos (centro + 2 anillos hexagonales).
        const pts: [number, number][] = [[0, 0]];
        const ringSteps = (ring: number) => {
            const out: [number, number][] = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                out.push([Math.cos(a) * r * ring, Math.sin(a) * r * ring]);
                if (ring === 2) {
                    const a2 = a + Math.PI / 6;
                    out.push([Math.cos(a2) * r * Math.sqrt(3), Math.sin(a2) * r * Math.sqrt(3)]);
                }
            }
            return out;
        };
        pts.push(...ringSteps(1), ...ringSteps(2));
        const uniq = new Map<string, [number, number]>();
        for (const [x, y] of pts) uniq.set(`${x.toFixed(2)},${y.toFixed(2)}`, [x, y]);
        const centers = Array.from(uniq.values());

        // Geometría circular compartida (línea cerrada).
        const segs = 64;
        const arr = new Float32Array((segs + 1) * 3);
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            arr[i * 3] = Math.cos(a);
            arr[i * 3 + 1] = Math.sin(a);
            arr[i * 3 + 2] = 0;
        }
        const circleGeom = new THREE.BufferGeometry();
        circleGeom.setAttribute('position', new THREE.BufferAttribute(arr, 3));

        const mat = new THREE.LineBasicMaterial({
            color: new THREE.Color('#7CF6C8'),
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const g = new THREE.Group();
        for (const [x, y] of centers) {
            const ln = new THREE.Line(circleGeom, mat);
            ln.position.set(x, y, 0);
            g.add(ln);
        }
        return g;
    }, []);

    useFrame((_, delta) => {
        if (!group.current) return;
        const speed = reduced ? 0.01 : 0.06;
        group.current.rotation.z += delta * speed;
    });

    // Liberar geometría/material compartidos al desmontar.
    useEffect(() => {
        return () => {
            ringsGroup.traverse((o) => {
                if (o instanceof THREE.Line) {
                    o.geometry.dispose();
                    const m = o.material;
                    if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
                    else m.dispose();
                }
            });
        };
    }, [ringsGroup]);

    return (
        <group ref={group} position={[0, 1.6, -3.2]} rotation={[0.15, 0, 0]}>
            <primitive object={ringsGroup} />
            {/* núcleo luminoso */}
            <mesh>
                <icosahedronGeometry args={[0.32, 1]} />
                <meshStandardMaterial
                    color="#A855F7"
                    emissive="#A855F7"
                    emissiveIntensity={1.4}
                    roughness={0.2}
                    metalness={0.4}
                />
            </mesh>
        </group>
    );
}

// ════════════════════════════════════════════════════════════════
// Portal flotante de una app
// ════════════════════════════════════════════════════════════════
function AppPortal({
    def,
    position,
    rotationY,
    reduced,
    onOpen,
}: {
    def: PortalDef;
    position: [number, number, number];
    rotationY: number;
    reduced: boolean;
    onOpen: (app: StarseedApp) => void;
}) {
    const orb = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);
    const accent = def.accent;

    useFrame((state) => {
        if (!orb.current || reduced) return;
        const t = state.clock.elapsedTime;
        orb.current.rotation.y = t * 0.4;
        orb.current.rotation.x = Math.sin(t * 0.6) * 0.2;
    });

    return (
        <Float
            speed={reduced ? 0 : 1.2}
            rotationIntensity={reduced ? 0 : 0.2}
            floatIntensity={reduced ? 0 : 0.5}
            position={position}
        >
            <group
                rotation={[0, rotationY, 0]}
                onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(true);
                    if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                    e.stopPropagation();
                    setHovered(false);
                    if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onOpen(def.app);
                }}
            >
                {/* Panel curvo (aproximado con caja redondeada muy fina) */}
                <RoundedBox args={[1.5, 2.1, 0.08]} radius={0.16} smoothness={4} castShadow>
                    <meshPhysicalMaterial
                        color="#0b0e1a"
                        emissive={accent}
                        emissiveIntensity={hovered ? 0.5 : 0.22}
                        metalness={0.6}
                        roughness={0.25}
                        transmission={0.25}
                        thickness={0.5}
                        transparent
                        opacity={0.9}
                    />
                </RoundedBox>

                {/* Marco glow del acento */}
                <mesh position={[0, 0, 0.05]}>
                    <ringGeometry args={[0.95, 1.02, 48]} />
                    <meshBasicMaterial
                        color={accent}
                        transparent
                        opacity={hovered ? 0.9 : 0.55}
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>

                {/* Orbe del portal */}
                <mesh ref={orb} position={[0, 0.25, 0.22]} scale={hovered ? 1.12 : 1}>
                    <icosahedronGeometry args={[0.42, 1]} />
                    <meshPhysicalMaterial
                        color={accent}
                        emissive={accent}
                        emissiveIntensity={hovered ? 1.3 : 0.8}
                        metalness={0.5}
                        roughness={0.15}
                        clearcoat={0.6}
                    />
                </mesh>

                {/* Luz puntual del acento (vida propia del portal) */}
                <pointLight position={[0, 0.25, 0.6]} color={accent} intensity={hovered ? 2.2 : 1.1} distance={4} />

                {/* Etiqueta (DOM via drei Html — sin assets remotos) */}
                <Html position={[0, -0.78, 0.12]} center distanceFactor={6} zIndexRange={[10, 0]} pointerEvents="none">
                    <div
                        style={{
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: 13,
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                            textShadow: `0 0 14px ${accent}, 0 1px 2px rgba(0,0,0,0.8)`,
                            padding: '2px 10px',
                            borderRadius: 999,
                            background: `color-mix(in srgb, ${accent} 18%, rgba(6,8,16,0.7))`,
                            border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`,
                            userSelect: 'none',
                        }}
                    >
                        {def.label}
                    </div>
                </Html>
            </group>
        </Float>
    );
}

// ════════════════════════════════════════════════════════════════
// Suelo reflejante sutil (procomún visual del espacio)
// ════════════════════════════════════════════════════════════════
function ReflectiveFloor() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <MeshReflectorMaterial
                blur={[300, 80]}
                resolution={1024}
                mixBlur={1}
                mixStrength={28}
                roughness={0.85}
                depthScale={1.1}
                minDepthThreshold={0.4}
                maxDepthThreshold={1.4}
                color="#070a14"
                metalness={0.6}
                mirror={0.45}
            />
        </mesh>
    );
}

// ════════════════════════════════════════════════════════════════
// Anillo de portales — distribución radial mirando al centro
// ════════════════════════════════════════════════════════════════
function PortalRing({
    portals,
    reduced,
    onOpen,
}: {
    portals: PortalDef[];
    reduced: boolean;
    onOpen: (app: StarseedApp) => void;
}) {
    const radius = 4.2;
    const count = portals.length;
    return (
        <>
            {portals.map((def, i) => {
                // Arco frontal (de -60° a +60° aprox.) para que todos sean visibles
                // desde la cámara inicial, en lugar de un círculo completo.
                const spread = Math.PI * 0.9;
                const a = count > 1 ? -spread / 2 + (spread * i) / (count - 1) : 0;
                const x = Math.sin(a) * radius;
                const z = -Math.cos(a) * radius;
                return (
                    <AppPortal
                        key={def.app.id}
                        def={def}
                        position={[x, 0.4, z]}
                        rotationY={-a}
                        reduced={reduced}
                        onOpen={onOpen}
                    />
                );
            })}
        </>
    );
}

// ════════════════════════════════════════════════════════════════
// XRBridge — vive DENTRO del Canvas: capta el renderer (gl) de R3F y
// eleva el estado de useWebXR al componente padre vía callback.
// ════════════════════════════════════════════════════════════════
function XRBridge({ onState }: { onState: (s: WebXRState) => void }) {
    const gl = useThree((s) => s.gl);
    const xr = useWebXR(gl);
    // Re-emitimos cuando cambia cualquier parte relevante del estado.
    useEffect(() => {
        onState(xr);
    }, [onState, xr, xr.vrSupported, xr.arSupported, xr.inSession, xr.mode, xr.error]);
    return null;
}

// ════════════════════════════════════════════════════════════════
// Escena completa
// ════════════════════════════════════════════════════════════════
function Scene({
    portals,
    reduced,
    onOpen,
    onXRState,
}: {
    portals: PortalDef[];
    reduced: boolean;
    onOpen: (app: StarseedApp) => void;
    onXRState: (s: WebXRState) => void;
}) {
    return (
        <>
            {/* Niebla nebulosa para profundidad atmosférica */}
            <fog attach="fog" args={['#05060f', 8, 26]} />
            <color attach="background" args={['#05060f']} />

            {/* Luces: ambiente frío + cálido solarpunk + relleno violeta */}
            <ambientLight intensity={0.5} color="#9db8ff" />
            <hemisphereLight intensity={0.6} color="#bff5d8" groundColor="#10131f" />
            <directionalLight position={[6, 8, 4]} intensity={1.1} color="#ffe9b0" castShadow />
            <pointLight position={[-6, 3, -4]} intensity={0.8} color="#a855f7" distance={28} />
            <pointLight position={[0, 2, 4]} intensity={0.6} color="#22d3ee" distance={20} />

            {/* Cielo estelar + polvo de estrellas */}
            <Stars radius={80} depth={50} count={4000} factor={4} saturation={0} fade speed={reduced ? 0 : 0.6} />
            <Sparkles count={60} scale={[14, 8, 14]} size={3} speed={reduced ? 0 : 0.3} color="#7CF6C8" opacity={0.6} />

            {/* Geometría sagrada central */}
            <FlowerOfLife reduced={reduced} />

            {/* Portales de apps */}
            <PortalRing portals={portals} reduced={reduced} onOpen={onOpen} />

            {/* Suelo reflejante */}
            <Suspense fallback={null}>
                <ReflectiveFloor />
            </Suspense>

            {/* Exploración en 2D (sin XR): orbitar/zoom */}
            <OrbitControls
                makeDefault
                enablePan={false}
                minDistance={3}
                maxDistance={14}
                maxPolarAngle={Math.PI / 1.9}
                autoRotate={!reduced}
                autoRotateSpeed={0.25}
                target={[0, 0.6, 0]}
            />

            {/* Puente WebXR (capta gl y comprueba soporte) */}
            <XRBridge onState={onXRState} />
        </>
    );
}

// ════════════════════════════════════════════════════════════════
// Botonera XR superpuesta (solo si hay soporte)
// ════════════════════════════════════════════════════════════════
function XRControls({ xr }: { xr: WebXRState | null }) {
    if (!xr) return null;
    const { vrSupported, arSupported, inSession, enter, exit } = xr;

    const enterBtn = (mode: XRMode, label: string, Icon: typeof Headset) => (
        <button
            type="button"
            onClick={() => void enter(mode)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px backdrop-blur-md border border-white/15"
            style={{
                background:
                    mode === 'immersive-vr'
                        ? 'linear-gradient(135deg, #A855F7, #6366F1)'
                        : 'linear-gradient(135deg, #22D3EE, #0EA5E9)',
            }}
        >
            <Icon className="size-4" /> {label}
        </button>
    );

    return (
        <div className="pointer-events-auto absolute top-4 right-4 z-20 flex flex-wrap items-center justify-end gap-2">
            {inSession ? (
                <button
                    type="button"
                    onClick={() => void exit()}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px backdrop-blur-md border border-white/15 bg-rose-600/90"
                >
                    <LogOut className="size-4" /> Salir
                </button>
            ) : (
                <>
                    {vrSupported && enterBtn('immersive-vr', 'Entrar en VR', Headset)}
                    {arSupported && enterBtn('immersive-ar', 'Entrar en AR', ScanEye)}
                </>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// ImmersiveSpace — export principal
// ════════════════════════════════════════════════════════════════
export function ImmersiveSpace() {
    const reduced = usePrefersReducedMotion();
    const portals = useMemo(buildPortals, []);
    const { launch, windowEl } = useAppLauncher();
    const [xr, setXr] = useState<WebXRState | null>(null);

    const noXR = xr && xr.vrSupported === false && xr.arSupported === false;

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#05060f]">
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 1.2, 7], fov: 55 }}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => {
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.05;
                }}
            >
                <Suspense fallback={null}>
                    <Scene portals={portals} reduced={reduced} onOpen={launch} onXRState={setXr} />
                </Suspense>
            </Canvas>

            {/* Controles XR superpuestos */}
            <XRControls xr={xr} />

            {/* Pista de exploración */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-bold text-white/55">
                <Sparkle className="size-3.5 text-emerald-300" />
                arrastra para orbitar · rueda para zoom · toca un portal para entrar
            </div>

            {/* Aviso de degradación elegante */}
            {noXR && (
                <div className="pointer-events-none absolute top-4 left-4 z-10 rounded-full border border-white/15 bg-black/50 backdrop-blur px-3 py-1.5 text-[11px] font-semibold text-white/70">
                    VR/AR no disponible en este dispositivo
                </div>
            )}

            {/* Estado de comprobación (breve) */}
            {!xr && (
                <div className="pointer-events-none absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white/60">
                    <Loader2 className="size-3.5 animate-spin" /> Inicializando espacio…
                </div>
            )}

            {/* Ventana del OS para apps que abren incrustadas (portada a body) */}
            {windowEl}
        </div>
    );
}

export default ImmersiveSpace;
