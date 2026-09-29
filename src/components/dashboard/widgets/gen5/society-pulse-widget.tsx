'use client';

// ════════════════════════════════════════════════════════════════
// SocietyPulseWidget — Pulso de la Sociedad (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// El latido REAL de la red, con los hooks en vivo que ya usa el OS
// (os-live: publicaciones, grupos y eventos; sin sondeos nuevos ni
// suscripciones propias): cuántas voces se han oído estos siete días,
// qué comunidades reúnen a más gente y qué encuentros vienen. La curva
// es un electrocardiograma de publicaciones por día; si la muestra
// que carga el hook se llena, las cifras se dicen como «al menos».
// Fuera la «armonía», la «abundancia» y las regiones simuladas.
// Estados honestos: cargando y vacío (la red en calma o sin conexión:
// os-live convierte cualquier error de lectura en una lista vacía).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { Activity, CalendarDays, Megaphone, Users } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { rowAccent, useLiveEvents, useLiveGroups, useLivePosts } from "@/lib/widget-data/os-live";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, CargandoSilueta, VacioHonesto, tinta } from "./_catalogo/piezas";
import { comunidades, latidos, latiendo, muestraLlena, proximos, voces, type Latido } from "./society-pulse-partes";

const LIMITE_POSTS = 24;

function Electro({ W, H, dias, vivo, l }: { W: number; H: number; dias: Latido[]; vivo: boolean; l: EstadoLienzo }) {
    const id = useIdSvg("ecg");
    const max = Math.max(1, ...dias.map((d) => d.n));
    const base = H * 0.62, paso = W / dias.length;
    // Cada día, un latido: subida proporcional a sus publicaciones; sin publicaciones, línea plana.
    const d = dias.map((x, i) => {
        const x0 = i * paso, a = x.n ? (x.n / max) * (H * 0.55) : 0;
        if (!a) return `L${(x0 + paso).toFixed(1)} ${base}`;
        return `L${(x0 + paso * 0.35).toFixed(1)} ${base}L${(x0 + paso * 0.45).toFixed(1)} ${(base + a * 0.25).toFixed(1)}L${(x0 + paso * 0.55).toFixed(1)} ${(base - a).toFixed(1)}L${(x0 + paso * 0.65).toFixed(1)} ${(base + a * 0.35).toFixed(1)}L${(x0 + paso * 0.75).toFixed(1)} ${base}L${(x0 + paso).toFixed(1)} ${base}`;
    }).join("");
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
            <defs>
                <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={l.acento} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={l.acento} stopOpacity={1} />
                </linearGradient>
            </defs>
            {dias.map((x, i) => i > 0 && <line key={i} x1={i * paso} x2={i * paso} y1={H * 0.1} y2={H * 0.95} stroke="#fff" strokeOpacity={0.05} />)}
            <path d={`M0 ${base}${d}`} fill="none" stroke={`url(#${id}-l)`} strokeWidth={2} strokeLinejoin="round" />
            <circle cx={W - 3} cy={base} r={4} fill={vivo ? tinta(l.acento, 0.3) : conAlfa("#ffffff", 0.3)}
                className={vivo && l.animar ? "ss-latir" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
            {dias.map((x, i) => H >= 60 && (
                <text key={x.dia} x={i * paso + paso / 2} y={H - 1} textAnchor="middle" fill="#fff" opacity={0.35} style={{ fontSize: 9 }}>
                    {new Date(x.dia).toLocaleDateString("es-ES", { weekday: "narrow" })}
                </text>
            ))}
        </svg>
    );
}

export function SocietyPulseWidget() {
    const l = useLienzo("#10b981", "#a855f7");
    const posts = useLivePosts(LIMITE_POSTS);
    const grupos = useLiveGroups();
    const eventos = useLiveEvents();
    const [ahora, setAhora] = React.useState(() => Date.now());
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(Date.now());
        const t = window.setInterval(() => setAhora(Date.now()), 5 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const dias = React.useMemo(() => latidos(posts.rows, ahora), [posts.rows, ahora]);
    const semana = dias.reduce((s, d) => s + d.n, 0);
    const llena = muestraLlena(posts.rows, LIMITE_POSTS, dias[0].dia);
    const nVoces = React.useMemo(() => voces(posts.rows, ahora), [posts.rows, ahora]);
    const vienen = React.useMemo(() => proximos(eventos.rows, ahora), [eventos.rows, ahora]);
    const com = React.useMemo(() => comunidades(grupos.rows), [grupos.rows]);
    const vivo = latiendo(posts.rows, ahora);
    const hoy = dias[dias.length - 1].n;
    const cargando = (posts.loading || grupos.loading || eventos.loading) && !posts.rows.length && !grupos.rows.length && !eventos.rows.length;
    const calma = !cargando && !posts.rows.length && !grupos.rows.length && !eventos.rows.length;
    const al = llena ? "al menos " : "";

    const etiqueta = cargando ? "Pulso de la sociedad: cargando la actividad de la red"
        : calma ? "Pulso de la sociedad: vacío, la red está en calma o sin conexión"
        : `Pulso de la sociedad: ${al}${semana} publicaciones en 7 días (${al}${hoy} hoy) de ${nVoces} voces distintas; ${com.total} comunidades con ${com.miembros} miembros; ${vienen.length} encuentro${vienen.length === 1 ? "" : "s"} en los próximos 7 días${vienen[0] ? `, el primero «${vienen[0].title}»` : ""}${vivo ? ". Hubo actividad en la última hora" : ""}`;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Pulso de la Sociedad" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-0.5">
                    <Activity className={`size-6 ${vivo && l.animar ? "ss-latir" : ""}`} style={{ color: tinta(l.acento, 0.3) }} aria-hidden />
                    {!cargando && <span className="text-[14px] tabular-nums text-white">{llena ? `${semana}+` : semana}</span>}
                </div>
            </Lienzo>
        );
    }

    const especial = (compacto: boolean) => {
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando la actividad de la red…" />;
        if (calma) return <VacioHonesto icono={Activity} color={l.acento} compacto={compacto} titulo="La red está en calma" ayuda="Aún no hay actividad visible (o no hay conexión)." accion={compacto ? undefined : <Accion color={l.acento} alto={l.toque} icono={Megaphone} href="/red-feed" etiqueta="Publicar en la red">Publicar</Accion>} />;
        return null;
    };

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Pulso de la Sociedad" etiqueta={etiqueta} sinCabecera>
                {especial(true) ?? (
                    <Link href="/red-feed" className="flex h-full cursor-pointer flex-col justify-center gap-1.5" aria-label={`Abrir la red: ${semana} publicaciones en 7 días`}>
                        <Electro W={l.ancho - 24} H={40} dias={dias} vivo={vivo} l={l} />
                        <span className="text-[12px] text-white/80"><span className="text-[18px] tabular-nums text-white">{llena ? `${semana}+` : semana}</span> en 7 días</span>
                        <span className="truncate text-[11px] text-white/55">{nVoces} voces · {vienen.length} encuentros</span>
                    </Link>
                )}
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const esp = especial(false);
    if (esp) {
        return (
            <Lienzo l={l} titulo={l.ancho < 230 ? "Pulso" : "Pulso de la Sociedad"} subtitulo={l.ancho >= 300 ? "La red, estos siete días" : undefined} icono={Activity} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center">{esp}</div>
            </Lienzo>
        );
    }

    const cifras = (compactas: boolean) => (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            {[
                { t: "Publicaciones", v: `${llena ? `${semana}+` : semana}`, s: `${al}${hoy} hoy` },
                { t: "Voces", v: `${nVoces}`, s: "distintas" },
                { t: "Encuentros", v: `${vienen.length}`, s: "en 7 días" },
            ].map((c) => (
                <div key={c.t} className="min-w-0">
                    <dt className="truncate text-[10px] uppercase tracking-[0.06em] text-white/45" title={c.t}>{c.t}</dt>
                    <dd className="text-[20px] font-light leading-tight tabular-nums text-white">{c.v}</dd>
                    {!compactas && <dd className="truncate text-[11px] text-white/50">{c.s}</dd>}
                </div>
            ))}
        </dl>
    );

    const listaEventos = (n: number) => vienen.length ? (
        <ul className="flex flex-col gap-0.5" aria-label="Próximos encuentros">
            {vienen.slice(0, n).map((e) => (
                <li key={e.id}>
                    <Link href={`/evento/${encodeURIComponent(e.slug)}`} title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }}>
                        <CalendarDays className="size-3.5 shrink-0 text-white/45" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{e.title}</span>
                        <span className="shrink-0 text-[11px] text-white/50">{new Date(e.starts_at!).toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</span>
                    </Link>
                </li>
            ))}
        </ul>
    ) : <p className="text-[11.5px] text-white/50">Sin encuentros en los próximos 7 días.</p>;

    const listaComunidades = (n: number) => com.top.length ? (
        <ul className="flex flex-col gap-0.5" aria-label="Comunidades con más gente">
            {com.top.slice(0, n).map((g) => (
                <li key={g.id}>
                    <Link href={`/grupo/${encodeURIComponent(g.slug)}`} title={g.name}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }}>
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: rowAccent(g.accent) }} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{g.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-white/55"><Users className="size-3" aria-hidden />{g.member_count ?? 0}</span>
                    </Link>
                </li>
            ))}
        </ul>
    ) : <p className="text-[11.5px] text-white/50">Aún no hay comunidades.</p>;

    const nota = llena && <p className="text-[10.5px] text-white/40">Sobre las {LIMITE_POSTS} publicaciones más recientes: hay al menos estas.</p>;

    if (l.horizontal) {
        return (
            <Lienzo l={l} titulo="Pulso de la Sociedad" subtitulo="La red, estos siete días" icono={Activity} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-5">
                    <div className="flex shrink-0 flex-col gap-2" style={{ width: l.ancho * 0.46 }}>
                        <Electro W={l.ancho * 0.46} H={Math.min(90, hb * 0.5)} dias={dias} vivo={vivo} l={l} />
                        {cifras(true)}
                    </div>
                    <div className="min-w-0 flex-1">{listaEventos(Math.max(1, Math.floor(hb / 34)))}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        return (
            <Lienzo l={l} titulo="Pulso" subtitulo="Estos siete días" icono={Activity} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
                    <Electro W={l.ancho - 40} H={56} dias={dias} vivo={vivo} l={l} />
                    <p className="text-[12px] leading-relaxed text-white/65">
                        <span className="text-[17px] tabular-nums text-white">{llena ? `${semana}+` : semana}</span> publicaciones<br />
                        <span className="text-[17px] tabular-nums text-white">{nVoces}</span> voces distintas
                    </p>
                    {listaEventos(2)}
                    {listaComunidades(2)}
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "xl";
    return (
        <Lienzo l={l} titulo="Pulso de la Sociedad" subtitulo={l.ancho >= 300 ? "La red, estos siete días" : undefined} icono={Activity} etiqueta={etiqueta}
            acciones={l.base !== "m" ? <Accion color={l.acento} alto={28} soloIcono icono={Megaphone} href="/red-feed" etiqueta="Abrir la red y publicar">Red</Accion> : undefined}>
            <div className="flex h-full min-h-0 flex-col gap-3">
                <Electro W={l.ancho - 40} H={grande ? 90 : l.base === "l" ? 70 : 56} dias={dias} vivo={vivo} l={l} />
                {cifras(l.base === "m")}
                {grande ? (
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto">
                        <div className="min-w-0"><p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/45">Encuentros</p>{listaEventos(4)}</div>
                        <div className="min-w-0"><p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/45">Comunidades</p>{listaComunidades(4)}</div>
                    </div>
                ) : <div className="min-h-0 flex-1 overflow-y-auto">{listaEventos(l.base === "l" ? 2 : Math.max(1, Math.floor((hb - 130) / 34)))}</div>}
                {(grande || l.base === "l") && nota}
            </div>
        </Lienzo>
    );
}
