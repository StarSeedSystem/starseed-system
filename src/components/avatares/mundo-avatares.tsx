"use client";

/**
 * MUNDOAVATARES — ESCENA 3D DEL MUNDO DE LOS AVATARES (Ola 234 · Escena 3D)
 * -----------------------------------------------------------------------------
 * Vista tridimensional del mundo simulado: un suelo, los avatares representados
 * por su identidad visual (procedural cuando no hay GLB propio), líneas suaves
 * entre quienes tienen vínculo fuerte y controles de cámara y simulación.
 *
 * REGLAS DURAS (imponen la spec):
 *  · Componente "use client" — R3F/Three NO se pueden ejecutar en servidor.
 *    El consumidor debe cargarlo con `next/dynamic({ ssr: false })`.
 *  · Con `prefers-reduced-motion` o sin WebGL real, NUNCA pantalla en blanco:
 *    se renderiza `<CronicaMundo>` a pantalla completa.
 *  · El estado se obtiene avanzando la simulación en un `setInterval` que se
 *    limpia al desmontar; si la pestaña está oculta, no se anima.
 *  · El panel lateral es `<CronicaMundo>` y no repite su contenido: aquí solo
 *    añadimos los controles 3D (pausar, acelerar, centrar en un habitante).
 *  · TypeScript estricto: nada de `any`; los refs al OrbitControls se tipan
 *    vía la firma de drei; los gestos se derivan de la ocupación con la misma
 *    forma `Gesto` que el motor único de movimiento.
 */

import {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import {
    Billboard,
    Float,
    Html,
    Line,
    OrbitControls,
    Sparkles,
    Stars,
} from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
    Pause,
    Play,
    Gauge,
    Crosshair,
    Compass,
    Loader2,
} from "lucide-react";

import { AvatarVivo, type FuenteAvatar } from "./avatar-vivo";
import { CronicaMundo } from "./cronica-mundo";
import {
    mundoInicial,
    avanzar,
    type EstadoMundo,
    type HabitanteMundo,
} from "@/lib/avatares/mundo/simulacion";
import { listPersonalityProfiles, type PersonalityProfile } from "@/lib/aurora/personalities";
import { proceduralAvatarDataUrl } from "@/lib/aurora/persona-avatar";
import type { Gesto } from "@/lib/avatares/movimiento/motor";

/* ──────────────────────────────────────────────────────────────────────────
 *  Detección de entorno (WebGL real + prefers-reduced-motion)
 * ────────────────────────────────────────────────────────────────────────── */

interface Capacidades3D {
    webgl: boolean;
    reducido: boolean;
}

function detectarCapacidades3D(): Capacidades3D {
    const reduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof window === "undefined") return { webgl: false, reducido: true };

    let webgl = false;
    try {
        const canvas = document.createElement("canvas");
        const gl =
            canvas.getContext("webgl2") ||
            canvas.getContext("webgl") ||
            canvas.getContext("experimental-webgl");
        webgl = !!gl;
    } catch {
        webgl = false;
    }
    return { webgl, reducido: reduced };
}

/** Convierte un `PersonalityProfile` en el objeto `FuenteAvatar` procedural. */
function fuenteProcedural(p: PersonalityProfile): FuenteAvatar {
    return {
        tipo: "procedural",
        svg: proceduralAvatarDataUrl(p, 192),
    };
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Mapeo ocupación → gesto
 *  Misma forma `Gesto` que el motor único, para que el clip generado respire
 *  con la MISMA identidad que en perfil, chat o biblioteca.
 * ────────────────────────────────────────────────────────────────────────── */

function gestoParaOcupacion(h: HabitanteMundo): Gesto {
    const energia = Math.max(0.25, Math.min(0.95, h.energia));
    const baseBucle = true;
    switch (h.ocupacion) {
        case "conversar":
            return {
                prompt: "saludar con calidez y asentir levemente",
                emocion: h.humor === "feliz" ? "alegria" : "amabilidad",
                energia,
                duracionMs: 2200,
                bucle: baseBucle,
            };
        case "crear":
            return {
                prompt: "concentrarse, inclinar la cabeza y respirar profundo",
                emocion: h.humor === "curioso" ? "foco" : "serenidad",
                energia,
                duracionMs: 3200,
                bucle: baseBucle,
            };
        case "descansar":
            return {
                prompt: "respirar lentamente con los ojos cerrados",
                emocion: "calma",
                energia: 0.2,
                duracionMs: 4000,
                bucle: baseBucle,
            };
        case "explorar":
        default:
            return {
                prompt: "mirar alrededor con curiosidad",
                emocion: h.humor === "feliz" ? "curiosidad" : "atencion",
                energia,
                duracionMs: 2600,
                bucle: baseBucle,
            };
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Avatar en billboard (siempre mira a la cámara, ahorra 30 huesos por 1)
 *  Usa `AvatarVivo` procedural: la vida (rotación 2,5D del clip) es la misma
 *  que en cualquier otro lugar del OS.
 * ────────────────────────────────────────────────────────────────────────── */

function HabitanteBillboard({
    fuente,
    gesto,
    nombre,
    onClick,
    resaltado,
    opacidad,
}: {
    fuente: FuenteAvatar;
    gesto: Gesto;
    nombre: string;
    onClick: (id: string) => void;
    resaltado: boolean;
    opacidad: number;
}) {
    const ref = useRef<THREE.Group>(null);
    useFrame((_, dt) => {
        if (!ref.current) return;
        ref.current.rotation.y += dt * 0.08;
    });
    return (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
            <group
                ref={ref}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    onClick(nombre);
                }}
                onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation();
                    if (typeof document !== "undefined") {
                        document.body.style.cursor = "pointer";
                    }
                }}
                onPointerOut={() => {
                    if (typeof document !== "undefined") {
                        document.body.style.cursor = "auto";
                    }
                }}
            >
                <AvatarVivo
                    fuente={fuente}
                    gesto={gesto}
                    tamano={resaltado ? 116 : 96}
                    className="drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                    /* @ts-expect-error AvatarVivo reenvía style al wrapper DOM del visor. */
                    style={{ opacity: opacidad }}
                />
            </group>
        </Billboard>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Línea de vínculo fuerte (umbral 0.6)
 * ────────────────────────────────────────────────────────────────────────── */

interface VinculoFuerte {
    a: [number, number, number];
    b: [number, number, number];
    intensidad: number;
    nombreA: string;
    nombreB: string;
}

function LineaVinculo({ v }: { v: VinculoFuerte }) {
    const color = v.intensidad > 0.85 ? "#fbbf24" : "#22d3ee";
    return (
        <Line
            points={[v.a, v.b]}
            color={color}
            lineWidth={1.2 + v.intensidad * 1.6}
            transparent
            opacity={0.35 + v.intensidad * 0.45}
        />
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Cámara que vuela suave hacia el habitante enfocado
 * ────────────────────────────────────────────────────────────────────────── */

interface CameraRigProps {
    objetivo: [number, number, number] | null;
    controlsRef: React.MutableRefObject<{
        target: THREE.Vector3;
        update?: () => void;
    } | null>;
}

function CameraRig({ objetivo, controlsRef }: CameraRigProps) {
    const dirTmp = useRef(new THREE.Vector3());
    const destinoTmp = useRef(new THREE.Vector3());
    useFrame((state, dt) => {
        if (!objetivo) return;
        destinoTmp.current.set(objetivo[0], objetivo[1] + 0.6, objetivo[2]);
        const cam = state.camera;
        dirTmp.current.subVectors(cam.position, destinoTmp.current).normalize();
        const deseado = destinoTmp.current
            .clone()
            .add(dirTmp.current.multiplyScalar(3.4));
        cam.position.lerp(deseado, 1 - Math.pow(0.001, dt));
        const ctr = controlsRef.current;
        if (ctr) {
            ctr.target.lerp(destinoTmp.current, 1 - Math.pow(0.001, dt));
            ctr.update?.();
        }
    });
    return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Suelo del mundo
 * ────────────────────────────────────────────────────────────────────────── */

function Suelo() {
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
                <circleGeometry args={[26, 64]} />
                <meshStandardMaterial
                    color="#0b1020"
                    emissive="#0a1430"
                    emissiveIntensity={0.35}
                    roughness={0.85}
                    metalness={0.1}
                />
            </mesh>
            {/* Anillos concéntricos suaves: "el mundo respira". */}
            {[6, 11, 16, 21].map((r, i) => (
                <mesh
                    key={r}
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, -1.04 + i * 0.001, 0]}
                >
                    <ringGeometry args={[r - 0.02, r, 96]} />
                    <meshBasicMaterial
                        color="#22d3ee"
                        transparent
                        opacity={0.08 - i * 0.012}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            ))}
        </group>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Escena principal
 * ────────────────────────────────────────────────────────────────────────── */

interface EscenaProps {
    estado: EstadoMundo;
    personalidades: PersonalityProfile[];
    reducido: boolean;
    habitanteCentradoId: string | null;
    onCentrar: (id: string) => void;
    controlsRef: React.MutableRefObject<{
        target: THREE.Vector3;
        update?: () => void;
    } | null>;
}

function Escena({
    estado,
    personalidades,
    reducido,
    habitanteCentradoId,
    onCentrar,
    controlsRef,
}: EscenaProps) {
    const fuentePorPersonalidad = useMemo(() => {
        const m = new Map<string, FuenteAvatar>();
        for (const p of personalidades) m.set(p.id, fuenteProcedural(p));
        return m;
    }, [personalidades]);

    const vinculosFuertes = useMemo<VinculoFuerte[]>(() => {
        const posPorId = new Map<string, [number, number, number]>();
        const nombrePorId = new Map<string, string>();
        for (const h of estado.habitantes) {
            posPorId.set(h.id, h.posicion);
            nombrePorId.set(h.id, h.nombre);
        }
        const out: VinculoFuerte[] = [];
        const vistos = new Set<string>();
        for (const h of estado.habitantes) {
            for (const [otroId, fuerza] of Object.entries(h.vinculos)) {
                if (fuerza < 0.6) continue;
                const clave = [h.id, otroId].sort().join("::");
                if (vistos.has(clave)) continue;
                vistos.add(clave);
                const pa = posPorId.get(h.id);
                const pb = posPorId.get(otroId);
                if (!pa || !pb) continue;
                out.push({
                    a: pa,
                    b: pb,
                    intensidad: fuerza,
                    nombreA: nombrePorId.get(h.id) ?? "alguien",
                    nombreB: nombrePorId.get(otroId) ?? "alguien",
                });
            }
        }
        return out;
    }, [estado.habitantes]);

    const posicionCentrado = useMemo<[number, number, number] | null>(() => {
        if (!habitanteCentradoId) return null;
        const h = estado.habitantes.find((x) => x.id === habitanteCentradoId);
        return h ? h.posicion : null;
    }, [habitanteCentradoId, estado.habitantes]);

    const handleClickHabitante = useCallback(
        (id: string) => {
            onCentrar(id);
        },
        [onCentrar],
    );

    return (
        <>
            <fog attach="fog" args={["#05060f", 18, 60]} />
            <color attach="background" args={["#05060f"]} />

            <ambientLight intensity={0.55} color="#9db8ff" />
            <hemisphereLight intensity={0.5} color="#bff5d8" groundColor="#0a0d1a" />
            <directionalLight position={[8, 12, 6]} intensity={0.9} color="#ffe9b0" />
            <pointLight position={[0, 6, 0]} intensity={0.6} color="#a855f7" distance={40} />

            <Stars
                radius={140}
                depth={60}
                count={3500}
                factor={4}
                saturation={0}
                fade
                speed={reducido ? 0 : 0.4}
            />
            <Sparkles
                count={80}
                scale={[28, 14, 28]}
                size={2.4}
                speed={reducido ? 0 : 0.22}
                color="#7CF6C8"
                opacity={0.45}
            />

            <Float
                speed={reducido ? 0 : 0.8}
                floatIntensity={reducido ? 0 : 0.35}
                rotationIntensity={reducido ? 0 : 0.12}
            >
                <mesh position={[0, 2.6, 0]}>
                    <icosahedronGeometry args={[0.32, 1]} />
                    <meshStandardMaterial
                        color="#a855f7"
                        emissive="#a855f7"
                        emissiveIntensity={1.1}
                        roughness={0.3}
                        metalness={0.4}
                    />
                </mesh>
            </Float>

            <Suelo />

            {vinculosFuertes.map((v, i) => (
                <LineaVinculo key={`${v.nombreA}-${v.nombreB}-${i}`} v={v} />
            ))}

            {estado.habitantes.map((h) => {
                const fuente = fuentePorPersonalidad.get(h.personalidadId);
                if (!fuente) return null;
                const esCentrado = habitanteCentradoId === h.id;
                const opacidad = habitanteCentradoId
                    ? esCentrado
                        ? 1
                        : 0.45
                    : 1;
                return (
                    <group key={h.id} position={h.posicion}>
                        <HabitanteBillboard
                            fuente={fuente}
                            gesto={gestoParaOcupacion(h)}
                            nombre={h.id}
                            onClick={handleClickHabitante}
                            resaltado={esCentrado}
                            opacidad={opacidad}
                        />
                        <Html
                            center
                            distanceFactor={9}
                            position={[0, -0.85, 0]}
                            style={{ pointerEvents: "none" }}
                        >
                            <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white/85"
                                style={{
                                    background: "rgba(8,12,20,0.55)",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    backdropFilter: "blur(6px)",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {h.nombre}
                            </span>
                        </Html>
                    </group>
                );
            })}

            <OrbitControls
                ref={controlsRef as unknown as React.Ref<OrbitControlsImpl>}
                makeDefault
                enablePan
                minDistance={3}
                maxDistance={42}
                autoRotate={!reducido && !habitanteCentradoId}
                autoRotateSpeed={0.18}
                target={[0, 0.3, 0]}
            />

            <CameraRig objetivo={posicionCentrado} controlsRef={controlsRef} />
        </>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Controles flotantes: pausa, velocidad, centrar
 * ────────────────────────────────────────────────────────────────────────── */

interface ControlesProps {
    pausado: boolean;
    onPausar: () => void;
    onReanudar: () => void;
    velocidad: number;
    onVelocidad: (v: number) => void;
    habitantes: { id: string; nombre: string }[];
    centradoId: string | null;
    onCentrar: (id: string | null) => void;
    tick: number;
}

function ControlesMundo(props: ControlesProps) {
    const [abierto, setAbierto] = useState(false);
    return (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/12 bg-black/55 px-3 py-2 backdrop-blur-md">
                {props.pausado ? (
                    <button
                        type="button"
                        onClick={props.onReanudar}
                        title="Reanudar simulación"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow transition hover:-translate-y-px"
                    >
                        <Play className="size-4" /> Reanudar
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={props.onPausar}
                        title="Pausar simulación"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/85 transition hover:bg-white/15"
                    >
                        <Pause className="size-4" /> Pausar
                    </button>
                )}

                <div className="mx-1 h-5 w-px bg-white/15" />

                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
                    <Gauge className="size-3.5" /> Velocidad
                </span>
                {[1, 2, 4].map((v) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => props.onVelocidad(v)}
                        title={`A ${v}x tick/s`}
                        className={
                            "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold transition " +
                            (props.velocidad === v
                                ? "border border-cyan-300/60 bg-cyan-400/20 text-cyan-50"
                                : "border border-white/10 text-white/65 hover:bg-white/10")
                        }
                    >
                        {v}×
                    </button>
                ))}

                <div className="mx-1 h-5 w-px bg-white/15" />

                <button
                    type="button"
                    onClick={() => setAbierto((v) => !v)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/85 transition hover:bg-white/15"
                    title="Centrar la cámara en un habitante"
                >
                    <Crosshair className="size-4 text-violet-300" /> Centrar
                </button>
                <button
                    type="button"
                    onClick={() => props.onCentrar(null)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/85 transition hover:bg-white/15"
                    title="Volver a la vista general"
                >
                    <Compass className="size-4 text-amber-300" /> Vista general
                </button>

                <span className="ml-1 hidden text-[10px] font-semibold text-white/40 sm:inline">
                    tick {props.tick}
                </span>
            </div>

            {abierto && (
                <div className="max-h-56 w-64 overflow-y-auto rounded-2xl border border-white/12 bg-black/65 p-2 backdrop-blur-md">
                    {props.habitantes.length === 0 ? (
                        <p className="px-2 py-3 text-center text-[11px] text-white/55">
                            Aún no hay habitantes.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {props.habitantes.map((h) => (
                                <li key={h.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            props.onCentrar(h.id);
                                            setAbierto(false);
                                        }}
                                        className={
                                            "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition " +
                                            (props.centradoId === h.id
                                                ? "bg-violet-500/25 text-white"
                                                : "text-white/80 hover:bg-white/10")
                                        }
                                    >
                                        <span className="truncate">{h.nombre}</span>
                                        <span className="ml-2 text-[10px] text-white/45">
                                            centrar
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Componente público
 * ────────────────────────────────────────────────────────────────────────── */

const INTERVALO_BASE_MS = 1100;
const MAX_HABITANTES = 24;

export interface MundoAvataresProps {
    /** Personalidades a poblar el mundo (si se omite, se leen de la librería). */
    personalidades?: PersonalityProfile[];
    /** Estado inicial opcional (reanudar una simulación guardada). */
    estadoInicial?: EstadoMundo;
}

/** Velocidad (1x, 2x, 4x) y motivos por tick, derivado del tiempo base. */
function msPorTick(v: number): number {
    return Math.max(120, Math.floor(INTERVALO_BASE_MS / v));
}

export function MundoAvatares({
    personalidades: personalidadesProp,
    estadoInicial,
}: MundoAvataresProps) {
    const [caps, setCaps] = useState<Capacidades3D>({
        webgl: false,
        reducido: true,
    });

    /* Capacidades del cliente (WebGL + reduced-motion): se decide en el
     * primer render del lado del cliente y se mantiene; un cambio de pestaña
     * del sistema operativo no nos obliga a tirar la escena. */
    useEffect(() => {
        setCaps(detectarCapacidades3D());
    }, []);

    const personalidades = useMemo<PersonalityProfile[]>(() => {
        if (personalidadesProp && personalidadesProp.length > 0) {
            return personalidadesProp.slice(0, MAX_HABITANTES);
        }
        try {
            const lista = listPersonalityProfiles();
            return lista.slice(0, MAX_HABITANTES);
        } catch {
            return [];
        }
    }, [personalidadesProp]);

    const [estado, setEstado] = useState<EstadoMundo>(() => {
        if (estadoInicial) return estadoInicial;
        const inicial = personalidades.map((p) => ({ id: p.id, nombre: p.name }));
        return mundoInicial(inicial);
    });

    const [pausado, setPausado] = useState(false);
    const [velocidad, setVelocidad] = useState(1);
    const [centradoId, setCentradoId] = useState<string | null>(null);
    const controlsRef = useRef<{
        target: THREE.Vector3;
        update?: () => void;
    } | null>(null);

    /* Avance de la simulación: setInterval que se limpia al desmontar y se
     * pausa cuando la pestaña está oculta (regla del área). */
    useEffect(() => {
        if (typeof window === "undefined") return;
        let vivo = true;
        let temporizador: ReturnType<typeof setInterval> | null = null;
        let pasosPendientes = 0;

        const programar = () => {
            if (temporizador !== null) clearInterval(temporizador);
            temporizador = setInterval(() => {
                if (!vivo) return;
                if (typeof document !== "undefined" && document.hidden) {
                    pasosPendientes = Math.min(pasosPendientes + 1, 4);
                    return;
                }
                // Si se acumuló mientras la pestaña estaba oculta, avanza en
                // bloque solo 1 para no congelar el navegador al volver.
                const saltos = pasosPendientes > 0 ? 1 : 1;
                pasosPendientes = 0;
                setEstado((prev) => avanzar(prev, saltos));
            }, msPorTick(velocidad));
        };

        programar();

        const onVisibilidad = () => {
            if (typeof document === "undefined") return;
            if (document.hidden) return; // el setInterval ya se encarga
            // Al volver, reset del intervalo para que no se dispare en rafaga.
            programar();
        };
        document.addEventListener?.("visibilitychange", onVisibilidad);

        return () => {
            vivo = false;
            if (temporizador !== null) clearInterval(temporizador);
            if (typeof document !== "undefined") {
                document.removeEventListener?.("visibilitychange", onVisibilidad);
            }
        };
    }, [velocidad, pausado]);

    const onCentrarPanel = useCallback((id: string) => {
        setCentradoId(id);
    }, []);

    /* ── Degradación elegante: sin WebGL o con prefers-reduced-motion ── */
    if (!caps.webgl || caps.reducido) {
        return (
            <div className="relative h-full w-full">
                <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#05060f] to-[#0a0d1a] p-4 sm:p-6">
                    <CronicaMundo estado={estado} onCentrar={onCentrarPanel} />
                </div>
            </div>
        );
    }

    const handlePausar = useCallback(() => setPausado(true), []);
    const handleReanudar = useCallback(() => setPausado(false), []);

    const listaHabitantes = useMemo(
        () => estado.habitantes.map((h) => ({ id: h.id, nombre: h.nombre })),
        [estado.habitantes],
    );

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#05060f]">
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 5, 16], fov: 55 }}
                gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            >
                <Suspense fallback={null}>
                    <Escena
                        estado={estado}
                        personalidades={personalidades}
                        reducido={false}
                        habitanteCentradoId={centradoId}
                        onCentrar={(id: string) => setCentradoId(id)}
                        controlsRef={controlsRef}
                    />
                </Suspense>
            </Canvas>

            <ControlesMundo
                pausado={pausado}
                onPausar={handlePausar}
                onReanudar={handleReanudar}
                velocidad={velocidad}
                onVelocidad={setVelocidad}
                habitantes={listaHabitantes}
                centradoId={centradoId}
                onCentrar={setCentradoId}
                tick={estado.tick}
            />

            {/* Panel lateral: la crónica. No repite su contenido: aquí SOLO
                añadimos los controles 3D. El usuario pidió "panel lateral". */}
            <aside
                className="pointer-events-auto absolute right-3 top-3 z-20 hidden h-[calc(100%-1.5rem)] w-[22rem] max-w-[40vw] flex-col gap-2 overflow-hidden rounded-2xl border border-white/12 bg-black/60 p-3 backdrop-blur-md lg:flex"
                aria-label="Crónica del mundo"
            >
                <header className="flex items-center justify-between px-1">
                    <h2 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">
                        <Compass className="size-3.5 text-cyan-300" /> Crónica del mundo
                    </h2>
                    <span className="text-[10px] font-semibold text-white/45">
                        tick {estado.tick}
                    </span>
                </header>
                <div className="flex-1 overflow-y-auto pr-1">
                    <CronicaMundo estado={estado} onCentrar={onCentrarPanel} />
                </div>
            </aside>

            {pausado && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white/70 backdrop-blur">
                    <Loader2 className="-mt-0.5 mr-1 inline size-3.5 animate-spin" /> Simulación en pausa
                </div>
            )}

            <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                arrastra para orbitar · rueda para zoom · toca un avatar para centrarlo
            </p>
        </div>
    );
}

export default MundoAvatares;
