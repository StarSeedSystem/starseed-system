"use client";

/**
 * GENESIS · PUERTOS REALES DEL OS (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Las implementaciones de `PuertosGenesis` sobre los módulos que ya existen:
 *   · perfil: `os_profiles` (identidad soberana; espejo en `profiles`) o
 *     `profiles` si la cuenta aún no tiene fila soberana; facetas en
 *     `os_account_profiles`. Todo con la sesión y la RLS de la persona.
 *   · páginas y grupos: `os_pages` / `os_groups` (`createPage` de os-social).
 *   · dock: `loadDockConfig` / `saveDockConfig` + evento `starseed:dock`.
 *   · tableros: `starseed_dashboards` / `starseed_widgets` + aviso por
 *     BroadcastChannel (la misma vía que usa el Dashboard).
 *   · agentes: biblioteca personal (`src/lib/agents/store.ts`).
 * La apariencia la inyecta el componente (vive en un contexto de React).
 * Lo pesado (os-social arrastra la malla) se carga a demanda.
 */

import { createClient } from "@/utils/supabase/client";
import { loadDockConfig, saveDockConfig, DOCK_ICON_MAP, type DockItemConfig } from "@/components/layout/dock-config";
import { getManifest, WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { createAgent, deleteAgent, bindAgent, unbindAgent } from "@/lib/agents/store";
import type { FilaDock, PuertosGenesis, TablaPerfil, WidgetTablero } from "./aplicar";
import type { TipoEntidad } from "./operaciones";

const LS_TABLEROS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const CAMPOS_PERFIL = ["display_name", "bio", "avatar_url", "cover_url"];
const CAMPOS_FACETA = ["name", "bio", "avatar_url", "cover_url"];

type Fila = Record<string, unknown>;

function sb() {
    return createClient();
}

async function miCuenta(): Promise<string | null> {
    try {
        const { data } = await sb().auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

function elegir(fila: Fila, campos: string[]): Record<string, string | null> {
    const salida: Record<string, string | null> = {};
    for (const c of campos) {
        const v = fila[c];
        salida[c] = typeof v === "string" ? v : v == null ? null : String(v);
    }
    return salida;
}

function partirClave(clave: string): [string, string] {
    const i = clave.indexOf(":");
    return [clave.slice(0, i), clave.slice(i + 1)];
}

function leerJson<T>(clave: string, defecto: T): T {
    try {
        const raw = window.localStorage.getItem(clave);
        return raw ? (JSON.parse(raw) as T) : defecto;
    } catch {
        return defecto;
    }
}

function avisarTableros(): void {
    try {
        const ch = new BroadcastChannel("starseed-dashboard");
        ch.postMessage({ type: "data:changed", scope: "widgets", at: Date.now() });
        ch.close();
    } catch {
        /* sin BroadcastChannel: el Dashboard relee al abrirse */
    }
}

/** Puertos reales. `apariencia` la añade el componente que tiene el contexto. */
export function puertosDelOs(apariencia?: PuertosGenesis["apariencia"]): PuertosGenesis {
    return {
        perfil: {
            async leer(faceta) {
                const uid = await miCuenta();
                if (!uid) return { ok: false, motivo: "Inicia sesión para cambiar tu perfil." };
                const c = sb();
                if (faceta) {
                    const { data, error } = await c.from("os_account_profiles").select("*").eq("id", faceta).eq("account", uid).maybeSingle();
                    if (error || !data) return { ok: false, motivo: "No encuentro esa faceta de tu perfil." };
                    return { ok: true, tabla: "os_account_profiles", clave: `id:${faceta}`, valores: elegir(data as Fila, CAMPOS_FACETA) };
                }
                for (const col of ["user_id", "id"]) {
                    const { data, error } = await c.from("os_profiles").select("*").eq(col, uid).maybeSingle();
                    if (!error && data) return { ok: true, tabla: "os_profiles", clave: `${col}:${uid}`, valores: elegir(data as Fila, CAMPOS_PERFIL) };
                }
                const { data } = await c.from("profiles").select("*").eq("user_id", uid).maybeSingle();
                if (data) return { ok: true, tabla: "profiles", clave: `user_id:${uid}`, valores: elegir(data as Fila, CAMPOS_PERFIL) };
                return { ok: false, motivo: "Todavía no tienes perfil: créalo una vez en Ajustes › Perfil." };
            },
            async escribir(tabla: TablaPerfil, clave, valores) {
                const [col, val] = partirClave(clave);
                const c = sb();
                const { data, error } = await c.from(tabla).update(valores).eq(col, val).select("*");
                if (error) return { ok: false, filas: 0, motivo: error.message };
                const filas = Array.isArray(data) ? data.length : 0;
                if (filas > 0 && tabla === "os_profiles") {
                    // Espejo en `profiles` (lo leen el rito de bienvenida y el resolvedor): mejor esfuerzo.
                    try {
                        await c.from("profiles").update(valores).eq("user_id", val);
                    } catch {
                        /* espejo opcional */
                    }
                }
                if (filas > 0 && tabla === "os_account_profiles") {
                    try {
                        window.dispatchEvent(new Event("starseed:profiles"));
                    } catch {
                        /* noop */
                    }
                }
                return { ok: true, filas };
            },
        },
        entidad: {
            async crearPagina(datos) {
                const { createPage } = await import("@/lib/os-social");
                const r = await createPage({ name: datos.nombre, description: datos.descripcion, tags: datos.etiquetas, accent: datos.acento });
                if (r.needsAuth) return { ok: false, motivo: "Inicia sesión para crear páginas." };
                return r.ok ? { ok: true, slug: r.slug } : { ok: false, motivo: r.error ?? "No se pudo crear la página." };
            },
            async leer(tipo: TipoEntidad, slug) {
                const tabla = tipo === "grupo" ? "os_groups" : "os_pages";
                const { data, error } = await sb().from(tabla).select("*").eq("slug", slug).maybeSingle();
                if (error) return { ok: false, motivo: error.message };
                if (!data) return { ok: false, motivo: `No encuentro «${slug}».` };
                return { ok: true, valores: data as Fila };
            },
            async escribir(tipo: TipoEntidad, slug, valores, opciones) {
                const tabla = tipo === "grupo" ? "os_groups" : "os_pages";
                let consulta = sb().from(tabla).update(valores).eq("slug", slug);
                if (opciones?.soloDueña) {
                    const uid = await miCuenta();
                    if (!uid) return { ok: false, filas: 0, motivo: "Inicia sesión." };
                    consulta = consulta.eq("owner_id", uid);
                }
                const { data, error } = await consulta.select("id");
                if (error) return { ok: false, filas: 0, motivo: error.message };
                return { ok: true, filas: Array.isArray(data) ? data.length : 0 };
            },
            async contarPublicaciones(slug) {
                const { countPosts } = await import("@/lib/os-social");
                return countPosts("page", slug);
            },
            async borrarPagina(slug) {
                const { deleteEntity } = await import("@/lib/os-social");
                const r = await deleteEntity("page", slug);
                return r.ok ? { ok: true } : { ok: false, motivo: r.error ?? "No se pudo borrar." };
            },
        },
        apariencia,
        dock: {
            leer: () => loadDockConfig() as unknown as FilaDock[],
            guardar(items) {
                saveDockConfig(items as unknown as DockItemConfig[]);
                try {
                    window.dispatchEvent(new Event("starseed:dock"));
                } catch {
                    /* noop */
                }
            },
            iconoValido: (clave) => Object.prototype.hasOwnProperty.call(DOCK_ICON_MAP, clave),
        },
        tableros: {
            listar() {
                const lista = leerJson<{ id?: string; name?: string; is_default?: boolean }[]>(LS_TABLEROS, []);
                return (Array.isArray(lista) ? lista : [])
                    .filter((t) => typeof t?.id === "string")
                    .map((t) => ({ id: t.id as string, nombre: t.name || "Sin nombre", principal: t.is_default === true }));
            },
            leerWidgets(tablero) {
                const todo = leerJson<Record<string, WidgetTablero[]>>(LS_WIDGETS, {});
                return Array.isArray(todo?.[tablero]) ? todo[tablero] : [];
            },
            guardarWidgets(tablero, widgets) {
                const todo = leerJson<Record<string, WidgetTablero[]>>(LS_WIDGETS, {});
                todo[tablero] = widgets;
                window.localStorage.setItem(LS_WIDGETS, JSON.stringify(todo));
                avisarTableros();
            },
            widgetConocido(tipo) {
                const m = getManifest(tipo as WidgetType);
                return m ? { w: m.w, h: m.h, minW: m.minW, minH: m.minH, nombre: m.label } : null;
            },
        },
        agentes: {
            crear(datos) {
                try {
                    const a = createAgent({
                        name: datos.nombre,
                        description: datos.descripcion,
                        persona: datos.persona,
                        icon: datos.icono,
                        visibility: datos.visibilidad ?? "private",
                        author: "Genesis",
                    });
                    return { id: a.id };
                } catch {
                    return null;
                }
            },
            borrar: (id) => deleteAgent(id),
            vincular: (id, tipo, entidadId, publico) => bindAgent(id, tipo, entidadId, publico ? "public" : "private") !== null,
            desvincular(id, tipo, entidadId) {
                unbindAgent(id, tipo, entidadId);
            },
        },
        ahora: () => Date.now(),
        nuevoId: () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
    };
}

/** Lo que el agente necesita saber de la cuenta (compacto; se manda a /api/genesis/proponer). */
export async function contextoDeMiCuenta(): Promise<{
    contexto: import("./traductor").ContextoGenesis;
    paginasPropias: string[];
}> {
    const p = puertosDelOs();
    const contexto: import("./traductor").ContextoGenesis = {};
    let paginasPropias: string[] = [];
    try {
        const perfil = await p.perfil.leer();
        if (perfil.ok) contexto.perfil = { nombre: perfil.valores.display_name ?? undefined, bio: (perfil.valores.bio ?? "").slice(0, 300) };
    } catch {
        /* sin perfil */
    }
    const uid = await miCuenta();
    if (uid) {
        try {
            const c = sb();
            const [facetas, paginas] = await Promise.all([
                c.from("os_account_profiles").select("id,name,is_default").eq("account", uid).limit(20),
                c.from("os_pages").select("slug,name").eq("owner_id", uid).limit(30),
            ]);
            contexto.facetas = ((facetas.data ?? []) as Fila[]).filter((f) => f.is_default !== true).map((f) => ({ id: String(f.id), nombre: String(f.name ?? "") }));
            contexto.paginas = ((paginas.data ?? []) as Fila[]).map((x) => ({ slug: String(x.slug), nombre: String(x.name ?? "") }));
            paginasPropias = contexto.paginas.map((x) => x.slug);
        } catch {
            /* sin red: el agente trabaja con menos contexto */
        }
    }
    try {
        contexto.dock = p.dock.leer().map((b) => ({ id: b.id, etiqueta: b.label, ruta: b.path, activo: b.enabled }));
        contexto.tableros = p.tableros.listar().map((t) => ({ id: t.id, nombre: t.nombre }));
        contexto.widgets = Object.entries(WIDGET_MANIFEST)
            .filter(([, m]) => !!m)
            .map(([tipo, m]) => ({ tipo, nombre: m!.label }));
    } catch {
        /* sin almacenamiento local */
    }
    return { contexto, paginasPropias };
}
