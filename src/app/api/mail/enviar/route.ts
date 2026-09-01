import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarPorProveedor, proveedorActivo } from "@/lib/mail/proveedor-envio";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * POST /api/mail/enviar   ·   GET /api/mail/enviar (estado)
 * ─────────────────────────────────────────────────────────────────────────────
 * (Adenda 200 · 2026-09-01) Envía correo REAL a cualquier dirección de internet
 * desde la dirección pública del usuario (`usuario@<dominio público>`).
 *
 * Reglas de seguridad:
 *  · Requiere sesión: el token de Supabase viaja en `Authorization: Bearer`.
 *  · El remitente NO lo elige el cliente: se DERIVA del handle del usuario en
 *    el servidor. Así nadie puede suplantar la dirección de otro miembro.
 *  · Rate-limit por usuario e IP: el plan gratuito del proveedor es finito y
 *    una cuenta quemada deja sin correo a toda la red.
 */
export const runtime = "nodejs";

/** Envíos permitidos por usuario en la ventana (plan gratuito ≈100/día). */
const LIMITE_USUARIO = 20;
const VENTANA_MS = 60 * 60 * 1000; // 1 h

function servicio() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        { auth: { persistSession: false } },
    );
}

function dominio(): string {
    return (process.env.NEXT_PUBLIC_STARSEED_MAIL_DOMAIN || "").trim().replace(/^@/, "");
}

/** Estado del envío saliente, para que la UI no prometa lo que no puede. */
export async function GET() {
    const p = proveedorActivo();
    return NextResponse.json({ disponible: p !== null, proveedor: p, dominio: dominio() || null });
}

export async function POST(req: NextRequest) {
    const ip = clientIp(req);
    if (!rateLimit(`mail-enviar-ip:${ip}`, 60, VENTANA_MS).allowed) {
        return NextResponse.json({ ok: false, error: "Demasiados envíos desde esta red. Prueba en un rato." }, { status: 429 });
    }

    const dom = dominio();
    if (!dom) {
        return NextResponse.json(
            { ok: false, sinDominio: true, error: "Este despliegue no tiene dominio público de correo configurado." },
            { status: 503 },
        );
    }
    if (!proveedorActivo()) {
        return NextResponse.json(
            { ok: false, sinProveedor: true, error: "El envío saliente aún no está activado en este despliegue." },
            { status: 503 },
        );
    }

    // ── Sesión ───────────────────────────────────────────────────────────────
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ ok: false, error: "Sesión requerida." }, { status: 401 });

    const sb = servicio();
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    const uid = userData?.user?.id;
    if (userErr || !uid) return NextResponse.json({ ok: false, error: "Sesión inválida." }, { status: 401 });

    if (!rateLimit(`mail-enviar-uid:${uid}`, LIMITE_USUARIO, VENTANA_MS).allowed) {
        return NextResponse.json({ ok: false, error: `Límite de ${LIMITE_USUARIO} correos por hora alcanzado.` }, { status: 429 });
    }

    // ── Cuerpo ───────────────────────────────────────────────────────────────
    let body: { to?: unknown; subject?: unknown; text?: unknown; html?: unknown };
    try {
        body = (await req.json()) as typeof body;
    } catch {
        return NextResponse.json({ ok: false, error: "Cuerpo inválido." }, { status: 400 });
    }

    const destinos = (Array.isArray(body.to) ? body.to : [body.to])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
    if (!destinos.length) return NextResponse.json({ ok: false, error: "Falta el destinatario." }, { status: 400 });

    // ── Remitente derivado en el servidor (nunca del cliente) ────────────────
    const { data: perfil } = await sb
        .from("profiles")
        .select("handle, display_name")
        .eq("user_id", uid)
        .maybeSingle();

    const fila = (perfil ?? {}) as { handle?: string; display_name?: string };
    const handle = (fila.handle || "").replace(/^@/, "").trim().toLowerCase();
    if (!handle) {
        return NextResponse.json(
            { ok: false, error: "Tu perfil aún no tiene @handle: termina la configuración inicial." },
            { status: 409 },
        );
    }

    const resultado = await enviarPorProveedor({
        from: `${handle}@${dom}`,
        fromName: (fila.display_name || "").trim() || undefined,
        to: destinos,
        subject: typeof body.subject === "string" ? body.subject : "",
        text: typeof body.text === "string" ? body.text : "",
        html: typeof body.html === "string" ? body.html : undefined,
        // Las respuestas vuelven a la misma dirección pública: Cloudflare Email
        // Routing las entrega en el buzón del proyecto y de ahí al OS.
        replyTo: `${handle}@${dom}`,
    });

    if (!resultado.ok) {
        return NextResponse.json(resultado, { status: resultado.sinProveedor ? 503 : 502 });
    }
    return NextResponse.json({ ...resultado, from: `${handle}@${dom}` });
}
