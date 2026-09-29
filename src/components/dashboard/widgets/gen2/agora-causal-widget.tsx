'use client';

// ════════════════════════════════════════════════════════════════
// Ágora — propuestas VIVAS del motor de Ontocracia (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Datos REALES: `proposals` + `proposal_votes` (lo mismo que /network/politics y
// /decisiones), leídos una vez y compartidos con «Gobernanza directa» por la caché del
// paquete (TTL 10 min, sin sondeo ni tiempo real). Votar es real (`castVote`): el voto
// es público y se puede cambiar mientras la votación siga abierta.
//
// Un diseño por tamaño:
//   micro      → anillo del tiempo que le queda a la próxima votación + cuántas te faltan.
//   s          → la votación que antes cierra, con Sí / No a un toque.
//   m          → lista con anillos de tiempo, reparto de voces y tu voto.
//   panorámico → las votaciones en columnas, un anillo por propuesta.
//   torre      → la próxima en grande y el resto debajo.
//   l          → pestañas Abiertas / Por votar / Resueltas + lista + acciones.
//   xl         → lista y detalle a la vez (reparto, quórum, umbral, votar).
// Estados honestos: cargando, error con reintento, vacío con «Proponer».
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Vote, RefreshCw, Plus, ExternalLink, Landmark, Check } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./_paquete-b/cache-compartida";
import { cargarAgora, etiquetaOpcion, resumenCivico, tiempoDe, type DatosAgora, type PropuestaViva } from "./_paquete-b/datos-civicos";
import {
    AccionB, AnilloB, PestanasB, RaizB, RotuloB, colorOpcion, estilosB, haloB, tintaB,
    useAhoraB, useLienzoB, useVisibleB, type LienzoB,
} from "./_paquete-b/piezas-b";
import { AMBAR_URGENTE, DetallePropuestaB, FilaPropuestaB, colorAnillo, useVotoB, type VotoB } from "./_paquete-b/propuesta-b";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };
type Filtro = "abiertas" | "pendientes" | "resueltas";

export function AgoraCausalWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const clave = ready ? `agora.v1.${uid ?? "anon"}` : null;
    const cargar = useCallback(() => cargarAgora(uid), [uid]);
    const datos = useDatoCompartido(clave, cargar);
    const voto = useVotoB(clave, uid, cargar);
    const micro = marco?.base === "micro";

    return (
        <WidgetShell
            title="Ágora"
            subtitle="Propuestas en votación"
            icon={Vote}
            bare={micro}
            actions={
                <button
                    type="button"
                    onClick={datos.recargar}
                    aria-label="Actualizar el Ágora"
                    title={datos.actualizado ? `Leído ${new Date(datos.actualizado).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "Actualizar"}
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white"
                >
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <CuerpoAgora size={size} uid={uid} datos={datos} voto={voto} />}
        </WidgetShell>
    );
}

function CuerpoAgora({ size, uid, datos, voto }: {
    size: ElementSize;
    uid: string | null;
    datos: ResultadoDato<DatosAgora>;
    voto: VotoB;
}) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(30_000, visible);
    const [filtro, setFiltro] = useState<Filtro>("abiertas");
    const [abierta, setAbierta] = useState<string | null>(null);

    const lista = useMemo(() => (datos.dato?.propuestas ?? []).map(voto.aplicar), [datos.dato, voto.aplicar]);
    const t = ahora ?? 0;
    const res = useMemo(() => resumenCivico(lista, t || undefined), [lista, t]);

    const contenido = (() => {
        if (!datos.dato || !ahora) {
            if (datos.estado === "error") return <WidgetErrorState message={datos.error ?? "No se pudo leer el Ágora."} onRetry={datos.recargar} />;
            return <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "list"} rows={3} />;
        }
        if (lista.length === 0) {
            if (lienzo.base === "micro") return <MicroVacio lienzo={lienzo} />;
            return (
                <WidgetEmptyState icon={Landmark} title="El Ágora está en calma"
                    message="Aún no hay propuestas en tu red. Abre la primera: se decide entre todas las personas."
                    actionLabel="Proponer" actionHref="/decisiones?nueva=1" accent={lienzo.acento} />
            );
        }
        const detalle = abierta ? lista.find((p) => p.id === abierta) ?? null : null;
        if (detalle && lienzo.base !== "xl") {
            return <DetallePropuestaB p={detalle} ahora={ahora} lienzo={lienzo} uid={uid} voto={voto} onVolver={() => setAbierta(null)} grande={lienzo.base === "l"} />;
        }
        switch (lienzo.base) {
            case "micro": return <Micro res={res} ahora={ahora} lienzo={lienzo} />;
            case "s": return <Pequeno res={res} lista={lista} ahora={ahora} lienzo={lienzo} uid={uid} voto={voto} abrir={setAbierta} />;
            case "m":
                if (lienzo.clase === "panoramico") return <Panoramico lista={lista} ahora={ahora} lienzo={lienzo} size={size} abrir={setAbierta} />;
                if (lienzo.clase === "torre") return <Torre res={res} lista={lista} ahora={ahora} lienzo={lienzo} size={size} abrir={setAbierta} />;
                return <Mediano res={res} lista={lista} ahora={ahora} lienzo={lienzo} size={size} abrir={setAbierta} />;
            case "l": return <Grande res={res} lista={lista} ahora={ahora} lienzo={lienzo} size={size} filtro={filtro} setFiltro={setFiltro} abrir={setAbierta} />;
            default: return (
                <Enorme res={res} lista={lista} ahora={ahora} lienzo={lienzo} size={size} filtro={filtro} setFiltro={setFiltro}
                    seleccion={detalle ?? res.proxima ?? lista[0]} abrir={setAbierta} uid={uid} voto={voto} />
            );
        }
    })();

    return (
        <RaizB ref={ref} lienzo={lienzo} visible={visible}>
            {datos.dato && datos.error && lienzo.base !== "micro" && (
                <p role="status" className="mb-1 text-[11px] text-amber-200/80">{datos.error}</p>
            )}
            {contenido}
        </RaizB>
    );
}

type Resumen = ReturnType<typeof resumenCivico>;

function filtrar(lista: PropuestaViva[], f: Filtro): PropuestaViva[] {
    if (f === "abiertas") return lista.filter((p) => p.estado === "open");
    if (f === "pendientes") return lista.filter((p) => p.estado === "open" && !p.miVoto);
    return lista.filter((p) => p.estado !== "open");
}

/** Cuántas filas caben (≈ 50 px cada una) dejando sitio a cabecera y acciones. */
function filasQueCaben(alto: number, reservado: number, porFila = 50, max = 7): number {
    return Math.max(1, Math.min(max, Math.floor((alto - reservado) / porFila)));
}

function MicroVacio({ lienzo }: { lienzo: LienzoB }) {
    return (
        <Link href="/decisiones?nueva=1" aria-label="El Ágora está en calma: sin propuestas abiertas. Proponer" className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
            <AnilloB fraccion={0} lado={64} color={lienzo.acento}>
                <text x={32} y={34} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.75)" fontSize={11} fontWeight={600}>calma</text>
            </AnilloB>
        </Link>
    );
}

function Micro({ res, ahora, lienzo }: { res: Resumen; ahora: number; lienzo: LienzoB }) {
    const p = res.proxima;
    const tt = p ? tiempoDe(p, ahora) : null;
    const lado = 72;
    const gid = `agm${useId().replace(/:/g, "")}`;
    const cifra = res.porVotar || res.abiertas;
    const etiqueta = p
        ? `${res.porVotar} por votar de ${res.abiertas} abiertas. La próxima cierra en ${tt?.texto}: ${p.titulo}`
        : "Sin votaciones abiertas";
    return (
        <Link href="/network/politics" aria-label={etiqueta} title={etiqueta} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
            <AnilloB fraccion={tt?.fraccion ?? 0} lado={lado} color={p ? colorAnillo(p, ahora, lienzo.acento) : lienzo.acento} urgente={tt?.urgente} gradienteId={gid}>
                <text x={lado / 2} y={lado / 2 - 4} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={22} fontWeight={300} style={{ fontVariantNumeric: "tabular-nums" }}>{cifra}</text>
                <text x={lado / 2} y={lado / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={9} fontWeight={600} letterSpacing=".08em">
                    {res.porVotar ? "POR VOTAR" : p ? "ABIERTAS" : "EN CALMA"}
                </text>
            </AnilloB>
        </Link>
    );
}

function Pequeno({ res, lista, ahora, lienzo, uid, voto, abrir }: {
    res: Resumen; lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; uid: string | null; voto: VotoB; abrir: (id: string) => void;
}) {
    const p = res.proxima ?? lista[0];
    const tt = tiempoDe(p, ahora);
    const lado = lienzo.tv ? 60 : 50;
    const rapido = p.estado === "open" && p.siNo && uid && !p.miVoto;
    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <button type="button" onClick={() => abrir(p.id)} aria-label={`${p.titulo}. ${tt.abierta ? `Quedan ${tt.texto}` : "Cerrada"}. Abrir detalle`}
                className={cn(estilosB.foco, "flex min-h-0 cursor-pointer items-center gap-2.5 rounded-[14px] text-left")}>
                <AnilloB fraccion={tt.abierta ? tt.fraccion : 1} lado={lado} color={colorAnillo(p, ahora, lienzo.acento)} urgente={tt.urgente}>
                    <text x={lado / 2} y={lado / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={lado * 0.22} fontWeight={600}>
                        {tt.abierta ? tt.texto.split(" ").slice(0, 2).join(" ") : "fin"}
                    </text>
                </AnilloB>
                <span className="min-w-0 flex-1">
                    <RotuloB color={tt.urgente ? AMBAR_URGENTE : undefined}>{tt.abierta ? "Cierra antes" : "Última"}</RotuloB>
                    <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-white line-clamp-3" title={p.titulo}>{p.titulo}</span>
                </span>
            </button>
            <div className="mt-auto flex items-center gap-1.5">
                {rapido ? (
                    ["yes", "no"].map((o, i) => (
                        <button key={o} type="button" disabled={voto.enviando === p.id} onClick={() => voto.votar(p, o)}
                            className={cn(estilosB.foco, "flex-1 cursor-pointer whitespace-nowrap rounded-full ss-redondo font-semibold text-white transition-transform duration-200 hover:scale-[1.04] disabled:opacity-60 motion-reduce:transition-none", lienzo.tactil ? "min-h-11 text-[13px]" : "min-h-8 text-[12px]")}
                            style={haloB(colorOpcion(o, i), 0.16, 0.5)} aria-label={`Votar ${o === "yes" ? "Sí" : "No"}: ${p.titulo}`}>
                            {o === "yes" ? "Sí" : "No"}
                        </button>
                    ))
                ) : p.miVoto ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-white/80"><Check className="size-3.5" style={{ color: colorOpcion(p.miVoto, p.opciones.findIndex((o) => o.id === p.miVoto)) }} aria-hidden />Tu voto: {etiquetaOpcion(p, p.miVoto)}</span>
                ) : (
                    <AccionB onClick={() => abrir(p.id)} color={lienzo.acento} tactil={lienzo.tactil}>{p.estado === "open" ? "Votar" : "Ver"}</AccionB>
                )}
                {res.porVotar > 1 && <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-white/55">+{res.porVotar - (rapido ? 1 : 0)} por votar</span>}
            </div>
        </div>
    );
}

function Acciones({ lienzo }: { lienzo: LienzoB }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <AccionB href="/decisiones?nueva=1" icono={Plus} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Proponer</AccionB>
            <AccionB href="/network/politics" icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil}>Todo el Ágora</AccionB>
        </div>
    );
}

function LineaResumen({ res, lienzo }: { res: Resumen; lienzo: LienzoB }) {
    return (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] tabular-nums text-white/60">
            <span><b className="text-[15px] font-semibold text-white">{res.abiertas}</b> abiertas</span>
            <span aria-hidden>·</span>
            <span style={{ color: res.porVotar ? tintaB(lienzo.acento, 0.45) : undefined }}><b className="font-semibold">{res.porVotar}</b> por votar</span>
            {res.participacion !== null && <><span aria-hidden>·</span><span>tu voz en {Math.round(res.participacion * 100)} %</span></>}
        </p>
    );
}

function Mediano({ res, lista, ahora, lienzo, size, abrir }: {
    res: Resumen; lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; size: ElementSize; abrir: (id: string) => void;
}) {
    const n = filasQueCaben(size.height, 150, 52, 4);
    const visibles = lista.slice(0, n);
    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <LineaResumen res={res} lienzo={lienzo} />
            <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Propuestas">
                {visibles.map((p) => <li key={p.id}><FilaPropuestaB p={p} ahora={ahora} lienzo={lienzo} onAbrir={() => abrir(p.id)} /></li>)}
            </ul>
            <div className="mt-auto"><Acciones lienzo={lienzo} /></div>
        </div>
    );
}

function Panoramico({ lista, ahora, lienzo, size, abrir }: {
    lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; size: ElementSize; abrir: (id: string) => void;
}) {
    const columnas = Math.max(2, Math.min(4, Math.floor(size.width / 170)));
    const visibles = lista.slice(0, columnas);
    const lado = Math.max(40, Math.min(72, size.height - 110));
    return (
        <div className="grid h-full min-h-0 items-stretch gap-2" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
            {visibles.map((p) => {
                const tt = tiempoDe(p, ahora);
                return (
                    <button key={p.id} type="button" onClick={() => abrir(p.id)} title={p.titulo}
                        aria-label={`${p.titulo}. ${tt.abierta ? `Quedan ${tt.texto}` : "Cerrada"}. ${p.miVoto ? `Tu voto: ${etiquetaOpcion(p, p.miVoto)}` : "Sin tu voto"}`}
                        className={cn(estilosB.foco, estilosB.fila, "flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-[16px] px-1.5 py-1 text-center")}>
                        <AnilloB fraccion={tt.abierta ? tt.fraccion : 1} lado={lado} color={colorAnillo(p, ahora, lienzo.acento)} urgente={tt.urgente}>
                            <text x={lado / 2} y={lado / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={lado * 0.2} fontWeight={600}>
                                {tt.abierta ? tt.texto.split(" ").slice(0, 2).join(" ") : p.participantes}
                            </text>
                        </AnilloB>
                        <span className="text-[12px] font-semibold leading-snug text-white/90 line-clamp-2">{p.titulo}</span>
                        <span className="text-[11px] text-white/55">{p.miVoto ? `Tu voto: ${etiquetaOpcion(p, p.miVoto)}` : p.estado === "open" ? "sin tu voto" : "cerrada"}</span>
                    </button>
                );
            })}
            {visibles.length < columnas && (
                <Link href="/decisiones?nueva=1" className={cn(estilosB.foco, estilosB.fila, "flex flex-col items-center justify-center gap-1.5 rounded-[16px] text-center text-[12px] font-semibold text-white/75")}>
                    <span className="grid size-10 place-items-center rounded-full" style={haloB(lienzo.acento)}><Plus className="size-4" aria-hidden /></span>
                    Proponer
                </Link>
            )}
        </div>
    );
}

function Torre({ res, lista, ahora, lienzo, size, abrir }: {
    res: Resumen; lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; size: ElementSize; abrir: (id: string) => void;
}) {
    const p = res.proxima ?? lista[0];
    const tt = tiempoDe(p, ahora);
    const lado = Math.max(72, Math.min(120, size.width * 0.55));
    const gid = `agt${useId().replace(/:/g, "")}`;
    const resto = lista.filter((x) => x.id !== p.id).slice(0, filasQueCaben(size.height, lado + 190, 52, 5));
    return (
        <div className="flex h-full min-h-0 flex-col items-stretch gap-2">
            <button type="button" onClick={() => abrir(p.id)} aria-label={`${p.titulo}. ${tt.abierta ? `Quedan ${tt.texto}` : "Cerrada"}. Abrir detalle`}
                className={cn(estilosB.foco, "flex cursor-pointer flex-col items-center gap-1.5 rounded-[16px] text-center")}>
                <AnilloB fraccion={tt.abierta ? tt.fraccion : 1} lado={lado} color={colorAnillo(p, ahora, lienzo.acento)} urgente={tt.urgente} gradienteId={gid}>
                    <text x={lado / 2} y={lado / 2 - 4} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={lado * 0.19} fontWeight={300}>{tt.abierta ? tt.texto : "cerrada"}</text>
                    <text x={lado / 2} y={lado / 2 + lado * 0.16} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.55)" fontSize={Math.max(9, lado * 0.09)}>{tt.abierta ? "para cerrar" : `${p.participantes} voces`}</text>
                </AnilloB>
                <span className="text-[14px] font-semibold leading-snug text-white line-clamp-3">{p.titulo}</span>
            </button>
            <LineaResumen res={res} lienzo={lienzo} />
            <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Más propuestas">
                {resto.map((x) => <li key={x.id}><FilaPropuestaB p={x} ahora={ahora} lienzo={lienzo} onAbrir={() => abrir(x.id)} conReparto={false} /></li>)}
            </ul>
            <div className="mt-auto"><Acciones lienzo={lienzo} /></div>
        </div>
    );
}

function Grande({ res, lista, ahora, lienzo, size, filtro, setFiltro, abrir }: {
    res: Resumen; lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; size: ElementSize;
    filtro: Filtro; setFiltro: (f: Filtro) => void; abrir: (id: string) => void;
}) {
    const filtradas = filtrar(lista, filtro);
    const n = filasQueCaben(size.height, 170, 54, 6);
    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <PestanasB etiqueta="Filtrar propuestas" valor={filtro} onCambio={setFiltro} color={lienzo.acento} tactil={lienzo.tactil}
                opciones={[
                    { id: "abiertas", etiqueta: "Abiertas", n: res.abiertas },
                    { id: "pendientes", etiqueta: "Por votar", n: res.porVotar },
                    { id: "resueltas", etiqueta: "Resueltas", n: lista.length - res.abiertas },
                ]} />
            {filtradas.length === 0 ? (
                <p role="status" className="py-3 text-center text-[12px] text-white/60">
                    {filtro === "pendientes" ? "Tu voz está al día: no te falta ninguna votación." : filtro === "abiertas" ? "No hay votaciones abiertas ahora mismo." : "Aún no se ha resuelto ninguna."}
                </p>
            ) : (
                <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Propuestas">
                    {filtradas.slice(0, n).map((p) => <li key={p.id}><FilaPropuestaB p={p} ahora={ahora} lienzo={lienzo} onAbrir={() => abrir(p.id)} /></li>)}
                </ul>
            )}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <Acciones lienzo={lienzo} />
                {filtradas.length > n && <span className="text-[11px] tabular-nums text-white/50">+{filtradas.length - n} más</span>}
            </div>
        </div>
    );
}

function Enorme({ res, lista, ahora, lienzo, size, filtro, setFiltro, seleccion, abrir, uid, voto }: {
    res: Resumen; lista: PropuestaViva[]; ahora: number; lienzo: LienzoB; size: ElementSize;
    filtro: Filtro; setFiltro: (f: Filtro) => void; seleccion: PropuestaViva; abrir: (id: string) => void;
    uid: string | null; voto: VotoB;
}) {
    const filtradas = filtrar(lista, filtro);
    const n = filasQueCaben(size.height, 190, 56, 8);
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                <LineaResumen res={res} lienzo={lienzo} />
                <PestanasB etiqueta="Filtrar propuestas" valor={filtro} onCambio={setFiltro} color={lienzo.acento} tactil={lienzo.tactil}
                    opciones={[
                        { id: "abiertas", etiqueta: "Abiertas", n: res.abiertas },
                        { id: "pendientes", etiqueta: "Por votar", n: res.porVotar },
                        { id: "resueltas", etiqueta: "Resueltas", n: lista.length - res.abiertas },
                    ]} />
                {filtradas.length === 0 ? (
                    <p role="status" className="py-3 text-[12px] text-white/60">{filtro === "pendientes" ? "Tu voz está al día." : "Nada en esta vista."}</p>
                ) : (
                    <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Propuestas">
                        {filtradas.slice(0, n).map((p) => (
                            <li key={p.id}><FilaPropuestaB p={p} ahora={ahora} lienzo={lienzo} onAbrir={() => abrir(p.id)} seleccionada={p.id === seleccion.id} /></li>
                        ))}
                    </ul>
                )}
                <div className="mt-auto"><Acciones lienzo={lienzo} /></div>
            </div>
            <section aria-label="Detalle de la propuesta" className="min-h-0 overflow-auto border-l border-white/[0.08] pl-4">
                <DetallePropuestaB p={seleccion} ahora={ahora} lienzo={lienzo} uid={uid} voto={voto} grande />
            </section>
        </div>
    );
}
