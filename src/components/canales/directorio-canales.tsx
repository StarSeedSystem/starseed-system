"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canales StarSeed (Ola 285 · K5) — directorio en tiempo real.
 * ---------------------------------------------------------------------------
 * Rejilla de canales públicos con buscador, filtros por categoría y plataforma,
 * orden «Recientes | Más seguidos», seguimiento optimista y gestión de los
 * canales propios (editar/borrar). Vive en la sección pública /canales.
 *
 * Tiempo real: `useRealtimeRows("os_canales", cargarCanales)` carga 200 canales
 * y aplica en memoria los INSERT/UPDATE/DELETE de Supabase Realtime, de modo
 * que un canal publicado al instante aparece para todos sin recargar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Send, Youtube, MessageCircle, Twitter, Instagram, Rss, Globe, Link2, Users, ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import { listarCanales, seguirCanal, borrarCanal, categoriasPopulares, type CanalPublico, type CanalPlataforma, type CanalUltimoMensaje } from "@/lib/canales/publicos";
import { NuevoCanal } from "@/components/canales/nuevo-canal";

const ICONO_PLATAFORMA: Record<CanalPlataforma, LucideIcon> = { telegram: Send, youtube: Youtube, whatsapp: MessageCircle, x: Twitter, instagram: Instagram, rss: Rss, web: Globe, otro: Link2 };
const PLATAFORMAS: CanalPlataforma[] = ["telegram", "youtube", "whatsapp", "x", "instagram", "rss", "web", "otro"];
const ETIQUETA_PLATAFORMA: Record<CanalPlataforma, string> = { telegram: "Telegram", youtube: "YouTube", whatsapp: "WhatsApp", x: "X", instagram: "Instagram", rss: "RSS", web: "Web", otro: "Otro" };
const CAMPOS_TEXTO = ["texto", "text", "message", "mensaje", "content"] as const;
const CAMPOS_FECHA = ["fecha", "hora", "date", "timestamp", "ts", "created_at"] as const;

// Extrae texto/fecha del JSONB libre `ultimo_mensaje` (sin contrato duro).
function textoUltimoMensaje(m: CanalUltimoMensaje): string | null {
    if (!m) return null;
    for (const c of CAMPOS_TEXTO) { const v = m[c]; if (typeof v === "string" && v.trim()) return v.trim(); }
    return null;
}
function fechaUltimoMensaje(m: CanalUltimoMensaje): string | null {
    if (!m) return null;
    for (const c of CAMPOS_FECHA) { const v = m[c]; if (typeof v === "string" || typeof v === "number") return String(v); }
    return null;
}
function haceCuanto(valor: string): string {
    const t = new Date(valor).getTime();
    if (Number.isNaN(t)) return "";
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return "ahora mismo";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} día${d > 1 ? "s" : ""}`;
    const sem = Math.floor(d / 7);
    if (sem < 5) return `hace ${sem} sem`;
    return new Date(t).toLocaleDateString("es-ES");
}

// Cargador puro fuera del componente (devuelve [] en SSR y ante error).
const cargarCanales = (): Promise<CanalPublico[]> => listarCanales({ limite: 200 });

export function DirectorioCanales() {
    const { rows, loading, reload } = useRealtimeRows<CanalPublico>("os_canales", cargarCanales);
    const [texto, setTexto] = useState("");
    const [categoria, setCategoria] = useState<string | null>(null);
    const [plataforma, setPlataforma] = useState<CanalPlataforma | null>(null);
    const [orden, setOrden] = useState<"recientes" | "seguidos">("recientes");
    const [userId, setUserId] = useState<string | null>(null);
    const [siguiendo, setSiguiendo] = useState<Record<string, boolean>>({});
    const [siguiendoId, setSiguiendoId] = useState<string | null>(null);
    const [ajusteSeguidores, setAjusteSeguidores] = useState<Record<string, number>>({});
    const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
    const [mostrarNuevo, setMostrarNuevo] = useState(false);
    const [editando, setEditando] = useState<CanalPublico | null>(null);

    // Sesión + canales que el usuario ya sigue (para el estado del botón).
    useEffect(() => {
        if (typeof window === "undefined") return;
        let vivo = true;
        (async () => {
            try {
                const sb = createClient();
                const { data: u } = await sb.auth.getUser();
                const uid = u?.user?.id ?? null;
                if (!vivo) return;
                setUserId(uid);
                if (uid) {
                    const { data } = await sb.from("os_canales_seguidores").select("canal_id").eq("seguidor", uid);
                    if (vivo && data) setSiguiendo(Object.fromEntries((data as { canal_id: string }[]).map((d) => [d.canal_id, true])));
                }
            } catch { /* sin sesión/red: propiedad y seguimiento quedan desactivados */ }
        })();
        return () => { vivo = false; };
    }, []);

    const populares = useMemo(() => categoriasPopulares(rows).slice(0, 8), [rows]);
    const visibles = useMemo(() => {
        const q = texto.trim().toLowerCase();
        const base = rows.filter((c) =>
            (!q || c.nombre.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q)) &&
            (!categoria || c.categorias.includes(categoria)) &&
            (!plataforma || c.plataforma === plataforma));
        return [...base].sort((a, b) => orden === "seguidos"
            ? (b.seguidores + (ajusteSeguidores[b.id] ?? 0)) - (a.seguidores + (ajusteSeguidores[a.id] ?? 0))
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [rows, texto, categoria, plataforma, orden, ajusteSeguidores]);

    // Sigue/des-sigue con actualización optimista y reversible ante fallo.
    const alternarSeguir = useCallback(async (canal: CanalPublico) => {
        if (siguiendoId) return;
        const siguiente = !siguiendo[canal.id];
        setSiguiendo((s) => ({ ...s, [canal.id]: siguiente }));
        setAjusteSeguidores((a) => ({ ...a, [canal.id]: (a[canal.id] ?? 0) + (siguiente ? 1 : -1) }));
        setSiguiendoId(canal.id);
        const r = await seguirCanal(canal.id, siguiente);
        setSiguiendoId(null);
        if (!r.ok) {
            setSiguiendo((s) => ({ ...s, [canal.id]: !siguiente }));
            setAjusteSeguidores((a) => ({ ...a, [canal.id]: (a[canal.id] ?? 0) - (siguiente ? 1 : -1) }));
        }
    }, [siguiendo, siguiendoId]);

    // Borrado en dos pasos: primera pulsación confirma, segunda ejecuta.
    const intentarBorrar = useCallback(async (canal: CanalPublico) => {
        if (confirmarBorrar !== canal.id) { setConfirmarBorrar(canal.id); return; }
        setConfirmarBorrar(null);
        const r = await borrarCanal(canal.id);
        if (r.ok) void reload();
    }, [confirmarBorrar, reload]);

    const chip = (activo: boolean, extra?: string) => "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] " +
        (activo ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-muted-foreground hover:text-white") + (extra ?? "");

    return (
        <div data-testid="directorio-canales" className="flex flex-col gap-4">
            {/* Búsqueda + alta */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 backdrop-blur">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o descripción…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
                </div>
                <button onClick={() => setMostrarNuevo((v) => !v)} className="cursor-pointer rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25">
                    <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Publicar mi canal</span>
                </button>
            </div>

            {/* Filtro por plataforma */}
            <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setPlataforma(null)} className={chip(plataforma === null)}>Todas</button>
                {PLATAFORMAS.map((p) => { const I = ICONO_PLATAFORMA[p]; const a = plataforma === p; return (
                    <button key={p} onClick={() => setPlataforma(a ? null : p)} className={"inline-flex items-center gap-1 " + chip(a)}>
                        <I className="h-3 w-3" /> {ETIQUETA_PLATAFORMA[p]}
                    </button>); })}
            </div>

            {/* Categorías populares + orden */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setCategoria(null)} className={chip(categoria === null, " border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20")}>Todas</button>
                    {populares.map((p) => { const a = categoria === p.categoria; return (
                        <button key={p.categoria} onClick={() => setCategoria(a ? null : p.categoria)} className={chip(a, " border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20")}>
                            {p.categoria} · {p.total}
                        </button>); })}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    {([{ id: "recientes", l: "Recientes" }, { id: "seguidos", l: "Más seguidos" }] as const).map((o) => (
                        <button key={o.id} onClick={() => setOrden(o.id)} className={chip(orden === o.id)}>{o.l}</button>))}
                </div>
            </div>

            {/* Alta y edición */}
            {(mostrarNuevo || editando) && (
                <NuevoCanal canal={editando} sugerencias={populares.map((p) => p.categoria)} onPublicado={() => { setMostrarNuevo(false); setEditando(null); void reload(); }} />
            )}

            {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                            <div className="h-4 w-2/3 rounded bg-white/10" />
                            <div className="mt-2 h-3 w-1/3 rounded bg-white/10" />
                            <div className="mt-3 h-3 w-full rounded bg-white/5" />
                            <div className="mt-1.5 h-3 w-4/5 rounded bg-white/5" />
                        </div>))}
                </div>
            ) : visibles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-8 text-center backdrop-blur">
                    <p className="text-sm text-muted-foreground">{rows.length === 0 ? "Aún no hay canales: publica el primero." : "No hay canales que coincidan con tu búsqueda."}</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibles.map((canal) => { const PI = ICONO_PLATAFORMA[canal.plataforma];
                        const tu = textoUltimoMensaje(canal.ultimoMensaje); const fu = fechaUltimoMensaje(canal.ultimoMensaje);
                        const total = canal.seguidores + (ajusteSeguidores[canal.id] ?? 0);
                        const propio = userId !== null && canal.ownerId === userId;
                        const sig = Boolean(siguiendo[canal.id]); const borrando = confirmarBorrar === canal.id;
                        return (
                        <article key={canal.id} className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur transition-colors hover:border-white/20">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    {canal.imagen
                                        ? <img src={canal.imagen} alt="" className="h-9 w-9 rounded-lg border border-white/10 object-cover" />
                                        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5"><PI className="h-4 w-4 text-muted-foreground" /></span>}
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-semibold">{canal.nombre}</h3>
                                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><PI className="h-3 w-3" /> {ETIQUETA_PLATAFORMA[canal.plataforma]}</span>
                                    </div>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Users className="h-3 w-3" /> {total}</span>
                            </div>
                            {canal.categorias.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {canal.categorias.slice(0, 4).map((cat) => (
                                        <button key={cat} onClick={() => setCategoria(cat)} className="cursor-pointer rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10">{cat}</button>))}
                                </div>)}
                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{canal.descripcion || "Sin descripción."}</p>
                            {tu && (
                                <p className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/60">
                                    <span className="text-white/40">último ·</span> {tu.length > 90 ? tu.slice(0, 90) + "…" : tu}{fu && <span className="ml-1 text-white/35">({haceCuanto(fu)})</span>}
                                </p>)}
                            <div className="mt-auto flex items-center gap-1.5 pt-1">
                                <a href={canal.enlace} target="_blank" rel="noreferrer noopener" className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10">
                                    Abrir canal <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                                <button onClick={() => void alternarSeguir(canal)} disabled={!userId || siguiendoId === canal.id}
                                    className={"cursor-pointer rounded-md border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60 " +
                                        (sig ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10" : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25")}>
                                    {sig ? "Siguiendo" : "Seguir"}
                                </button>
                                {propio && (<>
                                    <button onClick={() => setEditando(editando?.id === canal.id ? null : canal)} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/80 hover:bg-white/10" aria-label="Editar canal"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => void intentarBorrar(canal)} className={"inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-xs " +
                                        (borrando ? "border-red-500/40 bg-red-500/20 text-red-200" : "border-white/10 bg-white/5 text-white/80 hover:bg-red-500/10")} aria-label="Borrar canal">
                                        <Trash2 className="h-3 w-3" />{borrando ? "¿Seguro?" : ""}
                                    </button>
                                </>)}
                            </div>
                        </article>); })}
                </div>)}
        </div>
    );
}