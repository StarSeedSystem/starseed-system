'use client';

// ════════════════════════════════════════════════════════════════
// Ágora del don — lo que la red ofrece y lo que pide (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: creaciones del Café reetiquetadas como «dones» con categorías sacadas de un hash,
// y un canal en tiempo real propio. Ahora, publicaciones REALES de la Red (`posts`, el mismo
// filtro que el feed) que llevan #don / #ofrezco (ofrecer) o #pido / #necesito (pedir).
// Ofrecer y pedir es real: abre el Compositor (/publicar) con la etiqueta ya escrita, y
// «Responder» abre la publicación (/post/<id>). Una lectura compartida con la Resonancia
// social (50 filas, 10 min), sin sondeo. Invariante (§3): economía del don, abundancia.
//
//   micro      → el regalo con cuántos dones hay.
//   s          → ofrezco / pido con sus cifras y «Ofrecer».
//   m          → los últimos dones con su autor y las dos acciones.
//   panorámico → dos columnas: se ofrece · se pide.   torre → en columna.
//   l          → pestañas Todo / Se ofrece / Se pide y la lista.
//   xl         → las dos columnas completas y cómo funciona.
// Estados honestos: cargando, error con reintento y vacío (cómo empezar, con las etiquetas).
// ════════════════════════════════════════════════════════════════

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Gift, RefreshCw, HandHeart, HandHelping, MessageCircle } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../../kit";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { cargarPublicacionesRed, dones, enlaceComponer, type Don, type PublicacionRed, type TipoDon } from "../gen2/_paquete-b/datos-red";
import { AccionB, PestanasB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
const COLOR: Record<TipoDon, string> = { ofrezco: "#10b981", pido: "#f59e0b" };
const ETIQUETA: Record<TipoDon, string> = { ofrezco: "Se ofrece", pido: "Se pide" };
type Filtro = "todo" | TipoDon;

export function GiftAgoraWidget() {
    const marco = useMarcoUnificado();
    const datos = useDatoCompartido<PublicacionRed[]>("red.publicaciones.v1", cargarPublicacionesRed);
    return (
        <WidgetShell
            title="Ágora del don"
            subtitle="Se ofrece y se pide, sin precio"
            icon={Gift}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar el Ágora del don"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, datos }: { size: ElementSize; datos: ResultadoDato<PublicacionRed[]> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const lista = useMemo(() => (datos.dato ? dones(datos.dato) : []), [datos.dato]);
    let contenido: ReactNode;
    if (!datos.dato) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer el Ágora del don."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "list"} rows={3} />;
    } else if (lista.length === 0) {
        contenido = lienzo.base === "micro"
            ? <Link href={enlaceComponer("#don ")} aria-label="Aún no hay dones. Ofrecer el primero" className={cn(estilosB.foco, "grid h-full place-items-center")}><Regalo lado={56} lienzo={lienzo} n={0} /></Link>
            : <WidgetEmptyState icon={Gift} title="Aún no hay dones en la red" message="Publica con #don lo que ofreces o con #pido lo que necesitas: aparecerá aquí para todo el mundo." actionLabel="Ofrecer el primero" actionHref={enlaceComponer("#don ")} accent={lienzo.acento} />;
    } else {
        contenido = <Composicion lista={lista} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ lista, lienzo }: { lista: Don[]; lienzo: LienzoB }) {
    const [filtro, setFiltro] = useState<Filtro>("todo");
    const ofrece = lista.filter((d) => d.tipo === "ofrezco");
    const pide = lista.filter((d) => d.tipo === "pido");
    const b = lienzo.base;
    const frase = `${ofrece.length} ${ofrece.length === 1 ? "don ofrecido" : "dones ofrecidos"} y ${pide.length} ${pide.length === 1 ? "petición" : "peticiones"} en la red`;
    const acciones = (
        <div className="flex flex-wrap items-center gap-1.5">
            <AccionB href={enlaceComponer("#don ")} icono={HandHeart} color={COLOR.ofrezco} tono="llena" tactil={lienzo.tactil}>Ofrecer</AccionB>
            <AccionB href={enlaceComponer("#pido ")} icono={HandHelping} color={COLOR.pido} tactil={lienzo.tactil}>Pedir</AccionB>
        </div>
    );
    if (b === "micro") {
        return <Link href="/red-feed" aria-label={`${frase}. Abrir la Red`} title={frase} className={cn(estilosB.foco, "grid h-full place-items-center")}><Regalo lado={60} lienzo={lienzo} n={ofrece.length} /></Link>;
    }
    const cifras = (
        <dl className="grid grid-cols-2 gap-2">
            {(["ofrezco", "pido"] as TipoDon[]).map((t) => (
                <div key={t} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: tintaB(COLOR[t], 0.3) }}>{ETIQUETA[t]}</dt>
                    <dd className="text-[26px] font-light tabular-nums leading-none text-white">{t === "ofrezco" ? ofrece.length : pide.length}</dd>
                </div>
            ))}
        </dl>
    );
    const listaDe = (items: Don[], max: number, titulo?: string) => (
        <div className="flex min-h-0 flex-col gap-1">
            {titulo && <RotuloB>{titulo}</RotuloB>}
            {items.length === 0 ? <p className="text-[11px] text-white/50">Nada por aquí todavía.</p> : (
                <ul className="flex min-h-0 flex-col gap-0.5" aria-label={titulo ?? "Dones"}>
                    {items.slice(0, max).map((d) => <FilaDon key={d.id} d={d} lienzo={lienzo} />)}
                </ul>
            )}
        </div>
    );
    if (b === "s") return <div className="flex h-full flex-col justify-center gap-2" role="group" aria-label={frase}>{cifras}{acciones}</div>;
    if (lienzo.clase === "panoramico" || b === "xl") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
                    {listaDe(ofrece, b === "xl" ? 6 : 2, `Se ofrece · ${ofrece.length}`)}
                    <div className="min-h-0 border-l border-white/[0.08] pl-4">{listaDe(pide, b === "xl" ? 6 : 2, `Se pide · ${pide.length}`)}</div>
                </div>
                {b === "xl" && <p className="text-[11px] text-white/50">Publica con #don lo que ofreces y con #pido lo que necesitas. Sin precio: se responde en la publicación.</p>}
                {acciones}
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2"><RotuloB>{frase}</RotuloB>{listaDe(lista, 3)}<div className="mt-auto">{acciones}</div></div>;
    }
    if (lienzo.clase === "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2.5">{cifras}{listaDe(ofrece, 3, "Se ofrece")}{listaDe(pide, 2, "Se pide")}<div className="mt-auto">{acciones}</div></div>;
    }
    const filtrados = filtro === "todo" ? lista : lista.filter((d) => d.tipo === filtro);
    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <PestanasB etiqueta="Filtrar dones" valor={filtro} onCambio={setFiltro} color={lienzo.acento} tactil={lienzo.tactil}
                opciones={[{ id: "todo", etiqueta: "Todo", n: lista.length }, { id: "ofrezco", etiqueta: "Se ofrece", n: ofrece.length }, { id: "pido", etiqueta: "Se pide", n: pide.length }]} />
            {listaDe(filtrados, 5)}
            <div className="mt-auto">{acciones}</div>
        </div>
    );
}

function FilaDon({ d, lienzo }: { d: Don; lienzo: LienzoB }) {
    const Icono = d.tipo === "ofrezco" ? HandHeart : HandHelping;
    return (
        <li className={cn(estilosB.entrar, "flex items-center gap-2")}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: `${COLOR[d.tipo]}22` }} aria-hidden>
                <Icono className="size-3.5" style={{ color: tintaB(COLOR[d.tipo], 0.3) }} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold leading-snug text-white/90 line-clamp-1" title={d.que}>{d.que}</span>
                <span className="block text-[10px] text-white/50 line-clamp-1">{ETIQUETA[d.tipo].toLowerCase()} · {d.autor}{d.ts ? ` · hace ${timeAgo(d.ts)}` : ""}</span>
            </span>
            <AccionB href={`/post/${encodeURIComponent(d.id)}`} icono={MessageCircle} color={COLOR[d.tipo]} tactil={lienzo.tactil} aria-label={`Responder a: ${d.que}`}>Responder</AccionB>
        </li>
    );
}

/** El regalo: una caja de luz con su lazo y, dentro, cuántos dones hay. */
function Regalo({ lado, lienzo, n }: { lado: number; lienzo: LienzoB; n: number }) {
    const id = useId().replace(/:/g, "");
    return (
        <svg width={lado} height={lado} viewBox="0 0 60 60" aria-hidden className="overflow-visible">
            <defs>
                <linearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento, 0.45)} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0.7} />
                </linearGradient>
                <radialGradient id={`h${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={30} cy={32} r={29} fill={`url(#h${id})`} />
            <rect x={13} y={24} width={34} height={26} rx={4} fill={`url(#c${id})`} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
            <rect x={11} y={19} width={38} height={8} rx={3} fill={tintaB(lienzo.acento, 0.3)} />
            <rect x={27.5} y={19} width={5} height={31} fill={lienzo.acento2} opacity={0.85} />
            <path d="M30 19c-4-7-12-7-11-2 1 3 7 3 11 2Zm0 0c4-7 12-7 11-2-1 3-7 3-11 2Z" fill={lienzo.acento2} opacity={0.9} />
            <text x={30} y={41} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fontSize={11} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>{n}</text>
        </svg>
    );
}
