"use client";

/**
 * «Consumo y créditos» — el medidor del Puente de Mando (2026-09-29).
 *
 * Alex: «ya van varias veces que se termina el límite mensual o hay gastos excesivos de
 * créditos o de dinero del uso de las bases de datos y por errores de loops erróneos: añade
 * un medidor de esos créditos que lo verifique desde el Puente de Mando».
 *
 * Una fila por medio, cada una con su barra y su estado:
 *   · Supabase — peticiones y MB estimados de HOY contra el presupuesto diario, el ciclo
 *     contra 5 GB, estado (ok · aviso · freno · restringido 402), las 3 rutas que más piden,
 *     14 días de peticiones y el último bucle detectado.
 *   · Jev / OpenRouter — USD de hoy contra el techo y el saldo contra el mínimo.
 *   · Claude · límites del plan — ventanas de sesión (≈5 h) y semanal leídas de
 *     claude.ai → Uso, con la previsión de las revisiones programadas al reinicio.
 * Y el formulario de presupuestos (POST a la misma ruta, solo local).
 *
 * Lo mide la vigía (`scripts/puente/vigia_consumo.py`, cada 15 min, sin tráfico del proyecto);
 * esto solo lo LEE: un GET cada 60 s y SOLO con la pestaña visible. El plan gratuito de
 * Supabase no tiene límite de gasto diario: los presupuestos son nuestros y se dice así.
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
    Bot,
    Check,
    Copy,
    Database,
    ExternalLink,
    Gauge,
    Loader2,
    OctagonAlert,
    RefreshCw,
    Settings2,
    Sparkles,
    TriangleAlert,
} from "lucide-react";

import {
    ETIQUETAS_PRESUPUESTOS,
    LIMITES_PRESUPUESTOS,
    PRESUPUESTOS_POR_DEFECTO,
    miles,
    textoMb,
    textoPct,
    tonoPorPct,
    validarPresupuestos,
    type DatosConsumo,
    type DiaHistorial,
    type NivelSupabase,
    type Presupuestos,
    type TonoConsumo,
} from "@/lib/mando/consumo-tipos";

export const SONDEO_MS = 60_000;
const RUTA = "/api/mando/consumo";

// ─── datos: un GET al montar y cada 60 s, solo con la pestaña a la vista ───

export function useDatosConsumo() {
    const [datos, setDatos] = useState<DatosConsumo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);
    const vivo = useRef(true);

    const recargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(RUTA, { cache: "no-store" });
            const d = (await r.json().catch(() => ({}))) as { datos?: DatosConsumo; error?: string };
            if (!vivo.current) return;
            if (r.ok && d.datos) {
                setDatos(d.datos);
                setError(null);
            } else {
                setError(d.error ?? `El medidor no respondió (HTTP ${r.status}).`);
            }
        } catch {
            if (vivo.current) setError("No se pudo leer el consumo: ¿está el Mando en marcha?");
        } finally {
            if (vivo.current) setCargando(false);
        }
    }, []);

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
            if (document.visibilityState === "hidden") {
                parar();
            } else {
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

    return { datos, setDatos, error, cargando, recargar };
}

// ─── piezas visuales ───

const ACENTO: Record<TonoConsumo, string> = {
    ok: "#10B981",
    aviso: "#FFBF00",
    peligro: "#DC143C",
    neutro: "#94A3B8",
};

const BARRA: Record<TonoConsumo, string> = {
    ok: "bg-emerald-400/85",
    aviso: "bg-amber-400/90",
    peligro: "bg-rose-400/90",
    neutro: "bg-white/30",
};

const TEXTO_TONO: Record<TonoConsumo, string> = {
    ok: "text-emerald-200",
    aviso: "text-amber-200",
    peligro: "text-rose-200",
    neutro: "text-white/70",
};

const NIVEL: Record<NivelSupabase, { texto: string; tono: TonoConsumo; color?: string }> = {
    ok: { texto: "En presupuesto", tono: "ok" },
    aviso: { texto: "Aviso · más del 70 %", tono: "aviso" },
    freno: { texto: "Freno", tono: "peligro" },
    restringido: { texto: "Restringido · 402", tono: "peligro", color: "#7C5CFF" },
    "sin-medir": { texto: "Sin medir", tono: "neutro" },
};

function Estado({ texto, tono, color }: { texto: string; tono: TonoConsumo; color?: string }) {
    const c = color ?? ACENTO[tono];
    return (
        <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/90"
            style={{ background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}66` }}
        >
            <i aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
            {texto}
        </span>
    );
}

function Barra({
    etiqueta,
    valor,
    fraccion,
    tono,
    detalle,
}: {
    etiqueta: string;
    valor: string;
    fraccion: number | null;
    tono: TonoConsumo;
    detalle?: string | null;
}) {
    const f = fraccion === null || !Number.isFinite(fraccion) ? 0 : Math.max(0, Math.min(1, fraccion));
    return (
        <div>
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
                <span className="text-white/60">{etiqueta}</span>
                <span className={`tabular-nums font-medium ${TEXTO_TONO[tono]}`}>{valor}</span>
            </p>
            <span
                className="mc-barra mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={Math.round(f * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${etiqueta}: ${valor}`}
            >
                <i className={`rounded-full ${BARRA[tono]}`} style={{ transform: `scaleX(${Math.max(0.015, f)})` }} />
            </span>
            {detalle ? <p className="mt-0.5 text-[11px] leading-snug text-white/45">{detalle}</p> : null}
        </div>
    );
}

function Tarjeta({
    icono,
    titulo,
    estado,
    children,
    etiqueta,
}: {
    icono: ReactNode;
    titulo: string;
    estado?: ReactNode;
    children: ReactNode;
    etiqueta: string;
}) {
    return (
        <article aria-label={etiqueta} className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-white/10 bg-black/25 p-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-white/85">
                    {icono}
                    {titulo}
                </h4>
                {estado}
            </header>
            {children}
        </article>
    );
}

/** Minutos/horas desde una fecha ISO, en español. */
export function hace(iso: string | null, ahora = Date.now()): string {
    if (!iso) return "nunca";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "nunca";
    const min = Math.max(0, Math.round((ahora - ms) / 60_000));
    if (min < 1) return "hace menos de 1 min";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} días`;
}

function fechaCorta(iso: string | null, utc = false): string {
    if (!iso) return "—";
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(utc || iso.length === 10 ? { timeZone: "UTC" } : {}) });
}

function usd(n: number | null, decimales = 2): string {
    return n === null ? "—" : `$${n.toFixed(decimales)}`;
}

/** Barras de 14 días. Los días sin medir se ven como un trazo punteado, no como cero. */
export function Sparkline({ dias }: { dias: DiaHistorial[] }) {
    const medidos = dias.filter((d) => d.peticiones !== null) as { dia: string; peticiones: number }[];
    const max = Math.max(1, ...medidos.map((d) => d.peticiones));
    const ancho = 14;
    const alto = 34;
    const hoy = dias[dias.length - 1];
    const pico = medidos.reduce<{ dia: string; peticiones: number } | null>(
        (a, d) => (!a || d.peticiones > a.peticiones ? d : a),
        null,
    );
    const resumen = medidos.length
        ? `Peticiones de los últimos ${dias.length} días: máximo ${miles(pico?.peticiones ?? 0)} el ${fechaCorta(pico?.dia ?? null, true)}; hoy ${hoy?.peticiones === null || !hoy ? "sin medir" : miles(hoy.peticiones)}.`
        : `Sin mediciones en los últimos ${dias.length} días.`;
    return (
        <figure className="m-0">
            <svg
                role="img"
                aria-label={resumen}
                viewBox={`0 0 ${dias.length * ancho} ${alto}`}
                preserveAspectRatio="none"
                className="block h-9 w-full"
            >
                {dias.map((d, i) => {
                    if (d.peticiones === null) {
                        return (
                            <line
                                key={d.dia}
                                x1={i * ancho + 3}
                                x2={i * ancho + ancho - 3}
                                y1={alto - 1}
                                y2={alto - 1}
                                stroke="rgba(255,255,255,.25)"
                                strokeDasharray="2 2"
                            />
                        );
                    }
                    const h = Math.max(1.5, (d.peticiones / max) * (alto - 3));
                    const esHoy = i === dias.length - 1;
                    return (
                        <rect
                            key={d.dia}
                            x={i * ancho + 2}
                            y={alto - h}
                            width={ancho - 4}
                            height={h}
                            rx={2}
                            fill={esHoy ? "rgba(34,211,238,.85)" : "rgba(34,211,238,.4)"}
                        >
                            <title>{`${fechaCorta(d.dia, true)}: ${miles(d.peticiones)} peticiones`}</title>
                        </rect>
                    );
                })}
            </svg>
            <figcaption className="mt-0.5 flex justify-between text-[10px] text-white/40">
                <span>{fechaCorta(dias[0]?.dia ?? null, true)}</span>
                <span>peticiones por día</span>
                <span>hoy</span>
            </figcaption>
        </figure>
    );
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
    const [hecho, setHecho] = useState(false);
    return (
        <button
            type="button"
            aria-label={etiqueta}
            onClick={() => {
                void navigator.clipboard?.writeText(texto).then(
                    () => {
                        setHecho(true);
                        window.setTimeout(() => setHecho(false), 1500);
                    },
                    () => {},
                );
            }}
            className="mc-alzar inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75"
        >
            {hecho ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            {hecho ? "Copiado" : "Copiar"}
        </button>
    );
}

// ─── filas ───

function FilaSupabase({ s, p, ahora }: { s: DatosConsumo["supabase"]; p: Presupuestos; ahora: number }) {
    const n = NIVEL[s.nivel];
    const pctMax = Math.max(s.pctPeticiones, s.pctMb);
    const medida =
        s.fraccionMedida === null
            ? "estimado por tamaño típico de cada ruta"
            : `${textoPct(s.fraccionMedida)} medido, el resto estimado`;
    const realtime = s.realtime ? ` · Realtime ≈ ${textoMb(s.realtime.mb)} (estimado)` : "";
    const ciclo = s.ciclo.supuesto
        ? `inicio supuesto el ${fechaCorta(s.ciclo.inicio, true)}: fija el real en Presupuestos`
        : s.ciclo.diasRestantes === null
          ? `desde el ${fechaCorta(s.ciclo.inicio, true)}`
          : `desde el ${fechaCorta(s.ciclo.inicio, true)} · quedan ${s.ciclo.diasRestantes} días`;
    return (
        <Tarjeta
            etiqueta="Supabase"
            icono={<Database className="h-4 w-4 text-cyan-200/80" aria-hidden />}
            titulo="Supabase"
            estado={<Estado texto={n.texto} tono={n.tono} color={n.color} />}
        >
            <div className="grid gap-2.5 sm:grid-cols-3">
                <Barra
                    etiqueta="Peticiones hoy"
                    valor={`${miles(s.peticiones)} / ${miles(p.supabase_peticiones_dia)}`}
                    fraccion={s.pctPeticiones}
                    tono={tonoPorPct(s.nivel === "sin-medir" ? null : s.pctPeticiones)}
                    detalle={s.c402 > 0 ? `${miles(s.c402)} respondidas con 402` : `${textoPct(s.pctPeticiones)} del día`}
                />
                <Barra
                    etiqueta="Salida estimada hoy"
                    valor={`${textoMb(s.mb)} / ${textoMb(p.supabase_mb_dia)}`}
                    fraccion={s.pctMb}
                    tono={tonoPorPct(s.nivel === "sin-medir" ? null : s.pctMb)}
                    detalle={`${medida}${realtime}`}
                />
                <Barra
                    etiqueta="Ciclo de facturación"
                    valor={`${textoMb(s.ciclo.mb)} / ${textoMb(s.ciclo.presupuestoMb)}`}
                    fraccion={s.ciclo.pct}
                    tono={tonoPorPct(s.ciclo.pct)}
                    detalle={ciclo}
                />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <Sparkline dias={s.historial} />
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Rutas que más piden hoy</p>
                    {s.top.length ? (
                        <ol className="mt-1 space-y-0.5">
                            {s.top.map((t) => (
                                <li key={t.ruta} className="flex items-baseline justify-between gap-2 text-[11px]">
                                    <span className="min-w-0 break-all font-mono text-cyan-100/85">{t.ruta}</span>
                                    <span className="shrink-0 tabular-nums text-white/60">
                                        {miles(t.n)} · {textoMb(t.mb)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="mt-1 text-[11px] text-white/45">Aún no hay peticiones medidas hoy.</p>
                    )}
                </div>
            </div>
            <p className="flex items-start gap-1.5 text-[12px] leading-snug" data-testid="ultimo-bucle">
                {s.ultimoBucle ? (
                    <>
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                        <span className="text-white/70">
                            Último bucle detectado:{" "}
                            <span className="break-all font-mono text-amber-100/90">{s.ultimoBucle.ruta}</span> ·{" "}
                            {miles(s.ultimoBucle.n)} peticiones/h desde «{s.ultimoBucle.ua}» · {hace(s.ultimoBucle.t, ahora)}
                        </span>
                    </>
                ) : (
                    <>
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                        <span className="text-white/55">Ningún bucle detectado (ruta &gt; 1.500/h o agente + ruta &gt; 800/h).</span>
                    </>
                )}
            </p>
            {pctMax >= 0.7 && s.nivel !== "freno" && s.nivel !== "restringido" ? (
                <p className="text-[11px] text-amber-200/80">Al 100 % la vigía pone el freno remoto hasta las 00:00 UTC.</p>
            ) : null}
        </Tarjeta>
    );
}

function FilaJev({ j }: { j: DatosConsumo["jev"] }) {
    const saldoBajo = j.saldo !== null && j.saldo < j.saldoMin;
    return (
        <Tarjeta
            etiqueta="Jev y OpenRouter"
            icono={<Bot className="h-4 w-4 text-cyan-200/80" aria-hidden />}
            titulo="Jev · OpenRouter"
            estado={
                <Estado
                    texto={j.usdHoy === null ? "Sin medir" : saldoBajo ? "Saldo bajo" : j.tono === "ok" ? "En presupuesto" : j.tono === "aviso" ? "Cerca del techo" : j.tono === "peligro" ? "Techo superado" : "Sin medir"}
                    tono={j.tono}
                />
            }
        >
            <Barra
                etiqueta="Gasto de hoy"
                valor={`${usd(j.usdHoy, 4)} / ${usd(j.techo)}`}
                fraccion={j.pct}
                tono={tonoPorPct(j.pct)}
                detalle="Jev decide por ~$0,00002; pasado el techo se calla y decide la regla."
            />
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
                <span className="text-white/60">Saldo OpenRouter</span>
                <span className={`tabular-nums font-medium ${saldoBajo ? "text-rose-200" : "text-white/85"}`}>
                    {usd(j.saldo)} <span className="text-white/40">(mínimo {usd(j.saldoMin)})</span>
                </span>
            </p>
        </Tarjeta>
    );
}

/** «2 h 10 min» a partir de minutos hasta el reinicio (0 si ya pasó). */
function hacia(minutos: number): string {
    const m = Math.max(0, minutos);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h} h ${m % 60} min`;
    return `${m} min`;
}

function detalleVentana(v: NonNullable<DatosConsumo["claude"]["sesion"]>, disparos: number): string {
    const base = v.reiniciada ? "reiniciada" : `reinicia en ${hacia(v.minutosParaReinicio)}`;
    if (v.proyeccion === null || v.coste === null) return `${base} · previsión: sin datos todavía`;
    const revisiones = disparos === 1 ? "1 revisión programada" : `${disparos} revisiones programadas`;
    return `${base} · previsión al reinicio ${Math.round(v.proyeccion)} % (${revisiones}, ~${Math.round(v.coste)} % cada una)`;
}

function BarraVentana({
    etiqueta,
    v,
    disparos,
}: {
    etiqueta: string;
    v: NonNullable<DatosConsumo["claude"]["sesion"]>;
    disparos: number;
}) {
    const pct = Math.round(v.pct);
    return (
        <Barra
            etiqueta={etiqueta}
            valor={`${pct} % usado · queda ${Math.round(v.queda)} %`}
            fraccion={v.pct / 100}
            tono={v.tono}
            detalle={detalleVentana(v, disparos)}
        />
    );
}

function FilaLimitesClaude({ c, ahora }: { c: DatosConsumo["claude"]; ahora: number }) {
    const sinLectura = !c.sesion && !c.semana;
    return (
        <Tarjeta
            etiqueta="Límites del plan de Claude"
            icono={<Sparkles className="h-4 w-4 text-cyan-200/80" aria-hidden />}
            titulo="Claude · límites del plan"
            estado={
                <Estado
                    texto={sinLectura ? "Sin lectura" : c.tono === "peligro" ? "Cuidado" : c.tono === "aviso" ? "Aviso" : "Al día"}
                    tono={sinLectura ? "neutro" : c.tono}
                />
            }
        >
            {c.sesion ? <BarraVentana etiqueta="Sesión (≈5 h)" v={c.sesion} disparos={c.programadasEnSesion} /> : null}
            {c.semana ? <BarraVentana etiqueta="Semana" v={c.semana} disparos={c.programadasEnSemana} /> : null}
            {c.modelo ? (
                <BarraVentana etiqueta={`Semana · ${c.modeloNombre ?? "modelo"}`} v={c.modelo} disparos={0} />
            ) : null}
            {c.recomendacion ? <p className="text-[11px] leading-snug text-amber-200/85">{c.recomendacion}</p> : null}
            <p className="flex items-center gap-1 text-[11px] text-white/50">
                <ExternalLink className="h-3 w-3" aria-hidden />
                leído {c.lecturaHaceMin === null ? "nunca" : `hace ${c.lecturaHaceMin} min`} de claude.ai → Uso
                {c.desactualizada ? <span className="text-amber-200/85"> · desactualizado</span> : null}
            </p>
            <a
                href={c.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="mc-alzar inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100"
            >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Ver el uso en claude.ai
            </a>
            <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 break-all rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10.5px] text-white/70">
                    {c.comando}
                </code>
                <Copiar texto={c.comando} etiqueta="Copiar el comando para declarar los límites" />
            </div>
        </Tarjeta>
    );
}

// ─── formulario de presupuestos ───

const CAMPOS_NUMERICOS = Object.keys(LIMITES_PRESUPUESTOS) as (keyof typeof LIMITES_PRESUPUESTOS)[];

function aTexto(p: Presupuestos): Record<keyof Presupuestos, string> {
    return {
        supabase_peticiones_dia: String(p.supabase_peticiones_dia),
        supabase_mb_dia: String(p.supabase_mb_dia),
        supabase_mb_ciclo: String(p.supabase_mb_ciclo),
        ciclo_inicio: p.ciclo_inicio ?? "",
        jev_usd_dia: String(p.jev_usd_dia),
        openrouter_usd_min_saldo: String(p.openrouter_usd_min_saldo),
    };
}

function FormPresupuestos({
    actuales,
    alGuardar,
    alCerrar,
}: {
    actuales: Presupuestos;
    alGuardar: (d: DatosConsumo, mensaje: string) => void;
    alCerrar: () => void;
}) {
    const [valores, setValores] = useState(() => aTexto(actuales));
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const base = useId();

    const enviar = async (e: FormEvent) => {
        e.preventDefault();
        const r = validarPresupuestos({ ...valores, ciclo_inicio: valores.ciclo_inicio || null });
        if (!r.ok) {
            setError(r.error);
            return;
        }
        setGuardando(true);
        setError(null);
        try {
            const res = await fetch(RUTA, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ presupuestos: r.valor }),
            });
            const d = (await res.json().catch(() => ({}))) as { datos?: DatosConsumo; mensaje?: string; error?: string };
            if (res.ok && d.datos) alGuardar(d.datos, d.mensaje ?? "Presupuestos guardados.");
            else setError(d.error ?? `No se guardó (HTTP ${res.status}).`);
        } catch {
            setError("No se pudo hablar con el Mando.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <form
            onSubmit={(e) => void enviar(e)}
            aria-label="Presupuestos de consumo"
            className="mc-desplegar mt-3 rounded-2xl border border-white/10 bg-black/25 p-3"
            noValidate
        >
            <p className="text-[12px] leading-relaxed text-white/60">
                El plan gratuito de Supabase <strong className="font-semibold text-white/80">no tiene límite de gasto diario</strong>:
                estos presupuestos son nuestros. Al 70 % llega un aviso; al 100 % la vigía pone el freno remoto
                (<code className="font-mono text-[11px]">os_freno</code>) hasta las 00:00 UTC.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS_NUMERICOS.map((campo) => {
                    const [min, max] = LIMITES_PRESUPUESTOS[campo];
                    return (
                        <label key={campo} htmlFor={`${base}-${campo}`} className="flex flex-col gap-1 text-[12px] text-white/65">
                            {ETIQUETAS_PRESUPUESTOS[campo]}
                            <input
                                id={`${base}-${campo}`}
                                type="number"
                                inputMode="decimal"
                                min={min}
                                max={max}
                                step="any"
                                value={valores[campo]}
                                onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
                                className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[13px] tabular-nums text-white/90 outline-none transition-colors duration-150 focus:border-cyan-300/60"
                            />
                        </label>
                    );
                })}
                <label htmlFor={`${base}-ciclo`} className="flex flex-col gap-1 text-[12px] text-white/65">
                    {ETIQUETAS_PRESUPUESTOS.ciclo_inicio}
                    <input
                        id={`${base}-ciclo`}
                        type="date"
                        value={valores.ciclo_inicio}
                        onChange={(e) => setValores((v) => ({ ...v, ciclo_inicio: e.target.value }))}
                        className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[13px] text-white/90 outline-none transition-colors duration-150 focus:border-cyan-300/60"
                    />
                    <span className="text-[11px] text-white/40">Vacío = se supone el primer día medido.</span>
                </label>
            </div>
            {error ? (
                <p role="alert" className="mt-3 rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[12px] text-rose-100">
                    {error}
                </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="submit"
                    disabled={guardando}
                    className="mc-alzar inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300/40 bg-cyan-400/15 px-3 py-1.5 text-[12px] font-medium text-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                    Guardar presupuestos
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setValores(aTexto({ ...PRESUPUESTOS_POR_DEFECTO, ciclo_inicio: valores.ciclo_inicio || null }));
                        setError(null);
                    }}
                    className="mc-alzar cursor-pointer rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/75"
                >
                    Volver a los valores del contrato
                </button>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="cursor-pointer rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-white/55"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}

// ─── el medidor ───

export function MedidorConsumo() {
    const { datos, setDatos, error, cargando, recargar } = useDatosConsumo();
    const [formAbierto, setFormAbierto] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const titulo = useId();
    const ahora = datos ? Date.parse(datos.generadoEn) : Date.now();
    const s = datos?.supabase;

    return (
        <section
            aria-labelledby={titulo}
            data-testid="medidor-consumo"
            className="mc-cristal mc-entrar w-full p-3 sm:p-4"
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Gauge className="h-4 w-4 text-cyan-200/80" aria-hidden />
                    <h3 id={titulo} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        Consumo y créditos
                    </h3>
                    {s ? <Estado texto={NIVEL[s.nivel].texto} tono={NIVEL[s.nivel].tono} color={NIVEL[s.nivel].color} /> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-white/40">
                        {s ? `medido ${hace(s.medidoEn, ahora)}` : cargando ? "leyendo…" : ""}
                    </span>
                    <button
                        type="button"
                        onClick={() => void recargar()}
                        disabled={cargando}
                        className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                        Actualizar
                    </button>
                    <button
                        type="button"
                        aria-expanded={formAbierto}
                        disabled={!datos}
                        onClick={() => {
                            setMensaje(null);
                            setFormAbierto((a) => !a);
                        }}
                        className="mc-alzar inline-flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Settings2 className="h-3 w-3" aria-hidden />
                        Presupuestos
                    </button>
                </div>
            </header>

            {s?.nivel === "restringido" ? (
                <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-[12px] text-violet-100">
                    <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Supabase responde 402: el proyecto está restringido por cuota. La vigía no escribe nada hasta que se levante;
                    los clientes cortan solos sus peticiones.
                </p>
            ) : s?.freno.activo ? (
                <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
                    <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                        Freno remoto activo{s.freno.hasta ? ` hasta las ${new Date(s.freno.hasta).toISOString().slice(11, 16)} UTC` : ""}.{" "}
                        {s.freno.motivo}
                    </span>
                </p>
            ) : s?.nivel === "freno" && s.freno.remoto === "no_disponible" ? (
                <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
                    <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Presupuesto agotado, pero el freno remoto no está disponible: falta aplicar la migración de la tabla os_freno.
                </p>
            ) : null}
            {s && !s.fresco ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                    <span>La vigía de consumo no mide {s.medidoEn ? `desde ${hace(s.medidoEn, ahora)}` : "todavía"}: lánzala a mano.</span>
                    <code className="break-all font-mono text-[11px] text-amber-50/90">python3 scripts/puente/vigia_consumo.py</code>
                </p>
            ) : null}

            {datos ? (
                <div className="mt-3 grid gap-2.5 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <FilaSupabase s={datos.supabase} p={datos.presupuestos} ahora={ahora} />
                    <FilaJev j={datos.jev} />
                    <FilaLimitesClaude c={datos.claude} ahora={ahora} />
                </div>
            ) : cargando ? (
                <p className="mt-3 flex items-center gap-2 text-[12px] text-white/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Leyendo el consumo…
                </p>
            ) : null}

            {formAbierto && datos ? (
                <FormPresupuestos
                    actuales={datos.presupuestos}
                    alCerrar={() => setFormAbierto(false)}
                    alGuardar={(d, m) => {
                        setDatos(d);
                        setMensaje(m);
                        setFormAbierto(false);
                    }}
                />
            ) : null}
            {mensaje ? (
                <p role="status" className="mt-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1.5 text-[12px] text-cyan-100">
                    {mensaje}
                </p>
            ) : null}
            {error ? (
                <p role="status" className="mt-2 rounded-md border border-rose-300/25 bg-rose-400/10 px-2 py-1.5 text-[12px] text-rose-100">
                    {error}
                </p>
            ) : null}
        </section>
    );
}
