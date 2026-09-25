/**
 * «Instalar StarSeed OS» con un toque — la parte PURA (sin navegador).
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-09-25) Alex: «al seleccionar el botón de instalar para la app de StarSeed OS
 * debe detectar cuál es su sistema operativo desde donde se está instalando y se debe
 * automáticamente abrir el enlace de descarga de la versión correspondiente actualizada
 * desde el enlace de GitHub donde vamos a subir las versiones de cada sistema operativo».
 *
 * Aquí vive TODA la decisión, para que cada botón de instalar del OS (Biblioteca, franja,
 * /instalar, bienvenida, diálogo de la ficha…) haga exactamente lo mismo y pueda probarse
 * sin navegador:
 *
 *   1. Del release (el último de GitHub, o el respaldo de os-release.ts) se quedan SOLO
 *      los archivos del OS: el mismo release trae Nexus y Café.
 *   2. Se elige el mejor archivo para el sistema y la arquitectura de este dispositivo:
 *      macOS → .dmg universal · Windows → .exe (luego .msi) · Linux → AppImage, o .deb en
 *      Debian/Ubuntu y .rpm en Fedora si el navegador lo dice · Android → .apk.
 *   3. iPhone/iPad no tiene app nativa: se instala la web (Safari → Compartir → Añadir a
 *      pantalla de inicio). Lo mismo si no hay archivo para ese sistema o procesador.
 *
 * La parte que toca el navegador (lanzar la descarga, el diálogo de la app web) está en
 * `instalar-os.ts`.
 */

import {
    instalables,
    PATRON_ASSETS_OS,
    OS_REPO,
    type AssetClasificado,
    type AssetRelease,
    type DispositivoParaInstalar,
    type ReleaseOficial,
    type SistemaAsset,
    mejorInstalable,
    instalablesDeApp,
} from "@/lib/apps-oficiales/apps-oficiales";

/** Id de StarSeed OS en APPS_OFICIALES (y en la Biblioteca). */
export const OS_APP_ID = "starseed-os";

/** «Otros sistemas y versiones»: la página del último release, con todos los archivos. */
export const OS_RELEASES_ULTIMA_URL = `https://github.com/${OS_REPO}/releases/latest`;

/** ¿Este archivo del release es de StarSeed OS (y no de Nexus o Café)? */
export function esAssetDelOS(nombre: string): boolean {
    return PATRON_ASSETS_OS.test(nombre);
}

/** Los instalables del OS de un release, ya sin los de Nexus/Café ni firmas o manifiestos. */
export function instalablesDelOS(assets: readonly AssetRelease[]): AssetClasificado[] {
    return instalables(assets.filter((a) => esAssetDelOS(a.nombre)));
}

export const SISTEMA_LEGIBLE: Record<DispositivoParaInstalar["sistema"], string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
    android: "Android",
    ios: "iPhone o iPad",
    otro: "este sistema",
};

type TipoArchivo = "dmg" | "exe" | "msi" | "appimage" | "deb" | "rpm" | "apk" | "otro";

function tipoDe(nombre: string): TipoArchivo {
    const n = nombre.toLowerCase();
    if (n.endsWith(".dmg")) return "dmg";
    if (n.endsWith(".exe")) return "exe";
    if (n.endsWith(".msi")) return "msi";
    if (n.endsWith(".appimage")) return "appimage";
    if (n.endsWith(".deb")) return "deb";
    if (n.endsWith(".rpm")) return "rpm";
    if (n.endsWith(".apk")) return "apk";
    return "otro";
}

/** Orden de preferencia por sistema (primero = mejor). */
function ordenPara(d: DispositivoParaInstalar): TipoArchivo[] {
    switch (d.sistema) {
        case "macos":
            return ["dmg"];
        case "windows":
            return ["exe", "msi"];
        case "linux":
            if (d.distro === "debian") return ["deb", "appimage", "rpm"];
            if (d.distro === "fedora") return ["rpm", "appimage", "deb"];
            return ["appimage", "deb", "rpm"];
        case "android":
            return ["apk"];
        default:
            return [];
    }
}

/**
 * ¿Sirve un archivo de esta arquitectura en este dispositivo? El universal y el de
 * arquitectura desconocida valen siempre; si el navegador no dice la arquitectura, se
 * acepta (casi todos los equipos son x64 o Mac universal). Windows en ARM ejecuta los
 * programas x64 por emulación, así que también se acepta.
 */
function arquitecturaCompatible(a: AssetClasificado, d: DispositivoParaInstalar): boolean {
    if (a.arquitectura === "universal" || a.arquitectura === "desconocida") return true;
    if (d.arquitectura === "desconocida" || d.arquitectura === a.arquitectura) return true;
    return d.sistema === "windows" && d.arquitectura === "arm64" && a.arquitectura === "x64";
}

/**
 * El mejor instalador del OS para este dispositivo, o null si no hay (iPhone/iPad, un
 * sistema desconocido o un procesador sin compilación, como Linux ARM).
 */
export function elegirInstaladorOS(assets: readonly AssetRelease[], d: DispositivoParaInstalar): AssetClasificado | null {
    if (d.sistema === "otro" || d.sistema === "ios") return null;
    const orden = ordenPara(d);
    const candidatos = instalablesDelOS(assets).filter(
        (a) => a.sistema === d.sistema && orden.includes(tipoDe(a.nombre)) && arquitecturaCompatible(a, d),
    );
    if (!candidatos.length) return null;
    const exacta = (a: AssetClasificado) => (a.arquitectura === d.arquitectura || a.arquitectura === "universal" ? 0 : 1);
    return [...candidatos].sort(
        (x, y) => orden.indexOf(tipoDe(x.nombre)) - orden.indexOf(tipoDe(y.nombre)) || exacta(x) - exacta(y) || x.nombre.localeCompare(y.nombre),
    )[0];
}

/**
 * El instalador para una app oficial cualquiera: para el OS, la elección de arriba (filtro
 * de Nexus/Café, .deb/.rpm según la distribución); para las demás, la de siempre.
 */
export function instalableParaApp(
    oficialId: string | undefined,
    release: ReleaseOficial | null,
    d: DispositivoParaInstalar,
): AssetClasificado | null {
    if (!oficialId || !release) return null;
    if (oficialId === OS_APP_ID) return elegirInstaladorOS(release.assets, d);
    return mejorInstalable(instalablesDeApp(oficialId, release.assets), d);
}

/** Una línea, en palabras llanas, de cómo abrir el archivo descargado en ese sistema. */
export function instruccionesAbrir(nombre: string): string {
    switch (tipoDe(nombre)) {
        case "dmg":
            return "Abre el archivo .dmg y arrastra StarSeed OS a la carpeta Aplicaciones. La primera vez, haz clic derecho sobre la app y elige «Abrir»: macOS lo pide porque la app aún no está firmada por Apple.";
        case "exe":
        case "msi":
            return "Abre el instalador descargado. Si Windows avisa de que «protegió tu PC», pulsa «Más información» y luego «Ejecutar de todas formas».";
        case "appimage":
            return "En las propiedades del archivo, marca «Permitir ejecutar como programa» y ábrelo con doble clic. No hace falta instalar nada más.";
        case "deb":
            return "Ábrelo con doble clic: se instala con el instalador de programas de tu sistema (en Ubuntu, «Centro de aplicaciones»).";
        case "rpm":
            return "Ábrelo con doble clic: se instala con el instalador de programas de tu sistema (en Fedora, «Software»).";
        case "apk":
            return "Abre el archivo descargado. Si Android lo pide, permite que tu navegador «instale apps desconocidas» y pulsa «Instalar».";
        default:
            return "Abre el archivo descargado para instalar StarSeed OS.";
    }
}

/** Pasos para instalar la web como app en iPhone/iPad (Safari no tiene diálogo automático). */
export const PASOS_IOS: readonly string[] = [
    "Abre esta página en Safari.",
    "Pulsa el botón Compartir (el cuadrado con una flecha hacia arriba).",
    "Elige «Añadir a pantalla de inicio» y confirma con «Añadir».",
];

/** Pasos para instalar la web como app en un navegador de escritorio o Android. */
export const PASOS_WEB: readonly string[] = [
    "Abre el menú de tu navegador (los tres puntos o las tres rayas).",
    "Elige «Instalar StarSeed OS» o «Añadir a pantalla de inicio».",
    "Confirma: aparecerá como una app más, con su propio icono.",
];

export interface EntradaPlanOS {
    release: ReleaseOficial | null;
    /** De dónde salió el release: GitHub al momento, la caché o el respaldo escrito a mano. */
    origen: "github" | "cache" | "respaldo";
    dispositivo: DispositivoParaInstalar;
    /** Dentro de la app nativa (Tauri). */
    esNativa: boolean;
    /** Abierta como app web instalada (display-mode: standalone). */
    esStandalone: boolean;
    /** El navegador ofrece su diálogo de «instalar app» (beforeinstallprompt). */
    puedePwa: boolean;
}

interface PlanBase {
    titulo: string;
    detalle: string;
    /** Siempre: la página con todos los sistemas y versiones. */
    otrosUrl: string;
}

export type PlanInstalarOS =
    | (PlanBase & { tipo: "ya-instalada" })
    | (PlanBase & {
          tipo: "descargar";
          asset: AssetClasificado;
          /** «v0.2.0». */
          version: string;
          /** Cómo abrir el archivo en ese sistema. */
          instrucciones: string;
          /** Aviso honesto (arquitectura emulada, versión sin conexión…) o null. */
          nota: string | null;
          /** Texto del botón: «Descargar para macOS». */
          accion: string;
      })
    | (PlanBase & {
          tipo: "web";
          /** Pasos a mano (Safari en iPhone/iPad, menú del navegador en otros). */
          pasos: readonly string[];
          /** Hay diálogo nativo de instalar la web: el botón lo lanza. */
          usarPwa: boolean;
          accion: string;
      });

function tagLegible(tag: string): string {
    return tag.startsWith("v") ? tag : `v${tag}`;
}

/** Decide qué hace el botón «Instalar StarSeed OS» en este dispositivo. Nunca lanza. */
export function planInstalarOS(e: EntradaPlanOS): PlanInstalarOS {
    const otrosUrl = OS_RELEASES_ULTIMA_URL;
    const sistema = SISTEMA_LEGIBLE[e.dispositivo.sistema] ?? SISTEMA_LEGIBLE.otro;

    if (e.esNativa) {
        return {
            tipo: "ya-instalada",
            titulo: "Ya estás en la app de StarSeed OS",
            detalle: "Esta app se actualiza sola desde GitHub cuando sale una versión nueva.",
            otrosUrl,
        };
    }

    if (e.dispositivo.sistema === "ios") {
        if (e.esStandalone) {
            return {
                tipo: "ya-instalada",
                titulo: "StarSeed OS ya está en tu pantalla de inicio",
                detalle: "La usas como app web instalada: se actualiza sola cada vez que la abres.",
                otrosUrl,
            };
        }
        return {
            tipo: "web",
            titulo: "Instálala desde Safari",
            detalle: "En iPhone y iPad todavía no hay app nativa: se instala la versión web, que funciona como una app más y siempre está al día.",
            pasos: PASOS_IOS,
            usarPwa: false,
            accion: "Añadir a pantalla de inicio",
            otrosUrl,
        };
    }

    const asset = e.release ? elegirInstaladorOS(e.release.assets, e.dispositivo) : null;
    if (asset && e.release) {
        const version = tagLegible(e.release.tag);
        const notas: string[] = [];
        if (e.dispositivo.sistema === "windows" && e.dispositivo.arquitectura === "arm64" && asset.arquitectura === "x64") {
            notas.push("Es la versión x64: Windows en ARM la ejecuta por emulación.");
        }
        if (e.origen === "respaldo") {
            notas.push("No se pudo consultar GitHub ahora mismo: es la última versión conocida.");
        }
        return {
            tipo: "descargar",
            titulo: `StarSeed OS ${version} para ${sistema}`,
            detalle: e.esStandalone
                ? "Ya la usas como app web; la app nativa añade acceso profundo al dispositivo y se actualiza sola."
                : `${asset.formato[0].toUpperCase()}${asset.formato.slice(1)} · ${asset.nombre}`,
            asset,
            version,
            instrucciones: instruccionesAbrir(asset.nombre),
            nota: notas.length ? notas.join(" ") : null,
            accion: `Descargar para ${sistema}`,
            otrosUrl,
        };
    }

    const sinArchivo =
        e.dispositivo.sistema === "otro"
            ? "No reconocemos este sistema: instala la versión web, o elige tu archivo en «Otros sistemas y versiones»."
            : `Aún no hay app nativa para ${sistema}${e.dispositivo.arquitectura === "arm64" ? " con procesador ARM" : ""}: instala la versión web, que funciona como una app más.`;
    return {
        tipo: "web",
        titulo: "Instala la versión web",
        detalle: sinArchivo,
        pasos: PASOS_WEB,
        usarPwa: e.puedePwa && !e.esStandalone,
        accion: e.puedePwa && !e.esStandalone ? "Instalar como app web" : "Instalar StarSeed OS",
        otrosUrl,
    };
}

export interface InstaladoresDeSistema {
    sistema: SistemaAsset;
    etiqueta: string;
    /** Todos los archivos del OS para ese sistema, el recomendado primero. */
    archivos: AssetClasificado[];
}

/** Para «Otros sistemas y versiones»: los archivos del OS agrupados por sistema. */
export function instaladoresPorSistema(release: ReleaseOficial | null): InstaladoresDeSistema[] {
    if (!release) return [];
    const todos = instalablesDelOS(release.assets);
    const sistemas: SistemaAsset[] = ["macos", "windows", "linux", "android"];
    return sistemas
        .map((sistema) => {
            const orden = ordenPara({ sistema, arquitectura: "desconocida" });
            const archivos = todos
                .filter((a) => a.sistema === sistema)
                .sort((x, y) => orden.indexOf(tipoDe(x.nombre)) - orden.indexOf(tipoDe(y.nombre)) || x.nombre.localeCompare(y.nombre));
            return { sistema, etiqueta: SISTEMA_LEGIBLE[sistema], archivos };
        })
        .filter((g) => g.archivos.length > 0);
}
