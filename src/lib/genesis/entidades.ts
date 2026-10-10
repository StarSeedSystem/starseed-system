"use client";

/**
 * POLIGENESIS · ENTIDADES QUE GESTIONO, MODO DE GOBIERNO Y PROPUESTAS (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Mis entidades: las páginas y grupos de los que soy dueña (`owner_id`) o en
 *     los que tengo rol (`os_entity_roles.account_id`), con su rango (mismo que
 *     `public.access_role_rank`). Solo se listan las de rango ≥ 2.
 *   · Modo: el del motor de gobernanza (`governance_configs`; sin fila, el OS
 *     trata la entidad como democrática y así se dice).
 *   · Proponer: en modo democrático, «aplicar» crea una propuesta del motor de
 *     gobernanza con comando `custom` (origen `genesis`) que lleva la operación
 *     validada; cuando se aprueba, quien gestiona la aplica desde PoliGenesis y
 *     se vuelve a validar.
 */

import { createClient } from "@/utils/supabase/client";
import { rangoDeRol, validarOperacion, describirOperacion, type Ambito, type EntidadAmbito, type Operacion } from "./operaciones";

export interface EntidadGestionable extends EntidadAmbito {
    rol: string;
    rango: number;
    dueña: boolean;
}

type Fila = Record<string, unknown>;

export async function misEntidades(): Promise<{ ok: true; lista: EntidadGestionable[] } | { ok: false; motivo: string }> {
    try {
        const c = createClient();
        const { data: s } = await c.auth.getSession();
        const uid = s.session?.user?.id;
        if (!uid) return { ok: false, motivo: "Inicia sesión para ver tus grupos y páginas." };

        const [pp, gg, roles] = await Promise.all([
            c.from("os_pages").select("id,slug,name").eq("owner_id", uid).limit(50),
            c.from("os_groups").select("id,slug,name").eq("owner_id", uid).limit(50),
            c.from("os_entity_roles").select("entity_id,role").eq("account_id", uid).limit(200),
        ]);
        const porId = new Map<string, EntidadGestionable>();
        for (const [filas, tipo] of [[pp.data, "pagina"], [gg.data, "grupo"]] as const) {
            for (const f of (filas ?? []) as Fila[]) {
                porId.set(String(f.id), { tipo, id: String(f.id), slug: String(f.slug), nombre: String(f.name ?? f.slug), rol: "owner", rango: 4, dueña: true });
            }
        }
        const rolDe = new Map<string, number>();
        for (const r of (roles.data ?? []) as Fila[]) {
            const id = String(r.entity_id);
            rolDe.set(id, Math.max(rolDe.get(id) ?? 0, rangoDeRol(String(r.role ?? ""))));
        }
        const pendientes = [...rolDe.keys()].filter((id) => !porId.has(id) && (rolDe.get(id) ?? 0) >= 2);
        if (pendientes.length) {
            const [p2, g2] = await Promise.all([
                c.from("os_pages").select("id,slug,name").in("id", pendientes),
                c.from("os_groups").select("id,slug,name").in("id", pendientes),
            ]);
            for (const [filas, tipo] of [[p2.data, "pagina"], [g2.data, "grupo"]] as const) {
                for (const f of (filas ?? []) as Fila[]) {
                    const rango = rolDe.get(String(f.id)) ?? 0;
                    porId.set(String(f.id), {
                        tipo,
                        id: String(f.id),
                        slug: String(f.slug),
                        nombre: String(f.name ?? f.slug),
                        rol: rango >= 3 ? "gestión" : "colaboración",
                        rango,
                        dueña: false,
                    });
                }
            }
        }
        const lista = [...porId.values()].sort((a, b) => b.rango - a.rango || a.nombre.localeCompare(b.nombre));
        return { ok: true, lista };
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "Sin red." };
    }
}

function scopeDe(e: EntidadAmbito): "page" | "group" {
    return e.tipo === "grupo" ? "group" : "page";
}

/** Modo de gobierno de la entidad según el motor de gobernanza. */
export async function modoDe(e: EntidadAmbito): Promise<{ democratico: boolean; explicito: boolean }> {
    try {
        const { getConfig } = await import("@/lib/governance/config");
        const cfg = await getConfig(scopeDe(e), e.slug);
        return { democratico: cfg.mode === "democratic", explicito: Boolean(cfg.id) };
    } catch {
        return { democratico: true, explicito: false };
    }
}

/** Crea la propuesta que lleva la operación. Devuelve su id. */
export async function proponer(e: EntidadAmbito, op: Operacion): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> {
    const ambito: Ambito = { tipo: "entidad", entidad: e };
    const vista = describirOperacion(op, ambito);
    try {
        const { createProposal } = await import("@/lib/governance/engine");
        const r = await createProposal({
            scope: scopeDe(e),
            scopeRef: e.slug,
            title: `PoliGenesis · ${vista.titulo}`.slice(0, 160),
            description: [`Motivo: ${op.motivo}`, ...vista.detalles.map((d) => `· ${d}`), "", "Si se aprueba, quien gestiona la entidad la aplica desde PoliGenesis (se vuelve a comprobar antes)."].join("\n"),
            kind: "decision",
            command: { type: "custom", payload: { label: vista.titulo, spec: JSON.stringify(op), origen: "genesis", entidad_id: e.id } },
        });
        return r.ok && r.id ? { ok: true, id: r.id } : { ok: false, motivo: r.error ?? "No se pudo crear la propuesta." };
    } catch (err) {
        return { ok: false, motivo: err instanceof Error ? err.message : "No se pudo crear la propuesta." };
    }
}

export interface PropuestaGenesis {
    id: string;
    titulo: string;
    estado: string;
    creada: string;
    /** La operación ya revalidada; null si ya no es válida (se dice por qué). */
    op: Operacion | null;
    problema?: string;
}

/** Propuestas de Genesis de esta entidad: en votación y aprobadas. */
export async function propuestasDe(e: EntidadAmbito): Promise<{ ok: true; lista: PropuestaGenesis[] } | { ok: false; motivo: string }> {
    try {
        const { data, error } = await createClient()
            .from("proposals")
            .select("id,title,status,command,created_at")
            .eq("scope", scopeDe(e))
            .eq("scope_ref", e.slug)
            .order("created_at", { ascending: false })
            .limit(40);
        if (error) return { ok: false, motivo: error.message };
        const ambito: Ambito = { tipo: "entidad", entidad: e };
        const lista: PropuestaGenesis[] = [];
        for (const f of (data ?? []) as Fila[]) {
            const cmd = (f.command ?? {}) as { type?: string; payload?: Record<string, unknown> };
            if (cmd.type !== "custom" || cmd.payload?.origen !== "genesis") continue;
            let op: Operacion | null = null;
            let problema: string | undefined;
            try {
                const v = validarOperacion(JSON.parse(String(cmd.payload?.spec ?? "null")), { ambito });
                if (v.ok) op = v.op;
                else problema = v.problemas.join(" ");
            } catch {
                problema = "La propuesta no trae una operación legible.";
            }
            lista.push({ id: String(f.id), titulo: String(f.title ?? ""), estado: String(f.status ?? ""), creada: String(f.created_at ?? ""), op, ...(problema ? { problema } : {}) });
        }
        return { ok: true, lista };
    } catch (err) {
        return { ok: false, motivo: err instanceof Error ? err.message : "Sin red." };
    }
}

/** ¿La propuesta ya pasó la votación? (el motor marca `passed` o, tras su comando, `executed`). */
export function propuestaAprobada(estado: string): boolean {
    return estado === "passed" || estado === "executed";
}
