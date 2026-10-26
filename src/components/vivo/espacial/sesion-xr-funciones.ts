/**
 * Funciones WebXR que pide la sala compartida (XR1010AQ). Módulo PURO: traduce el modo y la capa de
 * interfaz a las `CapacidadesXR` que consume `funcionesAPedir` (XR1010D), para no duplicar aquí la
 * lista blanca ni las reglas de `local-floor` / `plane-detection` / `camera-access`.
 */
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import type { FuncionXR } from "@/lib/xr/tipos";
import type { ModoSesionXR } from "./use-sesion-xr";

const FUNCIONES_POR_MODO: Record<ModoSesionXR, FuncionXR[]> = {
    "immersive-vr": ["local-floor", "bounded-floor", "hand-tracking"],
    "immersive-ar": ["local-floor", "hit-test"],
};

/** `dom-overlay` solo en AR de mano y con raíz de interfaz: el móvil lo concede, los visores no. */
export function capacidadesDeSesionXR(m: ModoSesionXR, raizOverlay: HTMLElement | null): CapacidadesXR {
    const funciones = [...FUNCIONES_POR_MODO[m]];
    if (m === "immersive-ar" && raizOverlay) funciones.push("dom-overlay");
    return {
        plataforma: m === "immersive-ar" ? "android-movil" : "desconocida",
        visor: m === "immersive-vr",
        modos: [],
        recomendado: "3d-pantalla",
        entradas: [],
        funciones,
        ofrecerSesion: false,
        motivos: [],
        avisos: [],
    };
}
