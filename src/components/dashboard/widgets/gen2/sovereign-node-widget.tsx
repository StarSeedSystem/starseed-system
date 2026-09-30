'use client';

// ════════════════════════════════════════════════════════════════
// Nodo soberano — tu neurona y tu red personal (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: CPU, RAM y «pares IPFS» inventados cada 2,5 s. Ahora, datos REALES:
//   · ESTE dispositivo, medido en el navegador sin red: almacenamiento usado/cuota,
//     batería, conexión (tipo, bajada, latencia), núcleos, memoria, GPU, app instalada.
//     Batería y conexión se escuchan por eventos (sin sondeo). El navegador no da el uso
//     de CPU: se enseña la capacidad, nunca una carga inventada.
//   · TUS neuronas (`listNeurons()`, con su caché compartida de 5 min del contrato de
//     consumo): cuántas hay, cuáles están en línea y cuáles tienen IA local.
// Invariante (§6): identidad soberana — la infraestructura es del usuario.
//
//   micro      → el cristal del nodo con tus neuronas en línea.
//   s          → cristal con los arcos de almacén, batería y red.
//   m          → + tres cifras y «Neuronas».
//   panorámico → cristal · cifras · neuronas, en una fila.   torre → en columna.
//   l          → + la lista de tus neuronas.
//   xl         → + la ficha de este dispositivo (plataforma, navegador, GPU, núcleos…).
// Estados honestos: cargando (midiendo), error con reintento y vacío (solo este dispositivo).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Server, RefreshCw, Monitor, Laptop, Smartphone, Tablet, Cpu, Settings2, type LucideIcon } from "lucide-react";
import { WidgetShell, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido } from "./_paquete-b/cache-compartida";
import { calidadRed, escucharNodo, gb, medirNodo, usoAlmacen, type MedidaNodo } from "./_paquete-b/datos-nodo";
import { AccionB, GlifoMicroB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#94a3b8", acento2: "#23d5ab" };
const ALMACEN = "#23d5ab";
const BATERIA = "#10b981";
const RED = "#38bdf8";

interface NeuronaBreve { id: string; nombre: string; tipo: string; enLinea: boolean; esEste: boolean; iaLocal: boolean }

async function cargarNeuronas(): Promise<NeuronaBreve[]> {
    const { listNeurons } = await import("@/lib/neurons/neurons");
    const lista = await listNeurons();
    return lista.map((n) => ({
        id: n.id,
        nombre: n.name,
        tipo: n.kind,
        enLinea: !!n.online,
        esEste: !!n.isThisDevice,
        iaLocal: !!(n.capabilities?.ollama || n.capabilities?.lmstudio || n.capabilities?.webgpu || n.capabilities?.astraura158?.online),
    }));
}

const ICONO_TIPO: Record<string, LucideIcon> = { desktop: Monitor, laptop: Laptop, mobile: Smartphone, tablet: Tablet, server: Server };

/** Este dispositivo, medido al montar y re-medido con cada evento de batería o red. */
function useMedida(): { medida: MedidaNodo | null; error: string | null; medir: () => void } {
    const [medida, setMedida] = useState<MedidaNodo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const medir = useCallback(() => {
        medirNodo().then((m) => { setMedida(m); setError(null); }).catch(() => setError("No se pudo medir este dispositivo."));
    }, []);
    useEffect(() => {
        medir();
        return escucharNodo(medir);
    }, [medir]);
    return { medida, error, medir };
}

export function SovereignNodeWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const { medida, error, medir } = useMedida();
    const neuronas = useDatoCompartido<NeuronaBreve[]>(ready ? `neuronas.v1.${uid ?? "anon"}` : null, cargarNeuronas, { ttlMs: 5 * 60_000, persistir: false });
    const recargar = useCallback(() => { medir(); neuronas.recargar(); }, [medir, neuronas]);
    return (
        <WidgetShell
            title="Nodo soberano"
            subtitle="Tu neurona y tu red"
            icon={Server}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={recargar} aria-label="Volver a medir el nodo"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", !medida && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} medida={medida} error={error} medir={medir} neuronas={neuronas.dato} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, medida, error, medir, neuronas }: { size: ElementSize; medida: MedidaNodo | null; error: string | null; medir: () => void; neuronas: NeuronaBreve[] | null }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!medida) {
        contenido = error ? <WidgetErrorState message={error} onRetry={medir} /> : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else {
        contenido = <Composicion m={medida} neuronas={neuronas} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ m, neuronas, lienzo }: { m: MedidaNodo; neuronas: NeuronaBreve[] | null; lienzo: LienzoB }) {
    const b = lienzo.base;
    const total = neuronas?.length ?? 1;
    const enLinea = neuronas ? neuronas.filter((n) => n.enLinea || n.esEste).length : 1;
    const frase = `${enLinea} de ${total} ${total === 1 ? "neurona" : "neuronas"} en línea${m.enLinea ? "" : " · este dispositivo sin conexión"}`;
    const cristal = (lado: number) => <Cristal m={m} lado={lado} enLinea={enLinea} total={total} lienzo={lienzo} etiqueta={frase} />;

    // (Pulido 0930) El cristal se mide por la tesela: a 76 px fijos se salía de una de 65 de alto.
    if (b === "micro") return <GlifoMicroB>{(l) => cristal(l)}</GlifoMicroB>;

    const cifras = (vertical: boolean) => <Cifras m={m} vertical={vertical} />;
    const acciones = (
        <div className="flex flex-wrap items-center gap-1.5">
            <AccionB href="/cuenta" icono={Settings2} color={lienzo.acento2} tono="llena" tactil={lienzo.tactil}>Neuronas</AccionB>
            {(b === "l" || b === "xl") && <AccionB href="/servidores" icono={Server} color={lienzo.acento} tactil={lienzo.tactil}>Servidores</AccionB>}
        </div>
    );
    const lista = (max: number) => <ListaNeuronas neuronas={neuronas} max={max} lienzo={lienzo} />;
    const lado = (fr: number) => Math.max(72, Math.min(lienzo.tv ? 200 : 170, fr));

    if (b === "s") return <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">{cristal(92)}<p className="text-[12px] text-white/70">{frase}</p></div>;
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1fr)" }}>
                {cristal(96)}
                {cifras(true)}
                {lista(2)}
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="flex min-h-0 flex-1 items-center gap-3">{cristal(104)}{cifras(true)}</div>
                {acciones}
            </div>
        );
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="flex items-center gap-3">{cristal(lado(120))}{cifras(true)}</div>
                <RotuloB>{frase}</RotuloB>
                {lista(b === "l" ? 3 : 4)}
                <div className="mt-auto">{acciones}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col items-center gap-3">
                {cristal(lado(180))}
                {cifras(false)}
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                <RotuloB>{frase}</RotuloB>
                {lista(5)}
                <Ficha m={m} />
                <div className="mt-auto">{acciones}</div>
            </div>
        </div>
    );
}

/** El cristal del nodo: arcos de almacén, batería y red alrededor de un núcleo facetado. */
function Cristal({ m, lado, enLinea, total, lienzo, etiqueta }: { m: MedidaNodo; lado: number; enLinea: number; total: number; lienzo: LienzoB; etiqueta: string }) {
    const id = useId().replace(/:/g, "");
    const arcos: { v: number | null; color: string; r: number; nombre: string }[] = [
        { v: usoAlmacen(m), color: ALMACEN, r: 44, nombre: "almacén" },
        { v: m.bateria ? m.bateria.nivel / 100 : null, color: BATERIA, r: 38, nombre: "batería" },
        { v: calidadRed(m), color: RED, r: 32, nombre: "red" },
    ];
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" aria-label={etiqueta} className="shrink-0 overflow-visible">
            <defs>
                <linearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento2, 0.55)} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.55} />
                </linearGradient>
            </defs>
            {arcos.map((a) => {
                const c = 2 * Math.PI * a.r;
                return (
                    <g key={a.nombre}>
                        <circle cx={50} cy={50} r={a.r} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={3.2} />
                        {a.v !== null && (
                            <circle cx={50} cy={50} r={a.r} fill="none" stroke={a.color} strokeWidth={3.2} strokeLinecap="round"
                                strokeDasharray={`${(c * Math.max(0.01, a.v)).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 50 50)" opacity={0.9}>
                                <title>{`${a.nombre}: ${Math.round(a.v * 100)} %`}</title>
                            </circle>
                        )}
                    </g>
                );
            })}
            <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: "120s" }}>
                <polygon points="50,28 69,39 69,61 50,72 31,61 31,39" fill={`url(#c${id})`} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.8} />
                <polyline points="31,39 50,50 69,39 M50,50 50,72" fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={0.6} />
            </g>
            <text x={50} y={49} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fontSize={12} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>{enLinea}/{total}</text>
            <text x={50} y={60} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fillOpacity={0.75} fontSize={5.5} fontWeight={700} letterSpacing=".08em">EN LÍNEA</text>
            {!m.enLinea && <circle cx={84} cy={16} r={4} fill="#f43f5e" className={vivo ? estilosB.latido : undefined}><title>Sin conexión</title></circle>}
        </svg>
    );
}

function Cifras({ m, vertical }: { m: MedidaNodo; vertical: boolean }) {
    const alm = usoAlmacen(m);
    const items = [
        { color: ALMACEN, etiqueta: "Almacén", valor: alm === null ? "—" : `${Math.round(alm * 100)} %`, detalle: m.almacenCuotaGb ? `${gb(m.almacenUsadoGb)} de ${gb(m.almacenCuotaGb)}` : "sin dato" },
        { color: BATERIA, etiqueta: "Batería", valor: m.bateria ? `${m.bateria.nivel} %` : "—", detalle: m.bateria ? (m.bateria.cargando ? "cargando" : "sin cargar") : "sin dato" },
        { color: RED, etiqueta: "Red", valor: !m.enLinea ? "sin red" : m.conexion?.tipo?.toUpperCase() ?? "en línea", detalle: m.conexion?.bajadaMbps != null ? `↓ ${m.conexion.bajadaMbps} Mbps · ${m.conexion.latenciaMs ?? "—"} ms` : m.enLinea ? "conectada" : "sin conexión" },
    ];
    return (
        <dl className={cn("grid min-w-0 gap-2", vertical ? "grid-cols-1" : "w-full grid-cols-3")}>
            {items.map((it) => (
                <div key={it.etiqueta} className={cn("min-w-0", vertical && "flex items-baseline gap-2")}>
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">
                        <span className="size-1.5 rounded-full" style={{ background: it.color }} aria-hidden />{it.etiqueta}
                    </dt>
                    <dd className="min-w-0">
                        <span className="text-[16px] font-light tabular-nums text-white">{it.valor}</span>
                        <span className="ml-1.5 text-[11px] text-white/50 line-clamp-1">{it.detalle}</span>
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function ListaNeuronas({ neuronas, max, lienzo }: { neuronas: NeuronaBreve[] | null; max: number; lienzo: LienzoB }) {
    if (!neuronas) return <p className="text-[11px] text-white/50">Buscando tus neuronas…</p>;
    if (neuronas.length <= 1) return <p className="text-[12px] text-white/60">Solo este dispositivo por ahora: entra con tu cuenta en otro y se unirá a tu red.</p>;
    return (
        <ul className="flex min-h-0 flex-col gap-0.5" aria-label="Tus neuronas">
            {neuronas.slice(0, max).map((n) => {
                const Icono = ICONO_TIPO[n.tipo] ?? Cpu;
                return (
                    <li key={n.id} className={cn("flex items-center gap-2 text-[12px]", lienzo.tactil ? "min-h-11" : "min-h-7")}>
                        <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06]" aria-hidden>
                            <Icono className="size-3.5 text-white/75" />
                            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[#0c0e22]" style={{ background: n.enLinea || n.esEste ? "#10b981" : "#475569" }} />
                        </span>
                        <span className="min-w-0 flex-1 text-white/85 line-clamp-1" title={n.nombre}>{n.nombre}</span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-white/50">{n.esEste ? "este" : n.enLinea ? "en línea" : "dormida"}{n.iaLocal ? " · IA" : ""}</span>
                    </li>
                );
            })}
            {neuronas.length > max && <li className="text-[11px] text-white/45">+{neuronas.length - max} más</li>}
        </ul>
    );
}

function Ficha({ m }: { m: MedidaNodo }) {
    const filas: [string, string][] = [
        ["Plataforma", `${m.plataforma} · ${m.navegador}`],
        ["Núcleos", m.nucleos ? String(m.nucleos) : "—"],
        ["Memoria", m.memoriaGb ? `≥ ${m.memoriaGb} GB` : "—"],
        ["GPU", m.gpu ?? (m.webgpu ? "WebGPU disponible" : "—")],
        ["App", m.appInstalada ? "instalada" : "en el navegador"],
    ];
    return (
        <dl className="grid gap-x-3 gap-y-0.5 text-[11px]" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }} aria-label="Este dispositivo">
            {filas.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-white/50">{k}</dt>
                    <dd className="text-white/80 line-clamp-1" title={v}>{v}</dd>
                </div>
            ))}
        </dl>
    );
}
