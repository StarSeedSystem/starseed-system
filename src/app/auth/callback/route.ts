import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { siguienteSeguro } from "@/lib/auth/siguiente-seguro";

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

    if (code) {
        try {
            const supabase = await createClient();
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) return NextResponse.redirect(`${origin}${next}`);
        } catch {
            // caída controlada al login con aviso
        }
    }
    return NextResponse.redirect(`${origin}/login?error=auth-callback`);
}
