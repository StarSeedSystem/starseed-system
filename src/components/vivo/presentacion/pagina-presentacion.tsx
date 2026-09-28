"use client";

/**
 * Presentación en vivo (L2 · 2026-09-28): la página completa de `/presentacion/<id>`.
 *
 * Clasificador de diapositivas (izquierda; en el móvil, debajo) · escenario de edición con el
 * compositor del lienzo · notas del orador · panel de «Añadir» y propiedades (derecha). Presentar
 * a pantalla completa y «Presentar a todos»: quien presenta difunde su diapositiva y su láser por
 * el canal del documento; los demás ven un aviso y deciden si le siguen. Fusión por diapositiva,
 * presencia (quién está en qué diapositiva), deshacer selectivo e historial de versiones.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Cast, CloudOff, History, Link2, Loader2, Play, Plus, Presentation, Redo2, SearchX, StickyNote, Undo2 } from "lucide-react";
import type { OpcionesCambio } from "@/components/messages/rico/historial";
import { updateSpaceMeta } from "@/lib/spaces/spaces";
import type { ElementoLienzo, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import { PilaDeshacer } from "@/lib/vivo/doc-colaborativo/deshacer";
import { jsonEstable, nuevoIdUnidad, type CambioUnidad } from "@/lib/vivo/doc-colaborativo/modelo";
import { claveEntre, clavesParaSecuencia } from "@/lib/vivo/doc-colaborativo/orden";
import { cambiosParaRestaurar, contenidoDeVersion } from "@/lib/vivo/doc-colaborativo/restaurar";
import { useSalaColaborativa } from "@/lib/vivo/doc-colaborativo/usar-sala";
import {
    APP_PRESENTACION,
    MAX_DIAPOSITIVAS,
    MAX_NOTAS,
    META_PRESENTACION_INICIAL,
    comprobarDiapositiva,
    diapositivaNueva,
    estiloBaseDe,
    indiceSeguido,
    lienzoEfectivo,
    presentadorActual,
    resumenPresentacion,
    rutaPresentacion,
    validarDiapositiva,
    validarMetaPresentacion,
    type Diapositiva,
    type DisenoDiapositiva,
    type MetaPresentacion,
} from "@/lib/vivo/presentacion";
import {
    AvataresPresencia,
    AvisoError,
    BotonIcono,
    BotonPildora,
    BotonReintentar,
    EnlaceVolver,
    EstadoGuardadoChip,
    FilaMenu,
    MenuAcciones,
    PantallaEstado,
    copiarEnlace,
    useAvisosConflicto,
    useVersionesAutomaticas,
} from "@/components/vivo/documento/comun-colab";
import { PanelVersiones } from "@/components/vivo/documento/panel-versiones";
import docStyles from "@/components/vivo/documento/documento.module.css";
import { AnadirDiapositiva } from "./anadir-diapositiva";
import { Clasificador, MenuNuevaDiapositiva } from "./clasificador";
import { EditorDiapositiva } from "./editor-diapositiva";
import { ModoPresentador, type PunteroLaser } from "./modo-presentador";
import { PanelDiapositiva } from "./panel-diapositiva";
import { VistaDiapositiva } from "./vista-diapositiva";
import styles from "./presentacion.module.css";

const ROSA = "#F43F5E";

interface EventoPresentacion {
    de: string;
    activo: boolean;
    id: string | null;
    indice: number;
    inicio: number | null;
}

function numero01(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

function Seccion({ titulo, children, className, accion }: { titulo: string; children: ReactNode; className?: string; accion?: ReactNode }) {
    return (
        <section className={className}>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{titulo}</p>
                {accion}
            </div>
            {children}
        </section>
    );
}

export function PaginaPresentacion({ espacioId }: { espacioId: string }) {
    const { apertura, espacio, sala, inst, reintentar } = useSalaColaborativa<Diapositiva, MetaPresentacion>({
        app: APP_PRESENTACION,
        espacioId,
        validarDatos: validarDiapositiva,
        validarMeta: validarMetaPresentacion,
        metaInicial: META_PRESENTACION_INICIAL,
        nombreCosa: "presentación",
        femenino: true,
        maxUnidades: MAX_DIAPOSITIVAS,
        maxBytes: 4_000_000,
    });
    const pila = useRef(new PilaDeshacer<Diapositiva>());
    const [, setPasos] = useState(0);
    const [seleccionada, setSeleccionada] = useState<string | null>(null);
    const [elemento, setElemento] = useState<string | null>(null);
    const [editandoTexto, setEditandoTexto] = useState<string | null>(null);
    const [presentando, setPresentando] = useState<number | null>(null);
    const [difundiendo, setDifundiendo] = useState(false);
    const [siguiendo, setSiguiendo] = useState(false);
    const [evento, setEvento] = useState<EventoPresentacion | null>(null);
    const [laserRemoto, setLaserRemoto] = useState<(PunteroLaser & { de: string }) | null>(null);
    const [versiones, setVersiones] = useState(false);
    const [tituloLocal, setTituloLocal] = useState<string | null>(null);
    const [notasLocal, setNotasLocal] = useState<{ id: string; texto: string } | null>(null);
    const [errorCerrado, setErrorCerrado] = useState<string | null>(null);
    const tTitulo = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ultimoAviso = useRef({ texto: "", t: 0 });
    const inicioDifusion = useRef(0);

    const unidades = useMemo(() => inst?.unidades ?? [], [inst?.unidades]);
    const meta = inst?.meta ?? META_PRESENTACION_INICIAL;
    const puedeEditar = !!inst?.puedeEditar;
    const estiloBase = useMemo(() => estiloBaseDe(meta), [meta]);
    const titulo = tituloLocal ?? (meta.titulo || espacio?.title || "Presentación sin título");
    const presentes = useMemo(() => inst?.presentes ?? [], [inst?.presentes]);

    // La diapositiva elegida siempre existe (si la borran, pasa a la vecina).
    const indiceSel = Math.max(0, unidades.findIndex((u) => u.id === seleccionada));
    const actual = unidades[indiceSel] ?? null;
    useEffect(() => {
        if (!unidades.length) return;
        if (!seleccionada || !unidades.some((u) => u.id === seleccionada)) setSeleccionada(unidades[Math.min(indiceSel, unidades.length - 1)].id);
    }, [unidades, seleccionada, indiceSel]);
    useEffect(() => {
        setElemento(null);
        setEditandoTexto(null);
        setNotasLocal(null);
    }, [seleccionada]);

    useEffect(() => {
        if (typeof document !== "undefined") document.title = `${titulo} · Presentación · StarSeed`;
    }, [titulo]);

    useAvisosConflicto(sala, () => "esta diapositiva");

    const versionesAuto = useVersionesAutomaticas({
        espacioId,
        activo: puedeEditar,
        contenido: () => contenidoDeVersion(APP_PRESENTACION, sala?.instantanea().unidades ?? [], sala?.meta() ?? META_PRESENTACION_INICIAL),
        resumen: () => resumenPresentacion(sala?.instantanea().unidades ?? []),
        autorNombre: sala?.yo.nombre ?? null,
    });

    // ── Edición ──

    const avisarError = (texto: string) => {
        const ahora = Date.now();
        if (ultimoAviso.current.texto === texto && ahora - ultimoAviso.current.t < 4000) return;
        ultimoAviso.current = { texto, t: ahora };
        toast.error(texto);
    };

    const aplicar = useCallback(
        (cambios: CambioUnidad<Diapositiva>[], opciones?: OpcionesCambio, sinHistorial = false) => {
            if (!sala) return;
            const parches = sala.cambiar(cambios);
            if (!parches.length) return;
            if (!sinHistorial) pila.current.registrar(parches, opciones);
            versionesAuto.marcarCambio();
            setPasos((n) => n + 1);
        },
        [sala, versionesAuto],
    );

    /** Cambia el contenido de una diapositiva tras pasar la misma lista blanca que los mensajes. */
    const cambiarDatos = (id: string, datos: Diapositiva, opciones?: OpcionesCambio, sinHistorial = false) => {
        const r = comprobarDiapositiva(datos);
        if (!r.ok) return avisarError(r.error);
        // Se guarda el objeto propio si la lista blanca no cambió nada (así el editor no se repinta
        // a cada tecla); si normalizó algo, la versión validada, para que todos guarden lo mismo.
        const igual = jsonEstable(r.diapositiva) === jsonEstable(datos);
        aplicar([{ id, datos: igual ? datos : r.diapositiva }], opciones, sinHistorial);
    };

    const cambiarLienzo = (lienzo: LienzoMensaje, opciones?: OpcionesCambio) => {
        if (!actual?.datos) return;
        cambiarDatos(actual.id, { ...actual.datos, lienzo }, opciones);
    };

    const deshacer = useCallback(() => {
        if (!sala) return;
        const cambios = pila.current.deshacer((id) => sala.unidad(id));
        if (cambios?.length) sala.cambiar(cambios);
        setPasos((n) => n + 1);
    }, [sala]);

    const rehacer = useCallback(() => {
        if (!sala) return;
        const cambios = pila.current.rehacer((id) => sala.unidad(id));
        if (cambios?.length) sala.cambiar(cambios);
        setPasos((n) => n + 1);
    }, [sala]);

    const nueva = (diseno: DisenoDiapositiva) => {
        if (unidades.length >= MAX_DIAPOSITIVAS) return avisarError(`Caben ${MAX_DIAPOSITIVAS} diapositivas por presentación.`);
        const i = actual ? indiceSel : unidades.length - 1;
        const orden = claveEntre(unidades[i]?.orden ?? null, unidades[i + 1]?.orden ?? null);
        const id = nuevoIdUnidad("d");
        aplicar([{ id, orden, datos: diapositivaNueva(diseno, meta, titulo) }]);
        setSeleccionada(id);
    };

    const duplicar = (id: string) => {
        const i = unidades.findIndex((u) => u.id === id);
        const u = unidades[i];
        if (!u?.datos) return;
        const copia = JSON.parse(JSON.stringify(u.datos)) as Diapositiva;
        const nuevaId = nuevoIdUnidad("d");
        aplicar([{ id: nuevaId, orden: claveEntre(u.orden, unidades[i + 1]?.orden ?? null), datos: copia }]);
        setSeleccionada(nuevaId);
    };

    const borrar = (id: string) => {
        const i = unidades.findIndex((u) => u.id === id);
        if (i < 0) return;
        const vecina = unidades[i + 1] ?? unidades[i - 1] ?? null;
        aplicar([{ id, borrar: true }]);
        setSeleccionada(vecina?.id ?? null);
        toast.message("Diapositiva eliminada", { description: "Puedes recuperarla con Deshacer o desde el historial.", action: { label: "Deshacer", onClick: deshacer } });
    };

    const mover = (id: string, destino: number) => {
        const sin = unidades.filter((u) => u.id !== id);
        const d = Math.max(0, Math.min(sin.length, destino));
        const secuencia = [...sin.slice(0, d).map((u) => ({ id: u.id, orden: u.orden as string | null })), { id, orden: null }, ...sin.slice(d).map((u) => ({ id: u.id, orden: u.orden as string | null }))];
        const claves = clavesParaSecuencia(secuencia);
        aplicar([...claves].map(([cid, orden]) => ({ id: cid, orden })));
    };

    const cambiarMeta = (cambio: Partial<MetaPresentacion>) => {
        if (!sala || !puedeEditar) return;
        sala.cambiarMeta({ ...sala.meta(), ...cambio });
        versionesAuto.marcarCambio();
    };

    const cambiarTitulo = (v: string) => {
        setTituloLocal(v);
        if (!sala || !puedeEditar) return;
        sala.cambiarMeta({ ...sala.meta(), titulo: v.slice(0, 200) });
        if (tTitulo.current) clearTimeout(tTitulo.current);
        tTitulo.current = setTimeout(() => void updateSpaceMeta(espacioId, { title: v.trim() || "Presentación sin título" }), 1200);
    };

    const anadirElemento = (el: ElementoLienzo) => {
        if (!actual?.datos) return;
        const efectivo = lienzoEfectivo(actual.datos, meta);
        const z = efectivo.elementos.reduce((m, e) => Math.max(m, e.z), 0) + 1;
        cambiarLienzo({ ...actual.datos.lienzo, elementos: [...actual.datos.lienzo.elementos, { ...el, z }] });
        setElemento(el.id);
    };

    const cambiarNotas = (texto: string) => {
        if (!actual?.datos) return;
        setNotasLocal({ id: actual.id, texto });
        const datos: Diapositiva = { ...actual.datos };
        const t = texto.slice(0, MAX_NOTAS);
        if (t.trim()) datos.notas = t;
        else delete datos.notas;
        cambiarDatos(actual.id, datos, { agrupar: `notas-${actual.id}`, ventana: 1500 });
    };

    const restaurar = (contenido: unknown): boolean => {
        if (!sala) return false;
        const r = cambiosParaRestaurar(contenido, APP_PRESENTACION, sala.instantanea().unidades, validarDiapositiva, validarMetaPresentacion);
        if (!r) return false;
        aplicar(r.cambios, { agrupar: `restaurar-${Date.now()}` });
        if (r.meta) sala.cambiarMeta({ ...r.meta, titulo: sala.meta().titulo || r.meta.titulo });
        return true;
    };

    // ── Presencia y «Presentar a todos» ──

    const idPresentado = presentando !== null ? unidades[Math.min(presentando, unidades.length - 1)]?.id ?? null : null;
    useEffect(() => {
        sala?.enfocar(idPresentado ?? seleccionada);
    }, [sala, seleccionada, idPresentado]);

    useEffect(() => {
        if (!sala) return;
        if (difundiendo && presentando !== null) {
            if (!inicioDifusion.current) inicioDifusion.current = Date.now();
            const p = { id: idPresentado, indice: presentando, inicio: inicioDifusion.current };
            sala.presentar(p);
            sala.enviar("presentacion", { activo: true, ...p });
        }
    }, [sala, difundiendo, presentando, idPresentado]);

    const dejarDeDifundir = useCallback(() => {
        setDifundiendo(false);
        sala?.presentar(null);
        sala?.enviar("presentacion", { activo: false, id: null, indice: 0, inicio: inicioDifusion.current });
        sala?.enviar("puntero", { oculto: true });
        inicioDifusion.current = 0;
    }, [sala]);

    useEffect(() => {
        if (!sala) return;
        return sala.alEvento((ev, carga) => {
            const de = typeof carga.de === "string" ? carga.de : "";
            if (ev === "presentacion") {
                setEvento({
                    de,
                    activo: carga.activo === true,
                    id: typeof carga.id === "string" ? carga.id : null,
                    indice: typeof carga.indice === "number" && Number.isFinite(carga.indice) ? Math.max(0, Math.floor(carga.indice)) : 0,
                    inicio: typeof carga.inicio === "number" && Number.isFinite(carga.inicio) ? carga.inicio : null,
                });
            } else if (ev === "puntero") {
                const x = numero01(carga.x);
                const y = numero01(carga.y);
                setLaserRemoto(x !== null && y !== null ? { de, x, y } : null);
            }
        });
    }, [sala]);

    const presentador = useMemo(() => {
        const p = presentadorActual(presentes);
        if (!p) return null;
        // Un «dejé de presentar» de ESA presentación manda sobre una presencia aún sin actualizar
        // (una presentación nueva de la misma persona trae otro `inicio` y no se tapa).
        if (evento && evento.de === p.clave && !evento.activo && evento.inicio === (p.presentando?.inicio ?? null)) return null;
        return p;
    }, [presentes, evento]);
    const indiceDelPresentador = useMemo(() => {
        if (!presentador) return 0;
        const delEvento = evento && evento.de === presentador.clave && evento.activo && evento.inicio === (presentador.presentando?.inicio ?? null);
        return indiceSeguido(unidades, delEvento ? evento : presentador.presentando);
    }, [presentador, evento, unidades]);

    const presentadorAnterior = useRef<string | null>(null);
    useEffect(() => {
        const antes = presentadorAnterior.current;
        presentadorAnterior.current = presentador?.nombre ?? null;
        if (!presentador && siguiendo) {
            setSiguiendo(false);
            toast.message(`${antes ?? "La persona que presentaba"} terminó de presentar`);
        }
    }, [presentador, siguiendo]);

    const empezarAPresentar = () => {
        setSiguiendo(false);
        setPresentando(indiceSel);
    };
    const salirDePresentar = () => {
        if (difundiendo) dejarDeDifundir();
        setPresentando(null);
    };

    // ── Pantallas de estado ──
    if (apertura === "cargando" || !inst || (inst.cargando && !inst.error)) {
        return <PantallaEstado icono={Loader2} cargando color={ROSA} titulo="Abriendo la presentación…" texto="Conectando con quienes ya están dentro." />;
    }
    if (apertura === "no-encontrado") {
        return (
            <PantallaEstado icono={SearchX} color="#FFBF00" titulo="No encontramos esta presentación" texto="Puede que el enlace no sea correcto o que aún no te hayan invitado. Pide a quien la creó que te la comparta desde el chat.">
                <EnlaceBoton href="/documentos">Ir a Mis documentos y presentaciones</EnlaceBoton>
            </PantallaEstado>
        );
    }
    if (apertura === "red") {
        return (
            <PantallaEstado icono={CloudOff} color="#FFBF00" titulo="Sin conexión" texto="No pudimos llegar al servidor. Revisa la conexión y vuelve a intentarlo.">
                <BotonReintentar onClick={reintentar} />
            </PantallaEstado>
        );
    }
    if (inst.error && !inst.puedeEditar && unidades.length === 0 && /no abre|no encontramos/i.test(inst.error)) {
        return (
            <PantallaEstado icono={SearchX} color="#FFBF00" titulo="Este enlace no abre una presentación" texto={inst.error}>
                <EnlaceBoton href="/documentos">Ir a Mis documentos y presentaciones</EnlaceBoton>
            </PantallaEstado>
        );
    }

    const mostrarError = inst.error && inst.error !== errorCerrado ? inst.error : null;
    const companeros = actual ? presentes.filter((p) => p.unidad === actual.id) : [];
    const notas = notasLocal?.id === actual?.id ? notasLocal!.texto : actual?.datos?.notas ?? "";
    const soyPresentador = presentador === null && difundiendo;

    return (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-2 pb-6 pt-2 text-white sm:px-4 sm:pt-4 lg:h-[calc(100dvh-6rem)] lg:min-h-[560px] lg:pb-0" data-presentacion-viva="">
            <header className={cn(docStyles.cabecera, "flex flex-wrap items-center gap-x-2 gap-y-2 px-2 py-2 sm:px-3")}>
                <EnlaceVolver href="/documentos" etiqueta="Volver a Mis documentos y presentaciones" />
                <span className="hidden h-10 w-10 flex-none place-items-center rounded-[14px] sm:grid" style={{ background: `${ROSA}1f`, boxShadow: `inset 0 0 0 1px ${ROSA}66` }} aria-hidden="true">
                    <Presentation className="h-5 w-5" style={{ color: ROSA }} />
                </span>
                <div className="min-w-[10rem] flex-1">
                    {puedeEditar ? (
                        <input
                            className={docStyles.tituloEntrada}
                            value={titulo}
                            onChange={(e) => cambiarTitulo(e.target.value)}
                            onBlur={() => setTituloLocal(null)}
                            aria-label="Título de la presentación"
                            placeholder="Presentación sin título"
                            maxLength={200}
                        />
                    ) : (
                        <h1 className="truncate px-2.5 text-[17px] font-semibold">{titulo}</h1>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <EstadoGuardadoChip guardado={inst.guardado} puedeEditar={puedeEditar} conectado={inst.conectado} />
                    <AvataresPresencia
                        presentes={presentes}
                        describir={(p) => {
                            const i = unidades.findIndex((u) => u.id === (p.presentando?.id ?? p.unidad));
                            return i >= 0 ? `en la diapositiva ${i + 1}` : null;
                        }}
                    />
                    {puedeEditar && (
                        <>
                            <BotonIcono etiqueta="Deshacer (Ctrl+Z)" onClick={deshacer} disabled={!pila.current.puedeDeshacer}>
                                <Undo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                            <BotonIcono etiqueta="Rehacer (Ctrl+Mayús+Z)" onClick={rehacer} disabled={!pila.current.puedeRehacer}>
                                <Redo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                        </>
                    )}
                    <BotonPildora principal color={ROSA} onClick={empezarAPresentar} disabled={!unidades.length}>
                        <Play className="h-4 w-4" aria-hidden="true" /> Presentar
                    </BotonPildora>
                    <MenuAcciones etiqueta="Más acciones de la presentación">
                        {puedeEditar && (
                            <FilaMenu
                                icono={Cast}
                                etiqueta="Presentar a todos"
                                ayuda="Quien esté aquí verá tus diapositivas a la vez"
                                color={ROSA}
                                onClick={() => {
                                    setDifundiendo(true);
                                    empezarAPresentar();
                                }}
                                disabled={!unidades.length || (!!presentador && !soyPresentador)}
                            />
                        )}
                        <FilaMenu icono={History} etiqueta="Historial de versiones" ayuda="Las 20 últimas, restaurables" onClick={() => setVersiones(true)} />
                        <FilaMenu icono={Link2} etiqueta="Copiar enlace" ayuda="Lo abre quien tenga acceso" color="#007FFF" onClick={() => void copiarEnlace(rutaPresentacion(espacioId))} />
                    </MenuAcciones>
                </div>
            </header>

            {mostrarError && <AvisoError texto={mostrarError} onCerrar={() => setErrorCerrado(mostrarError)} />}

            {presentador && !siguiendo && presentando === null && (
                <div className="flex flex-wrap items-center gap-3 rounded-[18px] px-4 py-3 text-[14px]" style={{ background: `${ROSA}1a`, boxShadow: `inset 0 0 0 1px ${ROSA}66` }} role="status">
                    <Cast className="h-5 w-5 flex-none" style={{ color: ROSA }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                        <strong className="font-semibold">{presentador.nombre}</strong> está presentando a todos (diapositiva {indiceDelPresentador + 1}).
                    </span>
                    <BotonPildora principal color={ROSA} onClick={() => setSiguiendo(true)}>
                        <Play className="h-4 w-4" aria-hidden="true" /> Seguir la presentación
                    </BotonPildora>
                </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
                <aside className={cn(styles.cristal, "order-2 rounded-[22px] p-2.5 lg:order-1 lg:flex lg:w-[224px] lg:flex-none lg:flex-col")} aria-label="Diapositivas">
                    <Clasificador
                        unidades={unidades}
                        meta={meta}
                        estiloBase={estiloBase}
                        seleccionada={actual?.id ?? null}
                        onSeleccionar={setSeleccionada}
                        puedeEditar={puedeEditar}
                        onNueva={nueva}
                        onDuplicar={duplicar}
                        onBorrar={borrar}
                        onMover={mover}
                        presentes={presentes}
                        className="lg:min-h-0 lg:flex-1"
                    />
                </aside>

                <main className="order-1 flex min-w-0 flex-col gap-3 lg:order-2 lg:min-h-0 lg:flex-1" aria-label="Diapositiva">
                    <div className="relative h-[min(62vw,460px)] min-h-[230px] lg:h-auto lg:min-h-0 lg:flex-1">
                        {!actual?.datos ? (
                            <div className={cn(styles.cristal, "grid h-full place-items-center rounded-[22px] p-6 text-center")}>
                                <div className="space-y-3">
                                    <Presentation className="mx-auto h-8 w-8 text-white/40" aria-hidden="true" />
                                    <p className="text-[14px] text-white/70">Esta presentación aún no tiene diapositivas.</p>
                                    {puedeEditar && <MenuNuevaDiapositiva onNueva={nueva} texto="Añadir la primera" />}
                                </div>
                            </div>
                        ) : puedeEditar ? (
                            <EditorDiapositiva
                                diapositiva={actual.datos}
                                meta={meta}
                                estiloBase={estiloBase}
                                onCambiar={cambiarLienzo}
                                onAjustar={(l) => actual.datos && cambiarDatos(actual.id, { ...actual.datos, lienzo: l }, undefined, true)}
                                seleccion={elemento}
                                onSeleccion={setElemento}
                                editandoTexto={editandoTexto}
                                onEditarTexto={setEditandoTexto}
                                onDeshacer={deshacer}
                                onRehacer={rehacer}
                                companeros={companeros}
                            />
                        ) : (
                            <div className={cn(styles.cristal, "h-full rounded-[22px] p-3")}>
                                <VistaDiapositiva lienzo={lienzoEfectivo(actual.datos, meta)} estiloBase={estiloBase} ajuste="contener" etiqueta={`Diapositiva ${indiceSel + 1}`} />
                            </div>
                        )}
                    </div>
                    {actual?.datos && (
                        <section className={cn(styles.cristal, "rounded-[20px] px-3.5 py-3")} aria-label="Notas del orador">
                            <label htmlFor="notas-orador" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> Notas del orador · diapositiva {indiceSel + 1}
                            </label>
                            {puedeEditar ? (
                                <textarea
                                    id="notas-orador"
                                    value={notas}
                                    onChange={(e) => cambiarNotas(e.target.value)}
                                    onBlur={() => setNotasLocal(null)}
                                    rows={2}
                                    maxLength={MAX_NOTAS}
                                    placeholder="Lo que quieres decir en esta diapositiva (solo se ve en el modo presentador)."
                                    className="block max-h-40 min-h-[3.2rem] w-full resize-y rounded-[12px] border-0 bg-white/[0.04] px-3 py-2 text-[14px] leading-relaxed text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-[#7C5CFF]"
                                />
                            ) : (
                                <p id="notas-orador" className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/80">
                                    {notas.trim() || "Sin notas."}
                                </p>
                            )}
                        </section>
                    )}
                </main>

                <aside className={cn(styles.cristal, "order-3 space-y-6 rounded-[22px] p-3 lg:w-[300px] lg:flex-none lg:overflow-y-auto")} aria-label="Añadir y ajustes">
                    {puedeEditar && actual?.datos && (
                        <Seccion titulo="Añadir a la diapositiva" accion={<Plus className="h-3.5 w-3.5 text-white/45" aria-hidden="true" />}>
                            <AnadirDiapositiva lienzo={lienzoEfectivo(actual.datos, meta)} onAnadir={anadirElemento} onEditarTexto={setEditandoTexto} />
                        </Seccion>
                    )}
                    {actual?.datos ? (
                        <PanelDiapositiva
                            diapositiva={actual.datos}
                            numero={indiceSel + 1}
                            meta={meta}
                            puedeEditar={puedeEditar}
                            seleccion={elemento}
                            onSeleccion={setElemento}
                            onEditarTexto={setEditandoTexto}
                            onCambiar={cambiarLienzo}
                            onCambiarMeta={cambiarMeta}
                        />
                    ) : (
                        <p className="px-1 text-[13px] text-white/55">Añade una diapositiva para ver sus ajustes.</p>
                    )}
                </aside>
            </div>

            {presentando !== null && (
                <ModoPresentador
                    unidades={unidades}
                    meta={meta}
                    estiloBase={estiloBase}
                    indice={presentando}
                    onIndice={setPresentando}
                    onSalir={salirDePresentar}
                    puedeDifundir={puedeEditar && (!presentador || soyPresentador)}
                    difundiendo={difundiendo}
                    onDifundir={(activo) => (activo ? setDifundiendo(true) : dejarDeDifundir())}
                    onLaser={(p) => difundiendo && sala?.enviar("puntero", p ? { x: p.x, y: p.y } : { oculto: true })}
                />
            )}
            {siguiendo && presentador && presentando === null && (
                <ModoPresentador
                    unidades={unidades}
                    meta={meta}
                    estiloBase={estiloBase}
                    indice={indiceDelPresentador}
                    onIndice={null}
                    onSalir={() => setSiguiendo(false)}
                    siguiendoA={presentador.nombre}
                    onSoltar={() => {
                        setSiguiendo(false);
                        setPresentando(indiceDelPresentador);
                    }}
                    laserRemoto={laserRemoto && laserRemoto.de === presentador.clave ? laserRemoto : null}
                />
            )}

            <PanelVersiones
                abierto={versiones}
                onCerrar={() => setVersiones(false)}
                espacioId={espacioId}
                puedeEditar={puedeEditar}
                cosa="presentación"
                femenino
                autorNombre={sala?.yo.nombre ?? null}
                contenidoActual={() => contenidoDeVersion(APP_PRESENTACION, unidades, meta)}
                resumenActual={() => resumenPresentacion(unidades)}
                onRestaurar={restaurar}
            />
        </div>
    );
}

function EnlaceBoton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className="ss-redondo inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.03]"
        >
            {children}
        </Link>
    );
}
