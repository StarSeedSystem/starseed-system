'use client';

// ════════════════════════════════════════════════════════════════
// MeritGalleryWidget — Cristalería de Mérito (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Meritocracia del entendimiento, verificable: las insignias REALES del
// ecosistema como cristales, encendidos los que tu perfil ya tiene
// (ganados haciendo o avalados por la comunidad) y apagados los que
// faltan, cada uno con cómo se gana y dónde. Una lectura cada 15 min,
// solo a la vista (catálogo, tu perfil y tus insignias). Nada de
// puntuaciones de confianza o huella inventadas. Estados honestos:
// cargando, vacío (sin catálogo o sin insignias aún), sin sesión y error.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Gem } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, VacioHonesto, tinta } from "./_catalogo/piezas";
import { useCompartido } from "./_catalogo/recurso";
import { AREAS, COMO_GANAR, cristaleria, hexagono, siguiente, type Insignia } from "./merit-gallery-partes";

interface Merito { insignias: Insignia[]; conPerfil: boolean }

async function cargarMerito(uid: string | null): Promise<Merito> {
    const sb = createClient();
    const cat = await sb.from("badges").select("id, code, name, description, area").order("name", { ascending: true }).limit(200);
    if (cat.error) throw new Error(cat.error.message || "La fuente no respondió");
    let mias: any[] = [];
    let conPerfil = false;
    if (uid) {
        const p = await sb.from("profiles").select("id").eq("user_id", uid).limit(1).maybeSingle();
        if (p.error) throw new Error(p.error.message || "La fuente no respondió");
        const pid = (p.data as { id?: string } | null)?.id;
        if (pid) {
            conPerfil = true;
            const r = await sb.from("profile_badges").select("awarded_at, awarded_by, badge:badge_id ( id, code, name, description, area )").eq("profile_id", pid).order("awarded_at", { ascending: false }).limit(200);
            if (r.error) throw new Error(r.error.message || "La fuente no respondió");
            mias = (Array.isArray(r.data) ? r.data : []).map((x: any) => ({ ...x, badge: Array.isArray(x?.badge) ? x.badge[0] : x?.badge }));
        }
    }
    return { insignias: cristaleria(Array.isArray(cat.data) ? cat.data : [], mias, uid), conPerfil };
}

function Cristal({ ins, tam, activo, l }: { ins: Insignia; tam: number; activo: boolean; l: EstadoLienzo }) {
    const id = useIdSvg("cri");
    const c = tam / 2, r = tam * 0.44, col = AREAS[ins.area].color;
    return (
        <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden className="block">
            <defs>
                <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tinta(col, 0.45)} />
                    <stop offset="100%" stopColor={col} />
                </linearGradient>
            </defs>
            <polygon points={hexagono(c, c, r)} fill={ins.ganada ? `url(#${id}-g)` : conAlfa(col, 0.1)} stroke={ins.ganada ? tinta(col, 0.3) : conAlfa(tinta(col, 0.3), 0.7)}
                strokeWidth={activo ? 2 : 1} strokeDasharray={ins.ganada ? undefined : "3 3"} opacity={ins.ganada ? 0.95 : 0.8}
                className={ins.ganada && activo && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center" }} />
            {ins.ganada && (
                <>
                    <polyline points={`${c},${c - r} ${c},${c} ${c - r * 0.87},${c + r * 0.5}`} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
                    <polyline points={`${c},${c} ${c + r * 0.87},${c + r * 0.5}`} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={0.8} />
                </>
            )}
        </svg>
    );
}

export function MeritGalleryWidget() {
    const l = useLienzo("#06b6d4", "#B24BF3");
    const [uid, setUid] = React.useState<string | null | undefined>(undefined);
    React.useEffect(() => {
        let vivo = true;
        void uidActual().then((u) => { if (vivo) setUid(u); }).catch(() => { if (vivo) setUid(null); });
        return () => { vivo = false; };
    }, []);
    const merito = useCompartido<Merito>(uid === undefined ? null : `merito:${uid ?? "anon"}`, 15 * 60_000, () => cargarMerito(uid ?? null), l.visible);
    const [sel, setSel] = React.useState<string | null>(null);

    const ins = merito.datos?.insignias ?? [];
    const ganadas = ins.filter((i) => i.ganada);
    const prox = siguiente(ins);
    const elegida = ins.find((i) => i.id === sel) ?? ganadas[0] ?? prox ?? null;
    const cargando = uid === undefined || (!merito.datos && !merito.error);
    const sinDatos = !merito.datos && !!merito.error;
    const sinSesion = uid === null;

    const etiqueta = cargando ? "Cristalería de mérito: cargando las insignias"
        : sinDatos ? "Cristalería de mérito: error, no se pudieron leer las insignias"
        : !ins.length ? "Cristalería de mérito: vacío, el catálogo de insignias aún no tiene ninguna"
        : `Cristalería de mérito: ${sinSesion ? "sin sesión" : `${ganadas.length} de ${ins.length} insignias`}${ganadas.length ? ` (${ganadas.slice(0, 4).map((g) => g.nombre).join(", ")})` : ""}${prox ? `. Siguiente: ${prox.nombre}` : ""}`;

    const especial = (compacto: boolean) => {
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando las insignias…" />;
        if (sinDatos) return <ErrorHonesto error={merito.error} color={l.acento} onReintentar={merito.recargar} compacto={compacto} />;
        if (!ins.length) return <VacioHonesto icono={Gem} color={l.acento} compacto={compacto} titulo="Aún no hay insignias" ayuda="El catálogo del ecosistema está vacío." />;
        return null;
    };

    const rejilla = (tam: number, max: number) => (
        <div className="flex flex-wrap content-start gap-1" role="group" aria-label="Insignias">
            {ins.slice(0, max).map((i) => {
                const activo = elegida?.id === i.id;
                return (
                    <button key={i.id} type="button" onClick={() => setSel(i.id)} aria-pressed={activo}
                        aria-label={`${i.nombre}: ${i.ganada ? (i.avalada ? "avalada por la comunidad" : "ganada") : "por ganar"}`} title={i.nombre}
                        className="grid cursor-pointer place-items-center rounded-lg transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
                        style={{ width: Math.max(tam, l.tactil ? l.toque : 0), height: Math.max(tam, l.tactil ? l.toque : 0) }}>
                        <Cristal ins={i} tam={tam} activo={activo} l={l} />
                    </button>
                );
            })}
        </div>
    );

    const ficha = (compacta: boolean) => {
        if (!elegida) return null;
        const a = AREAS[elegida.area];
        const camino = COMO_GANAR[elegida.code];
        const fecha = elegida.ganada ? new Date(elegida.ganada).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : null;
        return (
            <div className="min-w-0" aria-live="polite">
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tinta(a.color, 0.35) }}>{a.nombre} · {elegida.ganada ? (elegida.avalada ? "avalada" : "ganada") : "por ganar"}</p>
                <p className="line-clamp-2 text-[14px] font-medium leading-snug text-white" title={elegida.nombre}>{elegida.nombre}</p>
                {elegida.ganada
                    ? <p className="text-[11.5px] text-white/55">{fecha}{elegida.avalada ? " · reconocida por la comunidad" : ""}</p>
                    : <p className={`${compacta ? "line-clamp-2" : "line-clamp-3"} text-[11.5px] leading-snug text-white/60`}>{camino?.como ?? elegida.descripcion ?? "Consulta el criterio en Insignias."}</p>}
                {!compacta && elegida.ganada && elegida.descripcion && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-white/50">{elegida.descripcion}</p>}
                {!elegida.ganada && camino && !compacta && (
                    <div className="mt-1.5"><Accion color={a.color} alto={l.toque} icono={ArrowRight} href={camino.ruta} etiqueta={`${camino.boton} para ganar «${elegida.nombre}»`}>{camino.boton}</Accion></div>
                )}
            </div>
        );
    };

    const porGanar = (n: number) => {
        const lista = ins.filter((i) => !i.ganada && COMO_GANAR[i.code]).slice(0, n);
        if (!lista.length) return null;
        return (
            <div className="flex min-w-0 flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">Por ganar</p>
                <ul className="flex flex-col gap-0.5" aria-label="Insignias por ganar">
                    {lista.map((i) => {
                        const cam = COMO_GANAR[i.code];
                        return (
                            <li key={i.id}>
                                <Link href={cam.ruta} title={`${i.nombre}: ${cam.como}`} aria-label={`${i.nombre}: ${cam.como} (${cam.boton})`}
                                    className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-1.5 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                                    style={{ minHeight: l.toque + 4 }}>
                                    <Cristal ins={i} tam={24} activo={false} l={l} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12.5px] text-white/85">{i.nombre}</span>
                                        <span className="block truncate text-[11px] text-white/50">{cam.como}</span>
                                    </span>
                                    <ArrowRight className="size-3.5 shrink-0 text-white/40" aria-hidden />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    const resumen = (
        <p className="text-[11.5px] text-white/60">
            {sinSesion ? <>Inicia sesión para ver las tuyas · <Link href="/login" className="cursor-pointer underline-offset-2 hover:text-white hover:underline">Entrar</Link></>
                : merito.datos && !merito.datos.conPerfil ? "Tu cuenta aún no tiene perfil de mérito."
                : <><span className="tabular-nums text-white/90">{ganadas.length}</span> de <span className="tabular-nums">{ins.length}</span> insignias</>}
        </p>
    );

    if (l.base === "micro") {
        const top = ganadas[0] ?? ins[0];
        return (
            <Lienzo l={l} titulo="Cristalería de Mérito" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-0.5">
                    {top ? <Cristal ins={top} tam={l.lado * 0.5} activo={false} l={l} /> : <Gem className="size-6 text-white/40" aria-hidden />}
                    {!cargando && !sinDatos && <span className="text-[13px] tabular-nums text-white">{ganadas.length}/{ins.length}</span>}
                </div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Cristalería de Mérito" etiqueta={etiqueta} sinCabecera>
                {especial(true) ?? (
                    <Link href="/insignias" className="flex h-full cursor-pointer flex-col justify-center gap-2" aria-label={`Abrir Insignias: ${ganadas.length} de ${ins.length}`}>
                        <div className="flex flex-wrap gap-0.5">{ins.slice(0, 8).map((i) => <Cristal key={i.id} ins={i} tam={26} activo={false} l={l} />)}</div>
                        <span className="text-[12px] text-white/80"><span className="tabular-nums text-white">{ganadas.length}</span> de {ins.length} insignias</span>
                    </Link>
                )}
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const esp = especial(false);
    const enlace = <Accion color={l.acento} alto={28} soloIcono icono={Gem} href="/insignias" etiqueta="Abrir todas las insignias">Insignias</Accion>;
    if (esp) {
        return (
            <Lienzo l={l} titulo="Cristalería de Mérito" subtitulo={l.ancho >= 300 ? "Lo que la comunidad reconoce" : undefined} icono={Gem} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center">{esp}</div>
            </Lienzo>
        );
    }

    if (l.horizontal) {
        const ancho = l.ancho * 0.5, tam = 34, porFila = Math.max(1, Math.floor(ancho / (tam + 4)));
        return (
            <Lienzo l={l} titulo="Cristalería de Mérito" subtitulo="Lo que la comunidad reconoce" icono={Gem} etiqueta={etiqueta} acciones={enlace}>
                <div className="flex h-full min-h-0 items-center gap-5">
                    <div className="flex min-h-0 flex-col gap-2" style={{ width: ancho }}>{rejilla(tam, porFila * Math.max(1, Math.floor((hb - 24) / (tam + 4))))}{resumen}</div>
                    <div className="min-w-0 flex-1">{ficha(false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const tam = 32;
        return (
            <Lienzo l={l} titulo="Mérito" subtitulo="Tus insignias" icono={Gem} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    {resumen}
                    <div className="min-h-0 overflow-y-auto" style={{ maxHeight: hb * 0.4 }}>{rejilla(tam, 60)}</div>
                    {ficha(true)}
                    {!sinSesion && porGanar(2)}
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "xl";
    const tam = grande ? 44 : 34;
    const anchoRejilla = grande ? l.ancho - 40 : l.ancho * 0.48;
    const porFila = Math.max(1, Math.floor(anchoRejilla / (tam + 4)));
    const filas = Math.max(1, Math.floor((grande ? hb * 0.3 : hb - 30) / (tam + 4)));
    return (
        <Lienzo l={l} titulo="Cristalería de Mérito" subtitulo={l.ancho >= 300 ? "Lo que la comunidad reconoce" : undefined} icono={Gem} etiqueta={etiqueta} acciones={l.base !== "m" ? enlace : undefined}>
            <div className={`flex h-full min-h-0 gap-4 ${grande ? "flex-col" : "items-center"}`}>
                <div className="flex min-h-0 flex-col gap-2" style={{ width: grande ? undefined : anchoRejilla }}>{rejilla(tam, porFila * filas)}{resumen}</div>
                <div className={`min-w-0 ${grande ? "" : "flex-1"}`}>{ficha(l.base === "m")}</div>
                {grande && !sinSesion && porGanar(3)}
            </div>
        </Lienzo>
    );
}
