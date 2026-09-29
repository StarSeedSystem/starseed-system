'use client';

// ════════════════════════════════════════════════════════════════
// ActiveProjectsWidget — «Génesis activa»: tus proyectos en curso (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Datos REALES: tus proyectos y tareas del estudio (study_projects / study_tasks, los
// mismos del panel «Tareas y proyectos» de /network/education). Antes pintaba un
// adaptador simulado que siempre devolvía una lista vacía.
// Qué hace cada vez que lo abres: ver cuánto llevas del proyecto que importa, su
// siguiente paso y marcarlo hecho sin salir del tablero; cambiar el estado (activo,
// idea, en pausa, hecho) desde un menú vertical y crear un proyecto nuevo.
// El progreso sale de las tareas del mismo tema; si un proyecto no tiene tareas
// vinculadas no se inventa un 0 %: se dice «sin tareas».
// Composición: micro = anillo · s = anillo + nombre · m = foco del proyecto
// principal + siguiente paso · l = lista con anillos y siguiente paso · xl = + tareas
// pendientes del elegido · panorámico = tarjetas en fila · torre = lista.
// Tráfico: una lectura compartida cada ≥ 5 min y solo con el widget a la vista.
// Estados honestos: cargando (esqueleto), vacío (con el siguiente paso), error (con
// reintento o el aviso de pausa de consumo de la nube) y sin sesión.
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from "react";
import { Rocket, Check, Plus, MoreVertical, CircleDashed, ArrowUpRight, LogIn, CloudOff, Lightbulb, Pause, Play, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { createProject, toggleTask, updateProject } from "@/lib/education/study";
import { useLienzoE, px, type LienzoE } from "./paquete-e/lienzo";
import { AnilloE, BotonE, CargandoE, EncabezadoE, EnlaceE, ErrorE, MenuE, RaizE, SelloE, VacioE, estilosE, tintaE, type OpcionMenuE } from "./paquete-e/piezas";
import { escribirCacheE, useCacheadoE } from "./paquete-e/cache";
import {
    COLOR_ESTADO, ETIQUETA_ESTADO, cargarEstudio, ordenarProyectos, pausaServidorE, progresoProyecto,
    type DatosEstudio, type ProjectStatus, type StudyProject, type StudyTask,
} from "./paquete-e/estudio";

const RUTA = "/network/education";
const CLAVE = "estudio-proyectos-v1";

function Pct({ pct, lado, lienzo }: { pct: number | null; lado: number; lienzo: LienzoE }) {
    return pct === null
        ? <span className="text-white/50" style={{ fontSize: Math.max(10, lado * 0.2) }}>—</span>
        : <span className="tabular-nums text-white" style={{ fontSize: Math.max(11, lado * 0.26), fontWeight: 300 }}>{Math.round(pct * 100)}<span className="text-white/55" style={{ fontSize: "0.55em" }}>%</span></span>;
}

export function ActiveProjectsWidget() {
    const { ref, lienzo } = useLienzoE();
    const { datos, cargando, error, recargar } = useCacheadoE<DatosEstudio>(CLAVE, cargarEstudio, { visible: lienzo.visible });
    const [elegido, setElegido] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ p: StudyProject; x: number; y: number } | null>(null);
    const [nuevo, setNuevo] = useState("");
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const proyectos = useMemo(() => ordenarProyectos(datos?.proyectos ?? []), [datos]);
    const tareas = datos?.tareas ?? [];
    const vivos = proyectos.filter((p) => p.status !== "hecho");
    const foco = proyectos.find((p) => p.id === elegido) ?? vivos[0] ?? proyectos[0] ?? null;

    const actualizar = useCallback((f: (d: DatosEstudio) => DatosEstudio) => {
        if (!datos) return;
        escribirCacheE(CLAVE, f(datos));
    }, [datos]);

    const completar = async (t: StudyTask) => {
        setOcupado(t.id);
        actualizar((d) => ({ ...d, tareas: d.tareas.map((x) => (x.id === t.id ? { ...x, done: true } : x)) }));
        const ok = await toggleTask(t.id, true);
        setOcupado(null);
        if (!ok) { setAviso("No se pudo guardar: la tarea sigue pendiente."); recargar(); }
    };

    const cambiarEstado = async (p: StudyProject, status: ProjectStatus) => {
        actualizar((d) => ({ ...d, proyectos: d.proyectos.map((x) => (x.id === p.id ? { ...x, status, updated_at: new Date().toISOString() } : x)) }));
        const ok = await updateProject(p.id, { status });
        if (!ok) { setAviso("No se pudo cambiar el estado."); recargar(); }
    };

    const crear = async () => {
        const titulo = nuevo.trim();
        if (!titulo) return;
        setOcupado("nuevo");
        const p = await createProject({ title: titulo, status: "activo" });
        setOcupado(null);
        if (!p) { setAviso("No se pudo crear el proyecto."); return; }
        setNuevo("");
        setElegido(p.id);
        actualizar((d) => ({ ...d, proyectos: [p, ...d.proyectos] }));
    };

    const opciones = (p: StudyProject): OpcionMenuE[] => [
        ...(p.status !== "activo" ? [{ id: "activo", etiqueta: "Marcar activo", icono: Play, alElegir: () => cambiarEstado(p, "activo") }] : []),
        ...(p.status !== "pausado" ? [{ id: "pausado", etiqueta: "Poner en pausa", icono: Pause, alElegir: () => cambiarEstado(p, "pausado") }] : []),
        ...(p.status !== "idea" ? [{ id: "idea", etiqueta: "Volver a idea", icono: Lightbulb, alElegir: () => cambiarEstado(p, "idea") }] : []),
        ...(p.status !== "hecho" ? [{ id: "hecho", etiqueta: "Dar por terminado", icono: CheckCircle2, alElegir: () => cambiarEstado(p, "hecho") }] : []),
        { id: "abrir", etiqueta: "Abrir en Educación", icono: ArrowUpRight, alElegir: () => { window.location.assign(RUTA); } },
    ];

    const { base, clase, horizontal } = lienzo;
    const raiz = { lienzo, refRaiz: ref, etiqueta: "Génesis activa: tus proyectos", tipo: "ACTIVE_PROJECTS" } as const;
    const compacto = base === "micro" || base === "s";
    const menuEl = menu ? <MenuE x={menu.x} y={menu.y} titulo={menu.p.title} acento={lienzo.acento} opciones={opciones(menu.p)} onCerrar={() => setMenu(null)} /> : null;

    // ── Estados honestos ──
    if (!datos && cargando) return <RaizE {...raiz}><CargandoE etiqueta="Cargando tus proyectos…" filas={compacto ? 2 : 3} /></RaizE>;
    if (!datos && error) {
        const pausa = pausaServidorE();
        return (
            <RaizE {...raiz}>
                {pausa ? <VacioE lienzo={lienzo} icono={CloudOff} titulo="La nube está en pausa" texto={pausa} compacto={compacto} />
                    : <ErrorE lienzo={lienzo} texto="No se pudieron leer tus proyectos." onReintentar={recargar} />}
            </RaizE>
        );
    }
    if (datos && !datos.sesion) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={LogIn} titulo="Entra para ver tus proyectos" texto="Tus proyectos y tareas viajan con tu cuenta." compacto={compacto}>
                    <EnlaceE lienzo={lienzo} href="/login" variante="primario" compacto={compacto}>Entrar</EnlaceE>
                </VacioE>
            </RaizE>
        );
    }

    const formularioNuevo = (
        <form className="flex min-w-0 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void crear(); }}>
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo proyecto…" aria-label="Nombre del proyecto nuevo" maxLength={80}
                className="h-8 min-w-0 flex-1 rounded-full bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                style={{ boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.25)}`, height: lienzo.tactil ? 44 : 32 }} />
            <BotonE lienzo={lienzo} variante="primario" type="submit" icono={Plus} etiqueta="Crear proyecto" disabled={!nuevo.trim() || ocupado === "nuevo"} />
        </form>
    );

    if (proyectos.length === 0) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={Rocket} titulo="Aún no tienes proyectos" texto="Crea uno y ve su avance con las tareas de su tema." compacto={compacto}>
                    {compacto ? <EnlaceE lienzo={lienzo} href={RUTA} compacto>Empezar</EnlaceE> : <div className="w-full max-w-[280px]">{formularioNuevo}</div>}
                </VacioE>
                {aviso && <p role="alert" className="px-2 pb-1 text-center text-[11px] text-rose-200">{aviso}</p>}
            </RaizE>
        );
    }

    const pf = foco ? progresoProyecto(foco, tareas) : null;
    const tinta = tintaE(lienzo.acento);

    // ── micro / s ──
    if (compacto && foco && pf) {
        const lado = base === "micro" ? Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.78) : Math.max(64, Math.min(96, (lienzo.alto || 150) * 0.56));
        return (
            <RaizE {...raiz}>
                <a href={RUTA} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl p-1 text-center outline-none focus-visible:ring-2" title={`${foco.title} · ${pf.pct === null ? "sin tareas" : `${Math.round(pf.pct * 100)} %`}`}>
                    <AnilloE valor={pf.pct} lado={lado} acento={lienzo.acento} acento2={lienzo.acento2} etiqueta={`${foco.title}: ${pf.pct === null ? "sin tareas vinculadas" : `${Math.round(pf.pct * 100)} por ciento`}`}>
                        <Pct pct={pf.pct} lado={lado} lienzo={lienzo} />
                    </AnilloE>
                    {base === "s" && <span className="line-clamp-2 max-w-full text-[12px] font-medium leading-tight text-white/85">{foco.title}</span>}
                </a>
            </RaizE>
        );
    }

    // Fila de proyecto (l, torre, panorámico).
    const fila = (p: StudyProject, tarjeta = false) => {
        const pr = progresoProyecto(p, tareas);
        const sel = foco?.id === p.id;
        return (
            <li key={p.id} className={cn(estilosE.entra, "min-w-0", tarjeta && "w-[220px] shrink-0")}>
                <div className={cn("group flex min-w-0 items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-200", sel ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                    <button type="button" onClick={() => setElegido(p.id)} aria-pressed={sel} aria-label={`Ver ${p.title}`} className="ss-redondo shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}>
                        <AnilloE valor={pr.pct} lado={lienzo.tv ? 52 : 40} acento={COLOR_ESTADO[p.status]} acento2={lienzo.acento2}><Pct pct={pr.pct} lado={lienzo.tv ? 52 : 40} lienzo={lienzo} /></AnilloE>
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }} title={p.title}>{p.title}</span>
                            <SelloE color={COLOR_ESTADO[p.status]}>{ETIQUETA_ESTADO[p.status]}</SelloE>
                        </div>
                        <p className="truncate text-white/55" style={{ fontSize: px(lienzo, 11) }} title={pr.siguiente?.title}>
                            {pr.siguiente ? <>Siguiente: {pr.siguiente.title}</> : pr.total ? `${pr.hechas}/${pr.total} tareas hechas` : p.topic ? "Sin tareas en este tema" : "Sin tema: añade tareas en Educación"}
                        </p>
                    </div>
                    {pr.siguiente && (
                        <BotonE lienzo={lienzo} variante="suave" compacto icono={Check} etiqueta={`Hecho: ${pr.siguiente.title}`} disabled={ocupado === pr.siguiente.id} onClick={() => void completar(pr.siguiente!)} />
                    )}
                    <BotonE lienzo={lienzo} variante="fantasma" compacto icono={MoreVertical} etiqueta={`Acciones de ${p.title}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ p, x: r.left - 180, y: r.bottom + 4 }); }} />
                </div>
            </li>
        );
    };

    const resumen = `${vivos.length} en curso${proyectos.length - vivos.length ? ` · ${proyectos.length - vivos.length} terminados` : ""}`;

    // ── panorámico: tarjetas en fila ──
    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-1.5 p-1">
                    <EncabezadoE lienzo={lienzo} icono={Rocket} titulo="Génesis activa" detalle={resumen} acciones={<EnlaceE lienzo={lienzo} href={RUTA} compacto variante="fantasma" icono={ArrowUpRight}>Educación</EnlaceE>} />
                    <ul className={cn("flex min-h-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden", estilosE.desliza)}>{proyectos.slice(0, 8).map((p) => fila(p, true))}</ul>
                </div>
                {menuEl}
            </RaizE>
        );
    }

    // ── m: el foco del proyecto principal ──
    if (base === "m" && clase !== "torre" && foco && pf) {
        const lado = Math.max(76, Math.min(120, (lienzo.alto || 240) * 0.42));
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    <EncabezadoE lienzo={lienzo} icono={Rocket} titulo="Génesis activa" detalle={resumen} />
                    <div className="flex min-h-0 flex-1 items-center gap-3">
                        <AnilloE valor={pf.pct} lado={lado} acento={lienzo.acento} acento2={lienzo.acento2} etiqueta={`Avance de ${foco.title}`}>
                            <Pct pct={pf.pct} lado={lado} lienzo={lienzo} />
                            <span className="mt-0.5 text-[10px] text-white/50">{pf.total ? `${pf.hechas}/${pf.total}` : "sin tareas"}</span>
                        </AnilloE>
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-semibold leading-snug text-white" style={{ fontSize: px(lienzo, 15) }} title={foco.title}>{foco.title}</p>
                            <SelloE color={COLOR_ESTADO[foco.status]}>{ETIQUETA_ESTADO[foco.status]}</SelloE>
                        </div>
                    </div>
                    {pf.siguiente ? (
                        <button type="button" onClick={() => void completar(pf.siguiente!)} disabled={ocupado === pf.siguiente.id}
                            className="group flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-white/[0.06] disabled:opacity-60"
                            style={{ background: conAlfa(lienzo.acento, 0.08) }} aria-label={`Marcar hecho: ${pf.siguiente.title}`}>
                            <CircleDashed aria-hidden className="size-4 shrink-0 group-hover:hidden group-focus-visible:hidden" style={{ color: tinta }} />
                            <Check aria-hidden className="hidden size-4 shrink-0 group-hover:block group-focus-visible:block" style={{ color: tinta }} />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{pf.siguiente.title}</span>
                            <span className="shrink-0 text-[11px] text-white/45">Siguiente</span>
                        </button>
                    ) : (
                        <EnlaceE lienzo={lienzo} href={RUTA} compacto icono={Plus} className="self-start">Añadir tareas</EnlaceE>
                    )}
                    {aviso && <p role="alert" className="text-[11px] text-rose-200">{aviso}</p>}
                </div>
                {menuEl}
            </RaizE>
        );
    }

    // ── l / xl / torre: lista (+ tareas del elegido en xl) ──
    const conDetalle = base === "xl" && foco && pf;
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                <EncabezadoE lienzo={lienzo} icono={Rocket} titulo="Génesis activa" detalle={resumen}
                    acciones={<EnlaceE lienzo={lienzo} href={RUTA} compacto variante="fantasma" icono={ArrowUpRight}>Educación</EnlaceE>} />
                <div className={cn("flex min-h-0 flex-1 gap-3", conDetalle ? "flex-row" : "flex-col")}>
                    <ul className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-0.5", estilosE.desliza)} aria-label="Proyectos">
                        {proyectos.slice(0, 12).map((p) => fila(p))}
                    </ul>
                    {conDetalle && foco && pf && (
                        <section aria-label={`Tareas de ${foco.title}`} className="flex min-h-0 w-[42%] shrink-0 flex-col gap-1.5">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Pendientes · {foco.title}</p>
                            {pf.pendientes.length === 0 ? (
                                <p className="text-[12px] text-white/50">{pf.total ? "Todo hecho en este tema." : "Sin tareas vinculadas a su tema."}</p>
                            ) : (
                                <ul className={cn("flex min-h-0 flex-col gap-0.5", estilosE.desliza)}>
                                    {pf.pendientes.slice(0, 10).map((t) => (
                                        <li key={t.id}>
                                            <button type="button" onClick={() => void completar(t)} disabled={ocupado === t.id}
                                                className="group flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60" aria-label={`Marcar hecho: ${t.title}`}>
                                                <CircleDashed aria-hidden className="size-4 shrink-0" style={{ color: tinta }} />
                                                <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">{t.title}</span>
                                                {t.due_at && <span className="shrink-0 text-[10px] tabular-nums text-white/45">{new Date(t.due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
                </div>
                {(base === "l" || base === "xl") && formularioNuevo}
                {aviso && <p role="alert" className="text-[11px] text-rose-200">{aviso}</p>}
            </div>
            {menuEl}
        </RaizE>
    );
}
