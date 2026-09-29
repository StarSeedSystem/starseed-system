'use client';

// ════════════════════════════════════════════════════════════════
// Códice akáshico — tu registro personal: archivos, memorias, cerebros y baúles (Ola 0929).
// ----------------------------------------------------------------
// Antes: nodos inventados con «redundancia IPFS» de adorno. Ahora, TU registro REAL
// (CLAUDE.md §6: la cuenta guarda el Registro Acásico Personal): cuántos archivos
// (`os_files`), memorias (`memories`), cerebros (`brains`) y baúles (`vaults`) tienes —con
// recuentos sin traer filas— y lo último que guardaste. Una lectura compartida cada 15 min,
// sin sondeo ni canales en tiempo real. Cada órbita lleva a su casa en el OS.
//
//   micro      → el cristal del códice con cuántas entidades guardas.
//   s          → el cristal y su cifra.
//   m          → + las cuatro cifras, cada una a su sitio.
//   panorámico → cristal · cifras · lo último, en fila.   torre → en columna.
//   l          → + los tres últimos archivos.
//   xl         → cristal grande con sus órbitas, cifras, últimos archivos y memorias.
// Estados honestos: cargando, error con reintento, sin sesión y vacío (registro por escribir).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Library, RefreshCw, FileText, Image as ImageIcon, Music, Video, Brain, Archive, Sparkles, LogIn, type LucideIcon } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./_paquete-b/cache-compartida";
import { AccionB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#e0a43a", acento2: "#23d5ab" };

export type TipoEntidad = "archivos" | "memorias" | "cerebros" | "baules";
export const ENTIDADES: { id: TipoEntidad; etiqueta: string; ruta: string; color: string; icono: LucideIcon; tabla: string }[] = [
    { id: "archivos", etiqueta: "Archivos", ruta: "/galeria", color: "#38bdf8", icono: FileText, tabla: "os_files" },
    { id: "memorias", etiqueta: "Memorias", ruta: "/memorias-3d", color: "#a78bfa", icono: Sparkles, tabla: "memories" },
    { id: "cerebros", etiqueta: "Cerebros", ruta: "/cerebros", color: "#22d3ee", icono: Brain, tabla: "brains" },
    { id: "baules", etiqueta: "Baúles", ruta: "/baules", color: "#e0a43a", icono: Archive, tabla: "vaults" },
];

interface ArchivoReciente { nombre: string; mime: string | null; ts: number }
interface MemoriaReciente { nombre: string; ts: number }
export interface DatosCodice { uid: string | null; cuentas: Record<TipoEntidad, number | null>; archivos: ArchivoReciente[]; memorias: MemoriaReciente[] }

async function cargarCodice(uid: string | null): Promise<DatosCodice> {
    const vacio: DatosCodice = { uid, cuentas: { archivos: null, memorias: null, cerebros: null, baules: null }, archivos: [], memorias: [] };
    if (!uid) return vacio;
    const sb = createClient();
    const contar = async (tabla: string): Promise<number | null> => {
        try {
            const { count, error } = await sb.from(tabla).select("id", { count: "exact", head: true }).eq("owner", uid);
            return error ? null : count ?? 0;
        } catch { return null; }
    };
    const [a, m, c, b, fa, fm] = await Promise.all([
        contar("os_files"), contar("memories"), contar("brains"), contar("vaults"),
        sb.from("os_files").select("name, mime, created_at").eq("owner", uid).order("created_at", { ascending: false }).limit(6),
        sb.from("memories").select("name, updated_at").eq("owner", uid).order("updated_at", { ascending: false }).limit(4),
    ]);
    if ([a, m, c, b].every((x) => x === null)) throw new Error("No se pudo leer tu registro ahora.");
    return {
        uid,
        cuentas: { archivos: a, memorias: m, cerebros: c, baules: b },
        archivos: ((fa.data as { name: string | null; mime: string | null; created_at: string | null }[] | null) ?? []).map((r) => ({ nombre: r.name?.trim() || "Archivo", mime: r.mime, ts: r.created_at ? Date.parse(r.created_at) || 0 : 0 })),
        memorias: ((fm.data as { name: string | null; updated_at: string | null }[] | null) ?? []).map((r) => ({ nombre: r.name?.trim() || "Memoria", ts: r.updated_at ? Date.parse(r.updated_at) || 0 : 0 })),
    };
}

/** Icono por tipo MIME. PURO. */
export function iconoMime(mime: string | null): LucideIcon {
    if (!mime) return FileText;
    if (mime.startsWith("image/")) return ImageIcon;
    if (mime.startsWith("audio/")) return Music;
    if (mime.startsWith("video/")) return Video;
    return FileText;
}

export function totalCodice(d: Pick<DatosCodice, "cuentas">): number {
    return Object.values(d.cuentas).reduce<number>((s, n) => s + (n ?? 0), 0);
}

export function AkashicCodexWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const cargar = useCallback(() => cargarCodice(uid), [uid]);
    const datos = useDatoCompartido<DatosCodice>(ready ? `codice.v1.${uid ?? "anon"}` : null, cargar, { ttlMs: 15 * 60_000 });
    return (
        <WidgetShell
            title="Códice akáshico"
            subtitle="Tu registro personal"
            icon={Library}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar el códice"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, datos }: { size: ElementSize; datos: ResultadoDato<DatosCodice> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    const d = datos.dato;
    if (!d) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer tu registro."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (!d.uid) {
        contenido = lienzo.base === "micro"
            ? <Link href="/login" aria-label="Entra para ver tu registro" className={cn(estilosB.foco, "grid h-full place-items-center text-white/70")}><LogIn className="size-6" aria-hidden /></Link>
            : <WidgetEmptyState icon={LogIn} title="Tu registro es tuyo" message="Entra en tu cuenta para ver tus archivos, memorias, cerebros y baúles." actionLabel="Entrar" actionHref="/login" accent={lienzo.acento} />;
    } else if (totalCodice(d) === 0) {
        contenido = lienzo.base === "micro"
            ? <Link href="/galeria" className={cn(estilosB.foco, "grid h-full place-items-center")} aria-label="Registro por escribir"><Cristal d={d} lado={64} lienzo={lienzo} /></Link>
            : <WidgetEmptyState icon={Library} title="Tu registro está por escribir" message="Sube un archivo o guarda una memoria: aquí verás crecer tu códice." actionLabel="Guardar una memoria" actionHref="/baules" accent={lienzo.acento} />;
    } else {
        contenido = <Composicion d={d} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ d, lienzo }: { d: DatosCodice; lienzo: LienzoB }) {
    const b = lienzo.base;
    const total = totalCodice(d);
    const frase = `Guardas ${total} entidades: ${ENTIDADES.map((e) => `${d.cuentas[e.id] ?? "sin dato"} ${e.etiqueta.toLowerCase()}`).join(", ")}`;
    const cristal = (lado: number) => <Cristal d={d} lado={lado} lienzo={lienzo} etiqueta={frase} />;
    if (b === "micro") return <div className="grid h-full place-items-center">{cristal(76)}</div>;
    if (b === "s") return <div className="flex h-full flex-col items-center justify-center gap-1 text-center">{cristal(88)}<p className="text-[12px] text-white/70"><b className="font-semibold text-white tabular-nums">{total}</b> entidades</p></div>;

    const cifras = (columnas: 1 | 2 | 4) => (
        <ul className={cn("grid gap-1", columnas === 4 ? "grid-cols-4" : columnas === 2 ? "grid-cols-2" : "grid-cols-1")} aria-label="Tu registro por tipo">
            {ENTIDADES.map((e) => {
                const Icono = e.icono;
                const n = d.cuentas[e.id];
                return (
                    <li key={e.id}>
                        <Link href={e.ruta} className={cn(estilosB.foco, estilosB.fila, "flex items-center gap-2 rounded-[12px] px-1.5", lienzo.tactil ? "min-h-11" : "min-h-9")} aria-label={`${e.etiqueta}: ${n ?? "sin dato"}. Abrir`}>
                            <Icono className="size-4 shrink-0" style={{ color: tintaB(e.color, 0.3) }} aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-[18px] font-light tabular-nums leading-none text-white">{n ?? "—"}</span>
                                <span className="block text-[10px] text-white/55">{e.etiqueta}</span>
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
    const archivos = (max: number) => d.archivos.length === 0 ? null : (
        <div className="flex min-h-0 flex-col gap-1">
            <RotuloB>Últimos archivos</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Últimos archivos">
                {d.archivos.slice(0, max).map((f, i) => {
                    const Icono = iconoMime(f.mime);
                    return (
                        <li key={`${f.nombre}-${i}`} className="flex items-center gap-2 text-[12px]">
                            <Icono className="size-3.5 shrink-0 text-sky-300/80" aria-hidden />
                            <span className="min-w-0 flex-1 text-white/85 line-clamp-1" title={f.nombre}>{f.nombre}</span>
                            {f.ts > 0 && <span className="shrink-0 text-[10px] text-white/45">hace {timeAgo(f.ts)}</span>}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
    const memorias = (max: number) => d.memorias.length === 0 ? null : (
        <div className="flex flex-col gap-1">
            <RotuloB>Últimas memorias</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Últimas memorias">
                {d.memorias.slice(0, max).map((m, i) => (
                    <li key={`${m.nombre}-${i}`} className="flex items-center gap-2 text-[12px]">
                        <Sparkles className="size-3.5 shrink-0 text-violet-300/80" aria-hidden />
                        <span className="min-w-0 flex-1 text-white/85 line-clamp-1" title={m.nombre}>{m.nombre}</span>
                        {m.ts > 0 && <span className="shrink-0 text-[10px] text-white/45">hace {timeAgo(m.ts)}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
    if (lienzo.clase === "panoramico") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1fr)" }}>{cristal(96)}{cifras(2)}{archivos(3)}</div>;
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 items-center gap-3">{cristal(104)}<div className="min-w-0 flex-1">{cifras(2)}</div></div>;
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="flex items-center gap-3">{cristal(lienzo.clase === "torre" ? 110 : 120)}<div className="min-w-0 flex-1">{cifras(lienzo.clase === "torre" ? 1 : 2)}</div></div>
                {archivos(3)}
                <div className="mt-auto"><AccionB href="/galeria" icono={FileText} color={lienzo.acento} tactil={lienzo.tactil}>Abrir la galería</AccionB></div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)" }}>
            <div className="flex min-h-0 flex-col items-center gap-3">
                {cristal(lienzo.tv ? 200 : 170)}
                {cifras(4)}
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                {archivos(5)}
                {memorias(3)}
                <div className="mt-auto flex flex-wrap gap-1.5">
                    <AccionB href="/memorias-3d" icono={Sparkles} color={lienzo.acento} tactil={lienzo.tactil}>Mapa 3D de memorias</AccionB>
                    <AccionB href="/baules" icono={Archive} color={lienzo.acento2} tactil={lienzo.tactil}>Baúles</AccionB>
                </div>
            </div>
        </div>
    );
}

/** El cristal del códice: cuatro órbitas (una por tipo) con un punto por entidad (hasta 36). */
function Cristal({ d, lado, lienzo, etiqueta }: { d: DatosCodice; lado: number; lienzo: LienzoB; etiqueta?: string }) {
    const id = useId().replace(/:/g, "");
    const total = totalCodice(d);
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role={etiqueta ? "img" : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`n${id}`} cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#fff7e0" />
                    <stop offset="45%" stopColor={tintaB(lienzo.acento, 0.35)} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0.8} />
                </radialGradient>
            </defs>
            {ENTIDADES.map((e, k) => {
                const r = 46 - k * 8.5;
                const n = Math.min(36, d.cuentas[e.id] ?? 0);
                return (
                    <g key={e.id}>
                        <circle cx={50} cy={50} r={r} fill="none" stroke={e.color} strokeOpacity={0.18} strokeWidth={0.6} />
                        <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: `${70 + k * 25}s`, animationDirection: k % 2 ? "reverse" : "normal" }}>
                            {Array.from({ length: n }, (_, i) => {
                                const a = (i / Math.max(1, n)) * Math.PI * 2 + k;
                                return <circle key={i} cx={50 + Math.cos(a) * r} cy={50 + Math.sin(a) * r} r={1.5} fill={e.color} opacity={0.9} />;
                            })}
                        </g>
                    </g>
                );
            })}
            <polygon points="50,33 61,44 57,61 43,61 39,44" fill={`url(#n${id})`} stroke="#fff" strokeOpacity={0.45} strokeWidth={0.6} />
            <text x={50} y={50} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fontSize={10} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>{total}</text>
        </svg>
    );
}
