import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { reenviarTurno, validarEndpoint } from "@/lib/astraura-bots/adaptadores/invitado-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 segundos máximo según requisitos

/**
 * Endpoint para proxy de bots invitados AG-UI.
 * 
 * Recibe peticiones POST con:
 *   - endpoint: URL del agente AG-UI (debe ser HTTPS y pasar validación SSRF)
 *   - cabecera?: Nombre de la variable de entorno que contiene la autorización
 *   - mensajes: Array de mensajes para enviar al agente
 *   - contextoPermitido: Contexto que el usuario autorizó a compartir
 * 
 * Devuelve el flujo de eventos AG-UI tal cual.
 */
export async function POST(req: NextRequest) {
  // EXIGIR SESIÓN (como en otros proxies)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Necesitas iniciar sesión para usar bots invitados." },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo verificar la sesión." },
      { status: 401 }
    );
  }

  // Parsear el cuerpo de la petición
  let payload: {
    endpoint: string;
    cabecera?: string;
    mensajes: Array<{
      role: string;
      content: string | Array<{ type: string; text: string }>;
    }>;
    contextoPermitido: Array<unknown>;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Petición inválida (JSON malformado)." },
      { status: 400 }
    );
  }

  // Validar campos requeridos
  if (!payload.endpoint || typeof payload.endpoint !== "string") {
    return NextResponse.json(
      { error: "Endpoint es requerido y debe ser una cadena de texto." },
      { status: 400 }
    );
  }

  if (!Array.isArray(payload.mensajes)) {
    return NextResponse.json(
      { error: "Mensajes debe ser un array." },
      { status: 400 }
    );
  }

  if (!Array.isArray(payload.contextoPermitido)) {
    return NextResponse.json(
      { error: "Contexto permitido debe ser un array." },
      { status: 400 }
    );
  }

  // Validar el endpoint usando la guardia SSRF
  const endpointValido = await validarEndpoint(payload.endpoint);
  if (!endpointValido) {
    return NextResponse.json(
      { error: "Endpoint no válido o no seguro (falló validación SSRF)." },
      { status: 400 }
    );
  }

   try {
     // Reenviar el turno al endpoint AG-UI
     const response = await reenviarTurno(
       payload.endpoint,
       payload.cabecera,
       payload.mensajes,
       payload.contextoPermitido
     );

     // Devolver la respuesta tal cual (ya incluye las cabeceras apropiadas)
     return response;
   } catch (err: any) {
    // Manejar errores específicos
    if (err.message.includes("Timeout")) {
      return NextResponse.json(
        { error: "Timeout al contactar el bot invitado (60s límite)." },
        { status: 504 }
      );
    }
    
    if (err.message.includes("seguridad")) {
      return NextResponse.json(
        { error: "Error de seguridad al contactar el bot invitado." },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: `Error al contactar el bot invitado: ${err.message}` },
      { status: 500 }
    );
  }
}