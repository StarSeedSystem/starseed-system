"use client";

/**
 * AVATARVIVO — EL AVATAR UNIVERSAL CON VIDA (Ola 229 · M3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo avatar para perfil, publicaciones, biblioteca y chat. Tres fuentes:
 *
 *  · glb        → `<model-viewer>` (mismo patrón que el perfil): el clip se
 *                 aplica al visor; si el modelo trae animación propia con
 *                 esqueleto, se reproduce sola, y el balanceo/respiración de
 *                 la raíz del clip mueve el contenedor (2,5D) para que NUNCA
 *                 parezca muerto.
 *  · imagen     → `<img>` con movimiento 2,5D derivado del clip.
 *  · procedural → SVG (orbes de `persona-avatar`) con el mismo 2,5D.
 *
 * El movimiento lo decide el motor único «Vida StarSeed» (M1) vía
 * `useMovimiento` (M3): mismo gesto, misma identidad, nivel según hardware.
 * Con `prefers-reduced-motion` todo queda quieto y accesible.
 */

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import type { Object3D } from "three";
import type { VRM } from "@pixiv/three-vrm";
import { cn } from "@/lib/utils";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import { adnParaCalidad } from "@/lib/avatares/adn/calidad";
import { usoPermitido } from "@/lib/avatares/adn/canalizacion";
import { resolverRefBiblioteca, soloMismoOrigen } from "@/lib/avatares/adaptadores/resolver-ref-biblioteca";
import type { AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import { QuantumOrb, prefersReducedMotion } from "@/components/aurora/quantum-orb";
import { useMovimiento } from "./usar-movimiento";

/** Las tres fuentes de avatar que acepta el componente. */
export type FuenteAvatar =
    | { tipo: "glb"; url: string }
    | { tipo: "imagen"; url: string }
    | { tipo: "procedural"; svg: string };

export interface AvatarVivoProps {
    fuente: FuenteAvatar;
    gesto?: Gesto | null;
    /** Tamaño en píxeles (número) o CSS (cadena como "100%"). */
    tamano?: number | string;
    /** `true` = controles de cámara en el visor 3D. */
    interactivo?: boolean;
    personalidadId?: string;
    className?: string;
}

/* ───────────────────────── Carga perezosa de model-viewer ─────────────────────
 * Igual que en el perfil (Adenda 219): web component de Google cargado UNA sola
 * vez y solo si hay avatar GLB. Con React 19 se monta con `createElement`. */

let cargaMV: Promise<void> | null = null;

function cargarModelViewer(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (cargaMV) return cargaMV;
    cargaMV = import("@google/model-viewer").then(() => undefined);
    return cargaMV;
}

/* ────────────────────── Movimiento 2,5D derivado del clip ──────────────────────
 * Del clip (rotaciones de 22-30 articulaciones + raíz) se destilan las pocas
 * magnitudes que un contenedor 2D puede representar con honestidad: balanceo,
 * respiración, énfasis y parpadeo. Así un avatar de imagen o procedural respira
 * con el MISMO tempo que un avatar 3D haría con esqueleto. */

interface Movimiento25D {
    /** Inclinación lateral en grados (balanceo de cadera/torso). */
    balanceoDeg: number;
    /** Desplazamiento vertical en % (respiración de la raíz). */
    respiracionPct: number;
    /** Escala del énfasis (1 = neutro; sube en gestos de energía). */
    escala: number;
    /** 0-1 de la fase de parpadeo (usada como opacidad del velo). */
    parpadeo: number;
    /** Rotación vertical en grados (asentir / mirar). */
    inclinacionDeg: number;
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/** Destila un fotograma del clip en las magnitudes 2,5D del contenedor. */
function resumir25D(
    rotaciones: number[],
    raiz?: number[],
    energia?: number,
): Movimiento25D {
    // Esqueleto SMPL-X de 22 (procedural) o SOMA de 30 (Kimodo): se usan las
    // primeras articulaciones, que en ambos son pelvis → columna → cabeza.
    const pelvis = rotaciones[0] ?? 0;
    const columna = rotaciones.slice(1, 4).reduce((a, b) => a + b, 0) / 3;
    const cabeza = rotaciones[4] ?? columna;
    const saltoRaiz = raiz?.[1] ?? 0; // eje Y de la raíz: respiración
    const e = energia ?? 0.5;

    // Rotaciones del motor son radianes pequeños (~0.02-0.15); se amplifican a
    // un rango visible en 2D (±6° de balanceo, ±4° de inclinación).
    const balanceoDeg = clamp(pelvis * 45 + columna * 12, -8, 8);
    const inclinacionDeg = clamp(cabeza * 38, -5, 5);
    const respiracionPct = clamp(saltoRaiz * 140, -4, 4);
    const escala = 1 + clamp(columna * e * 0.35, -0.04, 0.05);
    // Parpadeo: fase rápida de la señal de cabeza, normalizada al ciclo. Se
    // aplica como un velo de opacidad sobre la imagen (abajo, en `opacidad`).
    const parpadeo = clamp(Math.abs(Math.sin(cabeza * 9)), 0, 1) * 0.12;

    return { balanceoDeg, respiracionPct, escala, parpadeo, inclinacionDeg };
}

/** Opacidad del velo de parpadeo: 1 = ojo abierto, baja al cerrar. */
function opacidadParpadeo(m: Movimiento25D | null): number {
    return m ? 1 - m.parpadeo : 1;
}

/* ──────────────────────────── GLB con esqueleto ────────────────────────────────
 * `<model-viewer>` no expone las matrices de huesos, pero sí deja transformar
 * el modelo completo. La vía honesta en este escalón: aplicar el clip al
 * CONTENEDOR del visor como 2,5D (la raíz del clip es literalmente el balanceo
 * y la respiración del modelo) y, si el GLB no tiene animaciones internas,
 * sumar una deriva de rotación suave para que respire. */

interface Estilo25D extends React.CSSProperties {
    [key: string]: string | number | undefined;
}

/** Construye el estilo 2,5D del fotograma actual (o reposo si no hay clip). */
function estilo25D(m: Movimiento25D | null, suave: boolean): Estilo25D {
    if (!m) {
        return suave
            ? { transform: "rotate(0.4deg)", transition: "transform 300ms ease-in-out" }
            : {};
    }
    return {
        transform:
            `translateY(${m.respiracionPct.toFixed(2)}%) ` +
            `rotate(${m.balanceoDeg.toFixed(2)}deg) ` +
            `rotateX(${m.inclinacionDeg.toFixed(2)}deg) ` +
            `scale(${m.escala.toFixed(3)})`,
        transition: "transform 90ms linear",
        willChange: "transform",
    };
}

/* ──────────────────────────────── Componente ───────────────────────────────── */

function AvatarVivoFuente({
    fuente,
    gesto = null,
    tamano = 160,
    interactivo = false,
    personalidadId,
    className,
}: AvatarVivoProps) {
    const { clip, nivel, fotograma } = useMovimiento(gesto, {
        personalidadId,
    });

    const [listo, setListo] = useState(false); // model-viewer cargado
    const [fallo, setFallo] = useState<string | null>(null);
    const [reducir, setReducir] = useState(false);

    // Movimiento reducido reactivo: si cambia la preferencia del sistema, la
    // animación suave de respaldo se corta (el hook ya se protege igual).
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        let mq: MediaQueryList;
        try {
            mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        } catch {
            return;
        }
        const aplicar = () => setReducir(mq.matches);
        aplicar();
        mq.addEventListener("change", aplicar);
        return () => mq.removeEventListener("change", aplicar);
    }, []);

    useEffect(() => {
        if (fuente.tipo !== "glb") return;
        let vivo = true;
        setListo(false);
        cargarModelViewer()
            .then(() => vivo && setListo(true))
            .catch((e: unknown) => vivo && setFallo(String((e as { message?: string })?.message || e)));
        return () => {
            vivo = false;
        };
    }, [fuente.tipo]);

    // El resumen 2,5D del fotograma actual: la vida de TODO avatar.
    const resumen = useMemo(() => {
        if (!clip || !clip.rotaciones[fotograma]) return null;
        return resumir25D(
            clip.rotaciones[fotograma],
            clip.raiz?.[fotograma],
            gesto?.energia,
        );
    }, [clip, fotograma, gesto?.energia]);

    const dimension =
        typeof tamano === "number" ? `${tamano}px` : tamano;

    const etiqueta =
        "Avatar animado" + (gesto ? `: ${gesto.prompt}` : "");

    /* ── Imagen y procedural: la vida viene del 2,5D del contenedor ── */
    if (fuente.tipo === "imagen" || fuente.tipo === "procedural") {
        const src =
            fuente.tipo === "imagen"
                ? fuente.url
                : fuente.svg.startsWith("data:image/")
                  ? fuente.svg // ya viene como data URI: no se envuelve otra vez
                  : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fuente.svg)}`;
        return (
            <div
                className={cn("relative inline-block select-none", className)}
                style={{ width: dimension, height: dimension }}
                role="img"
                aria-label={etiqueta}
                data-nivel-movimiento={nivel ?? undefined}
            >
                <div
                    className="h-full w-full cursor-pointer overflow-hidden rounded-2xl"
                    style={estilo25D(resumen, !resumen && !reducir)}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={etiqueta}
                        className="h-full w-full object-cover"
                        draggable={false}
                        style={{
                            transform: `scale(${(resumen?.escala ?? 1).toFixed(3)})`,
                            opacity: opacidadParpadeo(resumen),
                        }}
                    />
                </div>
            </div>
        );
    }

    /* ── GLB: model-viewer; el clip se aplica como vida del contenedor ── */
    if (fallo) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-center text-[10.5px] text-white/55",
                    className,
                )}
                style={{ width: dimension, height: dimension }}
                role="img"
                aria-label="No se pudo cargar el visor 3D del avatar"
            >
                No se pudo cargar el visor 3D.
            </div>
        );
    }
    if (!listo) {
        return (
            <div
                className={cn(
                    reducir ? "rounded-2xl border border-white/10 bg-white/[0.04]" : "animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]",
                    className,
                )}
                style={{ width: dimension, height: dimension }}
                aria-hidden="true"
            />
        );
    }

    return (
        <div
            className={cn("relative inline-block select-none", className)}
            style={{ width: dimension, height: dimension }}
            data-nivel-movimiento={nivel ?? undefined}
        >
            <div className="h-full w-full" style={estilo25D(resumen, !resumen && !reducir)}>
                {createElement("model-viewer", {
                    src: fuente.url,
                    alt: etiqueta,
                    class: "h-full w-full cursor-pointer rounded-2xl",
                    style: { background: "transparent", ["--poster-color" as string]: "transparent" },
                    ...(interactivo ? { "camera-controls": true } : {}),
                    "interaction-prompt": "none",
                    loading: interactivo ? "eager" : "lazy",
                    reveal: "auto",
                    // Animación suave de respaldo: si el modelo NO trae
                    // esqueleto (ni animaciones), la deriva del contenedor le
                    // da vida; si trae animación propia, se reproduce sola.
                    ...(clip && !reducir ? { autoplay: true } : {}),
                    ar: true,
                    "ar-modes": "webxr scene-viewer quick-look",
                } as Record<string, unknown>)}
            </div>
        </div>
    );
}

/* ── ADN + calidad: visor VRM vivo (AV1011A). El MISMO ADN se ve como su orbe o como VRM según el nivel de XR; three, three-vrm y
 * @react-three/fiber se cargan a demanda; fuera de pantalla o con la pestaña oculta no se dibuja; lo que no se puede dibujar se dice. */

export interface AvatarVivoAdnProps { adn: AdnAvatar; calidad?: AvatarCalidad; tamano?: number | string; className?: string }
/** `fatal`: el VRM no se puede dibujar (se ve la orbe); una pieza que falta no lo es. */
interface Aviso { texto: string; fatal: boolean }
interface PropsVisor { url: string; adn: AdnAvatar; activo: boolean; reducir: boolean; onAviso: (a: Aviso) => void }

async function cargarVisorVrm(): Promise<ComponentType<PropsVisor>> {
    const [r3f, { VRMLoaderPlugin, VRMUtils }, { GLTFLoader }, { aplicarAdnVrm, colocarPiezas }, { cargarModelo, mensajeErrorModelo }, { LoadingManager }] = await Promise.all([
        import("@react-three/fiber"), import("@pixiv/three-vrm"), import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("@/lib/avatares/adaptadores/aplicar-adn-vrm"), import("@/components/vivo/espacial/cargar-modelo"), import("three"),
    ]);
    function Escena({ url, adn, activo, onAviso }: Omit<PropsVisor, "reducir">) {
        const [vrm, setVrm] = useState<VRM | null>(null);
        const previo = useRef<AdnAvatar | null>(null);
        const piezas = useRef(new Map<string, Object3D | null>());
        const invalidate = r3f.useThree((s) => s.invalidate);
        useEffect(() => {
            let vivo = true, cargado: VRM | null = null;
            const gestor = new LoadingManager(); gestor.setURLModifier(soloMismoOrigen(url)); // nada de otro servidor dentro del VRM
            const loader = new GLTFLoader(gestor).register((p) => new VRMLoaderPlugin(p));
            loader.loadAsync(url).then((g) => {
                const v = g.userData.vrm as VRM | undefined;
                if (!v) throw new Error("El archivo no trae un VRM.");
                VRMUtils.rotateVRM0(v); cargado = v;
                if (!vivo) return VRMUtils.deepDispose(v.scene);
                previo.current = null; setVrm(v);
            }).catch((e: unknown) => { if (vivo) onAviso({ texto: mensajeErrorModelo(e), fatal: true }); });
            return () => { vivo = false; if (cargado) VRMUtils.deepDispose(cargado.scene); setVrm(null); };
        }, [url, onAviso]);
        useEffect(() => {
            if (!vrm) return;
            const pieza = (ref: string) => piezas.current.get(ref) ?? null;
            const r = aplicarAdnVrm(vrm, previo.current, adn, { pieza });
            if (r.recargar) return; // cambió la base: el efecto de `url` trae el VRM nuevo
            previo.current = adn; invalidate(); // también al volver a verse: lo cambiado mientras estaba oculto se dibuja
            for (const ref of r.piezasPendientes.filter((x) => !piezas.current.has(x))) {
                piezas.current.set(ref, null); // una sola carga por pieza y sesión
                void resolverRefBiblioteca(ref).then((x) => (x.ok ? cargarModelo(x.url) : Promise.reject(new Error(x.motivo))))
                    .then((g) => { piezas.current.set(ref, g); colocarPiezas(vrm, previo.current ?? adn, pieza); invalidate(); })
                    .catch((e: unknown) => onAviso({ texto: `Una pieza no se pudo poner: ${mensajeErrorModelo(e)}`, fatal: false }));
            }
        }, [vrm, adn, activo, invalidate, onAviso]);
        r3f.useFrame((_, dt) => vrm?.update(dt));
        return vrm ? <primitive object={vrm.scene} position={[0, -0.85, 0]} /> : null;
    }
    return function VisorVrm({ reducir, ...resto }: PropsVisor) {
        return (
            <r3f.Canvas frameloop={!resto.activo ? "never" : reducir ? "demand" : "always"} camera={{ position: [0, 0.1, 3.3], fov: 30 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[1, 2, 2]} intensity={1.3} />
                <Escena {...resto} />
            </r3f.Canvas>
        );
    };
}
const VisorVrm = dynamic(cargarVisorVrm, { ssr: false });

function AvatarVivoAdn({ adn, calidad = "vrm", tamano = 160, className }: AvatarVivoAdnProps) {
    const visto = useMemo(() => adnParaCalidad(adn, calidad).adn, [adn, calidad]);
    const caja = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(true);
    const [url, setUrl] = useState<string | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const [reducir] = useState(prefersReducedMotion);
    const ref = visto.base.tipo === "vrm" ? visto.base.ref ?? null : null;
    useEffect(() => { // fuera de pantalla o con la pestaña oculta: no se dibuja
        const el = caja.current;
        let enPantalla = true;
        const mirar = () => setVisible(enPantalla && !document.hidden);
        const io = el && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; mirar(); }) : null;
        if (el) io?.observe(el);
        document.addEventListener("visibilitychange", mirar);
        return () => { io?.disconnect(); document.removeEventListener("visibilitychange", mirar); };
    }, []);
    useEffect(() => { // cada referencia se resuelve una vez por sesión (caché del resolutor)
        let vivo = true;
        setUrl(null); setAviso(null);
        if (ref) void resolverRefBiblioteca(ref).then((r) => { if (vivo) { if (r.ok) setUrl(r.url); else setAviso({ texto: r.motivo, fatal: true }); } });
        return () => { vivo = false; };
    }, [ref]);
    const dim = typeof tamano === "number" ? `${tamano}px` : tamano;
    const sinVisor = visto.base.tipo === "glb-rig" || visto.base.tipo === "procedural"
        ? `Este avatar es ${visto.base.tipo === "glb-rig" ? "un GLB con esqueleto" : "procedural"}: el visor vivo solo dibuja VRM por ahora; se ve su orbe.` : null;
    const mensaje = sinVisor ?? aviso?.texto ?? null;
    const atribuciones = visto.visibilidad === "publico" ? usoPermitido(visto, { region: null, comercial: false }).atribuciones : [];
    const i = visto.aura.intensidad;
    return (
        <div ref={caja} role="img" aria-label={[`Avatar 3D de ${visto.nombre}`, mensaje, ...atribuciones].flatMap((t) => (t ? [t.replace(/\.$/, "")] : [])).join(". ")} data-calidad={calidad} data-base={visto.base.tipo}
            className={cn("relative inline-block select-none overflow-hidden rounded-2xl", className)} style={{ width: dim, height: dim }}>
            {url && !aviso?.fatal ? <VisorVrm url={url} adn={visto} activo={visible} reducir={reducir} onAviso={setAviso} /> : visible && (
                <div className="flex h-full w-full items-center justify-center">
                    <div className="rounded-full" style={{ boxShadow: `0 0 ${Math.round(8 + 24 * i)}px hsla(${visto.aura.tono}, 80%, 60%, ${i.toFixed(2)})` }}>
                        <QuantumOrb personaId={visto.dueno.tipo === "bot" ? visto.dueno.id : "aurora"} size={typeof tamano === "number" ? Math.round(tamano * 0.7) : 112} />
                    </div>
                </div>
            )}
            {mensaje && <p className="absolute inset-x-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-center text-[10px] leading-tight text-white/80">{mensaje}</p>}
            {atribuciones.length > 0 && <p className="absolute inset-x-1 top-1 truncate rounded bg-black/50 px-1.5 text-center text-[10px] text-white/80" title={atribuciones.join(" · ")}>{atribuciones.join(" · ")}</p>}
        </div>
    );
}

/** Avatar universal: por FUENTE (glb, imagen o procedural) o por ADN con su nivel de calidad de XR. */
export function AvatarVivo(props: AvatarVivoProps | AvatarVivoAdnProps) {
    return "adn" in props ? <AvatarVivoAdn {...props} /> : <AvatarVivoFuente {...props} />;
}
