"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { OPCIONES_RENDER_SHADER } from "@/lib/protomolecula/atomos/fondo-shader";

type Componente = { type?: string; id?: string; props?: Record<string, unknown>; children?: Componente[] };
const CAMARA = ["WebcamTexture", "ObjectTracker"];
const aplanar = (cs: Componente[]): Componente[] => cs.flatMap((c) => [c, ...(aplanar(c.children ?? []))]);

interface CapaShaderProps {
    layer: BackgroundLayer;
    vistaPrevia?: string;
    className?: string;
}

function esWebGPUDisponible(): boolean {
    if (typeof navigator === "undefined") return false;
    return "gpu" in navigator;
}

function obtenerModo(
    webgpu: boolean,
    reducirMovimiento: boolean,
    ahorroBateria: boolean,
    bateriaPct: number | null,
    visible: boolean,
): "fijo" | "pausado" | "vivo-30fps" | "vivo" {
    if (!webgpu || reducirMovimiento || ahorroBateria) return "fijo";
    if (bateriaPct !== null && bateriaPct <= 20) return "fijo";
    if (!visible) return "pausado";
    return bateriaPct !== null ? "vivo-30fps" : "vivo";
}

export function CapaShader({ layer, vistaPrevia, className }: CapaShaderProps) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [fallo, setFallo] = useState(false);
    const [entorno, setEntorno] = useState<{
        webgpu: boolean;
        reducirMovimiento: boolean;
        bateriaPct: number | null;
    }>({
        webgpu: false,
        reducirMovimiento: false,
        bateriaPct: null,
    });

    const { opacity, blend, transform, visible, preset } = layer;
    const componentes = (preset?.components ?? []) as Componente[];
    const usaCamara = aplanar(componentes).some((c) => CAMARA.includes(c.type ?? ""));
    const modo = fallo || usaCamara ? "fijo" : obtenerModo(
        entorno.webgpu,
        entorno.reducirMovimiento,
        false,
        entorno.bateriaPct,
        visible ?? true,
    );
    const conMotor = modo !== "fijo";

    useEffect(() => {
        if (typeof window === "undefined") return;

        const medirEntorno = () => {
            const mq = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
            setEntorno({
                webgpu: esWebGPUDisponible(),
                reducirMovimiento: !!(mq?.matches),
                bateriaPct: null,
            });
        };

        medirEntorno();

        if (typeof window !== "undefined" && window.matchMedia) {
            const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
            const handleChange = () => medirEntorno();
            mq.addEventListener("change", handleChange);
            return () => mq.removeEventListener("change", handleChange);
        }
    }, []);

    useEffect(() => {
        const lienzo = canvas.current;
        if (!conMotor || !lienzo) return;

        let vivo = true;

        const ejecutar = async () => {
            try {
                const m = await import("shaders/js") as unknown as {
                    createShader: (
                        canvas: HTMLCanvasElement,
                        init: unknown,
                        opts: unknown,
                    ) => Promise<{
                        resize: (w: number, h: number) => void;
                        destroy: () => void;
                        pause: () => void;
                        resume: () => void;
                        getFailureReason: () => string | null;
                        update: (id: string, props: Record<string, unknown>) => void;
                    }>;
                };
                if (!vivo) return;
                const s = await m.createShader(
                    lienzo,
                    { components: componentes, structureVersion: preset?.structureVersion },
                    { ...OPCIONES_RENDER_SHADER },
                );
                if (!vivo) { s.destroy(); return; }
                if (s.getFailureReason()) { setFallo(true); return; }
                s.resize(lienzo.clientWidth, lienzo.clientHeight);
            } catch {
                if (vivo) setFallo(true);
            }
        };

        ejecutar();

        return () => { vivo = false; };
    }, [conMotor]);

    if (!visible) return null;

    const estilo = { opacity, mixBlendMode: blend } as CSSProperties;

    if (!conMotor) {
        return vistaPrevia ? (
            <img src={vistaPrevia} alt="" aria-hidden className={`pointer-events-none h-full w-full object-cover ${className ?? ""}`} style={estilo} />
        ) : null;
    }

    return <canvas ref={canvas} aria-hidden className={`pointer-events-none block h-full w-full ${className ?? ""}`} style={estilo} />;
}