import { createBrowserClient } from "@supabase/ssr";

// Advertencia única (por sesión de navegador) si faltan las envs públicas de
// Supabase: sin ellas, TODAS las llamadas (auth/rest/storage/realtime) fallan
// silenciosamente contra un host que no existe. Antes esto se degradaba sin
// ningún aviso; ahora se loguea una vez para que el fallo sea diagnosticable.
let warnedMissingEnv = false;

// ── Singleton del cliente en navegador (Adenda 63) ──────────────────────────
// Antes, CADA llamada a createClient() creaba un GoTrueClient nuevo sobre el
// mismo storage (auth-form, session-resume, settings-sync, auth-gate, hooks…).
// Varias instancias compiten por el refresh del token y pueden invalidarse la
// sesión entre sí de forma intermitente → "al recargar se cierra la sesión".
// Una única instancia por pestaña elimina esa carrera. En SSR se devuelve una
// instancia efímera por llamada (no compartir estado entre peticiones).
// NOTA de tipos: `ReturnType<typeof createBrowserClient>` NO sirve aquí —
// `createBrowserClient` es genérico (<Database = any, SchemaName…>) y su
// ReturnType colapsa a `any`, contagiando `any` a TODO consumidor de
// `createClient()` (auth, canales realtime, queries…). Derivamos el tipo del
// helper NO genérico `buildClient` para conservar los tipos de Supabase.
type BrowserSupabaseClient = ReturnType<typeof buildClient>;

let browserClient: BrowserSupabaseClient | null = null;

function buildClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if ((!url || !anonKey) && !warnedMissingEnv) {
        warnedMissingEnv = true;
        // eslint-disable-next-line no-console
        console.warn(
            "[Supabase] Faltan NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY en este entorno. " +
                "Usando un host de relleno (dummy.supabase.co): toda llamada a Supabase (auth/datos/almacenamiento/tiempo real) fallará. " +
                "Configura ambas variables en el entorno de despliegue (p. ej. Vercel → Project Settings → Environment Variables) y vuelve a desplegar.",
        );
    }
    return createBrowserClient(
        url || "https://dummy.supabase.co",
        anonKey || "dummy-anon-key",
        { auth: { lock: cerrojoEnProceso } },
    );
}

// ── (Adenda 202) El AbortError de los Web Locks de Supabase ────────────────
// Síntoma: overlay de Next con «Runtime AbortError · Lock broken by another
// request with the 'steal' option».
// Causa: el cliente de auth de Supabase coordina el refresco del token entre
// pestañas con `navigator.locks`. Cuando hay DOS pestañas del OS abiertas en el
// mismo origen, la que se inicializa después ROBA el lock (`steal: true`) y la
// primera recibe un AbortError. Es el comportamiento previsto de la librería:
// nada se rompe, la sesión sigue viva y el refresco lo hace la otra pestaña.
// Pero llega como promesa rechazada sin dueño y Next lo pinta como error fatal,
// que alarma sin motivo y tapa errores de verdad.
// Por eso silenciamos EXACTAMENTE ese rechazo, y ningún otro.
// El cliente de auth de Supabase serializa el refresco del token con
// `navigator.locks`. Ese lock es de ORIGEN, no de pestaña: al abrir una segunda
// pestaña del OS, la nueva instancia ROBA el lock (`steal: true`) y la primera
// recibe el AbortError. Cambiamos ese cerrojo por uno EN PROCESO —una cola de
// promesas por nombre dentro de esta pestaña—: sigue impidiendo que dos
// refrescos de ESTA pestaña se pisen, que es la carrera que importa, y ninguna
// pestaña puede ya romperle el cerrojo a otra.
const colasDeCerrojo = new Map<string, Promise<unknown>>();

function cerrojoEnProceso<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    const anterior = colasDeCerrojo.get(name) ?? Promise.resolve();
    // `catch` para que un fallo anterior no bloquee la cola para siempre.
    const turno = anterior.catch(() => undefined).then(fn);
    colasDeCerrojo.set(name, turno.catch(() => undefined));
    return turno;
}

// Cinturón adicional: si algo del propio Supabase aún emite ese AbortError, no
// debe pintarse como error fatal de la app. En fase de CAPTURA para llegar
// antes que el overlay de Next, y solo para ESE mensaje.
let lockGuardInstalled = false;
function installLockGuard() {
    if (lockGuardInstalled || typeof window === "undefined") return;
    lockGuardInstalled = true;
    window.addEventListener(
        "unhandledrejection",
        (e) => {
            const r = e?.reason as { name?: string; message?: string } | undefined;
            const msg = String(r?.message ?? r ?? "");
            if (r?.name === "AbortError" && msg.includes("Lock broken by another request")) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        },
        true,
    );
}

export const createClient = () => {
    installLockGuard();
    if (typeof window === "undefined") return buildClient();
    if (!browserClient) browserClient = buildClient();
    return browserClient;
};
