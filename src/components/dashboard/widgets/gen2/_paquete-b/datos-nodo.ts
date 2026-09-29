"use client";
/**
 * Nodo soberano (paquete B · Ola 0929): lo que ESTE dispositivo ofrece a tu red, medido en
 * el propio navegador (sin red): núcleos, memoria, almacenamiento usado/cuota, batería,
 * conexión (tipo, bajada, latencia), GPU y si la app está instalada. Los navegadores no dan el
 * uso de CPU: se muestra la capacidad, no se inventa la carga.
 */

export interface MedidaNodo {
    plataforma: string;
    navegador: string;
    nucleos: number | null;
    memoriaGb: number | null;
    almacenUsadoGb: number | null;
    almacenCuotaGb: number | null;
    bateria: { nivel: number; cargando: boolean } | null;
    conexion: { tipo: string | null; bajadaMbps: number | null; latenciaMs: number | null; ahorro: boolean } | null;
    enLinea: boolean;
    gpu: string | null;
    appInstalada: boolean;
    webgpu: boolean;
}

type Nav = Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void }>;
    gpu?: unknown;
};

/** Plataforma y navegador legibles a partir del userAgent (PURO). */
export function leerAgente(ua: string): { plataforma: string; navegador: string } {
    const plataforma = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Otro";
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
    const nombre = m ? ({ Edg: "Edge", OPR: "Opera", Firefox: "Firefox", Chrome: "Chrome", Version: "Safari" } as Record<string, string>)[m[1]] : "Navegador";
    return { plataforma, navegador: m ? `${nombre} ${m[2]}` : nombre };
}

let gpuEnCache: string | null | undefined;
function leerGpu(): string | null {
    if (gpuEnCache !== undefined) return gpuEnCache;
    gpuEnCache = null;
    try {
        const c = document.createElement("canvas");
        const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
        const ext = gl?.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
        if (gl && ext) gpuEnCache = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "").slice(0, 70) || null;
    } catch { /* sin WebGL */ }
    return gpuEnCache;
}

/** Mide este dispositivo (todo defensivo; nada sale a la red). */
export async function medirNodo(): Promise<MedidaNodo> {
    const nav = navigator as Nav;
    const { plataforma, navegador } = leerAgente(nav.userAgent || "");
    let almacenUsadoGb: number | null = null, almacenCuotaGb: number | null = null;
    try {
        const e = await nav.storage?.estimate?.();
        if (e) { almacenUsadoGb = (e.usage ?? 0) / 1e9; almacenCuotaGb = (e.quota ?? 0) / 1e9 || null; }
    } catch { /* sin estimación */ }
    let bateria: MedidaNodo["bateria"] = null;
    try {
        const b = await nav.getBattery?.();
        if (b) bateria = { nivel: Math.round(b.level * 100), cargando: !!b.charging };
    } catch { /* sin batería */ }
    const c = nav.connection;
    let appInstalada = false;
    try { appInstalada = window.matchMedia?.("(display-mode: standalone)").matches === true; } catch { /* */ }
    return {
        plataforma,
        navegador,
        nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        memoriaGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
        almacenUsadoGb,
        almacenCuotaGb,
        bateria,
        conexion: c ? { tipo: c.effectiveType ?? null, bajadaMbps: typeof c.downlink === "number" ? c.downlink : null, latenciaMs: typeof c.rtt === "number" ? c.rtt : null, ahorro: !!c.saveData } : null,
        enLinea: nav.onLine !== false,
        gpu: leerGpu(),
        appInstalada,
        webgpu: !!nav.gpu,
    };
}

/** Se suscribe a los cambios de batería y conexión (eventos, no sondeo). Devuelve cómo soltarse. */
export function escucharNodo(alCambiar: () => void): () => void {
    const nav = navigator as Nav;
    const sueltas: (() => void)[] = [];
    try {
        nav.connection?.addEventListener?.("change", alCambiar);
        sueltas.push(() => nav.connection?.removeEventListener?.("change", alCambiar));
    } catch { /* */ }
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    sueltas.push(() => { window.removeEventListener("online", alCambiar); window.removeEventListener("offline", alCambiar); });
    let vivo = true;
    nav.getBattery?.().then((b) => {
        if (!vivo) return;
        b.addEventListener?.("levelchange", alCambiar);
        b.addEventListener?.("chargingchange", alCambiar);
        sueltas.push(() => { b.removeEventListener?.("levelchange", alCambiar); b.removeEventListener?.("chargingchange", alCambiar); });
    }).catch(() => { /* sin batería */ });
    return () => { vivo = false; sueltas.forEach((f) => f()); };
}

/** Fracción de almacenamiento usada (0-1) o null. PURO. */
export function usoAlmacen(m: Pick<MedidaNodo, "almacenUsadoGb" | "almacenCuotaGb">): number | null {
    if (m.almacenUsadoGb === null || !m.almacenCuotaGb) return null;
    return Math.max(0, Math.min(1, m.almacenUsadoGb / m.almacenCuotaGb));
}

/** Calidad de la conexión 0-1 a partir de la bajada (≥ 20 Mbps = llena). PURO. */
export function calidadRed(m: Pick<MedidaNodo, "conexion" | "enLinea">): number | null {
    if (!m.enLinea) return 0;
    if (!m.conexion || m.conexion.bajadaMbps === null) return null;
    return Math.max(0, Math.min(1, m.conexion.bajadaMbps / 20));
}

export function gb(v: number | null): string {
    if (v === null) return "—";
    if (v >= 100) return `${Math.round(v)} GB`;
    if (v >= 1) return `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} GB`;
    return `${Math.round(v * 1000)} MB`;
}
