'use client';

// ════════════════════════════════════════════════════════════════
// Huella regenerativa — los ciclos que tu comunidad puede cerrar (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: CO₂ compensado, árboles y compost inventados, un «escáner AR» que no existía y un
// porcentaje de «ciclo cerrado» sin fuente. Ahora, cuatro ciclos con dato REAL, cada uno con
// su fuente y su acción (sin índice inventado que los junte):
//   · Sol captable esta semana en tu lugar (Open-Meteo, con tus m² de paneles del Oikos).
//   · Lluvia captable esta semana (Open-Meteo, con tus m² de tejado).
//   · Bienes compartidos en uso ahora (recursos comunes del Ejecutivo: lo que no se compra dos veces).
//   · Dones en circulación en la Red (#don / #pido).
// Las lecturas son las MISMAS claves que Oikos, Patrimonio común y el Ágora del don: si están en
// el tablero, esto no pide nada nuevo. Invariante (§3): circularidad, abundancia, procomún.
//
//   micro      → el círculo de los cuatro ciclos.
//   s          → el círculo con sus cifras al pasar.
//   m          → círculo + las cuatro cifras.
//   panorámico → círculo · cifras en fila.   torre → en columna.
//   l / xl     → + la fuente y la acción de cada ciclo.
// Estados honestos: cargando, «sin dato» por ciclo (nunca un cero inventado), error con reintento
// y vacío (sin lugar ni datos: qué hace falta para empezar).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, type ReactNode } from "react";
import { Recycle, RefreshCw, Sun, Droplets, Boxes, Gift, type LucideIcon } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { cn } from "@/lib/utils";
import { useDatoCompartido } from "../gen2/_paquete-b/cache-compartida";
import { aguaTejado, cargarCieloOikos, energiaPaneles, type CieloOikos } from "../gen2/_paquete-b/datos-oikos";
import { CLAVE_PROCOMUN, cargarProcomun, type DatosProcomun } from "../gen2/_paquete-b/datos-procomun";
import { cargarPublicacionesRed, dones, enlaceComponer, type PublicacionRed } from "../gen2/_paquete-b/datos-red";
import { useLugarB, useSupuestosOikos } from "../gen2/_paquete-b/lugar";
import { AccionB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
const ENT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export interface Ciclo { id: string; nombre: string; valor: number | null; unidad: string; fuente: string; accion: { texto: string; href: string }; color: string; icono: LucideIcon }

/** Los cuatro ciclos a partir de los datos reales disponibles (null = sin dato, nunca cero inventado). PURO. */
export function ciclos(f: { cielo: CieloOikos | null; procomun: DatosProcomun | null; red: PublicacionRed[] | null; paneles: number; tejado: number }): Ciclo[] {
    const sol = f.cielo ? f.cielo.dias.reduce((s, d) => s + d.solKwh, 0) : null;
    const lluvia = f.cielo ? f.cielo.dias.reduce((s, d) => s + d.lluviaL, 0) : null;
    return [
        { id: "sol", nombre: "Sol captable", valor: sol === null ? null : energiaPaneles(sol, f.paneles), unidad: "kWh / semana", fuente: `Open-Meteo · ${f.paneles} m² de paneles`, accion: { texto: "Ajustar en el Clima", href: "/clima" }, color: "#FFBF00", icono: Sun },
        { id: "agua", nombre: "Lluvia captable", valor: lluvia === null ? null : aguaTejado(lluvia, f.tejado), unidad: "L / semana", fuente: `Open-Meteo · ${f.tejado} m² de tejado`, accion: { texto: "Ajustar en el Clima", href: "/clima" }, color: "#38bdf8", icono: Droplets },
        { id: "comun", nombre: "Bienes compartidos en uso", valor: f.procomun ? f.procomun.lista.filter((r) => r.status === "En uso").length : null, unidad: `de ${f.procomun?.lista.length ?? "—"} recursos`, fuente: "Recursos comunes del Ejecutivo", accion: { texto: "Usar un recurso", href: "/network/politics" }, color: "#10b981", icono: Boxes },
        { id: "don", nombre: "Dones en circulación", valor: f.red ? dones(f.red).length : null, unidad: "en la Red", fuente: "Publicaciones con #don / #pido", accion: { texto: "Ofrecer un don", href: enlaceComponer("#don ") }, color: "#ec4899", icono: Gift },
    ];
}

export function RegenTracerWidget() {
    const marco = useMarcoUnificado();
    const lugar = useLugarB();
    const [supuestos] = useSupuestosOikos();
    const cargarCielo = useCallback(() => cargarCieloOikos(lugar!.lat, lugar!.lon, lugar!.nombre), [lugar]);
    const cielo = useDatoCompartido<CieloOikos>(lugar ? `oikos.cielo.v1.${lugar.lat.toFixed(2)},${lugar.lon.toFixed(2)}` : null, cargarCielo, { ttlMs: 60 * 60_000 });
    const procomun = useDatoCompartido<DatosProcomun>(CLAVE_PROCOMUN, cargarProcomun);
    const red = useDatoCompartido<PublicacionRed[]>("red.publicaciones.v1", cargarPublicacionesRed);
    const recargar = useCallback(() => { cielo.recargar(); procomun.recargar(); red.recargar(); }, [cielo, procomun, red]);
    const fuentes = [procomun, red, ...(lugar ? [cielo] : [])];
    const cargando = fuentes.every((f) => f.estado === "cargando");
    const fallo = fuentes.every((f) => f.estado === "error");
    const lista = useMemo(() => ciclos({ cielo: cielo.dato, procomun: procomun.dato, red: red.dato, paneles: supuestos.paneles, tejado: supuestos.tejado }), [cielo.dato, procomun.dato, red.dato, supuestos]);
    return (
        <WidgetShell
            title="Huella regenerativa"
            subtitle="Los ciclos que cerramos juntos"
            icon={Recycle}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={recargar} aria-label="Actualizar la huella regenerativa"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", cargando && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} lista={lista} cargando={cargando} fallo={fallo} recargar={recargar} sinLugar={!lugar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, lista, cargando, fallo, recargar, sinLugar }: { size: ElementSize; lista: Ciclo[]; cargando: boolean; fallo: boolean; recargar: () => void; sinLugar: boolean }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const conDato = lista.filter((c) => c.valor !== null);
    let contenido: ReactNode;
    if (fallo) contenido = <WidgetErrorState message="No se pudo leer ningún ciclo ahora." onRetry={recargar} />;
    else if (cargando) contenido = <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    else if (conDato.length === 0) {
        contenido = <WidgetEmptyState icon={Recycle} title="Aún no hay ciclos que medir" message={sinLugar ? "Elige tu lugar en el Clima y comparte recursos o dones para empezar." : "Comparte un recurso común u ofrece un don para empezar."} actionLabel={sinLugar ? "Elegir lugar" : "Ofrecer un don"} actionHref={sinLugar ? "/clima" : enlaceComponer("#don ")} accent={lienzo.acento} />;
    } else {
        contenido = <Composicion lista={lista} lienzo={lienzo} ancho={size.width} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ lista, lienzo, ancho = 0 }: { lista: Ciclo[]; lienzo: LienzoB; ancho?: number }) {
    const b = lienzo.base;
    const frase = lista.map((c) => `${c.nombre}: ${c.valor === null ? "sin dato" : `${ENT.format(c.valor)} ${c.unidad}`}`).join("; ");
    const circulo = (lado: number) => <Circulo lista={lista} lado={lado} lienzo={lienzo} etiqueta={frase} />;
    if (b === "micro") return <div className="grid h-full place-items-center">{circulo(76)}</div>;
    if (b === "s") return <div className="grid h-full place-items-center">{circulo(110)}</div>;
    const cifras = (columnas: number, detalle: boolean) => (
        <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }} aria-label="Ciclos regenerativos">
            {lista.map((c) => {
                const Icono = c.icono;
                return (
                    <li key={c.id} className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: tintaB(c.color, 0.3) }}>
                            <Icono className="size-3.5 shrink-0" aria-hidden /><span className="line-clamp-1">{c.nombre}</span>
                        </span>
                        <span className="flex items-baseline gap-1">
                            <span className="text-[20px] font-light tabular-nums leading-none text-white">{c.valor === null ? "—" : ENT.format(c.valor)}</span>
                            <span className="text-[10px] text-white/55">{c.valor === null ? "sin dato" : c.unidad}</span>
                        </span>
                        {detalle && <span className="text-[10px] text-white/40 line-clamp-1" title={c.fuente}>{c.fuente}</span>}
                        {detalle && <span className="mt-0.5"><AccionB href={c.accion.href} color={c.color} tactil={lienzo.tactil}>{c.accion.texto}</AccionB></span>}
                    </li>
                );
            })}
        </ul>
    );
    if (lienzo.clase === "panoramico") return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>{circulo(110)}{cifras(4, false)}</div>;
    if (b === "m" && lienzo.clase !== "torre") return <div className="flex h-full min-h-0 items-center gap-3">{circulo(116)}<div className="min-w-0 flex-1">{cifras(2, false)}</div></div>;
    if (lienzo.clase === "torre") return <div className="flex h-full min-h-0 flex-col items-center gap-3">{circulo(130)}{cifras(1, true)}</div>;
    // Cada acción cabe en su columna solo si la columna mide ~150 px; si no, los botones iban uno
    // encima del otro («Ajustar en el Clima» × «Ajustar en el Clima»). En estrecho: cifras sin
    // botones y una sola acción bajo el círculo.
    const lado = b === "xl" ? (lienzo.tv ? 200 : 170) : 130;
    const conDetalle = ancho <= 0 || (ancho - lado - 16) / 2 >= 150;
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
            <div className="flex flex-col items-center gap-2">
                {circulo(lado)}
                {conDetalle ? <RotuloB>Cada ciclo con su fuente</RotuloB> : <AccionB href="/clima" color={lienzo.acento} tactil={lienzo.tactil}>Ajustar en el Clima</AccionB>}
            </div>
            {cifras(2, conDetalle)}
        </div>
    );
}

/** Cuatro arcos que giran como un ciclo; cada uno se enciende si su dato existe. */
function Circulo({ lista, lado, lienzo, etiqueta }: { lista: Ciclo[]; lado: number; lienzo: LienzoB; etiqueta: string }) {
    const id = useId().replace(/:/g, "");
    const vivo = lienzo.nivel !== "ligero";
    const r = 40, c = 2 * Math.PI * r, tramo = c / lista.length;
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" aria-label={etiqueta} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`n${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={50} cy={50} r={30} fill={`url(#n${id})`} />
            <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: "90s" }}>
                {lista.map((ci, i) => (
                    <g key={ci.id}>
                        <circle cx={50} cy={50} r={r} fill="none" stroke={ci.color} strokeOpacity={ci.valor === null ? 0.15 : 0.85} strokeWidth={7} strokeLinecap="round"
                            strokeDasharray={`${(tramo - 7).toFixed(1)} ${(c - tramo + 7).toFixed(1)}`} strokeDashoffset={(-i * tramo).toFixed(1)} transform="rotate(-90 50 50)">
                            <title>{`${ci.nombre}: ${ci.valor === null ? "sin dato" : `${ENT.format(ci.valor)} ${ci.unidad}`}`}</title>
                        </circle>
                        {(() => {
                            const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / lista.length;
                            return <path d={`M${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r} l${(-Math.sin(a) * 3).toFixed(2)} ${(Math.cos(a) * 3).toFixed(2)}`} stroke="#fff" strokeOpacity={0.7} strokeWidth={1.2} strokeLinecap="round" />;
                        })()}
                    </g>
                ))}
            </g>
            <text x={50} y={48} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={15} fontWeight={300} style={{ fontVariantNumeric: "tabular-nums" }}>{lista.filter((x) => x.valor !== null).length}/{lista.length}</text>
            <text x={50} y={60} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={6} fontWeight={600} letterSpacing=".08em">CICLOS CON DATO</text>
        </svg>
    );
}
