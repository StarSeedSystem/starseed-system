import { createBrowserClient } from "@supabase/ssr";

// Advertencia única (por sesión de navegador) si faltan las envs públicas de
// Supabase: sin ellas, TODAS las llamadas (auth/rest/storage/realtime) fallan
// silenciosamente contra un host que no existe. Antes esto se degradaba sin
// ningún aviso; ahora se loguea una vez para que el fallo sea diagnosticable.
let warnedMissingEnv = false;

export const createClient = () => {
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
};
