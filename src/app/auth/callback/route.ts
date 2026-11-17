import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { procesarCallbackOAuth } from "@/lib/auth/callback-oauth";

// ── Callback de autenticación (Adenda 63) ───────────────────────────────────
// Destino de `emailRedirectTo` (confirmación de correo) y de cualquier flujo
// OAuth/PKCE. Antes NO existía → el enlace de confirmación caía en 404 y el
// alta por correo quedaba rota. Intercambia `?code=` por sesión (cookies) y
// entra directo a la página principal con el último perfil activo, o al
// `?next=` si es una ruta interna segura (`@/lib/auth/siguiente-seguro`).
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next");

    if (code) {
        const supabase = await createClient();
        const resultado = await procesarCallbackOAuth(code, next ?? "/escritorios", (c) =>
            supabase.auth.exchangeCodeForSession(c),
        );
        if (resultado.ok) return NextResponse.redirect(`${origin}${resultado.redirectTo}`);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(resultado.error)}`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth-callback`);
}
