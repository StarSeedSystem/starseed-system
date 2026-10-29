"use client";

/**
 * StarSeed XR · PANTALLA 3D (XR1010Y · contrato §3 b.3 y §1.5): una `PantallaMundo` solo muestra
 * vídeo o imagen (§1.5); la decisión vive en funciones puras y el cascarón solo pinta.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { XRLayer, useXR } from "@react-three/xr";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import type { FuncionXR } from "@/lib/xr/tipos";
import type { PantallaMundo } from "@/lib/xr/mundo-tipos";
import { rutaSalaLlamada } from "@/lib/vivo/xr";

export type ClaseMedioXR = "video" | "imagen";
export const EXT_VIDEO_XR = ["mp4", "webm", "mov"] as const,
    EXT_IMAGEN_XR = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"] as const;
/** Altura para un ancho dado; proporción 16:9 (cine). */
export const altoPantallaDe = (ancho: number): number => (ancho * 9) / 16;

/** ¿URL de vídeo/imagen, por ruta o por `Content-Type` (de un `HEAD` que CORS haya dejado)? */
export function urlMediaXR(url: string, tipoContenido?: string | null): ClaseMedioXR | null {
    const limpio = (url ?? "").trim().toLowerCase();
    if (!limpio.startsWith("https://") && !limpio.startsWith("http://")) return null;
    const ext = limpio.split(/[?#]/)[0].split(".").pop() ?? "";
    let tipo = (tipoContenido ?? "").toLowerCase();
    if (tipo === "" && (EXT_VIDEO_XR as readonly string[]).includes(ext)) tipo = "video/";
    if (tipo === "" && (EXT_IMAGEN_XR as readonly string[]).includes(ext)) tipo = "image/";
    return tipo.startsWith("video/") ? "video" : tipo.startsWith("image/") ? "imagen" : null;
}

/** Capa de medios SÓLO con `capas` pedidas y la función `layers` concedida en la sesión. */
export function usaCapa(capas: boolean, funciones: readonly FuncionXR[]): boolean {
    return capas && funciones.includes("layers");
}

export type PlanPantalla =
    | { tipo: "medio"; clase: ClaseMedioXR; capa: boolean; url: string }
    | { tipo: "tarjeta"; titulo: string; detalle: string; ruta: string | null; externo: boolean };

export interface OpcionesPlanPantalla {
    capas?: boolean; funciones?: readonly FuncionXR[];
    sesionLlamada?: string | null; tipoContenido?: string | null;
}

/** Plan de la pantalla, decidido SIN efectos: tarjeta honesta o medio dibujable. */
const tarjetaXR = (titulo: string, detalle: string, ruta: string | null, externo: boolean): PlanPantalla =>
    ({ tipo: "tarjeta", titulo, detalle, ruta, externo });

export function planPantalla(p: PantallaMundo, o: OpcionesPlanPantalla = {}): PlanPantalla {
    const f = p.fuente;
    if (f.tipo === "estacion") return tarjetaXR("Esta estación no se puede ver en 3D todavía",
        "El flujo de la estación aún no se puede leer desde el visor; se escucha en el OS.", null, false);
    if (f.tipo === "llamada") return tarjetaXR("La llamada se vive en su sala de llamada",
        "El flujo de la llamada no se engancha al visor; su sala trae vídeo y voz.", o.sesionLlamada ? rutaSalaLlamada(o.sesionLlamada) : null, false);
    if (f.tipo === "app") return tarjetaXR("Esta app solo se puede usar en 2D",
        "Todavía no tiene vista 3D: se abre en una ventana del sistema.", f.ruta, false);
    const clase = urlMediaXR(f.url, o.tipoContenido);
    if (!clase) return tarjetaXR("Esta página solo se puede ver en 2D",
        "Una web normal no se puede pintar dentro de una sesión inmersiva.", f.url, true);
    return { tipo: "medio", clase, capa: usaCapa(o.capas ?? false, o.funciones ?? []), url: f.url };
}

/** `<video>` listo como fuente de `VideoTexture` o de capa; `mudo` respeta `pantalla.sonido`. */
export function elementoVideoDe(url: string, sonido: PantallaMundo["sonido"]): HTMLVideoElement {
    const v = Object.assign(document.createElement("video"), {
        src: url, crossOrigin: "anonymous", loop: true, playsInline: true, muted: sonido === "mudo",
    });
    try { void Promise.resolve(v.play()).catch(() => undefined); } catch { /* autoplay bloqueado */ }
    return v;
}

const abrirPorDefecto = (ruta: string, externo: boolean): void =>
    externo ? void window.open(ruta, "_blank", "noopener") : window.location.assign(ruta);

export interface PropsPantalla3D {
    pantalla: PantallaMundo; capas?: boolean;
    sesionLlamada?: string | null;
    abrirEn2D?: (ruta: string, externo: boolean) => void;
}

export function Pantalla3D({ pantalla: p, capas = false, sesionLlamada = null, abrirEn2D }: PropsPantalla3D) {
    const funciones = (useXR((s) => s.session?.enabledFeatures) ?? []) as readonly string[];
    const abrir = abrirEn2D ?? abrirPorDefecto;
    const planP = planPantalla(p, { capas, funciones: funciones.filter((f): f is FuncionXR => typeof f === "string"), sesionLlamada });
    const alto = altoPantallaDe(p.ancho);
    const medio = planP.tipo === "medio" ? planP : null;
    const urlMedio = medio?.url ?? null;
    const video = useMemo(() => (medio?.clase === "video" && urlMedio ? elementoVideoDe(urlMedio, p.sonido) : null), [medio, urlMedio, p.sonido]);
    const textura = useMemo(() => (medio === null ? null
        : video ? new THREE.VideoTexture(video) : new THREE.TextureLoader().load(urlMedio as string)),
    [medio, urlMedio, video]);

    if (planP.tipo === "tarjeta") {
        return (
            <group position={p.pos} rotation={p.rot} data-testid="tarjeta-pantalla">
                <mesh onPointerDown={() => { if (planP.ruta) abrir(planP.ruta, planP.externo); }}>
                    <planeGeometry args={[p.ancho, alto]} />
                    <meshBasicMaterial color={CRISTAL.fondoA.color} transparent opacity={CRISTAL.fondoA.alfa} />
                </mesh>
                <Text position={[-p.ancho / 2 + 0.06, alto / 2 - 0.1, 0.012]} fontSize={0.034} color={CRISTAL.texto} anchorX="left" anchorY="top" maxWidth={p.ancho - 0.12}>{planP.titulo}</Text>
                <Text position={[-p.ancho / 2 + 0.06, alto / 2 - 0.22, 0.012]} fontSize={0.024} color={CRISTAL.textoSecundario} anchorX="left" anchorY="top" maxWidth={p.ancho - 0.12}>{planP.detalle}</Text>
                <Text position={[0, -alto / 2 + 0.08, 0.012]} fontSize={0.026} color={CRISTAL.texto} data-testid="abrir-2d">{planP.ruta === null ? "Próximamente: esta fuente no se puede abrir aquí" : planP.externo ? "Salir y abrir en 2D" : "Abrir en 2D"}</Text>
            </group>
        );
    }
    if (planP.capa && video) {
        return <group position={p.pos} rotation={p.rot}><XRLayer src={video} pixelWidth={1280} pixelHeight={720} /></group>;
    }
    return (
        <group position={p.pos} rotation={p.rot} data-testid="malla-pantalla">
            <mesh>
                <planeGeometry args={[p.ancho, alto]} />
                <meshBasicMaterial map={textura ?? null} toneMapped={false} color={textura ? "#ffffff" : CRISTAL.fondoB.color} transparent={!textura} opacity={textura ? 1 : CRISTAL.fondoB.alfa} />
            </mesh>
        </group>
    );
}
