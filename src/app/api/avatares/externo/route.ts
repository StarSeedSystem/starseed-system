/**
 * /api/avatares/externo — proveedores externos OPCIONALES de imagen → 3D: Meshy y Tripo (AV1011I).
 * Contrato: architecture/astraura-avatares-3d.md §1 y §10. APAGADOS por defecto: solo funcionan con la clave del
 * proveedor (`MESHY_API_KEY` o `TRIPO_API_KEY`) Y `AVATARES_EXTERNOS_PERMITIDOS=1` en el entorno del servidor;
 * si falta algo responden `disponible: false` con su motivo. La lógica vive en
 * `src/lib/avatares/adaptadores/proveedores-externos.ts`.
 *
 *  GET                                       → qué proveedores hay y si `clave-externa` se ofrece a `planificar`.
 *  POST {proveedor, imagen, permiso, …}      → crea la tarea; devuelve su id y la procedencia (atribución).
 *  GET ?proveedor=…&tarea=…[&descargar=1]    → UNA consulta del estado (sin sondeo aquí); con `descargar=1` y la
 *                                              tarea lista, el GLB: lo baja el servidor, así la URL firmada del
 *                                              proveedor no llega al cliente ni a un avatar (solo `biblioteca:`).
 *
 * Seguridad: sesión obligatoria salvo en la propia neurona (`esDespliegueLocal`); tope por persona y otro total, cada 24 h
 * desde el primer uso de cada clave (`reservarTope` sobre `rateLimit`, en memoria por instancia: primera barrera, no un
 * tope global exacto). La imagen SALE a un tercero: exige `permiso: true` y, si hay personas, su consentimiento. Las
 * claves nunca se devuelven ni se registran.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import {
  capacidadesExternas, consultarTarea, crearTarea, esProveedor, esUrlDescarga, estadoProveedores,
  motivoImagen, motivoNoDisponible, procedenciaExterna, reservarTope, type Imagen,
} from "@/lib/avatares/adaptadores/proveedores-externos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CUERPO = 12 * 1024 * 1024;
const NOMBRE = { meshy: "Meshy", tripo: "Tripo" } as const;

const noDisponible = (motivo: string, status = 200): NextResponse => NextResponse.json({ disponible: false, motivo }, { status });

/** Quién pide: "local" en la propia neurona; si no, el usuario con sesión (una sola lectura por petición). */
async function persona(req: NextRequest): Promise<string | null> {
  if (esDespliegueLocal(req)) return "local";
  try {
    const { data, error } = await (await createClient()).auth.getUser();
    return error || !data.user ? null : data.user.id;
  } catch {
    return null;
  }
}

function deDataUrl(v: unknown): Imagen | null {
  const m = typeof v === "string" ? /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(v) : null;
  return m ? { mime: m[1], bytes: new Uint8Array(Buffer.from(m[2], "base64")) } : null;
}

const limitado = (motivo: string, segundos: number): NextResponse =>
  NextResponse.json({ disponible: false, motivo }, { status: 429, headers: { "Retry-After": String(segundos) } });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const entorno = process.env, q = req.nextUrl.searchParams;
  const proveedor = q.get("proveedor"), tarea = q.get("tarea");
  if (!proveedor && !tarea) return NextResponse.json({ proveedores: estadoProveedores(entorno), capacidades: capacidadesExternas(entorno) });
  if (!esProveedor(proveedor) || !tarea) return noDisponible("Falta el proveedor (meshy o tripo) o el id de la tarea.", 400);
  const no = motivoNoDisponible(proveedor, entorno);
  if (no) return noDisponible(no);
  const quien = await persona(req);
  if (!quien) return noDisponible("Necesitas iniciar sesión para consultar un servicio de pago.", 401);
  const rl = rateLimit(`avatares-externo:consulta:${quien}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) return limitado("Demasiadas consultas seguidas: vuelve a preguntar en unos minutos.", rl.retryAfterSec);

  const r = await consultarTarea(proveedor, tarea, entorno);
  if (!r.ok) return noDisponible(r.motivo, 502);
  const { estado, progreso, motivo, glb } = r.valor;
  const procedencia = procedenciaExterna(proveedor);
  if (q.get("descargar") !== "1" || estado !== "lista" || !esUrlDescarga(proveedor, glb)) {
    return NextResponse.json({ disponible: true, proveedor, tarea, estado, progreso, motivo, procedencia });
  }
  const descarga = await fetch(glb).catch(() => null);
  if (!descarga?.ok || !descarga.body) return noDisponible(`No se pudo bajar el GLB de ${NOMBRE[proveedor]}: vuelve a intentarlo (sus enlaces caducan).`, 502);
  const cabeceras: Record<string, string> = {
    "Content-Type": "model/gltf-binary",
    "Cache-Control": "no-store",
    "X-Motor": proveedor,
    "X-Licencia": encodeURIComponent(procedencia?.licencia ?? "desconocida"),
  };
  if (procedencia?.atribucion) cabeceras["X-Atribucion"] = encodeURIComponent(procedencia.atribucion);
  return new NextResponse(descarga.body, { status: 200, headers: cabeceras });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const entorno = process.env;
  const crudo = await req.text().catch(() => "");
  if (!crudo || crudo.length > MAX_CUERPO) return noDisponible("El cuerpo está vacío o es demasiado grande.", 400);
  let cuerpo: Record<string, unknown>;
  try {
    const leido: unknown = JSON.parse(crudo);
    if (!leido || typeof leido !== "object") throw new Error("no es un objeto");
    cuerpo = leido as Record<string, unknown>;
  } catch {
    return noDisponible("El cuerpo de la petición no es un JSON válido.", 400);
  }
  const proveedor = cuerpo.proveedor;
  if (!esProveedor(proveedor)) return noDisponible("Proveedor desconocido: solo meshy o tripo.", 400);
  const no = motivoNoDisponible(proveedor, entorno);
  if (no) return noDisponible(no);
  const quien = await persona(req);
  if (!quien) return noDisponible("Necesitas iniciar sesión para usar un servicio de pago.", 401);
  if (cuerpo.permiso !== true) return noDisponible(`Falta tu permiso: esto manda tu imagen a ${NOMBRE[proveedor]}, un servicio externo de pago.`, 403);
  if (cuerpo.esFotoDePersonas === true && cuerpo.consentimientoPersonas !== true) {
    return noDisponible("La imagen contiene personas y falta su consentimiento: nunca la mandamos sin él.", 403);
  }
  const imagen = deDataUrl(cuerpo.imagen);
  const malImagen = imagen ? motivoImagen(imagen) : "Falta la imagen (data URL en base64).";
  if (malImagen || !imagen) return noDisponible(malImagen ?? "Falta la imagen.", 400);

  const reserva = reservarTope(rateLimit, quien);
  if (!reserva.ok) return limitado(reserva.motivo, reserva.reintentarSeg);

  const r = await crearTarea(proveedor, imagen, entorno);
  if (!r.ok) return noDisponible(r.motivo, 502);
  return NextResponse.json({ disponible: true, proveedor, tarea: r.valor, procedencia: procedenciaExterna(proveedor), quedanHoy: reserva.quedan });
}
