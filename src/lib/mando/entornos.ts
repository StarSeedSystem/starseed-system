// src/lib/mando/entornos.ts
// -----------------------------------------------------------------------------
// Entornos vivos del proyecto (Ola 239 · mando completo en la nube).
//
// Índice de dónde corre StarSeed OS en este momento: desarrollos, producción,
// backend, bases de datos y agentes, con su salud medida en vivo (latencia y
// si responden) y sus enlaces de panel o consola.
//
// ⚠️ Seguridad (innegociable, regla de Alex):
//  • NUNCA se listan claves, tokens, contraseñas ni cadenas de conexión. Solo
//    NOMBRES de variables de entorno (p. ej. `NVIDIA_SHARED_KEY`) y URLs
//    públicas o locales.
//  • Nada de rutas absolutas del disco del usuario en el resultado.
//
// Los lectores de disco viven SOLO en `src/lib/mando/*.ts` (lado servidor).
// Este archivo es lado servidor: `leerEntornos()` se llama desde la ruta
// `GET /api/mando/entornos`.
// -----------------------------------------------------------------------------

/** Tipo de entorno, define su icono y su semántica en el panel. */
export type TipoEntorno =
    | "desarrollo"
    | "produccion"
    | "backend"
    | "base-de-datos"
    | "agente"
    | "nube";

/** Estado de salud de un entorno, tras medirlo en vivo. */
export type EstadoEntorno = "vivo" | "caido" | "sin-comprobar";

/** Un entorno del proyecto, con su salud y sus accesos seguros. */
export interface Entorno {
    id: string;
    nombre: string;
    tipo: TipoEntorno;
    /** URL pública o local a comprobar. Sin url → «sin-comprobar». */
    url?: string;
    /** Enlace al panel o consola (Vercel, Supabase, Cloud Run…). */
    enlacePanel?: string;
    /** Nombres de variables de entorno implicadas (jamás el valor). */
    variables: string[];
    estado: EstadoEntorno;
    /** Milisegundos de la última comprobación con respuesta. */
    latenciaMs?: number;
    nota: string;
}

/** Entornos del proyecto declarados de forma estática (URLs seguras, sin claves). */
const ENTORNOS_PLANTILLA: Omit<Entorno, "estado" | "latenciaMs">[] = [
    {
        id: "desarrollo-local",
        nombre: "StarSeed OS local",
        tipo: "desarrollo",
        url: "http://localhost:9002",
        variables: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        nota: "Next.js corriendo en la máquina de desarrollo.",
    },
    {
        id: "produccion-vercel",
        nombre: "StarSeed OS (Vercel)",
        tipo: "produccion",
        url: "https://starseed-os.vercel.app",
        enlacePanel: "https://vercel.com/starseeds-projects",
        variables: [
            "ASTRAURA_CLOUD_URL",
            "NVIDIA_SHARED_KEY",
            "OPENROUTER_SHARED_KEY",
        ],
        nota: "Despliegue oficial con auto-deploy desde GitHub.",
    },
    {
        id: "backend-astraura",
        nombre: "Astraura 1.58-bit (Cloud Run)",
        tipo: "backend",
        url: "https://astraura-nube-334237619848.us-central1.run.app",
        variables: [],
        nota: "Backend soberano BitNet 1.58. Cold start ~2,4 s.",
    },
    {
        id: "nube-ligera",
        nombre: "Astraura nube ligera (Vercel)",
        tipo: "nube",
        url: "https://astraura-nube.vercel.app",
        variables: [],
        nota: "Nube ligera del OS.",
    },
    {
        id: "supabase-os",
        nombre: "Supabase del OS",
        tipo: "base-de-datos",
        enlacePanel: "https://supabase.com/dashboard/project/pqzdpmedcsgcedkvndzl",
        variables: ["SUPABASE_SERVICE_ROLE_KEY"],
        nota:
            "Proyecto pqzdpmedcsgcedkvndzl; tablas relevo_eventos, os_*, user_settings.",
    },
    {
        id: "agente-hermes",
        nombre: "Hermes (local)",
        tipo: "agente",
        url: "http://127.0.0.1:4444",
        variables: [],
        nota:
            "Sesiones en ~/.hermes/state.db; Dream diario 07:00; Telegram hermes-telegram.",
    },
    {
        id: "agente-voz",
        nombre: "Daemon de voz OmniVoice",
        tipo: "agente",
        url: "http://127.0.0.1:4500",
        variables: [],
        nota: "Voz StarSeed, 24 kHz.",
    },
    {
        id: "nube-cowork",
        nombre: "Contenedor de Cowork (enjambre en la nube)",
        tipo: "nube",
        variables: [],
        nota:
            "Agentes corriendo fuera de la Mac; sincronía por paquetes git en .transfer/.",
    },
];

/** Comprueba una URL con HEAD (o GET si HEAD no se admite). */
async function comprobarUrl(
    url: string,
    timeoutMs: number,
): Promise<{ estado: EstadoEntorno; latenciaMs?: number; _errorValor?: number }> {
    const controles = { signal: AbortSignal.timeout(timeoutMs) };
    const inicio = Date.now();

    const medir = async (metodo: "HEAD" | "GET"): Promise<{ ok: boolean; status: number }> => {
        try {
            const respuesta = await fetch(url, { method: metodo, ...controles });
            return { ok: respuesta.status < 500, status: respuesta.status };
        } catch {
            return { ok: false, status: 0 };
        }
    };

    // HEAD primero; si da error de método o red, se reintenta con GET.
    const head = await medir("HEAD");
    let ok = head.ok;
    let status = head.status;

    if (!head.ok && head.status === 0) {
        // HEAD no respondió (red o método no permitido): reintentar con GET.
        const get = await medir("GET");
        ok = get.ok;
        status = get.status;
    } else if (head.status >= 500) {
        // El servidor contestó con un 5xx: no hace falta reintentar.
        ok = false;
    }

    const latenciaMs = Date.now() - inicio;

    // Un 401/403/404 cuenta como «vivo»: el servidor está, solo niega ese método.
    const vivo = ok || status === 401 || status === 403 || status === 404;
    return { estado: vivo ? "vivo" : "caido", latenciaMs: vivo ? latenciaMs : undefined };
}

/**
 * Lee los entornos del proyecto y mide su salud en vivo, EN PARALELO.
 *
 * Cada entorno con `url` se comprueba con un `fetch` de HEAD (o GET si HEAD
 * falla) con un timeout de 6 s. Los entornos sin URL quedan «sin-comprobar».
 * El resultado es seguro: solo URLs públicas/locales y nombres de variables.
 */
export async function leerEntornos(): Promise<Entorno[]> {
    const resultados = await Promise.all(
        ENTORNOS_PLANTILLA.map(async (plantilla) => {
            if (!plantilla.url) {
                return { ...plantilla, estado: "sin-comprobar" as EstadoEntorno };
            }
            const salud = await comprobarUrl(plantilla.url, 6000);
            return {
                ...plantilla,
                estado: salud.estado,
                latenciaMs: salud.latenciaMs,
            };
        }),
    );

    return resultados;
}