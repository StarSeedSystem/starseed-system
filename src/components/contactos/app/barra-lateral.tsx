"use client";

/**
 * BarraLateral — carpetas de la libreta: vistas rápidas (Todos, Favoritos, Públicos, Privados,
 * En StarSeed, Próximos cumpleaños), relaciones con su color y recuento, y las categorías y
 * listas propias, que se crean, renombran, recolorean y eliminan aquí mismo.
 */

import { useId, useState, type ReactNode } from "react";
import { Cake, Check, Globe2, Lock, Pencil, Plus, Sparkles, Star, Trash2, Users, type LucideIcon } from "lucide-react";

import { RELACIONES, type CategoriaContactos, type ContactosApi, type ListaContactos } from "@/lib/contactos/tipos";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_BOTON_PRINCIPAL,
    CLASE_CAMPO,
    CLASE_FOCO,
    CLASE_ROTULO,
    colorSiguiente,
} from "@/components/contactos/app/estilos";
import { SelectorColor } from "@/components/contactos/app/piezas";
import { mismaSeleccion, type RecuentosLateral, type SeleccionLateral } from "@/components/contactos/app/vista";

export interface BarraLateralProps {
    api: ContactosApi;
    seleccion: SeleccionLateral;
    onSeleccionar: (s: SeleccionLateral) => void;
    recuentos: RecuentosLateral;
}

function Fila({
    activo,
    onClick,
    icono,
    color,
    texto,
    detalle,
    cuenta,
    apagado,
    acciones,
}: {
    activo: boolean;
    onClick: () => void;
    icono?: LucideIcon;
    color?: string;
    texto: string;
    detalle?: string;
    cuenta?: number;
    apagado?: boolean;
    acciones?: ReactNode;
}) {
    const Icono = icono;
    return (
        <li className="group/fila relative flex items-center">
            <button
                type="button"
                onClick={onClick}
                aria-current={activo ? "true" : undefined}
                className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] transition-all duration-200",
                    activo ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-white/75 hover:bg-white/[0.05] hover:text-white",
                    apagado && !activo && "text-white/40",
                    acciones && "max-md:pr-[4.75rem]",
                    CLASE_FOCO,
                )}
            >
                {Icono ? (
                    <Icono className="h-4 w-4 shrink-0" style={{ color: activo ? ACENTO : color ?? "rgba(255,255,255,0.55)" }} aria-hidden />
                ) : (
                    <span
                        aria-hidden
                        className="ml-1 mr-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: color, boxShadow: apagado ? undefined : `0 0 8px ${color}99` }}
                    />
                )}
                <span className="min-w-0 flex-1">
                    <span className="block break-words leading-snug">{texto}</span>
                    {detalle ? <span className="block break-words text-[12px] leading-snug text-white/45">{detalle}</span> : null}
                </span>
                {cuenta !== undefined ? (
                    <span className={cn("shrink-0 text-[12px] tabular-nums", activo ? "text-white/80" : "text-white/40", acciones && "group-hover/fila:opacity-0 group-focus-within/fila:opacity-0")}>
                        {cuenta}
                    </span>
                ) : null}
            </button>
            {acciones ? (
                <div className="absolute right-1 flex items-center gap-0.5 rounded-xl bg-[rgb(17,19,42)] pl-1 opacity-0 shadow-[-14px_0_14px_rgb(17,19,42)] transition-opacity duration-150 focus-within:opacity-100 group-hover/fila:opacity-100 max-md:bg-transparent max-md:opacity-100 max-md:shadow-none">
                    {acciones}
                </div>
            ) : null}
        </li>
    );
}

/** Formulario en línea para crear o editar una categoría/lista. */
function FormularioEtiqueta({
    inicial,
    conDescripcion,
    textoGuardar,
    onGuardar,
    onCancelar,
}: {
    inicial: { nombre: string; color: string; descripcion?: string };
    conDescripcion?: boolean;
    textoGuardar: string;
    onGuardar: (v: { nombre: string; color: string; descripcion?: string }) => void;
    onCancelar: () => void;
}) {
    const id = useId();
    const [nombre, setNombre] = useState(inicial.nombre);
    const [color, setColor] = useState(inicial.color);
    const [descripcion, setDescripcion] = useState(inicial.descripcion ?? "");
    const guardar = () => {
        if (!nombre.trim()) return;
        onGuardar({ nombre: nombre.trim(), color, descripcion: conDescripcion ? descripcion.trim() : undefined });
    };
    return (
        <li className="rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.08]">
            <form
                className="flex flex-col gap-2.5"
                onSubmit={(e) => {
                    e.preventDefault();
                    guardar();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        onCancelar();
                    }
                }}
            >
                <label htmlFor={`${id}-n`} className="sr-only">
                    Nombre
                </label>
                <input id={`${id}-n`} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={CLASE_CAMPO} />
                {conDescripcion ? (
                    <>
                        <label htmlFor={`${id}-d`} className="sr-only">
                            Descripción
                        </label>
                        <input
                            id={`${id}-d`}
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                            placeholder="Descripción (opcional)"
                            className={CLASE_CAMPO}
                        />
                    </>
                ) : null}
                <SelectorColor valor={color} onCambiar={setColor} />
                <div className="flex flex-wrap justify-end gap-1.5">
                    <button type="button" onClick={onCancelar} className={cn(CLASE_BOTON, "px-3 py-1.5")}>
                        Cancelar
                    </button>
                    <button type="submit" disabled={!nombre.trim()} className={cn(CLASE_BOTON_PRINCIPAL, "px-3 py-1.5")}>
                        <Check className="h-4 w-4" aria-hidden />
                        {textoGuardar}
                    </button>
                </div>
            </form>
        </li>
    );
}

function GrupoEditable<T extends CategoriaContactos | ListaContactos>({
    titulo,
    tipo,
    items,
    recuentos,
    seleccion,
    onSeleccionar,
    onCrear,
    onEditar,
    onEliminar,
    conDescripcion,
}: {
    titulo: string;
    tipo: "categoria" | "lista";
    items: T[];
    recuentos: Record<string, number>;
    seleccion: SeleccionLateral;
    onSeleccionar: (s: SeleccionLateral) => void;
    onCrear: (v: { nombre: string; color: string; descripcion?: string }) => void;
    onEditar: (id: string, v: { nombre: string; color: string; descripcion?: string }) => void;
    onEliminar: (item: T) => void;
    conDescripcion?: boolean;
}) {
    const [creando, setCreando] = useState(false);
    const [editando, setEditando] = useState<string | null>(null);
    const singular = tipo === "categoria" ? "categoría" : "lista";
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
                <h3 className={CLASE_ROTULO}>{titulo}</h3>
                <button
                    type="button"
                    onClick={() => {
                        setEditando(null);
                        setCreando(true);
                    }}
                    aria-label={`Nueva ${singular}`}
                    title={`Nueva ${singular}`}
                    className={cn(CLASE_BOTON_ICONO, "h-7 w-7")}
                >
                    <Plus className="h-4 w-4" aria-hidden />
                </button>
            </div>
            <ul className="flex flex-col gap-0.5">
                {items.map((it) =>
                    editando === it.id ? (
                        <FormularioEtiqueta
                            key={it.id}
                            inicial={{ nombre: it.nombre, color: it.color, descripcion: "descripcion" in it ? it.descripcion : undefined }}
                            conDescripcion={conDescripcion}
                            textoGuardar="Guardar"
                            onGuardar={(v) => {
                                onEditar(it.id, v);
                                setEditando(null);
                            }}
                            onCancelar={() => setEditando(null)}
                        />
                    ) : (
                        <Fila
                            key={it.id}
                            activo={mismaSeleccion(seleccion, { tipo, id: it.id })}
                            onClick={() => onSeleccionar({ tipo, id: it.id })}
                            color={it.color}
                            texto={it.nombre}
                            detalle={"descripcion" in it ? it.descripcion : undefined}
                            cuenta={recuentos[it.id] ?? 0}
                            acciones={
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCreando(false);
                                            setEditando(it.id);
                                        }}
                                        aria-label={`Editar ${singular} ${it.nombre}`}
                                        title="Renombrar o cambiar color"
                                        className={cn(CLASE_BOTON_ICONO, "h-7 w-7")}
                                    >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onEliminar(it)}
                                        aria-label={`Eliminar ${singular} ${it.nombre}`}
                                        title={`Eliminar ${singular}`}
                                        className={cn(CLASE_BOTON_ICONO, "h-7 w-7 hover:text-rose-300")}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </>
                            }
                        />
                    ),
                )}
                {creando ? (
                    <FormularioEtiqueta
                        inicial={{ nombre: "", color: colorSiguiente(items.length + (tipo === "lista" ? 3 : 0)) }}
                        conDescripcion={conDescripcion}
                        textoGuardar="Crear"
                        onGuardar={(v) => {
                            onCrear(v);
                            setCreando(false);
                        }}
                        onCancelar={() => setCreando(false)}
                    />
                ) : null}
                {!items.length && !creando ? (
                    <li>
                        <button
                            type="button"
                            onClick={() => setCreando(true)}
                            className={cn("flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/75", CLASE_FOCO)}
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Crear la primera {singular}
                        </button>
                    </li>
                ) : null}
            </ul>
        </div>
    );
}

export function BarraLateral({ api, seleccion, onSeleccionar, recuentos }: BarraLateralProps) {
    const confirmar = useConfirm();
    const vistas: { sel: SeleccionLateral; texto: string; icono: LucideIcon; cuenta: number }[] = [
        { sel: { tipo: "todos" }, texto: "Todos", icono: Users, cuenta: recuentos.todos },
        { sel: { tipo: "favoritos" }, texto: "Favoritos", icono: Star, cuenta: recuentos.favoritos },
        { sel: { tipo: "publicos" }, texto: "Públicos", icono: Globe2, cuenta: recuentos.publicos },
        { sel: { tipo: "privados" }, texto: "Privados", icono: Lock, cuenta: recuentos.privados },
        { sel: { tipo: "starseed" }, texto: "En StarSeed", icono: Sparkles, cuenta: recuentos.starseed },
        { sel: { tipo: "cumpleanos" }, texto: "Próximos cumpleaños", icono: Cake, cuenta: recuentos.cumpleanos },
    ];

    const eliminarCategoria = async (c: CategoriaContactos) => {
        const ok = await confirmar({
            title: `¿Eliminar la categoría «${c.nombre}»?`,
            description: "Las personas no se borran: solo dejan de tener esta categoría.",
            confirmText: "Eliminar categoría",
            destructive: true,
        });
        if (!ok) return;
        api.eliminarCategoria(c.id);
        if (mismaSeleccion(seleccion, { tipo: "categoria", id: c.id })) onSeleccionar({ tipo: "todos" });
    };

    const eliminarLista = async (l: ListaContactos) => {
        const ok = await confirmar({
            title: `¿Eliminar la lista «${l.nombre}»?`,
            description: "Las personas no se borran: solo salen de esta lista.",
            confirmText: "Eliminar lista",
            destructive: true,
        });
        if (!ok) return;
        api.eliminarLista(l.id);
        if (mismaSeleccion(seleccion, { tipo: "lista", id: l.id })) onSeleccionar({ tipo: "todos" });
    };

    return (
        <nav aria-label="Carpetas de contactos" className="flex flex-col gap-1 p-2.5" data-testid="barra-lateral-contactos">
            <ul className="flex flex-col gap-0.5">
                {vistas.map((v) => (
                    <Fila
                        key={v.texto}
                        activo={mismaSeleccion(seleccion, v.sel)}
                        onClick={() => onSeleccionar(v.sel)}
                        icono={v.icono}
                        texto={v.texto}
                        cuenta={v.cuenta}
                    />
                ))}
            </ul>

            <div className="flex flex-col gap-1">
                <h3 className={cn(CLASE_ROTULO, "px-2.5 pb-1 pt-3")}>Relación</h3>
                <ul className="flex flex-col gap-0.5">
                    {RELACIONES.map((r) => (
                        <Fila
                            key={r.id}
                            activo={mismaSeleccion(seleccion, { tipo: "relacion", id: r.id })}
                            onClick={() => onSeleccionar({ tipo: "relacion", id: r.id })}
                            color={r.color}
                            texto={r.etiqueta}
                            cuenta={recuentos.relacion[r.id] ?? 0}
                            apagado={!recuentos.relacion[r.id]}
                        />
                    ))}
                </ul>
            </div>

            <GrupoEditable
                titulo="Categorías"
                tipo="categoria"
                items={api.categorias}
                recuentos={recuentos.categoria}
                seleccion={seleccion}
                onSeleccionar={onSeleccionar}
                onCrear={(v) => {
                    const c = api.crearCategoria(v.nombre, v.color);
                    onSeleccionar({ tipo: "categoria", id: c.id });
                }}
                onEditar={(id, v) => api.editarCategoria(id, { nombre: v.nombre, color: v.color })}
                onEliminar={(c) => void eliminarCategoria(c)}
            />

            <GrupoEditable
                titulo="Listas"
                tipo="lista"
                items={api.listas}
                recuentos={recuentos.lista}
                seleccion={seleccion}
                onSeleccionar={onSeleccionar}
                onCrear={(v) => {
                    const l = api.crearLista(v.nombre, v.color, v.descripcion);
                    onSeleccionar({ tipo: "lista", id: l.id });
                }}
                onEditar={(id, v) => api.editarLista(id, { nombre: v.nombre, color: v.color, descripcion: v.descripcion || undefined })}
                onEliminar={(l) => void eliminarLista(l)}
                conDescripcion
            />
        </nav>
    );
}

