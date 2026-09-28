"use client";

/**
 * «Carpetas del chat»: ordenar lo compartido en carpetas con nombre y color. Cada carpeta es
 * privada (solo tú), del chat (todos sus miembros) o pública (además, en tu Biblioteca).
 * Se crean, se abren (rejilla o lista), se renombran, se eliminan y se publican.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, BookUp, Check, ExternalLink, FileText, Folder, FolderPlus, Globe2, ImageOff, LayoutGrid, Link2, List,
    Loader2, Lock, MessageSquareShare, MoreVertical, Music, Pencil, Phone, Play, Radio, Sparkles, Trash2, Users, X,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { CarpetaHilo, CategoriaArchivo, ItemCarpeta, VisibilidadCarpeta } from "@/lib/mensajeria/carpetas-tipos";
import { useContextoHilo } from "@/components/messages/dm/contexto-hilo";
import { RotuloSeccion, Segmentado, VIDRIO_ITEM } from "@/components/messages/info/piezas";

const COLORES = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#DC143C", "#14B8A6", "#EC4899", "#94A3B8"];

export const VISIBILIDADES: { id: VisibilidadCarpeta; etiqueta: string; explicacion: string; icono: typeof Lock }[] = [
    { id: "privada", etiqueta: "Privada", explicacion: "Solo la ves tú, en todos tus dispositivos.", icono: Lock },
    { id: "chat", etiqueta: "Del chat", explicacion: "La ven y la editan todas las personas de este chat.", icono: Users },
    { id: "publica", etiqueta: "Pública", explicacion: "Como «del chat» y, además, publicada en tu Biblioteca para quien quieras.", icono: Globe2 },
];

const ICONO_ITEM: Record<CategoriaArchivo, typeof FileText> = {
    imagen: FileText,
    video: Play,
    audio: Music,
    documento: FileText,
    enlace: Link2,
    vivo: Radio,
    llamada: Phone,
    mensaje: Sparkles,
    otro: FileText,
};

function FormularioCarpeta({ onCrear, onCancelar }: { onCrear: (nombre: string, v: VisibilidadCarpeta, color: string) => Promise<void>; onCancelar: () => void }) {
    const [nombre, setNombre] = useState("");
    const [visibilidad, setVisibilidad] = useState<VisibilidadCarpeta>("privada");
    const [color, setColor] = useState(COLORES[0]);
    const [creando, setCreando] = useState(false);
    const crear = async () => {
        if (!nombre.trim()) return;
        setCreando(true);
        try {
            await onCrear(nombre.trim(), visibilidad, color);
        } finally {
            setCreando(false);
        }
    };
    const info = VISIBILIDADES.find((v) => v.id === visibilidad)!;
    return (
        <div className="space-y-3 rounded-[20px] p-3.5" style={VIDRIO_ITEM}>
            <RotuloSeccion>Nueva carpeta</RotuloSeccion>
            <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") void crear();
                    if (e.key === "Escape") onCancelar();
                }}
                maxLength={60}
                placeholder="Nombre: recetas, viaje, documentos…"
                aria-label="Nombre de la carpeta"
                className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-[14px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60"
            />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de la carpeta">
                {COLORES.map((c) => (
                    <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={color === c}
                        aria-label={`Color ${c}`}
                        onClick={() => setColor(c)}
                        className={cn("ss-redondo grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#0c0e22]")}
                        style={{ background: c }}
                    >
                        {color === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                ))}
            </div>
            <div className="space-y-1.5">
                <Segmentado etiqueta="Quién la ve" valor={visibilidad} onCambiar={setVisibilidad} opciones={VISIBILIDADES.map((v) => ({ id: v.id, etiqueta: v.etiqueta }))} />
                <p className="flex items-start gap-1.5 px-1 text-[12.5px] text-white/60">
                    <info.icono className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {info.explicacion}
                </p>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancelar} className="cursor-pointer rounded-xl px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white">
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => void crear()}
                    disabled={!nombre.trim() || creando}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#7C5CFF,#5B3FD9)" }}
                >
                    {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Crear carpeta
                </button>
            </div>
        </div>
    );
}

function ElementoCarpeta({ item, vista, onAbrir, onQuitar, onIr }: { item: ItemCarpeta; vista: "rejilla" | "lista"; onAbrir: () => void; onQuitar: () => void; onIr: () => void }) {
    const [fallo, setFallo] = useState(false);
    const Icono = ICONO_ITEM[item.categoria] ?? FileText;
    const esImagen = item.categoria === "imagen" && !!item.url;
    const acciones = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Acciones de ${item.titulo}`} className="ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                    <MoreVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={12} className="min-w-[200px]">
                <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onAbrir}>
                    <ExternalLink className="h-4 w-4" /> Abrir
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onIr}>
                    <MessageSquareShare className="h-4 w-4" /> Ir al mensaje
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-red-300 focus:text-red-300" onSelect={onQuitar}>
                    <X className="h-4 w-4" /> Quitar de la carpeta
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
    if (vista === "rejilla") {
        return (
            <div className="group/elemento relative">
                <button type="button" onClick={onAbrir} aria-label={`Abrir ${item.titulo}`} className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl p-2 text-center" style={VIDRIO_ITEM}>
                    {esImagen && !fallo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={item.titulo} loading="lazy" onError={() => setFallo(true)} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                        <>
                            {esImagen ? <ImageOff className="h-6 w-6 text-white/45" /> : <Icono className="h-6 w-6 text-white/60" />}
                            <span className="line-clamp-2 text-[11px] text-white/75">{item.titulo}</span>
                        </>
                    )}
                </button>
                <div className="absolute right-1 top-1 rounded-full bg-black/45 md:opacity-0 md:group-hover/elemento:opacity-100 md:focus-within:opacity-100">{acciones}</div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-white/[0.04]">
            <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl" style={VIDRIO_ITEM}>
                    {esImagen && !fallo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt="" onError={() => setFallo(true)} className="h-full w-full object-cover" />
                    ) : (
                        <Icono className="h-[18px] w-[18px] text-white/60" />
                    )}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-white/90">{item.titulo}</span>
                    <span className="block text-[12px] text-white/50">{new Date(item.agregado).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
            </button>
            {acciones}
        </div>
    );
}

function VistaCarpeta({ carpeta, onVolver }: { carpeta: CarpetaHilo; onVolver: () => void }) {
    const ctx = useContextoHilo()!;
    const [vista, setVista] = useState<"rejilla" | "lista">("lista");
    const items = carpeta.items.filter((i) => !i.borrado);
    const Vis = VISIBILIDADES.find((v) => v.id === carpeta.visibilidad) ?? VISIBILIDADES[0];
    const abrir = (i: ItemCarpeta) => {
        if (i.url && i.categoria !== "mensaje") window.open(i.url, "_blank", "noopener,noreferrer");
        else if (i.categoria === "mensaje") ctx.abrirVisor(i.mensajeId);
        else ctx.irAlMensaje(i.mensajeId);
    };
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button type="button" onClick={onVolver} aria-label="Volver a las carpetas" className="ss-redondo grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${carpeta.color}24`, boxShadow: `inset 0 0 0 1px ${carpeta.color}66`, color: carpeta.color }}>
                    <Folder className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{carpeta.nombre}</p>
                    <p className="flex items-center gap-1 text-[12px] text-white/55"><Vis.icono className="h-3 w-3" /> {Vis.etiqueta} · {items.length} {items.length === 1 ? "elemento" : "elementos"}</p>
                </div>
                <Segmentado
                    etiqueta="Vista"
                    valor={vista}
                    onCambiar={setVista}
                    opciones={[
                        { id: "lista", etiqueta: "Lista" },
                        { id: "rejilla", etiqueta: "Rejilla" },
                    ]}
                />
            </div>
            {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                    {vista === "lista" ? <List className="h-7 w-7 text-white/30" /> : <LayoutGrid className="h-7 w-7 text-white/30" />}
                    <p className="max-w-[260px] text-[13px] text-white/60">Vacía por ahora. Guarda aquí mensajes o archivos desde su menú «Guardar en carpeta del chat».</p>
                </div>
            ) : (
                <div className={vista === "rejilla" ? "grid grid-cols-3 gap-1.5 sm:grid-cols-4" : "space-y-0.5"}>
                    {items.map((i) => (
                        <ElementoCarpeta
                            key={i.id}
                            item={i}
                            vista={vista}
                            onAbrir={() => abrir(i)}
                            onIr={() => ctx.irAlMensaje(i.mensajeId)}
                            onQuitar={() => void ctx.carpetas.quitarItem(carpeta.id, i.id).then(() => toast.success("Quitado de la carpeta"))}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function CarpetasHilo() {
    const ctx = useContextoHilo();
    const confirmar = useConfirm();
    const pedir = usePrompt();
    const [creando, setCreando] = useState(false);
    const [abiertaId, setAbiertaId] = useState<string | null>(null);
    const [publicando, setPublicando] = useState<string | null>(null);

    const carpetas = useMemo(() => (ctx?.carpetas.carpetas ?? []).filter((c) => !c.borrado), [ctx?.carpetas.carpetas]);
    if (!ctx) return null;
    const api = ctx.carpetas;
    const abierta = carpetas.find((c) => c.id === abiertaId);
    if (abierta) return <VistaCarpeta carpeta={abierta} onVolver={() => setAbiertaId(null)} />;

    const crear = async (nombre: string, v: VisibilidadCarpeta, color: string) => {
        const c = await api.crear(nombre, v, color);
        if (c) {
            toast.success(`Carpeta «${c.nombre}» creada`);
            setCreando(false);
        } else {
            toast.error(api.error || "No se pudo crear la carpeta. Inténtalo de nuevo.");
        }
    };

    const renombrar = async (c: CarpetaHilo) => {
        const nombre = await pedir({ title: "Renombrar carpeta", label: "Nombre", defaultValue: c.nombre, confirmText: "Guardar" });
        if (!nombre?.trim() || nombre.trim() === c.nombre) return;
        await api.renombrar(c.id, nombre.trim());
    };

    const eliminar = async (c: CarpetaHilo) => {
        const ok = await confirmar({
            title: `¿Eliminar «${c.nombre}»?`,
            description: c.visibilidad === "privada"
                ? "Se elimina la carpeta; los mensajes y archivos siguen en el chat."
                : "Se elimina para todas las personas del chat; los mensajes y archivos siguen en el chat.",
            confirmText: "Eliminar carpeta",
            destructive: true,
        });
        if (!ok) return;
        await api.eliminar(c.id);
        toast.success("Carpeta eliminada");
    };

    const publicar = async (c: CarpetaHilo) => {
        setPublicando(c.id);
        try {
            const id = await api.publicarEnBiblioteca(c.id);
            if (id) toast.success(`«${c.nombre}» ya está en tu Biblioteca`);
            else toast.error(api.error || "No se pudo publicar en la Biblioteca.");
        } finally {
            setPublicando(null);
        }
    };

    return (
        <div className="space-y-3 pb-6">
            {creando ? (
                <FormularioCarpeta onCrear={crear} onCancelar={() => setCreando(false)} />
            ) : (
                <button
                    type="button"
                    onClick={() => setCreando(true)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left text-[14px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                    style={{ background: "rgba(124,92,255,.10)", boxShadow: "inset 0 0 0 1px rgba(124,92,255,.35)" }}
                >
                    <FolderPlus className="h-5 w-5 text-[#b7a6ff]" /> Nueva carpeta
                </button>
            )}

            {api.error && <p className="px-1 text-[12.5px] text-amber-200/90" role="status">{api.error}</p>}

            {!api.listo && carpetas.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-white/55" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando carpetas…
                </div>
            )}

            {api.listo && carpetas.length === 0 && !creando && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <Folder className="h-8 w-8 text-white/30" />
                    <p className="max-w-[270px] text-[13px] text-white/60">Crea carpetas para ordenar fotos, documentos, enlaces y mensajes de este chat.</p>
                </div>
            )}

            <div className="space-y-1">
                {carpetas.map((c) => {
                    const Vis = VISIBILIDADES.find((v) => v.id === c.visibilidad) ?? VISIBILIDADES[0];
                    const n = c.items.filter((i) => !i.borrado).length;
                    return (
                        <div key={c.id} className="flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                            <button type="button" onClick={() => setAbiertaId(c.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 text-left" aria-label={`Abrir la carpeta ${c.nombre}`}>
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${c.color}24`, boxShadow: `inset 0 0 0 1px ${c.color}66`, color: c.color }}>
                                    <Folder className="h-5 w-5" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[14px] font-medium text-white/90">{c.nombre}</span>
                                    <span className="flex items-center gap-1 text-[12px] text-white/50">
                                        <Vis.icono className="h-3 w-3" /> {Vis.etiqueta} · {n} {n === 1 ? "elemento" : "elementos"}
                                        {c.carpetaBibliotecaId && <span className="text-[#6EE7B7]"> · en tu Biblioteca</span>}
                                    </span>
                                </span>
                            </button>
                            {publicando === c.id && <Loader2 className="h-4 w-4 animate-spin text-white/60" />}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" aria-label={`Acciones de ${c.nombre}`} className="ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                                        <MoreVertical className="h-4 w-4" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" collisionPadding={12} className="min-w-[220px]">
                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => setAbiertaId(c.id)}>
                                        <Folder className="h-4 w-4" /> Abrir
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void renombrar(c)}>
                                        <Pencil className="h-4 w-4" /> Renombrar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void publicar(c)}>
                                        <BookUp className="h-4 w-4" /> {c.carpetaBibliotecaId ? "Actualizar en la Biblioteca" : "Publicar en la Biblioteca"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer gap-2 text-red-300 focus:text-red-300" onSelect={() => void eliminar(c)}>
                                        <Trash2 className="h-4 w-4" /> Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                })}
            </div>

            <div className="space-y-1.5 rounded-2xl px-3 py-2.5 text-[12px] text-white/55" style={{ background: "rgba(255,255,255,.03)" }}>
                {VISIBILIDADES.map((v) => (
                    <p key={v.id} className="flex items-start gap-1.5">
                        <v.icono className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><span className="font-medium text-white/75">{v.etiqueta}:</span> {v.explicacion}</span>
                    </p>
                ))}
            </div>
        </div>
    );
}

export default CarpetasHilo;
