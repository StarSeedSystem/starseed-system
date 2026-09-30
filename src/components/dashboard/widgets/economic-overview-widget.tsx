'use client';

// ════════════════════════════════════════════════════════════════
// Pulso económico — la Semilla y lo que vale cada grano (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Datos REALES del proyecto del OS: la Bolsa de la Semilla (`seed_market`, 90 días) y el
// catálogo de granos (`grain_types`, semillas por 100 g). La bolsa está en BETA con
// cotizaciones de prueba: se dice con la etiqueta «Beta simulada». Nada inventado: sin
// cotizaciones, vacío honesto. Comparte la lectura con la Cartera (misma clave), sin
// sondeo ni canal en tiempo real (el anterior abría uno por widget).
//
//   micro      → precio de la Semilla y su variación semanal.
//   s          → + una curva mínima.
//   m          → precio, variación de 30 días y la curva.
//   panorámico → precio a la izquierda, curva a lo ancho.
//   torre      → precio, curva y el cambio de cada grano.
//   l          → periodo 7/30/90 d, curva con máximo y mínimo, y el cambio de los granos.
//   xl         → + estadísticas (máx, mín, media, volatilidad) y la calculadora «¿Cuánto vale?».
// Estados honestos: cargando, error con reintento y vacío con enlace al Portal.
// ════════════════════════════════════════════════════════════════

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Coins, RefreshCw, ExternalLink, Sprout } from "lucide-react";
import { EstadoMicro, WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../kit";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./gen2/_paquete-b/cache-compartida";
import {
    PORTAL_FUNDACION, cargarMercado, entero, estadisticas, euros, variacion,
    type DatosMercado, type GranoTipo,
} from "./gen2/_paquete-b/datos-economia";
import { AccionB, MicroB, PestanasB, RaizB, RotuloB, estilosB, haloB, useLienzoB, useVisibleB, type LienzoB } from "./gen2/_paquete-b/piezas-b";
import { CurvaMercado, DeltaB, EtiquetaBeta } from "./gen2/_paquete-b/piezas-economia";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
type Periodo = 7 | 30 | 90;

export function EconomicOverviewWidget() {
    const marco = useMarcoUnificado();
    const mercado = useDatoCompartido<DatosMercado>("mercado.v1", cargarMercado);
    return (
        <WidgetShell
            title="Pulso económico"
            subtitle="Bolsa de la Semilla"
            icon={Coins}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={mercado.recargar} aria-label="Actualizar la bolsa"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", mercado.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} mercado={mercado} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, mercado }: { size: ElementSize; mercado: ResultadoDato<DatosMercado> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!mercado.dato) {
        contenido = mercado.estado === "error"
            ? <WidgetErrorState message={mercado.error ?? "No se pudo leer la Bolsa de la Semilla."} onRetry={mercado.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (mercado.dato.serie.length === 0 && mercado.dato.granos.length === 0) {
        contenido = lienzo.base === "micro"
            ? <EstadoMicro kit="vacio" icono={Sprout} color={lienzo.acento} etiqueta="Sin cotizaciones" descripcion="La Bolsa aún no tiene cotizaciones. Ver el Portal." href={PORTAL_FUNDACION} />
            : <WidgetEmptyState icon={Sprout} title="La Bolsa aún no tiene cotizaciones" message="Cuando la Semilla cotice, aquí verás su precio y lo que vale cada grano." actionLabel="Ver el Portal" actionHref={PORTAL_FUNDACION} accent={lienzo.acento} />;
    } else {
        contenido = <Composicion m={mercado.dato} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ m, lienzo }: { m: DatosMercado; lienzo: LienzoB }) {
    const [periodo, setPeriodo] = useState<Periodo>(30);
    const precio = m.serie.length ? m.serie[m.serie.length - 1].eur : null;
    const b = lienzo.base;
    const dias: Periodo = b === "l" || b === "xl" ? periodo : b === "s" || b === "micro" ? 7 : 30;
    const delta = variacion(m.serie, dias);
    const serie = m.serie.slice(-dias);
    const est = useMemo(() => estadisticas(serie), [serie]);
    const etiqueta = `La Semilla cotiza a ${precio !== null ? euros(precio, "precio") : "sin dato"}${delta !== null ? `, ${delta >= 0 ? "sube" : "baja"} ${Math.abs(delta).toFixed(1)} % en ${dias} días` : ""}.`;

    if (b === "micro") {
        // (Pulido 0930) Precio a la izquierda y unidad + variación a su lado: apilados eran 61 px.
        return (
            <MicroB etiqueta={etiqueta} cifra={precio !== null ? precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                rotulo="€ / semilla" extra={<DeltaB v={delta} />} />
        );
    }

    const precioBloque = (tam: string) => (
        <div className="min-w-0">
            <RotuloB>La Semilla</RotuloB>
            <p className={cn("font-light tabular-nums leading-tight text-white", tam)}>{precio !== null ? euros(precio, "precio") : "—"}</p>
            <DeltaB v={delta} sufijo={`${dias} d`} grande={b !== "s"} />
        </div>
    );
    const curva = (clase: string, marcas = false) => (
        <CurvaMercado serie={serie} color={lienzo.acento} className={clase} marcas={marcas} etiqueta={`Precio de la Semilla en los últimos ${dias} días`} />
    );
    const periodos = (
        <PestanasB etiqueta="Periodo" valor={String(periodo) as `${Periodo}`} onCambio={(v) => setPeriodo(Number(v) as Periodo)} color={lienzo.acento} tactil={lienzo.tactil}
            opciones={[{ id: "7", etiqueta: "7 d" }, { id: "30", etiqueta: "30 d" }, { id: "90", etiqueta: "90 d" }]} />
    );
    const pie = (
        <div className="flex flex-wrap items-center gap-1.5">
            <EtiquetaBeta />
            {(b === "l" || b === "xl") && <AccionB href={PORTAL_FUNDACION} externo icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil}>Portal</AccionB>}
        </div>
    );

    if (b === "s") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{precioBloque(lienzo.tv ? "text-[30px]" : "text-[24px]")}{curva("min-h-[28px] flex-1")}</div>;
    }
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 2fr)" }}>
                <div className="flex flex-col gap-2">{precioBloque("text-[26px]")}<EtiquetaBeta /></div>
                {curva("h-[75%] min-h-[48px]", true)}
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{precioBloque("text-[26px]")}{curva("min-h-[44px] flex-1")}{pie}</div>;
    }
    if (lienzo.clase === "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                {precioBloque("text-[26px]")}
                {curva("h-20 shrink-0")}
                <Cambio granos={m.granos} precio={precio} lienzo={lienzo} max={5} />
                <div className="mt-auto">{pie}</div>
            </div>
        );
    }
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="flex flex-wrap items-end justify-between gap-2">{precioBloque("text-[28px]")}{periodos}</div>
                {curva("h-20 shrink-0", true)}
                <Cambio granos={m.granos} precio={precio} lienzo={lienzo} max={4} />
                <div className="mt-auto">{pie}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2">{precioBloque(lienzo.tv ? "text-[40px]" : "text-[34px]")}{periodos}</div>
                {curva("min-h-[96px] flex-1", true)}
                {est && (
                    <dl className="grid grid-cols-4 gap-2 text-center">
                        {[
                            ["Máximo", euros(est.max, "precio")],
                            ["Mínimo", euros(est.min, "precio")],
                            ["Media", euros(est.media, "precio")],
                            ["Volatilidad", `${est.volatilidad.toFixed(1)} %/día`],
                        ].map(([k, v]) => (
                            <div key={k} className="min-w-0">
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">{k}</dt>
                                <dd className="mt-0.5 text-[12px] tabular-nums text-white/85">{v}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {pie}
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                <Cambio granos={m.granos} precio={precio} lienzo={lienzo} max={6} />
                <Calculadora granos={m.granos} precio={precio} lienzo={lienzo} />
            </div>
        </div>
    );
}

/** Lo que vale cada grano: 100 g → semillas → euros. */
function Cambio({ granos, precio, lienzo, max }: { granos: GranoTipo[]; precio: number | null; lienzo: LienzoB; max: number }) {
    if (granos.length === 0) return <p className="text-[11px] text-white/50">Sin granos en el catálogo todavía.</p>;
    const ordenados = [...granos].sort((a, b) => b.semillasPor100g - a.semillasPor100g);
    const tope = Math.max(...ordenados.map((g) => g.semillasPor100g), 1);
    return (
        <div className="flex min-h-0 flex-col gap-1">
            <RotuloB>100 g de cada grano</RotuloB>
            <ul className="flex flex-col gap-1" aria-label="Cambio de los granos">
                {ordenados.slice(0, max).map((g) => (
                    <li key={g.id} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                        <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                                <span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                                <span className="text-white/85 line-clamp-1" title={g.nombre}>{g.nombre}</span>
                            </span>
                            <span className="mt-0.5 block h-[3px] overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
                                <span className={cn("block h-full rounded-full", estilosB.crecer)} style={{ width: `${(g.semillasPor100g / tope) * 100}%`, background: g.color }} />
                            </span>
                        </span>
                        <span className="text-right tabular-nums">
                            <b className="font-semibold text-white">{entero(g.semillasPor100g)}</b> <span className="text-white/55">sem.</span>
                            {precio !== null && <span className="block text-[10px] text-white/45">≈ {euros(g.semillasPor100g * precio)}</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** ¿Cuánto vale? — gramos de un grano en semillas y euros, al instante (sin red). */
function Calculadora({ granos, precio, lienzo }: { granos: GranoTipo[]; precio: number | null; lienzo: LienzoB }) {
    const [gramos, setGramos] = useState("250");
    const [id, setId] = useState(granos[0]?.id ?? "");
    const campo = useId().replace(/:/g, "");
    const g = granos.find((x) => x.id === id) ?? granos[0];
    if (!g) return null;
    const n = Math.max(0, Number(gramos.replace(",", ".")) || 0);
    const semillas = (n / 100) * g.semillasPor100g;
    const alto = lienzo.tactil ? "min-h-11" : "min-h-8";
    return (
        <form className="mt-auto flex flex-col gap-1.5" onSubmit={(e) => e.preventDefault()} aria-label="¿Cuánto vale?">
            <RotuloB>¿Cuánto vale?</RotuloB>
            <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor={`${campo}-gramos`}>Gramos</label>
                <input id={`${campo}-gramos`} inputMode="decimal" value={gramos} onChange={(e) => setGramos(e.target.value)}
                    className={cn(estilosB.foco, alto, "w-20 rounded-full ss-redondo bg-white/[0.06] px-3 text-[12px] tabular-nums text-white outline-none")} />
                <span className="text-[12px] text-white/60">g de</span>
                <label className="sr-only" htmlFor={`${campo}-grano`}>Grano</label>
                <select id={`${campo}-grano`} value={g.id} onChange={(e) => setId(e.target.value)}
                    className={cn(estilosB.foco, alto, "min-w-0 flex-1 cursor-pointer rounded-full ss-redondo bg-white/[0.06] px-3 text-[12px] text-white outline-none")}>
                    {granos.map((x) => <option key={x.id} value={x.id} className="bg-slate-900">{x.nombre}</option>)}
                </select>
            </div>
            <p className="rounded-[14px] px-3 py-2 text-[13px] tabular-nums text-white" style={haloB(g.color, 0.1, 0.3)} role="status">
                = <b className="font-semibold">{entero(semillas)}</b> semillas{precio !== null && <> ≈ <b className="font-semibold">{euros(semillas * precio)}</b></>}
            </p>
        </form>
    );
}
