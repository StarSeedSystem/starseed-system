import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * /api/dispositivo/sesion — Registro de qué cuentas han usado ESTE dispositivo.
 *
 * Por qué existe: al abrir el OS en una ventana nueva (u otro medio del mismo
 * equipo) el sistema debe reconocer las cuentas que ya trabajaron aquí y
 * ofrecer reanudarlas — sin pedir credenciales a ciegas y sin fricción.
 *
 * Almacén: `entity_state` (owner_kind='user', owner_id=userId,
 * key=`dispositivo:${device_id}`) — la tabla genérica con RLS que el OS ya
 * usa para estado por entidad; cero migraciones nuevas.
 *
 * Escritura: SOLO con service_role (bypassa RLS para escribir la fila de la
 * cuenta dueña desde su propia petición autenticada; el userId sale SIEMPRE
 * de la sesión server-side, nunca del cuerpo). Lectura: filtra por device_id
 * dentro del value con service_role (los values no son filtrables por REST).
 */
export const dynamic = "force-dynamic";

function loadServerEnv() {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^[\"']|[\"']$/g, "");
    }
  } catch { /* sin .env.local */ }
  return out;
}
const SERVER_ENV = loadServerEnv();

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || SERVER_ENV.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSbClient(url, key, { auth: { persistSession: false } });
}

interface SesionValue {
  user_id: string;
  email?: string | null;
  ts: number;
  medio?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Sesión OBLIGATORIA: solo usuarios autenticados dejan registro.
    let userId: string;
    try {
      const { createClient } = await import("@/utils/supabase/server");
      const sb = await createClient();
      const { data } = await sb.auth.getUser();
      if (!data.user) return NextResponse.json({ ok: false, error: "sin sesión" }, { status: 401 });
      userId = data.user.id;
    } catch {
      return NextResponse.json({ ok: false, error: "sin sesión" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const deviceIdRaw = typeof body?.device_id === "string" ? body.device_id.trim().slice(0, 80) : "";
    if (!deviceIdRaw) {
      return NextResponse.json({ ok: false, error: "falta device_id" }, { status: 400 });
    }
    const medio = ["local", "tunel", "nube"].includes(body?.medio) ? body.medio : "nube";

    const sb = serviceClient();
    if (!sb) return NextResponse.json({ ok: false, error: "service_role no disponible" }, { status: 503 });

    // Email legible para la UI (service_role puede leer auth.users).
    let email: string | null = null;
    try {
      const u = await sb.auth.admin.getUserById(userId);
      email = u.data?.user?.email ?? null;
    } catch { /* opcional */ }

    const row = {
      owner_kind: "user",
      owner_id: userId,
      key: `dispositivo:${deviceIdRaw}`,
      value: { user_id: userId, email, ts: Date.now(), medio } satisfies SesionValue,
      device_id: deviceIdRaw,
    };
    const { error } = await sb.from("entity_state").upsert(row, { onConflict: "owner_kind,owner_id,key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? "error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const deviceIdRaw = req.nextUrl.searchParams.get("device_id")?.trim().slice(0, 80) || "";
    if (!deviceIdRaw) {
      return NextResponse.json({ ok: false, error: "falta device_id" }, { status: 400 });
    }
    const sb = serviceClient();
    if (!sb) return NextResponse.json({ ok: false, sesiones: [] });

    // Los values no son filtrables por REST: traemos las claves del prefijo y
    // filtramos en memoria. Con service_role esto cruza cuentas (es EL punto:
    // detectar TODAS las cuentas que usaron este equipo).
    const prefijo = `dispositivo:${deviceIdRaw}`;
    const { data, error } = await sb
      .from("entity_state")
      .select("key, value")
      .like("key", `${prefijo}%`)
      .limit(500);
    if (error) return NextResponse.json({ ok: false, error: error.message, sesiones: [] }, { status: 200 });

    const vistos = new Set<string>();
    const candidatas: Array<{ key: string; v: SesionValue }> = [];
    for (const r of data ?? []) {
      const v = r.value as SesionValue | null;
      if (!v?.user_id || vistos.has(v.user_id)) continue;
      vistos.add(v.user_id);
      candidatas.push({ key: r.key as string, v });
    }

    // ── (Adenda 214) NO OFRECER CUENTAS QUE YA NO EXISTEN ────────────────────
    // Estas filas viven en `entity_state`, que no tiene columna de usuario: al
    // borrar una cuenta del servidor, su rastro de dispositivo sobrevivía y el
    // acceso seguía ofreciendo «Continuar como @fulano» de alguien que ya no
    // está. Alex lo vivió, con razón, como «no borraste la cuenta».
    // Aquí se comprueba cada candidata contra auth y se PURGA la fila de las
    // que hayan desaparecido: así el rastro se limpia solo, sin mantenimiento.
    const vivas: SesionValue[] = [];
    const muertas: string[] = [];
    for (const c of candidatas) {
      let existe = false;
      try {
        const { data: u, error: e } = await sb.auth.admin.getUserById(c.v.user_id);
        existe = !e && !!u?.user;
      } catch {
        // Ante un fallo de red NO se borra nada: mejor un fantasma temporal
        // que perder el rastro de una cuenta que sí existe.
        existe = true;
      }
      if (existe) vivas.push(c.v);
      else muertas.push(c.key);
    }
    if (muertas.length) {
      try { await sb.from("entity_state").delete().in("key", muertas); } catch { /* se reintenta en la próxima lectura */ }
    }

    vivas.sort((a, b) => b.ts - a.ts);
    return NextResponse.json({ ok: true, sesiones: vivas });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? "error", sesiones: [] });
  }
}
