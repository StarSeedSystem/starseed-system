"use client";

/**
 * ListaContactos — el panel central: búsqueda sin tildes, orden y agrupación, índice A–Z,
 * franja de próximos cumpleaños y filas con avatar (anillo de la relación) y presencia.
 * Modo de selección múltiple con acciones en lote en un menú vertical (categoría, lista,
 * favoritos, público/privado, exportar vCard, eliminar).
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import {
    ArrowUpDown,
    Cake,
    CheckCheck,
    CheckSquare,
    ChevronDown,
    Download,
    Globe2,
    ListChecks,
    Lock,
    MoreVertical,
    Rows3,
    Search,
    SlidersHorizontal,
    Square,
    Star,
    Tag,
    Trash2,
    UserMinus,
    X,
} from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import type { ProximoCumpleanos } from "@/lib/contactos/modelo";
import type { AgrupacionContactos, Contacto, ContactosApi, OrdenContactos } from "@/lib/contactos/tipos";
import { cn } from "@/lib/utils";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_CAMPO,
    CLASE_FOCO,
    CLASE_ITEM_MENU,
    CLASE_MENU,
    colorSiguiente,
    pildora,
    useMovimientoReducido,
} from "@/components/contactos/app/estilos";
import { ChipColor } from "@/components/contactos/app/piezas";
import { descargarVcf } from "@/components/contactos/app/archivos";
import { aplicarVisibilidad } from "@/components/contactos/app/acciones";
import {
    LETRAS_INDICE,
    etiquetaCumple,
    nombreArchivoVcf,
    subtituloContacto,
    type ResultadoVista,
    type SeleccionLateral,
} from "@/components/contactos/app/vista";

export const OPCIONES_ORDEN: { id: OrdenContactos; texto: string }[] = [
    { id: "nombre", texto: "Nombre" },
    { id: "reciente", texto: "Recientes" },
    { id: "relacion", texto: "Relación" },
    { id: "creado", texto: "Fecha de alta" },
];

export const OPCIONES_AGRUPACION: { id: AgrupacionContactos; texto: string }[] = [
    { id: "letra", texto: "Por letra" },
    { id: "relacion", texto: "Por relación" },
    { id: "categoria", texto: "Por categoría" },
    { id: "ninguna", texto: "Sin grupos" },
];

export interface ListaContactosProps {
    api: ContactosApi;
    titulo: string;
    vista: ResultadoVista;
    seleccion: SeleccionLateral;
    texto: string;
    onTexto: (t: string) => void;
    orden: OrdenContactos;
    onOrden: (o: OrdenContactos) => void;
    agrupacion: AgrupacionContactos;
    onAgrupacion: (a: AgrupacionContactos) => void;
    activoId: string | null;
    onAbrir: (id: string) => void;
    presencia: Record<string, boolean>;
    hoy: Date;
    /** Próximos cumpleaños de TODA la libreta (para la franja). */
    proximos: ProximoCumpleanos[];
    onVerCumpleanos: () => void;
    /** Hueco a la izquierda del título (volver / abrir carpetas). */
    cabecera?: ReactNode;
    /** Contenido cuando la libreta está vacía del todo. */
    vacio?: ReactNode;
    refBusqueda?: RefObject<HTMLInputElement | null>;
}

// ─────────────────────────── Franja de cumpleaños ───────────────────────────

function FranjaCumpleanos({
    proximos,
    hoy,
    onAbrir,
    onVerTodos,
}: {
    proximos: ProximoCumpleanos[];
    hoy: Date;
    onAbrir: (id: string) => void;
    onVerTodos: () => void;
}) {
    const visibles = proximos.slice(0, 3);
    return (
        <section aria-label="Próximos cumpleaños" className="rounded-2xl p-2.5" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.12), rgba(20,184,166,0.08))", boxShadow: "inset 0 0 0 1px rgba(244,63,94,0.25)" }}>
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-100/90">
                    <Cake className="h-3.5 w-3.5 text-rose-300" aria-hidden />
                    Próximos cumpleaños
                </p>
                {proximos.length > visibles.length ? (
                    <button type="button" onClick={onVerTodos} className={cn("cursor-pointer rounded-lg px-1.5 py-0.5 text-[12px] font-medium text-rose-200 hover:text-white", CLASE_FOCO)}>
                        Ver los {proximos.length}
                    </button>
                ) : null}
            </div>
            <ul className="flex flex-col gap-0.5">
                {visibles.map((p) => (
                    <li key={p.contacto.id}>
                        <button
                            type="button"
                            onClick={() => onAbrir(p.contacto.id)}
                            className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]", CLASE_FOCO)}
                        >
                            <AvatarContacto nombre={p.contacto.nombre} avatarUrl={p.contacto.perfil?.avatarUrl} tam={32} relacion={p.contacto.relacion} />
                            <span className="min-w-0 flex-1">
                                <span className="block break-words text-[13px] font-medium leading-snug text-white">{p.contacto.nombre}</span>
                                <span className="block text-[12px] leading-snug text-rose-100/75">{etiquetaCumple(p, hoy)}</span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ─────────────────────────── Fila ───────────────────────────

function FilaContacto({
    contacto,
    activo,
    seleccionando,
    marcado,
    enLinea,
    categorias,
    extra,
    onClick,
}: {
    contacto: Contacto;
    activo: boolean;
    seleccionando: boolean;
    marcado: boolean;
    enLinea: boolean;
    categorias: { id: string; nombre: string; color: string }[];
    extra?: string;
    onClick: () => void;
}) {
    const subtitulo = subtituloContacto(contacto);
    const cats = contacto.categorias
        .map((id) => categorias.find((c) => c.id === id))
        .filter((c): c is { id: string; nombre: string; color: string } => Boolean(c));
    return (
        <button
            type="button"
            data-fila-contacto=""
            onClick={onClick}
            aria-current={!seleccionando && activo ? "true" : undefined}
            aria-pressed={seleccionando ? marcado : undefined}
            className={cn(
                "group flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-all duration-200",
                activo && !seleccionando
                    ? "bg-[#14B8A6]/[0.14] shadow-[inset_0_0_0_1px_rgba(20,184,166,0.45)]"
                    : marcado
                      ? "bg-white/[0.08]"
                      : "hover:bg-white/[0.05]",
                CLASE_FOCO,
            )}
            data-testid="fila-contacto"
        >
            {seleccionando ? (
                marcado ? (
                    <CheckSquare className="h-5 w-5 shrink-0" style={{ color: ACENTO }} aria-hidden />
                ) : (
                    <Square className="h-5 w-5 shrink-0 text-white/35" aria-hidden />
                )
            ) : null}
            <AvatarContacto
                nombre={contacto.nombre}
                avatarUrl={contacto.perfil?.avatarUrl}
                tam={42}
                relacion={contacto.relacion}
                enLinea={enLinea}
            />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className="min-w-0 break-words text-[15px] font-semibold leading-snug text-white">{contacto.nombre}</span>
                    {contacto.favorito ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" aria-label="Favorito" /> : null}
                    {contacto.visibilidad === "publica" ? <Globe2 className="h-3.5 w-3.5 shrink-0" style={{ color: ACENTO }} aria-label="Público" /> : null}
                </span>
                {subtitulo ? <span className="block break-words text-[12px] leading-snug text-white/55">{subtitulo}</span> : null}
                {cats.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                        {cats.slice(0, 2).map((c) => (
                            <ChipColor key={c.id} nombre={c.nombre} color={c.color} pequeno />
                        ))}
                        {cats.length > 2 ? <span className="text-[11px] text-white/45">+{cats.length - 2}</span> : null}
                    </span>
                ) : null}
            </span>
            {extra ? <span className="shrink-0 text-right text-[12px] text-rose-100/80">{extra}</span> : null}
        </button>
    );
}

// ─────────────────────────── Índice A–Z ───────────────────────────

function IndiceLetras({ disponibles, onIr }: { disponibles: Set<string>; onIr: (letra: string) => void }) {
    const arrastrando = useRef(false);
    const ultima = useRef<string | null>(null);
    const irDesdePunto = (e: PointerEvent<HTMLElement>) => {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const letra = el?.closest<HTMLElement>("[data-letra]")?.dataset.letra;
        if (letra && letra !== ultima.current && disponibles.has(letra)) {
            ultima.current = letra;
            onIr(letra);
        }
    };
    return (
        <nav
            aria-label="Índice alfabético"
            className="flex w-6 shrink-0 touch-none select-none flex-col items-center justify-between py-1"
            onPointerDown={(e) => {
                arrastrando.current = true;
                ultima.current = null;
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
                if (arrastrando.current) irDesdePunto(e);
            }}
            onPointerUp={() => {
                arrastrando.current = false;
            }}
            onPointerCancel={() => {
                arrastrando.current = false;
            }}
        >
            {LETRAS_INDICE.map((l) => {
                const hay = disponibles.has(l);
                return (
                    <button
                        key={l}
                        type="button"
                        data-letra={l}
                        disabled={!hay}
                        onClick={() => onIr(l)}
                        aria-label={`Ir a la letra ${l}`}
                        className={cn(
                            "flex h-4 w-6 cursor-pointer items-center justify-center rounded text-[10px] font-semibold leading-none transition-colors disabled:cursor-default",
                            hay ? "text-white/70 hover:text-[#14B8A6]" : "text-white/20",
                            CLASE_FOCO,
                        )}
                    >
                        {l}
                    </button>
                );
            })}
        </nav>
    );
}

// ─────────────────────────── Selector nativo con estilo ───────────────────────────

function SelectorVista<T extends string>({
    etiqueta,
    icono: Icono,
    valor,
    opciones,
    onCambiar,
}: {
    etiqueta: string;
    icono: typeof Search;
    valor: T;
    opciones: { id: T; texto: string }[];
    onCambiar: (v: T) => void;
}) {
    const id = useId();
    return (
        <div className="relative min-w-0" title={etiqueta}>
            <label htmlFor={id} className="sr-only">
                {etiqueta}
            </label>
            <Icono className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ACENTO }} aria-hidden />
            <select
                id={id}
                value={valor}
                onChange={(e) => onCambiar(e.target.value as T)}
                className={cn(CLASE_CAMPO, "cursor-pointer appearance-none py-2 pl-9 pr-8 text-[13px] [color-scheme:dark]")}
            >
                {opciones.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.texto}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" aria-hidden />
        </div>
    );
}

// ─────────────────────────── Lista ───────────────────────────

export function ListaContactos(props: ListaContactosProps) {
    const {
        api,
        titulo,
        vista,
        seleccion,
        texto,
        onTexto,
        orden,
        onOrden,
        agrupacion,
        onAgrupacion,
        activoId,
        onAbrir,
        presencia,
        hoy,
        proximos,
        onVerCumpleanos,
        cabecera,
        vacio,
        refBusqueda,
    } = props;
    const base = useId();
    const confirmar = useConfirm();
    const preguntar = usePrompt();
    const reducido = useMovimientoReducido();
    const contenedor = useRef<HTMLDivElement>(null);
    const [seleccionando, setSeleccionando] = useState(false);
    const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
    const [ajustesVista, setAjustesVista] = useState(false);

    const claveSel = "id" in seleccion ? `${seleccion.tipo}:${seleccion.id}` : seleccion.tipo;
    useEffect(() => {
        setMarcados(new Set());
    }, [claveSel]);

    const categorias = useMemo(() => api.categorias.map((c) => ({ id: c.id, nombre: c.nombre, color: c.color })), [api.categorias]);
    const disponibles = useMemo(() => new Set(vista.grupos.map((g) => g.clave)), [vista.grupos]);
    const esCumples = seleccion.tipo === "cumpleanos";
    const mostrarIndice = !esCumples && agrupacion === "letra" && vista.grupos.length > 1;
    const marcadosVisibles = useMemo(() => vista.visibles.filter((c) => marcados.has(c.id)), [vista.visibles, marcados]);
    const n = marcadosVisibles.length;

    const alternarMarca = (id: string) =>
        setMarcados((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return s;
        });

    const irALetra = (l: string) => {
        const el = document.getElementById(`${base}-grupo-${l}`);
        el?.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" });
    };

    const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const destino = e.target as HTMLElement;
        if (!destino.matches("[data-fila-contacto]")) return;
        const filas = Array.from(contenedor.current?.querySelectorAll<HTMLElement>("[data-fila-contacto]") ?? []);
        const i = filas.indexOf(destino);
        const siguiente = filas[e.key === "ArrowDown" ? i + 1 : i - 1];
        if (siguiente) {
            e.preventDefault();
            siguiente.focus();
        }
    };

    // ── Acciones en lote ──
    const terminar = () => {
        setMarcados(new Set());
        setSeleccionando(false);
    };

    const anadirACategoria = (catId: string, nombre: string) => {
        for (const c of marcadosVisibles) {
            if (!c.categorias.includes(catId)) api.actualizar(c.id, { categorias: [...c.categorias, catId] });
        }
        toast.success(`${n === 1 ? "1 persona añadida" : `${n} personas añadidas`} a «${nombre}»`);
    };
    const anadirALista = (listaId: string, nombre: string) => {
        for (const c of marcadosVisibles) {
            if (!c.listas.includes(listaId)) api.actualizar(c.id, { listas: [...c.listas, listaId] });
        }
        toast.success(`${n === 1 ? "1 persona añadida" : `${n} personas añadidas`} a la lista «${nombre}»`);
    };
    const nuevaCategoriaYAnadir = async () => {
        const nombre = await preguntar({ title: "Nueva categoría", placeholder: "Nombre de la categoría", confirmText: "Crear y añadir" });
        if (!nombre?.trim()) return;
        const c = api.crearCategoria(nombre.trim(), colorSiguiente(api.categorias.length));
        anadirACategoria(c.id, c.nombre);
    };
    const nuevaListaYAnadir = async () => {
        const nombre = await preguntar({ title: "Nueva lista", placeholder: "Nombre de la lista", confirmText: "Crear y añadir" });
        if (!nombre?.trim()) return;
        const l = api.crearLista(nombre.trim(), colorSiguiente(api.listas.length + 3));
        anadirALista(l.id, l.nombre);
    };
    const quitarDeActual = () => {
        if (seleccion.tipo === "categoria") {
            for (const c of marcadosVisibles) api.actualizar(c.id, { categorias: c.categorias.filter((x) => x !== seleccion.id) });
        } else if (seleccion.tipo === "lista") {
            for (const c of marcadosVisibles) api.actualizar(c.id, { listas: c.listas.filter((x) => x !== seleccion.id) });
        }
        toast.success(`Quitado de «${titulo}»`);
        setMarcados(new Set());
    };
    const marcarFavoritos = () => {
        for (const c of marcadosVisibles) if (!c.favorito) api.actualizar(c.id, { favorito: true });
        toast.success(n === 1 ? "Marcado como favorito" : `${n} marcados como favoritos`);
    };
    const cambiarVisibilidadLote = async (v: "publica" | "privada") => {
        let hechos = 0;
        let sinCuenta = 0;
        for (const c of marcadosVisibles) {
            if (c.visibilidad === v) continue;
            if (v === "publica" && !c.userId) {
                sinCuenta++;
                continue;
            }
            const err = await aplicarVisibilidad(api, c.id, v);
            if (err) {
                toast.error(err);
                return;
            }
            hechos++;
        }
        const partes = [v === "publica" ? `${hechos} ahora ${hechos === 1 ? "es público" : "son públicos"}` : `${hechos} ahora ${hechos === 1 ? "es privado" : "son privados"}`];
        if (sinCuenta) partes.push(`${sinCuenta} sin cuenta StarSeed ${sinCuenta === 1 ? "sigue privado" : "siguen privados"}`);
        toast.success(partes.join(" · "));
    };
    const exportar = () => {
        const ok = descargarVcf(marcadosVisibles, nombreArchivoVcf(hoy, "seleccion"));
        if (ok) toast.success(n === 1 ? "1 contacto exportado (sin notas privadas)" : `${n} contactos exportados (sin notas privadas)`);
        else toast.error("Este navegador no permite descargar el archivo.");
    };
    const eliminarLote = async () => {
        const ok = await confirmar({
            title: n === 1 ? `¿Eliminar a ${marcadosVisibles[0]?.nombre}?` : `¿Eliminar ${n} contactos?`,
            description: "Se borran de tu libreta en todos tus dispositivos, con sus datos. Si estaban en tu lista pública, salen de ella.",
            confirmText: n === 1 ? "Eliminar contacto" : `Eliminar ${n} contactos`,
            destructive: true,
        });
        if (!ok) return;
        for (const c of marcadosVisibles) api.eliminar(c.id);
        toast.success(n === 1 ? "Contacto eliminado" : `${n} contactos eliminados`);
        terminar();
    };

    const sinContactos = api.contactos.length === 0;
    const botonSeleccionar = !sinContactos ? (
        <button
            type="button"
            onClick={() => (seleccionando ? terminar() : setSeleccionando(true))}
            aria-pressed={seleccionando}
            className={cn(CLASE_BOTON, "shrink-0 px-3 py-1.5")}
        >
            {seleccionando ? <X className="h-4 w-4" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />}
            {seleccionando ? "Listo" : "Seleccionar"}
        </button>
    ) : null;

    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="lista-contactos">
            <div className="flex flex-col gap-2.5 border-b border-white/[0.06] p-3 pb-3">
                {cabecera ? (
                    <div className="flex items-center justify-between gap-2">
                        {cabecera}
                        {botonSeleccionar}
                    </div>
                ) : null}
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] font-semibold leading-tight text-white">{titulo}</h2>
                        <p className="text-[12px] text-white/50" aria-live="polite">
                            {vista.total === 1 ? "1 persona" : `${vista.total} personas`}
                        </p>
                    </div>
                    {!cabecera ? botonSeleccionar : null}
                </div>
                {!sinContactos ? (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                                <label htmlFor={`${base}-q`} className="sr-only">
                                    Buscar contactos
                                </label>
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                                <input
                                    ref={refBusqueda as RefObject<HTMLInputElement> | undefined}
                                    id={`${base}-q`}
                                    type="search"
                                    value={texto}
                                    onChange={(e) => onTexto(e.target.value)}
                                    placeholder="Nombre, @ o teléfono"
                                    autoComplete="off"
                                    className={cn(CLASE_CAMPO, "pl-9", texto ? "pr-10" : "pr-3")}
                                />
                                {texto ? (
                                    <button
                                        type="button"
                                        onClick={() => onTexto("")}
                                        aria-label="Borrar búsqueda"
                                        className={cn(CLASE_BOTON_ICONO, "absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2")}
                                    >
                                        <X className="h-4 w-4" aria-hidden />
                                    </button>
                                ) : null}
                            </div>
                            {!esCumples ? (
                                <button
                                    type="button"
                                    onClick={() => setAjustesVista((v) => !v)}
                                    aria-expanded={ajustesVista}
                                    aria-controls={`${base}-vista`}
                                    aria-label="Orden y grupos"
                                    title="Orden y grupos"
                                    className={cn(CLASE_BOTON_ICONO, "h-11 w-11 border border-white/10 bg-white/[0.04] sm:hidden", ajustesVista && "border-[#14B8A6]/60 text-white")}
                                >
                                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                                </button>
                            ) : null}
                        </div>
                        {!esCumples ? (
                            <div id={`${base}-vista`} className={cn("gap-2 sm:grid sm:grid-cols-2", ajustesVista ? "grid grid-cols-1" : "hidden")}>
                                <SelectorVista etiqueta="Orden" icono={ArrowUpDown} valor={orden} opciones={OPCIONES_ORDEN} onCambiar={onOrden} />
                                <SelectorVista etiqueta="Agrupar" icono={Rows3} valor={agrupacion} opciones={OPCIONES_AGRUPACION} onCambiar={onAgrupacion} />
                            </div>
                        ) : (
                            <p className="px-1 text-[12px] text-white/50">Ordenados por fecha, de hoy a dentro de 30 días.</p>
                        )}
                    </>
                ) : null}
            </div>

            {sinContactos ? (
                vacio
            ) : (
                <div className="flex min-h-0 flex-1">
                    <div ref={contenedor} onKeyDown={alTeclear} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-2" data-testid="lista-contactos-scroll">
                        {seleccion.tipo === "todos" && !texto.trim() && proximos.length ? (
                            <div className="mb-2 px-1">
                                <FranjaCumpleanos proximos={proximos} hoy={hoy} onAbrir={onAbrir} onVerTodos={onVerCumpleanos} />
                            </div>
                        ) : null}

                        {vista.grupos.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                                <p className="text-[14px] text-white/70">
                                    {texto.trim() ? `Nadie coincide con «${texto.trim()}».` : esCumples ? "No hay cumpleaños en los próximos 30 días." : "Aquí todavía no hay nadie."}
                                </p>
                                {texto.trim() ? (
                                    <button type="button" onClick={() => onTexto("")} className={CLASE_BOTON}>
                                        Limpiar búsqueda
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            vista.grupos.map((g) => (
                                <section
                                    key={g.clave}
                                    aria-labelledby={agrupacion !== "ninguna" || esCumples ? `${base}-grupo-${g.clave}` : undefined}
                                    aria-label={agrupacion === "ninguna" && !esCumples ? titulo : undefined}
                                    className="mb-1.5"
                                >
                                    {agrupacion !== "ninguna" || esCumples ? (
                                        <h3
                                            id={`${base}-grupo-${g.clave}`}
                                            className="sticky top-0 z-[1] -mx-2 flex scroll-mt-1 items-center gap-2 bg-[rgba(12,14,34,0.88)] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60 backdrop-blur-md"
                                        >
                                            {g.color ? <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} /> : null}
                                            <span data-testid="cabecera-grupo">{g.titulo}</span>
                                            <span className="font-normal tracking-normal text-white/35">{g.contactos.length}</span>
                                        </h3>
                                    ) : null}
                                    <ul className="flex flex-col gap-0.5">
                                        {g.contactos.map((c) => {
                                            const cumple = vista.cumpleanos.get(c.id);
                                            return (
                                                <li key={`${g.clave}-${c.id}`}>
                                                    <FilaContacto
                                                        contacto={c}
                                                        activo={activoId === c.id}
                                                        seleccionando={seleccionando}
                                                        marcado={marcados.has(c.id)}
                                                        enLinea={Boolean(c.userId && presencia[c.userId])}
                                                        categorias={categorias}
                                                        extra={cumple ? etiquetaCumple(cumple, hoy) : undefined}
                                                        onClick={() => (seleccionando ? alternarMarca(c.id) : onAbrir(c.id))}
                                                    />
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))
                        )}
                    </div>
                    {mostrarIndice ? <IndiceLetras disponibles={disponibles} onIr={irALetra} /> : null}
                </div>
            )}

            {seleccionando ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-[rgba(12,14,34,0.7)] p-2.5" role="toolbar" aria-label="Acciones de la selección">
                    <p className="min-w-0 flex-1 text-[13px] font-medium text-white" aria-live="polite">
                        {n === 0 ? "Toca para marcar" : n === 1 ? "1 seleccionado" : `${n} seleccionados`}
                    </p>
                    <button
                        type="button"
                        onClick={() => setMarcados(n === vista.visibles.length ? new Set() : new Set(vista.visibles.map((c) => c.id)))}
                        className={cn(CLASE_BOTON, "px-3 py-1.5")}
                    >
                        {n === vista.visibles.length && n > 0 ? "Ninguno" : "Todos"}
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={n === 0}>
                            <button type="button" disabled={n === 0} className={cn(CLASE_BOTON, "px-3 py-1.5")} style={n ? pildora(ACENTO) : undefined}>
                                <MoreVertical className="h-4 w-4" aria-hidden />
                                Acciones
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="top" collisionPadding={12} className={cn(CLASE_MENU, "max-h-[70dvh] overflow-y-auto")}>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className={CLASE_ITEM_MENU}>
                                    <Tag className="h-4 w-4 text-white/60" aria-hidden />
                                    Añadir a categoría
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent collisionPadding={12} className={cn(CLASE_MENU, "max-h-[60dvh] overflow-y-auto")}>
                                    {api.categorias.map((cat) => (
                                        <DropdownMenuItem key={cat.id} className={CLASE_ITEM_MENU} onSelect={() => anadirACategoria(cat.id, cat.nombre)}>
                                            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                                            {cat.nombre}
                                        </DropdownMenuItem>
                                    ))}
                                    {api.categorias.length ? <DropdownMenuSeparator className="my-1 bg-white/10" /> : null}
                                    <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={() => void nuevaCategoriaYAnadir()}>
                                        Nueva categoría…
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className={CLASE_ITEM_MENU}>
                                    <ListChecks className="h-4 w-4 text-white/60" aria-hidden />
                                    Añadir a lista
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent collisionPadding={12} className={cn(CLASE_MENU, "max-h-[60dvh] overflow-y-auto")}>
                                    {api.listas.map((l) => (
                                        <DropdownMenuItem key={l.id} className={CLASE_ITEM_MENU} onSelect={() => anadirALista(l.id, l.nombre)}>
                                            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                                            {l.nombre}
                                        </DropdownMenuItem>
                                    ))}
                                    {api.listas.length ? <DropdownMenuSeparator className="my-1 bg-white/10" /> : null}
                                    <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={() => void nuevaListaYAnadir()}>
                                        Nueva lista…
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            {seleccion.tipo === "categoria" || seleccion.tipo === "lista" ? (
                                <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={quitarDeActual}>
                                    <UserMinus className="h-4 w-4 text-white/60" aria-hidden />
                                    Quitar de «{titulo}»
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={marcarFavoritos}>
                                <Star className="h-4 w-4 text-amber-300" aria-hidden />
                                Marcar como favoritos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 bg-white/10" />
                            <DropdownMenuLabel className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                Visibilidad
                            </DropdownMenuLabel>
                            <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={() => void cambiarVisibilidadLote("publica")}>
                                <Globe2 className="h-4 w-4" style={{ color: ACENTO }} aria-hidden />
                                Hacer públicos
                            </DropdownMenuItem>
                            <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={() => void cambiarVisibilidadLote("privada")}>
                                <Lock className="h-4 w-4 text-white/60" aria-hidden />
                                Hacer privados
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 bg-white/10" />
                            <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={exportar}>
                                <Download className="h-4 w-4 text-white/60" aria-hidden />
                                Exportar vCard
                            </DropdownMenuItem>
                            <DropdownMenuItem className={cn(CLASE_ITEM_MENU, "text-rose-200 focus:bg-rose-500/20 focus:text-white")} onSelect={() => void eliminarLote()}>
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Eliminar…
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : null}
        </div>
    );
}
