"use client";

/**
 * «Archivos, enlaces y documentos» de un chat: pestañas por tipo con su número, búsqueda,
 * orden, filtro por quién lo envió, rejilla por meses para fotos y vídeos (con visor) y filas
 * para lo demás. Cada elemento tiene su menú vertical: abrir, descargar, guardar en una carpeta
 * del chat, guardar en la Biblioteca o ir al mensaje.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowDownUp, Download, ExternalLink, FileText, FolderOpen, ImageOff, Link2, Loader2, MessageSquareShare, MoreVertical,
    Music, Phone, Play, Radio, Search, Sparkles, File as FileIcon,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SaveToLibrary } from "@/components/library/save-to-library";
import type { SaveItemInput } from "@/lib/library/entity-library";
import { humanFileSize } from "@/lib/files/os-files";
import type { CategoriaArchivo } from "@/lib/mensajeria/carpetas-tipos";
// Contrato C7.
import { listThreadMedia, type DmMessage } from "@/lib/messages/dm";
import {
    agruparArchivosPorMes, contarPorCategoria, filtrarArchivos, ordenarArchivos, recopilarArchivos, type ArchivoHilo,
} from "@/lib/mensajeria/archivos";
import { useContextoHilo } from "@/components/messages/dm/contexto-hilo";
import { SubmenuGuardarEnCarpeta } from "@/components/messages/dm/menu-guardar-carpeta";
import { VisorMedios } from "@/components/messages/info/visor-medios";
import { Segmentado, VIDRIO_ITEM } from "@/components/messages/info/piezas";

type Pestana = "todo" | "medios" | "documento" | "enlace" | "audio" | "vivo" | "llamada" | "mensaje";
type Orden = "reciente" | "antiguo" | "nombre" | "tamano" | "tipo";

const PESTANAS: { id: Pestana; etiqueta: string; cats: CategoriaArchivo[] | null }[] = [
    { id: "todo", etiqueta: "Todo", cats: null },
    { id: "medios", etiqueta: "Fotos y vídeos", cats: ["imagen", "video"] },
    { id: "documento", etiqueta: "Documentos", cats: ["documento", "otro"] },
    { id: "enlace", etiqueta: "Enlaces", cats: ["enlace"] },
    { id: "audio", etiqueta: "Audio", cats: ["audio"] },
    { id: "vivo", etiqueta: "Apps en vivo", cats: ["vivo"] },
    { id: "llamada", etiqueta: "Llamadas", cats: ["llamada"] },
    { id: "mensaje", etiqueta: "Mensajes enriquecidos", cats: ["mensaje"] },
];

const ORDENES: { id: Orden; etiqueta: string }[] = [
    { id: "reciente", etiqueta: "Más recientes" },
    { id: "antiguo", etiqueta: "Más antiguos" },
    { id: "nombre", etiqueta: "Nombre" },
    { id: "tamano", etiqueta: "Tamaño" },
    { id: "tipo", etiqueta: "Tipo" },
];

const ICONO: Record<CategoriaArchivo, typeof FileText> = {
    imagen: FileIcon,
    video: Play,
    audio: Music,
    documento: FileText,
    enlace: Link2,
    vivo: Radio,
    llamada: Phone,
    mensaje: Sparkles,
    otro: FileIcon,
};

const COLOR: Record<CategoriaArchivo, string> = {
    imagen: "#7C5CFF",
    video: "#7C5CFF",
    audio: "#EC4899",
    documento: "#FFBF00",
    enlace: "#007FFF",
    vivo: "#10B981",
    llamada: "#14B8A6",
    mensaje: "#b7a6ff",
    otro: "#94A3B8",
};

const esMedio = (a: ArchivoHilo) => a.categoria === "imagen" || a.categoria === "video";

function tipoBiblioteca(a: ArchivoHilo): SaveItemInput["type"] {
    if (a.categoria === "enlace") return "external";
    if (a.categoria === "vivo" || a.categoria === "llamada") return "route";
    if (a.categoria === "mensaje") return "message";
    return "file";
}

function Miniatura({ item, onAbrir }: { item: ArchivoHilo; onAbrir: () => void }) {
    const [fallo, setFallo] = useState(false);
    return (
        <button
            type="button"
            onClick={onAbrir}
            aria-label={`Abrir ${item.nombre}`}
            className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-xl transition-transform duration-200 hover:scale-[1.02]"
            style={VIDRIO_ITEM}
        >
            {item.url && !fallo ? (
                item.categoria === "video" ? (
                    <video src={item.url} preload="metadata" muted className="h-full w-full object-cover" onError={() => setFallo(true)} />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.nombre} loading="lazy" className="h-full w-full object-cover" onError={() => setFallo(true)} />
                )
            ) : (
                <span className="grid h-full w-full place-items-center text-white/45" title="Ya no está disponible en el almacenamiento">
                    <ImageOff className="h-5 w-5" />
                </span>
            )}
            {item.categoria === "video" && (
                <span className="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
                    <Play className="h-3 w-3 fill-current" />
                </span>
            )}
        </button>
    );
}

function MenuElemento({ item, onAbrir }: { item: ArchivoHilo; onAbrir: () => void }) {
    const ctx = useContextoHilo();
    const descargable = !!item.url && !["enlace", "vivo", "llamada", "mensaje"].includes(item.categoria);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Acciones de ${item.nombre}`}
                    className="ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <MoreVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={12} className="min-w-[230px]">
                <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onAbrir}>
                    <ExternalLink className="h-4 w-4" /> Abrir
                </DropdownMenuItem>
                {descargable && (
                    <DropdownMenuItem asChild className="cursor-pointer gap-2">
                        <a href={item.url} download={item.nombre} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" /> Descargar
                        </a>
                    </DropdownMenuItem>
                )}
                {ctx && (
                    <SubmenuGuardarEnCarpeta
                        item={{ mensajeId: item.mensajeId, adjuntoIndice: item.adjuntoIndice, titulo: item.nombre, categoria: item.categoria, url: item.url }}
                    />
                )}
                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                    <div className="px-0 py-0">
                        <SaveToLibrary
                            variant="menu-item"
                            label="Guardar en Biblioteca"
                            item={{
                                type: tipoBiblioteca(item),
                                refId: item.adjuntoIndice === null ? item.mensajeId : `${item.mensajeId}:${item.adjuntoIndice}`,
                                title: item.nombre,
                                url: item.url,
                                route: item.ruta,
                                mime: item.mime,
                            }}
                        />
                    </div>
                </DropdownMenuItem>
                {ctx && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => ctx.irAlMensaje(item.mensajeId)}>
                            <MessageSquareShare className="h-4 w-4" /> Ir al mensaje
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function FilaArchivo({ item, nombreDe, onAbrir }: { item: ArchivoHilo; nombreDe: (uid: string | null) => string; onAbrir: () => void }) {
    const Icono = ICONO[item.categoria] ?? FileIcon;
    const color = COLOR[item.categoria] ?? "#94A3B8";
    const detalles = [
        item.mio ? "Tú" : nombreDe(item.remitente),
        new Date(item.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
        item.tamano ? humanFileSize(item.tamano) : null,
        item.categoria === "enlace" ? item.host : item.extension?.toUpperCase(),
    ].filter(Boolean);
    return (
        <div className="flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
            <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" aria-label={`Abrir ${item.nombre}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55`, color }}>
                    <Icono className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-white/90">{item.nombre}</span>
                    <span className="block truncate text-[12px] text-white/50">{detalles.join(" · ")}</span>
                </span>
            </button>
            <MenuElemento item={item} onAbrir={onAbrir} />
        </div>
    );
}

export function ArchivosHilo({ hiloId, miUid }: { hiloId: string; miUid: string | null }) {
    const ctx = useContextoHilo();
    const router = useRouter();
    const [remotos, setRemotos] = useState<DmMessage[]>([]);
    const [cargando, setCargando] = useState(true);
    const [pestana, setPestana] = useState<Pestana>("todo");
    const [texto, setTexto] = useState("");
    const [orden, setOrden] = useState<Orden>("reciente");
    const [remitente, setRemitente] = useState<"todos" | "yo" | "otros">("todos");
    const [visor, setVisor] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        setCargando(true);
        void listThreadMedia(hiloId)
            .then((xs) => {
                if (vivo) setRemotos(Array.isArray(xs) ? xs : []);
            })
            .catch(() => undefined)
            .finally(() => {
                if (vivo) setCargando(false);
            });
        return () => {
            vivo = false;
        };
    }, [hiloId]);

    const cargados = ctx?.mensajes;
    const todos = useMemo(() => {
        const porId = new Map<string, DmMessage>();
        for (const m of remotos) porId.set(m.id, m);
        for (const m of cargados ?? []) porId.set(m.id, m);
        return recopilarArchivos(Array.from(porId.values()), miUid);
    }, [remotos, cargados, miUid]);

    const cuentas = useMemo(() => contarPorCategoria(todos), [todos]);
    const cuentaDe = (p: (typeof PESTANAS)[number]) => (p.cats ? p.cats.reduce((s, c) => s + (cuentas[c] ?? 0), 0) : todos.length);

    const filtrados = useMemo(() => {
        const cats = PESTANAS.find((p) => p.id === pestana)?.cats ?? null;
        const base = filtrarArchivos(todos, { categoria: "todo", texto, remitente });
        const porCat = cats ? base.filter((a) => cats.includes(a.categoria)) : base;
        return ordenarArchivos(porCat, orden);
    }, [todos, pestana, texto, remitente, orden]);

    const porMes = orden === "reciente" || orden === "antiguo";
    const grupos = useMemo(() => {
        if (!porMes) return [{ clave: "todo", titulo: "", archivos: filtrados }];
        const g = agruparArchivosPorMes(filtrados);
        return orden === "antiguo" ? [...g].reverse() : g;
    }, [filtrados, porMes, orden]);

    const medios = useMemo(() => grupos.flatMap((g) => g.archivos.filter(esMedio)), [grupos]);
    const nombreDe = (uid: string | null) => ctx?.nombreDe(uid) ?? "Miembro";

    const abrir = (a: ArchivoHilo) => {
        if (esMedio(a)) {
            const i = medios.findIndex((m) => m.id === a.id);
            setVisor(i >= 0 ? i : null);
            return;
        }
        if (a.categoria === "mensaje") {
            ctx?.abrirVisor(a.mensajeId);
            return;
        }
        if ((a.categoria === "vivo" || a.categoria === "llamada") && a.ruta?.startsWith("/")) {
            router.push(a.ruta);
            return;
        }
        const destino = a.url || a.ruta;
        if (!destino) {
            ctx?.irAlMensaje(a.mensajeId);
            return;
        }
        if (destino.startsWith("/")) router.push(destino);
        else window.open(destino, "_blank", "noopener,noreferrer");
    };

    const visibles = PESTANAS.filter((p) => p.id === "todo" || p.id === pestana || cuentaDe(p) > 0);

    return (
        <div className="space-y-3 pb-6">
            <div role="tablist" aria-label="Tipos de archivo" className="flex flex-wrap gap-1.5">
                {visibles.map((p) => {
                    const activo = p.id === pestana;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            role="tab"
                            aria-selected={activo}
                            onClick={() => setPestana(p.id)}
                            className={cn(
                                "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200",
                                activo ? "text-white" : "text-white/65 hover:text-white",
                            )}
                            style={
                                activo
                                    ? { background: "#7C5CFF2e", boxShadow: "inset 0 0 0 1px #7C5CFF99" }
                                    : { background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }
                            }
                        >
                            {p.etiqueta}
                            <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", activo ? "bg-white/15" : "bg-white/[0.06] text-white/55")}>{cuentaDe(p)}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Buscar por nombre, enlace o tipo…"
                    aria-label="Buscar archivos"
                    className="w-full rounded-2xl bg-white/[0.05] py-2.5 pl-9 pr-3 text-[13.5px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60"
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Segmentado
                    etiqueta="Quién lo envió"
                    valor={remitente}
                    onCambiar={setRemitente}
                    opciones={[
                        { id: "todos", etiqueta: "Todos" },
                        { id: "yo", etiqueta: "Yo" },
                        { id: "otros", etiqueta: ctx?.esGrupo ? "Los demás" : "Ellos" },
                    ]}
                />
                <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
                    <SelectTrigger aria-label="Ordenar" className="ml-auto h-8 w-auto min-w-[150px] cursor-pointer gap-1.5 rounded-full border-white/10 bg-white/[0.04] px-3 text-[12.5px]">
                        <ArrowDownUp className="h-3.5 w-3.5 text-white/55" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[140]">
                        {ORDENES.map((o) => (
                            <SelectItem key={o.id} value={o.id} className="cursor-pointer text-[13px]">
                                {o.etiqueta}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {cargando && todos.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-white/55" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" /> Reuniendo lo compartido…
                </div>
            )}

            {!cargando && filtrados.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <FolderOpen className="h-8 w-8 text-white/30" />
                    <p className="text-[13px] text-white/60">
                        {texto.trim() || remitente !== "todos" || pestana !== "todo" ? "Nada coincide con este filtro." : "Aún no se ha compartido nada en este chat."}
                    </p>
                </div>
            )}

            {grupos.map((g) => {
                const media = g.archivos.filter(esMedio);
                const resto = g.archivos.filter((a) => !esMedio(a));
                if (!g.archivos.length) return null;
                return (
                    <section key={g.clave} className="space-y-2">
                        {g.titulo && <h4 className="sticky top-0 z-[1] px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 first-letter:uppercase">{g.titulo}</h4>}
                        {media.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                                {media.map((a) => (
                                    <div key={a.id} className="group/miniatura relative">
                                        <Miniatura item={a} onAbrir={() => abrir(a)} />
                                        <div className="absolute right-1 top-1 rounded-full bg-black/45 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover/miniatura:opacity-100 md:focus-within:opacity-100">
                                            <MenuElemento item={a} onAbrir={() => abrir(a)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {resto.length > 0 && (
                            <div className="space-y-0.5">
                                {resto.map((a) => (
                                    <FilaArchivo key={a.id} item={a} nombreDe={nombreDe} onAbrir={() => abrir(a)} />
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}

            <VisorMedios
                items={medios}
                indice={visor}
                onIndice={setVisor}
                onCerrar={() => setVisor(null)}
                nombreDe={nombreDe}
                onIrAlMensaje={
                    ctx
                        ? (id) => {
                            setVisor(null);
                            ctx.irAlMensaje(id);
                        }
                        : undefined
                }
            />
        </div>
    );
}

export default ArchivosHilo;
