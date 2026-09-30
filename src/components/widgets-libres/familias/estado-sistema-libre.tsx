"use client";
/**
 * Estado del sistema libre (Ola 383 · WL5, rediseño ola 0929 · F) — la salud HONESTA de esta
 * neurona en un anillo por segmentos (uno por señal, del color de su estado: verde Horizon, ámbar
 * Logic, carmesí Anchor, gris «sin dato») y, al lado, qué pasa y cómo arreglarlo con un toque.
 * Señales reales: red y latencia, sincronía de la cuenta, el guardián de consumo de la nube (solo
 * lectura: pausa, freno del día, lecturas de hoy), almacenamiento (y si está protegido), batería,
 * neuronas en línea y memoria de la pestaña. Lo que el navegador no mide, «sin dato».
 * Arreglos reales: reintentar, sincronizar ahora (nunca con la nube en pausa), encender la
 * sincronía, entrar, proteger los datos (`storage.persist`), modo eco y salir de él.
 * Medición local cada 30 s y solo a la vista; la lista de neuronas, cada 5 min (con su caché).
 *   micro → el orbe de salud · s → anillo + titular + el arreglo · m → anillo + lo peor
 *   l/xl → anillo + todas las señales con detalle, barra y arreglo · panorámico · torre.
 */
import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BatteryCharging, BatteryLow, BatteryMedium, Cpu, Gauge, HardDrive, Network, OctagonAlert, RefreshCw, ShieldCheck, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { getRealtimeSyncStatus, onRealtimeSyncStatus, setRealtimeSyncEnabled, syncNow, type RealtimeSyncStatus } from "@/lib/sync/realtime-sync";
import { listNeurons } from "@/lib/neurons/neurons";
import { avisoConsumoServidor, leerAvisoConsumo, leerContadores, suscribirConsumo } from "@/lib/consumo/guardian";
import { useFreno } from "@/lib/consumo/freno";
import { PERF_CHANGED_EVENT, getPerfMode, setPerfMode } from "@/lib/perf/device-tier";
import { disenoDe } from "./comun";
import { COLOR_NIVEL, diagnosticar, porGravedad, saludGeneral, titular, type Arreglo, type Diagnostico, type Senales } from "./estado-partes";
import { Accion, escalaTipo, esTactil, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";

export { saludDe } from "./estado-partes";

const MEDIR_MS = 30_000;
const NEURONAS_MS = 5 * 60_000;
const ALMACEN_MS = 5 * 60_000;

type Local = Omit<Senales, "consumo" | "sync" | "ultimoCambio" | "eco">;
type Nav = Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }>;
    connection?: { downlink?: number; effectiveType?: string; rtt?: number; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
};

/** Las señales de esta neurona, medidas en local (y la lista de neuronas con su caché). */
function useSenales(visible: boolean): { senales: Senales; medir: () => void; medida: boolean } {
    const [local, setLocal] = React.useState<Local>({ enLinea: true, red: null, almacen: null, bateria: null, neuronas: null, memoria: null });
    const [medida, setMedida] = React.useState(false);
    const [sync, setSync] = React.useState<RealtimeSyncStatus | null>(null);
    const [eco, setEco] = React.useState(false);
    const [contadores, setContadores] = React.useState({ hoy: 0, presupuesto: 0, frenoRemoto: false });
    const aviso = React.useSyncExternalStore(suscribirConsumo, leerAvisoConsumo, avisoConsumoServidor);
    const freno = useFreno();
    const bateriaRef = React.useRef<Awaited<ReturnType<NonNullable<Nav["getBattery"]>>> | null>(null);
    const ultimoAlmacen = React.useRef(0);

    const medir = React.useCallback(() => {
        const nav = navigator as Nav;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        const b = bateriaRef.current;
        const c = leerContadores();
        setContadores({ hoy: c.hoy, presupuesto: c.presupuestoDia, frenoRemoto: c.frenoRemoto });
        setEco(getPerfMode() === "eco" || document.documentElement.dataset.perf === "eco");
        setLocal((p) => ({
            ...p,
            enLinea: navigator.onLine,
            red: nav.connection ? { tipo: nav.connection.effectiveType, mbps: nav.connection.downlink, rtt: nav.connection.rtt } : null,
            bateria: b ? { nivel: b.level, cargando: b.charging } : null,
            memoria: mem ? { usadoMB: mem.usedJSHeapSize / 1048576, limiteMB: mem.jsHeapSizeLimit / 1048576 } : null,
        }));
        setMedida(true);
        if (Date.now() - ultimoAlmacen.current > ALMACEN_MS && navigator.storage?.estimate) {
            ultimoAlmacen.current = Date.now();
            Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? Promise.resolve(null)])
                .then(([e, persistente]) => setLocal((p) => ({ ...p, almacen: typeof e.quota === "number" ? { usado: e.usage ?? 0, cuota: e.quota, persistente } : null })))
                .catch(() => { /* sin API */ });
        }
    }, []);

    // Sincronía: eventos locales, sin red.
    React.useEffect(() => { setSync(getRealtimeSyncStatus()); return onRealtimeSyncStatus(setSync); }, []);

    // Batería, red y modo de rendimiento: eventos; más una medición cada 30 s mientras se ve.
    React.useEffect(() => {
        if (!visible) return;
        const nav = navigator as Nav;
        let vivo = true;
        const alCambiar = () => vivo && medir();
        nav.getBattery?.().then((b) => {
            if (!vivo) return;
            bateriaRef.current = b;
            b.addEventListener("levelchange", alCambiar);
            b.addEventListener("chargingchange", alCambiar);
            medir();
        }).catch(() => { /* sin API */ });
        medir();
        window.addEventListener("online", alCambiar);
        window.addEventListener("offline", alCambiar);
        window.addEventListener(PERF_CHANGED_EVENT, alCambiar);
        nav.connection?.addEventListener?.("change", alCambiar);
        const id = window.setInterval(alCambiar, MEDIR_MS);
        return () => {
            vivo = false;
            window.clearInterval(id);
            window.removeEventListener("online", alCambiar);
            window.removeEventListener("offline", alCambiar);
            window.removeEventListener(PERF_CHANGED_EVENT, alCambiar);
            nav.connection?.removeEventListener?.("change", alCambiar);
            bateriaRef.current?.removeEventListener("levelchange", alCambiar);
            bateriaRef.current?.removeEventListener("chargingchange", alCambiar);
        };
    }, [visible, medir]);

    // Neuronas: listNeurons ya respeta el freno y su caché de 5 min; aquí, además, solo a la vista.
    React.useEffect(() => {
        if (!visible) return;
        let vivo = true;
        const leer = () => listNeurons()
            .then((ns) => vivo && setLocal((p) => ({ ...p, neuronas: { en: ns.filter((n) => n.online).length, total: ns.length } })))
            .catch(() => vivo && setLocal((p) => ({ ...p, neuronas: null })));
        void leer();
        const id = window.setInterval(leer, NEURONAS_MS);
        return () => { vivo = false; window.clearInterval(id); };
    }, [visible]);

    const senales: Senales = {
        ...local,
        sync: sync?.state ?? null,
        ultimoCambio: sync?.lastChangeAt ?? null,
        eco,
        consumo: {
            corte: aviso.corte, corteHasta: aviso.corteHasta, frenoLocalHasta: aviso.frenoLocalHasta, diaAgotado: aviso.diaAgotado,
            frenoRemoto: freno.activo || contadores.frenoRemoto, hoy: contadores.hoy, presupuesto: contadores.presupuesto,
        },
    };
    return { senales, medir, medida };
}

const ICONO: Record<Diagnostico["clave"], LucideIcon> = { red: Wifi, sync: RefreshCw, consumo: Gauge, almacen: HardDrive, bateria: BatteryMedium, neuronas: Network, memoria: Cpu };
function iconoDe(d: Diagnostico): LucideIcon {
    if (d.clave === "red" && d.nivel === "mal") return WifiOff;
    if (d.clave === "bateria" && d.detalle.startsWith("Cargando")) return BatteryCharging;
    if (d.clave === "bateria" && d.nivel !== "bien" && d.nivel !== "sin-dato") return BatteryLow;
    return ICONO[d.clave];
}
const ICONO_SALUD = { bien: ShieldCheck, atencion: AlertTriangle, mal: OctagonAlert } as const;
const PALABRA = { bien: "En orden", atencion: "Atención", mal: "Revisa" } as const;

/** El anillo de salud: un segmento por señal, del color de su estado. */
function AnilloSalud({ d, tam, general, conPalabra }: { d: Diagnostico[]; tam: number; general: "bien" | "atencion" | "mal"; conPalabra: boolean }) {
    const n = Math.max(1, d.length), hueco = n > 1 ? 7 : 0, grosor = Math.max(4, tam * 0.075), r = (tam - grosor) / 2 - 2, c = tam / 2;
    const punto = (a: number): [number, number] => [c + r * Math.sin((a * Math.PI) / 180), c - r * Math.cos((a * Math.PI) / 180)];
    const Icono = ICONO_SALUD[general];
    return (
        <div className="relative grid shrink-0 place-items-center" style={{ width: tam, height: tam }} role="img"
            aria-label={`Salud de esta neurona: ${d.map((x) => `${x.nombre} ${x.valor}`).join(", ")}`}>
            <svg aria-hidden width={tam} height={tam} className="absolute inset-0 overflow-visible">
                <circle cx={c} cy={c} r={r * 0.78} fill={COLOR_NIVEL[general]} opacity={0.08} />
                {d.map((x, i) => {
                    const a0 = (i / n) * 360 + hueco / 2, a1 = ((i + 1) / n) * 360 - hueco / 2;
                    const [x0, y0] = punto(a0), [x1, y1] = punto(a1);
                    return (
                        <path key={x.clave} d={`M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`}
                            fill="none" stroke={COLOR_NIVEL[x.nivel]} strokeWidth={grosor} strokeLinecap="round" opacity={x.nivel === "sin-dato" ? 0.45 : 0.95}
                            style={{ filter: x.nivel === "mal" ? `drop-shadow(0 0 6px ${COLOR_NIVEL.mal})` : undefined }}>
                            <title>{`${x.nombre}: ${x.valor}`}</title>
                        </path>
                    );
                })}
            </svg>
            <div className="relative flex flex-col items-center text-center">
                <Icono aria-hidden className={general === "mal" ? "ss-latir" : undefined} style={{ width: tam * 0.26, height: tam * 0.26, color: COLOR_NIVEL[general] }} />
                {conPalabra && <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/65">{PALABRA[general]}</span>}
            </div>
        </div>
    );
}

function FilaSenal({ d, conDetalle, conBarra, tactil, onArreglar, ocupado }: {
    d: Diagnostico; conDetalle: boolean; conBarra: boolean; tactil: boolean; onArreglar: (a: Arreglo) => void; ocupado: Arreglo | null;
}) {
    const Icono = iconoDe(d), color = COLOR_NIVEL[d.nivel];
    return (
        <li className="flex min-w-0 items-start gap-2.5">
            <span aria-hidden className="ss-redondo mt-0.5 grid size-7 shrink-0 place-items-center rounded-full" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55` }}>
                <Icono className="size-3.5" style={{ color }} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-white/90">{d.nombre}</span>
                    <span className="shrink-0 text-[12px] tabular-nums" style={{ color: d.nivel === "sin-dato" ? "rgba(255,255,255,.45)" : color }}>{d.valor}</span>
                </div>
                {conDetalle && <p className="truncate text-[11.5px] text-white/55" title={d.detalle}>{d.detalle}</p>}
                {conBarra && d.progreso !== null && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(3, d.progreso * 100)}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
                    </div>
                )}
                {d.arreglo && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {d.arreglo.accion === "entrar"
                            ? <Accion color={color} href="/login" grande={tactil}>{d.arreglo.etiqueta}</Accion>
                            : <Accion color={color} grande={tactil} onClick={() => onArreglar(d.arreglo!.accion)} disabled={!!d.arreglo.bloqueado || ocupado === d.arreglo.accion}
                                title={d.arreglo.bloqueado ?? d.detalle}>{ocupado === d.arreglo.accion ? "Un momento…" : d.arreglo.etiqueta}</Accion>}
                        {d.arreglo.bloqueado && conDetalle && <span className="text-[11px] text-white/50">{d.arreglo.bloqueado}</span>}
                    </div>
                )}
            </div>
        </li>
    );
}

export function EstadoSistemaLibre() {
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const { senales, medir, medida } = useSenales(visible);
    const [ocupado, setOcupado] = React.useState<Arreglo | null>(null);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [senales.consumo.hoy, senales.sync, senales.bateria?.nivel, senales.enLinea]);

    const diag = diagnosticar(senales, ahora || Date.now());
    const general = saludGeneral(diag);
    const frase = titular(diag);
    const graves = porGravedad(diag);
    const color = COLOR_NIVEL[general];

    const arreglar = async (a: Arreglo) => {
        setOcupado(a);
        try {
            if (a === "sincronizar") await syncNow();
            else if (a === "activar-sync") setRealtimeSyncEnabled(true);
            else if (a === "persistir") await navigator.storage?.persist?.();
            else if (a === "modo-eco") setPerfMode("eco");
            else if (a === "salir-eco") setPerfMode("auto");
        } catch { /* el siguiente latido lo vuelve a medir */ } finally {
            setOcupado(null);
            medir();
        }
    };
    const fila = (d: Diagnostico, o: { detalle: boolean; barra: boolean }) => (
        <FilaSenal key={d.clave} d={d} conDetalle={o.detalle} conBarra={o.barra} tactil={tactil} onArreglar={arreglar} ocupado={ocupado} />
    );
    const peorArreglo = graves.find((d) => d.arreglo && d.nivel !== "bien");

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={color} acento2="#7c5cff" etiqueta={`Estado del sistema: ${frase}`} intensidad={0.4}>
                {({ clase: medida_, ancho, alto }) => {
                    const clase = forzada ?? medida_;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    if (!medida) return <div className="flex h-full items-center justify-center text-[12px] text-white/60" role="status"><Activity aria-hidden className="mr-1.5 size-3.5" />midiendo…</div>;

                    // ── micro ──
                    if (b === "micro") {
                        const Icono = ICONO_SALUD[general];
                        return (
                            <div className="flex h-full items-center justify-center" data-diseno="micro" title={frase}>
                                <span className="ss-respirar ss-redondo grid place-items-center rounded-full" role="img" aria-label={frase}
                                    style={{ width: lado * 0.64, height: lado * 0.64, background: `radial-gradient(circle at 35% 30%, ${color}aa, ${color}33 60%, transparent 75%)`, boxShadow: `0 0 22px ${color}55, inset 0 0 0 1px ${color}88` }}>
                                    <Icono aria-hidden className="text-white" style={{ width: lado * 0.24, height: lado * 0.24 }} />
                                </span>
                            </div>
                        );
                    }

                    // ── s ──
                    if (b === "s") {
                        return (
                            <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center" data-diseno="s">
                                <AnilloSalud d={diag} tam={lado * 0.48} general={general} conPalabra={false} />
                                <span className="line-clamp-2 text-[12.5px] font-medium leading-tight text-white/90">{frase}</span>
                                {peorArreglo?.arreglo && peorArreglo.arreglo.accion !== "entrar" && (
                                    <Accion color={COLOR_NIVEL[peorArreglo.nivel]} grande={tactil} onClick={() => arreglar(peorArreglo.arreglo!.accion)} disabled={!!peorArreglo.arreglo.bloqueado} title={peorArreglo.arreglo.bloqueado}>
                                        {peorArreglo.arreglo.etiqueta}
                                    </Accion>
                                )}
                            </div>
                        );
                    }

                    // ── panorámico ──
                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <AnilloSalud d={diag} tam={Math.min(alto * 0.8, 110)} general={general} conPalabra={alto >= 110} />
                                <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                    {graves.map((d) => (
                                        <li key={d.clave} className="ss-redondo flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]" title={d.detalle}
                                            style={{ background: `${COLOR_NIVEL[d.nivel]}1a`, boxShadow: `inset 0 0 0 1px ${COLOR_NIVEL[d.nivel]}44` }}>
                                            <span className="text-white/75">{d.nombre}</span><span className="tabular-nums" style={{ color: d.nivel === "sin-dato" ? "#94a3b8" : COLOR_NIVEL[d.nivel] }}>{d.valor}</span>
                                        </li>
                                    ))}
                                </ul>
                                {peorArreglo?.arreglo && peorArreglo.arreglo.accion !== "entrar" && (
                                    <Accion color={COLOR_NIVEL[peorArreglo.nivel]} grande={tactil} onClick={() => arreglar(peorArreglo.arreglo!.accion)} disabled={!!peorArreglo.arreglo.bloqueado}>{peorArreglo.arreglo.etiqueta}</Accion>
                                )}
                            </div>
                        );
                    }

                    // ── m / torre ──
                    if (b === "m") {
                        const apaisado = ancho >= alto * 1.3;
                        const conAccion = graves.slice(0, 3).some((d) => d.arreglo);
                        const filas = clase === "torre" ? Math.max(3, Math.floor((alto - lado * 0.6 - 60) / 34)) : apaisado ? Math.max(3, Math.floor((alto - (conAccion ? 60 : 24)) / 36)) : conAccion ? 2 : 3;
                        // Las filas que no caben se retiran enteras (de la última a la primera) en vez de
                        // salirse de la tarjeta: este widget no tiene marco que las recorte.
                        const lista = graves.slice(0, filas);
                        const cuerpo = (
                            <PilaAjustable niveles={Math.max(1, lista.length - 1)} className="min-h-0 flex-1">
                                <ul className="my-auto flex min-w-0 flex-col gap-2">
                                    {lista.map((d, i) => i === 0 ? fila(d, { detalle: false, barra: apaisado }) : <Prescindible key={d.clave} nivel={lista.length - i}>{fila(d, { detalle: false, barra: apaisado })}</Prescindible>)}
                                </ul>
                            </PilaAjustable>
                        );
                        if (apaisado) {
                            return (
                                <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="m-fila">
                                    <div className="flex shrink-0 flex-col items-center gap-1.5">
                                        <AnilloSalud d={diag} tam={Math.min(alto * 0.56, 130) * k} general={general} conPalabra />
                                    </div>
                                    <div className="flex h-full min-w-0 flex-1 flex-col gap-2 py-3"><span className="line-clamp-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60" title={frase}>{frase}</span>{cuerpo}</div>
                                </div>
                            );
                        }
                        // Todo en una pila: se retiran primero las filas de abajo y, si aún no cabe la
                        // primera con su botón, el anillo (antes «Sincronizar ahora» quedaba cortado).
                        return (
                            <PilaAjustable niveles={lista.length + 1} className="items-center gap-2 px-3 py-3" data-diseno={clase === "torre" ? "torre" : "m"}>
                                <div className="my-auto flex w-full flex-col items-center gap-2">
                                    <Prescindible nivel={lista.length}><AnilloSalud d={diag} tam={Math.min(lado * (clase === "torre" ? 0.5 : 0.32), 110) * k} general={general} conPalabra={false} /></Prescindible>
                                    <span className="line-clamp-2 shrink-0 text-center text-[12.5px] font-medium text-white/90" title={frase}>{frase}</span>
                                    <ul className="flex w-full min-w-0 flex-col gap-2">
                                        {lista.map((d, i) => i === 0 ? fila(d, { detalle: false, barra: apaisado }) : <Prescindible key={d.clave} nivel={lista.length - i}>{fila(d, { detalle: false, barra: apaisado })}</Prescindible>)}
                                    </ul>
                                </div>
                            </PilaAjustable>
                        );
                    }

                    // ── l / xl ──
                    const dos = b === "xl" && ancho >= 560;
                    const tam = Math.min(alto * 0.5, dos ? 170 : 140, ancho * 0.3) * k;
                    return (
                        <div className="flex h-full w-full items-center gap-5 px-4 py-3" data-diseno={`${b}-completo`}>
                            <div className="flex shrink-0 flex-col items-center gap-2" style={{ width: tam + 12 }}>
                                <AnilloSalud d={diag} tam={tam} general={general} conPalabra />
                                <span className="line-clamp-3 text-center text-[12.5px] font-medium leading-tight text-white/90" title={frase}>{frase}</span>
                                <Link href="/servidores" className="cursor-pointer text-[11px] text-white/50 underline-offset-4 hover:text-white hover:underline">Cuenta y servidores</Link>
                            </div>
                            {(() => {
                                const lista = graves.slice(0, dos ? 8 : Math.max(3, Math.floor((alto - 20) / 48)));
                                return (
                                    <PilaAjustable niveles={Math.max(1, lista.length - 1)} className="min-w-0 flex-1">
                                        <ul className={`my-auto grid min-w-0 gap-x-5 gap-y-2.5 ${dos ? "grid-cols-2" : "grid-cols-1"}`}>
                                            {lista.map((d, i) => i === 0 ? fila(d, { detalle: true, barra: true }) : <Prescindible key={d.clave} nivel={lista.length - i}>{fila(d, { detalle: true, barra: true })}</Prescindible>)}
                                        </ul>
                                    </PilaAjustable>
                                );
                            })()}
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default EstadoSistemaLibre;
