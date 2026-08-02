import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { rateLimit, clientIp, hashOtp } from "@/lib/security/rate-limit";

/**
 * POST /api/auth/otp/request
 * ─────────────────────────────
 * (Adenda 71-bis · 2026-07-17) Login por CÓDIGO sin contraseña para cuentas
 * @star.seed. Como @star.seed NO tiene SMTP externo, el OTP de Supabase por
 * email no llega. En su lugar, el OS GENERA el código y lo entrega en la
 * BANDEJA DE CORREOS y NOTIFICACIONES del OS (tablas ss_mail y notifications)
 * vía este endpoint. El código es el "gate" que el usuario ve dentro del OS;
 * al verificarlo, /verify crea la sesión.
 *
 * Usa la SERVICE_ROLE explícita (no el cliente anon de @/utils/supabase/server)
 * porque necesita auth.admin + escritura en ss_mail/notifications con RLS.
 * Es una API route de servidor: la service_role NUNCA se expone al cliente.
 *
 * ── ENDURECIMIENTO DE SEGURIDAD (2026-08-02) ──────────────────────────────
 *  · El código se genera con CSPRNG (`crypto.randomInt`), NO con Math.random().
 *  · La FUENTE DE VERDAD para verificar es la tabla `ss_otp` (hash del código +
 *    expiración + contador de intentos + flag de un solo uso). ss_mail sigue
 *    siendo sólo el CANAL de entrega visible en la bandeja del OS.
 *  · Al pedir un código nuevo se INVALIDAN los anteriores no usados del email.
 *  · Rate-limit en memoria por IP y por email (anti-spam / anti-flooding de la
 *    bandeja de un tercero). Ver `@/lib/security/rate-limit` (no distribuido).
 */
export const runtime = "nodejs";

/** Minutos de validez del código. */
const OTP_TTL_MIN = 10;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nxstilnyidvkqeosofuh.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }
    const normEmail = email.trim().toLowerCase();

    // ── RATE-LIMIT (por IP y por email). No revela si la cuenta existe. ──────
    const ip = clientIp(req);
    // Por IP: hasta 10 solicitudes / 10 min (frena scripts).
    const byIp = rateLimit(`otp-req:ip:${ip}`, 10, 10 * 60 * 1000);
    // Por email: hasta 5 solicitudes / 10 min (evita inundar una bandeja ajena).
    const byEmail = rateLimit(`otp-req:email:${normEmail}`, 5, 10 * 60 * 1000);
    if (!byIp.allowed || !byEmail.allowed) {
      const retry = Math.max(byIp.retryAfterSec, byEmail.retryAfterSec);
      return NextResponse.json(
        { error: "Demasiadas solicitudes de código. Inténtalo más tarde." },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }

    const sb = getServiceClient();

    // Resolver el user_id de la cuenta (para ss_mail.to_user y notifications.user_id).
    let userId: string | null = null;
    try {
      const { data: users } = await sb.auth.admin.listUsers({
        // listUsers no filtra por email directo en esta firma; buscamos por page.
      } as never);
      const found = (users?.users || []).find((u: { email?: string }) => u.email === normEmail);
      userId = found?.id ?? null;
    } catch {
      userId = null;
    }

    // Generar código de 6 dígitos con CSPRNG (100000–999999).
    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAt = new Date(now + OTP_TTL_MIN * 60 * 1000).toISOString();

    // ── FUENTE DE VERDAD: ss_otp ────────────────────────────────────────────
    // Invalidar códigos anteriores no usados de este email (sólo el último vale).
    await sb.from("ss_otp").update({ consumed: true }).eq("email", normEmail).eq("consumed", false);
    // Registrar el nuevo (hash, no el código en claro).
    const { error: otpErr } = await sb.from("ss_otp").insert({
      email: normEmail,
      user_id: userId,
      code_hash: hashOtp(normEmail, code),
      expires_at: expiresAt,
      attempts: 0,
      consumed: false,
      ip,
    });
    if (otpErr) {
      // Si no podemos registrar la fuente de verdad, NO entregamos un código
      // que luego /verify no podría validar. Error honesto (500).
      return NextResponse.json(
        { error: "No se pudo generar el código de acceso." },
        { status: 500 },
      );
    }

    // Guardar el código en ss_mail (BANDEJA DEL OS) como correo del sistema.
    // Solo columnas existentes en ss_mail (ver starseed-mail.ts): from_user,
    // to_user, from_address, to_address, subject, body, folder, read.
    const mailRow = {
      from_user: userId,
      to_user: userId,
      from_address: "sistema@star.seed",
      to_address: normEmail,
      subject: "Tu código de acceso StarSeed",
      body:
        `Hola,\n\nTu código de acceso sin contraseña para StarSeed OS es:\n\n  ${code}\n\n` +
        `Válido durante ${OTP_TTL_MIN} minutos. Úsalo en la pantalla de acceso (Entrar con código).\n\n` +
        `Si no solicitaste este código, ignóralo.`,
      folder: "inbox",
      read: false,
    };
    await sb.from("ss_mail").insert(mailRow);

    // Notificación del OS con el código.
    if (userId) {
      await sb.from("notifications").insert({
          user_id: userId,
          kind: "otp",
          title: "Código de acceso StarSeed",
          body: `Tu código es ${code} (válido ${OTP_TTL_MIN} min). Úsalo en "Entrar con código".`,
          link: "/correos",
          seen: false,
        });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
