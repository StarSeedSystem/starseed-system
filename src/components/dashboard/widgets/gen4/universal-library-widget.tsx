'use client';

// ════════════════════════════════════════════════════════════════
// UniversalLibraryWidget — Biblioteca Universal (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// TU biblioteca real en una estantería: cada lomo es algo que
// guardaste (recursos, «starseed.library.saved») o instalaste
// (paquetes del catálogo del OS), con el color de su tipo. Debajo,
// lo último que entró y un buscador que recorre el catálogo entero de
// la Biblioteca (apps, widgets, diseños, fuentes de IA, habilidades,
// agentes…) sin tocar la red: es código del propio OS, cargado a
// demanda. En «xl», los tipos del catálogo con su recuento real.
// Estados honestos: cargando (catálogo), vacío (nada guardado ni
// instalado: cuántos paquetes esperan y a un toque de explorarlos) y
// error (catálogo ilegible, con reintento).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { BookMarked, BookOpen, Library, Search, X } from "lucide-react";
import { useSavedLibrary } from "@/lib/library-store";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, Rot, VacioHonesto, tinta } from "../gen5/_catalogo/piezas";
import { buscarPaquetes, useCatalogoBiblioteca, type PaqueteBiblioteca } from "../gen5/_catalogo/biblioteca";
import { TIPO_PAQUETE, colorTipo } from "../gen5/serendipity-lens-partes";

interface Lomo { id: string; titulo: string; tipo: string; color: string; en: number; href: string }

function hash(s: string): number {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
}

function Estanteria({ lomos, ancho, alto, baldas, l }: { lomos: Lomo[]; ancho: number; alto: number; baldas: number; l: EstadoLienzo }) {
    const id = useIdSvg("estante");
    const altoBalda = alto / baldas;
    const grosor = Math.max(9, Math.min(16, ancho / 22));
    const porBalda = Math.max(1, Math.floor((ancho - 8) / (grosor + 2.5)));
    const cabe = porBalda * baldas;
    const visibles = lomos.slice(0, Math.max(0, lomos.length > cabe ? cabe - 1 : cabe));
    const resto = lomos.length - visibles.length;
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Estantería con ${lomos.length} elementos de tu biblioteca`} className="block shrink-0 overflow-visible">
            <defs>
                <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
                    <stop offset="45%" stopColor="#ffffff" stopOpacity={0.04} />
                    <stop offset="100%" stopColor="#000000" stopOpacity={0.18} />
                </linearGradient>
            </defs>
            {Array.from({ length: baldas }, (_, b) => {
                const base = (b + 1) * altoBalda - 3;
                const deEsta = visibles.slice(b * porBalda, (b + 1) * porBalda);
                return (
                    <g key={b}>
                        {deEsta.map((lo, i) => {
                            const h = altoBalda * (0.62 + ((hash(lo.id) % 30) / 100));
                            const x = 4 + i * (grosor + 2.5);
                            const inclinado = i === deEsta.length - 1 && deEsta.length < porBalda;
                            return (
                                <g key={lo.id} transform={inclinado ? `rotate(9 ${x + grosor} ${base})` : undefined}>
                                    <title>{`${lo.titulo} · ${lo.tipo}`}</title>
                                    <rect x={x} y={base - h} width={grosor} height={h} rx={2.5} fill={conAlfa(lo.color, 0.55)} stroke={conAlfa(lo.color, 0.9)} strokeWidth={0.8} />
                                    <rect x={x} y={base - h} width={grosor} height={h} rx={2.5} fill={`url(#${id}-l)`} />
                                    <rect x={x + 2} y={base - h + 5} width={grosor - 4} height={1.6} rx={0.8} fill="#fff" opacity={0.5} />
                                    <rect x={x + 2} y={base - 9} width={grosor - 4} height={1.6} rx={0.8} fill="#fff" opacity={0.3} />
                                </g>
                            );
                        })}
                        {b === baldas - 1 && resto > 0 && (
                            <text x={4 + deEsta.length * (grosor + 2.5) + 4} y={base - 6} fill={tinta(l.acento, 0.3)} style={{ fontSize: 11, fontWeight: 600 }}>+{resto}</text>
                        )}
                        <rect x={0} y={base} width={ancho} height={3} rx={1.5} fill={`url(#${id}-b)`} />
                        <rect x={0} y={base + 3} width={ancho} height={6} fill={conAlfa(l.acento, 0.08)} />
                    </g>
                );
            })}
        </svg>
    );
}

export function UniversalLibraryWidget() {
    const l = useLienzo("#7c5cff", "#23d5ab");
    const { items } = useSavedLibrary();
    const cat = useCatalogoBiblioteca();
    const [q, setQ] = React.useState("");
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => { setMontado(true); }, []);

    const lomos = React.useMemo<Lomo[]>(() => {
        const out: Lomo[] = items.map((r) => ({
            id: `s:${r.id}`, titulo: r.title, tipo: r.kind === "app" ? "App" : r.kind === "paquete" ? "Paquete" : "Recurso",
            color: colorTipo(r.kind === "app" ? "App" : "Investigación"), en: r.savedAt, href: r.url && (r.url.startsWith("/") || r.url.startsWith("https://")) ? r.url : "/library?tab=personal",
        }));
        if (cat.datos) {
            const porId = new Map(cat.datos.paquetes.map((p) => [p.id, p]));
            for (const [id, en] of Object.entries(cat.datos.instalados)) {
                const p = porId.get(id);
                if (!p) continue;
                const tipo = TIPO_PAQUETE[p.kind] ?? "Paquete";
                out.push({ id: `i:${id}`, titulo: p.name, tipo, color: colorTipo(tipo), en, href: typeof p.payload?.route === "string" ? (p.payload.route as string) : "/library?tab=instalado" });
            }
        }
        return out.sort((a, b) => b.en - a.en);
    }, [items, cat.datos]);

    const resultados = cat.datos ? buscarPaquetes(cat.datos.paquetes, q, l.base === "xl" ? 5 : 3) : [];
    const disponibles = cat.datos ? cat.datos.paquetes.filter((p) => !p.comingSoon).length : 0;
    const etiqueta = !montado || cat.cargando ? "Biblioteca universal: cargando"
        : `Biblioteca universal: ${lomos.length} elementos en tu biblioteca (${items.length} guardados, ${lomos.length - items.length} instalados) de ${disponibles} paquetes del catálogo.`;

    if (!montado || (cat.cargando && !items.length)) {
        return (
            <Lienzo l={l} titulo="Biblioteca Universal" icono={Library} etiqueta={etiqueta}>
                <CargandoSilueta color={l.acento} etiqueta="Cargando tu biblioteca…" />
            </Lienzo>
        );
    }
    if (cat.error && !items.length) {
        return (
            <Lienzo l={l} titulo="Biblioteca Universal" icono={Library} etiqueta={etiqueta}>
                <ErrorHonesto error={cat.error} color={l.acento} onReintentar={cat.recargar} compacto={l.base === "s" || l.base === "micro"} />
            </Lienzo>
        );
    }

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Biblioteca Universal" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    <BookMarked aria-hidden className="size-7" style={{ color: tinta(l.acento) }} strokeWidth={1.5} />
                    <span className="text-[18px] font-light tabular-nums text-white">{lomos.length}</span>
                </div>
            </Lienzo>
        );
    }

    if (!lomos.length) {
        return (
            <Lienzo l={l} titulo="Biblioteca Universal" icono={Library} etiqueta={etiqueta} sinCabecera={l.base === "s"}>
                <VacioHonesto icono={BookOpen} color={l.acento} compacto={l.base === "s"}
                    titulo="Tu biblioteca aún está vacía"
                    ayuda={disponibles ? `${disponibles} paquetes libres esperan en el catálogo: apps, widgets, diseños y fuentes de IA.` : "Guarda recursos o instala paquetes desde la Biblioteca."}
                    accion={<Accion color={l.acento} solida alto={l.toque} href="/library?tab=destacado" icono={Library}>Explorar</Accion>} />
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Biblioteca Universal" etiqueta={etiqueta} sinCabecera>
                <Link href="/library?tab=personal" className="flex h-full cursor-pointer flex-col justify-center gap-1.5" aria-label={`Abrir tu biblioteca: ${lomos.length} elementos`}>
                    <Estanteria lomos={lomos} ancho={l.ancho - 24} alto={Math.max(44, l.alto - 60)} baldas={1} l={l} />
                    <p className="text-center text-[12px] text-white/75"><span className="tabular-nums text-white">{lomos.length}</span> en tu biblioteca</p>
                </Link>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const buscador = (
        <form role="search" onSubmit={(e) => e.preventDefault()} className="ss-redondo flex min-w-0 items-center gap-1.5 rounded-full px-3" style={{ background: conAlfa(l.acento, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(l.acento, 0.4)}`, minHeight: l.toque }}>
            <Search aria-hidden className="size-3.5 shrink-0 text-white/55" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${disponibles} paquetes…`} aria-label="Buscar en el catálogo de la Biblioteca"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Borrar la búsqueda" className="ss-redondo grid size-6 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10"><X className="size-3.5" /></button>}
        </form>
    );
    const fila = (titulo: string, tipo: string, color: string, href: string, key: string) => (
        <li key={key}>
            <Link href={href} target={href.startsWith("https://") ? "_blank" : undefined} rel={href.startsWith("https://") ? "noopener noreferrer" : undefined} className="flex min-w-0 cursor-pointer items-center gap-2 text-[12.5px] text-white/80 transition-colors duration-200 hover:text-white" style={{ minHeight: Math.min(l.toque, 30) }}>
                <span aria-hidden className="h-4 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate" title={titulo}>{titulo}</span>
                <span className="shrink-0 text-[10.5px] text-white/45">{tipo}</span>
            </Link>
        </li>
    );
    const lista = q.trim().length >= 2 ? (
        resultados.length
            ? <ul className="flex min-w-0 flex-col" aria-label="Resultados del catálogo">{resultados.map((p: PaqueteBiblioteca) => {
                const tipo = TIPO_PAQUETE[p.kind] ?? "Paquete";
                const instalado = !!cat.datos?.instalados[p.id];
                return fila(p.name, instalado ? `${tipo} · instalado` : tipo, colorTipo(tipo), instalado && typeof p.payload?.route === "string" ? (p.payload.route as string) : "/library?tab=destacado", p.id);
            })}</ul>
            : <p role="status" className="text-[12px] text-white/55">Nada en el catálogo con «{q.trim()}» (resultado vacío).</p>
    ) : (
        <ul className="flex min-w-0 flex-col" aria-label="Lo último de tu biblioteca">
            {lomos.slice(0, l.base === "xl" ? 4 : grande ? 3 : 2).map((lo) => fila(lo.titulo, lo.tipo, lo.color, lo.href, lo.id))}
        </ul>
    );
    const tipos = l.base === "xl" && cat.datos && (() => {
        const cuenta = new Map<string, number>();
        for (const p of cat.datos.paquetes) if (!p.comingSoon) { const t = TIPO_PAQUETE[p.kind] ?? "Paquete"; cuenta.set(t, (cuenta.get(t) ?? 0) + 1); }
        return (
            <div className="flex flex-col gap-1.5">
                <Rot>En el catálogo</Rot>
                <div className="flex flex-wrap gap-1.5">
                    {[...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => (
                        <Accion key={t} color={colorTipo(t)} alto={Math.min(l.toque, 28)} href="/library?tab=categorias" etiqueta={`${n} paquetes de tipo ${t} en el catálogo`}>{t} <span className="tabular-nums text-white/60">{n}</span></Accion>
                    ))}
                </div>
            </div>
        );
    })();
    const acciones = (
        <div className="flex flex-wrap gap-1.5">
            <Accion color={l.acento} alto={l.toque} href="/library?tab=personal" icono={BookMarked} etiqueta="Abrir tu biblioteca">Mi biblioteca</Accion>
            <Accion color={l.acento2} alto={l.toque} href="/library?tab=destacado" icono={Library} etiqueta="Explorar el catálogo de la Biblioteca">Explorar</Accion>
        </div>
    );
    const cab = 52;
    const estante = (ancho: number, alto: number, baldas: number) => <Estanteria lomos={lomos} ancho={ancho} alto={alto} baldas={baldas} l={l} />;

    return (
        <Lienzo l={l} titulo="Biblioteca Universal" subtitulo={`${items.length} guardado${items.length === 1 ? "" : "s"} · ${lomos.length - items.length} instalado${lomos.length - items.length === 1 ? "" : "s"}`} icono={Library} etiqueta={etiqueta}>
            {l.horizontal ? (
                <div className="flex h-full min-h-0 items-center gap-5">
                    {estante(Math.round(l.ancho * 0.36), l.alto - cab - 30, 1)}
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">{buscador}{lista}</div>
                </div>
            ) : (
                <div className="flex h-full min-h-0 flex-col gap-2.5" style={{ justifyContent: "safe center" }}>
                    {estante(l.ancho - 40, l.base === "xl" ? (lomos.length > 18 ? 150 : 96) : grande ? 72 : 60, l.base === "xl" && lomos.length > 18 ? 2 : 1)}
                    {grande && buscador}
                    {lista}
                    {tipos}
                    {!grande && acciones}
                    {l.base === "xl" && acciones}
                </div>
            )}
        </Lienzo>
    );
}
