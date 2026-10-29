/**
 * StarSeed XR · AVATARES POR NIVEL (contrato §3 d y h, 2026-10-28).
 * Qué forma de avatar se ve y cómo se carga un VRM de la Biblioteca de la persona.
 * Módulo PURO: decide y sanea; los cargadores reales se inyectan o se importan perezosamente
 * dentro de `cargarVrm`, nunca en el arranque del módulo. La pose que viaja es `pose-avatar` de
 * privacidad (solo cabeza + manos, NUNCA las 25 articulaciones).
 */
import type { Object3D } from "three";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";

/** Las tres formas de avatar que se ven en escena: el VRM es el tope y siempre es perezoso. */
export type FormaAvatarXR = "orbe-manos" | "cabeza-manos" | "vrm";
export interface EventoProgreso { loaded: number; total?: number }
export interface GltfCargado { scene?: Object3D; userData?: { vrm?: { scene?: Object3D } } }
export interface CargadorGltf { loadAsync(url: string, onProgress?: (e: EventoProgreso) => void): Promise<GltfCargado>; register?(fabrica: (parser: unknown) => unknown): void; }
export interface CargadoresVrm {
    GLTFLoader: new () => CargadorGltf;
    VRMLoaderPlugin: new (parser: unknown) => unknown;
}
export type ResultadoVrm = { ok: true; raiz: Object3D } | { ok: false; motivo: string };

export const MB = 1024 * 1024;
/** Tope de tamaño de un archivo VRM completo (niveles alta y máxima). */
export const TECHO_VRM_BYTES = 25 * MB;
/** Tope de tamaño de un VRM ligero (nivel media). */
export const TECHO_VRM_LIGERO_BYTES = 10 * MB;

/** URL segura para cargar un VRM: solo https y sin credenciales dentro de la URL. */
export function urlVrmSegura(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === "https:" && !u.username && !u.password;
    } catch {
        return false;
    }
}

/** Tope de bytes del avatar VRM según nivel: 10 MB para `vrm-ligero`, 25 MB para `vrm`; 0 si el nivel no los carga. */
export function techoVrmBytes(nivel: NivelCalidad): number {
    const avatar = PERFILES[nivel].avatar;
    if (avatar === "vrm-ligero") return TECHO_VRM_LIGERO_BYTES;
    if (avatar === "vrm" || avatar === "vrm-completo") return TECHO_VRM_BYTES;
    return 0;
}

const FORMA_BASE: Record<AvatarCalidad, FormaAvatarXR> = {
    "orbe-manos": "orbe-manos", "cabeza-manos": "cabeza-manos", "vrm-ligero": "vrm", vrm: "vrm", "vrm-completo": "vrm",
};

/** Qué forma de avatar se ve para UNA persona.
 *  `jugadoresVisibles` (contrato §3 h): cuántas personas de la escena están MÁS CERCA que esta
 *  (0 = el más cercano). El cupo de VRM por escena sale de `PERFILES[nivel].jugadoresVisibles`:
 *  al pasarlo, los lejanos caen a cabeza + manos aunque tengan un VRM cargable — el más cercano
 *  gana el VRM. En mínima y baja nadie lleva VRM, tenga o no preferencia. */
export function elegirAvatar(
    nivel: NivelCalidad,
    preferencia: { vrmUrl?: string } | null,
    jugadoresVisibles: number,
): FormaAvatarXR {
    const forma = FORMA_BASE[PERFILES[nivel].avatar];
    if (forma !== "vrm") return forma;
    if (!preferencia?.vrmUrl || !urlVrmSegura(preferencia.vrmUrl)) return "cabeza-manos";
    if (jugadoresVisibles >= PERFILES[nivel].jugadoresVisibles) return "cabeza-manos";
    return "vrm";
}

/** Ya sea la URL miente o el techo del nivel lo impide, aquí no se entra: mensaje humano y listo. */
export async function cargarVrm(
    url: string,
    cargadores?: Partial<CargadoresVrm>,
    nivel: NivelCalidad = "media",
): Promise<ResultadoVrm> {
    if (!urlVrmSegura(url)) return { ok: false, motivo: "Solo se aceptan avatares VRM en https y sin credenciales en la dirección." };
    const techo = techoVrmBytes(nivel);
    if (techo <= 0) return { ok: false, motivo: "La calidad actual no carga avatares VRM: se ve como cabeza y manos." };
    let c: CargadoresVrm;
    try {
        c = await completarCargadores(cargadores);
    } catch {
        return { ok: false, motivo: "No se pudieron preparar los cargadores de VRM en este aparato." };
    }
    return cargar(url, c, techo);
}

/** Import perezoso (solo dentro de la función): three y `@pixiv/three-vrm` no entran al arranque. */
async function completarCargadores(parcial?: Partial<CargadoresVrm>): Promise<CargadoresVrm> {
    if (parcial?.GLTFLoader && parcial?.VRMLoaderPlugin) return parcial as CargadoresVrm;
    const { VRMLoaderPlugin } = await import("@pixiv/three-vrm");
    return {
        GLTFLoader: parcial?.GLTFLoader ?? (await import("three/examples/jsm/loaders/GLTFLoader.js")).GLTFLoader,
        VRMLoaderPlugin: parcial?.VRMLoaderPlugin ?? (VRMLoaderPlugin as unknown as CargadoresVrm["VRMLoaderPlugin"]),
    };
}

async function cargar(url: string, c: CargadoresVrm, techo: number): Promise<ResultadoVrm> {
    try {
        const cargador = new c.GLTFLoader();
        cargador.register?.((parser) => new c.VRMLoaderPlugin(parser));
        let bytes = 0;
        const gltf = await cargador.loadAsync(url, (e) => {
            bytes = Math.max(bytes, e.loaded ?? 0, e.total ?? 0);
        });
        if (bytes > techo) {
            return { ok: false, motivo: `El avatar VRM pesa ${Math.ceil(bytes / MB)} MB y pasa del tope de ${techo / MB} MB de este nivel.` };
        }
        const raiz = gltf.scene ?? gltf.userData?.vrm?.scene;
        if (!raiz) return { ok: false, motivo: "El archivo no trae avatar VRM." };
        return { ok: true, raiz };
    } catch (e) {
        const mensaje = e instanceof Error && e.message ? `: ${e.message}` : ".";
        return { ok: false, motivo: `No se pudo cargar el avatar VRM${mensaje}` };
    }
}
