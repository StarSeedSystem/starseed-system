"use client";

// ════════════════════════════════════════════════════════════════
// CameraQuickWidget — la cámara a un toque (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Un objetivo de cámara (diafragma, cristal y reflejo) que abre la app Cámara del OS
// (/camara), y a su alrededor lo que de verdad importa antes de disparar:
//   · si este dispositivo tiene cámara y en qué estado está el permiso — se CONSULTA
//     sin pedirlo (el aviso del navegador solo sale cuando tú abres la cámara);
//   · la cámara que se usará (frontal/trasera), la resolución, el temporizador y la
//     cuadrícula: los mismos ajustes que usa la app (lib/camera/camera-settings),
//     editables aquí con un toque.
// Composición: micro = el objetivo · s = objetivo + estado · m = + frontal/trasera y
// resolución · l/xl = + temporizador, cuadrícula y galería · panorámico = fila ·
// torre = columna. Estados: cargando (comprobando la cámara), vacío (sin cámara en
// este dispositivo: se dice), error (permiso denegado: cómo arreglarlo).
// ════════════════════════════════════════════════════════════════

import { useEffect, useId, useState } from "react";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import Link from "next/link";
import { Camera, Images, SwitchCamera, Timer, Grid3x3, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { RESOLUTION_PRESETS, TIMER_OPTIONS, useCameraHwSettings, type ResolutionPreset } from "@/lib/camera/camera-settings";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { BotonE, EncabezadoE, EnlaceE, RaizE } from "./paquete-e/piezas";

type Permiso = "granted" | "denied" | "prompt" | "desconocido";
interface EstadoCamara { comprobando: boolean; camaras: number | null; permiso: Permiso }

/** Consulta sin pedir: cuántas cámaras hay y el estado del permiso (nunca abre la cámara). */
function useEstadoCamara(): EstadoCamara {
    const [e, setE] = useState<EstadoCamara>({ comprobando: true, camaras: null, permiso: "desconocido" });
    useEffect(() => {
        let vivo = true;
        (async () => {
            let camaras: number | null = null;
            let permiso: Permiso = "desconocido";
            try {
                const lista = await navigator.mediaDevices?.enumerateDevices?.();
                if (Array.isArray(lista)) camaras = lista.filter((d) => d.kind === "videoinput").length;
            } catch { /* sin mediaDevices */ }
            try {
                const p = await navigator.permissions?.query?.({ name: "camera" as PermissionName });
                if (p?.state) permiso = p.state as Permiso;
            } catch { /* Firefox/Safari: sin consulta de permiso de cámara */ }
            if (vivo) setE({ comprobando: false, camaras, permiso });
        })();
        return () => { vivo = false; };
    }, []);
    return e;
}

const RESOLUCIONES: ResolutionPreset[] = ["sd", "hd", "fullhd", "4k"];
const CORTO: Record<ResolutionPreset, string> = { sd: "SD", hd: "HD", fullhd: "Full HD", "4k": "4K" };

/** El objetivo: diafragma de seis hojas, cristal azulado y el reflejo en diagonal. */
function Objetivo({ lado, lienzo }: { lado: number; lienzo: LienzoE }) {
    const r = lado / 2;
    const hojas = Array.from({ length: 6 }, (_, i) => i * 60);
    const gid = useId().replace(/:/g, "");
    return (
        <svg width={lado} height={lado} viewBox={`${-r} ${-r} ${lado} ${lado}`} aria-hidden className="overflow-visible" style={{ filter: `drop-shadow(0 10px 20px ${conAlfa(lienzo.acento, 0.35)})` }}>
            <circle r={r * 0.98} fill="#0b0c1e" stroke="rgba(255,255,255,.18)" strokeWidth={Math.max(1, r * 0.04)} />
            <circle r={r * 0.86} fill="none" stroke={conAlfa(lienzo.acento, 0.5)} strokeWidth={Math.max(1, r * 0.02)} strokeDasharray={`${r * 0.05} ${r * 0.08}`} />
            <g className={lienzo.animar ? "ss-girar" : undefined} style={{ ["--ss-dur" as string]: "40s", transformBox: "fill-box", transformOrigin: "center" } as React.CSSProperties}>
                {hojas.map((a) => (
                    <path key={a} d={`M0 ${-r * 0.7} L${r * 0.38} ${-r * 0.2} L0 ${-r * 0.12} Z`} fill={conAlfa(lienzo.acento2, 0.22)} stroke="rgba(255,255,255,.12)" strokeWidth={0.8} transform={`rotate(${a})`} />
                ))}
            </g>
            <circle r={r * 0.4} fill={`url(#cr-${gid})`} />
            <defs>
                <radialGradient id={`cr-${gid}`} cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#8ab4ff" stopOpacity={0.9} />
                    <stop offset="55%" stopColor={lienzo.acento} stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#05060f" />
                </radialGradient>
            </defs>
            <path d={`M${-r * 0.22} ${-r * 0.28} Q${-r * 0.05} ${-r * 0.36} ${r * 0.12} ${-r * 0.26}`} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={Math.max(1, r * 0.05)} strokeLinecap="round" />
            <circle cx={r * 0.62} cy={-r * 0.62} r={Math.max(2, r * 0.06)} fill="#fb7185" />
        </svg>
    );
}

export function CameraQuickWidget() {
    const { ref, lienzo } = useLienzoE({ acento: "#fb7185" });
    const [ajustes, cambiar] = useCameraHwSettings();
    const estado = useEstadoCamara();
    const { base, clase, horizontal } = lienzo;

    const texto = estado.comprobando ? "Comprobando la cámara…"
        : estado.camaras === 0 ? "Este dispositivo no tiene cámara"
            : estado.permiso === "denied" ? "Permiso denegado: actívalo en el candado de la barra de direcciones"
                : estado.permiso === "granted" ? `${estado.camaras ?? 1} ${estado.camaras === 1 ? "cámara lista" : "cámaras listas"}`
                    : "Te pedirá permiso al abrirla";
    const aviso = estado.permiso === "denied" || estado.camaras === 0;
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Cámara: ${texto}`, tipo: "CAMERA_QUICK" } as const;
    const siguienteTemporizador = TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(ajustes.timerSeconds) + 1) % TIMER_OPTIONS.length];

    const objetivo = (lado: number) => (
        <Link href="/camara" aria-label="Abrir la cámara" title="Abrir la cámara" className="ss-redondo shrink-0 cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}>
            <Objetivo lado={lado} lienzo={lienzo} />
        </Link>
    );
    const estadoEl = <p role={aviso ? "alert" : "status"} className={cn("text-center", aviso ? "text-amber-200" : "text-white/60")} style={{ fontSize: px(lienzo, 11) }}>{texto}</p>;
    const frontal = (
        <BotonE lienzo={lienzo} variante="suave" compacto icono={SwitchCamera} onClick={() => cambiar({ facingMode: ajustes.facingMode === "user" ? "environment" : "user" })} aria-label={`Usar la cámara ${ajustes.facingMode === "user" ? "trasera" : "frontal"}`}>
            {ajustes.facingMode === "user" ? "Frontal" : "Trasera"}
        </BotonE>
    );
    const resolucion = (
        <div role="radiogroup" aria-label="Resolución" className="flex flex-wrap gap-1">
            {RESOLUCIONES.map((r) => {
                const on = ajustes.resolution === r;
                return (
                    <button key={r} type="button" role="radio" aria-checked={on} onClick={() => cambiar({ resolution: r })} title={RESOLUTION_PRESETS[r].label}
                        className="ss-redondo min-h-7 cursor-pointer rounded-full px-2.5 text-[11px] font-semibold transition-colors"
                        style={on ? { background: conAlfa(lienzo.acento, 0.22), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.6)}`, color: "#fff" } : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.65)" }}>
                        {CORTO[r]}
                    </button>
                );
            })}
        </div>
    );
    const acciones = (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
            <EnlaceE lienzo={lienzo} href="/camara" variante="primario" icono={Camera}>Foto</EnlaceE>
            <EnlaceE lienzo={lienzo} href="/camara" variante="suave" icono={Video}>Vídeo</EnlaceE>
        </div>
    );
    const extras = (
        <div className="flex flex-wrap items-center gap-1.5">
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Timer} onClick={() => cambiar({ timerSeconds: siguienteTemporizador })} aria-label={`Temporizador: ${ajustes.timerSeconds ? `${ajustes.timerSeconds} s` : "sin temporizador"}. Cambiar`}>
                {ajustes.timerSeconds ? `${ajustes.timerSeconds} s` : "Sin temporizador"}
            </BotonE>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Grid3x3} aria-pressed={ajustes.grid} onClick={() => cambiar({ grid: !ajustes.grid })}>{ajustes.grid ? "Cuadrícula" : "Sin cuadrícula"}</BotonE>
            <span className="text-[11px] tabular-nums text-white/45">{ajustes.fps} fps</span>
        </div>
    );

    if (base === "micro") return <RaizE {...raiz}><div className="m-auto">{objetivo(Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.84))}</div></RaizE>;

    if (base === "s") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5">{objetivo(Math.max(64, Math.min(96, (lienzo.alto || 150) * 0.58)))}{estadoEl}</div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    {objetivo(Math.max(52, Math.min(96, (lienzo.alto || 110) - 12)))}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">{estadoEl}{acciones}</div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">{frontal}{resolucion}</div>
                </div>
            </RaizE>
        );
    }

    const grande = base === "l" || base === "xl" || clase === "torre";
    return (
        <RaizE {...raiz}>
            {/* Lo que no cabe se retira (los extras, luego cámara/resolución, luego el estado) en vez
                de cortarse por abajo. */}
            <PilaAjustable niveles={3} className="items-center gap-2 p-1">
                {grande && <EncabezadoE lienzo={lienzo} icono={Camera} titulo="Cámara" className="w-full" acciones={<EnlaceE lienzo={lienzo} href="/galeria" compacto variante="fantasma" icono={Images}>Galería</EnlaceE>} />}
                <div className="shrink-0">{objetivo(base === "xl" ? 150 : grande ? 116 : Math.max(72, Math.min(110, (lienzo.alto || 240) * 0.42)))}</div>
                <Prescindible nivel={3}>{estadoEl}</Prescindible>
                <div className="shrink-0">{acciones}</div>
                <Prescindible nivel={2}><div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5">{frontal}{resolucion}</div></Prescindible>
                {grande && <Prescindible nivel={1}>{extras}</Prescindible>}
            </PilaAjustable>
        </RaizE>
    );
}

export default CameraQuickWidget;
