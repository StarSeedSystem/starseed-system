/**
 * Acceso a `os_spaces` para las apps en vivo de tabla y panel (2026-09-28).
 *
 * Reutiliza la tabla y las políticas que ya usan la pizarra y el escritorio compartidos (RLS por
 * dueño / invitados / lectura pública) pero con lo que un editor colaborativo necesita y
 * `@/lib/spaces/spaces` no da:
 *
 *   · `guardarEspacioCAS`: escribe SOLO si `rev` sigue siendo el que vimos (compare-and-swap con
 *     `.eq("rev", n)`), distinguiendo conflicto (alguien guardó antes) de falta de permiso.
 *   · Un id de instancia por PESTAÑA en `device_id` (el del dispositivo lo comparten todas las
 *     pestañas y se ignorarían entre sí) para no procesar el eco de lo que escribimos.
 *   · Lecturas que distinguen «no existe / sin acceso» de «sin red».
 *
 * Tipo de espacio: `kind = 'dashboard'` (el contenedor genérico que ya admite el CHECK de la
 * tabla; ver `@/lib/sharing/access`) y el tipo REAL viaja en `doc.vivo` (`'tabla'` | `'dashboard'`).
 * Así no hace falta migración: funciona con el esquema ya desplegado.
 */
import { createClient } from "@/utils/supabase/client";
import { syncManager } from "@/lib/sync/sync-manager";
import { deviceId } from "@/lib/sync/entity-state";
import { acceptSpaceInvite, createSpace } from "@/lib/spaces/spaces";
import { esUuid } from "./modelo";
import type { CambioRemoto, EspacioLeido, ResultadoGuardar, ResultadoLeer } from "./motor-colab";

export type TipoVivoEspacio = "tabla" | "dashboard";

export const SIN_CUENTA = "No se pudo crear. Inicia sesión e inténtalo de nuevo.";

let instancia: string | null = null;
/** Id de esta pestaña (para ignorar el eco de nuestras propias escrituras). */
export function instanciaId(): string {
    if (!instancia) instancia = `${deviceId()}:${Math.random().toString(36).slice(2, 8)}`;
    return instancia;
}

function objeto(x: unknown): Record<string, unknown> {
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

export function mapearEspacio(row: Record<string, unknown>): EspacioLeido {
    return {
        id: String(row.id),
        titulo: typeof row.title === "string" && row.title ? row.title : "Sin título",
        doc: objeto(row.doc),
        rev: Number(row.rev) || 0,
        propietario: typeof row.owner_account === "string" ? row.owner_account : "",
        acceso: typeof row.access === "string" ? row.access : "private",
    };
}

/** Uid de la sesión (o null). Nunca lanza. */
export async function miUid(): Promise<string | null> {
    try {
        const { data } = await createClient().auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

export async function leerEspacio(id: string): Promise<ResultadoLeer> {
    if (!esUuid(id)) return { ok: false, motivo: "no-encontrado" };
    try {
        const { data, error } = await createClient().from("os_spaces").select("*").eq("id", id).maybeSingle();
        if (error) return { ok: false, motivo: "red" };
        if (!data) return { ok: false, motivo: (await miUid()) ? "no-encontrado" : "sin-sesion" };
        return { ok: true, espacio: mapearEspacio(data as Record<string, unknown>) };
    } catch {
        return { ok: false, motivo: "red" };
    }
}

/** Escribe el doc solo si el espacio sigue en `revEsperada`. */
export async function guardarEspacioCAS(id: string, doc: Record<string, unknown>, revEsperada: number): Promise<ResultadoGuardar> {
    try {
        const { data, error } = await createClient()
            .from("os_spaces")
            .update({ doc, device_id: instanciaId() })
            .eq("id", id)
            .eq("rev", revEsperada)
            .select("*")
            .maybeSingle();
        if (error) return { ok: false, motivo: error.code === "42501" ? "sin-permiso" : "red" };
        if (data) return { ok: true, espacio: mapearEspacio(data as Record<string, unknown>) };
        // Ninguna fila: o alguien guardó antes (rev distinto) o la política nos lo impide.
        const l = await leerEspacio(id);
        if (!l.ok) return { ok: false, motivo: l.motivo === "no-encontrado" ? "desaparecido" : "red" };
        return { ok: false, motivo: l.espacio.rev !== revEsperada ? "conflicto" : "sin-permiso" };
    } catch {
        return { ok: false, motivo: "red" };
    }
}

/** Escucha los cambios de UN espacio (una sola suscripción con filtro `id=eq.<id>`). */
export function suscribirEspacio(id: string, alCambiar: (c: CambioRemoto) => void): () => void {
    try {
        const propia = instanciaId();
        return syncManager.subscribe<Record<string, unknown>>("os_spaces", "id", id, (p) => {
            if (p.eventType === "DELETE") return;
            const row = p.record;
            if (!row || row.device_id === propia) return;
            const doc = row.doc && typeof row.doc === "object" && !Array.isArray(row.doc) ? (row.doc as Record<string, unknown>) : null;
            alCambiar({ rev: Number(row.rev) || 0, doc, titulo: typeof row.title === "string" ? row.title : undefined });
        });
    } catch {
        return () => {};
    }
}

/**
 * ¿Puede esta persona editar? El dueño sí; un invitado según su rol (aceptando de paso la
 * invitación pendiente); en un espacio público sin invitación, no. Si entra por grupo o perfil
 * permitido se asume que sí y, si la política dijera que no, el primer guardado lo detecta.
 */
export async function puedoEditarEspacio(e: EspacioLeido): Promise<boolean> {
    const uid = await miUid();
    if (!uid) return false;
    if (e.propietario === uid) return true;
    try {
        await acceptSpaceInvite(e.id);
    } catch {
        /* best-effort */
    }
    try {
        const { data } = await createClient().from("os_space_editors").select("role,status").eq("space_id", e.id).eq("account", uid).maybeSingle();
        if (data) return data.status === "member" && data.role === "editor";
    } catch {
        /* cae a la regla por acceso */
    }
    return e.acceso !== "public";
}

// ───────────────────────────── crear y listar ─────────────────────────────

export async function crearEspacioVivo(vivo: TipoVivoEspacio, titulo: string, doc: Record<string, unknown>): Promise<string> {
    const space = await createSpace({ kind: "dashboard", title: titulo, access: "invite", doc: { ...doc, vivo } });
    if (!space) throw new Error(SIN_CUENTA);
    return space.id;
}

export interface ResumenEspacio {
    refId: string;
    titulo: string;
    actualizado: string;
    esMio: boolean;
    /** Invitación que aún no aceptaste. */
    pendiente: boolean;
}

const COLUMNAS_RESUMEN = "id,title,updated_at,owner_account,access";

/** Espacios de este tipo que son míos o de los que soy invitado (sin traer sus documentos). */
export async function listarEspaciosVivos(vivo: TipoVivoEspacio): Promise<ResumenEspacio[]> {
    try {
        const uid = await miUid();
        if (!uid) return [];
        const supabase = createClient();
        const propios = await supabase
            .from("os_spaces")
            .select(COLUMNAS_RESUMEN)
            .eq("kind", "dashboard")
            .eq("doc->>vivo", vivo)
            .eq("owner_account", uid)
            .order("updated_at", { ascending: false })
            .limit(100);
        const out = new Map<string, ResumenEspacio>();
        for (const r of (propios.data ?? []) as Record<string, unknown>[]) {
            out.set(String(r.id), { refId: String(r.id), titulo: String(r.title ?? "Sin título"), actualizado: String(r.updated_at ?? ""), esMio: true, pendiente: false });
        }
        const filas = await supabase.from("os_space_editors").select("space_id,status").eq("account", uid).in("status", ["member", "invited"]).limit(200);
        const estado = new Map<string, string>();
        for (const f of (filas.data ?? []) as { space_id: string; status: string }[]) estado.set(f.space_id, f.status);
        if (estado.size) {
            const ajenos = await supabase
                .from("os_spaces")
                .select(COLUMNAS_RESUMEN)
                .eq("kind", "dashboard")
                .eq("doc->>vivo", vivo)
                .in("id", [...estado.keys()])
                .order("updated_at", { ascending: false });
            for (const r of (ajenos.data ?? []) as Record<string, unknown>[]) {
                const id = String(r.id);
                if (out.has(id)) continue;
                out.set(id, { refId: id, titulo: String(r.title ?? "Sin título"), actualizado: String(r.updated_at ?? ""), esMio: false, pendiente: estado.get(id) === "invited" });
            }
        }
        return [...out.values()].sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1));
    } catch {
        return [];
    }
}
