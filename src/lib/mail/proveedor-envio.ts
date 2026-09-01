/**
 * (Adenda 200 · 2026-09-01) Envío REAL de correo saliente desde las direcciones
 * públicas de StarSeed (`usuario@star.seed.dpdns.org`).
 * ─────────────────────────────────────────────────────────────────────────────
 * SOLO SERVIDOR. Nunca importar desde componentes cliente: contiene claves.
 *
 * La recepción ya funciona (Cloudflare Email Routing, catch-all → buzón del
 * proyecto). Para ENVIAR hace falta un proveedor con reputación de IP; hacerlo
 * a pelo por SMTP desde Vercel no llega a ninguna bandeja (puerto 25 cerrado y
 * sin DKIM el receptor lo tira). Cloudflare Email Sending existe pero exige
 * plan Workers de pago, así que la vía gratuita es un proveedor HTTP:
 *
 *   · RESEND  → 3.000 correos/mes, 100/día gratis.  RESEND_API_KEY=re_...
 *   · BREVO   → 300 correos/día gratis.             BREVO_API_KEY=xkeysib-...
 *
 * Ambos son HTTP puro: funcionan en Vercel sin dependencias ni sockets. Se
 * elige el primero que esté configurado; si no hay ninguno, `enviarPorProveedor`
 * devuelve `sinProveedor` y quien llama cae al `mailto:` de siempre (degradación
 * honesta: el usuario nunca cree que se envió algo que no salió).
 */

export type ProveedorEnvio = "resend" | "brevo" | null;

export interface ResultadoEnvio {
    ok: boolean;
    /** No hay proveedor configurado: hay que caer al `mailto:`. */
    sinProveedor?: boolean;
    proveedor?: ProveedorEnvio;
    /** Id del mensaje en el proveedor, si lo devuelve. */
    id?: string;
    error?: string;
}

export interface CorreoSaliente {
    /** Dirección pública del remitente, p. ej. `alex@star.seed.dpdns.org`. */
    from: string;
    /** Nombre visible del remitente (opcional). */
    fromName?: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
}

/** Proveedor activo según las variables de entorno presentes. */
export function proveedorActivo(): ProveedorEnvio {
    if ((process.env.RESEND_API_KEY || "").trim()) return "resend";
    if ((process.env.BREVO_API_KEY || "").trim()) return "brevo";
    return null;
}

/** ¿Está el envío saliente realmente disponible en este despliegue? */
export function envioDisponible(): boolean {
    return proveedorActivo() !== null;
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(c: CorreoSaliente): string | null {
    if (!RE_CORREO.test(c.from)) return "Remitente inválido.";
    if (!c.to.length) return "Falta el destinatario.";
    for (const d of c.to) if (!RE_CORREO.test(d)) return `Destinatario inválido: ${d}`;
    if (c.to.length > 20) return "Demasiados destinatarios en un solo envío (máx. 20).";
    if ((c.subject || "").length > 300) return "El asunto es demasiado largo.";
    if ((c.text || "").length > 200_000) return "El cuerpo es demasiado largo.";
    // Cabeceras inyectadas por salto de línea (CRLF injection).
    for (const v of [c.from, c.subject, ...(c.replyTo ? [c.replyTo] : []), ...c.to]) {
        if (/[\r\n]/.test(v)) return "Cabecera inválida.";
    }
    return null;
}

function remitente(c: CorreoSaliente): string {
    const nombre = (c.fromName || "").replace(/["\\<>\r\n]/g, "").trim();
    return nombre ? `${nombre} <${c.from}>` : c.from;
}

/** Envía por el proveedor configurado. No lanza: siempre devuelve resultado. */
export async function enviarPorProveedor(correo: CorreoSaliente): Promise<ResultadoEnvio> {
    const malo = validar(correo);
    if (malo) return { ok: false, error: malo };

    const proveedor = proveedorActivo();
    if (!proveedor) return { ok: false, sinProveedor: true };

    try {
        return proveedor === "resend" ? await porResend(correo) : await porBrevo(correo);
    } catch (e) {
        return { ok: false, proveedor, error: (e as Error)?.message || "Fallo de red al enviar." };
    }
}

/* ───────────────────────────── Resend ──────────────────────────────────── */

async function porResend(c: CorreoSaliente): Promise<ResultadoEnvio> {
    const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: remitente(c),
            to: c.to,
            subject: c.subject || "(sin asunto)",
            text: c.text,
            ...(c.html ? { html: c.html } : {}),
            ...(c.replyTo ? { reply_to: c.replyTo } : {}),
        }),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!r.ok) {
        return { ok: false, proveedor: "resend", error: cuerpo?.message || `Resend respondió ${r.status}.` };
    }
    return { ok: true, proveedor: "resend", id: cuerpo?.id };
}

/* ────────────────────────────── Brevo ──────────────────────────────────── */

async function porBrevo(c: CorreoSaliente): Promise<ResultadoEnvio> {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": process.env.BREVO_API_KEY || "",
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            sender: { email: c.from, ...(c.fromName ? { name: c.fromName } : {}) },
            to: c.to.map((email) => ({ email })),
            subject: c.subject || "(sin asunto)",
            textContent: c.text,
            ...(c.html ? { htmlContent: c.html } : {}),
            ...(c.replyTo ? { replyTo: { email: c.replyTo } } : {}),
        }),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!r.ok) {
        return { ok: false, proveedor: "brevo", error: cuerpo?.message || `Brevo respondió ${r.status}.` };
    }
    return { ok: true, proveedor: "brevo", id: cuerpo?.messageId };
}
