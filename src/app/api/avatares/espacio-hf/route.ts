/**
 * POST /api/avatares/espacio-hf — VALIDACIÓN (tarea ESP1011C).
 *
 * Según el contrato §11.2, los Spaces públicos se llaman DESDE EL NAVEGADOR
 * de cada persona (cada quien gasta SU cuota de Hugging Face). Esta ruta ya no
 * hace proxy al Space; solo valida permiso/consentimiento/tamaño/formato y
 * devuelve un aviso para que se use el cliente de ESP1011A en el navegador.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_IMAGEN_BYTES,
  claveDia,
  motivoDenegacion,
  procedenciaMotor,
  type PeticionEspacioHf,
} from "@/lib/avatares/adaptadores/espacio-hf";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const contador = new Map<string, { dia: string; usos: number }>();

function usoHoyDe(personaId: string): number {
  const reg = contador.get(personaId);
  return reg && reg.dia === claveDia() ? reg.usos : 0;
}

function noDisponible(motivo: string, estado = 200): NextResponse {
  return NextResponse.json({ disponible: false, motivo }, { status: estado });
}

interface CuerpoPeticion {
  imagen?: string;
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

  if (imagen.bytes.byteLength <= 0 || imagen.bytes.byteLength > MAX_IMAGEN_BYTES) {
    return noDisponible("La imagen no es válida o pesa más de lo permitido.", 400);
  }

  const proc = procedenciaMotor();
  if (proc.motorId === null) return noDisponible(proc.motivo, 500);

  return NextResponse.json({
    disponible: true,
    modo: "navegador",
    motivo: "Los Spaces se llaman desde el navegador de cada persona (su cuota). Usa el cliente de espacios 3D.",
    motor: proc.motorId,
  });
}
