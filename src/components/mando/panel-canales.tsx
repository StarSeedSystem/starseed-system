"use client";

/**
 * Panel «Canales StarSeed» del Centro de Mando (Ola 285 · K2 · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tarjetas por canal, editor completo, alta de canales de cualquier plataforma
 * (las «próximamente» marcadas), sembrado desde Telegram, envío de prueba con
 * el bot del usuario y últimas publicaciones. Todo viene de `GET /api/mando/
 * canales` (SOLO local); las acciones usan el `POST` (guardar/borrar/estado/
 * sembrar/publicar-prueba/registrar). El envío real a Telegram usa SIEMPRE el
 * token del navegador del usuario (`sendTelegram`): nunca sube al servidor.
 */

import { useCallback, useEffect, useState } from "react";
import { CircleDashed, Edit3, ExternalLink, Plus, RefreshCw, Send, Trash2 } from "lucide-react";

import type { Brain } from "@/lib/brains/brains";
import { listBrains } from "@/lib/brains/brains";
import type { CanalStarSeed, HistorialCanal, PlataformaCanal, PlataformaInfo } from "@/lib/canales/canales";
import { loadTelegramUserConfig, sendTelegram } from "@/lib/channels/telegram";
import type { PersonalityProfile } from "@/lib/aurora/personalities";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

interface RespuestaCanales {
    t: string;
    plataformas: PlataformaInfo[];
    canales: CanalStarSeed[];
    historial: HistorialCanal[];
}

interface Borrador {
    id?: string;
    nombre: string;
    plataforma: PlataformaCanal;
    enlace: string;
    identificador: string;
    tipo: "canal" | "grupo";
    descripcion: string;
    categorias: string[];
    personalidadId: string;
    cerebroId: string;
    cadenciaDia: number;
    formatos: string[];
    publicoEnDirectorio: boolean;
}

const FORMATOS: string[] = ["texto", "imagen", "audio", "vídeo", "encuesta", "quiz", "infografía"];

const PLACEHOLDER_ID: Record<string, string> = {
    telegram: "chatId de Telegram (p. ej. @nombredelcanal)",
    youtube: "id del canal de YouTube",
    whatsapp: "número de negocio (código + número)",
    x: "usuario/handle de la cuenta",
    instagram: "usuario de la cuenta",
    rss: "URL del feed",
    web: "URL de la página",
};

// Clases compartidas de campos y botones para no repetir el estilo del Mando.
const CLS_INPUT = "w-full cursor-text rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white/80";
const CLS_SELECT = "w-full cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white/80";
const CLS_BTN = "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10";
const CLS_CHIP = "rounded-full border px-2 py-0.5 text-[11px]";

function nuevo(): Borrador {
    return {
        nombre: "", plataforma: "telegram", enlace: "", identificador: "", tipo: "canal",
        descripcion: "", categorias: [], personalidadId: "", cerebroId: "",
        cadenciaDia: 3, formatos: [], publicoEnDirectorio: true,
    };
}

function deCanal(c: CanalStarSeed): Borrador {
    return {
        id: c.id, nombre: c.nombre, plataforma: c.plataforma, enlace: c.enlace,
        identificador: c.identificador, tipo: c.tipo, descripcion: c.descripcion,
        categorias: [...c.categorias], personalidadId: c.personalidadId ?? "",
        cerebroId: c.cerebroId ?? "", cadenciaDia: c.cadenciaDia,
        formatos: [...c.formatos], publicoEnDirectorio: c.publicoEnDirectorio,
    };
}

function nombrePers(personalidades: PersonalityProfile[], id: string | null): string {
    if (!id) return "sin telecomunicador";
    return personalidades.find((p) => p.id === id)?.name ?? id;
}

/** Panel «Canales StarSeed»: catálogo, editor, sembrado, prueba e historial. */
export function PanelCanales() {
    const [datos, setDatos] = useState<RespuestaCanales | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [personalidades, setPersonalidades] = useState<PersonalityProfile[]>([]);
    const [cerebros, setCerebros] = useState<Brain[]>([]);
    const [editor, setEditor] = useState<Borrador | null>(null);
    const [borrando, setBorrando] = useState<string | null>(null);
    const [probando, setProbando] = useState<{ canal: CanalStarSeed; texto: string } | null>(null);
    const [resultadoPrueba, setResultadoPrueba] = useState<string | null>(null);
    const [guardandoForm, setGuardandoForm] = useState(false);
    const [ocupado, setOcupado] = useState<string | null>(null);
    // Campo de categorías del editor (se limpia al añadir cada chip).
    const [campoCategoria, setCampoCategoria] = useState("");

    const cargar = useCallback(async () => {
        try {
            const respuesta = await fetch("/api/mando/canales", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(`No se pudo leer los canales (HTTP ${respuesta.status}).`);
                return;
            }
            setDatos((await respuesta.json()) as RespuestaCanales);
            setError(null);
        } catch {
            setError("No se pudo leer los canales.");
        } finally {
            setCargando(false);
        }
    }, []);

    // Sondeo cada 30 s, saltando la lectura con la pestaña oculta (patrón del Mando).
    useEffect(() => {
        let vivo = true;
        let pendiente = false;
        const medir = async () => {
            if (pendiente) return;
            pendiente = true;
            await cargar();
            pendiente = false;
        };
        const conFiltro = () => {
            if (vivo && document.visibilityState === "visible") void medir();
        };
        void conFiltro();
        const cada = window.setInterval(conFiltro, 30_000);
        const alVolver = () => {
            if (vivo && document.visibilityState === "visible") void medir();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [cargar]);

    // Personalidades (localStorage) y cerebros (Supabase, tolerante a fallos).
    useEffect(() => {
        let vivo = true;
        setPersonalidades(listPersonalityProfiles());
        void listBrains()
            .then((b) => {
                if (vivo) setCerebros(b);
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
        };
    }, []);

    const post = useCallback(async (cuerpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
        try {
            const respuesta = await fetch("/api/mando/canales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo),
            });
            const datosRespuesta = (await respuesta.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (!respuesta.ok) return { ok: false, error: datosRespuesta?.error ?? `HTTP ${respuesta.status}` };
            return { ok: datosRespuesta?.ok !== false };
        } catch {
            return { ok: false, error: "Sin conexión con la ruta de canales." };
        }
    }, []);

    const sembrar = useCallback(async () => {
        setOcupado("sembrar");
        const res = await post({ accion: "sembrar" });
        setOcupado(null);
        if (!res.ok) return void setError(res.error ?? "No se pudieron sembrar los canales.");
        void cargar();
    }, [post, cargar]);

    const guardar = useCallback(async () => {
        if (!editor) return;
        setGuardandoForm(true);
        const res = await post({
            accion: "guardar",
            canal: {
                id: editor.id, nombre: editor.nombre, plataforma: editor.plataforma,
                enlace: editor.enlace, identificador: editor.identificador, tipo: editor.tipo,
                descripcion: editor.descripcion, categorias: editor.categorias,
                personalidadId: editor.personalidadId || null, cerebroId: editor.cerebroId || null,
                cadenciaDia: editor.cadenciaDia, formatos: editor.formatos,
                publicoEnDirectorio: editor.publicoEnDirectorio,
            },
        });
        setGuardandoForm(false);
        if (!res.ok) return void setError(res.error ?? "No se pudo guardar el canal.");
        setEditor(null);
        void cargar();
    }, [editor, post, cargar]);

    const cambiarEstado = useCallback(async (canal: CanalStarSeed, activo: boolean) => {
        setOcupado(canal.id);
        const res = await post({ accion: "estado", id: canal.id, activo });
        setOcupado(null);
        if (!res.ok) return void setError(res.error ?? "No se pudo cambiar el estado.");
        void cargar();
    }, [post, cargar]);

    const borrar = useCallback(async (id: string) => {
        setOcupado(id);
        const res = await post({ accion: "borrar", id });
        setOcupado(null);
        setBorrando(null);
        if (!res.ok) return void setError(res.error ?? "No se pudo borrar el canal.");
        void cargar();
    }, [post, cargar]);

    // Prueba: prepara el texto, envía con el bot del usuario (solo Telegram; sin
    // token avisa sin fallar) y registra el resultado en el historial.
    const enviarPrueba = useCallback(async (canal: CanalStarSeed, texto: string) => {
        setProbando(null);
        setOcupado(canal.id);
        const preparado = await post({ accion: "publicar-prueba", id: canal.id, texto });
        if (!preparado.ok) {
            setOcupado(null);
            return void setError(preparado.error ?? "No se pudo preparar la prueba.");
        }
        let ok = true;
        let detalle = "Prueba registrada sin envío real (plataforma no conectada).";
        if (canal.plataforma === "telegram") {
            const cfg = loadTelegramUserConfig();
            if (!cfg.botToken.trim() || !cfg.chatId.trim()) {
                ok = false;
                detalle = "Configura tu bot en Conexiones.";
            } else {
                const enviado = await sendTelegram({ botToken: cfg.botToken, chatId: canal.identificador.trim() || cfg.chatId, text: texto });
                ok = enviado.ok;
                detalle = enviado.ok ? "Enviado con el bot del usuario." : (enviado.error ?? "Fallo al enviar.");
            }
        }
        setResultadoPrueba(ok ? `Prueba enviada: ${detalle}` : detalle);
        await post({ accion: "registrar", canalId: canal.id, texto, formato: "texto", ok, detalle });
        setOcupado(null);
        void cargar();
    }, [post, cargar]);

    const plataformas = datos?.plataformas ?? [];
    const infoDe = (id: PlataformaCanal): PlataformaInfo | undefined => plataformas.find((p) => p.id === id);
    const activos = (datos?.canales ?? []).filter((c) => c.activo).length;
    const pausados = (datos?.canales ?? []).filter((c) => !c.activo).length;

    return (
        <section data-testid="panel-canales" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">Canales StarSeed</h3>
                    <p className="text-[11px] text-white/40">
                        {datos?.canales.length ?? 0} canales · {activos} activos · {pausados} pausados
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {plataformas.map((p) => (
                        <span
                            key={p.id}
                            title={p.nota}
                            className={`${CLS_CHIP} ${
                                p.estado === "activa" ? "border-white/10 bg-white/5 text-white/60" : "border-white/5 bg-white/[0.02] text-white/35"
                            }`}
                        >
                            {p.nombre} {(datos?.canales ?? []).filter((c) => c.plataforma === p.id).length || ""}
                        </span>
                    ))}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" onClick={() => void cargar()} className={CLS_BTN}>
                        <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} aria-hidden /> Actualizar
                    </button>
                    <button
                        type="button"
                        onClick={() => void sembrar()}
                        disabled={ocupado === "sembrar"}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {ocupado === "sembrar" ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
                        Traer los canales de Telegram
                    </button>
                </div>
            </div>

            {error ? (
                <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{error}</p>
            ) : null}
            {resultadoPrueba ? (
                <p role="status" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">{resultadoPrueba}</p>
            ) : null}

            {editor ? (
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <h3 className="text-sm font-semibold text-white">{editor.id ? `Editar canal · ${editor.nombre}` : "Nuevo canal"}</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Nombre</span>
                            <input type="text" value={editor.nombre} onChange={(e) => setEditor({ ...editor, nombre: e.target.value })} placeholder="Nombre del canal" className={CLS_INPUT} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Plataforma</span>
                            <select value={editor.plataforma} onChange={(e) => setEditor({ ...editor, plataforma: e.target.value as PlataformaCanal })} className={CLS_SELECT}>
                                {plataformas.map((p) => (
                                    <option key={p.id} value={p.id}>{p.nombre}{p.estado === "proximamente" ? " · próximamente" : ""}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Enlace</span>
                            <input type="text" value={editor.enlace} onChange={(e) => setEditor({ ...editor, enlace: e.target.value })} placeholder="https://…" className={CLS_INPUT} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Identificador</span>
                            <input type="text" value={editor.identificador} onChange={(e) => setEditor({ ...editor, identificador: e.target.value })} placeholder={PLACEHOLDER_ID[editor.plataforma] ?? "Destino real en la plataforma"} className={CLS_INPUT} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Tipo</span>
                            <select value={editor.tipo} onChange={(e) => setEditor({ ...editor, tipo: e.target.value as "canal" | "grupo" })} className={CLS_SELECT}>
                                <option value="canal">Canal</option>
                                <option value="grupo">Grupo</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Cadencia (0-48 /día)</span>
                            <input type="number" min={0} max={48} value={editor.cadenciaDia} onChange={(e) => setEditor({ ...editor, cadenciaDia: Math.max(0, Math.min(48, Number(e.target.value) || 0)) })} className={CLS_INPUT} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Personalidad</span>
                            <select value={editor.personalidadId} onChange={(e) => setEditor({ ...editor, personalidadId: e.target.value })} className={CLS_SELECT}>
                                <option value="">Sin telecomunicador</option>
                                {personalidades.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Cerebro</span>
                            <select value={editor.cerebroId} onChange={(e) => setEditor({ ...editor, cerebroId: e.target.value })} className={CLS_SELECT}>
                                <option value="">Sin cerebro</option>
                                {cerebros.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.scope}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="mt-3 space-y-3">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-white/60">Descripción</span>
                            <textarea rows={2} value={editor.descripcion} onChange={(e) => setEditor({ ...editor, descripcion: e.target.value })} className={CLS_INPUT} />
                        </label>
                        <div>
                            <p className="mb-1.5 text-[11px] font-medium text-white/60">Categorías (libres)</p>
                            <div className="flex flex-wrap gap-1">
                                {editor.categorias.map((c) => (
                                    <span key={c} onClick={() => setEditor({ ...editor, categorias: editor.categorias.filter((x) => x !== c) })} title="Quitar categoría" className={`${CLS_CHIP} inline-flex cursor-pointer items-center gap-1 border-white/10 bg-white/5 text-white/60`}>#{c} ×</span>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={campoCategoria}
                                onChange={(e) => setCampoCategoria(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    const limpia = campoCategoria.trim().toLowerCase().replace(/,/g, "");
                                    if (limpia && !editor.categorias.includes(limpia)) setEditor({ ...editor, categorias: [...editor.categorias, limpia] });
                                    setCampoCategoria("");
                                }}
                                placeholder="Escribe una categoría y pulsa Enter"
                                className={`mt-1.5 ${CLS_INPUT}`}
                            />
                        </div>
                        <div>
                            <p className="mb-1.5 text-[11px] font-medium text-white/60">Formatos</p>
                            <div className="flex flex-wrap gap-3">
                                {FORMATOS.map((f) => (
                                    <label key={f} className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
                                        <input type="checkbox" checked={editor.formatos.includes(f)} onChange={(e) => setEditor({ ...editor, formatos: e.target.checked ? [...editor.formatos, f] : editor.formatos.filter((x) => x !== f) })} className="cursor-pointer accent-trinity-azure" />
                                        {f}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                            <input type="checkbox" checked={editor.publicoEnDirectorio} onChange={(e) => setEditor({ ...editor, publicoEnDirectorio: e.target.checked })} className="cursor-pointer accent-trinity-azure" />
                            Publicar en el directorio público de Canales
                        </label>
                    </div>
                    <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-3">
                        <button type="button" onClick={() => void guardar()} disabled={guardandoForm} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">
                            {guardandoForm ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                            {editor.id ? "Guardar cambios" : "Crear canal"}
                        </button>
                        <button type="button" onClick={() => setEditor(null)} className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Cancelar</button>
                        <button type="button" onClick={() => setEditor(nuevo())} className={`ml-auto ${CLS_BTN}`}><Plus className="h-3.5 w-3.5" aria-hidden /> Nuevo canal</button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-end">
                    <button type="button" onClick={() => setEditor(nuevo())} className={CLS_BTN}><Plus className="h-3.5 w-3.5" aria-hidden /> Nuevo canal</button>
                </div>
            )}

            {(datos?.canales.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm text-white/60">Aún no hay canales. Crea el primero o pulsa «Traer los canales de Telegram».</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {(datos?.canales ?? []).map((canal) => {
                        const info = infoDe(canal.plataforma);
                        const proximamente = info?.estado === "proximamente";
                        return (
                            <article key={canal.id} className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                                <header className="flex items-start gap-2">
                                    <span className="text-xl leading-none" aria-hidden>{info?.nombre.charAt(0) ?? "?"}</span>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="truncate text-sm font-semibold text-white">{canal.nombre}</h4>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <span className={`${CLS_CHIP} ${proximamente ? "border-white/5 bg-white/[0.02] text-white/35" : "border-white/10 bg-white/5 text-white/60"}`} title={proximamente ? info?.nota : undefined}>
                                                {info?.nombre ?? canal.plataforma}{proximamente ? " · próximamente" : ""}
                                            </span>
                                            <span className={`${CLS_CHIP} border-white/10 bg-white/5 text-white/50`}>{canal.tipo === "grupo" ? "grupo" : "canal"}</span>
                                            {!canal.activo ? <span className={`${CLS_CHIP} border-amber-400/30 bg-amber-500/10 text-amber-200`}>pausado</span> : null}
                                        </div>
                                    </div>
                                </header>
                                {proximamente && info?.nota ? <p className="mt-2 text-[11px] italic text-white/35">{info.nota}</p> : null}
                                {canal.enlace ? (
                                    <a href={canal.enlace} target="_blank" rel="noreferrer" className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs text-trinity-azure hover:underline">
                                        <ExternalLink className="h-3 w-3" aria-hidden /> Abrir en {info?.nombre ?? canal.plataforma}
                                    </a>
                                ) : null}
                                {canal.categorias.length ? (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {canal.categorias.map((c) => <span key={c} className={`${CLS_CHIP} border-white/10 bg-white/5 text-white/50`}>#{c}</span>)}
                                    </div>
                                ) : null}
                                <p className="mt-2 text-[11px] text-white/45">
                                    Atendido por: {nombrePers(personalidades, canal.personalidadId)}
                                    {canal.cerebroId ? ` · cerebro ${cerebros.find((b) => b.id === canal.cerebroId)?.name ?? canal.cerebroId}` : ""}
                                </p>
                                <p className="mt-1 text-[11px] text-white/45">Cadencia: {canal.cadenciaDia} publicación{canal.cadenciaDia === 1 ? "" : "es"}/día</p>
                                {canal.formatos.length ? <p className="mt-1 text-[11px] text-white/40">Formatos: {canal.formatos.join(" · ")}</p> : null}
                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                                    <button
                                        type="button"
                                        disabled={ocupado === canal.id}
                                        onClick={() => void cambiarEstado(canal, !canal.activo)}
                                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                                            canal.activo ? "border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                        }`}
                                    >
                                        {canal.activo ? "Pausar" : "Activar"}
                                    </button>
                                    <button type="button" onClick={() => setEditor(deCanal(canal))} className={CLS_BTN}><Edit3 className="h-3 w-3" aria-hidden /> Editar</button>
                                    <button type="button" onClick={() => setProbando({ canal, texto: "" })} className={CLS_BTN}><Send className="h-3 w-3" aria-hidden /> Prueba</button>
                                    {borrando === canal.id ? (
                                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-amber-200">
                                            ¿Seguro?
                                            <button type="button" onClick={() => void borrar(canal.id)} className="cursor-pointer rounded-md border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-red-200 hover:bg-red-500/20">Sí</button>
                                            <button type="button" onClick={() => setBorrando(null)} className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-white/70 hover:bg-white/10">No</button>
                                        </span>
                                    ) : (
                                        <button type="button" onClick={() => setBorrando(canal.id)} title="Borrar canal" className="ml-auto inline-flex cursor-pointer items-center rounded-md border border-white/10 bg-white/5 p-1.5 text-white/60 hover:bg-red-500/10 hover:text-red-200">
                                            <Trash2 className="h-3 w-3" aria-hidden />
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {probando ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 className="text-sm font-semibold text-white">Prueba · {probando.canal.nombre}</h3>
                    <p className="mt-1 text-[11px] text-white/45">
                        {probando.canal.plataforma === "telegram"
                            ? "Se enviará con el bot del usuario configurado en Conexiones."
                            : `La plataforma ${probando.canal.plataforma} aún no está conectada: se registrará la prueba sin envío real.`}
                    </p>
                    <textarea rows={3} value={probando.texto} onChange={(e) => setProbando({ ...probando, texto: e.target.value })} placeholder="Texto de la publicación de prueba…" className={`mt-2 ${CLS_INPUT}`} />
                    <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => void enviarPrueba(probando.canal, probando.texto)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20">
                            <Send className="h-3.5 w-3.5" aria-hidden /> Enviar prueba
                        </button>
                        <button type="button" onClick={() => setProbando(null)} className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">Cancelar</button>
                    </div>
                </div>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-semibold text-white">Últimas publicaciones</h3>
                {(datos?.historial.length ?? 0) ? (
                    <ul className="mt-2 space-y-1">
                        {(datos?.historial ?? []).map((h, i) => (
                            <li key={`${h.t}-${i}`} className="flex items-start gap-2 text-[11px] text-white/55">
                                <span className={h.ok ? "mt-px text-emerald-400" : "mt-px text-red-400"} aria-hidden>{h.ok ? "✓" : "✗"}</span>
                                <span className="shrink-0 font-mono text-white/40">{h.t.slice(0, 19).replace("T", " ")}</span>
                                <span className="shrink-0 text-white/60">{h.canalId}</span>
                                <span className="shrink-0 rounded bg-white/10 px-1 py-px text-[10px] text-white/50">{h.formato}</span>
                                <span className="truncate text-white/40">{h.detalle ?? h.texto}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-xs text-white/40">Sin publicaciones registradas.</p>
                )}
            </div>
        </section>
    );
}