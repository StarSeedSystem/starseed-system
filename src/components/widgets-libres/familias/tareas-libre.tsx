"use client";
/**
 * Tareas libres (Ola 383 · WL7, rediseño ola 0929 · F) — la lista rápida de siempre
 * (`useQuickTasks`, sincronizada con la cuenta) convertida en herramienta de verdad, en esmeralda
 * Horizon: el anillo del día (hechas hoy frente a lo que quedaba), añadir en línea con atajos
 * («hoy», «mañana», «!»), completar con un estallido breve y «Deshacer», vencimientos (atrasada,
 * hoy, mañana) y, en l/xl, arrastrar para ordenar (o Alt+↑/↓ con el teclado), pestañas y la
 * semana de lo hecho.
 *   micro → el anillo con lo pendiente · s → anillo + las dos primeras + añadir
 *   m     → anillo y cuentas + la lista con fechas + el campo (apaisado: dos columnas)
 *   l/xl  → anillo grande y cifras (xl: la semana) | pestañas, lista arrastrable y campo
 *   panorámico → anillo + las siguientes en fila + campo · torre → anillo, lista y campo.
 */
import * as React from "react";
import { AnimatePresence, Reorder, motion, useDragControls, useReducedMotion } from "framer-motion";
import { CalendarClock, Check, Flag, GripVertical, ListChecks, Plus, Trash2, Undo2 } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { addQuickTask, useQuickTasks } from "@/lib/tasks/quick-tasks";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { Rotulo, disenoDe } from "./comun";
import {
    analizarEntrada, diaISO, estadoVence, fijarPrioridad, fijarVence, hechasPorDia, mover, ordenarPendientes, progresoDelDia, reordenar, resumen,
    type EstadoVence, type TareaInicio,
} from "./tareas-partes";
import { Accion, Anillo, escalaTipo, esTactil, useAhoraVivo, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";

const ESMERALDA = "#10B981";
const LIMA = "#39FF14";
const CHIP: Record<EstadoVence, { texto: string; color: string }> = {
    atrasada: { texto: "Atrasada", color: "#FF4D6A" },
    hoy: { texto: "Hoy", color: "#FFBF00" },
    manana: { texto: "Mañana", color: "#38a7ff" },
    proxima: { texto: "", color: "#94a3b8" },
};
const fechaChip = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");

/** La casilla: se llena de esmeralda a lima con un «check» y, recién hecha, suelta seis chispas. */
function Casilla({ t, hecha, chispas, onCambiar, tactil }: { t: TareaInicio; hecha: boolean; chispas: boolean; onCambiar: () => void; tactil: boolean }) {
    const lado = tactil ? 22 : 18;
    return (
        <button type="button" role="checkbox" aria-checked={hecha} onClick={onCambiar}
            aria-label={`${t.text}: ${hecha ? "hecha, pulsa para reabrir" : "pendiente, pulsa para completar"}`}
            className={`ss-redondo relative grid shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 ${tactil ? "size-11" : "size-7"}`}>
            <span className="ss-redondo grid place-items-center rounded-full transition-[background,box-shadow] duration-300"
                style={{ width: lado, height: lado, background: hecha ? `linear-gradient(135deg, ${ESMERALDA}, ${LIMA})` : "transparent", boxShadow: hecha ? `0 0 12px ${LIMA}88` : `inset 0 0 0 1.6px ${ESMERALDA}` }}>
                <AnimatePresence>
                    {hecha && (
                        <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
                            <Check aria-hidden className="size-3 text-[#04140d]" strokeWidth={3.5} />
                        </motion.span>
                    )}
                </AnimatePresence>
            </span>
            {chispas && hecha && Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2;
                return (
                    <motion.span key={i} aria-hidden className="pointer-events-none absolute block size-1.5 rounded-full"
                        style={{ background: i % 2 ? LIMA : "#ffffff" }}
                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * 16, y: Math.sin(a) * 16, opacity: 0, scale: 0.4 }}
                        transition={{ duration: 0.55, ease: "easeOut" }} />
                );
            })}
        </button>
    );
}

/** Menú vertical de una tarea: fecha, prioridad y borrar. */
function MenuTarea({ t, onCerrar, onBorrar }: { t: TareaInicio; onCerrar: () => void; onBorrar: () => void }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const fuera = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar(); };
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        document.addEventListener("pointerdown", fuera);
        document.addEventListener("keydown", tecla);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
    }, [onCerrar]);
    const hoy = new Date();
    const opcion = (texto: string, accion: () => void, Icono?: typeof Flag, peligro?: boolean) => (
        <button type="button" role="menuitem" onClick={() => { accion(); onCerrar(); }}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 ${peligro ? "text-rose-300" : "text-white/85"}`}>
            {Icono && <Icono aria-hidden className="size-3.5 shrink-0" />}{texto}
        </button>
    );
    return (
        <div ref={ref} role="menu" aria-label={`Opciones de «${t.text}»`}
            className="absolute right-0 top-full z-30 mt-1 flex w-44 flex-col gap-0.5 rounded-xl p-1.5 shadow-2xl"
            style={{ background: "rgba(10,14,30,.94)", boxShadow: `0 16px 40px -12px rgba(0,0,0,.7), inset 0 0 0 1px ${ESMERALDA}44`, backdropFilter: "blur(14px)" }}>
            {opcion("Para hoy", () => fijarVence(t.id, diaISO(hoy)), CalendarClock)}
            {opcion("Para mañana", () => fijarVence(t.id, diaISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1))), CalendarClock)}
            {t.vence && opcion("Quitar la fecha", () => fijarVence(t.id, null))}
            {opcion(t.priority === "alta" ? "Quitar prioridad" : "Prioridad alta", () => fijarPrioridad(t.id, t.priority !== "alta"), Flag)}
            <span aria-hidden className="my-0.5 h-px bg-white/10" />
            {opcion("Borrar", onBorrar, Trash2, true)}
        </div>
    );
}

interface FilaProps {
    t: TareaInicio; hecha: boolean; chispas: boolean; estado: EstadoVence | null; tactil: boolean; conMenu: boolean;
    onCambiar: () => void; onBorrar: () => void; asa?: React.ReactNode; compacta?: boolean;
}

/** Una tarea: casilla, texto (tachado al hacerla), prioridad, fecha y menú. */
function FilaTarea({ t, hecha, chispas, estado, tactil, conMenu, onCambiar, onBorrar, asa, compacta }: FilaProps) {
    const [menu, setMenu] = React.useState(false);
    const chip = estado ? CHIP[estado] : null;
    return (
        <div className="relative flex min-w-0 items-center gap-1.5">
            {asa}
            <Casilla t={t} hecha={hecha} chispas={chispas} onCambiar={onCambiar} tactil={tactil} />
            <span title={t.text} className={`min-w-0 flex-1 truncate transition-colors duration-300 ${compacta ? "text-[12.5px]" : "text-[13.5px]"} ${hecha ? "text-white/40 line-through decoration-emerald-300/70" : "text-white/90"}`}>
                {t.text}
            </span>
            {t.priority === "alta" && !hecha && <Flag aria-label="Prioridad alta" className="size-3 shrink-0 text-amber-300" />}
            {chip && !hecha && (compacta
                ? <span role="img" aria-label={chip.texto || fechaChip(t.vence!)} title={chip.texto || fechaChip(t.vence!)} className="block size-2 shrink-0 rounded-full" style={{ background: chip.color, boxShadow: `0 0 8px ${chip.color}aa` }} />
                : <span className="ss-redondo shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold" style={{ color: chip.color, background: `${chip.color}1f` }}>
                    {chip.texto || fechaChip(t.vence!)}
                </span>
            )}
            {conMenu && !hecha && (
                <>
                    <button type="button" aria-label={`Fecha y opciones de «${t.text}»`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}
                        className={`ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white/45 outline-none transition-opacity duration-150 hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${tactil ? "size-11 opacity-100" : "size-7 opacity-0 group-hover/fila:opacity-100"} ${menu ? "opacity-100" : ""}`}>
                        <CalendarClock className="size-3.5" />
                    </button>
                    {menu && <MenuTarea t={t} onCerrar={() => setMenu(false)} onBorrar={onBorrar} />}
                </>
            )}
        </div>
    );
}

/** Elemento arrastrable (l/xl): el asa arrastra; Alt+↑/↓ mueve con el teclado. */
function ItemArrastrable({ id, onSoltar, onTecla, children }: { id: string; onSoltar: () => void; onTecla: (paso: -1 | 1) => void; children: (asa: React.ReactNode) => React.ReactNode }) {
    const controles = useDragControls();
    const asa = (
        <button type="button" aria-label="Arrastrar para ordenar (o Alt + flechas)" onPointerDown={(e) => controles.start(e)}
            className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-white/25 outline-none transition-colors hover:text-white/70 focus-visible:text-white active:cursor-grabbing">
            <GripVertical className="size-3.5" />
        </button>
    );
    return (
        <Reorder.Item value={id} dragListener={false} dragControls={controles} onDragEnd={onSoltar} as="li"
            className="group/fila list-none" style={{ position: "relative" }}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); onTecla(e.key === "ArrowUp" ? -1 : 1); } }}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 28, transition: { duration: 0.25 } }}>
            {children(asa)}
        </Reorder.Item>
    );
}

/** El campo para añadir, con los atajos a la vista. */
function CampoNueva({ onAgregar, tactil, autoFocus, onCancelar }: { onAgregar: (texto: string) => void; tactil: boolean; autoFocus?: boolean; onCancelar?: () => void }) {
    const [borrador, setBorrador] = React.useState("");
    const enviar = (e: React.FormEvent) => { e.preventDefault(); if (borrador.trim()) { onAgregar(borrador); setBorrador(""); } };
    return (
        <form onSubmit={enviar} className="ss-redondo flex w-full min-w-0 items-center gap-1 rounded-full pl-3 pr-1 transition-shadow duration-200 focus-within:shadow-[0_0_0_1.5px_rgba(57,255,20,.45)]"
            style={{ background: `${ESMERALDA}17`, boxShadow: `inset 0 0 0 1px ${ESMERALDA}55` }}>
            <input autoFocus={autoFocus} value={borrador} onChange={(e) => setBorrador(e.target.value)} placeholder="Nueva tarea… (hoy, mañana, !)" aria-label="Nueva tarea"
                onKeyDown={(e) => { if (e.key === "Escape") { setBorrador(""); onCancelar?.(); } }}
                className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none ${tactil ? "py-2.5 text-[15px]" : "py-1.5 text-[13px]"}`} />
            <button type="submit" aria-label="Guardar tarea" disabled={!borrador.trim()}
                className={`ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white transition-[transform,background-color] duration-200 hover:scale-105 disabled:cursor-default disabled:opacity-40 ${tactil ? "size-10" : "size-7"}`}
                style={{ background: borrador.trim() ? `linear-gradient(135deg, ${ESMERALDA}, ${ESMERALDA}aa)` : "transparent" }}>
                <Plus className="size-4" />
            </button>
        </form>
    );
}

export function TareasLibre() {
    const { tasks, toggle, remove, clearCompleted } = useQuickTasks();
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const ahora = useAhoraVivo(60_000, visible) ?? new Date(0);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo), tactil = esTactil(dispositivo);
    const nivel = useNivelRender();
    const reducido = useReducedMotion();
    const chispasPermitidas = !reducido && nivel !== "ligero";

    const [recientes, setRecientes] = React.useState<Record<string, number>>({});
    const [deshacer, setDeshacer] = React.useState<{ id: string; texto: string } | null>(null);
    const [vista, setVista] = React.useState<"pendientes" | "hoy" | "hechas">("pendientes");
    const [anadiendo, setAnadiendo] = React.useState(false);
    const [ordenLocal, setOrdenLocal] = React.useState<string[] | null>(null);
    const temporizadores = React.useRef<number[]>([]);
    React.useEffect(() => () => temporizadores.current.forEach((t) => window.clearTimeout(t)), []);
    const tareas = tasks as TareaInicio[];
    const hoy = diaISO(ahora), manana = diaISO(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));
    const r = resumen(tareas, ahora);
    const progreso = progresoDelDia(r);
    const visibles = ordenarPendientes(tareas.filter((t) => !t.done || recientes[t.id]));
    const hechas = tareas.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    const lista = vista === "hechas" ? hechas : vista === "hoy"
        ? visibles.filter((t) => { const e = estadoVence(t, hoy, manana); return e === "hoy" || e === "atrasada" || recientes[t.id]; })
        : visibles;
    const ids = ordenLocal ?? lista.map((t) => t.id);
    const porId = new Map(tareas.map((t) => [t.id, t]));

    const completar = (t: TareaInicio) => {
        const haciendo = !t.done;
        toggle(t.id);
        if (!haciendo) return;
        setRecientes((p) => ({ ...p, [t.id]: Date.now() }));
        setDeshacer({ id: t.id, texto: t.text });
        temporizadores.current.push(
            window.setTimeout(() => setRecientes((p) => { const { [t.id]: _fuera, ...resto } = p; return resto; }), 1100),
            window.setTimeout(() => setDeshacer((d) => (d?.id === t.id ? null : d)), 5000),
        );
    };
    const agregar = (crudo: string) => {
        const { texto, vence, prioridad } = analizarEntrada(crudo, new Date());
        if (!texto) return;
        const nueva = addQuickTask(texto, prioridad);
        if (nueva && vence) fijarVence(nueva.id, vence);
    };

    const fila = (t: TareaInicio, opciones: { conMenu: boolean; compacta?: boolean; asa?: React.ReactNode }) => (
        <FilaTarea t={t} hecha={t.done} chispas={chispasPermitidas && !!recientes[t.id]} estado={estadoVence(t, hoy, manana)} tactil={tactil}
            conMenu={opciones.conMenu} compacta={opciones.compacta} asa={opciones.asa} onCambiar={() => completar(t)} onBorrar={() => remove(t.id)} />
    );
    const listaSimple = (items: TareaInicio[], conMenu: boolean, compacta?: boolean) => (
        <ul className="flex min-w-0 flex-col gap-0.5">
            <AnimatePresence initial={false}>
                {items.map((t) => (
                    <motion.li key={t.id} layout className="group/fila" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 28, transition: { duration: 0.25 } }}>
                        {fila(t, { conMenu, compacta })}
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
    const toastDeshacer = deshacer && (
        <div className="pointer-events-auto absolute bottom-1 left-1/2 z-20 -translate-x-1/2">
            <Accion icono={Undo2} color={ESMERALDA} grande={tactil} onClick={() => { toggle(deshacer.id); setDeshacer(null); }}
                title={`Deshacer «${deshacer.texto}»`} aria-label={`Deshacer: ${deshacer.texto}`}>Deshacer</Accion>
        </div>
    );
    const cifra = (n: number, texto: string, color: string) => (
        <div className="flex items-baseline gap-2"><span className="tabular-nums text-[20px] font-light" style={{ color }}>{n}</span><span className="text-[12px] text-white/65">{texto}</span></div>
    );
    const lineaCuenta = r.pendientes === 0
        ? (r.hechasHoy ? "todo hecho hoy" : "nada pendiente")
        : `${r.pendientes} por hacer${r.atrasadas ? ` · ${r.atrasadas} atrasada${r.atrasadas > 1 ? "s" : ""}` : r.paraHoy ? ` · ${r.paraHoy} para hoy` : ""}`;
    const etiqueta = `Tareas: ${lineaCuenta}`;

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={ESMERALDA} acento2={LIMA} etiqueta={etiqueta} intensidad={0.3}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.min(ancho, alto);
                    const anilloCentro = (tam: number) => (
                        <Anillo valor={progreso ?? 0} tam={tam} color={LIMA} color2={ESMERALDA} grosor={Math.max(3, tam * 0.075)}
                            etiqueta={`${r.hechasHoy} hechas hoy; ${lineaCuenta}`}>
                            {r.pendientes > 0
                                ? <span className="tabular-nums text-white" style={{ fontSize: tam * 0.34, fontWeight: 300, lineHeight: 1 }}>{r.pendientes}</span>
                                : <Check aria-hidden className="text-emerald-300" style={{ width: tam * 0.36, height: tam * 0.36 }} />}
                            {tam >= 104 && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{r.pendientes > 0 ? "por hacer" : "al día"}</span>}
                        </Anillo>
                    );

                    // ── micro ──
                    if (b === "micro") return <div className="flex h-full items-center justify-center" data-diseno="micro">{anilloCentro(lado * 0.74)}</div>;

                    const campo = <CampoNueva onAgregar={agregar} tactil={tactil} />;
                    const cabecera = (tam: number) => (
                        <div className="flex min-w-0 items-center gap-2.5">
                            {anilloCentro(tam)}
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate text-[13.5px] font-medium text-white">{r.pendientes ? `${r.pendientes} por hacer` : r.hechasHoy ? "Todo hecho hoy" : "Nada pendiente"}</span>
                                <span className="truncate text-[11.5px] text-white/55">
                                    {r.atrasadas ? <span className="text-rose-300">{r.atrasadas} atrasada{r.atrasadas > 1 ? "s" : ""}</span> : r.paraHoy ? `${r.paraHoy} para hoy` : r.hechasHoy ? `${r.hechasHoy} hecha${r.hechasHoy > 1 ? "s" : ""} hoy` : "escribe la primera"}
                                </span>
                            </div>
                        </div>
                    );

                    // ── s ──
                    if (b === "s") {
                        const n = alto >= 170 ? 3 : 2;
                        return (
                            <div className="relative flex h-full w-full flex-col justify-center gap-1.5 px-2" data-diseno="s">
                                {cabecera(36 * k)}
                                {!anadiendo && visibles.length > 0 && listaSimple(visibles.slice(0, n), false, true)}
                                {anadiendo
                                    ? <CampoNueva onAgregar={(x) => { agregar(x); }} tactil={tactil} autoFocus onCancelar={() => setAnadiendo(false)} />
                                    : <div className="flex justify-center"><Accion icono={Plus} color={ESMERALDA} grande={tactil} onClick={() => setAnadiendo(true)} aria-label="Añadir tarea">Añadir</Accion></div>}
                                {toastDeshacer}
                            </div>
                        );
                    }

                    // ── panorámico ──
                    if (clase === "panoramico" && horizontal) {
                        return (
                            <div className="relative flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                {anilloCentro(Math.min(alto * 0.72, 96))}
                                <div className="flex min-w-0 flex-1 flex-col gap-1">{listaSimple(visibles.slice(0, Math.max(1, Math.floor((alto - 16) / 30))), false, true)}</div>
                                <div className="w-[36%] min-w-[180px] max-w-[280px]">{campo}</div>
                                {toastDeshacer}
                            </div>
                        );
                    }

                    // ── torre ──
                    if (clase === "torre") {
                        return (
                            <div className="relative flex h-full w-full flex-col items-stretch gap-3 px-2 py-3" data-diseno="torre">
                                <div className="flex justify-center">{anilloCentro(Math.min(ancho * 0.6, 110))}</div>
                                <div className="min-h-0 flex-1 overflow-hidden">{listaSimple(visibles.slice(0, Math.max(2, Math.floor((alto - 220) / 32))), false, true)}</div>
                                {campo}
                                {toastDeshacer}
                            </div>
                        );
                    }

                    // ── m ──
                    if (b === "m") {
                        const dos = ancho >= alto * 1.3;
                        if (dos) {
                            const tam = Math.min(alto * 0.52, ancho * 0.3, 130);
                            return (
                                <div className="relative flex h-full w-full items-center gap-4 px-3" data-diseno="m-fila">
                                    <div className="flex shrink-0 flex-col items-center gap-2">
                                        {anilloCentro(tam)}
                                        <span className="max-w-[9rem] text-center text-[11.5px] leading-tight text-white/55">
                                            {r.atrasadas ? <span className="text-rose-300">{r.atrasadas} atrasada{r.atrasadas > 1 ? "s" : ""}</span> : r.paraHoy ? `${r.paraHoy} para hoy` : `${r.hechasHoy} hecha${r.hechasHoy === 1 ? "" : "s"} hoy`}
                                        </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                                        {visibles.length > 0 ? listaSimple(visibles.slice(0, Math.max(2, Math.floor((alto - 70) / (tactil ? 46 : 30)))), true, ancho < 460) : <p className="text-[12.5px] text-white/55">Nada pendiente. Escribe lo siguiente:</p>}
                                        {campo}
                                    </div>
                                    {toastDeshacer}
                                </div>
                            );
                        }
                        return (
                            <div className="relative flex h-full w-full flex-col justify-center gap-2 px-3" data-diseno="m">
                                {cabecera(44 * k)}
                                {visibles.length > 0 && listaSimple(visibles.slice(0, Math.max(2, Math.floor((alto - 120) / (tactil ? 46 : 30)))), true)}
                                {campo}
                                {toastDeshacer}
                            </div>
                        );
                    }

                    // ── l / xl ──
                    const dosColumnas = ancho >= 420;
                    const tamAnillo = Math.min(dosColumnas ? alto * 0.46 : alto * 0.3, 150);
                    const filas = Math.max(3, Math.floor((alto - (dosColumnas ? 110 : 230)) / (tactil ? 46 : 32)));
                    const semana = hechasPorDia(tareas, ahora, 7), maxSemana = Math.max(1, ...semana.map((d) => d.n));
                    const pestanas = (
                        <div role="tablist" aria-label="Filtro de tareas" className="flex items-center gap-1">
                            {([["pendientes", `Pendientes ${r.pendientes}`], ["hoy", `Hoy ${r.paraHoy + r.atrasadas}`], ["hechas", `Hechas ${hechas.length}`]] as const).map(([v, texto]) => (
                                <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => { setVista(v); setOrdenLocal(null); }}
                                    className={`ss-redondo cursor-pointer whitespace-nowrap rounded-full px-2.5 font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${tactil ? "min-h-11 text-[13px]" : "py-1 text-[11.5px]"} ${vista === v ? "text-white" : "text-white/55 hover:text-white"}`}
                                    style={{ background: vista === v ? `${ESMERALDA}33` : "transparent", boxShadow: vista === v ? `inset 0 0 0 1px ${ESMERALDA}77` : undefined }}>
                                    {texto}
                                </button>
                            ))}
                        </div>
                    );
                    const cuerpoLista = lista.length === 0 ? (
                        <p className="py-2 text-[12.5px] text-white/55">{vista === "hechas" ? "Aún no has completado ninguna." : vista === "hoy" ? "Nada con fecha para hoy." : "Nada pendiente. Escribe lo siguiente:"}</p>
                    ) : vista === "pendientes" ? (
                        <Reorder.Group axis="y" values={ids} onReorder={setOrdenLocal} as="ul" className="flex min-w-0 flex-col gap-0.5">
                            <AnimatePresence initial={false}>
                                {ids.slice(0, filas).map((id) => {
                                    const t = porId.get(id);
                                    if (!t) return null;
                                    return (
                                        <ItemArrastrable key={id} id={id}
                                            onSoltar={() => { if (ordenLocal) reordenar(ordenLocal.filter((x) => !porId.get(x)?.done)); setOrdenLocal(null); }}
                                            onTecla={(paso) => { const nuevo = mover(ids, id, paso); reordenar(nuevo.filter((x) => !porId.get(x)?.done)); }}>
                                            {(asa) => fila(t, { conMenu: true, asa })}
                                        </ItemArrastrable>
                                    );
                                })}
                            </AnimatePresence>
                        </Reorder.Group>
                    ) : listaSimple(lista.slice(0, filas), vista !== "hechas");
                    const derecha = (
                        <div className="flex min-h-0 min-w-0 flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">{pestanas}
                                {vista === "hechas" && hechas.length > 0 && <Accion icono={Trash2} color="#FF4D6A" grande={tactil} onClick={clearCompleted}>Limpiar</Accion>}
                            </div>
                            <div className="min-h-0 overflow-hidden">{cuerpoLista}</div>
                            {vista !== "hechas" && campo}
                        </div>
                    );
                    if (!dosColumnas) {
                        return (
                            <div className="relative flex h-full w-full flex-col justify-center gap-3 px-3" data-diseno={`${b}-apilado`}>
                                {cabecera(56 * k)}
                                {derecha}
                                {toastDeshacer}
                            </div>
                        );
                    }
                    return (
                        <div className="relative grid h-full w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-5 px-4 py-3" data-diseno={`${b}-dos`}>
                            <div className="flex flex-col items-center gap-3">
                                {anilloCentro(tamAnillo)}
                                <div className="flex flex-col gap-0.5">
                                    {r.atrasadas > 0 && cifra(r.atrasadas, r.atrasadas === 1 ? "atrasada" : "atrasadas", "#FF4D6A")}
                                    {cifra(r.paraHoy, "para hoy", "#FFBF00")}
                                    {cifra(r.hechasHoy, r.hechasHoy === 1 ? "hecha hoy" : "hechas hoy", LIMA)}
                                </div>
                                {b === "xl" && (
                                    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Hechas estos siete días: ${semana.map((d) => d.n).join(", ")}`}>
                                        <div className="flex h-10 items-end gap-1.5">
                                            {semana.map((d, i) => (
                                                <span key={d.dia} className="block w-3 rounded-full" style={{ height: `${Math.max(8, (d.n / maxSemana) * 100)}%`, background: i === 6 ? `linear-gradient(${LIMA}, ${ESMERALDA})` : `${ESMERALDA}${d.n ? "88" : "33"}` }} />
                                            ))}
                                        </div>
                                        <Rotulo>tu semana</Rotulo>
                                    </div>
                                )}
                            </div>
                            {derecha}
                            {toastDeshacer}
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default TareasLibre;
