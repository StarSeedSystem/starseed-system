import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { rateLimit, clientIp, hashOtp } from "@/lib/security/rate-limit";

/**
 * POST /api/auth/otp/verify
 * ────────────────────────────
 * (Adenda 71-bis · 2026-07-17) Valida el código de 6 dígitos que el OS entregó
 * en la bandeja de correos/notificaciones del usuario, y SI es válido crea la
 * sesión de Supabase en el servidor usando auth.admin (service_role) + canje de
 * magiclink al instante. Devuelve { session } para que el cliente haga
 * setSession. El código nunca viaja por email externo.
 *
 * Usa la SERVICE_ROLE explícita (no el cliente anon de @/utils/supabase/server):
 * necesita auth.admin + lectura/escritura en ss_otp con RLS. API route de servidor.
 *
 * ── ENDURECIMIENTO DE SEGURIDAD (2026-08-02) ──────────────────────────────
 *  · FUENTE DE VERDAD = tabla `ss_otp` (hash del código, expiración, intentos,
 *    flag de un solo uso), NO el texto del correo en ss_mail.
 *  · LÍMITE DE INTENTOS por código: MAX_ATTEMPTS fallos → el código se invalida.
 *  · UN SOLO USO: al acertar se consume de forma ATÓMICA (update condicional
 *    consumed=false→true); una segunda verificación con el mismo código falla.
 *  · RATE-LIMIT por IP y por email+IP (en memoria, no distribuido; ver
 *    `@/lib/security/rate-limit`). Complementa la defensa dura de la BD.
 */
export const runtime = "nodejs";

/** Intentos fallidos permitidos por código antes de invalidarlo. */
const MAX_ATTEMPTS = 5;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nxstilnyidvkqeosofuh.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  );
}

interface OtpRow {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { email, code } = (await req.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
    };
    if (!email || !code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Email o código inválidos." }, { status: 400 });
    }
    const normEmail = email.trim().toLowerCase();

    // ── RATE-LIMIT (anti fuerza-bruta). Ventana corta por IP y por email+IP. ──
    const ip = clientIp(req);
    const byIp = rateLimit(`otp-vrf:ip:${ip}`, 30, 10 * 60 * 1000);
    const byEmailIp = rateLimit(`otp-vrf:ei:${normEmail}:${ip}`, 10, 10 * 60 * 1000);
    if (!byIp.allowed || !byEmailIp.allowed) {
      const retry = Math.max(byIp.retryAfterSec, byEmailIp.retryAfterSec);
      return NextResponse.json(
        { error: "Demasiados intentos. Inténtalo más tarde." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }

    const sb = getServiceClient();

    // Mensaje GENÉRICO en todos los fallos (no distingue "no existe" de "incorrecto").
    const genericFail = () =>
      NextResponse.json({ error: "Código incorrecto o expirado." }, { status: 401 });

    // ── RESERVA ATÓMICA de intento (cierre de la fuerza bruta CONCURRENTE) ────
    // El RPC bloquea la fila del último código activo del email (`for update`, que
    // SERIALIZA las llamadas concurrentes) y RESERVA un intento ANTES de comparar el
    // hash → como mucho MAX_ATTEMPTS comparaciones por código, pase lo que pase con la
    // concurrencia. El incremento read-modify-write anterior PERDÍA incrementos bajo
    // ráfaga y no aplicaba el tope (toma de cuenta por fuerza bruta). Devuelve el hash
    // sólo si quedaba intento; si no (agotado/caducado/sin código) → blocked=true.
    const { data: claimRows, error: claimErr } = await sb.rpc("otp_claim_attempt", {
      p_email: normEmail,
      p_max: MAX_ATTEMPTS,
    });
    if (claimErr) {
      return NextResponse.json({ error: "No se pudo verificar el código." }, { status: 500 });
    }
    const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
      | { id: string | null; code_hash: string | null; expires_at: string | null; attempts: number; blocked: boolean }
      | undefined;
    if (!claim || claim.blocked || !claim.id || !claim.code_hash) return genericFail();

    // Comparación por HASH (timing-safe). El intento YA fue contado atómicamente por el RPC.
    const expected = hashOtp(normEmail, code);
    const provided = claim.code_hash;
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return genericFail();

    // ── ACIERTO → CONSUMO ATÓMICO (un solo uso, a prueba de carreras) ────────
    // update … where id AND consumed=false. Si no devuelve fila, otro proceso ya lo
    // consumió (doble envío del mismo código) → rechazamos.
    const { data: consumedRows, error: cErr } = await sb
      .from("ss_otp")
      .update({ consumed: true })
      .eq("id", claim.id)
      .eq("consumed", false)
      .select("id");
    if (cErr || !consumedRows || consumedRows.length === 0) {
      return genericFail();
    }

    // Código válido y consumido → crear sesión. El magiclink de Supabase entrega
    // la sesión como redirect a `#access_token=...&refresh_token=...`. Canjeamos
    // el token en el servidor vía /auth/v1/verify (redirect manual) y extraemos
    // los tokens del fragmento del Location.
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: normEmail,
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

    // Marcar el/los correo(s) OTP de la bandeja como leídos (best-effort, no crítico).
    await sb
      .from("ss_mail")
      .update({ read: true })
      .eq("to_address", normEmail)
      .eq("subject", "Tu código de acceso StarSeed")
      .eq("read", false);

    return NextResponse.json({
      ok: true,
      session: { access_token, refresh_token },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
