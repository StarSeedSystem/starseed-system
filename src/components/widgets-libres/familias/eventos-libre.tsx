"use client";
/**
 * Eventos libres (Ola 383 · WL6, rediseño ola 0929 · F) — la agenda de la red en azur Zenith.
 * Datos REALES de `os_events` en vivo (`useLiveEvents`, la misma suscripción del widget clásico:
 * ningún sondeo nuevo). Lo que se abre cinco veces al día: ¿qué es lo próximo y cuánto falta?
 *   micro → la cuenta atrás al próximo (o el día de hoy si no hay nada).
 *   s     → el próximo: título, cuenta atrás viva y cuándo.
 *   m     → la franja de la semana (hoy encendido, puntos por evento) + el próximo + el siguiente.
 *   l/xl  → el próximo con su anillo de cuenta atrás, lugar y asistentes; la franja de la semana
 *           que filtra la agenda al tocar un día; la agenda agrupada por día y, en xl, el cielo
 *           (fases, eclipse, estación) intercalado. Crear evento y abrir el calendario.
 *   panorámico → franja + próximo + los dos siguientes en fila · torre → agenda vertical.
 * Sin eventos: lo dice, ofrece crear uno y enseña lo que sí va a pasar en el cielo.
 */
import * as React from "react";
import Link from "next/link";
import { CalendarDays, Landmark, MapPin, Palette, Plus, ShoppingBasket, Sparkles, Users, Wrench, type LucideIcon } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { useLiveEvents } from "@/lib/widget-data/os-live";
import { Rotulo, SinDato, disenoDe } from "./comun";
import { FUENTE_GLIFOS, fechaCorta, falta, useCieloAqui } from "./celeste";
import { agendaCeleste, type Acontecimiento } from "./reloj-partes";
import { agruparPorDia, claveDia, cuentaAtras, cuentaCorta, etiquetaDia, franjaSemana, prepararEventos, progresoHacia, type EventoAgenda } from "./eventos-partes";
import { Accion, Anillo, escalaTipo, esTactil, horaCorta, useAhoraVivo, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";

export { cuentaAtras } from "./eventos-partes";

const ACENTO = "#007FFF";
const ACENTO2 = "#23d5ab";

const TIPOS: Record<string, { icono: LucideIcon; etiqueta: string; color: string }> = {
    asamblea: { icono: Landmark, etiqueta: "Asamblea", color: "#a855f7" },
    taller: { icono: Wrench, etiqueta: "Taller", color: "#10b981" },
    ritual: { icono: Sparkles, etiqueta: "Ritual", color: "#ec4899" },
    obra: { icono: Palette, etiqueta: "Obra", color: "#38bdf8" },
    mercado: { icono: ShoppingBasket, etiqueta: "Mercado", color: "#f59e0b" },
};
const tipoDe = (k: string | null) => TIPOS[(k ?? "").toLowerCase()] ?? { icono: CalendarDays, etiqueta: k?.trim() || "Encuentro", color: "#7cc4ff" };
const cuando = (e: EventoAgenda, ahora: Date) => `${etiquetaDia(e.inicio, ahora)} · ${horaCorta(e.inicio)}`;

/** La franja de la semana: hoy encendido, un punto por evento; tocar un día filtra la agenda. */
function FranjaSemana({ dias, seleccion, onElegir, grande, estrecha }: {
    dias: ReturnType<typeof franjaSemana>; seleccion: string | null; onElegir?: (clave: string | null) => void; grande?: boolean; estrecha?: boolean;
}) {
    return (
        <div role="group" aria-label="Los próximos siete días" className="flex w-full items-stretch justify-between gap-0.5">
            {dias.map((d) => {
                const sel = seleccion === d.clave;
                const contenido = (
                    <>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{estrecha ? d.inicial.slice(0, 1) : d.inicial}</span>
                        <span className={`grid place-items-center rounded-full tabular-nums transition-[background-color,box-shadow] duration-200 ${grande ? "size-8 text-[14px]" : estrecha ? "size-6 text-[11.5px]" : "size-7 text-[12.5px]"} ${d.hoy ? "font-semibold text-white" : "text-white/80"}`}
                            style={{ background: d.hoy ? `linear-gradient(135deg, ${ACENTO}, ${ACENTO}aa)` : sel ? `${ACENTO}33` : undefined, boxShadow: d.hoy ? `0 0 14px ${ACENTO}88` : sel ? `inset 0 0 0 1.5px ${ACENTO}` : undefined }}>
                            {d.numero}
                        </span>
                        <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                            {Array.from({ length: Math.min(3, d.n) }, (_, i) => <span key={i} className="block size-1 rounded-full" style={{ background: i === 2 && d.n > 3 ? "#ffffff" : "#7cc4ff" }} />)}
                        </span>
                    </>
                );
                const etiqueta = `${d.hoy ? "Hoy" : d.fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}: ${d.n ? `${d.n} ${d.n === 1 ? "evento" : "eventos"}` : "sin eventos"}`;
                return onElegir ? (
                    <button key={d.clave} type="button" aria-pressed={sel} aria-label={etiqueta} onClick={() => onElegir(sel ? null : d.clave)}
                        className="ss-redondo flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-full py-0.5 outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-sky-300/80">
                        {contenido}
                    </button>
                ) : <div key={d.clave} aria-label={etiqueta} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">{contenido}</div>;
            })}
        </div>
    );
}

/** El próximo evento con su anillo de cuenta atrás. */
function Proximo({ ev, ahora, variante, k }: { ev: EventoAgenda; ahora: Date; variante: "s" | "m" | "l"; k: number }) {
    const tipo = tipoDe(ev.tipo), Icono = tipo.icono;
    const ms = ev.inicio.getTime() - ahora.getTime();
    const anillo = variante === "l" ? 88 * k : 58 * k;
    const [num, unidad = ""] = cuentaCorta(ms).split(" ");
    const cuenta = ev.enCurso
        ? <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-300"><span className="ss-latir block size-1.5 rounded-full bg-emerald-300" />en curso</span>
        : (
            <span className="flex flex-col items-center leading-none">
                <span className="tabular-nums text-white" style={{ fontSize: (variante === "l" ? 28 : 17) * k, fontWeight: 300 }}>{num}</span>
                {unidad && <span className="mt-0.5 font-semibold uppercase tracking-[0.12em] text-white/55" style={{ fontSize: (variante === "l" ? 10.5 : 9) * k }}>{unidad}</span>}
            </span>
        );
    if (variante === "s") {
        return (
            <Link href={`/evento/${ev.slug}`} className="group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 rounded-2xl p-1">
                <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: tipo.color }}><Icono aria-hidden className="size-3" />{tipo.etiqueta}</span>
                <span className="line-clamp-2 text-[14px] font-semibold leading-tight text-white group-hover:underline" title={ev.titulo}>{ev.titulo}</span>
                {ev.enCurso ? cuenta : <span className="tabular-nums text-sky-100" style={{ fontSize: 20 * k, fontWeight: 300 }}>{cuentaAtras(ms)}</span>}
                <span className="text-[11.5px] text-white/60">{cuando(ev, ahora)}</span>
            </Link>
        );
    }
    return (
        <div className={`flex min-w-0 items-center ${variante === "l" ? "gap-4" : "gap-3"}`}>
            <Anillo valor={progresoHacia(ev.inicio, ahora.getTime())} tam={anillo} color={ACENTO} color2={ACENTO2} grosor={variante === "l" ? 5 : 4}
                etiqueta={ev.enCurso ? "En curso" : `Faltan ${cuentaAtras(ms)}`}>
                {cuenta}
            </Anillo>
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: tipo.color }}>
                    <Icono aria-hidden className="size-3 shrink-0" />{tipo.etiqueta}
                </span>
                <Link href={`/evento/${ev.slug}`} title={ev.titulo}
                    className={`cursor-pointer font-semibold leading-tight text-white outline-none hover:underline focus-visible:underline ${variante === "l" ? "line-clamp-2 text-[16px]" : "line-clamp-1 text-[14px]"}`}>
                    {ev.titulo}
                </Link>
                <span className="text-[12px] text-sky-100/80">{cuando(ev, ahora)}{variante === "l" && !ev.enCurso && <span className="tabular-nums text-white/55"> · en {cuentaAtras(ms)}</span>}</span>
                {variante === "l" && ev.lugar && <span className="flex min-w-0 items-center gap-1 text-[12px] text-white/60" title={ev.lugar}><MapPin aria-hidden className="size-3 shrink-0" /><span className="truncate">{ev.lugar}</span></span>}
                {variante === "l" && ev.asistentes !== null && ev.asistentes > 0 && <span className="flex items-center gap-1 text-[12px] text-white/60"><Users aria-hidden className="size-3" />{ev.asistentes} {ev.asistentes === 1 ? "va" : "van"}</span>}
            </div>
        </div>
    );
}

type Entrada = { clase: "evento"; ev: EventoAgenda; inicio: Date } | { clase: "cielo"; a: Acontecimiento; inicio: Date };

/** La agenda agrupada por día; los acontecimientos del cielo, en gris y sin enlace. */
function Agenda({ entradas, ahora, max, conLugar }: { entradas: Entrada[]; ahora: Date; max: number; conLugar: boolean }) {
    const grupos = agruparPorDia(entradas.slice(0, max), ahora);
    return (
        <ol className="flex min-w-0 flex-col gap-2" aria-label="Agenda">
            {grupos.map((g) => (
                <li key={g.clave} className="flex min-w-0 flex-col gap-1">
                    <Rotulo color={g.etiqueta === "Hoy" ? "#7cc4ff" : undefined}>{g.etiqueta}</Rotulo>
                    <ul className="flex min-w-0 flex-col gap-0.5">
                        {g.items.map((it) => it.clase === "evento" ? (
                            <li key={it.ev.id}>
                                <Link href={`/evento/${it.ev.slug}`} title={`${it.ev.titulo}${it.ev.lugar ? ` · ${it.ev.lugar}` : ""}`}
                                    className="group flex min-w-0 cursor-pointer items-baseline gap-2 rounded-lg py-0.5 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70">
                                    <time className="w-10 shrink-0 tabular-nums text-white/60" dateTime={it.ev.inicio.toISOString()}>{it.ev.enCurso ? "ahora" : horaCorta(it.ev.inicio)}</time>
                                    <span aria-hidden className="block size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: tipoDe(it.ev.tipo).color }} />
                                    <span className="min-w-0 truncate text-white/90 group-hover:text-white group-hover:underline">{it.ev.titulo}</span>
                                    {conLugar && it.ev.lugar && <span className="min-w-0 shrink-[2] truncate text-[11px] text-white/45">{it.ev.lugar}</span>}
                                </Link>
                            </li>
                        ) : (
                            <li key={it.a.clave} className="flex min-w-0 items-baseline gap-2 py-0.5 text-[12px] text-white/55" title="Acontecimiento del cielo">
                                <span className="w-10 shrink-0 tabular-nums">{horaCorta(it.a.fecha)}</span>
                                <span aria-hidden className="w-1.5 shrink-0 text-center" style={{ fontFamily: FUENTE_GLIFOS }}>{it.a.clase === "fase" || it.a.clase === "luna" ? "☽" : it.a.clase === "eclipse" ? "◐" : "☉"}</span>
                                <span className="min-w-0 truncate">{it.a.texto}</span>
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ol>
    );
}

export function EventosLibre() {
    const { rows, loading } = useLiveEvents();
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const [seleccion, setSeleccion] = React.useState<string | null>(null);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);

    // Cuenta atrás al segundo solo en la última hora; si no, cada 30 s (y nada fuera de pantalla).
    const [ritmo, setRitmo] = React.useState(30_000);
    const ahoraD = useAhoraVivo(ritmo, visible);
    const ahora = ahoraD?.getTime() ?? 0;
    const eventos = React.useMemo(() => (ahoraD ? prepararEventos(rows, ahora) : []), [rows, ahora, ahoraD]);
    const sig = eventos[0];
    React.useEffect(() => {
        const ms = sig ? sig.inicio.getTime() - Date.now() : Infinity;
        setRitmo(ms > 0 && ms < 3_600_000 ? 1000 : 30_000);
    }, [sig, ahora]);
    const cielo = useCieloAqui(ahoraD);

    const dias = React.useMemo(() => (ahoraD ? franjaSemana(eventos, ahoraD, 7) : []), [eventos, ahoraD]);
    const cieloLejano = React.useMemo<Acontecimiento[]>(() => (cielo && ahoraD ? agendaCeleste({
        orto: null, ocaso: null, doradas: null, lunaHorizonte: null, fases: cielo.fases, proximoSigno: cielo.proximoSigno,
        eclipse: cielo.eclipse, estacion: cielo.estacion, lat: cielo.ubicacion?.lat ?? null,
    }, ahoraD, { max: 4, cercanos: false }) : []), [cielo, ahoraD]);

    const crear = (grande?: boolean) => <Accion icono={Plus} color={ACENTO} href="?createEntity=event" grande={grande || tactil} principal aria-label="Crear un evento">Evento</Accion>;
    const calendario = <Accion icono={CalendarDays} color={ACENTO2} href="/hub?tab=calendar" grande={tactil}>Calendario</Accion>;
    const etiqueta = sig ? `Próximo evento: ${sig.titulo}, ${sig.enCurso ? "en curso" : `dentro de ${cuentaAtras(sig.inicio.getTime() - ahora)}`}` : "Eventos: semana libre en la red";

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={ACENTO} acento2={ACENTO2} etiqueta={etiqueta} intensidad={0.45}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    if (!ahoraD || (loading && rows.length === 0)) return <SinDato texto="buscando eventos…" micro={b === "micro" && { icono: CalendarDays, color: "#38bdf8" }} />;
                    const hoyTxt = ahoraD.toLocaleDateString("es-ES", { weekday: "long" });

                    // ── micro ──
                    if (b === "micro") {
                        const lado = Math.min(ancho, alto);
                        // (Pulido 0930) En una tesela apaisada, cifra y rótulo en fila (apilados rozaban el borde).
                        const fila = ancho >= alto * 1.15;
                        // Fila: alineadas por la línea base DENTRO de un grupo centrado (un items-baseline
                        // en la propia caja la pegaba arriba).
                        const grupo = fila ? "flex items-baseline gap-1.5" : "flex flex-col items-center gap-0.5";
                        return sig ? (
                            <Link href={`/evento/${sig.slug}`} aria-label={etiqueta} className="flex h-full cursor-pointer items-center justify-center text-center">
                                <span className={grupo}>
                                    <span className="tabular-nums text-white" style={{ fontSize: lado * 0.26 * k, fontWeight: 300, lineHeight: 1 }}>{sig.enCurso ? "ya" : cuentaCorta(sig.inicio.getTime() - ahora)}</span>
                                    <span className="max-w-full truncate px-1 text-[10px] font-semibold uppercase tracking-wide text-sky-200/80">{sig.enCurso ? "en curso" : "próximo"}</span>
                                </span>
                            </Link>
                        ) : (
                            <div role="img" className="flex h-full items-center justify-center" aria-label={`Hoy, ${hoyTxt} ${ahoraD.getDate()}: sin eventos próximos`}>
                                <span className={grupo}>
                                    <span className="tabular-nums text-white" style={{ fontSize: lado * 0.34 * k, fontWeight: 250, lineHeight: 1 }}>{ahoraD.getDate()}</span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">{hoyTxt.slice(0, 3)}</span>
                                </span>
                            </div>
                        );
                    }

                    // ── sin eventos: honesto, con el cielo y crear ──
                    if (!sig) {
                        return (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-3 text-center" data-diseno={`${b}-vacio`}>
                                {b !== "s" && dias.length > 0 && <div className="w-full max-w-[20rem]"><FranjaSemana dias={dias} seleccion={null} estrecha={ancho < 260} /></div>}
                                <span className="text-[14px] font-medium text-white/85">Semana libre en la red</span>
                                {b !== "s" && cieloLejano.length > 0 && (
                                    <ul className="flex flex-col gap-0.5 text-[12px] text-white/60" aria-label="En el cielo">
                                        {cieloLejano.slice(0, b === "m" ? 2 : 3).map((a) => <li key={a.clave}>{a.texto} · {fechaCorta(a.fecha, ahoraD)}</li>)}
                                    </ul>
                                )}
                                <div className="flex flex-wrap items-center justify-center gap-2">{crear()}{(b === "l" || b === "xl") && calendario}</div>
                            </div>
                        );
                    }

                    // ── s ──
                    if (b === "s") return <div className="flex h-full items-center justify-center px-2" data-diseno="s"><Proximo ev={sig} ahora={ahoraD} variante="s" k={k} /></div>;

                    const filtrados = seleccion ? eventos.filter((e) => claveDia(e.inicio) === seleccion) : eventos;
                    /** La agenda: sin el próximo (ya está en grande) salvo al filtrar un día; en xl, con el cielo. */
                    const entradas = (conCielo: boolean): Entrada[] => {
                        const ev: Entrada[] = filtrados.filter((e) => seleccion !== null || e.id !== sig.id).map((e) => ({ clase: "evento", ev: e, inicio: e.inicio }));
                        if (!conCielo || seleccion) return ev;
                        const hasta = (eventos[eventos.length - 1]?.inicio.getTime() ?? ahora) + 86_400_000;
                        const delCielo: Entrada[] = cieloLejano.filter((a) => a.fecha.getTime() <= hasta).map((a) => ({ clase: "cielo", a, inicio: a.fecha }));
                        return [...ev, ...delCielo].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());
                    };
                    const vacioDia = seleccion && filtrados.length === 0
                        ? <p className="text-[12px] text-white/55">{etiquetaDia(new Date(seleccion + "T12:00"), ahoraD)}: sin eventos.</p> : null;

                    // ── panorámico ──
                    if (clase === "panoramico" && horizontal) {
                        const siguientes = eventos.slice(1, ancho > 640 ? 3 : 2);
                        return (
                            <div className="flex h-full w-full items-center gap-5 px-4" data-diseno="panoramico">
                                <div className="w-[34%] min-w-[200px] max-w-[300px]"><FranjaSemana dias={dias} seleccion={null} /></div>
                                <div className="min-w-0 flex-1"><Proximo ev={sig} ahora={ahoraD} variante="m" k={k} /></div>
                                {siguientes.length > 0 && (
                                    <ul className="flex min-w-0 max-w-[30%] flex-col gap-1">
                                        {siguientes.map((e) => (
                                            <li key={e.id} className="min-w-0 text-[12px]"><Link href={`/evento/${e.slug}`} className="block cursor-pointer truncate text-white/80 hover:text-white hover:underline" title={e.titulo}>{e.titulo}</Link><span className="text-white/50">{cuando(e, ahoraD)}</span></li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    }

                    // ── torre ──
                    if (clase === "torre") {
                        const filas = Math.max(2, Math.floor((alto - 190) / 26));
                        return (
                            <div className="flex h-full w-full flex-col gap-3 px-3 py-3" data-diseno="torre">
                                <Proximo ev={sig} ahora={ahoraD} variante="s" k={k} />
                                <div className="min-h-0 flex-1 overflow-hidden"><Agenda entradas={entradas(false)} ahora={ahoraD} max={filas} conLugar={false} /></div>
                                <div className="flex justify-center">{crear()}</div>
                            </div>
                        );
                    }

                    // ── m ──
                    if (b === "m") {
                        const segundo = eventos[1];
                        return (
                            <div className="flex h-full w-full flex-col justify-center gap-3 px-3" data-diseno="m">
                                <FranjaSemana dias={dias} seleccion={null} estrecha={ancho < 260} />
                                <Proximo ev={sig} ahora={ahoraD} variante="m" k={k} />
                                {segundo && alto >= 220 && (
                                    <Link href={`/evento/${segundo.slug}`} title={segundo.titulo} className="flex min-w-0 cursor-pointer items-baseline gap-2 text-[12px] text-white/70 hover:text-white">
                                        <span className="shrink-0 text-white/45">Después</span><span className="min-w-0 truncate">{segundo.titulo}</span><span className="shrink-0 tabular-nums text-white/45">{falta(segundo.inicio, ahoraD)}</span>
                                    </Link>
                                )}
                            </div>
                        );
                    }

                    // ── l / xl ──
                    const dosColumnas = ancho >= 440;
                    const filasAgenda = Math.max(2, Math.floor((alto - (dosColumnas ? 110 : 250)) / 22)) + (b === "xl" ? 2 : 0);
                    const acciones = <div className="flex flex-wrap items-center gap-2">{crear()}{calendario}</div>;
                    if (!dosColumnas) {
                        return (
                            <div className="flex h-full w-full flex-col justify-center gap-3 px-3" data-diseno={`${b}-apilado`}>
                                <FranjaSemana dias={dias} seleccion={seleccion} onElegir={setSeleccion} />
                                {!seleccion && <Proximo ev={sig} ahora={ahoraD} variante="m" k={k} />}
                                {vacioDia ?? <Agenda entradas={entradas(b === "xl")} ahora={ahoraD} max={filasAgenda} conLugar={ancho >= 340} />}
                                {acciones}
                            </div>
                        );
                    }
                    return (
                        <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-5 px-4 py-3" data-diseno={`${b}-agenda`}>
                            <div className="flex min-w-0 flex-col justify-center gap-4">
                                <Rotulo color="#7cc4ff">{sig.enCurso ? "Ahora" : "Próximo"}</Rotulo>
                                <Proximo ev={sig} ahora={ahoraD} variante="l" k={k} />
                                {acciones}
                            </div>
                            <div className="flex h-full min-w-0 flex-col justify-center gap-3 overflow-hidden">
                                <FranjaSemana dias={dias} seleccion={seleccion} onElegir={setSeleccion} grande={b === "xl"} />
                                {vacioDia ?? <Agenda entradas={entradas(b === "xl")} ahora={ahoraD} max={filasAgenda} conLugar={ancho / 2 >= 330} />}
                                {!vacioDia && entradas(b === "xl").length === 0 && <p className="text-[12px] text-white/55">Nada más esta semana.</p>}
                            </div>
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default EventosLibre;
