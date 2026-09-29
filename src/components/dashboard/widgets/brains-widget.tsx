"use client";

// ════════════════════════════════════════════════════════════════
// BrainsWidget — tus Cerebros como constelaciones REALES (Ola 0929 · D)
// ----------------------------------------------------------------
// Cada cerebro (`brains`, con alcance a tu cuenta, en vivo por el hook
// compartido de os-live) es un núcleo con sus brazos: memorias, baúles,
// conexiones, personalidades y servidores — el tamaño de cada nodo es lo
// que de verdad incluye (`includes` / `servers`). Nada se estima: un
// cerebro vacío se dibuja vacío y dice qué le falta.
//
// micro = el núcleo del último cerebro · s = núcleo + cifras · m = la
// constelación del cerebro activo + los demás · torre = columna de
// cerebros · l/xl = búsqueda + rejilla de constelaciones · panorámico =
// constelaciones en fila. Estados: cargando (orbe), sin sesión, vacío con
// «Crear cerebro»; sin error visible: el hook degrada a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { BookMarked, BrainCircuit, Link2, Map as MapaIcono, Plus, Server, Sparkles, Vault, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyBrains, tsOf, type BrainRow } from "@/lib/widget-data/os-live";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono, Buscador, Tiempo, estilosSocial as estilos } from "./_social-d/piezas";
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from "./_social-d/tamano";
import { coincide, plural } from "./_social-d/formato";

const ACENTO = "#a855f7";

interface Brazo { id: string; etiqueta: string; singular: string; icono: LucideIcon; color: string; n: number }

const ALCANCE: Record<string, string> = { account: "Cuenta", profile: "Perfil", group: "Grupo", page: "Página" };

function lista(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}

/** Los brazos de un cerebro con lo que de verdad incluye (PURO). */
export function brazosDe(b: Pick<BrainRow, "includes" | "servers">): Brazo[] {
    const inc = (b.includes ?? {}) as Record<string, unknown>;
    return [
        { id: "memorias", etiqueta: "Memorias", singular: "memoria", icono: BookMarked, color: "#38bdf8", n: lista(inc.memories).length },
        { id: "baules", etiqueta: "Baúles", singular: "baúl", icono: Vault, color: "#f59e0b", n: lista(inc.vaults).length },
        { id: "conexiones", etiqueta: "Conexiones", singular: "conexión", icono: Link2, color: "#10b981", n: lista(inc.connections).length },
        { id: "personalidades", etiqueta: "Personalidades", singular: "personalidad", icono: Sparkles, color: "#ec4899", n: lista(inc.personalities).length },
        { id: "servidores", etiqueta: "Servidores", singular: "servidor", icono: Server, color: "#818cf8", n: lista(b.servers).length },
    ];
}

function resumen(brazos: Brazo[]): string {
    const con = brazos.filter((x) => x.n > 0);
    if (!con.length) return "Vacío: vincula memorias o un servidor";
    return con.map((x) => plural(x.n, x.singular, x.etiqueta.toLowerCase())).join(" · ");
}

export function BrainsWidget() {
    const { rows, loading, authPending, needsAuth } = useMyBrains();
    const [consulta, setConsulta] = React.useState("");
    const [activo, setActivo] = React.useState<string | null>(null);

    const cerebros = React.useMemo(() => [...rows].sort((a, b) => tsOf(b.updated_at) - tsOf(a.updated_at)), [rows]);
    const visibles = cerebros.filter((b) => coincide(`${b.name ?? ""} ${b.description ?? ""} ${ALCANCE[b.scope ?? ""] ?? ""}`, consulta));
    const foco = cerebros.find((b) => b.id === activo) ?? cerebros[0];
    const servidores = cerebros.reduce((n, b) => n + lista(b.servers).length, 0);

    const estado = estadoSocial({ sinSesion: needsAuth, cargando: authPending || loading, hayDatos: cerebros.length > 0 });

    return (
        <MarcoSocial
            titulo="Cerebros"
            subtitulo={`${plural(cerebros.length, "cerebro", "cerebros")} · ${plural(servidores, "servidor", "servidores")}`}
            icono={BrainCircuit}
            categoria="ia"
            acento={ACENTO}
            estado={estado}
            vivo
            esqueleto="orbe"
            sinSesion={{ mensaje: "Entra para ver y ensamblar tus cerebros." }}
            vacio={{ icono: BrainCircuit, titulo: "Aún no hay cerebros", mensaje: "Un cerebro empaqueta tu contexto —memorias, baúles, conexiones, personalidades— y lo conecta a tus servidores.", accion: { etiqueta: "Crear cerebro", href: "/cerebros" } }}
            acciones={(t) => (
                <>
                    <BotonIcono icono={MapaIcono} etiqueta="Ver el mapa del cerebro" href="/cerebro/mapa" acento={t.acento} tactil={t.tactil} />
                    <BotonIcono icono={Plus} etiqueta="Crear o editar cerebros" href="/cerebros" acento={t.acento} tactil={t.tactil} />
                </>
            )}
        >
            {(t) => {
                if (t.base === "micro") {
                    const lado = Math.max(44, Math.min(t.ancho, t.alto));
                    return (
                        <Link href="/cerebros" aria-label={`${foco.name ?? "Cerebro"}: ${resumen(brazosDe(foco))}`} className="flex h-full cursor-pointer items-center justify-center">
                            <Constelacion b={foco} lado={lado} t={t} sinRotulos />
                        </Link>
                    );
                }
                if (t.base === "s") {
                    return (
                        <Link href="/cerebros" className="flex h-full min-h-0 cursor-pointer items-center gap-3" aria-label={`${foco.name ?? "Cerebro"}: ${resumen(brazosDe(foco))}`}>
                            <Constelacion b={foco} lado={Math.max(64, Math.min(t.alto, t.ancho * 0.5))} t={t} sinRotulos />
                            <span className="min-w-0">
                                <span className="block truncate text-[13px] font-semibold text-white">{foco.name ?? "Cerebro"}</span>
                                <span className="line-clamp-2 text-[11px] text-white/60">{resumen(brazosDe(foco))}</span>
                            </span>
                        </Link>
                    );
                }
                if (t.clase === "m") {
                    return (
                        <div className="grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                            <Constelacion b={foco} lado={Math.max(110, Math.min(t.alto - 6, t.ancho * 0.52))} t={t} />
                            <div className="flex min-h-0 flex-col gap-1.5">
                                <div className="min-w-0">
                                    <p className="truncate text-[14px] font-semibold text-white">{foco.name ?? "Cerebro"}</p>
                                    <p className="truncate text-[11px] text-white/55">{ALCANCE[foco.scope ?? ""] ?? foco.scope ?? "Cuenta"} · <Tiempo ms={tsOf(foco.updated_at)} /></p>
                                </div>
                                {cerebros.length > 1 ? (
                                    <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto ss-scroll" aria-label="Otros cerebros">
                                        {cerebros.filter((b) => b.id !== foco.id).slice(0, filasQueCaben(t.alto - 50, 34, 1, 5)).map((b) => (
                                            <li key={b.id}>
                                                <button type="button" onClick={() => setActivo(b.id)} className={cn(estilos.fila, "flex w-full cursor-pointer items-center gap-2 px-1.5 py-1 text-left")} aria-label={`Ver ${b.name ?? "Cerebro"}`}>
                                                    <BrainCircuit className="size-3.5 shrink-0" style={{ color: t.acento }} aria-hidden />
                                                    <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">{b.name ?? "Cerebro"}</span>
                                                    <Tiempo ms={tsOf(b.updated_at)} corto className="text-[10px]" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[11.5px] text-white/60">{resumen(brazosDe(foco))}</p>}
                            </div>
                        </div>
                    );
                }
                if (t.clase === "torre") {
                    return (
                        <ul className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto ss-scroll" aria-label="Cerebros">
                            {cerebros.map((b) => <li key={b.id}><TarjetaCerebro b={b} t={t} lado={Math.min(t.ancho - 20, 120)} /></li>)}
                        </ul>
                    );
                }
                if (t.clase === "panoramico") {
                    const lado = Math.max(80, Math.min(t.alto - 40, 150));
                    const cols = columnasQueCaben(t.ancho, lado + 90, 1, 6);
                    return (
                        <ul className="grid h-full min-h-0 items-center gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Cerebros">
                            {cerebros.slice(0, cols).map((b) => <li key={b.id} className="min-w-0"><TarjetaCerebro b={b} t={t} lado={lado} horizontal /></li>)}
                        </ul>
                    );
                }
                const lado = t.base === "xl" ? 130 : 104;
                const cols = columnasQueCaben(t.ancho, lado + 40, 2, 5);
                return (
                    <div className="flex h-full min-h-0 flex-col gap-2.5">
                        {cerebros.length > 3 && <Buscador valor={consulta} onCambio={setConsulta} placeholder="Buscar un cerebro…" etiqueta="Buscar cerebros" acento={t.acento} tactil={t.tactil} />}
                        {visibles.length === 0 ? <p role="status" className="grid flex-1 place-items-center text-[12px] text-white/55">Ningún cerebro coincide.</p> : (
                            <ul className="grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto ss-scroll" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Cerebros">
                                {visibles.map((b) => <li key={b.id} className="min-h-0"><TarjetaCerebro b={b} t={t} lado={lado} /></li>)}
                            </ul>
                        )}
                    </div>
                );
            }}
        </MarcoSocial>
    );
}

function TarjetaCerebro({ b, t, lado, horizontal = false }: { b: BrainRow; t: TamanoSocial; lado: number; horizontal?: boolean }) {
    const br = brazosDe(b);
    return (
        <Link href="/cerebros" className={cn(estilos.tarjeta, "flex h-full min-w-0 cursor-pointer items-center gap-2 rounded-[18px] p-2", horizontal ? "flex-row" : "flex-col text-center")}
            style={{ background: `radial-gradient(120% 100% at 50% 0%, ${conAlfa(t.acento, 0.14)}, transparent 70%)` }} aria-label={`${b.name ?? "Cerebro"}: ${resumen(br)}`}>
            <Constelacion b={b} lado={lado} t={t} sinRotulos={lado < 110} />
            <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-white">{b.name ?? "Cerebro"}</span>
                <span className="line-clamp-2 text-[11px] text-white/55">{resumen(br)}</span>
            </span>
        </Link>
    );
}

/** El cerebro como constelación: núcleo + cinco brazos cuyo nodo crece con lo que incluye. */
function Constelacion({ b, lado, t, sinRotulos = false }: { b: Pick<BrainRow, "includes" | "servers" | "name">; lado: number; t: TamanoSocial; sinRotulos?: boolean }) {
    const id = React.useId().replace(/:/g, "");
    const br = brazosDe(b);
    const max = Math.max(1, ...br.map((x) => x.n));
    return (
        <svg width={lado} height={lado} viewBox="-60 -60 120 120" role="img" aria-label={`${b.name ?? "Cerebro"}: ${resumen(br)}`} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`n-${id}`}>
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="35%" stopColor={mezclar(t.acento, "#ffffff", 0.4)} />
                    <stop offset="100%" stopColor={t.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle r={44} fill="none" stroke="#fff" strokeOpacity={0.06} />
            <circle r={26} fill="none" stroke="#fff" strokeOpacity={0.05} strokeDasharray="2 3" />
            {br.map((x, i) => {
                const a = (i / br.length) * Math.PI * 2 - Math.PI / 2;
                const largo = x.n ? 22 + 20 * Math.sqrt(x.n / max) : 20;
                const px = Math.cos(a) * largo, py = Math.sin(a) * largo;
                const rn = x.n ? 3 + 4.5 * Math.sqrt(x.n / max) : 2.2;
                return (
                    <g key={x.id}>
                        <line x1={0} y1={0} x2={px} y2={py} stroke={x.color} strokeOpacity={x.n ? 0.55 : 0.15} strokeWidth={x.n ? 1.4 : 0.8} strokeDasharray={x.n ? undefined : "2 2"} />
                        <circle cx={px} cy={py} r={rn} fill={x.n ? x.color : "transparent"} stroke={x.color} strokeOpacity={x.n ? 1 : 0.4} style={x.n ? { filter: `drop-shadow(0 0 3px ${x.color})` } : undefined}>
                            <title>{`${x.etiqueta}: ${x.n}`}</title>
                        </circle>
                        {!sinRotulos && x.n > 0 && (
                            <text x={Math.cos(a) * (largo + rn + 7)} y={Math.sin(a) * (largo + rn + 7) + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff" fillOpacity={0.85}>{x.n}</text>
                        )}
                    </g>
                );
            })}
            <circle r={13} fill={`url(#n-${id})`} className="ss-respirar" style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center" }} />
            <circle r={5} fill="#fff" fillOpacity={0.9} />
        </svg>
    );
}

export default BrainsWidget;
