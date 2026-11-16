import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { siguienteSeguro } from "@/lib/auth/siguiente-seguro";
import { resolverCallback } from "@/lib/auth/resultado-callback";

// ── Callback de autenticación (Adenda 63) ───────────────────────────────────
// Destino de `emailRedirectTo` (confirmación de correo) y de cualquier flujo
// OAuth/PKCE. Antes NO existía → el enlace de confirmación caía en 404 y el
// alta por correo quedaba rota. Intercambia `?code=` por sesión (cookies) y
// entra directo a la página principal con el último perfil activo, o al
// `?next=` si es una ruta interna segura (`@/lib/auth/siguiente-seguro`).
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    // (2026-09-28) `next` validado: solo rutas internas (antes `next=@otra.web` convertía
    // `${origin}${next}` en una redirección a otro sitio).
    const next = siguienteSeguro(searchParams.get("next"), "/escritorios");

    let error: { message?: string } | null = null;
    let excepcion: unknown = null;

    if (code) {
        try {
            const supabase = await createClient();
            ({ error } = await supabase.auth.exchangeCodeForSession(code));
        } catch (e) {
            // (2026-11-16) El catch ya no está vacío: se guarda la excepción y `resolverCallback`
            // decide destino y qué contar (red/cuota), sin filtrar el `code` al log.
            excepcion = e;
        }
    }
    const resultado = resolverCallback({ origen: origin, next, codigo: code, error, excepcion });
    if (resultado.errorParaLog) console.error(`[auth/callback] ${resultado.errorParaLog}`);
    return NextResponse.redirect(resultado.destino);
}
