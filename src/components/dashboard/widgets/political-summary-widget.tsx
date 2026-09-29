'use client';

// ════════════════════════════════════════════════════════════════
// Gobernanza directa — el pulso de tu soberanía (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Un HEMICICLO donde cada asiento es una propuesta REAL del motor de Ontocracia
// (`proposals` + `proposal_votes`), coloreado por su suerte: aprobadas · con tu voz ·
// te faltan · rechazadas · caducadas. Comparte la lectura con el Ágora (misma clave de
// caché): en la pestaña Política las dos piden UNA vez. Sin sondeo ni tiempo real.
//
//   micro      → anillo de tu participación con las que te faltan.
//   s          → el hemiciclo con cuántas hay en votación.
//   m          → hemiciclo + tres cifras + la acción que toca (votar o proponer).
//   panorámico → hemiciclo a la izquierda, cifras y acciones a la derecha.
//   torre      → hemiciclo arriba, cifras en columna.
//   l          → + leyenda por grupo y el título del asiento al pasar.
//   xl         → + tu voz en anillo y las decisiones recién resueltas.
// Estados honestos: cargando (esqueleto), error con reintento y vacío con «Proponer».
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Landmark, RefreshCw, Vote, Plus, History } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./gen2/_paquete-b/cache-compartida";
import { cargarAgora, type DatosAgora, colorEstado, etiquetaEstado, etiquetaOpcion, resumenCivico, tiempoDe, type PropuestaViva } from "./gen2/_paquete-b/datos-civicos";
import { HEMI, recuentoGrupos, sentar, type GrupoAsiento } from "./gen2/_paquete-b/hemiciclo";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useAhoraB, useLienzoB, useVisibleB, type LienzoB } from "./gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };

export const COLOR_GRUPO: Record<GrupoAsiento, string> = {
    aprobada: "#10b981",
    votada: "#e2e8f0",
    pendiente: "#FFBF00",
    rechazada: "#f43f5e",
    caducada: "#64748b",
};
export const ETIQUETA_GRUPO: Record<GrupoAsiento, string> = {
    aprobada: "Aprobadas",
    votada: "Con tu voz",
    pendiente: "Te faltan",
    rechazada: "Rechazadas",
    caducada: "Caducadas",
};

export function PoliticalSummaryWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const clave = ready ? `agora.v1.${uid ?? "anon"}` : null;
    const cargar = useCallback(() => cargarAgora(uid), [uid]);
    const datos = useDatoCompartido(clave, cargar);
    const micro = marco?.base === "micro";

    return (
        <WidgetShell
            title="Gobernanza directa"
            subtitle="Tu soberanía, de un vistazo"
            icon={Landmark}
            bare={micro}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar la gobernanza"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, datos }: { size: ElementSize; datos: ResultadoDato<DatosAgora> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(60_000, visible);
    const lista = useMemo(() => datos.dato?.propuestas ?? [], [datos.dato]);
    const res = useMemo(() => resumenCivico(lista, ahora ?? undefined), [lista, ahora]);

    let contenido: ReactNode;
    if (!datos.dato || !ahora) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer la gobernanza."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (lista.length === 0) {
        contenido = lienzo.base === "micro"
            ? <Link href="/decisiones?nueva=1" aria-label="Sin decisiones todavía. Proponer" className={cn(estilosB.foco, "grid h-full place-items-center text-[12px] font-semibold text-white/70")}>Proponer</Link>
            : <WidgetEmptyState icon={Landmark} title="Aún no hay decisiones en tu red" message="La soberanía empieza con una propuesta: cualquiera puede abrirla." actionLabel="Proponer" actionHref="/decisiones?nueva=1" accent={lienzo.acento} />;
    } else {
        contenido = <Composicion lista={lista} res={res} ahora={ahora} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

type Resumen = ReturnType<typeof resumenCivico>;

function Composicion({ lista, res, ahora, lienzo }: { lista: PropuestaViva[]; res: Resumen; ahora: number; lienzo: LienzoB }) {
    const [foco, setFoco] = useState<PropuestaViva | null>(null);
    const grupos = useMemo(() => recuentoGrupos(lista), [lista]);
    const b = lienzo.base;

    if (b === "micro") {
        const lado = 72;
        const etiqueta = res.abiertas
            ? `Has votado ${res.votadas} de ${res.abiertas} votaciones abiertas; te faltan ${res.porVotar}`
            : "Sin votaciones abiertas";
        return (
            <Link href="/network/politics" aria-label={etiqueta} title={etiqueta} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <AnilloB fraccion={res.participacion ?? 0} lado={lado} color={res.porVotar ? COLOR_GRUPO.pendiente : COLOR_GRUPO.aprobada}>
                    <text x={lado / 2} y={lado / 2 - 4} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={22} fontWeight={300}>{res.porVotar}</text>
                    <text x={lado / 2} y={lado / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={9} fontWeight={600} letterSpacing=".08em">TE FALTAN</text>
                </AnilloB>
            </Link>
        );
    }

    const hemiciclo = <Hemiciclo lista={lista} res={res} lienzo={lienzo} onFoco={setFoco} />;
    const cifras = <Cifras res={res} lienzo={lienzo} vertical={lienzo.clase === "torre"} />;
    const acciones = <Acciones res={res} lienzo={lienzo} conHistorial={b === "l" || b === "xl"} />;

    if (b === "s") {
        return (
            <Link href="/network/politics" aria-label={`${res.abiertas} propuestas en votación; te faltan ${res.porVotar}. Abrir el Ágora`} className={cn(estilosB.foco, "flex h-full items-center rounded-[14px]")}>
                {hemiciclo}
            </Link>
        );
    }
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-3" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)" }}>
                <div className="min-h-0">{hemiciclo}</div>
                <div className="flex min-w-0 flex-col gap-2">{cifras}{acciones}</div>
            </div>
        );
    }
    if (b === "m") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{hemiciclo}{cifras}<div className="mt-auto">{acciones}</div></div>;
    }
    const pie = <Pie foco={foco} ahora={ahora} />;
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                {hemiciclo}
                <Leyenda grupos={grupos} />
                {pie}
                {cifras}
                <div className="mt-auto">{acciones}</div>
            </div>
        );
    }
    // xl
    const resueltas = lista.filter((p) => p.estado !== "open").slice(0, 4);
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                {hemiciclo}
                <Leyenda grupos={grupos} />
                {pie}
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                <div className="flex items-center gap-3">
                    <AnilloB fraccion={res.participacion ?? 0} lado={lienzo.tv ? 84 : 68} color={res.porVotar ? COLOR_GRUPO.pendiente : COLOR_GRUPO.aprobada}
                        etiqueta={res.participacion === null ? "Sin votaciones abiertas" : `Tu voz en el ${Math.round(res.participacion * 100)} % de las abiertas`}>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={lienzo.tv ? 20 : 16} fontWeight={600}>
                            {res.participacion === null ? "—" : `${Math.round(res.participacion * 100)}%`}
                        </text>
                    </AnilloB>
                    <div className="min-w-0">
                        <RotuloB>Tu voz</RotuloB>
                        <p className="text-[13px] leading-snug text-white/80">
                            {res.abiertas === 0 ? "No hay nada en votación ahora." : res.porVotar === 0 ? "Has votado todo lo abierto." : `Te faltan ${res.porVotar} de ${res.abiertas}.`}
                        </p>
                    </div>
                </div>
                {cifras}
                {resueltas.length > 0 && (
                    <div className="flex min-h-0 flex-col gap-1">
                        <RotuloB>Recién resueltas</RotuloB>
                        <ul className="flex flex-col gap-1" aria-label="Decisiones recién resueltas">
                            {resueltas.map((p) => (
                                <li key={p.id} className="flex items-center gap-2 text-[12px]">
                                    <span className="size-2 shrink-0 rounded-full" style={{ background: colorEstado(p.estado) }} aria-hidden />
                                    <span className="min-w-0 flex-1 text-white/80 line-clamp-1" title={p.titulo}>{p.titulo}</span>
                                    <span className="shrink-0 whitespace-nowrap text-[11px]" style={{ color: tintaB(colorEstado(p.estado), 0.35) }}>
                                        {etiquetaEstado(p.estado)}{p.ganadora ? ` · ${etiquetaOpcion(p, p.ganadora)}` : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div className="mt-auto">{acciones}</div>
            </div>
        </div>
    );
}

function Hemiciclo({ lista, res, lienzo, onFoco }: { lista: PropuestaViva[]; res: Resumen; lienzo: LienzoB; onFoco: (p: PropuestaViva | null) => void }) {
    const sentados = useMemo(() => sentar(lista), [lista]);
    const pulsos = lienzo.nivel !== "ligero";
    const suelo = `hemi${useId().replace(/:/g, "")}`;
    let latidos = 0;
    return (
        <svg viewBox={`0 0 ${HEMI.ancho} ${HEMI.alto}`} className="block h-auto max-h-full w-full" role="img"
            aria-label={`Hemiciclo de ${lista.length} decisiones: ${res.abiertas} en votación, ${res.porVotar} te faltan`}
            onMouseLeave={() => onFoco(null)}>
            <defs>
                <radialGradient id={suelo} cx="50%" cy="100%" r="70%">
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            <path d={`M ${HEMI.cx - HEMI.rMax - 6} ${HEMI.cy} A ${HEMI.rMax + 6} ${HEMI.rMax + 6} 0 0 1 ${HEMI.cx + HEMI.rMax + 6} ${HEMI.cy} Z`} fill={`url(#${suelo})`} />
            <line x1={HEMI.cx - HEMI.rMax - 6} y1={HEMI.cy + 0.5} x2={HEMI.cx + HEMI.rMax + 6} y2={HEMI.cy + 0.5} stroke="#fff" strokeOpacity={0.12} />
            {sentados.map(({ p, asiento, grupo }) => {
                const c = COLOR_GRUPO[grupo];
                const hueco = grupo === "pendiente";
                const late = hueco && pulsos && latidos++ < 6;
                return (
                    <circle key={p.id} cx={asiento.x} cy={asiento.y} r={asiento.r}
                        fill={hueco ? "transparent" : c} fillOpacity={grupo === "caducada" ? 0.55 : 0.92}
                        stroke={c} strokeWidth={hueco ? Math.max(1, asiento.r * 0.35) : 0}
                        className={late ? estilosB.latido : undefined}
                        style={{ animationDelay: late ? `${(latidos % 6) * 0.35}s` : undefined }}
                        onMouseEnter={() => onFoco(p)}>
                        <title>{`${p.titulo} · ${ETIQUETA_GRUPO[grupo]}`}</title>
                    </circle>
                );
            })}
            <text x={HEMI.cx} y={HEMI.cy - 16} textAnchor="middle" fill="#fff" fontSize={lienzo.base === "s" ? 26 : 22} fontWeight={300} style={{ fontVariantNumeric: "tabular-nums" }}>{res.abiertas}</text>
            <text x={HEMI.cx} y={HEMI.cy - 3} textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize={7.5} fontWeight={600} letterSpacing=".12em">EN VOTACIÓN</text>
        </svg>
    );
}

function Leyenda({ grupos }: { grupos: Record<GrupoAsiento, number> }) {
    return (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-white/65" aria-label="Leyenda del hemiciclo">
            {(Object.keys(ETIQUETA_GRUPO) as GrupoAsiento[]).filter((g) => grupos[g] > 0).map((g) => (
                <li key={g} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={g === "pendiente" ? { boxShadow: `inset 0 0 0 1.5px ${COLOR_GRUPO[g]}` } : { background: COLOR_GRUPO[g] }} aria-hidden />
                    {ETIQUETA_GRUPO[g]} <b className="font-semibold text-white/85">{grupos[g]}</b>
                </li>
            ))}
        </ul>
    );
}

function Pie({ foco, ahora }: { foco: PropuestaViva | null; ahora: number }) {
    return (
        <p className="min-h-[1.25rem] text-[12px] text-white/70 line-clamp-1" aria-live="polite">
            {foco ? (
                <><b className="font-semibold text-white">{foco.titulo}</b> · {foco.estado === "open" ? `quedan ${tiempoDe(foco, ahora).texto}` : etiquetaEstado(foco.estado)}</>
            ) : (
                <span className="text-white/45">Pasa por un asiento para ver su propuesta</span>
            )}
        </p>
    );
}

function Cifras({ res, lienzo, vertical }: { res: Resumen; lienzo: LienzoB; vertical?: boolean }) {
    const items = [
        { n: res.porVotar, etiqueta: "te faltan", color: COLOR_GRUPO.pendiente },
        { n: res.aprobadas30, etiqueta: "aprobadas · 30 d", color: COLOR_GRUPO.aprobada },
        { n: res.rechazadas30, etiqueta: "rechazadas · 30 d", color: COLOR_GRUPO.rechazada },
    ];
    return (
        <dl className={cn("grid gap-2", vertical ? "grid-cols-1" : "grid-cols-3")}>
            {items.map((it) => (
                <div key={it.etiqueta} className={cn("min-w-0", vertical && "flex items-baseline gap-2")}>
                    <dt className="sr-only">{it.etiqueta}</dt>
                    <dd className={cn("font-light tabular-nums text-white", lienzo.tv ? "text-[30px]" : "text-[24px]")} style={{ lineHeight: 1 }}>{it.n}</dd>
                    <span className="mt-0.5 block text-[11px] leading-tight" style={{ color: tintaB(it.color, 0.35) }} aria-hidden>{it.etiqueta}</span>
                </div>
            ))}
        </dl>
    );
}

function Acciones({ res, lienzo, conHistorial }: { res: Resumen; lienzo: LienzoB; conHistorial?: boolean }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {res.porVotar > 0
                ? <AccionB href="/network/politics" icono={Vote} color={COLOR_GRUPO.pendiente} tono="llena" tactil={lienzo.tactil}>Votar ahora</AccionB>
                : <AccionB href="/decisiones?nueva=1" icono={Plus} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Proponer</AccionB>}
            {res.porVotar > 0 && <AccionB href="/decisiones?nueva=1" icono={Plus} color={lienzo.acento} tactil={lienzo.tactil}>Proponer</AccionB>}
            {conHistorial && <AccionB href="/mi-actividad" icono={History} color={lienzo.acento2} tactil={lienzo.tactil}>Mi actividad</AccionB>}
        </div>
    );
}
