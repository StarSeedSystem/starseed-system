'use client';

// ════════════════════════════════════════════════════════════════
// Córtex Astraura — lo que tu exocórtex ve ahora (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: sugerencias inventadas («pausa», «investigar») con confianzas de adorno. Ahora,
// AVISOS REALES derivados de lo que el OS ya sabe de ti (y comparte por caché con los demás
// widgets, sin peticiones propias extra): votaciones que te faltan, delegaciones que caducan,
// la Semilla moviéndose y el mérito que espera aval. Más la franja REAL de los cinco
// sistemas de esta neurona (LLM · Astraura · Voz · Cerebro · Señales) que abre su
// configuración. Invariante (§3): el Exocórtex es tuyo y te sirve a ti.
//
//   micro      → el orbe con cuántos avisos hay.
//   s          → orbe + el aviso más importante.
//   m          → la lista de avisos con su acción y «Hablar con Astraura».
//   panorámico → orbe · avisos · sistemas, en una fila.   torre → en columna.
//   l          → + los cinco sistemas de la neurona.
//   xl         → orbe grande, todos los avisos y los sistemas con su valor.
// Estados honestos: cargando, error con reintento y vacío («todo en calma»).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { BrainCircuit, Vote, Network, Sprout, Award, MessageCircle, X, type LucideIcon } from "lucide-react";
import { WidgetShell, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido } from "./_paquete-b/cache-compartida";
import { cargarAgora, cargarDelegaciones, type DatosAgora, type DatosDelegacion } from "./_paquete-b/datos-civicos";
import { cargarMercado, type DatosMercado } from "./_paquete-b/datos-economia";
import { cargarMerito, type DatosMerito } from "./_paquete-b/datos-merito";
import { avisosCortex, type AvisoCortex, type TipoAviso } from "./_paquete-b/cortex";
import { AccionB, RaizB, RotuloB, estilosB, tintaB, useAhoraB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#22d3ee", acento2: "#7c5cff" };
const ICONO: Record<TipoAviso, LucideIcon> = { voto: Vote, delegacion: Network, mercado: Sprout, merito: Award };
const COLOR: Record<TipoAviso, string> = { voto: "#ff5c7a", delegacion: "#23d5ab", mercado: "#10b981", merito: "#a78bfa" };

/** Valores REALES abreviados de los 5 sistemas de la neurona (A149). */
interface Sistemas { llm: string; astraura: string; voz: string; cerebro: string; senales: string }
const FRANJA: ReadonlyArray<readonly [pestana: string, etiqueta: string, clave: keyof Sistemas, color: string]> = [
    ["llm", "LLM", "llm", "#22d3ee"],
    ["astraura", "Astraura", "astraura", "#fbbf24"],
    ["openvoice", "Voz", "voz", "#e879f9"],
    ["cerebro", "Cerebro", "cerebro", "#a78bfa"],
    ["senales", "Señales", "senales", "#34d399"],
];

/** Resolución real de la capa neurona×personalidad (import perezoso; si falta, no se pinta). */
function useSistemas(): Sistemas | null {
    const [s, setS] = useState<Sistemas | null>(null);
    useEffect(() => {
        let vivo = true;
        let soltar: (() => void) | null = null;
        void (async () => {
            try {
                const mod = await import("@/lib/astraura/neuron-persona-systems");
                const calcular = () => {
                    try {
                        const r = mod.resolvePersonaSystems(mod.ALL_PERSONAS, undefined, null);
                        const cerradas = Object.values(r.senales.porAntena).filter((x) => !x.enabled || !x.salida).length;
                        if (!vivo) return;
                        setS({
                            llm: r.llm.modelo || r.llm.fuente || "Auto",
                            astraura: r.astraura.modo === "fija" ? "Fija" : "Auto",
                            voz: String(r.voz.motor),
                            cerebro: !r.cerebro.usarMemorias ? "sin memorias" : r.cerebro.almacen === "auto" ? "memorias ON" : r.cerebro.almacen,
                            senales: cerradas === 0 ? "abiertas" : `${cerradas} cerrada(s)`,
                        });
                    } catch { /* best-effort */ }
                };
                calcular();
                soltar = mod.subscribeNeuronPersona(calcular);
            } catch { /* módulo no disponible */ }
        })();
        return () => { vivo = false; soltar?.(); };
    }, []);
    return s;
}

function abrirSistemas(pestana: string) {
    void import("@/lib/astraura/config-ui").then((m) => m.openAstrauraConfig(pestana)).catch(() => { /* */ });
}

export function AstrauraCortexWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const u = uid ?? "anon";
    const cA = useCallback(() => cargarAgora(uid), [uid]);
    const cD = useCallback(() => cargarDelegaciones(uid), [uid]);
    const cM = useCallback(() => cargarMerito(uid), [uid]);
    const agora = useDatoCompartido<DatosAgora>(ready ? `agora.v1.${u}` : null, cA);
    const delegacion = useDatoCompartido<DatosDelegacion>(ready ? `delegacion.v1.${u}` : null, cD, { ttlMs: 15 * 60_000 });
    const mercado = useDatoCompartido<DatosMercado>("mercado.v1", cargarMercado);
    const merito = useDatoCompartido<DatosMerito>(ready ? `merito.v1.${u}` : null, cM, { ttlMs: 30 * 60_000 });
    const sistemas = useSistemas();
    const fuentes = [agora, delegacion, mercado, merito];
    const cargando = fuentes.every((f) => f.estado === "cargando");
    const fallo = fuentes.every((f) => f.estado === "error");
    const recargar = useCallback(() => { agora.recargar(); delegacion.recargar(); mercado.recargar(); merito.recargar(); }, [agora, delegacion, mercado, merito]);

    return (
        <WidgetShell title="Córtex Astraura" subtitle="Tu exocórtex" icon={BrainCircuit} bare={marco?.base === "micro"}>
            {(size) => (
                <Cuerpo size={size} cargando={cargando} fallo={fallo} recargar={recargar} sistemas={sistemas}
                    datos={{ agora: agora.dato, delegacion: delegacion.dato, mercado: mercado.dato, merito: merito.dato }} />
            )}
        </WidgetShell>
    );
}

function Cuerpo({ size, cargando, fallo, recargar, sistemas, datos }: {
    size: ElementSize; cargando: boolean; fallo: boolean; recargar: () => void; sistemas: Sistemas | null;
    datos: Parameters<typeof avisosCortex>[0];
}) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(60_000, visible);
    const [descartados, setDescartados] = useState<Set<string>>(() => new Set());
    const avisos = useMemo(() => (ahora ? avisosCortex(datos, ahora).filter((a) => !descartados.has(a.id)) : []), [datos, ahora, descartados]);
    const descartar = useCallback((id: string) => setDescartados((s) => new Set(s).add(id)), []);

    let contenido: ReactNode;
    if (fallo) contenido = <WidgetErrorState message="Tu exocórtex no pudo leer tus datos ahora." onRetry={recargar} />;
    else if (cargando || !ahora) contenido = <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "list"} rows={3} />;
    else contenido = <Composicion avisos={avisos} sistemas={sistemas} lienzo={lienzo} descartar={descartar} />;
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ avisos, sistemas, lienzo, descartar }: { avisos: AvisoCortex[]; sistemas: Sistemas | null; lienzo: LienzoB; descartar: (id: string) => void }) {
    const b = lienzo.base;
    const frase = avisos.length === 0 ? "Todo en calma: nada requiere tu atención" : avisos.length === 1 ? "Un aviso de tu exocórtex" : `${avisos.length} avisos de tu exocórtex`;
    const orbe = (lado: number) => <Orbe lado={lado} n={avisos.length} urgente={avisos.some((a) => a.prioridad === 0)} lienzo={lienzo} etiqueta={frase} />;
    const hablar = <AccionB href="/agent" icono={MessageCircle} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Hablar con Astraura</AccionB>;
    const calma = <p className="text-[12px] leading-relaxed text-white/65">Todo en calma: no te falta ninguna votación, tus delegaciones siguen vigentes y tu mérito está al día.</p>;
    const lista = (max: number, compacta = false) => avisos.length === 0 ? calma : (
        <ul className="flex min-h-0 flex-col gap-1" aria-label="Avisos del exocórtex">
            {avisos.slice(0, max).map((a) => <Aviso key={a.id} a={a} lienzo={lienzo} compacta={compacta} descartar={descartar} />)}
        </ul>
    );

    if (b === "micro") return <a href="/agent" aria-label={`${frase}. Hablar con Astraura`} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>{orbe(76)}</a>;
    if (b === "s") {
        const a = avisos[0];
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 text-center">
                {orbe(64)}
                <p className="text-[12px] font-semibold leading-snug text-white/85 line-clamp-2">{a ? a.texto : "Todo en calma"}</p>
            </div>
        );
    }
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1.4fr) minmax(0, 1fr)" }}>
                {orbe(88)}
                {lista(2, true)}
                <FranjaSistemas s={sistemas} lienzo={lienzo} vertical />
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2"><RotuloB>{frase}</RotuloB>{lista(2, true)}<div className="mt-auto">{hablar}</div></div>;
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="flex items-center gap-3">{orbe(64)}<RotuloB className="whitespace-normal">{frase}</RotuloB></div>
                {lista(b === "l" ? 3 : 4)}
                <FranjaSistemas s={sistemas} lienzo={lienzo} vertical={lienzo.clase === "torre"} />
                <div className="mt-auto">{hablar}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.4fr)" }}>
            <div className="flex min-h-0 flex-col items-center gap-3 text-center">
                {orbe(lienzo.tv ? 170 : 140)}
                <p className="text-[13px] text-white/75">{frase}</p>
                {hablar}
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                {lista(6)}
                <div className="mt-auto flex flex-col gap-1.5">
                    <RotuloB>Sistemas de esta neurona</RotuloB>
                    <FranjaSistemas s={sistemas} lienzo={lienzo} vertical />
                </div>
            </div>
        </div>
    );
}

function Aviso({ a, lienzo, compacta, descartar }: { a: AvisoCortex; lienzo: LienzoB; compacta?: boolean; descartar: (id: string) => void }) {
    const Icono = ICONO[a.tipo];
    const color = COLOR[a.tipo];
    return (
        <li className={cn(estilosB.entrar, "flex items-start gap-2.5 py-1")}>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full" style={{ background: `${color}22`, boxShadow: a.prioridad === 0 ? `0 0 0 1.5px ${color}` : undefined }} aria-hidden>
                <Icono className="size-3.5" style={{ color: tintaB(color, 0.3) }} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-white/90">{a.texto}</p>
                {!compacta && <p className="mt-0.5 text-[11px] leading-snug text-white/55 line-clamp-2" title={a.detalle}>{a.detalle}</p>}
                {a.href && a.accion && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <AccionB href={a.href} color={color} tactil={lienzo.tactil}>{a.accion}</AccionB>
                    </div>
                )}
            </div>
            <button type="button" onClick={() => descartar(a.id)} aria-label={`Descartar: ${a.texto}`}
                className={cn(estilosB.foco, "grid shrink-0 cursor-pointer place-items-center rounded-full ss-redondo text-white/45 transition-colors hover:text-white", lienzo.tactil ? "size-11" : "size-6")}>
                <X className="size-3.5" aria-hidden />
            </button>
        </li>
    );
}

function FranjaSistemas({ s, lienzo, vertical }: { s: Sistemas | null; lienzo: LienzoB; vertical?: boolean }) {
    if (!s) return null;
    return (
        <ul className={cn("flex gap-1", vertical ? "flex-col" : "flex-wrap")} aria-label="Sistemas de esta neurona">
            {FRANJA.map(([pestana, etiqueta, clave, color]) => (
                <li key={pestana}>
                    <button type="button" onClick={() => abrirSistemas(pestana)} title={`Configurar ${etiqueta}: ${s[clave]}`}
                        className={cn(estilosB.foco, estilosB.fila, "flex w-full cursor-pointer items-center gap-1.5 rounded-full ss-redondo px-2 text-left text-[11px]", lienzo.tactil ? "min-h-11" : "min-h-7")}>
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                        <span className="font-semibold text-white/80">{etiqueta}</span>
                        <span className="min-w-0 text-white/50 line-clamp-1">{s[clave]}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** El orbe del córtex: un núcleo de luz con tres órbitas de neuronas; late si hay algo urgente. */
function Orbe({ lado, n, urgente, lienzo, etiqueta }: { lado: number; n: number; urgente: boolean; lienzo: LienzoB; etiqueta: string }) {
    const id = useId().replace(/:/g, "");
    const vivo = lienzo.nivel !== "ligero";
    const orbitas = [
        { rx: 42, ry: 16, rot: 0, dur: 38 },
        { rx: 42, ry: 16, rot: 60, dur: 52 },
        { rx: 42, ry: 16, rot: 120, dur: 66 },
    ];
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" aria-label={etiqueta} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`n${id}`} cx="42%" cy="38%" r="65%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="35%" stopColor={tintaB(lienzo.acento, 0.4)} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.85} />
                </radialGradient>
                <radialGradient id={`h${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={50} cy={50} r={48} fill={`url(#h${id})`} />
            {orbitas.map((o, i) => (
                <g key={i} transform={`rotate(${o.rot} 50 50)`}>
                    <ellipse cx={50} cy={50} rx={o.rx} ry={o.ry} fill="none" stroke={tintaB(lienzo.acento, 0.3)} strokeOpacity={0.35} strokeWidth={0.7} />
                    <g transform={`translate(50 50) scale(1 ${(o.ry / o.rx).toFixed(3)}) translate(-50 -50)`}>
                        <g className={vivo ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: `${o.dur}s`, animationDelay: `${-i * 7}s` }}>
                            <circle cx={50 + o.rx} cy={50} r={2.4} fill={tintaB(lienzo.acento, 0.5)} />
                        </g>
                    </g>
                </g>
            ))}
            <circle cx={50} cy={50} r={17} fill={`url(#n${id})`} className={urgente && vivo ? estilosB.latido : undefined} />
            <text x={50} y={51} textAnchor="middle" dominantBaseline="middle" fill="#0b1020" fontSize={14} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>{n}</text>
        </svg>
    );
}
