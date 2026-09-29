'use client';

// ════════════════════════════════════════════════════════════════
// CollabProjectsWidget — proyectos de la red (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Datos REALES: las páginas de tipo «proyecto» de la red (os_pages), con su gente,
// sus etiquetas y su portada. Antes pintaba un adaptador simulado que siempre
// devolvía una lista vacía. La lectura se comparte con el mapa (misma caché de
// páginas, 15 min) y solo se refresca con el widget a la vista.
// Qué hace: descubrir en qué se está trabajando en común, filtrar por etiqueta,
// abrir un proyecto para unirte y crear el tuyo.
// Composición: micro = cuántos hay · s = cuántos + caras · m = los tres con más
// gente · l = constelación (tamaño = gente) + lista + filtro por etiqueta ·
// xl = tarjetas con portada · panorámico = tarjetas en fila · torre = lista.
// Estados honestos: cargando (esqueleto), vacío (con el siguiente paso), error (con
// reintento o el aviso de pausa de consumo de la nube) y sin sesión.
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Layers, Users, Plus, ArrowUpRight, CloudOff, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { CargandoE, EncabezadoE, EnlaceE, ErrorE, PestanasE, RaizE, SelloE, VacioE, estilosE, tintaE } from "./paquete-e/piezas";
import { TTL_EXTERNO_MS, useCacheadoE } from "./paquete-e/cache";
import { pausaServidorE } from "./paquete-e/estudio";
import { CLAVE_PAGINAS_RED, cargarPaginasRed, type PaginaRed } from "./paquete-e/red";

const CREAR = "/crear?area=lienzo&createEntity=page";

function Avatar({ p, lado }: { p: PaginaRed; lado: number }) {
    const inicial = p.name.trim().charAt(0).toUpperCase() || "·";
    const color = /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : "#7c5cff";
    return p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatarUrl} alt="" loading="lazy" decoding="async" className="shrink-0 rounded-full object-cover" style={{ width: lado, height: lado, boxShadow: `0 0 0 2px rgba(12,14,34,.9), 0 0 10px ${conAlfa(color, 0.5)}` }} />
    ) : (
        <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: lado, height: lado, fontSize: lado * 0.42, background: `linear-gradient(145deg, ${color}, ${conAlfa(color, 0.45)})`, boxShadow: "0 0 0 2px rgba(12,14,34,.9)" }}>{inicial}</span>
    );
}

/** Constelación: cada proyecto una estrella, más grande cuanta más gente. Dispuesta en espiral áurea. */
function Constelacion({ lista, ancho, alto, lienzo }: { lista: PaginaRed[]; ancho: number; alto: number; lienzo: LienzoE }) {
    const max = Math.max(1, ...lista.map((p) => p.memberCount));
    const cx = ancho / 2, cy = alto / 2;
    const puntos = lista.slice(0, 18).map((p, i) => {
        const a = i * 2.39996;
        const r = Math.sqrt((i + 0.6) / Math.min(18, lista.length)) * Math.min(cx, cy) * 0.86;
        return { p, x: cx + Math.cos(a) * r * (ancho / Math.max(ancho, alto)), y: cy + Math.sin(a) * r, t: 3 + 7 * Math.sqrt(p.memberCount / max) };
    });
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full" role="img" aria-label={`Constelación de ${lista.length} proyectos: el tamaño de cada estrella es su gente`}>
            {puntos.slice(1).map((q, i) => (
                <line key={q.p.id} x1={puntos[i].x} y1={puntos[i].y} x2={q.x} y2={q.y} stroke={conAlfa(lienzo.acento, 0.18)} strokeWidth={1} />
            ))}
            {puntos.map((q, i) => {
                const c = /^#[0-9a-f]{6}$/i.test(q.p.accent) ? q.p.accent : lienzo.acento;
                return (
                    <a key={q.p.id} href={`/pagina/${q.p.slug}`} aria-label={`${q.p.name}, ${q.p.memberCount} personas`}>
                        <title>{`${q.p.name} · ${q.p.memberCount} personas`}</title>
                        <circle cx={q.x} cy={q.y} r={q.t * 2.2} fill={conAlfa(c, 0.12)} className={lienzo.animar && i < 3 ? "ss-respirar" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center", ["--ss-dur" as string]: `${4 + i}s` }} />
                        <circle cx={q.x} cy={q.y} r={q.t} fill={c} style={{ filter: `drop-shadow(0 0 ${q.t}px ${conAlfa(c, 0.8)})` }} />
                    </a>
                );
            })}
        </svg>
    );
}

export function CollabProjectsWidget() {
    const { ref, lienzo } = useLienzoE();
    const { datos, cargando, error, recargar } = useCacheadoE<PaginaRed[]>(CLAVE_PAGINAS_RED, cargarPaginasRed, { ttlMs: TTL_EXTERNO_MS, visible: lienzo.visible });
    const [etiqueta, setEtiqueta] = useState<string>("todas");

    const proyectos = useMemo(() => (datos ?? []).filter((p) => p.kind === "proyecto").sort((a, b) => b.memberCount - a.memberCount), [datos]);
    const etiquetas = useMemo(() => {
        const n = new Map<string, number>();
        for (const p of proyectos) for (const t of p.tags) n.set(t, (n.get(t) ?? 0) + 1);
        return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    }, [proyectos]);
    const filtrados = etiqueta === "todas" ? proyectos : proyectos.filter((p) => p.tags.includes(etiqueta));
    const gente = proyectos.reduce((s, p) => s + p.memberCount, 0);

    const { base, clase, horizontal } = lienzo;
    const compacto = base === "micro" || base === "s";
    const raiz = { lienzo, refRaiz: ref, etiqueta: "Proyectos de la red", tipo: "COLLAB_PROJECTS" } as const;
    const tinta = tintaE(lienzo.acento);

    if (!datos && cargando) return <RaizE {...raiz}><CargandoE etiqueta="Cargando proyectos de la red…" filas={compacto ? 2 : 3} /></RaizE>;
    if (!datos && error) {
        const pausa = pausaServidorE();
        return <RaizE {...raiz}>{pausa ? <VacioE lienzo={lienzo} icono={CloudOff} titulo="La nube está en pausa" texto={pausa} compacto={compacto} /> : <ErrorE lienzo={lienzo} texto="No se pudieron leer los proyectos de la red." onReintentar={recargar} />}</RaizE>;
    }
    if (proyectos.length === 0) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={Layers} titulo="La red aún no tiene proyectos publicados" texto="Abre el primero: una página de proyecto a la que otras personas puedan unirse." compacto={compacto}>
                    <EnlaceE lienzo={lienzo} href={CREAR} variante="primario" icono={Plus} compacto={compacto}>Crear proyecto</EnlaceE>
                    {!compacto && <EnlaceE lienzo={lienzo} href="/hub" icono={Compass}>Explorar la red</EnlaceE>}
                </VacioE>
            </RaizE>
        );
    }

    if (base === "micro") {
        return (
            <RaizE {...raiz}>
                <a href="/hub" className="flex h-full cursor-pointer flex-col items-center justify-center text-center" title={`${proyectos.length} proyectos en la red`}>
                    <span className="tabular-nums text-white" style={{ fontSize: Math.max(22, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.38), fontWeight: 250 }}>{proyectos.length}</span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/55">proyectos</span>
                </a>
            </RaizE>
        );
    }

    if (base === "s") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <span className="tabular-nums text-white" style={{ fontSize: 34, fontWeight: 250, lineHeight: 1 }}>{proyectos.length}</span>
                    <span className="text-[11px] text-white/60">proyectos · {gente} personas</span>
                    <span className="flex -space-x-2">{proyectos.slice(0, 4).map((p) => <Avatar key={p.id} p={p} lado={26} />)}</span>
                </div>
            </RaizE>
        );
    }

    const fila = (p: PaginaRed) => (
        <li key={p.id} className={estilosE.entra}>
            <a href={`/pagina/${p.slug}`} className="group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-2xl px-2 py-1.5 outline-none transition-colors duration-200 hover:bg-white/[0.05] focus-visible:bg-white/[0.08]">
                <Avatar p={p} lado={lienzo.tv ? 40 : 32} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }} title={p.name}>{p.name}</span>
                    <span className="block truncate text-white/55" style={{ fontSize: px(lienzo, 11) }}>{p.description || p.tags.map((t) => `#${t}`).join(" ") || "Proyecto de la red"}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-white/60" style={{ fontSize: px(lienzo, 12) }} title={`${p.memberCount} personas`}>
                    <Users aria-hidden className="size-3.5" style={{ color: tinta }} />{p.memberCount}
                </span>
                <ArrowUpRight aria-hidden className="size-4 shrink-0 text-white/30 transition-colors group-hover:text-white/80" />
            </a>
        </li>
    );

    const tarjeta = (p: PaginaRed, ancho?: number) => {
        const c = /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : lienzo.acento;
        return (
            <li key={p.id} className={cn(estilosE.entra, "min-w-0")} style={ancho ? { width: ancho, flexShrink: 0 } : undefined}>
                <a href={`/pagina/${p.slug}`} className="group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2"
                    style={{ background: "rgba(255,255,255,.04)", boxShadow: `inset 0 0 0 1px ${conAlfa(c, 0.25)}`, ["--tw-ring-color" as string]: c } as React.CSSProperties}>
                    <span className="relative block h-16 w-full shrink-0" style={{ background: `linear-gradient(135deg, ${conAlfa(c, 0.55)}, ${conAlfa(lienzo.acento2, 0.25)})` }}>
                        {p.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover opacity-80" />
                        )}
                        <span className="absolute -bottom-4 left-3"><Avatar p={p} lado={32} /></span>
                    </span>
                    <span className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-2.5 pt-5">
                        <span className="truncate text-[13px] font-semibold text-white" title={p.name}>{p.name}</span>
                        <span className="line-clamp-2 text-[11px] leading-snug text-white/60">{p.description || "Proyecto de la red"}</span>
                        <span className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-white/60">
                            <Users aria-hidden className="size-3.5" style={{ color: tinta }} />{p.memberCount} personas
                            {p.tags[0] && <span className="ml-auto"><SelloE color={c}>#{p.tags[0]}</SelloE></span>}
                        </span>
                    </span>
                </a>
            </li>
        );
    };

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={Layers} titulo="Proyectos de la red" detalle={`${proyectos.length} · ${gente} personas`}
            acciones={<EnlaceE lienzo={lienzo} href={CREAR} compacto icono={Plus}>Crear</EnlaceE>} />
    );

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    <ul className={cn("flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden pb-1", estilosE.desliza)}>{proyectos.slice(0, 10).map((p) => tarjeta(p, 200))}</ul>
                </div>
            </RaizE>
        );
    }

    if (base === "m" || clase === "torre") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5", estilosE.desliza)}>{proyectos.slice(0, clase === "torre" ? 12 : 3).map(fila)}</ul>
                    {clase !== "torre" && proyectos.length > 3 && <EnlaceE lienzo={lienzo} href="/hub" compacto variante="fantasma" className="self-start">Ver los {proyectos.length}</EnlaceE>}
                </div>
            </RaizE>
        );
    }

    const filtro = etiquetas.length > 1 ? (
        <PestanasE lienzo={lienzo} etiqueta="Filtrar por etiqueta" valor={etiqueta} onCambio={setEtiqueta}
            opciones={[{ id: "todas", etiqueta: "Todos" }, ...etiquetas.map((t) => ({ id: t, etiqueta: `#${t}` }))]} />
    ) : null;

    if (base === "xl") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    {filtro}
                    <ul className={cn("grid min-h-0 flex-1 gap-2", estilosE.desliza)} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gridAutoRows: "min-content" }}>
                        {filtrados.slice(0, 12).map((p) => tarjeta(p))}
                    </ul>
                </div>
            </RaizE>
        );
    }

    // l: constelación + lista.
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                {cabecera}
                <div className="shrink-0"><Constelacion lista={filtrados} ancho={Math.max(160, (lienzo.ancho || 320) - 8)} alto={Math.max(60, Math.min(110, (lienzo.alto || 360) * 0.26))} lienzo={lienzo} /></div>
                {filtro}
                <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5", estilosE.desliza)}>{filtrados.slice(0, 8).map(fila)}</ul>
            </div>
        </RaizE>
    );
}
