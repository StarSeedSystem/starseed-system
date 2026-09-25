/**
 * Apps oficiales del ecosistema con repo y web propios (PURO).
 *
 * (2026-09-25) Alex: «las apps de Audiomorphic y de Omnifrecuencias dentro de StarSeed OS
 * deben ser las mismas que las últimas versiones de sus repos oficiales, usando el enlace
 * de su sitio web para las versiones en línea y las opciones instalables para las
 * versiones desde las apps de StarSeed OS instaladas».
 *
 * Por eso aquí NO se fija una versión a mano como verdad: la versión viva se lee del
 * último release de GitHub (ultima-version.ts) y lo de abajo es solo el RESPALDO por si
 * GitHub no contesta (medido el 2026-09-25 con `gh api repos/…/releases/latest`).
 */

import { NATIVE_TAG, nativeInstallerAssets } from "@/lib/version/os-release";

export type SistemaAsset = "android" | "ios" | "macos" | "windows" | "linux";
export type ArquitecturaAsset = "arm64" | "x64" | "universal" | "desconocida";

export interface AssetRelease {
    nombre: string;
    url: string;
    bytes: number;
}

export interface ReleaseOficial {
    tag: string;
    publicado: string;
    url: string;
    assets: AssetRelease[];
}

export interface AppOficial {
    id: string;
    nombre: string;
    /** owner/repo en GitHub. */
    repo: string;
    /** Web oficial: la versión en línea, siempre la última desplegada. */
    web: string;
    /** Permisos que la web necesita dentro del OS (atributo `allow` del iframe). */
    permisos: string;
    /**
     * Qué archivos del release son de ESTA app. Hace falta cuando un mismo release trae
     * varias apps: el de StarSeed OS sube también Nexus y Café (`StarSeed.Nexus_*`,
     * `StarSeed-cafe-*.apk`…), y sin filtro se ofrecería el instalador de otra app.
     */
    soloAssets?: RegExp;
    respaldo: ReleaseOficial;
}

const gh = (repo: string, tag: string, nombre: string) =>
    `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(nombre)}`;

function asset(repo: string, tag: string, nombre: string, mb: number): AssetRelease {
    return { nombre, url: gh(repo, tag, nombre), bytes: Math.round(mb * 1024 * 1024) };
}

const AUDIOMORPHIC_REPO = "StarSeedSystem/Audiomorphic-AR-app";
const OMNI_REPO = "StarSeedSystem/generador_frecuencias";
export const OS_REPO = "StarSeedSystem/starseed-system";

/**
 * Archivos del sistema OS dentro del release compartido: `StarSeed.OS_<v>_…` (Tauri de
 * escritorio), `StarSeed.OS-<v>-1.x86_64.rpm` y `StarSeed-os-<v>.apk`. Los de Nexus y Café
 * (`StarSeed.Nexus_…`, `StarSeed.Cafe_…`, `StarSeed-nexus-…apk`) no casan.
 */
export const PATRON_ASSETS_OS = /^StarSeed(?:\.OS[_-]|-os-)/i;

export const APPS_OFICIALES: Record<string, AppOficial> = {
    // (2026-09-25) Alex: «al seleccionar el botón de instalar para la app de StarSeed OS debe
    // detectar su sistema operativo y abrir la descarga de la versión actualizada desde
    // GitHub». La versión viva sale del último release (ultima-version.ts); el respaldo es la
    // release nativa vigente declarada en os-release.ts (fuente única de NATIVE_VERSION).
    "starseed-os": {
        id: "starseed-os",
        nombre: "StarSeed OS",
        repo: OS_REPO,
        web: "https://starseed-os.vercel.app",
        permisos: "",
        soloAssets: PATRON_ASSETS_OS,
        respaldo: {
            tag: NATIVE_TAG,
            publicado: "",
            url: `https://github.com/${OS_REPO}/releases/tag/${NATIVE_TAG}`,
            assets: nativeInstallerAssets().map((a) => ({ nombre: a.filename, url: a.href, bytes: 0 })),
        },
    },
    audiomorphic: {
        id: "audiomorphic",
        nombre: "Audiomorphic",
        repo: AUDIOMORPHIC_REPO,
        web: "https://audiomorphic.vercel.app",
        permisos: "microphone; camera; xr-spatial-tracking; fullscreen; autoplay; clipboard-write; accelerometer; gyroscope; magnetometer",
        respaldo: {
            tag: "v1.2.0",
            publicado: "2026-09-15T05:24:51Z",
            url: `https://github.com/${AUDIOMORPHIC_REPO}/releases/tag/v1.2.0`,
            assets: [
                asset(AUDIOMORPHIC_REPO, "v1.2.0", "Audiomorphic_v1.2.0.apk", 5.4),
                asset(AUDIOMORPHIC_REPO, "v1.2.0", "Audiomorphic_v1.2.0_macOS_arm64.dmg", 213.2),
                asset(AUDIOMORPHIC_REPO, "v1.2.0", "Audiomorphic_v1.2.0_Windows.zip", 134),
                asset(AUDIOMORPHIC_REPO, "v1.2.0", "Audiomorphic_v1.2.0_Linux_x64.tar.gz", 773.7),
                asset(AUDIOMORPHIC_REPO, "v1.2.0", "Audiomorphic_v1.2.0_Linux_arm64.tar.gz", 693.7),
            ],
        },
    },
    omnifrecuencias: {
        id: "omnifrecuencias",
        nombre: "Omnifrecuencias",
        repo: OMNI_REPO,
        web: "https://omnifrecuencias.vercel.app",
        permisos: "microphone; fullscreen; autoplay; clipboard-write; xr-spatial-tracking",
        respaldo: {
            tag: "v2.0.0",
            publicado: "2026-09-22T19:46:49Z",
            url: `https://github.com/${OMNI_REPO}/releases/tag/v2.0.0`,
            assets: [
                asset(OMNI_REPO, "v2.0.0", "OmniFrequency.apk", 5.9),
                asset(OMNI_REPO, "v2.0.0", "OmniFrequency.dmg", 120.5),
                asset(OMNI_REPO, "v2.0.0", "OmniFrequency-Setup.exe", 195.8),
                asset(OMNI_REPO, "v2.0.0", "OmniFrequency.AppImage", 127.3),
            ],
        },
    },
};

export interface AssetClasificado extends AssetRelease {
    sistema: SistemaAsset;
    arquitectura: ArquitecturaAsset;
    /** Qué es, en palabras: «instalador .dmg», «APK», «AppImage»… */
    formato: string;
    /** Menor = mejor opción para ese sistema (instalador directo antes que zip). */
    prioridad: number;
}

const REGLAS: { re: RegExp; sistema: SistemaAsset; formato: string; prioridad: number }[] = [
    { re: /\.apk$/i, sistema: "android", formato: "APK (Android)", prioridad: 0 },
    { re: /\.ipa$/i, sistema: "ios", formato: "IPA (iOS)", prioridad: 0 },
    { re: /\.dmg$/i, sistema: "macos", formato: "imagen de disco .dmg", prioridad: 0 },
    { re: /mac.*\.zip$|macos.*\.zip$|\.app\.zip$/i, sistema: "macos", formato: "app comprimida .zip", prioridad: 2 },
    { re: /\.msi$/i, sistema: "windows", formato: "paquete .msi", prioridad: 1 },
    { re: /\.exe$/i, sistema: "windows", formato: "instalador .exe", prioridad: 0 },
    { re: /win.*\.zip$/i, sistema: "windows", formato: "carpeta portátil .zip", prioridad: 2 },
    { re: /\.appimage$/i, sistema: "linux", formato: "AppImage", prioridad: 0 },
    { re: /\.deb$/i, sistema: "linux", formato: "paquete .deb", prioridad: 1 },
    { re: /\.rpm$/i, sistema: "linux", formato: "paquete .rpm", prioridad: 1 },
    { re: /linux.*\.tar\.gz$/i, sistema: "linux", formato: "archivo .tar.gz", prioridad: 2 },
];

function arquitecturaDe(nombre: string): ArquitecturaAsset {
    if (/universal/i.test(nombre)) return "universal";
    if (/arm64|aarch64|apple.?silicon/i.test(nombre)) return "arm64";
    if (/x64|x86_64|amd64|intel/i.test(nombre)) return "x64";
    return "desconocida";
}

/** Clasifica un archivo del release por sistema, arquitectura y formato; null si no es instalable. */
export function clasificarAsset(a: AssetRelease): AssetClasificado | null {
    if (/\.(sig|sha256|blockmap|yml|json|txt)$/i.test(a.nombre)) return null;
    const regla = REGLAS.find((r) => r.re.test(a.nombre));
    if (!regla) return null;
    return { ...a, sistema: regla.sistema, arquitectura: arquitecturaDe(a.nombre), formato: regla.formato, prioridad: regla.prioridad };
}

/**
 * Los instalables del release, sin duplicados: por (sistema, arquitectura, formato) se queda
 * el primero cuyo nombre NO lleve «_AR_» (el release de Audiomorphic sube cada archivo
 * dos veces con nombres distintos) y, a igualdad, el de nombre más corto.
 */
export function instalables(assets: readonly AssetRelease[]): AssetClasificado[] {
    const porClave = new Map<string, AssetClasificado>();
    for (const a of assets) {
        const c = clasificarAsset(a);
        if (!c) continue;
        const clave = `${c.sistema}|${c.arquitectura}|${c.formato}`;
        const ya = porClave.get(clave);
        const peor = (x: AssetClasificado) => (/_AR_/i.test(x.nombre) ? 1 : 0) * 1000 + x.nombre.length;
        if (!ya || peor(c) < peor(ya)) porClave.set(clave, c);
    }
    return [...porClave.values()].sort(
        (x, y) => x.sistema.localeCompare(y.sistema) || x.prioridad - y.prioridad || x.nombre.localeCompare(y.nombre),
    );
}

/** Familia de Linux, cuando el navegador la dice (Firefox en Ubuntu escribe «Ubuntu»). */
export type DistroLinux = "debian" | "fedora";

export interface DispositivoParaInstalar {
    sistema: SistemaAsset | "otro";
    arquitectura: ArquitecturaAsset;
    /** Solo en Linux y solo si el userAgent la delata: elige .deb o .rpm en vez de AppImage. */
    distro?: DistroLinux;
}

/**
 * El mejor instalable para un dispositivo: mismo sistema, arquitectura compatible
 * (universal o desconocida valen para cualquiera) y la mejor prioridad de formato.
 * null si el release no trae nada para ese sistema (entonces: la web).
 */
export function mejorInstalable(
    assets: readonly AssetClasificado[],
    d: DispositivoParaInstalar,
): AssetClasificado | null {
    if (d.sistema === "otro") return null;
    const candidatos = assets.filter(
        (a) =>
            a.sistema === d.sistema &&
            (a.arquitectura === "universal" ||
                a.arquitectura === "desconocida" ||
                d.arquitectura === "desconocida" ||
                a.arquitectura === d.arquitectura),
    );
    if (!candidatos.length) return null;
    return [...candidatos].sort((x, y) => {
        const exacta = (a: AssetClasificado) => (a.arquitectura === d.arquitectura ? 0 : 1);
        return exacta(x) - exacta(y) || x.prioridad - y.prioridad || x.bytes - y.bytes;
    })[0];
}

/** Los instalables de una app concreta: aplica su filtro de nombres (`soloAssets`) si lo tiene. */
export function instalablesDeApp(appId: string, assets: readonly AssetRelease[]): AssetClasificado[] {
    const filtro = APPS_OFICIALES[appId]?.soloAssets;
    return instalables(filtro ? assets.filter((a) => filtro.test(a.nombre)) : assets);
}

/** «5,4 MB», «773,7 MB», «1,2 GB». */
export function tamanoLegible(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} GB`;
    return `${mb.toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}

/** Deduce sistema y arquitectura de un userAgent (+ plataforma de UA-CH si se conoce). */
export function dispositivoDesdeUA(ua: string, plataforma = "", arquitecturaUACH = ""): DispositivoParaInstalar {
    const t = `${ua} ${plataforma}`;
    let sistema: DispositivoParaInstalar["sistema"] = "otro";
    if (/android/i.test(t)) sistema = "android";
    else if (/iphone|ipad|ipod/i.test(t)) sistema = "ios";
    else if (/mac os x|macintosh|macos/i.test(t)) sistema = "macos";
    else if (/windows/i.test(t)) sistema = "windows";
    else if (/linux|x11|cros/i.test(t)) sistema = "linux";
    let arquitectura: ArquitecturaAsset = "desconocida";
    if (/arm/i.test(arquitecturaUACH)) arquitectura = "arm64";
    else if (/x86/i.test(arquitecturaUACH)) arquitectura = "x64";
    else if (/aarch64|arm64/i.test(t)) arquitectura = "arm64";
    else if (/x86_64|win64|x64|amd64/i.test(t)) arquitectura = "x64";
    const d: DispositivoParaInstalar = { sistema, arquitectura };
    if (sistema === "linux") {
        if (/ubuntu|debian|linux mint|pop!_os|elementary/i.test(t)) d.distro = "debian";
        else if (/fedora|red hat|centos|rocky|opensuse|suse/i.test(t)) d.distro = "fedora";
    }
    return d;
}

/** Convierte la respuesta de la API de GitHub (releases/latest) en nuestra forma; null si no vale. */
export function releaseDesdeGithub(json: unknown): ReleaseOficial | null {
    if (!json || typeof json !== "object") return null;
    const r = json as Record<string, unknown>;
    if (typeof r.tag_name !== "string" || !Array.isArray(r.assets)) return null;
    const assets: AssetRelease[] = [];
    for (const a of r.assets) {
        if (!a || typeof a !== "object") continue;
        const x = a as Record<string, unknown>;
        if (typeof x.name === "string" && typeof x.browser_download_url === "string") {
            assets.push({ nombre: x.name, url: x.browser_download_url, bytes: Number(x.size) || 0 });
        }
    }
    return {
        tag: r.tag_name,
        publicado: typeof r.published_at === "string" ? r.published_at : "",
        url: typeof r.html_url === "string" ? r.html_url : "",
        assets,
    };
}
