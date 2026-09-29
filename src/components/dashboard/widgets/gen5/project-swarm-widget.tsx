'use client';

// ════════════════════════════════════════════════════════════════
// ProjectSwarmWidget — Enjambre de Propósitos (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Tus proyectos REALES como un panal: cada celda es una etiqueta
// `#proyecto` de tus Tareas rápidas (sincronizadas con la cuenta), se
// llena de luz según lo hecho, y la del centro es la más activa.
// Al elegir una celda ves su progreso, la próxima tarea (se completa
// con un toque) y un campo para añadirle otra. Escribir una tarea con
// «#nombre» crea un proyecto nuevo. Desde «l» puedes llevar el
// proyecto a la red como propuesta (/decisiones, ya rellenada).
// Estados honestos: cargando (primer montaje), vacío (ninguna tarea
// con etiqueta: cómo crear el primero) y error del almacén local.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Check, Hexagon, Landmark, Plus } from "lucide-react";
import { useQuickTasks } from "@/lib/tasks/quick-tasks";
import { buildProposalLink } from "@/lib/governance/links";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, Rot, VacioHonesto, tinta } from "./_catalogo/piezas";
import { aEtiqueta, conEtiqueta, extraerEtiquetas, panal, proyectosDe, sinEtiquetas, sueltas, trazoHex, type Proyecto } from "./project-swarm-partes";

/** Color estable por proyecto (no salta al reordenarse por actividad). */
function colorDe(etiqueta: string, l: EstadoLienzo): string {
    const paleta = [l.acento, l.acento2, "#23d5ab", "#FFBF00", "#38bdf8", "#f472b6", "#fb923c"];
    let h = 0;
    for (const c of etiqueta) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return paleta[h % paleta.length];
}

interface PanalProps {
    proyectos: Proyecto[];
    ancho: number;
    alto: number;
    sel: string | null;
    onSel: (e: string) => void;
    l: EstadoLienzo;
    interactivo: boolean;
    conNombres: boolean;
}

function Panal({ proyectos, ancho, alto, sel, onSel, l, interactivo, conNombres }: PanalProps) {
    const id = useIdSvg("panal");
    const n = Math.min(proyectos.length, ancho >= 260 && alto >= 200 ? 19 : 7);
    const visibles = proyectos.slice(0, n);
    // El panal se mide con hexágonos de lado 1, se escala para llenar la caja y se centra por su
    // caja real (con 5 celdas el hexágono central no es el centro del dibujo).
    const unidad = panal(n, 1);
    const minX = Math.min(...unidad.map((c) => c.x)), maxX = Math.max(...unidad.map((c) => c.x));
    const minY = Math.min(...unidad.map((c) => c.y)), maxY = Math.max(...unidad.map((c) => c.y));
    const tam = Math.max(10, Math.min(ancho / (maxX - minX + Math.sqrt(3) + 0.15), alto / (maxY - minY + 2.1), 64));
    const centros = unidad.map((c) => ({ x: c.x * tam, y: c.y * tam }));
    const cx = ancho / 2 - ((minX + maxX) / 2) * tam, cy = alto / 2 - ((minY + maxY) / 2) * tam;
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block shrink-0 overflow-visible" role="group" aria-label={`Panal de ${proyectos.length} proyectos`}>
            <defs>
                {visibles.map((p, i) => (
                    <clipPath key={p.etiqueta} id={`${id}-c${i}`}>
                        <path d={trazoHex(cx + centros[i].x, cy + centros[i].y, tam * 0.92)} />
                    </clipPath>
                ))}
            </defs>
            {visibles.map((p, i) => {
                const x = cx + centros[i].x, y = cy + centros[i].y, r = tam * 0.92;
                const color = colorDe(p.etiqueta, l);
                const activo = sel === p.etiqueta;
                const altoLleno = 2 * r * p.progreso;
                const accion = () => interactivo && onSel(p.etiqueta);
                return (
                    <g key={p.etiqueta}
                        role={interactivo ? "button" : undefined}
                        tabIndex={interactivo ? 0 : undefined}
                        aria-label={`#${p.etiqueta}: ${p.hechas} de ${p.total} tareas hechas${activo ? " (elegido)" : ""}`}
                        aria-pressed={interactivo ? activo : undefined}
                        onClick={accion}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accion(); } }}
                        className={interactivo ? "cursor-pointer outline-none [&:focus-visible>path:last-of-type]:stroke-white" : undefined}>
                        <path d={trazoHex(x, y, r)} fill={conAlfa(color, activo ? 0.16 : 0.08)} />
                        <rect x={x - r} y={y + r - altoLleno} width={2 * r} height={altoLleno} fill={color} opacity={activo ? 0.62 : 0.42} clipPath={`url(#${id}-c${i})`}
                            style={{ transition: l.animar ? "y .5s ease, height .5s ease" : undefined }} />
                        {p.progreso > 0 && p.progreso < 1 && (
                            <line x1={x - r} x2={x + r} y1={y + r - altoLleno} y2={y + r - altoLleno} stroke="#fff" strokeOpacity={0.55} strokeWidth={1} clipPath={`url(#${id}-c${i})`} />
                        )}
                        <path d={trazoHex(x, y, r)} fill="none" stroke={activo ? tinta(color, 0.2) : conAlfa(color, 0.6)} strokeWidth={activo ? 2 : 1.2}
                            style={activo && l.nivel === "pleno" ? { filter: `drop-shadow(0 0 6px ${conAlfa(color, 0.8)})` } : undefined} />
                        {tam >= 16 && (
                            <text x={x} y={conNombres && tam >= 26 ? y - tam * 0.12 : y} textAnchor="middle" dominantBaseline="middle" fill="#fff"
                                style={{ fontSize: Math.max(10, tam * 0.36), fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>
                                {Math.round(p.progreso * 100)}%
                            </text>
                        )}
                        {conNombres && tam >= 26 && (() => {
                            const fs = Math.max(9, tam * 0.21);
                            const cabe = Math.max(3, Math.floor((1.55 * tam) / (fs * 0.6)));
                            return (
                                <text x={x} y={y + tam * 0.3} textAnchor="middle" dominantBaseline="middle" fill={tinta(color, 0.45)}
                                    style={{ fontSize: fs, fontWeight: 600 }}>
                                    {p.etiqueta.length > cabe ? `${p.etiqueta.slice(0, cabe - 1)}…` : p.etiqueta}
                                </text>
                            );
                        })()}
                    </g>
                );
            })}
        </svg>
    );
}

/** Panal fantasma del estado vacío: tres celdas por llenar y un «+» en la del centro. */
function PanalVacio({ color, tam }: { color: string; tam: number }) {
    const c = panal(3, tam);
    const w = tam * 4.2, h = tam * 4;
    const minX = Math.min(...c.map((p) => p.x)), maxX = Math.max(...c.map((p) => p.x));
    const minY = Math.min(...c.map((p) => p.y)), maxY = Math.max(...c.map((p) => p.y));
    const ox = w / 2 - (minX + maxX) / 2, oy = h / 2 - (minY + maxY) / 2;
    return (
        <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
            {c.map((p, i) => (
                <path key={i} d={trazoHex(ox + p.x, oy + p.y, tam * 0.9)} fill={conAlfa(color, i === 0 ? 0.16 : 0.05)}
                    stroke={conAlfa(color, i === 0 ? 0.75 : 0.35)} strokeWidth={1.2} strokeDasharray={i === 0 ? undefined : "3 3"} />
            ))}
            <path d={`M${ox + c[0].x - tam * 0.3} ${oy + c[0].y}H${ox + c[0].x + tam * 0.3}M${ox + c[0].x} ${oy + c[0].y - tam * 0.3}V${oy + c[0].y + tam * 0.3}`}
                stroke={tinta(color, 0.2)} strokeWidth={1.6} strokeLinecap="round" />
        </svg>
    );
}

export function ProjectSwarmWidget() {
    const l = useLienzo("#39ff14", "#7c5cff");
    const { tasks, add, toggle } = useQuickTasks();
    const [montado, setMontado] = React.useState(false);
    const [sel, setSel] = React.useState<string | null>(null);
    const [borrador, setBorrador] = React.useState("");
    const [aviso, setAviso] = React.useState<string | null>(null);
    React.useEffect(() => { setMontado(true); }, []);

    const proyectos = React.useMemo(() => proyectosDe(tasks), [tasks]);
    const elegido = proyectos.find((p) => p.etiqueta === sel) ?? proyectos[0] ?? null;
    const porHacer = proyectos.reduce((a, p) => a + p.pendientes.length, 0);
    const libres = sueltas(tasks);

    const enviar = (e: React.FormEvent) => {
        e.preventDefault();
        const t = borrador.trim();
        if (!t) return;
        const etiquetas = extraerEtiquetas(t);
        if (!etiquetas.length && !elegido) { setAviso("Añade #nombre para crear el proyecto."); return; }
        const texto = etiquetas.length ? t : conEtiqueta(t, elegido!.etiqueta);
        add(texto);
        if (etiquetas.length) setSel(etiquetas[0]);
        setBorrador("");
        setAviso(null);
    };

    const etiqueta = proyectos.length
        ? `Enjambre de propósitos: ${proyectos.length} proyectos y ${porHacer} tareas por hacer. ${elegido ? `#${elegido.etiqueta} va al ${Math.round(elegido.progreso * 100)} %.` : ""}`
        : "Enjambre de propósitos: aún no tienes proyectos";

    if (!montado) {
        return (
            <Lienzo l={l} titulo="Enjambre de Propósitos" icono={Hexagon} etiqueta="Enjambre de propósitos: cargando tus proyectos">
                <div role="status" className="grid h-full place-items-center text-[12px] text-white/60">Cargando tus proyectos…</div>
            </Lienzo>
        );
    }

    const campo = (compacto: boolean) => (
        <form onSubmit={enviar} className="flex min-w-0 flex-col gap-1">
            <div className="ss-redondo flex min-w-0 items-center gap-1 rounded-full pl-3 pr-1" style={{ background: conAlfa(l.acento, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(l.acento, 0.4)}`, minHeight: l.toque }}>
                <input value={borrador} onChange={(e) => setBorrador(e.target.value)}
                    placeholder={elegido ? `Tarea para #${elegido.etiqueta}…` : "Primera tarea #proyecto"}
                    aria-label={elegido ? `Nueva tarea para el proyecto ${elegido.etiqueta} (o escribe #otro)` : "Nueva tarea con #nombre de proyecto"}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none" />
                <button type="submit" aria-label="Añadir la tarea" className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors duration-200 hover:bg-white/10"
                    style={{ width: Math.min(l.toque, 36) - 6, height: Math.min(l.toque, 36) - 6 }}>
                    <Plus className="size-4" />
                </button>
            </div>
            {aviso && <p role="alert" className="text-[11px] text-amber-200">{aviso}</p>}
            {!compacto && !aviso && <p className="text-[11px] text-white/45">Escribe #nombre para abrir un proyecto nuevo.</p>}
        </form>
    );

    // ── Vacío honesto ──
    if (!proyectos.length) {
        if (l.base === "micro") {
            return (
                <Lienzo l={l} titulo="Enjambre de Propósitos" etiqueta={etiqueta} sinCabecera>
                    <div className="grid h-full place-items-center" role="status" aria-label="Sin proyectos">
                        <Hexagon aria-hidden className="size-10" style={{ color: conAlfa(l.acento, 0.7) }} strokeWidth={1.2} />
                    </div>
                </Lienzo>
            );
        }
        return (
            <Lienzo l={l} titulo="Enjambre de Propósitos" icono={Hexagon} etiqueta={etiqueta} sinCabecera={l.base === "s"}>
                <div className="flex h-full min-h-0 flex-col justify-center gap-3">
                    <VacioHonesto icono={Hexagon} color={l.acento} compacto={l.base === "s"} llenar={false}
                        ilustracion={<PanalVacio color={l.acento} tam={l.base === "s" ? 13 : 17} />}
                        titulo="Aún no tienes proyectos"
                        ayuda={libres ? `Tienes ${libres} tarea${libres === 1 ? "" : "s"} suelta${libres === 1 ? "" : "s"}: etiquétala con #nombre y nacerá su proyecto.` : "Etiqueta una tarea con #nombre (por ejemplo, «Preparar semilleros #huerto») y nacerá su proyecto."} />
                    {l.base !== "s" && campo(true)}
                </div>
            </Lienzo>
        );
    }

    // ── micro: la celda del proyecto más activo ──
    if (l.base === "micro") {
        const p = proyectos[0];
        return (
            <Lienzo l={l} titulo="Enjambre de Propósitos" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center">
                    <Panal proyectos={[p]} ancho={l.lado - 16} alto={l.lado - 16} sel={p.etiqueta} onSel={() => undefined} l={l} interactivo={false} conNombres={false} />
                </div>
            </Lienzo>
        );
    }

    const detalle = elegido && (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-[15px] font-medium" style={{ color: tinta(colorDe(elegido.etiqueta, l), 0.25) }} title={`#${elegido.etiqueta}`}>#{elegido.etiqueta}</p>
                <span className="shrink-0 text-[12px] tabular-nums text-white/65">{elegido.hechas} de {elegido.total}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elegido.progreso * 100)} aria-label={`Progreso de #${elegido.etiqueta}`}>
                <span className="block h-full rounded-full" style={{ width: `${Math.max(3, elegido.progreso * 100)}%`, background: `linear-gradient(90deg, ${tinta(colorDe(elegido.etiqueta, l), 0.3)}, ${colorDe(elegido.etiqueta, l)})`, transition: l.animar ? "width .5s ease" : undefined }} />
            </div>
            {elegido.siguiente ? (
                <button type="button" onClick={() => toggle(elegido.siguiente!.id)}
                    className="group flex min-w-0 cursor-pointer items-center gap-2 text-left transition-colors duration-200" style={{ minHeight: l.toque }}
                    aria-label={`Completar la próxima tarea: ${sinEtiquetas(elegido.siguiente.text)}`}>
                    <span aria-hidden className="ss-redondo grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200 group-hover:bg-white/15" style={{ boxShadow: `inset 0 0 0 1.5px ${colorDe(elegido.etiqueta, l)}` }}>
                        <Check className="size-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </span>
                    <span className="min-w-0">
                        <Rot className="block text-[10px]">Siguiente</Rot>
                        <span className="block truncate text-[12.5px] text-white/90" title={elegido.siguiente.text}>{sinEtiquetas(elegido.siguiente.text)}</span>
                    </span>
                </button>
            ) : (
                <p className="flex items-center gap-1.5 text-[12.5px] text-white/70"><Check aria-hidden className="size-3.5" style={{ color: tinta(l.acento) }} />Todo hecho en este proyecto</p>
            )}
        </div>
    );

    const listaPendientes = (max: number) => elegido && elegido.pendientes.length > 1 && (
        <ul className="flex flex-col gap-1" aria-label={`Otras tareas de #${elegido.etiqueta}`}>
            {elegido.pendientes.filter((t) => t.id !== elegido.siguiente?.id).slice(0, max).map((t) => (
                <li key={t.id}>
                    <button type="button" onClick={() => toggle(t.id)} className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left text-[12px] text-white/75 transition-colors duration-200 hover:text-white" style={{ minHeight: Math.min(l.toque, 32) }}
                        aria-label={`Completar: ${sinEtiquetas(t.text)}`}>
                        <span aria-hidden className="ss-redondo size-3 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${conAlfa(colorDe(elegido.etiqueta, l), 0.8)}` }} />
                        <span className="truncate" title={t.text}>{sinEtiquetas(t.text)}</span>
                    </button>
                </li>
            ))}
        </ul>
    );

    const proponer = elegido && (
        <Accion color={l.acento2} alto={l.toque} icono={Landmark}
            href={buildProposalLink("", { title: `Proyecto: ${elegido.etiqueta}`, description: `Propongo abrir a la comunidad el proyecto «${elegido.etiqueta}». Tareas: ${[...elegido.pendientes.map((t) => sinEtiquetas(t.text))].slice(0, 8).join("; ")}.` })}
            etiqueta={`Proponer #${elegido.etiqueta} a la red como proyecto comunitario`}>Proponer a la red</Accion>
    );

    // ── s: el panal y el proyecto activo ──
    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Enjambre de Propósitos" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <Panal proyectos={proyectos} ancho={l.ancho - 20} alto={l.alto - 44} sel={elegido?.etiqueta ?? null} onSel={setSel} l={l} interactivo conNombres={false} />
                    {elegido && <p className="max-w-full truncate text-[12px] text-white/80">#{elegido.etiqueta} · {elegido.hechas}/{elegido.total}</p>}
                </div>
            </Lienzo>
        );
    }

    const subtitulo = `${proyectos.length} proyecto${proyectos.length === 1 ? "" : "s"} · ${porHacer} por hacer`;
    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.1;
    const cab = 52;
    const panalAncho = fila ? Math.round(l.ancho * (l.horizontal ? 0.3 : 0.44)) : l.ancho - 28;
    const panalAlto = fila ? l.alto - cab - 24 : Math.round((l.alto - cab) * 0.42);

    return (
        <Lienzo l={l} titulo="Enjambre de Propósitos" subtitulo={subtitulo} icono={Hexagon} etiqueta={etiqueta}>
            <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col justify-center"}`}>
                <Panal proyectos={proyectos} ancho={panalAncho} alto={panalAlto} sel={elegido?.etiqueta ?? null} onSel={setSel} l={l} interactivo conNombres={grande || l.horizontal} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2.5">
                    {detalle}
                    {(l.base === "xl" || l.horizontal) && listaPendientes(l.base === "xl" ? 4 : 2)}
                    {campo(!grande)}
                    {grande && proponer}
                </div>
            </div>
        </Lienzo>
    );
}
