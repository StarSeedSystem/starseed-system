"use client";
/**
 * Notificaciones libres (Ola 383 · WL3, rediseño ola 0929 · F) — gotas de luz agrupadas por su
 * fuente (seguridad, menciones, invitaciones, gobernanza, otros, sistema) y con lo importante
 * primero. Cada aviso tiene sus tres acciones: abrir (y queda leído), marcar leído y posponer
 * (una hora, esta tarde o mañana a las 9; local a esta neurona, vuelve solo). Datos: los de
 * siempre (`useMyNotifications`, el mismo tiempo real del widget clásico: ningún sondeo nuevo);
 * leer escribe `seen = true` en Supabase, como antes.
 *   micro → el número (late si hay algo importante) · s → las dos más importantes
 *   m     → las nuevas por importancia, con su fuente · l → filtro por fuente + acciones
 *   xl    → columnas por fuente · panorámico → una fila · torre → una columna.
 * Sin nada nuevo: «Todo al día». Sin sesión: lo dice y ofrece entrar.
 */
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Check, CheckCheck, LogIn } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { createClient } from "@/utils/supabase/client";
import { useMyNotifications, type NotificationRow } from "@/lib/widget-data/os-live";
import { Rotulo, SinDato, disenoDe } from "./comun";
import {
    CLAVE_POSPUESTAS, GRUPOS, agruparAvisos, enlaceSeguro, estaPospuesta, grupoDe, opcionesPosponer, ordenarPorPrioridad, vigentes,
    type Grupo, type Pospuestas,
} from "./notificaciones-partes";
import { Accion, escalaTipo, esTactil, haceCuanto, useAhoraVivo, useClaseForzada, useDispositivo, useEnPantalla, useJSONLocal } from "./inicio-piezas";

const NUEVA = "#DC143C";
const CALMA = "#23d5ab";

/** Menú vertical de posponer. */
function MenuPosponer({ ahora, onElegir, onCerrar }: { ahora: Date; onElegir: (hasta: number) => void; onCerrar: () => void }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const fuera = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar(); };
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        document.addEventListener("pointerdown", fuera);
        document.addEventListener("keydown", tecla);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
    }, [onCerrar]);
    return (
        <div ref={ref} role="menu" aria-label="Posponer hasta"
            className="absolute right-0 top-full z-30 mt-1 flex w-48 flex-col gap-0.5 rounded-xl p-1.5"
            style={{ background: "rgba(10,14,30,.95)", boxShadow: "0 16px 40px -12px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.14)", backdropFilter: "blur(14px)" }}>
            {opcionesPosponer(ahora).map((o) => (
                <button key={o.etiqueta} type="button" role="menuitem" onClick={() => { onElegir(o.hasta); onCerrar(); }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-white/85 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10">
                    <AlarmClock aria-hidden className="size-3.5 shrink-0 text-white/50" />{o.etiqueta}
                </button>
            ))}
        </div>
    );
}

interface GotaProps {
    n: NotificationRow; i: number; compacta?: boolean; conPosponer?: boolean; tactil: boolean; ahora: Date;
    onLeer: (id: string) => void; onPosponer: (id: string, hasta: number) => void;
}

/** Un aviso: gota de luz del color de su fuente, con abrir / leído / posponer. */
function Gota({ n, i, compacta, conPosponer, tactil, ahora, onLeer, onPosponer }: GotaProps) {
    const [menu, setMenu] = React.useState(false);
    const g = GRUPOS[grupoDe(n)];
    const titulo = n.title?.trim() || n.kind || "Aviso";
    const importante = g.peso >= 3;
    const boton = `ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white/60 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 ${tactil ? "size-11" : "size-7"}`;
    return (
        <motion.li layout initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -22, scale: 0.85, transition: { duration: 0.3 } }} className="relative list-none">
            <div className="ss-redondo relative flex min-w-0 items-center gap-2 rounded-full py-1 pl-3 pr-1"
                style={{ background: `radial-gradient(120% 160% at 12% 30%, ${g.color}40, ${g.color}0d 70%, transparent)`, boxShadow: `inset 0 0 0 1px ${g.color}33` }}>
                <span aria-hidden className={`block size-2 shrink-0 rounded-full ${importante ? "ss-latir" : ""}`} style={{ background: g.color, boxShadow: `0 0 10px ${g.color}`, ["--ss-dur" as string]: `${2.4 + (i % 3) * 0.4}s` }} />
                <Link href={enlaceSeguro(n.link)} onClick={() => onLeer(n.id)} title={`${titulo}${n.body ? ` — ${n.body}` : ""}`}
                    className="min-w-0 flex-1 cursor-pointer outline-none focus-visible:underline">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{titulo}</span>
                    {!compacta && <span className="block truncate text-[11px] text-white/60">{g.etiqueta} · {haceCuanto(n.created_at ? Date.parse(n.created_at) : ahora.getTime(), ahora.getTime())}{n.body ? ` · ${n.body}` : ""}</span>}
                </Link>
                {conPosponer && (
                    <button type="button" aria-label={`Posponer «${titulo}»`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className={boton}>
                        <AlarmClock className="size-3.5" />
                    </button>
                )}
                <button type="button" onClick={() => onLeer(n.id)} aria-label={`Marcar como leída: ${titulo}`} title="Marcar como leída" className={`${boton} hover:!bg-emerald-500/20 hover:!text-emerald-300`}>
                    <Check className="size-3.5" />
                </button>
            </div>
            {menu && <MenuPosponer ahora={ahora} onElegir={(h) => onPosponer(n.id, h)} onCerrar={() => setMenu(false)} />}
        </motion.li>
    );
}

export function NotificacionesLibre() {
    const { rows, loading, authPending, needsAuth, reload } = useMyNotifications();
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const ahora = useAhoraVivo(60_000, visible) ?? new Date(0);
    const [leidas, setLeidas] = React.useState<Set<string>>(() => new Set());
    const [pospuestas, setPospuestas] = useJSONLocal<Pospuestas>(CLAVE_POSPUESTAS, {});
    const [filtro, setFiltro] = React.useState<Grupo | "todas">("todas");
    const [verPospuestas, setVerPospuestas] = React.useState(false);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);

    const t = ahora.getTime();
    const sinLeer = rows.filter((r) => !r.seen && !leidas.has(r.id));
    const nuevas = ordenarPorPrioridad(sinLeer.filter((r) => !estaPospuesta(pospuestas, r.id, t)));
    const enEspera = sinLeer.filter((r) => estaPospuesta(pospuestas, r.id, t));
    const hayImportante = nuevas.some((r) => GRUPOS[grupoDe(r)].peso >= 3);

    const leer = async (id: string) => {
        setLeidas((p) => new Set(p).add(id));
        try { await createClient().from("notifications").update({ seen: true }).eq("id", id); } catch { /* el tiempo real reconcilia */ }
    };
    const leerTodas = async () => {
        const ids = nuevas.map((n) => n.id);
        setLeidas((p) => { const s = new Set(p); ids.forEach((i) => s.add(i)); return s; });
        try {
            const c = createClient();
            await Promise.all(ids.map((id) => c.from("notifications").update({ seen: true }).eq("id", id)));
            void reload();
        } catch { /* noop */ }
    };
    const posponer = (id: string, hasta: number) => setPospuestas((p) => ({ ...vigentes(p, Date.now()), [id]: hasta }));
    const despertar = () => { setPospuestas({}); setVerPospuestas(false); };

    const color = nuevas.length ? NUEVA : CALMA;
    const etiqueta = needsAuth ? "Notificaciones: entra para verlas" : `Notificaciones: ${nuevas.length} sin leer${enEspera.length ? `, ${enEspera.length} pospuestas` : ""}`;
    const gota = (n: NotificationRow, i: number, extra: { compacta?: boolean; conPosponer?: boolean } = {}) => (
        <Gota key={n.id} n={n} i={i} tactil={tactil} ahora={ahora} onLeer={leer} onPosponer={posponer} {...extra} />
    );
    const lineaPospuestas = enEspera.length > 0 && (
        <button type="button" onClick={() => setVerPospuestas((v) => !v)} aria-expanded={verPospuestas}
            className="cursor-pointer self-start rounded-md text-[11.5px] text-white/55 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:underline">
            {enEspera.length} pospuesta{enEspera.length > 1 ? "s" : ""} · {verPospuestas ? "ocultar" : "ver"}
        </button>
    );

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={color} acento2="#7c5cff" etiqueta={etiqueta} intensidad={nuevas.length ? 0.55 : 0.3}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    if (needsAuth) return <SinDato texto="Entra para ver tus avisos" accion={b !== "micro" ? <Accion icono={LogIn} color="#7c5cff" href="/login" grande={tactil}>Entrar</Accion> : undefined} />;
                    if (authPending || (loading && rows.length === 0)) return <SinDato texto="escuchando…" />;

                    // ── micro ──
                    if (b === "micro") {
                        return (
                            <Link href="/notifications" aria-label={`${nuevas.length} notificaciones sin leer`} className="flex h-full cursor-pointer flex-col items-center justify-center" data-diseno="micro">
                                <span className={`${hayImportante ? "ss-latir" : "ss-respirar"} font-light tabular-nums text-white`} style={{ fontSize: lado * 0.38 * k, lineHeight: 1 }}>{nuevas.length}</span>
                                {nuevas.length > 0 && <span aria-hidden className="mt-1 block size-1.5 rounded-full" style={{ background: GRUPOS[grupoDe(nuevas[0])].color, boxShadow: `0 0 8px ${GRUPOS[grupoDe(nuevas[0])].color}` }} />}
                            </Link>
                        );
                    }

                    // ── todo al día ──
                    if (nuevas.length === 0 && !verPospuestas) {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center" data-diseno={`${b}-al-dia`}>
                                <span aria-hidden className="ss-respirar ss-redondo grid place-items-center rounded-full" style={{ width: Math.min(56, lado * 0.26), height: Math.min(56, lado * 0.26), background: `radial-gradient(circle, ${CALMA}33, transparent 70%)`, boxShadow: `inset 0 0 0 1px ${CALMA}55` }}>
                                    <CheckCheck className="size-5 text-emerald-200" />
                                </span>
                                <span className="text-[14px] font-medium text-white">Todo al día</span>
                                {lineaPospuestas}
                                <Link href="/notifications" className="cursor-pointer text-[11.5px] text-white/60 underline-offset-4 hover:text-white hover:underline">ver el historial</Link>
                            </div>
                        );
                    }

                    const lista = verPospuestas ? enEspera : nuevas;
                    const cabecera = (conLeer: boolean) => (
                        <div className="flex items-center justify-between gap-2 px-1">
                            <Rotulo color={verPospuestas ? undefined : "#fda4af"}>{verPospuestas ? `${enEspera.length} pospuestas` : `${nuevas.length} ${nuevas.length === 1 ? "nueva" : "nuevas"}`}</Rotulo>
                            {verPospuestas
                                ? <Accion icono={AlarmClock} color={CALMA} grande={tactil} onClick={despertar}>Traerlas ya</Accion>
                                : conLeer && <Accion icono={CheckCheck} color="#10B981" grande={tactil} onClick={leerTodas}>Leer todo</Accion>}
                        </div>
                    );

                    // ── s ──
                    if (b === "s") {
                        return (
                            <div className="flex h-full flex-col justify-center gap-1.5 overflow-hidden px-1" data-diseno="s">
                                {cabecera(false)}
                                <ul className="flex flex-col gap-1.5"><AnimatePresence initial={false}>{lista.slice(0, 2).map((n, i) => gota(n, i, { compacta: true }))}</AnimatePresence></ul>
                            </div>
                        );
                    }

                    // ── panorámico ──
                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <div className="flex shrink-0 flex-col items-center">
                                    <span className="font-light tabular-nums text-white" style={{ fontSize: Math.min(alto * 0.4, 48), lineHeight: 1 }}>{nuevas.length}</span>
                                    <Rotulo>sin leer</Rotulo>
                                </div>
                                <ul className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(3, lista.length)}, minmax(0,1fr))` }}>
                                    <AnimatePresence initial={false}>{lista.slice(0, 3).map((n, i) => gota(n, i, { compacta: alto < 120 }))}</AnimatePresence>
                                </ul>
                                <Accion icono={CheckCheck} color="#10B981" grande={tactil} onClick={leerTodas}>Leer todo</Accion>
                            </div>
                        );
                    }

                    // ── m / torre ──
                    if (b === "m") {
                        const max = Math.max(2, Math.floor((alto - 72) / (tactil ? 56 : 50)));
                        return (
                            <div className="flex h-full flex-col justify-center gap-2 overflow-hidden p-2" data-diseno={clase === "torre" ? "torre" : "m"}>
                                {cabecera(true)}
                                <ul className="flex flex-col gap-1.5"><AnimatePresence initial={false}>{lista.slice(0, max).map((n, i) => gota(n, i, { conPosponer: ancho >= 280 }))}</AnimatePresence></ul>
                                {lista.length > max && <Link href="/notifications" className="cursor-pointer px-1 text-[11.5px] text-white/55 hover:text-white">y {lista.length - max} más…</Link>}
                                {lineaPospuestas}
                            </div>
                        );
                    }

                    // ── xl: columnas por fuente ──
                    const grupos = agruparAvisos(lista);
                    const caben = Math.max(2, Math.floor((alto - 110) / (tactil ? 50 : 46)));
                    // Columnas por fuente solo cuando la lista no cabe entera: con pocos avisos, la lista es más rica.
                    if (b === "xl" && grupos.length > 1 && ancho >= 520 && lista.length > caben) {
                        const cols = Math.min(3, grupos.length);
                        const porColumna = Math.max(2, Math.floor((alto - 90) / 50));
                        return (
                            <div className="flex h-full flex-col gap-3 overflow-hidden p-3" data-diseno="xl-columnas">
                                {cabecera(true)}
                                <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                                    {grupos.slice(0, cols).map((g) => (
                                        <section key={g.grupo} className="flex min-w-0 flex-col gap-1.5" aria-label={`${g.etiqueta}: ${g.items.length}`}>
                                            <Rotulo color={g.color}>{g.etiqueta} · {g.items.length}</Rotulo>
                                            <ul className="flex flex-col gap-1.5"><AnimatePresence initial={false}>{g.items.slice(0, porColumna).map((n, i) => gota(n, i, { compacta: true, conPosponer: true }))}</AnimatePresence></ul>
                                        </section>
                                    ))}
                                </div>
                                {lineaPospuestas}
                            </div>
                        );
                    }

                    // ── l (y xl con una sola fuente): filtro por fuente + lista con acciones ──
                    const visibles = filtro === "todas" ? lista : lista.filter((n) => grupoDe(n) === filtro);
                    const max = caben;
                    return (
                        <div className="flex h-full flex-col gap-2 overflow-hidden p-3" data-diseno={`${b}-filtro`}>
                            {cabecera(true)}
                            {grupos.length > 1 && (
                                <div role="tablist" aria-label="Fuente" className="flex flex-wrap items-center gap-1">
                                    {([["todas", `Todas ${lista.length}`, "#ffffff"], ...grupos.map((g) => [g.grupo, `${g.etiqueta} ${g.items.length}`, g.color])] as [Grupo | "todas", string, string][]).map(([v, texto, c]) => (
                                        <button key={v} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
                                            className={`ss-redondo cursor-pointer whitespace-nowrap rounded-full px-2.5 font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/60 ${tactil ? "min-h-11 text-[13px]" : "py-0.5 text-[11.5px]"} ${filtro === v ? "text-white" : "text-white/55 hover:text-white"}`}
                                            style={{ background: filtro === v ? `${c}2e` : "transparent", boxShadow: filtro === v ? `inset 0 0 0 1px ${c}88` : undefined }}>
                                            {texto}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <ul className="flex min-h-0 flex-col gap-1.5"><AnimatePresence initial={false}>{visibles.slice(0, max).map((n, i) => gota(n, i, { conPosponer: true }))}</AnimatePresence></ul>
                            <div className="mt-auto flex items-center justify-between gap-2">
                                {lineaPospuestas || <span />}
                                <Link href="/notifications" className="cursor-pointer text-[11.5px] text-white/55 underline-offset-4 hover:text-white hover:underline">Abrir el centro de avisos</Link>
                            </div>
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default NotificacionesLibre;
