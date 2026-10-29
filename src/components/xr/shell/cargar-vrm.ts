/**
 * StarSeed XR · AVATARES POR NIVEL (contrato `architecture/starseed-xr.md` §3 d y h · XR1010Z).
 * Módulo PURO y seguro de importar en node: three y @pixiv/three-vrm NO se importan estático,
 * entran por inyección (pruebas) o por `import()` perezoso dentro de la función (navegador).
 * - `elegirAvatar`: qué forma ve UNA persona (orbe+manos, cabeza+manos o VRM). `jugadoresVisibles`
 *   es su TURNO por cercanía (1 = la más cercana; el llamador ordena la sala por distancia): el
 *   tope de VRM por escena sale de `PERFILES[nivel].jugadoresVisibles` — las más cercanas ganan
 *   el VRM y las demás, aunque tengan VRM, se ven como cabeza+manos (u orbe en mínima).
 * - `urlVrmSegura`: sólo https y sin credenciales en la URL (Biblioteca del propio OS).
 * - `cargarVrm`: nunca lanza; devuelve `{ok:false, motivo}` y limita el tamaño del archivo
 *   (`TOPES_VRM_MB`: ≤ 25 MB para `vrm`, ≤ 10 MB para `vrm-ligero`). Sólo pose-avatar: cabeza
 *   y manos; jamás las 25 articulaciones.
 */
import type { NivelCalidad } from "@/lib/xr/tipos";
import { PERFILES, type AvatarCalidad } from "@/lib/xr/calidad-perfiles";

export type PreferenciaAvatar = { vrmUrl?: string };
export type AvatarXR = "orbe-manos" | "cabeza-manos" | "vrm";

/** Tope de avatares VRM por escena: la tabla de perfiles manda (§3 d: «Jugadores» por nivel). */
export function topeVrm(nivel: NivelCalidad): number {
    return PERFILES[nivel].jugadoresVisibles;
}

/** La base por nivel: `orbe-manos` y `cabeza-manos` se quedan igual; los VRM* compiten por los huecos. */
function baseDe(nivel: NivelCalidad): AvatarXR {
    const a: AvatarCalidad = PERFILES[nivel].avatar;
    return a === "orbe-manos" ? "orbe-manos" : a === "cabeza-manos" ? "cabeza-manos" : "vrm";
}

/** Sólo https y sin usuario/contraseña en la URL: la Biblioteca es https y las otras formas viajan rellenas. */
export function urlVrmSegura(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && u.username === "" && u.password === "";
    } catch {
        return false;
    }
}

/**
 * Avatar de UNA persona. Sin VRM seguro o sin turno válido (≥ 1) no hay VRM: prudencia,
 * nadie lleva un VRM «por si acaso» y las más cercanas lo ganan por orden, no por llegada.
 */
export function elegirAvatar(nivel: NivelCalidad, preferencia: PreferenciaAvatar | null, jugadoresVisibles: number): AvatarXR {
    const base = baseDe(nivel);
    if (base !== "vrm") return base;
    if (!urlVrmSegura(preferencia?.vrmUrl)) return "cabeza-manos";
    if (!Number.isFinite(jugadoresVisibles)) return "cabeza-manos";
    const turno = Math.floor(jugadoresVisibles);
    if (turno < 1) return "cabeza-manos";
    return turno <= topeVrm(nivel) ? "vrm" : "cabeza-manos";
}

// ───────────────────────────────── Cargar un VRM ─────────────────────────────────

export interface ProgresoVrm { total?: number; loaded?: number }

/** La forma mínima de `GLTFLoader` de three que se usa (inyectable: sin red ni WebGL en pruebas). */
export interface CargadorGltf {
    register?(f: (parser: unknown) => unknown): void;
    load(url: string, alCargar: (gltf: { scene?: unknown }) => void, alProgresar?: (e: ProgresoVrm) => void, alFallar?: (e: unknown) => void): void;
}

export interface HerramientasVrm {
    GLTFLoader: new () => CargadorGltf;
    VRMLoaderPlugin: new (parser: unknown) => unknown;
}

export type ResultadoVrm =
    | { ok: true; escena: unknown }
    | { ok: false; motivo: "url-insegura" | "demasiado-grande" | "sin-escena" | "carga-fallida" };

/** Tope del archivo VRM por calidad de avatar (§1.3 y §3 d del contrato). */
export const TOPES_VRM_MB: { vrm: number; "vrm-ligero": number } = { vrm: 25, "vrm-ligero": 10 };

/** Herramientas reales, importadas perezoso SOLO al cargar (el layout raíz no carga motores pesados). */
async function importarHerramientas(): Promise<HerramientasVrm> {
    const [{ GLTFLoader }, vrm] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("@pixiv/three-vrm")]);
    return {
        GLTFLoader: GLTFLoader as unknown as HerramientasVrm["GLTFLoader"],
        VRMLoaderPlugin: vrm.VRMLoaderPlugin as unknown as HerramientasVrm["VRMLoaderPlugin"],
    };
}

/**
 * Carga un VRM de URL segura. El tamaño manda: si un progreso pasa el tope, no se devuelve la
 * escena aunque el archivo acabara llegando; cualquier fallo cae `{ok:false}` (nunca lanza).
 */
export async function cargarVrm(url: string, herramientas?: HerramientasVrm, opciones: { topeMB?: number } = {}): Promise<ResultadoVrm> {
    if (!urlVrmSegura(url)) return { ok: false, motivo: "url-insegura" };
    const tope = (opciones.topeMB ?? TOPES_VRM_MB.vrm) * 1024 * 1024;
    try {
        const h = herramientas ?? (await importarHerramientas());
        return await new Promise<ResultadoVrm>((resolver) => {
            const loader = new h.GLTFLoader();
            try {
                loader.register?.((parser) => new h.VRMLoaderPlugin(parser));
            } catch {
                /* sin el plugin el glTF cargará igual; el componente decide qué mostrar */
            }
            let exceso = false;
            loader.load(
                url,
                (gltf) => {
                    if (exceso) return resolver({ ok: false, motivo: "demasiado-grande" });
                    if (!gltf.scene) return resolver({ ok: false, motivo: "sin-escena" });
                    resolver({ ok: true, escena: gltf.scene });
                },
                (e) => {
                    if (typeof e.total === "number" && e.total > tope) exceso = true;
                },
                () => resolver({ ok: false, motivo: "carga-fallida" }),
            );
        });
    } catch {
        return { ok: false, motivo: "carga-fallida" };
    }
}
