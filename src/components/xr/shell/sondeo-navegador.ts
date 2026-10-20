/**
 * StarSeed XR · SONDEO DEL NAVEGADOR (XR1010Bc). Contrato: `architecture/starseed-xr.md` §3 (c).
 * Convierte lo que el navegador DICE (UA, https, `navigator.xr`, táctil, WebGL2/WebGPU, app instalada) en el
 * `DatosNavegador` del núcleo `src/lib/xr/capacidades.ts`. Sin React. Nunca lanza y nunca llama a
 * `requestSession` (no dispara permisos ni pide `camera-access`).
 */
import { plataformaDeDatos, type DatosNavegador } from "@/lib/xr/capacidades";
import { PLATAFORMAS_VISOR } from "@/lib/xr/tipos";
import { isRunningStandalone } from "@/lib/install/device-install";

/** Lo que se espera a `isSessionSupported` antes de decir «el navegador no contesta» (→ `null`). */
export const TOPE_SONDEO_MS = 1500;

export interface XRInyectable {
    isSessionSupported(modo: string): Promise<boolean>;
    offerSession?: unknown; // extensión no estándar: se detecta por la FUNCIÓN, nunca por la marca del aparato
    addEventListener?(tipo: string, fn: () => void): void;
    removeEventListener?(tipo: string, fn: () => void): void;
}

/** Lo mínimo del navegador, inyectable para probar sin visor, sin WebGL y sin red. */
export interface EntornoNavegador {
    ua: string;
    seguro: boolean;
    xr?: XRInyectable;
    maxTouchPoints: number;
    webgl2: () => boolean;
    webgpu: boolean;
    standalone: boolean;
    digitalGoods: boolean;
}

/** Sin sondear: todo falso y `vr`/`ar` en `null` («aún sin comprobar»). Congelado: se devuelven COPIAS. */
export const DATOS_SIN_SONDEO: Readonly<DatosNavegador> = Object.freeze({
    ua: "", seguro: false, tieneXR: false, vr: null, ar: null, ofreceSesion: false,
    tactil: false, webgl2: false, webgpu: false, instalada: false,
});

function intentar<T>(f: () => T, defecto: T): T {
    try { return f(); } catch { return defecto; }
}

/** `false` si rechaza o lanza (la otra consulta sigue); `null` si no contesta en `TOPE_SONDEO_MS`. El reloj siempre se limpia. */
async function preguntar(xr: XRInyectable, modo: string): Promise<boolean | null> {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const tope = new Promise<null>((fin) => { reloj = setTimeout(() => fin(null), TOPE_SONDEO_MS); });
    const respuesta = Promise.resolve().then(() => xr.isSessionSupported(modo)).then((v) => v === true, () => false);
    try { return await Promise.race([respuesta, tope]); } finally { clearTimeout(reloj); }
}

export async function sondearNavegador(entorno?: EntornoNavegador): Promise<DatosNavegador> {
    if (!entorno && typeof window === "undefined") return { ...DATOS_SIN_SONDEO };
    const e = entorno ?? entornoReal();
    const xr = intentar(() => e.xr, undefined);
    const tieneXR = intentar(() => !!xr && typeof xr.isSessionSupported === "function", false);
    // Sin `navigator.xr` ya se comprobó que no hay VR ni AR: `false`, no `null` (el núcleo diría «comprobando» siempre).
    let vr: boolean | null = false, ar: boolean | null = false;
    if (xr && tieneXR) [vr, ar] = await Promise.all([preguntar(xr, "immersive-vr"), preguntar(xr, "immersive-ar")]);
    return {
        ua: intentar(() => (typeof e.ua === "string" ? e.ua : ""), ""),
        seguro: intentar(() => e.seguro === true, false),
        tieneXR, vr, ar,
        ofreceSesion: intentar(() => !!xr && typeof xr.offerSession === "function", false),
        tactil: intentar(() => e.maxTouchPoints > 1, false),
        webgl2: intentar(() => e.webgl2() === true, false),
        webgpu: intentar(() => e.webgpu === true, false),
        instalada: intentar(() => e.standalone === true || e.digitalGoods === true, false),
    };
}

let hayWebgl2Memo: boolean | undefined;
export function _olvidarWebgl2(): void { hayWebgl2Memo = undefined; } // solo para pruebas

/** WebGL2 se pregunta UNA vez por carga (Chrome admite ~16 contextos vivos) y el contexto se suelta enseguida. */
function hayWebgl2(): boolean {
    if (hayWebgl2Memo !== undefined) return hayWebgl2Memo;
    hayWebgl2Memo = intentar(() => {
        if (typeof WebGL2RenderingContext === "undefined" || typeof document === "undefined") return false;
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return false;
        gl.getExtension("WEBGL_lose_context")?.loseContext(); // sin leer WEBGL_debug_renderer_info: es huella del GPU
        return true;
    }, false);
    return hayWebgl2Memo;
}

function xrReal(): XRInyectable | undefined {
    if (typeof window === "undefined" || typeof navigator === "undefined") return undefined;
    return intentar(() => (navigator as Navigator & { xr?: XRInyectable }).xr ?? undefined, undefined);
}

/** El entorno de verdad. Cada lectura va aparte: un navegador raro pierde esa señal, no todas. */
export function entornoReal(): EntornoNavegador {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
        return { ua: "", seguro: false, maxTouchPoints: 0, webgl2: () => false, webgpu: false, standalone: false, digitalGoods: false };
    }
    return {
        ua: intentar(() => navigator.userAgent ?? "", ""),
        seguro: intentar(() => window.isSecureContext === true, false),
        xr: xrReal(),
        maxTouchPoints: intentar(() => Number(navigator.maxTouchPoints) || 0, 0),
        webgl2: hayWebgl2,
        webgpu: intentar(() => "gpu" in navigator, false),
        standalone: isRunningStandalone(),
        // Meta lo recomienda para reconocer su PWA en Quest. Solo se DETECTA: nunca se llama.
        digitalGoods: intentar(() => typeof (window as Window & { getDigitalGoodsService?: unknown }).getDigitalGoodsService !== "undefined", false),
    };
}

/** Avisa cuando se enchufa o se quita un visor (`devicechange`, p. ej. SteamVR que arranca tarde). Devuelve «dejar de escuchar». */
export function escucharDispositivosXR(alCambiar: () => void, xr: XRInyectable | undefined = xrReal()): () => void {
    if (!xr || typeof xr.addEventListener !== "function") return () => {};
    try { xr.addEventListener("devicechange", alCambiar); } catch { return () => {}; }
    return () => { intentar(() => xr.removeEventListener?.("devicechange", alCambiar), undefined); };
}

/** ¿El UA dice que es un visor (Quest, Pico, Magic Leap…)? Límite honesto: Vision Pro se anuncia como Mac y Android XR como Android; solo la sonda async los confirma. */
export function esVisorPorUA(ua: string): boolean {
    return PLATAFORMAS_VISOR.includes(plataformaDeDatos({ ...DATOS_SIN_SONDEO, ua }));
}
