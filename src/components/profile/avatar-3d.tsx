"use client";

/**
 * AVATAR 3D DEL PERFIL (Adenda 219 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un modelo 3D opcional junto a la foto de perfil, fijo o animándose, con
 * control de posición, rotación, animación, iluminación, distancia y ángulo.
 *
 * DECISIÓN TÉCNICA: `<model-viewer>` (Google, Apache-2.0). Es un web component
 * que carga glTF/GLB —el formato estándar abierto de la web para 3D—, reproduce
 * sus animaciones, ilumina con HDR, deja orbitar la cámara y ya trae modo
 * **AR** en móviles (Scene Viewer / Quick Look) y soporte WebXR: es el mismo
 * componente que llevará el avatar a VR/AR cuando llegue esa versión, sin
 * cambiar de tecnología. Va como dependencia npm (sin CDN, funciona sin
 * internet) y se carga PEREZOSAMENTE: solo cuando un perfil tiene avatar 3D.
 *
 * FORMATOS, con honestidad: nativos GLB y glTF. FBX, OBJ, VRM o USDZ se
 * convierten a GLB (Blender exporta directo; hay conversores libres). La ficha
 * lo dice en vez de aceptar un archivo que luego no se vería.
 */

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Avatar3D {
    url: string;
    /** Extensión detectada: glb | gltf. */
    formato?: string;
    /** Desplazamiento del modelo respecto al centro (m). */
    posicion: { x: number; y: number; z: number };
    /** Rotación del modelo (grados). */
    rotacion: { x: number; y: number; z: number };
    escala: number;
    /** Nombre de la animación del archivo, o "" para quieto. */
    animacion: string;
    autoRotar: boolean;
    /** Exposición de la luz (0.2…3). */
    exposicion: number;
    /** Intensidad de la sombra (0…1). */
    sombra: number;
    /** Ángulo de cámara: theta (horizontal) y phi (vertical), grados. */
    angulo: { theta: number; phi: number };
    /** Distancia de la cámara en % del radio del modelo (50…300). */
    distancia: number;
    /** Campo de visión (grados). */
    fov: number;
    /** Fondo: transparente o color. */
    fondo?: string;
}

export const AVATAR_3D_POR_DEFECTO: Avatar3D = {
    url: "",
    posicion: { x: 0, y: 0, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
    escala: 1,
    animacion: "",
    autoRotar: true,
    exposicion: 1,
    sombra: 0.6,
    angulo: { theta: 0, phi: 75 },
    distancia: 105,
    fov: 30,
};

const FORMATOS_NATIVOS = ["glb", "gltf"];
const FORMATOS_CONVERTIBLES = ["fbx", "obj", "vrm", "usdz", "dae", "stl", "blend"];

export function formatoDe(url: string): string {
    const m = (url || "").split("?")[0].toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}
export function esFormatoNativo(url: string): boolean { return FORMATOS_NATIVOS.includes(formatoDe(url)); }
export function esFormatoConvertible(url: string): boolean { return FORMATOS_CONVERTIBLES.includes(formatoDe(url)); }

let cargaMV: Promise<void> | null = null;
/** Carga `<model-viewer>` una sola vez, solo cuando hace falta. */
function cargarModelViewer(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (cargaMV) return cargaMV;
    // Dependencia local (npm), importada solo cuando hace falta: sin CDN, sin
    // internet, coherente con el principio del OS. ~300 KB que solo paga quien
    // tiene avatar 3D.
    cargaMV = import("@google/model-viewer").then(() => undefined);
    return cargaMV;
}

export function normalizarAvatar3D(v: unknown): Avatar3D {
    const o = (v && typeof v === "object" ? v : {}) as Partial<Avatar3D>;
    const n = (x: unknown, d: number, min: number, max: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : d);
    const v3 = (x: unknown, d: { x: number; y: number; z: number }, lim: number) => {
        const p = (x && typeof x === "object" ? x : {}) as Partial<{ x: number; y: number; z: number }>;
        return { x: n(p.x, d.x, -lim, lim), y: n(p.y, d.y, -lim, lim), z: n(p.z, d.z, -lim, lim) };
    };
    const ang = (o.angulo && typeof o.angulo === "object" ? o.angulo : {}) as Partial<{ theta: number; phi: number }>;
    return {
        url: typeof o.url === "string" ? o.url : "",
        formato: typeof o.url === "string" ? formatoDe(o.url) : undefined,
        posicion: v3(o.posicion, AVATAR_3D_POR_DEFECTO.posicion, 5),
        rotacion: v3(o.rotacion, AVATAR_3D_POR_DEFECTO.rotacion, 360),
        escala: n(o.escala, 1, 0.1, 10),
        animacion: typeof o.animacion === "string" ? o.animacion : "",
        autoRotar: typeof o.autoRotar === "boolean" ? o.autoRotar : true,
        exposicion: n(o.exposicion, 1, 0.2, 3),
        sombra: n(o.sombra, 0.6, 0, 1),
        angulo: { theta: n(ang.theta, 0, -180, 180), phi: n(ang.phi, 75, 0, 180) },
        distancia: n(o.distancia, 105, 50, 300),
        fov: n(o.fov, 30, 10, 90),
        fondo: typeof o.fondo === "string" ? o.fondo : undefined,
    };
}

/** El visor. Fijo o animado según la configuración. */
export function Avatar3DVisor({ config, size = 160, className, interactivo = false }: { config: Partial<Avatar3D>; size?: number; className?: string; interactivo?: boolean }) {
    const c = useMemo(() => normalizarAvatar3D(config), [config]);
    const [listo, setListo] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const ref = useRef<HTMLElement | null>(null);

    useEffect(() => {
        let vivo = true;
        cargarModelViewer().then(() => vivo && setListo(true)).catch((e) => vivo && setFallo(String(e?.message || e)));
        return () => { vivo = false; };
    }, []);

    // Rotación del modelo: model-viewer no expone rotación del objeto, pero sí
    // orientación por `orientation` (yaw pitch roll) desde v3.
    const orientacion = `${c.rotacion.x}deg ${c.rotacion.y}deg ${c.rotacion.z}deg`;
    const orbita = `${c.angulo.theta}deg ${c.angulo.phi}deg ${c.distancia}%`;
    const objetivo = `${c.posicion.x}m ${c.posicion.y}m ${c.posicion.z}m`;

    if (!c.url) return null;
    if (!esFormatoNativo(c.url)) {
        return (
            <div className={cn("flex items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-3 text-center text-[10.5px] text-amber-100/90", className)} style={{ width: size, height: size }}>
                Formato .{formatoDe(c.url) || "?"} no reproducible aquí. Conviértelo a GLB (Blender lo exporta directo).
            </div>
        );
    }
    if (fallo) {
        return <div className={cn("rounded-2xl border border-white/10 bg-black/30 p-3 text-[10.5px] text-white/55", className)} style={{ width: size, height: size }}>No se pudo cargar el visor 3D.</div>;
    }
    if (!listo) {
        return <div className={cn("animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]", className)} style={{ width: size, height: size }} />;
    }

    // `<model-viewer>` es un custom element: con React 19 se crea con
    // createElement para no depender de aumentar JSX.IntrinsicElements.
    return createElement("model-viewer", {
        ref,
        src: c.url,
        alt: "Avatar 3D",
        class: cn("rounded-2xl", className),
        style: { width: size, height: size, background: c.fondo || "transparent", ["--poster-color" as string]: "transparent" },
        ...(c.animacion ? { "animation-name": c.animacion, autoplay: true } : {}),
        ...(c.autoRotar ? { "auto-rotate": true, "auto-rotate-delay": "0", "rotation-per-second": "18deg" } : {}),
        ...(interactivo ? { "camera-controls": true } : {}),
        "camera-orbit": orbita,
        "camera-target": objetivo,
        "field-of-view": `${c.fov}deg`,
        orientation: orientacion,
        scale: `${c.escala} ${c.escala} ${c.escala}`,
        exposure: String(c.exposicion),
        "shadow-intensity": String(c.sombra),
        "interaction-prompt": "none",
        ar: true,
        "ar-modes": "webxr scene-viewer quick-look",
        // En el editor (interactivo) carga ya; en perfiles y listas, al acercarse.
        loading: interactivo ? "eager" : "lazy",
        reveal: "auto",
    } as Record<string, unknown>);
}

/** Etiqueta de control (fuera del editor: definirla dentro remontaba los
 *  sliders en cada render y cortaba el arrastre). */
function L({ t, v, children }: { t: string; v: string; children: React.ReactNode }) {
    return <label className="text-[10.5px] text-white/55">{t} <span className="text-white/80">{v}</span>{children}</label>;
}

/** Editor completo: archivo, posición, rotación, animación, luz, cámara. */
export function EditorAvatar3D({ value, onChange, onSubir }: {
    value?: Partial<Avatar3D> | null;
    onChange: (a: Avatar3D) => void;
    /** Sube un archivo y devuelve su URL pública (lo da el llamador). */
    onSubir?: (file: File) => Promise<string | null>;
}) {
    const [a, setA] = useState<Avatar3D>(() => normalizarAvatar3D(value ?? AVATAR_3D_POR_DEFECTO));
    const [animaciones, setAnimaciones] = useState<string[]>([]);
    const [subiendo, setSubiendo] = useState(false);
    const visorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => { setA(normalizarAvatar3D(value ?? AVATAR_3D_POR_DEFECTO)); }, [value]);
    const set = (patch: Partial<Avatar3D>) => setA((p) => { const n = normalizarAvatar3D({ ...p, ...patch }); onChange(n); return n; });

    // Lee las animaciones del modelo cargado para ofrecerlas por nombre. El
    // <model-viewer> aparece DESPUÉS de cargarse la librería (import perezoso),
    // así que se espera a que exista antes de escuchar su `load`.
    useEffect(() => {
        let el: (HTMLElement & { availableAnimations?: string[] }) | null = null;
        let vivo = true;
        const leer = () => { if (vivo && el) setAnimaciones(Array.isArray(el.availableAnimations) ? el.availableAnimations : []); };
        let intentos = 0;
        const timer = window.setInterval(() => {
            el = visorRef.current?.querySelector("model-viewer") as typeof el;
            if (el) {
                window.clearInterval(timer);
                el.addEventListener("load", leer);
                leer();
            } else if (++intentos > 60) {
                window.clearInterval(timer);
            }
        }, 250);
        return () => { vivo = false; window.clearInterval(timer); el?.removeEventListener("load", leer); };
    }, [a.url]);

    const rango = "h-1.5 w-full cursor-pointer accent-cyan-400";

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-3">
                <div ref={visorRef}>
                    {a.url ? <Avatar3DVisor config={a} size={180} interactivo /> : (
                        <div className="flex h-[180px] w-[180px] items-center justify-center rounded-2xl border border-dashed border-white/15 text-center text-[10.5px] text-white/45">Sin avatar 3D todavía</div>
                    )}
                </div>
                <div className="min-w-[200px] flex-1 space-y-2">
                    <p className="text-[10.5px] text-white/55">
                        Formatos nativos: <b className="text-white/80">GLB y glTF</b>. FBX, OBJ, VRM o USDZ se convierten a GLB (Blender exporta directo). Vista en VR/AR: próximamente, con este mismo visor.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {onSubir && (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-500/20">
                                {subiendo ? "Subiendo…" : "Subir modelo 3D"}
                                <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json,.fbx,.obj,.vrm,.usdz" className="hidden"
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0]; if (!f) return;
                                        setSubiendo(true);
                                        try { const url = await onSubir(f); if (url) set({ url, formato: formatoDe(url) }); }
                                        finally { setSubiendo(false); }
                                    }} />
                            </label>
                        )}
                        <input value={a.url} onChange={(e) => set({ url: e.target.value.trim(), formato: formatoDe(e.target.value) })} placeholder="o pega la URL de un .glb" className="min-w-[160px] flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] outline-none focus:border-cyan-400/50" />
                        {a.url && <button type="button" onClick={() => set({ url: "" })} className="text-[10.5px] text-rose-300/80 hover:text-rose-200">Quitar</button>}
                    </div>
                </div>
            </div>

            {a.url && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-[10.5px] text-white/55">Animación
                        <select value={a.animacion} onChange={(e) => set({ animacion: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px]">
                            <option value="">Quieto</option>
                            {animaciones.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-[10.5px] text-white/55 sm:pt-5">
                        <input type="checkbox" checked={a.autoRotar} onChange={(e) => set({ autoRotar: e.target.checked })} /> Girar solo
                    </label>
                    <L t="Escala" v={`${a.escala.toFixed(2)}×`}><input className={rango} type="range" min={0.1} max={5} step={0.01} value={a.escala} onChange={(e) => set({ escala: +e.target.value })} /></L>
                    <L t="Distancia" v={`${Math.round(a.distancia)}%`}><input className={rango} type="range" min={50} max={300} step={1} value={a.distancia} onChange={(e) => set({ distancia: +e.target.value })} /></L>
                    <L t="Ángulo horizontal" v={`${Math.round(a.angulo.theta)}°`}><input className={rango} type="range" min={-180} max={180} step={1} value={a.angulo.theta} onChange={(e) => set({ angulo: { ...a.angulo, theta: +e.target.value } })} /></L>
                    <L t="Ángulo vertical" v={`${Math.round(a.angulo.phi)}°`}><input className={rango} type="range" min={0} max={180} step={1} value={a.angulo.phi} onChange={(e) => set({ angulo: { ...a.angulo, phi: +e.target.value } })} /></L>
                    <L t="Campo de visión" v={`${Math.round(a.fov)}°`}><input className={rango} type="range" min={10} max={90} step={1} value={a.fov} onChange={(e) => set({ fov: +e.target.value })} /></L>
                    <L t="Iluminación" v={a.exposicion.toFixed(2)}><input className={rango} type="range" min={0.2} max={3} step={0.01} value={a.exposicion} onChange={(e) => set({ exposicion: +e.target.value })} /></L>
                    <L t="Sombra" v={a.sombra.toFixed(2)}><input className={rango} type="range" min={0} max={1} step={0.01} value={a.sombra} onChange={(e) => set({ sombra: +e.target.value })} /></L>
                    <L t="Rotación X" v={`${Math.round(a.rotacion.x)}°`}><input className={rango} type="range" min={-180} max={180} step={1} value={a.rotacion.x} onChange={(e) => set({ rotacion: { ...a.rotacion, x: +e.target.value } })} /></L>
                    <L t="Rotación Y" v={`${Math.round(a.rotacion.y)}°`}><input className={rango} type="range" min={-180} max={180} step={1} value={a.rotacion.y} onChange={(e) => set({ rotacion: { ...a.rotacion, y: +e.target.value } })} /></L>
                    <L t="Rotación Z" v={`${Math.round(a.rotacion.z)}°`}><input className={rango} type="range" min={-180} max={180} step={1} value={a.rotacion.z} onChange={(e) => set({ rotacion: { ...a.rotacion, z: +e.target.value } })} /></L>
                    <L t="Posición X" v={a.posicion.x.toFixed(2)}><input className={rango} type="range" min={-2} max={2} step={0.01} value={a.posicion.x} onChange={(e) => set({ posicion: { ...a.posicion, x: +e.target.value } })} /></L>
                    <L t="Posición Y" v={a.posicion.y.toFixed(2)}><input className={rango} type="range" min={-2} max={2} step={0.01} value={a.posicion.y} onChange={(e) => set({ posicion: { ...a.posicion, y: +e.target.value } })} /></L>
                    <L t="Posición Z" v={a.posicion.z.toFixed(2)}><input className={rango} type="range" min={-2} max={2} step={0.01} value={a.posicion.z} onChange={(e) => set({ posicion: { ...a.posicion, z: +e.target.value } })} /></L>
                    <label className="flex items-center gap-2 text-[10.5px] text-white/55">Fondo
                        <input type="color" value={a.fondo || "#000000"} onChange={(e) => set({ fondo: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
                        <button type="button" onClick={() => set({ fondo: undefined })} className="text-[10px] text-cyan-300/80 hover:text-cyan-200">transparente</button>
                    </label>
                </div>
            )}
        </div>
    );
}
