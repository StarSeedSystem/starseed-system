import { guardianMando } from "@/lib/mando/guardian";
import { crearTokenMotor } from "@/lib/mando/motor-token";
import { armarRespuestaMotor, validarCuerpoMotor } from "@/lib/mando/motores";
import { createClient } from "@/utils/supabase/server";
import { randomBytes, createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" } as const;

// Secret for signing pairing codes, from environment variable
const PAIRING_CODE_SECRET = process.env.PAIRING_CODE_SECRET || "";
if (!PAIRING_CODE_SECRET) {
  console.warn("PAIRING_CODE_SECRET is not set");
}

/**
 * Genera un código de emparejamiento firmado para el ámbito dado.
 * El código contiene el ambitoId y una fecha de expiración (15 minutos).
 */
function generarCodigoDeEmparejamiento(ambitoId: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    ambitoId,
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutos
  };

  const headerB64 = Buffer.from(JSON.stringify(header))
    .toString("base64url")
    .replace(/=+$/, "");
  const payloadB64 = Buffer.from(JSON.stringify(payload))
    .toString("base64url")
    .replace(/=+$/, "");

  const signatureInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", PAIRING_CODE_SECRET)
    .update(signatureInput, "utf8")
    .digest("base64url")
    .replace(/=+$/, "");

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifica y decodifica un código de emparejamiento.
 * Devuelve el ambitoId si es válido y no ha expirado, o null en caso contrario.
 */
function verificarCodigoDeEmparejamiento(codigo: string): string | null {
  try {
    const [headerB64, payloadB64, signature] = codigo.split(".");
    if (!headerB64 || !payloadB64 || !signature) return null;

    const signatureInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = createHmac("sha256", PAIRING_CODE_SECRET)
      .update(signatureInput, "utf8")
      .digest("base64url")
      .replace(/=+$/, "");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    if (typeof payload !== "object" || payload === null) return null;

    const { ambitoId, exp } = payload as {
      ambitoId: string;
      exp: number;
    };
    if (typeof ambitoId !== "string" || typeof exp !== "number") return null;

    if (exp * 1000 < Date.now()) return null; // Expired

    return ambitoId;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.STARSEED_MANDO_TODOS !== "1") return new Response("Not Found", { status: 404 });

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  // Case 1: Generar código de emparejamiento (cuerpo contiene ambitoId)
  if (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "ambitoId" in cuerpo &&
    typeof (cuerpo as any).ambitoId === "string" &&
    !(("codigo" in cuerpo && typeof (cuerpo as any).codigo === "string"))
  ) {
    const ambitoId = (cuerpo as any).ambitoId;

    // Verificar permiso en el ámbito
    const veto = await guardianMando(request, {
      ambito: ambitoId,
      capacidad: "gestionar-motores",
    });
    if (veto) return veto;

    // Generar código de emparejamiento
    const codigo = generarCodigoDeEmparejamiento(ambitoId);
    return Response.json({ codigo }, { headers: SIN_CACHE });
  }

  // Case 2: Canje de código por token de motor (cuerpo contiene codigo y detalles del motor)
  if (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "codigo" in cuerpo &&
    typeof (cuerpo as any).codigo === "string" &&
    "nombre" in cuerpo &&
    typeof (cuerpo as any).nombre === "string" &&
    "tipo" in cuerpo &&
    typeof (cuerpo as any).tipo === "string" &&
    "capacidades" in cuerpo &&
    Array.isArray((cuerpo as any).capacidades)
  ) {
    const codigo = (cuerpo as any).codigo;
    const nombre = (cuerpo as any).nombre;
    const tipo = (cuerpo as any).tipo;
    const capacidades = (cuerpo as any).capacidades;

    // Verificar el código de emparejamiento para obtener el ambitoId
    const ambitoId = verificarCodigoDeEmparejamiento(codigo);
    if (!ambitoId) {
      return Response.json(
        { error: "Código de emparejamiento inválido o expirado." },
        { status: 400 }
      );
    }

    // Verificar permiso en el ámbito
    const veto = await guardianMando(request, {
      ambito: ambitoId,
      capacidad: "gestionar-motores",
    });
    if (veto) return veto;

    // Validar los detalles del motor
    const valido = validarCuerpoMotor({ nombre, tipo, capacidades });
    if (!valido.ok) {
      return Response.json({ error: valido.error }, { status: 400 });
    }

    // Generar token de motor
    const { token, hash, huella } = crearTokenMotor();

    // Registrar el motor vía RPC
    const supabase = await createClient();
    const { data: motorId, error } = await supabase.rpc("mando_registrar_motor", {
      _ambito: ambitoId,
      _nombre: nombre,
      _tipo: tipo,
      _token_hash: hash,
      _huella: huella,
      _capacidades: valido.valor.capacidades,
    });

    if (error || typeof motorId !== "string") {
      return Response.json(
        { error: "No se pudo registrar el motor." },
        { status: 403 }
      );
    }

    // Devolver el token de motor (solo una vez)
    return Response.json(
      armarRespuestaMotor({ motorId, huella, token }),
      { status: 201, headers: SIN_CACHE }
    );
  }

  // Si no coincide con ninguno de los casos anteriores
  return Response.json(
    { error: "Cuerpo de petición no válido." },
    { status: 400 }
  );
}

export async function GET(request: Request): Promise<Response> {
  if (process.env.STARSEED_MANDO_TODOS !== "1") return new Response("Not Found", { status: 404 });

  const url = new URL(request.url);
  const ambitoId = url.searchParams.get("ambitoId");

  if (!ambitoId) {
    return Response.json(
      { error: "Falta ambitoId en los parámetros de consulta." },
      { status: 400 }
    );
  }

  // Verificar permiso para ver detalle del ámbito
  const veto = await guardianMando(request, {
    ambito: ambitoId,
    capacidad: "ver-detalle",
  });
  if (veto) return veto;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mando_motores_publica")
    .select("id, nombre, tipo, huella, capacidades, estado, ultimo_reporte, creado_por")
    .eq("ambito_id", ambitoId);

  if (error) {
    return Response.json(
      { error: "No se pudieron leer los motores." },
      { status: 500 }
    );
  }

  return Response.json({ motores: data ?? [] }, { headers: SIN_CACHE });
}

export async function DELETE(request: Request): Promise<Response> {
  if (process.env.STARSEED_MANDO_TODOS !== "1") return new Response("Not Found", { status: 404 });

  const url = new URL(request.url);
  const ambitoId = url.searchParams.get("ambitoId");
  const motorId = url.searchParams.get("motorId");

  if (!ambitoId) {
    return Response.json(
      { error: "Falta ambitoId en los parámetros de consulta." },
      { status: 400 }
    );
  }
  if (!motorId) {
    return Response.json(
      { error: "Falta motorId en los parámetros de consulta." },
      { status: 400 }
    );
  }

  // Verificar permiso para gestionar motores en el ámbito
  const veto = await guardianMando(request, {
    ambito: ambitoId,
    capacidad: "gestionar-motores",
  });
  if (veto) return veto;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mando_revocar_motor", {
    _motor: motorId,
  });

  if (error || data !== true) {
    return Response.json(
      { error: "No se pudo revocar el motor." },
      { status: 403 }
    );
  }

  return Response.json({ ok: true }, { headers: SIN_CACHE });
}