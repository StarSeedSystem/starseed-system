import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/auth/otp/verify
 * ────────────────────────────
 * (Adenda 71-bis · 2026-07-17) Valida el código de 6 dígitos que el OS entregó
 * en la bandeja de correos/notificaciones del usuario, y SI es válido crea la
 * sesión de Supabase en el servidor usando auth.admin (service_role) + canje de
 * magiclink al instante. Devuelve { session } para que el cliente haga
 * setSession. El código nunca viaja por email externo.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = (await req.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
    };
    if (!email || !code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Email o código inválidos." }, { status: 400 });
    }

    const sb = await createClient(); // service_role (server)

    // Buscar el correo OTP del usuario en ss_mail (no expirado, 10 min).
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: mails, error: mErr } = await sb
      .from("ss_mail")
      .select("id, body, created_at, to_address")
      .eq("to_address", email)
      .order("created_at", { ascending: false })
      .limit(5);

    if (mErr) {
      return NextResponse.json({ error: "No se pudo verificar el código." }, { status: 500 });
    }

    const match = (mails || []).find((m: { body?: string; created_at: string }) => {
      const okTime = m.created_at >= cutoff;
      if (!okTime || !m.body) return false;
      // El código de 6 dígitos vive en el body del correo del OS.
      const mCode = (m.body.match(/(\d{6})/) || [])[1];
      return mCode === code;
    });

    if (!match) {
      return NextResponse.json({ error: "Código incorrecto o expirado." }, { status: 401 });
    }

    // Código válido → crear sesión. El magiclink de Supabase entrega la sesión
    // como redirect a `#access_token=...&refresh_token=...`. Canjeamos el token
    // en el servidor vía /auth/v1/verify (redirect manual) y extraemos los tokens
    // del fragmento del Location.
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://starseed-os.vercel.app/auth/callback" },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: "No se pudo generar la sesión." }, { status: 500 });
    }

    const actionUrl = new URL(linkData.properties.action_link);
    const token = actionUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Enlace de acceso inválido." }, { status: 500 });
    }

    // Base Auth de Supabase (del mismo action_link).
    const authBase = `${actionUrl.protocol}//${actionUrl.host}/auth/v1`;
    const verifyUrl =
      `${authBase}/verify?token=${encodeURIComponent(token)}` +
      `&type=magiclink&redirect_to=${encodeURIComponent("https://starseed-os.vercel.app/auth/callback")}`;

    const vres = await fetch(verifyUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
    });
    const location = vres.headers.get("location");
    if (!location) {
      return NextResponse.json({ error: "No se pudo canjear la sesión." }, { status: 500 });
    }
    // location: https://...vercel.app/#access_token=XXX&refresh_token=YYY&...
    const frag = location.split("#")[1] || "";
    const params = new URLSearchParams(frag);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      return NextResponse.json({ error: "No se pudo extraer la sesión." }, { status: 500 });
    }

    // Marcar el correo OTP como leído (best-effort, dentro del try).
    await sb.from("ss_mail").update({ read: true }).eq("id", match.id);

    return NextResponse.json({
      ok: true,
      session: { access_token, refresh_token },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
