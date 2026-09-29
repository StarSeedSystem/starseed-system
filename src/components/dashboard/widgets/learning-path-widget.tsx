'use client';

// ════════════════════════════════════════════════════════════════
// LearningPathWidget — tus rutas de aprendizaje (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Datos REALES: los pasos que te pones tú en cada tema de /network/education
// (entity_state «education:progress»). Antes pintaba un adaptador simulado que
// siempre devolvía una lista vacía.
// Qué hace: ver dónde vas en cada tema como un SENDERO (cada paso es una piedra:
// las hechas brillan, la siguiente respira), marcar el siguiente paso con un toque,
// añadir uno nuevo y saltar a Educación.
// Composición: micro = anillo · s = anillo + tema · m = tema + sendero + siguiente ·
// l = + lista de rutas y paso nuevo · xl = + todos los pasos del tema elegido ·
// panorámico = sendero a lo ancho · torre = lista de rutas.
// Tráfico: una lectura compartida cada ≥ 5 min, solo con el widget a la vista.
// Estados honestos: cargando (esqueleto), vacío (con el siguiente paso), error (con
// reintento o el aviso de pausa de consumo de la nube) y sin sesión.
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { GraduationCap, Check, Plus, ArrowUpRight, LogIn, CloudOff, Circle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { addLearningStep, toggleLearningStep } from "@/lib/education/progress";
import { builtinById, colorForRoot, rootIdOf } from "@/lib/education/curriculum";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { AnilloE, BotonE, CargandoE, EncabezadoE, EnlaceE, ErrorE, RaizE, VacioE, estilosE, tintaE } from "./paquete-e/piezas";
import { escribirCacheE, useCacheadoE } from "./paquete-e/cache";
import { cargarRutas, nombreTema, pausaServidorE, resumirRutas, type DatosRutas, type LearningStep, type ResumenRuta } from "./paquete-e/estudio";

const RUTA = "/network/education";
const CLAVE = "estudio-rutas-v1";
const CATALOGO = builtinById();

function colorTema(tema: string, respaldo: string): string {
    try { return CATALOGO.has(tema) ? colorForRoot(rootIdOf(tema, CATALOGO)) : respaldo; } catch { return respaldo; }
}

/** El sendero: una curva con una piedra por paso. Las hechas brillan; la siguiente respira. */
function Sendero({ pasos, ancho, alto, color, lienzo, alPulsar }: { pasos: LearningStep[]; ancho: number; alto: number; color: string; lienzo: LienzoE; alPulsar: (p: LearningStep) => void }) {
    const maximo = Math.max(3, Math.min(12, Math.floor(ancho / 30)));
    const iSig = pasos.findIndex((s) => !s.done);
    // Ventana alrededor del siguiente paso si no caben todos.
    const inicio = pasos.length <= maximo ? 0 : Math.max(0, Math.min(pasos.length - maximo, (iSig < 0 ? pasos.length : iSig) - Math.floor(maximo / 2)));
    const vis = pasos.slice(inicio, inicio + maximo);
    const pad = Math.max(12, alto * 0.22);
    const r = Math.max(5, Math.min(11, ancho / 44, alto / 5));
    const pts = vis.map((_, i) => {
        const x = vis.length === 1 ? ancho / 2 : pad + (i * (ancho - 2 * pad)) / (vis.length - 1);
        const y = alto / 2 + Math.sin((i + inicio) * 1.15) * (alto / 2 - r - 3);
        return [x, y] as const;
    });
    const curva = (hasta: number) => pts.slice(0, hasta + 1).reduce((d, [x, y], i) => {
        if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
        const [px0, py0] = pts[i - 1];
        const cx = (px0 + x) / 2;
        return `${d} C${cx.toFixed(1)} ${py0.toFixed(1)} ${cx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, "");
    const ultimoHecho = vis.reduce((k, s, i) => (s.done ? i : k), -1);
    const id = `sd-${ancho}-${alto}`;
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full overflow-visible" role="group" aria-label="Sendero de pasos">
            <defs>
                <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={color} />
                    <stop offset="100%" stopColor={lienzo.acento2} />
                </linearGradient>
            </defs>
            {pts.length > 1 && <path d={curva(pts.length - 1)} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />}
            {ultimoHecho > 0 && <path d={curva(ultimoHecho)} fill="none" stroke={`url(#${id})`} strokeWidth={3} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${conAlfa(color, 0.7)})` }} />}
            {vis.map((s, i) => {
                const [x, y] = pts[i];
                const esSig = inicio + i === iSig;
                const etiqueta = `${s.done ? "Hecho" : esSig ? "Siguiente" : "Pendiente"}: ${s.title}`;
                return (
                    <g key={s.id} role="button" tabIndex={0} aria-label={`${etiqueta}. Pulsa para ${s.done ? "desmarcar" : "marcar hecho"}`}
                        onClick={() => alPulsar(s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alPulsar(s); } }}
                        className="cursor-pointer outline-none [&:focus-visible>circle:first-of-type]:stroke-white">
                        <title>{etiqueta}</title>
                        <circle cx={x} cy={y} r={r + 7} fill="transparent" stroke="transparent" strokeWidth={2} />
                        {esSig && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} className={lienzo.animar ? "ss-respirar" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }} />}
                        <circle cx={x} cy={y} r={r} fill={s.done ? color : "rgba(12,14,34,.85)"} stroke={s.done ? "#fff" : esSig ? color : "rgba(255,255,255,.35)"} strokeWidth={s.done ? 1 : 2}
                            style={s.done ? { filter: `drop-shadow(0 0 5px ${conAlfa(color, 0.8)})` } : undefined} />
                        {s.done && <path d={`M${x - r * 0.45} ${y}l${r * 0.32} ${r * 0.34} ${r * 0.62}-${r * 0.7}`} fill="none" stroke="#0b0d20" strokeWidth={Math.max(1.4, r * 0.28)} strokeLinecap="round" strokeLinejoin="round" />}
                    </g>
                );
            })}
            {inicio > 0 && <text x={2} y={alto - 2} fontSize={10} fill="rgba(255,255,255,.45)">+{inicio}</text>}
            {inicio + vis.length < pasos.length && <text x={ancho - 2} y={alto - 2} fontSize={10} textAnchor="end" fill="rgba(255,255,255,.45)">+{pasos.length - inicio - vis.length}</text>}
        </svg>
    );
}

export function LearningPathWidget() {
    const { ref, lienzo } = useLienzoE();
    const { datos, cargando, error, recargar } = useCacheadoE<DatosRutas>(CLAVE, cargarRutas, { visible: lienzo.visible });
    const [elegido, setElegido] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const rutas = useMemo(() => resumirRutas(datos?.rutas ?? {}), [datos]);
    const foco: ResumenRuta | null = rutas.find((r) => r.tema === elegido) ?? rutas[0] ?? null;

    const guardarLista = (tema: string, lista: LearningStep[]) => {
        if (!datos) return;
        escribirCacheE(CLAVE, { ...datos, rutas: { ...datos.rutas, [tema]: lista } });
    };

    const alternar = async (tema: string, paso: LearningStep) => {
        const previa = datos?.rutas[tema] ?? [];
        guardarLista(tema, previa.map((s) => (s.id === paso.id ? { ...s, done: !s.done } : s)));
        setOcupado(true);
        try {
            const lista = await toggleLearningStep(tema, paso.id);
            if (lista.length) guardarLista(tema, lista);
        } catch {
            setAviso("No se pudo guardar el paso.");
            guardarLista(tema, previa);
        } finally { setOcupado(false); }
    };

    const anadir = async () => {
        if (!foco || !nuevo.trim()) return;
        setOcupado(true);
        try {
            const lista = await addLearningStep(foco.tema, nuevo.trim());
            guardarLista(foco.tema, lista);
            setNuevo("");
        } catch { setAviso("No se pudo añadir el paso."); } finally { setOcupado(false); }
    };

    const { base, clase, horizontal } = lienzo;
    const compacto = base === "micro" || base === "s";
    const raiz = { lienzo, refRaiz: ref, etiqueta: "Rutas de aprendizaje", tipo: "LEARNING_PATH" } as const;

    if (!datos && cargando) return <RaizE {...raiz}><CargandoE etiqueta="Cargando tus rutas…" filas={compacto ? 2 : 3} /></RaizE>;
    if (!datos && error) {
        const pausa = pausaServidorE();
        return <RaizE {...raiz}>{pausa ? <VacioE lienzo={lienzo} icono={CloudOff} titulo="La nube está en pausa" texto={pausa} compacto={compacto} /> : <ErrorE lienzo={lienzo} texto="No se pudieron leer tus rutas." onReintentar={recargar} />}</RaizE>;
    }
    if (datos && !datos.sesion) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={LogIn} titulo="Entra para seguir tus rutas" texto="Los pasos que te pones en cada tema viajan con tu cuenta." compacto={compacto}>
                    <EnlaceE lienzo={lienzo} href="/login" variante="primario" compacto={compacto}>Entrar</EnlaceE>
                </VacioE>
            </RaizE>
        );
    }
    if (!foco) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={GraduationCap} titulo="Todavía no sigues ningún camino" texto="Elige un tema en Educación y ponte tus propios pasos." compacto={compacto}>
                    <EnlaceE lienzo={lienzo} href={RUTA} variante="primario" compacto={compacto} icono={ArrowUpRight}>Elegir un tema</EnlaceE>
                </VacioE>
            </RaizE>
        );
    }

    const color = colorTema(foco.tema, lienzo.acento);
    const nombre = nombreTema(foco.tema, CATALOGO);
    const tinta = tintaE(color);

    if (compacto) {
        const lado = base === "micro" ? Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.78) : Math.max(64, Math.min(96, (lienzo.alto || 150) * 0.56));
        return (
            <RaizE {...raiz}>
                <a href={RUTA} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 p-1 text-center outline-none" title={`${nombre}: ${foco.hechos}/${foco.pasos.length} pasos`}>
                    <AnilloE valor={foco.pct} lado={lado} acento={color} acento2={lienzo.acento2} etiqueta={`${nombre}: ${Math.round(foco.pct * 100)} por ciento`}>
                        <span className="tabular-nums text-white" style={{ fontSize: Math.max(11, lado * 0.26), fontWeight: 300 }}>{Math.round(foco.pct * 100)}<span className="text-white/55" style={{ fontSize: "0.55em" }}>%</span></span>
                    </AnilloE>
                    {base === "s" && <span className="line-clamp-2 text-[12px] font-medium leading-tight text-white/85">{nombre}</span>}
                </a>
            </RaizE>
        );
    }

    const anchoSendero = Math.max(160, (lienzo.ancho || 280) - 12);
    const siguienteBtn = foco.siguiente ? (
        <button type="button" onClick={() => void alternar(foco.tema, foco.siguiente!)} disabled={ocupado}
            className="group flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-white/[0.06] disabled:opacity-60"
            style={{ background: conAlfa(color, 0.1) }} aria-label={`Marcar hecho: ${foco.siguiente.title}`}>
            <Circle aria-hidden className="size-4 shrink-0 group-hover:hidden" style={{ color: tinta }} />
            <Check aria-hidden className="hidden size-4 shrink-0 group-hover:block" style={{ color: tinta }} />
            <span className="min-w-0 flex-1 truncate text-white/90" style={{ fontSize: px(lienzo, 13) }}>{foco.siguiente.title}</span>
            <span className="shrink-0 text-[11px] text-white/45">Siguiente</span>
        </button>
    ) : (
        <p className="flex items-center gap-1.5 text-[12px] text-white/70"><CheckCircle2 className="size-4" style={{ color: tinta }} aria-hidden /> Ruta completa: ¡bien hecho!</p>
    );

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={GraduationCap} titulo="Ruta de aprendizaje" detalle={rutas.length > 1 ? `${rutas.length} temas` : undefined}
            acciones={<EnlaceE lienzo={lienzo} href={RUTA} compacto variante="fantasma" icono={ArrowUpRight}>Educación</EnlaceE>} />
    );
    const titular = (
        <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-semibold text-white" style={{ fontSize: px(lienzo, 15) }} title={nombre}>{nombre}</span>
            <span className="shrink-0 tabular-nums text-white/55" style={{ fontSize: px(lienzo, 12) }}>{foco.hechos}/{foco.pasos.length} · {Math.round(foco.pct * 100)} %</span>
        </div>
    );

    // panorámico: el sendero a lo ancho.
    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-4 p-1">
                    <div className="flex w-[34%] min-w-0 shrink-0 flex-col gap-1.5">{cabecera}{titular}{siguienteBtn}</div>
                    <div className="min-w-0 flex-1"><Sendero pasos={foco.pasos} ancho={Math.max(160, (lienzo.ancho || 600) * 0.6)} alto={Math.max(40, (lienzo.alto || 120) - 20)} color={color} lienzo={lienzo} alPulsar={(p) => void alternar(foco.tema, p)} /></div>
                </div>
            </RaizE>
        );
    }

    // torre: lista de rutas con barras.
    const listaRutas = (max: number) => (
        <ul className={cn("flex min-h-0 flex-col gap-0.5", estilosE.desliza)} aria-label="Tus rutas">
            {rutas.slice(0, max).map((r) => {
                const c = colorTema(r.tema, lienzo.acento);
                const sel = r.tema === foco.tema;
                return (
                    <li key={r.tema}>
                        <button type="button" onClick={() => setElegido(r.tema)} aria-pressed={sel}
                            className={cn("flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-xl px-2 py-1.5 text-left transition-colors duration-200", sel ? "bg-white/[0.08]" : "hover:bg-white/[0.04]")}>
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{nombreTema(r.tema, CATALOGO)}</span>
                                <span className="shrink-0 text-[11px] tabular-nums text-white/50">{r.hechos}/{r.pasos.length}</span>
                            </span>
                            <span className="block h-1 w-full overflow-hidden rounded-full bg-white/10">
                                <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(r.pct * 100)}%`, background: `linear-gradient(90deg, ${c}, ${lienzo.acento2})` }} />
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    if (clase === "torre") {
        return <RaizE {...raiz}><div className="flex h-full min-h-0 flex-col gap-2 p-1">{cabecera}{listaRutas(12)}{siguienteBtn}</div></RaizE>;
    }

    const grande = base === "l" || base === "xl";
    const altoSendero = Math.max(44, Math.min(90, (lienzo.alto || 240) * (grande ? 0.24 : 0.3)));
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                {cabecera}
                <div className={cn("flex min-h-0 flex-1 gap-3", base === "xl" ? "flex-row" : "flex-col")}>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                        {titular}
                        <Sendero pasos={foco.pasos} ancho={base === "xl" ? anchoSendero * 0.58 : anchoSendero} alto={altoSendero} color={color} lienzo={lienzo} alPulsar={(p) => void alternar(foco.tema, p)} />
                        {siguienteBtn}
                        {grande && (
                            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void anadir(); }}>
                                <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Añadir un paso…" aria-label={`Paso nuevo en ${nombre}`} maxLength={120}
                                    className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                                    style={{ height: lienzo.tactil ? 44 : 32, boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.3)}` }} />
                                <BotonE lienzo={{ ...lienzo, acento: color }} variante="primario" type="submit" icono={Plus} etiqueta="Añadir paso" disabled={!nuevo.trim() || ocupado} />
                            </form>
                        )}
                        {grande && rutas.length > 1 && base === "l" && <div className="min-h-0 flex-1">{listaRutas(4)}</div>}
                    </div>
                    {base === "xl" && (
                        <div className="flex min-h-0 w-[40%] shrink-0 flex-col gap-2">
                            {rutas.length > 1 && <div className="max-h-[45%] min-h-0">{listaRutas(6)}</div>}
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Pasos</p>
                            <ol className={cn("flex min-h-0 flex-col gap-0.5", estilosE.desliza)}>
                                {foco.pasos.map((p) => (
                                    <li key={p.id}>
                                        <button type="button" onClick={() => void alternar(foco.tema, p)} aria-pressed={p.done}
                                            className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-white/[0.05]">
                                            {p.done ? <CheckCircle2 aria-hidden className="size-4 shrink-0" style={{ color }} /> : <Circle aria-hidden className="size-4 shrink-0 text-white/40" />}
                                            <span className={cn("min-w-0 flex-1 truncate text-[12px]", p.done ? "text-white/50 line-through" : "text-white/90")}>{p.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
                {aviso && <p role="alert" className="text-[11px] text-rose-200">{aviso}</p>}
            </div>
        </RaizE>
    );
}
