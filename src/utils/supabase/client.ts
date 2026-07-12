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
    );
}

export const createClient = () => {
    if (typeof window === "undefined") return buildClient();
    if (!browserClient) browserClient = buildClient();
    return browserClient;
};
