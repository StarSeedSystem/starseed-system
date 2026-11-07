import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { esFalloDeRed } from "@/lib/nativa/sin-conexion";

// (APP1107A) En el servidor local de la app nativa (STARSEED_SERVIDOR_LOCAL=1, lo pone la app) no
// hay que esperar a internet en cada página: la renovación de sesión tiene un tope de 2,5 s y un
// fallo de RED no se toma por «no hay sesión» (sin internet no se echa a nadie a /login). En la web
// publicada no cambia nada. Contrato: architecture/apps-autonomas-sin-internet.md.
const EN_SERVIDOR_LOCAL = process.env.STARSEED_SERVIDOR_LOCAL === "1";
const TOPE_RED_LOCAL_MS = 2500;

function fetchConTope(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), TOPE_RED_LOCAL_MS);
    if (init?.signal) init.signal.addEventListener("abort", () => corte.abort(), { once: true });
    return fetch(entrada, { ...init, signal: corte.signal }).finally(() => clearTimeout(t));
}

export const updateSession = async (request: NextRequest) => {
    try {
        // Create an unmodified response
        let response = NextResponse.next({
            request: {
                headers: request.headers,
            },
        });

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key",
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            request.cookies.set(name, value);
                        });
                        response = NextResponse.next({
                            request,
                        });
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
                ...(EN_SERVIDOR_LOCAL ? { global: { fetch: fetchConTope } } : {}),
            },
        );

        // This will refresh session if expired - required for Server Components
        // https://supabase.com/docs/guides/auth/server-side/nextjs
        const {
            data: { user },
            error: errorSesion,
        } = await supabase.auth.getUser();
        // Sin internet en la app nativa, un fallo de red no es «sin sesión».
        const sinRedLocal = EN_SERVIDOR_LOCAL && esFalloDeRed(errorSesion);

        // Protected routes logic
        if (request.nextUrl.pathname.startsWith("/dashboard") && !user && !sinRedLocal) {
            return NextResponse.redirect(new URL("/login", request.url));
        }

        if (request.nextUrl.pathname === "/" && !user) {
            // Optional: Redirect root to login or keep as landing page
            // return NextResponse.redirect(new URL("/login", request.url));
        }

        return response;
    } catch (e) {
        // If you are here, a Supabase client could not be created!
        // This is likely because you have not set up environment variables.
        // Check out http://localhost:3000 for Next Steps.
        return NextResponse.next({
            request: {
                headers: request.headers,
            },
        });
    }
};
