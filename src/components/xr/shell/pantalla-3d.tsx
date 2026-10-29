"use client";
/**
 * StarSeed XR · PANTALLA 3D (XR1010Y · contrato §3 b y h). Solo se pinta lo que se puede leer
 * como vídeo o imagen: no hay API web para incrustar HTML arbitrario dentro de una sesión
 * inmersiva (§1.5). Lo demás se dice con una tarjeta honesta y una salida real a 2D.
 */
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { XRLayer } from "@react-three/xr";
import { Container } from "@react-three/uikit";
import type { FuncionXR, PlataformaVisor } from "../../../lib/xr/tipos";
import type { FuentePantalla, PantallaMundo } from "../../../lib/xr/mundo-tipos";
import { rutaSalaLlamada } from "../../../lib/vivo/xr";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
export type ClasePantalla = "video" | "imagen" | "llamada" | "estacion" | "app" | "solo-2d"; export interface DecisionPantalla { clase: ClasePantalla; visible: boolean; titulo: string; motivo: string; url?: string; ruta2D?: string }
export interface OpcionesPantalla { sesionLlamada?: string }
const EXT_VIDEO = [".mp4", ".webm", ".ogv", ".mov", ".m3u8"]; const EXT_IMAGEN = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];
export function tipoVisualDeUrl(url: string): "video" | "imagen" | null {
    let ruta = url.toLowerCase().split(/[?#]/)[0] ?? "";
    try { ruta = new URL(url).pathname.toLowerCase(); } catch { /* URL relativa: vale la parte anterior a ? y # */ }
    if (EXT_VIDEO.some((e) => ruta.endsWith(e))) return "video";
    return EXT_IMAGEN.some((e) => ruta.endsWith(e)) ? "imagen" : null;
}
export function tipoVisualDeContentType(contentType: string | null | undefined): "video" | "imagen" | null {
    const tipo = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
    return tipo.startsWith("video/") ? "video" : tipo.startsWith("image/") ? "imagen" : null;
}
export function clasificarPantalla(fuente: FuentePantalla, opciones: OpcionesPantalla = {}): DecisionPantalla {
    if (fuente.tipo === "estacion") return {
        clase: "estacion", visible: false, titulo: "Esta estación no se puede ver en 3D todavía",
        motivo: "La estación suena en el OS, pero aún no entrega una imagen que se pueda poner en una pantalla 3D.",
        ruta2D: `/estaciones/vivo/${encodeURIComponent(fuente.id)}`,
    };
    if (fuente.tipo === "llamada") return {
        clase: "llamada", visible: true, titulo: "Llamada en curso",
        motivo: "Se pinta el vídeo de la llamada en la malla o en una capa de medios si el visor la concede.",
        ruta2D: opciones.sesionLlamada ? rutaSalaLlamada(opciones.sesionLlamada) : "/llamada",
    };
    if (fuente.tipo === "https") {
        const tipo = tipoVisualDeUrl(fuente.url);
        if (tipo === "video") return { clase: "video", visible: true, titulo: "Vídeo", motivo: "La URL es un vídeo y se pinta dentro de la sesión.", url: fuente.url };
        if (tipo === "imagen") return { clase: "imagen", visible: true, titulo: "Imagen", motivo: "La URL es una imagen y se pinta dentro de la sesión.", url: fuente.url };
        return { clase: "solo-2d", visible: false, titulo: "Esta página solo se puede ver en 2D", motivo: "Una web normal no se puede incrustar dentro de una sesión inmersiva. Se abre fuera de XR, nunca en un iframe.", url: fuente.url };
    }
    return { clase: "app", visible: false, titulo: "Esta página solo se puede ver en 2D", motivo: "Las apps del OS aún no tienen una vista 3D propia. Se abren fuera de XR con su ruta normal.", ruta2D: fuente.ruta };
}
const SIN_CAPAS: readonly PlataformaVisor[] = ["android-xr", "visionos"]; export function puedeUsarCapas(capas: boolean, funciones: readonly string[], plataforma?: PlataformaVisor): boolean {
    if (!capas || !funciones.includes("layers")) return false;
    return !plataforma || !SIN_CAPAS.includes(plataforma);
}
export const suenaEnPantalla = (sonido: PantallaMundo["sonido"]): boolean => sonido === "espacial"; type Medio = HTMLVideoElement | HTMLImageElement;
function usarMedio(decision: DecisionPantalla, flujo: MediaStream | null | undefined, sonido: PantallaMundo["sonido"]): Medio | null {
    const [medio, setMedio] = useState<Medio | null>(null);
    useEffect(() => {
        if (decision.clase === "llamada") {
            if (!flujo) { setMedio(null); return; }
            const video = document.createElement("video");
            video.srcObject = flujo; video.muted = !suenaEnPantalla(sonido); video.playsInline = true;
            try { void video.play()?.catch(() => undefined); } catch { /* sin reproducción automática */ }
            setMedio(video);
            return () => { video.pause(); video.srcObject = null; setMedio(null); };
        }
        if (!decision.url || (decision.clase !== "video" && decision.clase !== "imagen")) { setMedio(null); return; }
        if (decision.clase === "imagen") {
            const imagen = new Image(); imagen.crossOrigin = "anonymous"; imagen.src = decision.url; setMedio(imagen);
            return () => setMedio(null);
        }
        const video = document.createElement("video");
        video.src = decision.url; video.crossOrigin = "anonymous"; video.playsInline = true; video.loop = true; video.muted = !suenaEnPantalla(sonido);
        try { void video.play()?.catch(() => undefined); } catch { /* la persona puede darle al play */ }
        setMedio(video);
        return () => { video.pause(); video.removeAttribute("src"); video.load(); setMedio(null); };
    }, [decision.clase, decision.url, flujo, sonido]);
    return medio;
}
function usarTextura(medio: Medio | null): THREE.Texture | null {
    const textura = useMemo(() => {
        if (!medio) return null;
        const t = medio instanceof HTMLVideoElement ? new THREE.VideoTexture(medio) : new THREE.Texture(medio);
        t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
        return t;
    }, [medio]);
    useEffect(() => () => { textura?.dispose(); }, [textura]);
    return textura;
}
function TarjetaHonesta({ decision, ancho, alto, alSalir2D }: { decision: DecisionPantalla; ancho: number; alto: number; alSalir2D?: (ruta: string) => void }) {
    const ruta = decision.ruta2D ?? decision.url;
    const salir = () => { if (alSalir2D && ruta) alSalir2D(ruta); else if (ruta && typeof window !== "undefined") window.open(ruta, "_blank", "noopener,noreferrer"); };
    return (
        <PanelCristal nodo="logic" ancho={ancho} alto={alto}>
            <Container flexDirection="column" alignItems="center" justifyContent="center" paddingTop={24} paddingBottom={24} paddingLeft={24} paddingRight={24} gapRow={12}>
                <Texto3D distancia={2} tono="texto">{decision.titulo}</Texto3D>
                <Texto3D distancia={2} tono="textoSecundario">{decision.motivo}</Texto3D>
                {ruta ? <Container onClick={salir} cursor="pointer" paddingTop={8} paddingBottom={8} paddingLeft={16} paddingRight={16} borderWidth={1} borderColor={CRISTAL.borde.color}><Texto3D distancia={2}>Salir y abrir en 2D</Texto3D></Container> : null}
            </Container>
        </PanelCristal>
    );
}
export interface PropsPantalla3D { pantalla: PantallaMundo; capas: boolean; funciones?: readonly FuncionXR[]; plataforma?: PlataformaVisor; flujo?: MediaStream | null; alSalir2D?: (ruta: string) => void; sesionLlamada?: string }
export function Pantalla3D({ pantalla, capas, funciones = [], plataforma, flujo, alSalir2D, sesionLlamada }: PropsPantalla3D) {
    const decisionBase = clasificarPantalla(pantalla.fuente, { sesionLlamada });
    const decision: DecisionPantalla = decisionBase.clase === "llamada" && !flujo ? { ...decisionBase, visible: false, titulo: "Esperando el vídeo de la llamada", motivo: "Todavía no ha llegado la imagen de la llamada. En cuanto llegue, se pintará aquí." } : decisionBase;
    const medio = usarMedio(decision, flujo, pantalla.sonido);
    const textura = usarTextura(medio);
    const alto = Math.max(0.3, pantalla.ancho * (9 / 16));
    const conCapa = decision.visible && medio !== null && puedeUsarCapas(capas, funciones, plataforma);
    return (
        <group position={pantalla.pos} rotation={pantalla.rot}>
            {decision.visible && medio && conCapa ? <XRLayer src={medio} shape="quad" /> : null}
            {decision.visible && !conCapa ? (
                <mesh><planeGeometry args={[pantalla.ancho, alto]} />
                    {textura ? <meshBasicMaterial map={textura} side={THREE.DoubleSide} toneMapped={false} /> : <meshBasicMaterial color={CRISTAL.fondoA.color} transparent opacity={0.7} side={THREE.DoubleSide} />}
                </mesh>
            ) : null}
            {!decision.visible ? <TarjetaHonesta decision={decision} ancho={pantalla.ancho} alto={alto} alSalir2D={alSalir2D} /> : null}
        </group>
    );
}
