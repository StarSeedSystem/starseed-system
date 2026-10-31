/**
 * /api/mando/alcance (INV1025P) · panel del agente de alcance en Genesis
 * ─────────────────────────────────────────────────────────────────────────────
 * Ruta SOLO LOCAL (guardianMando, como /api/mando/imaginacion): en producción
 * responde 404 y JAMÁS devuelve claves, credenciales ni rutas del disco.
 *
 * GET  `?id=<propuesta>` → `{ vista }` con el estado de envío y todo lo que el
 *        panel pinta; la dirección del destino se resuelve SOLO para mostrarla
 *        en la confirmación (R5: nunca se guarda).
 * POST `{ accion, id, … }`
 *   · `editar`        `{ asunto, cuerpo }`  Reescribe el borrador y ANULA la
 *                                           aprobación (huella y sello, no).
 *   · `aprobar-texto`                        MISMO camino que `integrar` de la
 *                                           imaginación + huella SHA-256 (R2).
 *   · `enviar`        `{ medio, confirmacion }` evalúa con `evaluarEnvio`;
 *                      `correo-propio` salta a `enviarPorProveedor`,
 *                      `correo-usuario` devuelve el `mailto:` de la persona y
 *                      formulario/github/red dan el canal para copiar y abrir
 *                      (el OS nunca lo automatiza). Registro: hash del destino.
 *   · `suprimir`                             y `marcar { estado }` de seguimiento.
 *
 * Lo que toca disco y red vive en `src/lib/alcance/alcance-servidor.ts` (SOLO servidor).
 */
import { guardianMando } from "@/lib/mando/guardian";
import {
  aprobarTextoAlcance, editarAlcance, enviarAlcance, leerVistaAlcance, marcarAlcance, suprimirAlcance,
} from "@/lib/alcance/alcance-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const responder = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: SIN_CACHE });
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Id de la petición, validado; "" si no es un id razonable. PURA. */
function idDe(v: unknown): string {
  return typeof v === "string" && v.trim() && v.trim().length <= 160 ? v.trim() : "";
}

export async function GET(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  const id = idDe(new URL(peticion.url).searchParams.get("id"));
  if (!id) return responder({ error: "Falta el id de la propuesta de alcance." }, 400);
  try {
    const vista = await leerVistaAlcance(id);
    // En canales sin sesión no se distingue «no existe» (404, como el resto de /api/mando/*).
    if (!vista) return responder({ error: "No existe esa propuesta de alcance." }, 404);
    return responder({ vista });
  } catch {
    return responder({ error: "No se pudo leer el estado del alcance." }, 500);
  }
}

export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  let crudo: Record<string, unknown>;
  try {
    crudo = (await peticion.json()) as Record<string, unknown>;
  } catch {
    return responder({ error: "Cuerpo JSON inválido." }, 400);
  }
  const accion = texto(crudo.accion, 40);
  const id = idDe(crudo.id);
  if (!id) return responder({ error: "Falta el id de la propuesta de alcance." }, 400);

  try {
    if (accion === "editar") {
      const r = await editarAlcance(id, texto(crudo.asunto, 300), texto(crudo.cuerpo, 8000));
      return r.ok ? responder({ ok: true }) : responder({ ok: false, error: r.error }, 400);
    }
    if (accion === "aprobar-texto") {
      const r = await aprobarTextoAlcance(id);
      return r.ok ? responder({ ok: true }) : responder({ ok: false, error: r.error }, 409);
    }
    if (accion === "enviar") {
      const medio = texto(crudo.medio, 20);
      const r = await enviarAlcance(id, medio, texto(crudo.confirmacion, 40));
      if (r.ok) return responder(r);
      if (r.motivos) return responder({ ok: false, error: "El envío no puede salir todavía.", motivos: r.motivos }, 409);
      return responder({ ok: false, error: r.error }, 409);
    }
    if (accion === "suprimir") {
      const r = await suprimirAlcance(id);
      return r.ok ? responder({ ok: true }) : responder({ ok: false, error: r.error }, 400);
    }
    if (accion === "marcar") {
      const r = await marcarAlcance(id, texto(crudo.estado, 20));
      return r.ok ? responder({ ok: true }) : responder({ ok: false, error: r.error }, 400);
    }
    return responder({ error: "Acción desconocida: editar, aprobar-texto, enviar, suprimir o marcar." }, 400);
  } catch {
    return responder({ error: "No se pudo guardar el cambio del alcance." }, 500);
  }
}
