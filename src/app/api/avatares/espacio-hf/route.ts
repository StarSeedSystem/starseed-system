/**
 * POST /api/avatares/espacio-hf — RESPALDO REMOTO de generación 3D (tarea G3D1011F).
 *
 * Manda UNA imagen al Space público de Hugging Face `TencentARC/Pixal3D`
 * (Gradio 6, ZeroGPU con cuota diaria) y devuelve el GLB. Contrato:
 * architecture/astraura-avatares-3d.md §11.2 — solo con `permiso: true`
 * explícito (la imagen SALE del aparato), nunca con fotos de personas sin su
 * consentimiento, tope diario por persona y tamaño máximo de imagen. La
 * lógica pura vive en `src/lib/avatares/adaptadores/espacio-hf.ts`.
 *
 * SEGURIDAD: destino FIJO (el Space, no hay host controlado por quien llama);
 * `HF_TOKEN` se toma del entorno si existe (más cuota) y NUNCA se registra ni
 * se expone. Sin red, con error o con cuota agotada se responde
 * `disponible: false` con el motivo — «basta de ilusiones», nada simulado.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  DECIMACION_POR_DEFECTO,
  ESPACIO_HF_URL,
  MAX_IMAGEN_BYTES,
  cuerpoExtraerGlb,
  cuerpoGenerar3d,
  cuerpoPreproceso,
  claveDia,
  motivoDenegacion,
  procedenciaMotor,
  resultadoDeSse,
  statePathDeResultado,
  urlGlbDeResultado,
  type FileDataGradio,
  type PeticionEspacioHf,
} from "@/lib/avatares/adaptadores/espacio-hf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Contador en memoria por persona y día (sin Supabase: nada de sondeos). */
const contador = new Map<string, { dia: string; usos: number }>();

function usoHoyDe(personaId: string): number {
  const reg = contador.get(personaId);
  return reg && reg.dia === claveDia() ? reg.usos : 0;
}

function registrarUso(personaId: string): void {
  contador.set(personaId, { dia: claveDia(), usos: usoHoyDe(personaId) + 1 });
}

function noDisponible(motivo: string, estado = 200): NextResponse {
  return NextResponse.json({ disponible: false, motivo }, { status: estado });
}

function cabeceras(imagen = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (!imagen) h["Content-Type"] = "application/json";
  const token = process.env.HF_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface CuerpoPeticion {
  imagen?: string; // data URL (data:image/png;base64,…)
  personaId?: string;
  permiso?: boolean;
  esFotoDePersonas?: boolean;
  consentimientoPersonas?: boolean;
  usoHoyDeclarado?: number;
}

function dataUrlABlob(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1], bytes: new Uint8Array(Buffer.from(m[2], "base64")) };
  } catch {
    return null;
  }
}

async function llamar(fn: string, cuerpo: unknown): Promise<unknown[]> {
  const r = await fetch(`${ESPACIO_HF_URL}/gradio_api/call/${fn}`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { event_id } = (await r.json()) as { event_id?: string };
  if (!event_id) throw new Error("sin event_id");
  const sse = await fetch(`${ESPACIO_HF_URL}/gradio_api/call/${fn}/${event_id}`, { headers: cabeceras() });
  const fin = resultadoDeSse(await sse.text());
  if (!fin.ok) throw new Error(fin.motivo);
  return fin.datos;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = (await req.json()) as CuerpoPeticion;
  } catch {
    return noDisponible("El cuerpo de la petición no es un JSON válido.", 400);
  }

  const imagen = typeof cuerpo.imagen === "string" ? dataUrlABlob(cuerpo.imagen) : null;
  if (!imagen) return noDisponible("Falta la imagen (data URL en base64).", 400);

  const personaId = typeof cuerpo.personaId === "string" && cuerpo.personaId ? cuerpo.personaId : "anonima";
  const peticion: PeticionEspacioHf = {
    permiso: cuerpo.permiso === true,
    esFotoDePersonas: cuerpo.esFotoDePersonas === true,
    consentimientoPersonas: cuerpo.consentimientoPersonas === true,
    imagenBytes: imagen.bytes.byteLength,
    mime: imagen.mime,
    usoHoy: Math.max(usoHoyDe(personaId), Number(cuerpo.usoHoyDeclarado) || 0),
  };
  const motivo = motivoDenegacion(peticion);
  if (motivo) return noDisponible(motivo, 403);

  const proc = procedenciaMotor();
  if (proc.motorId === null) return noDisponible(proc.motivo, 500);

  try {
    // 1. Subir la imagen al Space (multipart/form-data).
    const form = new FormData();
    const copia = new Uint8Array(new ArrayBuffer(imagen.bytes.byteLength));
    copia.set(imagen.bytes);
    form.append("files", new Blob([copia], { type: imagen.mime }), "imagen.png");
    const subida = await fetch(`${ESPACIO_HF_URL}/gradio_api/upload`, { method: "POST", headers: cabeceras(true), body: form });
    if (!subida.ok) throw new Error(`HTTP ${subida.status}`);
    const rutas = (await subida.json()) as string[];
    const archivo: FileDataGradio = { path: rutas[0] };

    // 2. Preprocesar, generar el estado 3D y extraer el GLB.
    const prep = await llamar("preprocess", cuerpoPreproceso(archivo));
    const preprocesada = (prep[0] ?? archivo) as FileDataGradio;
    await llamar("generate_3d", cuerpoGenerar3d(preprocesada));
    const sessionId = cabeceraSesion(preprocesada);
    const estado = statePathDesde(preprocesada, sessionId);
    const glb = await llamar("extract_glb_api", cuerpoExtraerGlb(estado, { decimationTarget: DECIMACION_POR_DEFECTO }, sessionId));
    const urlGlb = urlGlbDeResultado(glb);
    if (!urlGlb) throw new Error("sin URL de GLB");

    // 3. Bajar el GLB y devolverlo con su procedencia.
    const descarga = await fetch(urlGlb, { headers: cabeceras() });
    if (!descarga.ok) throw new Error(`HTTP ${descarga.status}`);
    registrarUso(personaId);
    return new NextResponse(Buffer.from(await descarga.arrayBuffer()), {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "X-Motor": proc.motorId,
        "X-Licencia": proc.licencia,
        ...(proc.atribucion ? { "X-Atribucion": proc.atribucion } : {}),
      },
    });
  } catch (e) {
    return noDisponible(`El Space no está disponible ahora: ${e instanceof Error ? e.message : "error desconocido"}. Prueba más tarde o genera en local con el taller (Pixal3D o image-to-3dlab).`);
  }
}

/**
 * El Space mantiene la sesión por el archivo de imagen: /generate_3d guarda su
 * estado y /extract_glb_api lo pide como `state_path`. Su diccionario de salida
 * no documenta la clave, así que usamos la única ruta estable que sí publica:
 * la de la imagen preprocesada. Si el Space deja de aceptarla, la ruta responde
 * «no disponible» con el motivo (contrato: nada simulado).
 */
function cabeceraSesion(archivo: FileDataGradio): string {
  return archivo.path;
}

function statePathDesde(_imagen: FileDataGradio, sessionId: string): string {
  void _imagen;
  return sessionId;
}
