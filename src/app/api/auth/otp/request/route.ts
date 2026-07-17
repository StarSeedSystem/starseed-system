import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/auth/otp/request
 * ─────────────────────────────
 * (Adenda 71-bis · 2026-07-17) Login por CÓDIGO sin contraseña para cuentas
 * @star.seed. Como @star.seed NO tiene SMTP externo, el OTP de Supabase por
 * email no llega. En su lugar, el OS GENERA el código y lo entrega en la
 * BANDEJA DE CORREOS y NOTIFICACIONES del OS de la cuenta (tablas ss_mail y
 * notifications), exactamente como pidió el usuario. El código es el "gate"
 * que el usuario ve dentro del OS; al verificarlo, /verify crea la sesión.
 *
 * Usa la SERVICE_ROLE en el servidor (no expuesta al cliente). La service_role
 * SÍ puede usar auth.admin (probado). El cliente nunca ve la service_role.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }

    const sb = await createClient(); // service_role (server)

    // Resolver el user_id de la cuenta (para ss_mail.to_user y notifications.user_id).
    let userId: string | null = null;
    try {
      const { data: users } = await sb.auth.admin.listUsers({
        // listUsers no filtra por email directo en esta firma; buscamos por page.
      } as never);
      const found = (users?.users || []).find((u: { email?: string }) => u.email === email);
      userId = found?.id ?? null;
    } catch {
      userId = null;
    }

    // Generar código de 6 dígitos.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Guardar el código en ss_mail (BANDEJA DEL OS) como correo del sistema.
    // Solo columnas existentes en ss_mail (ver starseed-mail.ts): from_user,
    // to_user, from_address, to_address, subject, body, folder, read.
    const mailRow = {
      from_user: userId,
      to_user: userId,
      from_address: "sistema@star.seed",
      to_address: email,
      subject: "Tu código de acceso StarSeed",
      body:
        `Hola,\n\nTu código de acceso sin contraseña para StarSeed OS es:\n\n  ${code}\n\n` +
        `Válido durante 10 minutos. Úsalo en la pantalla de acceso (Entrar con código).\n\n` +
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
          body: `Tu código es ${code} (válido 10 min). Úsalo en "Entrar con código".`,
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
