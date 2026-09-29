'use client';

// ════════════════════════════════════════════════════════════════
// Delegación líquida — tu voz, a quién la confías y quién te la confía (Ola 0929).
// ----------------------------------------------------------------
// Datos REALES del motor (`vote_delegations` + `profiles`): las delegaciones activas
// que has dado (por tema, con caducidad obligatoria) y las voces que otras personas
// te confían. Revocar es real (`revokeDelegation`): tu voz vuelve a ti al instante, y
// votar directo en una propuesta también la recupera para esa votación.
// Invariante (CLAUDE.md §3): voto delegado líquido, revocable, nunca alienado.
//
//   micro      → el grafo como glifo: tú en el centro y tus delegaciones alrededor.
//   s          → el grafo + «delegas N temas · te confían M voces».
//   m          → grafo + lista con caducidad y «Revocar».
//   panorámico → grafo a la izquierda, lista a la derecha.   torre → grafo arriba.
//   l / xl     → + las voces recibidas por tema, las etiquetas de tema en el grafo y cómo funciona.
// Estados honestos: cargando, error con reintento, sin sesión, y vacío (votas directo en todo).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Network, RefreshCw, RotateCcw, UserPlus, LogIn } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { invalidarCompartido, leerCompartido, useDatoCompartido, type ResultadoDato } from "./_paquete-b/cache-compartida";
import { cargarDelegaciones, vidaDelegacion, type DatosDelegacion, type DelegacionViva } from "./_paquete-b/datos-civicos";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useAhoraB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };

export function LiquidDelegationWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const clave = ready ? `delegacion.v1.${uid ?? "anon"}` : null;
    const cargar = useCallback(() => cargarDelegaciones(uid), [uid]);
    const datos = useDatoCompartido(clave, cargar, { ttlMs: 15 * 60_000 });
    const micro = marco?.base === "micro";
    return (
        <WidgetShell
            title="Delegación líquida"
            subtitle="Tu voz, revocable siempre"
            icon={Network}
            bare={micro}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar delegaciones"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} uid={uid} datos={datos} clave={clave} cargar={cargar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, uid, datos, clave, cargar }: {
    size: ElementSize; uid: string | null; datos: ResultadoDato<DatosDelegacion>; clave: string | null; cargar: () => Promise<DatosDelegacion>;
}) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(60_000, visible);
    const [confirmar, setConfirmar] = useState<string | null>(null);
    const [enCurso, setEnCurso] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

    const revocar = useCallback((d: DelegacionViva) => {
        setEnCurso(d.id);
        setAviso(null);
        void (async () => {
            try {
                const { revokeDelegation } = await import("@/lib/governance/delegations");
                const r = await revokeDelegation(d.id);
                if (!r.ok) throw new Error(r.error || "No se pudo revocar.");
                setAviso({ texto: `Tu voz en «${d.temaEtiqueta}» vuelve a ser directa.`, ok: true });
                if (clave) { invalidarCompartido(clave); void leerCompartido(clave, cargar); }
            } catch (e) {
                setAviso({ texto: e instanceof Error ? e.message : "No se pudo revocar.", ok: false });
            } finally {
                setEnCurso(null);
                setConfirmar(null);
            }
        })();
    }, [clave, cargar]);

    let contenido: ReactNode;
    if (!datos.dato || !ahora) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudieron leer tus delegaciones."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (!uid) {
        contenido = lienzo.base === "micro"
            ? <Link href="/login" aria-label="Entra para gestionar tu voz" className={cn(estilosB.foco, "grid h-full place-items-center text-white/70")}><LogIn className="size-6" aria-hidden /></Link>
            : <WidgetEmptyState icon={LogIn} title="Tu voz es tuya" message="Entra en tu cuenta para ver y gestionar a quién la confías." actionLabel="Entrar" actionHref="/login" accent={lienzo.acento} />;
    } else {
        contenido = (
            <Composicion d={datos.dato} ahora={ahora} lienzo={lienzo} confirmar={confirmar} setConfirmar={setConfirmar}
                enCurso={enCurso} revocar={revocar} aviso={aviso} />
        );
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

interface PropsComposicion {
    d: DatosDelegacion;
    ahora: number;
    lienzo: LienzoB;
    confirmar: string | null;
    setConfirmar: (id: string | null) => void;
    enCurso: string | null;
    revocar: (d: DelegacionViva) => void;
    aviso: { texto: string; ok: boolean } | null;
}

function frase(d: DatosDelegacion): string {
    const dadas = d.dadas.length;
    const a = dadas === 0 ? "Votas directo en todo" : `Delegas tu voz en ${dadas} ${dadas === 1 ? "tema" : "temas"}`;
    const b = d.totalRecibidas ? ` · te confían ${d.totalRecibidas} ${d.totalRecibidas === 1 ? "voz" : "voces"}` : "";
    return a + b;
}

function Composicion(props: PropsComposicion) {
    const { d, lienzo } = props;
    const b = lienzo.base;
    const vacio = d.dadas.length === 0 && d.totalRecibidas === 0;

    if (b === "micro") {
        return (
            <Link href="/decisiones" aria-label={`${frase(d)}. Abrir Decisiones`} title={frase(d)} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <Grafo d={d} lienzo={lienzo} etiquetas={false} className="h-full w-full" />
            </Link>
        );
    }
    const grafo = <Grafo d={d} lienzo={lienzo} etiquetas={b === "xl" || (b === "l" && !lienzo.horizontal)} className="h-full max-h-full w-full" />;
    const lineaFrase = <p className="text-[12px] leading-snug text-white/75"><b className="font-semibold text-white">{frase(d)}</b></p>;

    if (b === "s") {
        return (
            <div className="flex h-full min-h-0 flex-col items-center gap-1.5 text-center">
                <div className="min-h-0 w-full flex-1">{grafo}</div>
                {lineaFrase}
            </div>
        );
    }

    const lista = <ListaDelegaciones {...props} max={b === "m" ? 2 : b === "l" ? 4 : 6} />;
    const acciones = (
        <div className="flex flex-wrap items-center gap-1.5">
            <AccionB href="/decisiones" icono={UserPlus} color={lienzo.acento} tono={d.dadas.length ? "fantasma" : "llena"} tactil={lienzo.tactil}>Delegar un tema</AccionB>
        </div>
    );
    const vacioTexto = vacio && (
        <p className="text-[12px] leading-relaxed text-white/65">
            Tu voz no pasa por nadie. Si confías en alguien que conoce un tema, puedes delegarle ese tema con fecha de caducidad y retirarla cuando quieras.
        </p>
    );

    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-3" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)" }}>
                <div className="h-full min-h-0">{grafo}</div>
                <div className="flex min-h-0 flex-col gap-2">{lineaFrase}{vacioTexto || lista}{acciones}</div>
            </div>
        );
    }
    if (b === "m") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className={cn("min-h-0 w-full", lienzo.clase === "torre" ? "h-[42%]" : "h-[38%]")}>{grafo}</div>
                {lineaFrase}
                {vacioTexto || lista}
                <div className="mt-auto">{acciones}</div>
            </div>
        );
    }
    const recibidas = d.recibidas.length > 0 && (
        <div className="flex flex-col gap-1">
            <RotuloB>Te confían</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Voces que te confían">
                {d.recibidas.slice(0, b === "xl" ? 5 : 3).map((r) => (
                    <li key={r.tema} className="flex items-center gap-2 text-[12px]">
                        <span className="min-w-0 flex-1 text-white/75 line-clamp-1" title={r.temaEtiqueta}>{r.temaEtiqueta}</span>
                        <b className="shrink-0 tabular-nums font-semibold" style={{ color: tintaB(lienzo.acento2, 0.2) }}>{r.n} {r.n === 1 ? "voz" : "voces"}</b>
                    </li>
                ))}
            </ul>
        </div>
    );
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="h-[40%] min-h-0 w-full">{grafo}</div>
                {lineaFrase}
                {vacioTexto || lista}
                {recibidas}
                <div className="mt-auto">{acciones}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1">{grafo}</div>
                {lineaFrase}
                <p className="text-[11px] leading-relaxed text-white/50">
                    Votar directo en una propuesta recupera tu voz para esa votación. Cada delegación caduca sola; revocarla es inmediato.
                </p>
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                {vacioTexto || lista}
                {recibidas}
                <div className="mt-auto">{acciones}</div>
            </div>
        </div>
    );
}

function ListaDelegaciones({ d, ahora, lienzo, confirmar, setConfirmar, enCurso, revocar, aviso, max }: PropsComposicion & { max: number }) {
    const visibles = d.dadas.slice(0, max);
    return (
        <div className="flex min-h-0 flex-col gap-1">
            <ul className="flex min-h-0 flex-col gap-1" aria-label="Delegaciones que has dado">
                {visibles.map((x) => {
                    const vida = vidaDelegacion(x, ahora);
                    const pidiendo = confirmar === x.id;
                    return (
                        <li key={x.id} className={cn(estilosB.fila, "flex items-center gap-2.5 rounded-[14px] px-1.5 py-1")}>
                            <AnilloB fraccion={vida.fraccion} lado={lienzo.tv ? 36 : 28} color={vida.fraccion < 0.15 ? "#FFBF00" : tintaB(lienzo.acento2, 0.1)}
                                etiqueta={`Caduca en ${vida.texto}`}>
                                <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={lienzo.tv ? 12 : 10} fontWeight={600}>{iniciales(x.delegado.nombre)}</text>
                            </AnilloB>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold leading-snug text-white/90 line-clamp-1" title={x.delegado.nombre}>{x.delegado.nombre}</p>
                                <p className="text-[11px] leading-snug text-white/55 line-clamp-1" title={`${x.temaEtiqueta} · caduca en ${vida.texto}`}>{x.temaEtiqueta} · caduca en {vida.texto}</p>
                            </div>
                            {pidiendo ? (
                                <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`¿Revocar la delegación en ${x.delegado.nombre}?`}>
                                    <AccionB onClick={() => revocar(x)} disabled={enCurso === x.id} color="#f43f5e" tono="llena" tactil={lienzo.tactil}>{enCurso === x.id ? "Revocando…" : "Revocar"}</AccionB>
                                    <AccionB onClick={() => setConfirmar(null)} color="#94a3b8" tactil={lienzo.tactil}>Cancelar</AccionB>
                                </div>
                            ) : (
                                <AccionB onClick={() => setConfirmar(x.id)} icono={RotateCcw} color={lienzo.acento} tactil={lienzo.tactil}
                                    aria-label={`Recuperar tu voz en ${x.temaEtiqueta} (delegada en ${x.delegado.nombre})`}>Recuperar</AccionB>
                            )}
                        </li>
                    );
                })}
            </ul>
            {d.dadas.length > max && <p className="text-[11px] text-white/50">+{d.dadas.length - max} delegaciones más en Decisiones</p>}
            {aviso && <p role="status" className="text-[11px]" style={{ color: aviso.ok ? "#6ee7b7" : "#fda4af" }}>{aviso.texto}</p>}
        </div>
    );
}

export function iniciales(nombre: string): string {
    const limpio = nombre.replace(/^@/, "").trim();
    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "·";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** El grafo de tu voz: tú en el centro, a quién delegas por radios, las voces que te confían en órbita. */
function Grafo({ d, lienzo, etiquetas, className }: { d: DatosDelegacion; lienzo: LienzoB; etiquetas: boolean; className?: string }) {
    const id = useId().replace(/:/g, "");
    const nodos = useMemo(() => {
        const n = Math.min(8, d.dadas.length);
        return d.dadas.slice(0, n).map((x, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
            return { x, cx: 100 + Math.cos(a) * 60, cy: 100 + Math.sin(a) * 60, a };
        });
    }, [d.dadas]);
    const orbitantes = Math.min(18, d.totalRecibidas);
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg viewBox="0 0 200 200" className={cn("block", className)} role="img" aria-label={frase(d)} preserveAspectRatio="xMidYMid meet">
            <defs>
                <radialGradient id={`yo${id}`} cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento, 0.55)} />
                    <stop offset="100%" stopColor={lienzo.acento} />
                </radialGradient>
                <radialGradient id={`aura${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`nodo${id}`} cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento2, 0.45)} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.75} />
                </radialGradient>
            </defs>
            {/* órbita de las voces confiadas */}
            <circle cx={100} cy={100} r={88} fill="none" stroke="#fff" strokeOpacity={0.08} strokeDasharray="2 5" />
            {orbitantes > 0 && (
                <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: "80s" }}>
                    {Array.from({ length: orbitantes }, (_, i) => {
                        const a = (i * 2 * Math.PI) / orbitantes;
                        return <circle key={i} cx={100 + Math.cos(a) * 88} cy={100 + Math.sin(a) * 88} r={2.6} fill={tintaB(lienzo.acento2, 0.2)} opacity={0.85} />;
                    })}
                </g>
            )}
            {/* radios: tu voz fluye hacia quien la custodia */}
            {nodos.map(({ x, cx, cy }) => (
                <line key={`l${x.id}`} x1={100} y1={100} x2={cx} y2={cy} stroke={tintaB(lienzo.acento2, 0.2)} strokeOpacity={0.55} strokeWidth={1.4}
                    className={vivo ? estilosB.flujo : undefined} strokeDasharray={vivo ? undefined : "2 6"} />
            ))}
            <circle cx={100} cy={100} r={40} fill={`url(#aura${id})`} />
            {nodos.map(({ x, cx, cy, a }) => (
                <g key={x.id}>
                    <circle cx={cx} cy={cy} r={13} fill={`url(#nodo${id})`} stroke="#fff" strokeOpacity={0.3} strokeWidth={0.8} />
                    <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fontSize={9} fontWeight={700}>{iniciales(x.delegado.nombre)}</text>
                    {etiquetas && (
                        <text x={100 + Math.cos(a) * 82} y={100 + Math.sin(a) * 82 + (Math.sin(a) > 0.3 ? 6 : Math.sin(a) < -0.3 ? -3 : 3)} textAnchor={Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle"}
                            fill="rgba(255,255,255,.7)" fontSize={7.5}>
                            {x.temaEtiqueta.length > 18 ? `${x.temaEtiqueta.slice(0, 17)}…` : x.temaEtiqueta}
                        </text>
                    )}
                </g>
            ))}
            <circle cx={100} cy={100} r={19} fill={`url(#yo${id})`} stroke="#fff" strokeOpacity={0.45} strokeWidth={1} />
            <text x={100} y={101} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight={700}>Tú</text>
            {d.totalRecibidas > 0 && (
                <text x={100} y={128} textAnchor="middle" fill={tintaB(lienzo.acento2, 0.3)} fontSize={9} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                    +{d.totalRecibidas} {d.totalRecibidas === 1 ? "voz" : "voces"}
                </text>
            )}
            {d.dadas.length === 0 && d.totalRecibidas === 0 && (
                <circle cx={100} cy={100} r={26} fill="none" stroke={lienzo.acento} strokeOpacity={0.5} className={vivo ? estilosB.latido : undefined} />
            )}
        </svg>
    );
}
