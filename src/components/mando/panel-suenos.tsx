"use client";

/**
 * Panel «Sueños profundos» (Procesos del Puente de Mando · 2026-09-29)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «a través del Puente de Mando orquesta una flota de agentes de sueños profundos que
 * pueda llevar varias horas, donde analicen a detalle cada área de todo StarSeed OS».
 *
 * Qué enseña, todo leído del disco de esta máquina por `GET /api/mando/suenos` (sin Supabase):
 *   · la rejilla área × lente: estado de cada sueño (pendiente · soñando · por verificar ·
 *     verificado · ajustado · rechazado · fallo), proveedor, tokens estimados y quién lo verificó;
 *   · las recomendaciones ya ordenadas por el director (capacidad primero, verificado > ajustado
 *     > sin verificar), y la cola propuesta con «Abrir en Diseñador» (NO se lanza sola);
 *   · el diálogo de lanzamiento (horas, áreas, lentes) → `suenos.py lanzar`, con la regla de
 *     UN orquestador.
 * Lee cada 30 s y SOLO con la pestaña a la vista.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
    Check,
    Copy,
    FileText,
    Layers,
    Loader2,
    Lock,
    Moon,
    RefreshCw,
    Rocket,
    ShieldCheck,
    Wand2,
    X,
    Zap,
} from "lucide-react";

import { DisenadorOla } from "@/components/mando/disenador-ola";
import {
    LENTES_SUENOS,
    tonoSueno,
    type DatosSuenos,
    type EstadoSueno,
    type FilaSueno,
    type RecomendacionSueno,
} from "@/lib/mando/suenos-tipos";

const RUTA = "/api/mando/suenos";
const SONDEO_MS = 30_000;

const ETIQUETA: Record<EstadoSueno, string> = {
    pendiente: "pendiente",
    analizando: "soñando",
    informe: "por verificar",
    verificado: "verificado",
    ajustado: "ajustado",
    rechazado: "rechazado",
    fallo: "fallo",
    interrumpida: "interrumpido",
};

const CLASE_TONO: Record<ReturnType<typeof tonoSueno>, string> = {
    ok: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
    vivo: "border-sky-400/60 bg-sky-500/10 text-sky-200",
    espera: "border-amber-400/50 bg-amber-500/10 text-amber-100",
    mal: "border-rose-400/50 bg-rose-500/10 text-rose-200",
    neutro: "border-white/10 bg-white/[0.02] text-white/45",
};

function miles(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n >= 10_000 ? `${Math.round(n / 1000).toLocaleString("es-ES")} k` : n.toLocaleString("es-ES");
}

function minutos(s: number): string {
    if (!s) return "—";
    return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(1).replace(".", ",")} h`;
}

// ─── datos: un GET al montar y cada 30 s, solo con la pestaña a la vista ───

function useSuenos(fecha: string | undefined) {
    const [datos, setDatos] = useState<DatosSuenos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);
    const vivo = useRef(true);

    const recargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(`${RUTA}${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ""}`, { cache: "no-store" });
            const d = (await r.json().catch(() => ({}))) as { datos?: DatosSuenos; error?: string };
            if (!vivo.current) return;
            if (r.ok && d.datos) {
                setDatos(d.datos);
                setError(null);
            } else {
                setError(d.error ?? `Los sueños no respondieron (HTTP ${r.status}).`);
            }
        } catch {
            if (vivo.current) setError("No se pudieron leer los sueños: ¿está el Mando en marcha?");
        } finally {
            if (vivo.current) setCargando(false);
        }
    }, [fecha]);

    useEffect(() => {
        vivo.current = true;
        let id: number | null = null;
        const arrancar = () => {
            if (id === null) id = window.setInterval(() => void recargar(), SONDEO_MS);
        };
        const parar = () => {
            if (id !== null) window.clearInterval(id);
            id = null;
        };
        const alCambiar = () => {
            if (document.visibilityState === "hidden") parar();
            else {
                void recargar();
                arrancar();
            }
        };
        if (document.visibilityState !== "hidden") {
            void recargar();
            arrancar();
        }
        document.addEventListener("visibilitychange", alCambiar);
        return () => {
            vivo.current = false;
            parar();
            document.removeEventListener("visibilitychange", alCambiar);
        };
    }, [recargar]);

    return { datos, error, cargando, recargar };
}

async function ordenar(cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
        const r = await fetch(RUTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        return { ...d, ok: r.ok && d.ok !== false };
    } catch {
        return { ok: false, error: "No se pudo hablar con el Mando." };
    }
}

// ─── piezas ───

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
    const [hecho, setHecho] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard?.writeText(texto).then(
                    () => {
                        setHecho(true);
                        window.setTimeout(() => setHecho(false), 1500);
                    },
                    () => undefined,
                );
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/70 transition-colors duration-200 hover:bg-white/5"
            aria-label={etiqueta}
        >
            {hecho ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            {hecho ? "copiado" : "copiar"}
        </button>
    );
}

function Celda({ fila, activa, alElegir }: { fila: FilaSueno | undefined; activa: boolean; alElegir: () => void }) {
    if (!fila) return <td className="p-0.5"><span className="block h-12 rounded-md border border-dashed border-white/5" aria-hidden /></td>;
    const tono = tonoSueno(fila.estado);
    return (
        <td className="p-0.5">
            <button
                type="button"
                onClick={alElegir}
                aria-pressed={activa}
                title={`${fila.id} · ${ETIQUETA[fila.estado]}${fila.modelo ? ` · ${fila.modelo}` : ""}${fila.subfase ? ` · ${fila.subfase}` : ""}`}
                className={`flex h-12 w-full min-w-[92px] cursor-pointer flex-col items-start justify-center rounded-md border px-1.5 text-left text-[10px] leading-tight transition-colors duration-200 hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${CLASE_TONO[tono]} ${activa ? "ring-2 ring-violet-300/70" : ""}`}
            >
                <span className="flex items-center gap-1 font-semibold">
                    {fila.estado === "analizando" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    {fila.estado === "verificado" || fila.estado === "ajustado" ? <ShieldCheck className="h-3 w-3" aria-hidden /> : null}
                    {fila.privado ? <Lock className="h-3 w-3 opacity-70" aria-label="privado" /> : null}
                    {ETIQUETA[fila.estado]}
                </span>
                <span className="truncate opacity-75">
                    {fila.por ? fila.por : fila.proveedor || "—"}
                    {fila.tokens ? ` · ${miles(fila.tokens)}` : ""}
                </span>
            </button>
        </td>
    );
}

function Ficha({ fila, sesion, onCerrar }: { fila: FilaSueno; sesion: string; onCerrar: () => void }) {
    const informe = `starseed_memory_root/dream/profundo/${sesion}/${fila.area}--${fila.lente}.md`;
    const orden = `python3 scripts/puente/suenos.py veredicto ${fila.id} --estado verificado --nota "…" --por claude-<modelo> --fecha ${sesion}`;
    return (
        <article className="mt-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 text-[11px] text-white/75" aria-label={`Ficha del sueño ${fila.id}`}>
            <header className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <h4 className="font-semibold text-white">
                    {fila.id} · {fila.area} × {fila.lente}
                    {fila.privado ? <span className="ml-2 text-rose-200/80">(privado: solo en esta Mac)</span> : null}
                </h4>
                <button type="button" onClick={onCerrar} className="cursor-pointer rounded p-1 text-white/60 transition-colors duration-200 hover:bg-white/10" aria-label="Cerrar ficha">
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </header>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <dt className="text-white/45">Estado</dt><dd>{ETIQUETA[fila.estado]}</dd>
                <dt className="text-white/45">Modelo</dt><dd className="truncate">{fila.modelo || "—"}</dd>
                <dt className="text-white/45">Ahora</dt><dd className="truncate">{fila.subfase || "—"}</dd>
                <dt className="text-white/45">Tokens (est.)</dt><dd>{miles(fila.tokens)} · {fila.llamadas} llamadas</dd>
                <dt className="text-white/45">Tiempo</dt><dd>{minutos(fila.segundos)}</dd>
                <dt className="text-white/45">Hallazgos</dt><dd>{fila.hallazgos || "—"}</dd>
                <dt className="text-white/45">Verificado por</dt><dd>{fila.por || "nadie todavía"}</dd>
                {fila.nota ? (<><dt className="text-white/45">Nota</dt><dd className="col-span-3">{fila.nota}</dd></>) : null}
            </dl>
            {fila.hallazgos || fila.estado === "informe" ? (
                <div className="mt-2 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                        <span className="text-white/45">Informe:</span>
                        <code className="rounded bg-black/40 px-1">{informe}</code>
                        <BotonCopiar texto={informe} etiqueta="Copiar la ruta del informe" />
                    </p>
                    {fila.estado === "informe" ? (
                        <p className="flex flex-wrap items-center gap-2">
                            <span className="text-white/45">Veredicto (supervisor Claude):</span>
                            <code className="rounded bg-black/40 px-1">{orden}</code>
                            <BotonCopiar texto={orden} etiqueta="Copiar la orden de veredicto" />
                        </p>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}

function Recomendaciones({ top }: { top: RecomendacionSueno[] }) {
    if (!top.length) return <p className="text-[11px] text-white/45">Sin recomendaciones todavía: consolida cuando haya informes verificados.</p>;
    return (
        <ol className="space-y-1.5">
            {top.slice(0, 15).map((u, i) => (
                <li key={`${u.tarea}-${i}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/75">
                    <p className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums text-white/40">{i + 1}.</span>
                        {u.capacidad ? <Zap className="h-3 w-3 text-amber-300" aria-label="sube la capacidad" /> : null}
                        {u.privado ? <Lock className="h-3 w-3 text-rose-200/80" aria-label="privado" /> : null}
                        <span className="font-semibold text-white/90">{u.titulo}</span>
                        {u.apariciones > 1 ? <span className="text-white/40">(+{u.apariciones - 1})</span> : null}
                        {u.yaEncargada ? <span className="rounded bg-white/10 px-1 text-[10px] text-white/50">ya propuesta</span> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-white/50">
                        <span>{u.area} × {u.lente}</span>
                        <code>{u.archivo}:{u.linea}</code>
                        <span>impacto {u.impacto} · esfuerzo {u.esfuerzo} · confianza {u.confianza.toFixed(2)}</span>
                        <span className={u.verificacion === "sin_verificar" ? "text-amber-200/70" : "text-emerald-200/80"}>
                            {u.verificacion === "sin_verificar" ? "sin verificar" : `${u.verificacion}${u.por ? ` por ${u.por}` : ""}`}
                        </span>
                    </p>
                    {u.propuesta ? <p className="mt-0.5 text-[10px] text-violet-200/80">Tarea: {u.propuesta}</p> : null}
                </li>
            ))}
        </ol>
    );
}

function DialogoLanzar({
    areas,
    alCerrar,
    alLanzar,
    ocupado,
}: {
    areas: { id: string; nombre: string }[];
    alCerrar: () => void;
    alLanzar: (horas: number, areas: string[], lentes: string[]) => void;
    ocupado: boolean;
}) {
    const [horas, setHoras] = useState(3);
    const [selA, setSelA] = useState<Set<string>>(() => new Set(areas.map((a) => a.id)));
    const [selL, setSelL] = useState<Set<string>>(() => new Set(LENTES_SUENOS.map((l) => l.id)));
    const alternar = (conjunto: Set<string>, id: string, fijar: (s: Set<string>) => void) => {
        const nuevo = new Set(conjunto);
        if (nuevo.has(id)) nuevo.delete(id);
        else nuevo.add(id);
        fijar(nuevo);
    };
    const enviar = (e: FormEvent) => {
        e.preventDefault();
        const todasA = selA.size === areas.length;
        const todasL = selL.size === LENTES_SUENOS.length;
        alLanzar(horas, todasA ? [] : [...selA], todasL ? [] : [...selL]);
    };
    const tareas = selA.size * selL.size;
    return (
        <form onSubmit={enviar} className="mt-3 rounded-xl border border-violet-400/30 bg-black/40 p-3 text-[11px] text-white/80" aria-label="Lanzar sueños profundos">
            <header className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-[12px] font-semibold text-white">
                    <Rocket className="h-3.5 w-3.5 text-violet-300" aria-hidden /> Lanzar sueños profundos
                </h4>
                <button type="button" onClick={alCerrar} className="cursor-pointer rounded p-1 text-white/60 transition-colors duration-200 hover:bg-white/10" aria-label="Cerrar">
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </header>
            <label className="flex items-center gap-2">
                <span className="w-28 text-white/60">Duración</span>
                <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={horas}
                    onChange={(e) => setHoras(Number(e.target.value))}
                    className="w-48 cursor-pointer accent-violet-400"
                    aria-label="Horas que debe durar el sueño"
                />
                <span className="tabular-nums">{horas === 0 ? "sin pausa (lo que dejen los cupos)" : `${String(horas).replace(".", ",")} h`}</span>
            </label>
            <fieldset className="mt-2">
                <legend className="text-white/60">Áreas ({selA.size}/{areas.length})</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {areas.map((a) => (
                        <label key={a.id} className={`cursor-pointer rounded-full border px-2 py-0.5 transition-colors duration-200 ${selA.has(a.id) ? "border-violet-300/60 bg-violet-500/15 text-white" : "border-white/10 text-white/50"}`}>
                            <input type="checkbox" className="sr-only" checked={selA.has(a.id)} onChange={() => alternar(selA, a.id, setSelA)} />
                            {a.nombre}
                        </label>
                    ))}
                </div>
            </fieldset>
            <fieldset className="mt-2">
                <legend className="text-white/60">Lentes ({selL.size}/{LENTES_SUENOS.length})</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {LENTES_SUENOS.map((l) => (
                        <label key={l.id} className={`cursor-pointer rounded-full border px-2 py-0.5 transition-colors duration-200 ${selL.has(l.id) ? "border-violet-300/60 bg-violet-500/15 text-white" : "border-white/10 text-white/50"}`}>
                            <input type="checkbox" className="sr-only" checked={selL.has(l.id)} onChange={() => alternar(selL, l.id, setSelL)} />
                            {l.nombre}
                        </label>
                    ))}
                </div>
            </fieldset>
            <p className="mt-2 text-white/50">
                {tareas} sueños con la flota GRATUITA (cero crédito de Claude). La seguridad es privada: se queda en esta Mac.
                Si ya hay un orquestador que sabe soñar, se le añaden; si es uno viejo, no se lanza otro.
            </p>
            <div className="mt-2 flex justify-end gap-2">
                <button type="submit" disabled={ocupado || tareas === 0} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-300/50 bg-violet-500/20 px-3 py-1 text-white transition-colors duration-200 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50">
                    {ocupado ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Rocket className="h-3 w-3" aria-hidden />}
                    Lanzar
                </button>
            </div>
        </form>
    );
}

// ─── el panel ───

export function PanelSuenos() {
    const [fecha, setFecha] = useState<string | undefined>(undefined);
    const { datos, error, cargando, recargar } = useSuenos(fecha);
    const [dialogo, setDialogo] = useState(false);
    const [disenando, setDisenando] = useState<string | null>(null);
    const [elegida, setElegida] = useState<string | null>(null);
    const [informe, setInforme] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const sesion = datos?.sesion ?? null;
    const porCelda = useMemo(() => {
        const m = new Map<string, FilaSueno>();
        for (const f of sesion?.filas ?? []) m.set(`${f.area}|${f.lente}`, f);
        return m;
    }, [sesion]);
    const areasVistas = useMemo(() => {
        const conFilas = new Set((sesion?.filas ?? []).map((f) => f.area));
        return (datos?.areas ?? []).filter((a) => conFilas.has(a.id));
    }, [datos, sesion]);
    const fila = elegida ? sesion?.filas.find((f) => f.id === elegida) ?? null : null;

    const lanzar = async (horas: number, areas: string[], lentes: string[]) => {
        setOcupado(true);
        setAviso(null);
        const d = await ordenar({ accion: "lanzar", horas, areas, lentes });
        setOcupado(false);
        setAviso({ ok: d.ok === true, texto: String(d.mensaje ?? d.error ?? (d.ok ? "Lanzado." : "No se pudo lanzar.")) });
        if (d.ok) {
            setDialogo(false);
            if (typeof d.sesion === "string") setFecha(d.sesion);
        }
        void recargar();
    };

    const consolidar = async () => {
        setOcupado(true);
        setAviso(null);
        const d = await ordenar({ accion: "consolidar", fecha: sesion?.sesion });
        setOcupado(false);
        setAviso({ ok: d.ok === true, texto: String(d.resumen ?? d.error ?? "Consolidado.") });
        void recargar();
    };

    const verInforme = async () => {
        if (informe !== null) {
            setInforme(null);
            return;
        }
        try {
            const r = await fetch(`${RUTA}?informe=1${sesion ? `&fecha=${sesion.sesion}` : ""}`, { cache: "no-store" });
            const d = (await r.json()) as { datos?: DatosSuenos };
            setInforme(d.datos?.sesion?.informeMd ?? "Aún no hay INFORME.md: consolida primero.");
        } catch {
            setInforme("No se pudo leer INFORME.md.");
        }
    };

    const abrirDisenador = async () => {
        const d = await ordenar({ accion: "a-disenador", fecha: sesion?.sesion });
        if (d.ok && typeof d.cola === "string") setDisenando(d.cola);
        else setAviso({ ok: false, texto: String(d.error ?? "No hay cola propuesta.") });
    };

    const c = sesion?.cuentas ?? {};
    return (
        <section className="mt-4 rounded-xl border border-indigo-400/25 bg-black/30 p-4 backdrop-blur" aria-labelledby="titulo-suenos">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 id="titulo-suenos" className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Moon className="h-4 w-4 text-indigo-300" aria-hidden />
                        Sueños profundos
                        {sesion ? <span className="text-[11px] font-normal text-white/50">· {sesion.sesion}</span> : null}
                    </h3>
                    <p className="text-[11px] text-white/50">
                        Analistas gratuitos sueñan cada área × lente; los supervisores Claude verifican y consolidan. Nada de esto escribe código.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {(datos?.sesiones.length ?? 0) > 1 ? (
                        <select
                            value={sesion?.sesion ?? ""}
                            onChange={(e) => setFecha(e.target.value || undefined)}
                            className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white/80"
                            aria-label="Sesión de sueños"
                        >
                            {[...(datos?.sesiones ?? [])].reverse().map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : null}
                    <button type="button" onClick={() => setDialogo((v) => !v)} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-300/40 px-2 py-1 text-white/85 transition-colors duration-200 hover:bg-violet-500/15">
                        <Rocket className="h-3 w-3" aria-hidden /> Lanzar…
                    </button>
                    <button type="button" onClick={() => void consolidar()} disabled={ocupado || !sesion} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/80 transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
                        <Layers className="h-3 w-3" aria-hidden /> Consolidar
                    </button>
                    <button type="button" onClick={() => void verInforme()} disabled={!sesion?.informeFinal} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/80 transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
                        <FileText className="h-3 w-3" aria-hidden /> {informe !== null ? "Ocultar informe" : "INFORME.md"}
                    </button>
                    <button type="button" onClick={() => void recargar()} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/70 transition-colors duration-200 hover:bg-white/5" aria-label="Actualizar sueños">
                        <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                    </button>
                </div>
            </header>

            {error ? <p className="mt-2 text-[11px] text-rose-300" role="alert">{error}</p> : null}
            {aviso ? (
                <p className={`mt-2 text-[11px] ${aviso.ok ? "text-emerald-200" : "text-rose-200"}`} role="status" aria-live="polite">{aviso.texto}</p>
            ) : null}
            {dialogo && datos ? <DialogoLanzar areas={datos.areas} ocupado={ocupado} alCerrar={() => setDialogo(false)} alLanzar={(h, a, l) => void lanzar(h, a, l)} /> : null}

            {sesion ? (
                <>
                    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
                        <span>{sesion.total} sueños</span>
                        {(Object.keys(ETIQUETA) as EstadoSueno[]).filter((e) => c[e]).map((e) => (
                            <span key={e}>{c[e]} {ETIQUETA[e]}</span>
                        ))}
                        <span>{miles(sesion.tokens)} tokens estimados (flota gratuita)</span>
                        <span className={sesion.orquestadorVivo ? "text-sky-200" : "text-white/40"}>
                            orquestador {sesion.orquestadorVivo ? "vivo" : "parado"}
                        </span>
                        {sesion.ultimoLanzamiento ? <span className="text-white/40">lanzado {sesion.ultimoLanzamiento.t.slice(5, 16)} desde {sesion.ultimoLanzamiento.por || "?"}</span> : null}
                    </p>
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-[10px]">
                            <caption className="sr-only">Rejilla de sueños por área y lente</caption>
                            <thead>
                                <tr>
                                    <th scope="col" className="px-1 py-1 text-left font-medium text-white/50">Área</th>
                                    {LENTES_SUENOS.map((l) => <th key={l.id} scope="col" className="px-1 py-1 text-left font-medium text-white/50">{l.nombre}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {areasVistas.map((a) => (
                                    <tr key={a.id}>
                                        <th scope="row" className="whitespace-nowrap px-1 text-left font-medium text-white/75">{a.nombre}</th>
                                        {LENTES_SUENOS.map((l) => {
                                            const f = porCelda.get(`${a.id}|${l.id}`);
                                            return <Celda key={l.id} fila={f} activa={Boolean(f && f.id === elegida)} alElegir={() => setElegida(f && f.id !== elegida ? f.id : null)} />;
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {fila ? <Ficha fila={fila} sesion={sesion.sesion} onCerrar={() => setElegida(null)} /> : null}

                    <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
                        <div>
                            <h4 className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Recomendaciones para las próximas olas
                            </h4>
                            {sesion.consolidado ? (
                                <>
                                    <p className="mb-1.5 text-[10px] text-white/45">{sesion.consolidado.resumen} · consolidado {sesion.consolidado.generado.slice(5, 16)}</p>
                                    <Recomendaciones top={sesion.consolidado.top} />
                                </>
                            ) : (
                                <p className="text-[11px] text-white/45">Aún sin consolidar. Cuando haya informes verificados, pulsa «Consolidar».</p>
                            )}
                        </div>
                        <aside className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-[11px] text-white/70">
                            <h4 className="flex items-center gap-2 font-semibold text-white/85"><Wand2 className="h-3.5 w-3.5 text-violet-300" aria-hidden /> Cola propuesta</h4>
                            {sesion.propuesta ? (
                                <>
                                    <p className="mt-1">
                                        <code>cola-{sesion.propuesta.nombre}.json</code> · {sesion.propuesta.tareas} tareas de ≤3 archivos con tu visto bueno antes de integrar. <strong>No se ha lanzado.</strong>
                                    </p>
                                    <button type="button" onClick={() => void abrirDisenador()} className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-300/50 bg-violet-500/15 px-2 py-1 text-white transition-colors duration-200 hover:bg-violet-500/25">
                                        <Wand2 className="h-3 w-3" aria-hidden /> Abrir en Diseñador
                                    </button>
                                </>
                            ) : (
                                <p className="mt-1 text-white/45">Se crea al consolidar.</p>
                            )}
                            <p className="mt-2 text-white/45">
                                Supervisión: <code>python3 scripts/puente/suenos.py estado</code> · protocolo en <code>scripts/puente/supervisor_suenos.md</code>.
                            </p>
                        </aside>
                    </div>
                    {informe !== null ? (
                        <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/50 p-3 text-[11px] leading-relaxed text-white/80">{informe}</pre>
                    ) : null}
                </>
            ) : datos ? (
                <p className="mt-3 text-[11px] text-white/50">
                    Aún no hay ninguna sesión de sueños en esta máquina. «Lanzar…» o, en la terminal: <code>python3 scripts/puente/suenos.py lanzar --horas 3</code>.
                </p>
            ) : null}

            {disenando ? (
                <div className="mt-4">
                    <DisenadorOla colaInicial={disenando} onCerrar={() => setDisenando(null)} />
                </div>
            ) : null}
        </section>
    );
}
