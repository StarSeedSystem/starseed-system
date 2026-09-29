"use client";
/**
 * Piezas de archivo del paquete D (Ola 0929): memorias, baúles, cerebros, archivos y la galería
 * se ven como objetos de un escritorio — hojas con su esquina doblada, del color de su tipo, con
 * una vista previa de verdad (las primeras líneas del contenido o la imagen) — y no como filas de
 * una tabla. Rejilla o lista, búsqueda y filtro por tipo: las comparten los cinco widgets.
 */
import * as React from "react";
import Link from "next/link";
import { LayoutGrid, List, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import { BotonIcono, Buscador, Miniatura, Segmentos, Tiempo, estilosSocial as estilos, urlSegura } from "./piezas";
import { coincide, recortar } from "./formato";
import type { TamanoSocial } from "./tamano";

export interface TipoArchivo {
    id: string;
    etiqueta: string;
    icono: LucideIcon;
    color: string;
}

export interface ArchivoVista {
    id: string;
    nombre: string;
    tipo: TipoArchivo;
    /** Una línea con lo que contiene («3 memorias · 2 servidores»). */
    detalle: string | null;
    /** Primeras líneas del contenido (texto) para la vista previa de la hoja. */
    extracto?: string | null;
    /** Imagen de vista previa (si es una imagen o un vídeo con póster). */
    imagen?: string | null;
    /** Marcas cortas (sincroniza, privada, 2 servidores…). */
    marcas?: { texto: string; color?: string }[];
    ms: number;
    href: string;
    /** Texto extra en el que buscar (etiquetas, tipos…). */
    buscable?: string;
}

// ── Hoja (tarjeta con esquina doblada) ───────────────────────────────

export function Hoja({ a, t, alto }: { a: ArchivoVista; t: TamanoSocial; alto?: number }) {
    const c = a.tipo.color;
    const img = urlSegura(a.imagen);
    const id = React.useId().replace(/:/g, "");
    return (
        <Link href={a.href} className={cn(estilos.tarjeta, "group relative flex h-full min-h-0 cursor-pointer flex-col overflow-hidden")} style={{ minHeight: alto }}
            aria-label={`${a.tipo.etiqueta}: ${a.nombre}${a.detalle ? `. ${a.detalle}` : ""}`}>
            {/* La hoja: silueta con la esquina doblada, del color de su tipo. */}
            <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`h-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.22} />
                        <stop offset="70%" stopColor={c} stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#0c0e22" stopOpacity={0.2} />
                    </linearGradient>
                </defs>
                <path d="M4 0H84L100 16V96Q100 100 96 100H4Q0 100 0 96V4Q0 0 4 0Z" fill={`url(#h-${id})`} stroke={c} strokeOpacity={0.35} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                <path d="M84 0V12Q84 16 88 16H100" fill={conAlfa(c, 0.3)} stroke={c} strokeOpacity={0.45} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 p-2.5 pr-5">
                <span className="flex items-center gap-1.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-[8px]" style={{ background: conAlfa(c, 0.2), color: mezclar(c, "#ffffff", 0.35) }}>
                        <a.tipo.icono className="size-3.5" aria-hidden />
                    </span>
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: mezclar(c, "#ffffff", 0.35) }}>{a.tipo.etiqueta}</span>
                </span>
                {img ? (
                    <Miniatura url={img} icono={a.tipo.icono} acento={c} className="min-h-0 w-full flex-1" redondeo={10} />
                ) : a.extracto ? (
                    <p className="line-clamp-3 min-h-0 flex-1 whitespace-pre-line break-words font-mono text-[10.5px] leading-snug text-white/55">{recortar(a.extracto, 180)}</p>
                ) : <span className="flex-1" />}
                <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-white" title={a.nombre}>{a.nombre}</span>
                <span className="flex items-center gap-1.5 text-[10.5px] text-white/55">
                    {a.detalle && <span className="min-w-0 truncate" title={a.detalle}>{a.detalle}</span>}
                    <Tiempo ms={a.ms} corto className="ml-auto" />
                </span>
            </div>
            {a.marcas && a.marcas.length > 0 && (
                <span className="absolute right-6 top-2 flex gap-1">
                    {a.marcas.slice(0, 2).map((m) => (
                        <span key={m.texto} className="rounded-full ss-redondo px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: conAlfa(m.color ?? t.acento, 0.2), color: mezclar(m.color ?? t.acento, "#ffffff", 0.4) }}>{m.texto}</span>
                    ))}
                </span>
            )}
        </Link>
    );
}

export function FilaArchivo({ a, t }: { a: ArchivoVista; t: TamanoSocial }) {
    const c = a.tipo.color;
    return (
        <Link href={a.href} className={cn(estilos.fila, "flex min-w-0 cursor-pointer items-center gap-2.5 px-2", t.tactil ? "py-2" : "py-1.5")}
            aria-label={`${a.tipo.etiqueta}: ${a.nombre}${a.detalle ? `. ${a.detalle}` : ""}`}>
            {a.imagen ? (
                <Miniatura url={a.imagen} icono={a.tipo.icono} acento={c} className={t.tactil ? "size-10" : "size-8"} redondeo={9} />
            ) : (
                <span className={cn("grid shrink-0 place-items-center rounded-[10px]", t.tactil ? "size-10" : "size-8")} style={{ background: conAlfa(c, 0.18), color: mezclar(c, "#ffffff", 0.35), boxShadow: `inset 0 0 0 1px ${conAlfa(c, 0.35)}` }}>
                    <a.tipo.icono className="size-4" aria-hidden />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-white">{a.nombre}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                    <span className="shrink-0" style={{ color: mezclar(c, "#ffffff", 0.3) }}>{a.tipo.etiqueta}</span>
                    {a.detalle && <span className="min-w-0 truncate">· {a.detalle}</span>}
                </span>
            </span>
            {a.marcas?.[0] && <span className="hidden shrink-0 rounded-full ss-redondo px-1.5 py-0.5 text-[9.5px] font-semibold sm:inline" style={{ background: conAlfa(a.marcas[0].color ?? t.acento, 0.2), color: mezclar(a.marcas[0].color ?? t.acento, "#ffffff", 0.4) }}>{a.marcas[0].texto}</span>}
            <Tiempo ms={a.ms} corto className="text-[10.5px]" />
        </Link>
    );
}

// ── Explorador (búsqueda + tipo + rejilla/lista) ─────────────────────

export type ModoVista = "rejilla" | "lista";

export function useExplorador(archivos: ArchivoVista[]) {
    const [consulta, setConsulta] = React.useState("");
    const [tipo, setTipo] = React.useState<string>("todos");
    const [modo, setModo] = React.useState<ModoVista>("rejilla");
    const tipos = React.useMemo(() => {
        const m = new Map<string, { t: TipoArchivo; n: number }>();
        for (const a of archivos) {
            const e = m.get(a.tipo.id) ?? { t: a.tipo, n: 0 };
            e.n += 1;
            m.set(a.tipo.id, e);
        }
        return [...m.values()].sort((a, b) => b.n - a.n);
    }, [archivos]);
    const visibles = React.useMemo(
        () => archivos.filter((a) => (tipo === "todos" || a.tipo.id === tipo) && coincide(`${a.nombre} ${a.detalle ?? ""} ${a.buscable ?? ""} ${a.tipo.etiqueta}`, consulta)),
        [archivos, tipo, consulta],
    );
    return { consulta, setConsulta, tipo, setTipo, modo, setModo, tipos, visibles };
}

export function BarraExplorador({ t, ex, etiqueta, placeholder }: { t: TamanoSocial; ex: ReturnType<typeof useExplorador>; etiqueta: string; placeholder: string }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Buscador valor={ex.consulta} onCambio={ex.setConsulta} placeholder={placeholder} etiqueta={etiqueta} acento={t.acento} tactil={t.tactil} className="min-w-[160px] flex-1" />
            {ex.tipos.length > 1 && (
                <Segmentos<string> etiqueta="Tipo" acento={t.acento} tactil={t.tactil} valor={ex.tipo} onCambio={ex.setTipo}
                    opciones={[{ id: "todos", etiqueta: "Todos" }, ...ex.tipos.slice(0, t.base === "xl" ? 5 : 3).map(({ t: tp, n }) => ({ id: tp.id, etiqueta: tp.etiqueta, n, icono: tp.icono }))]} />
            )}
            <div className="flex items-center gap-1" role="group" aria-label="Vista">
                <BotonIcono icono={LayoutGrid} etiqueta="Ver como rejilla" onClick={() => ex.setModo("rejilla")} activo={ex.modo === "rejilla"} acento={t.acento} tactil={t.tactil} />
                <BotonIcono icono={List} etiqueta="Ver como lista" onClick={() => ex.setModo("lista")} activo={ex.modo === "lista"} acento={t.acento} tactil={t.tactil} />
            </div>
        </div>
    );
}

export function Coleccion({ t, archivos, modo, cols, filas, vacio }: { t: TamanoSocial; archivos: ArchivoVista[]; modo: ModoVista; cols: number; filas: number; vacio?: string }) {
    if (archivos.length === 0) return <p role="status" className="grid flex-1 place-items-center text-center text-[12px] text-white/55">{vacio ?? "Nada coincide."}</p>;
    if (modo === "lista") {
        return (
            <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll", archivos.length > cols * filas && estilos.desvanece)} aria-label="Elementos">
                {archivos.map((a) => <li key={a.id} className={estilos.aparece}><FilaArchivo a={a} t={t} /></li>)}
            </ul>
        );
    }
    return (
        <ul className="grid min-h-0 flex-1 auto-rows-fr gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Elementos">
            {archivos.slice(0, cols * filas).map((a, i) => (
                <li key={a.id} className={cn("min-h-0", estilos.aparece)} style={{ animationDelay: `${i * 40}ms` }}><Hoja a={a} t={t} /></li>
            ))}
        </ul>
    );
}

// ── Composición por tipo (dona) ──────────────────────────────────────

export function DonaTipos({ tipos, lado, centro, sub }: { tipos: { t: TipoArchivo; n: number }[]; lado: number; centro: string; sub?: string }) {
    const total = Math.max(1, tipos.reduce((s, x) => s + x.n, 0));
    const r = 40, per = 2 * Math.PI * r;
    let acumulado = 0;
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" className="shrink-0"
            aria-label={`${centro} en total: ${tipos.map((x) => `${x.n} ${x.t.etiqueta}`).join(", ")}`}>
            <circle cx={50} cy={50} r={r} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={9} />
            {tipos.map((x) => {
                const largo = (x.n / total) * per;
                const seg = (
                    <circle key={x.t.id} cx={50} cy={50} r={r} fill="none" stroke={x.t.color} strokeWidth={9}
                        strokeDasharray={`${Math.max(0, largo - 1.5)} ${per}`} strokeDashoffset={-acumulado} transform="rotate(-90 50 50)">
                        <title>{`${x.t.etiqueta}: ${x.n}`}</title>
                    </circle>
                );
                acumulado += largo;
                return seg;
            })}
            <text x={50} y={sub ? 52 : 57} textAnchor="middle" fill="#fff" fontSize={sub ? 22 : 26} fontWeight={300} style={{ fontVariantNumeric: "tabular-nums" }}>{centro}</text>
            {sub && <text x={50} y={66} textAnchor="middle" fill="#fff" fillOpacity={0.55} fontSize={9} fontWeight={600}>{sub}</text>}
        </svg>
    );
}

/** Leyenda de la dona (tipos con su cifra), en columna. */
export function LeyendaTipos({ tipos, max = 5 }: { tipos: { t: TipoArchivo; n: number }[]; max?: number }) {
    return (
        <ul className="flex min-w-0 flex-col gap-1" aria-label="Por tipo">
            {tipos.slice(0, max).map((x) => (
                <li key={x.t.id} className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: x.t.color }} />
                    <span className="min-w-0 flex-1 truncate text-white/75">{x.t.etiqueta}</span>
                    <span className="shrink-0 tabular-nums text-white/60">{x.n}</span>
                </li>
            ))}
        </ul>
    );
}
