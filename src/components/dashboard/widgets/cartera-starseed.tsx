'use client';

// ════════════════════════════════════════════════════════════════
// Cartera StarSeed — tus Semillas, su valor y tus movimientos (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Datos REALES del proyecto del OS: `wallets` + `economy_ledger` (con sesión, RLS por
// auth.uid()) y la Bolsa de la Semilla `seed_market` + `grain_types` (pública). La
// cartera está en BETA: es de solo lectura y ninguna operación mueve valor real — se
// dice en la interfaz. Lectura compartida con «Pulso económico» (misma clave de la
// bolsa), sin sondeo ni tiempo real: se relee al volver a la pestaña si caducó (10 min)
// o con «Actualizar».
//
//   micro      → la Semilla y tu saldo.
//   s          → saldo, valor en € y la variación de la semana.
//   m          → + la curva de 30 días de la Semilla.
//   panorámico → saldo · curva · últimos movimientos, en una fila.
//   torre      → saldo, curva, composición en granos y movimientos en columna.
//   l          → + composición en granos y los tres últimos movimientos.
//   xl         → saldo y composición a la izquierda; curva con periodo y seis movimientos a la derecha.
// Estados honestos: cargando, error con reintento, sin sesión (bolsa pública + entrar) y
// estado vacío (la cartera existe a 0: se abre al recibir tus primeras semillas).
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Wallet, RefreshCw, LogIn, ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import { WidgetShell, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./gen2/_paquete-b/cache-compartida";
import {
    PORTAL_FUNDACION, cargarCartera, cargarMercado, compacto, composicion, entero, euros, valorCartera, variacion,
    type DatosCartera, type DatosMercado,
} from "./gen2/_paquete-b/datos-economia";
import { AccionB, PestanasB, RaizB, RotuloB, estilosB, useLienzoB, useVisibleB, type LienzoB } from "./gen2/_paquete-b/piezas-b";
import { CurvaMercado, DeltaB, EtiquetaBeta, SemillaGlifo } from "./gen2/_paquete-b/piezas-economia";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
type Periodo = 7 | 30 | 90;

export function CarteraStarseedWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const mercado = useDatoCompartido<DatosMercado>("mercado.v1", cargarMercado);
    const cargar = useCallback(() => cargarCartera(uid), [uid]);
    const cartera = useDatoCompartido<DatosCartera>(ready ? `cartera.v1.${uid ?? "anon"}` : null, cargar);
    const recargar = useCallback(() => { mercado.recargar(); cartera.recargar(); }, [mercado, cartera]);
    const micro = marco?.base === "micro";
    return (
        <WidgetShell
            title="Cartera StarSeed"
            subtitle="Tus Semillas, en beta"
            icon={Wallet}
            bare={micro}
            actions={
                <button type="button" onClick={recargar} aria-label="Actualizar la cartera"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", (mercado.estado === "cargando" || cartera.estado === "cargando") && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} uid={uid} mercado={mercado} cartera={cartera} recargar={recargar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, uid, mercado, cartera, recargar }: {
    size: ElementSize; uid: string | null; mercado: ResultadoDato<DatosMercado>; cartera: ResultadoDato<DatosCartera>; recargar: () => void;
}) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!mercado.dato || !cartera.dato) {
        const fallo = (mercado.estado === "error" && cartera.estado === "error") || (!mercado.dato && mercado.estado === "error" && !uid);
        contenido = fallo
            ? <WidgetErrorState message={cartera.error ?? mercado.error ?? "No se pudo leer la cartera."} onRetry={recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else {
        contenido = <Composicion m={mercado.dato} c={cartera.dato} uid={uid} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ m, c, uid, lienzo }: { m: DatosMercado; c: DatosCartera; uid: string | null; lienzo: LienzoB }) {
    const [periodo, setPeriodo] = useState<Periodo>(30);
    const precio = m.serie.length ? m.serie[m.serie.length - 1].eur : null;
    const valor = valorCartera(c.semillas, c.granos, m.granos, precio);
    const semana = variacion(m.serie, 7);
    const comp = useMemo(() => composicion(c.granos, m.granos), [c.granos, m.granos]);
    const b = lienzo.base;
    const conSesion = !!uid;
    const etiquetaSaldo = conSesion
        ? `Tienes ${entero(c.semillas)} semillas${valor !== null ? `, unos ${euros(valor)}` : ""}${semana !== null ? `; la Semilla ${semana >= 0 ? "sube" : "baja"} ${Math.abs(semana).toFixed(1)} % en 7 días` : ""}.`
        : `La Semilla cotiza a ${precio !== null ? euros(precio, "precio") : "sin dato"} en la beta.`;

    if (b === "micro") {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-0.5 text-center" role="group" aria-label={etiquetaSaldo} title={etiquetaSaldo}>
                <SemillaGlifo lado={30} color={lienzo.acento} />
                <span className="text-[22px] font-light tabular-nums leading-none text-white">{conSesion ? compacto(c.semillas) : precio !== null ? precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/55">{conSesion ? "semillas" : "€ / semilla"}</span>
            </div>
        );
    }

    const heroe = <Heroe c={c} precio={precio} valor={valor} semana={semana} conSesion={conSesion} lienzo={lienzo} grande={b === "xl"} />;
    const curva = (dias: Periodo, clase: string, marcas = false) => (
        <CurvaMercado serie={m.serie.slice(-dias)} color={lienzo.acento} className={clase} marcas={marcas}
            etiqueta={`Precio de la Semilla, últimos ${dias} días: ${precio !== null ? euros(precio, "precio") : "sin dato"}`} />
    );
    const pie = (
        <div className="flex flex-wrap items-center gap-1.5">
            <EtiquetaBeta />
            {!conSesion && <AccionB href="/login" icono={LogIn} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Entra para ver tu cartera</AccionB>}
            {(b === "l" || b === "xl") && <AccionB href={PORTAL_FUNDACION} externo icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil} titulo="La Fundación y el mercado viven en el Portal StarSeed (otra cuenta)">Portal</AccionB>}
        </div>
    );

    if (b === "s") {
        return <div className="flex h-full min-h-0 flex-col justify-center gap-2">{heroe}{!conSesion && pie}</div>;
    }
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr)" }}>
                {heroe}
                {curva(30, "h-[70%] min-h-[48px]")}
                {conSesion ? <Movimientos c={c} max={2} lienzo={lienzo} /> : pie}
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                {heroe}
                {curva(30, "min-h-[44px] flex-1")}
                {pie}
            </div>
        );
    }
    if (lienzo.clase === "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                {heroe}
                {curva(30, "h-16")}
                {conSesion && <Granos comp={comp} lienzo={lienzo} max={3} />}
                {conSesion && <Movimientos c={c} max={3} lienzo={lienzo} />}
                <div className="mt-auto">{pie}</div>
            </div>
        );
    }
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                {heroe}
                {curva(30, "h-16 shrink-0")}
                {conSesion && <Granos comp={comp} lienzo={lienzo} max={4} />}
                {conSesion && <Movimientos c={c} max={3} lienzo={lienzo} />}
                <div className="mt-auto">{pie}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                {heroe}
                {conSesion && <Granos comp={comp} lienzo={lienzo} max={6} />}
                <div className="mt-auto">{pie}</div>
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <RotuloB>Bolsa de la Semilla</RotuloB>
                    <PestanasB etiqueta="Periodo de la curva" valor={String(periodo) as `${Periodo}`} onCambio={(v) => setPeriodo(Number(v) as Periodo)} color={lienzo.acento} tactil={lienzo.tactil}
                        opciones={[{ id: "7", etiqueta: "7 d" }, { id: "30", etiqueta: "30 d" }, { id: "90", etiqueta: "90 d" }]} />
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-light tabular-nums text-white">{precio !== null ? euros(precio, "precio") : "—"}</span>
                    <DeltaB v={variacion(m.serie, periodo)} sufijo={`${periodo} d`} />
                </div>
                {curva(periodo, "h-24 shrink-0", true)}
                {conSesion ? <Movimientos c={c} max={6} lienzo={lienzo} /> : <p className="text-[12px] text-white/60">Entra para ver tus movimientos.</p>}
            </div>
        </div>
    );
}

function Heroe({ c, precio, valor, semana, conSesion, lienzo, grande }: {
    c: DatosCartera; precio: number | null; valor: number | null; semana: number | null; conSesion: boolean; lienzo: LienzoB; grande?: boolean;
}) {
    const lado = grande ? 56 : lienzo.base === "s" ? 34 : 42;
    if (!conSesion) {
        return (
            <div className="flex items-center gap-3">
                <SemillaGlifo lado={lado} color={lienzo.acento} />
                <div className="min-w-0">
                    <RotuloB>La Semilla hoy</RotuloB>
                    <p className="text-[24px] font-light tabular-nums leading-tight text-white">{precio !== null ? euros(precio, "precio") : "—"}</p>
                    <DeltaB v={semana} sufijo="7 d" />
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3">
            <SemillaGlifo lado={lado} color={lienzo.acento} />
            <div className="min-w-0">
                <p className="flex items-baseline gap-1.5">
                    <span className={cn("font-light tabular-nums leading-none text-white", grande ? "text-[40px]" : lienzo.tv ? "text-[34px]" : "text-[28px]")}>{entero(c.semillas)}</span>
                    <span className="text-[12px] font-semibold text-white/60">semillas</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] tabular-nums text-white/70">
                    {valor !== null ? <span>≈ {euros(valor)}</span> : <span className="text-white/45">sin precio</span>}
                    <DeltaB v={semana} sufijo="7 d" />
                </p>
                {!c.tieneCartera && <p className="mt-1 text-[11px] text-white/50">Tu cartera se abre al recibir tus primeras semillas.</p>}
            </div>
        </div>
    );
}

function Granos({ comp, lienzo, max }: { comp: ReturnType<typeof composicion>; lienzo: LienzoB; max: number }) {
    if (comp.length === 0) return <p className="text-[11px] text-white/50">Sin granos todavía: cada grano se valora en semillas según el catálogo.</p>;
    return (
        <div className="flex flex-col gap-1.5">
            <RotuloB>En granos</RotuloB>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.08]" role="img"
                aria-label={`Composición: ${comp.map((f) => `${f.grano.nombre} ${Math.round(f.pct * 100)} %`).join(", ")}`}>
                {comp.map((f, i) => (
                    <span key={f.grano.id} className={estilosB.crecer} style={{ width: `${f.pct * 100}%`, background: f.grano.color, marginLeft: i ? 1 : 0, animationDelay: `${i * 60}ms` }} />
                ))}
            </div>
            <ul className={cn("grid gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-white/70", lienzo.base === "xl" ? "grid-cols-1" : "grid-cols-2")}>
                {comp.slice(0, max).map((f) => (
                    <li key={f.grano.id} className="flex min-w-0 items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: f.grano.color }} aria-hidden />
                        <span className="min-w-0 flex-1 line-clamp-1" title={f.grano.nombre}>{f.grano.nombre}</span>
                        <span className="shrink-0 text-white/55">{entero(f.gramos)} g</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Movimientos({ c, max, lienzo }: { c: DatosCartera; max: number; lienzo: LienzoB }) {
    if (c.movimientos.length === 0) return <p className="text-[11px] text-white/50">Sin movimientos todavía.</p>;
    return (
        <div className="flex min-h-0 flex-col gap-1">
            <RotuloB>Últimos movimientos</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Últimos movimientos">
                {c.movimientos.slice(0, max).map((mv, i) => {
                    const entra = mv.semillas > 0;
                    const Icono = entra ? ArrowDownLeft : ArrowUpRight;
                    const color = mv.semillas === 0 ? "#94a3b8" : entra ? "#34d399" : "#fb7185";
                    return (
                        <li key={`${mv.ts ?? i}-${i}`} className={cn("flex items-center gap-2", lienzo.tactil ? "min-h-11" : "min-h-7")}>
                            <span className="grid size-6 shrink-0 place-items-center rounded-full" style={{ background: `${color}22` }} aria-hidden>
                                <Icono className="size-3.5" style={{ color }} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[12px] leading-snug text-white/85 line-clamp-1" title={mv.nombre}>{mv.nombre}</span>
                                <span className="block text-[10px] text-white/45">{mv.tipo}{mv.ts ? ` · hace ${timeAgo(mv.ts)}` : ""}</span>
                            </span>
                            <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color }}>
                                {mv.semillas === 0 ? "·" : `${entra ? "+" : "−"}${entero(Math.abs(mv.semillas))}`}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
