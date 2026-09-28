"use client";

/**
 * Panel de información del chat (2026-09-28): hoja lateral en escritorio (~400 px, animada) y
 * hoja a pantalla completa en móvil. Portada con la persona o el grupo y acciones rápidas; y
 * sus secciones: archivos, enlaces y documentos · carpetas del chat · contacto (chats de dos)
 * o miembros (grupos) · ajustes de este chat. Cada sección se abre como sub-vista con «atrás».
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowLeft, BellOff, Folder, MessageCircle, Paintbrush, Paperclip, Pencil, Search, Settings2, UserRound, Users, X,
} from "lucide-react";
import type { Contacto } from "@/lib/contactos/tipos";
import type { DmMember, DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";
import type { TipoHilo } from "@/lib/mensajeria/ajustes-tipos";
import type { EstadoPresencia } from "@/lib/mensajeria/presencia";
import { recopilarArchivos } from "@/lib/mensajeria/archivos";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";
// Contrato C5.
import { BotonesLlamada } from "@/components/llamadas/botones-llamada";
import { AvatarHilo } from "@/components/messages/dm/avatar-hilo";
import { useContextoHilo, type VistaInfo } from "@/components/messages/dm/contexto-hilo";
import { transicionPanel, useMovimientoReducido } from "@/components/messages/dm/hooks-hilo";
import { AjustesHiloPanel } from "@/components/messages/info/ajustes-hilo";
import { ArchivosHilo } from "@/components/messages/info/archivos-hilo";
import { CarpetasHilo } from "@/components/messages/info/carpetas-hilo";
import { ChipRelacion, ContactoEnChat } from "@/components/messages/info/contacto-en-chat";
import { EditorGrupo, MiembrosGrupo, descripcionDeHilo, puedoAdministrar } from "@/components/messages/info/miembros-grupo";
import { BotonRapido, FilaNavegable, Tarjeta, VIDRIO } from "@/components/messages/info/piezas";

const TITULOS: Record<Exclude<VistaInfo, "inicio">, string> = {
    archivos: "Archivos, enlaces y documentos",
    carpetas: "Carpetas del chat",
    ajustes: "Ajustes de este chat",
    miembros: "Miembros",
};

export interface PanelInfoHiloProps {
    abierto: boolean;
    vista: VistaInfo;
    foco?: string;
    onCambiarVista: (v: VistaInfo, foco?: string) => void;
    onCerrar: () => void;
    thread: DmThreadSummary;
    tipo: TipoHilo;
    titulo: string;
    avatarUrl?: string | null;
    enLinea: boolean;
    subtitulo: string | null;
    otroId: string | null;
    perfilOtro?: OsProfile;
    contacto?: Contacto;
    miembros: DmMember[];
    idsMiembros: string[];
    presencia: Record<string, EstadoPresencia>;
    esMovil: boolean;
    onThreadUpdated: (t: DmThreadSummary) => void;
    onMiembrosCambiados: () => void;
    onMensaje: () => void;
    onBuscar: () => void;
    onSalir?: () => void;
}

function Portada(p: PanelInfoHiloProps & { onEditarGrupo?: () => void }) {
    const ctx = useContextoHilo();
    const esGrupo = p.thread.kind === "group";
    const descripcion = esGrupo ? descripcionDeHilo(p.thread) : "";
    const usuario = p.perfilOtro?.username;
    return (
        <div className="flex flex-col items-center px-2 pb-2 pt-4 text-center">
            <AvatarHilo nombre={p.titulo} url={p.avatarUrl} esGrupo={esGrupo} enLinea={p.enLinea} tam={96} />
            <h2 className="mt-3 max-w-full break-words text-[20px] font-semibold leading-tight text-white">{p.titulo}</h2>
            <p className="mt-1 text-[13px] text-white/60">
                {esGrupo ? `Grupo · ${p.idsMiembros.length} ${p.idsMiembros.length === 1 ? "miembro" : "miembros"}` : usuario ? `@${usuario}` : "Chat directo"}
            </p>
            {p.subtitulo && !esGrupo && <p className="mt-0.5 text-[12.5px] text-[#6EE7B7]/90">{p.subtitulo}</p>}
            {p.contacto && (
                <div className="mt-2">
                    <ChipRelacion contacto={p.contacto} />
                </div>
            )}
            {ctx?.efectivos.silenciado && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-white/50"><BellOff className="h-3.5 w-3.5" /> Silenciado</p>
            )}
            {descripcion && <p className="mt-3 max-w-[320px] whitespace-pre-wrap text-[13px] leading-snug text-white/70">{descripcion}</p>}

            <div className="mt-4 flex flex-wrap items-start justify-center gap-x-2 gap-y-3">
                <BotonRapido icono={<MessageCircle className="h-5 w-5" />} etiqueta="Mensaje" onClick={p.onMensaje} />
                <div className="flex flex-col items-center gap-1.5">
                    <BotonesLlamada hiloId={p.thread.id} miembros={p.idsMiembros} titulo={p.titulo} />
                    <span className="text-[11.5px] font-medium text-white/80">Audio y vídeo</span>
                </div>
                {!esGrupo && usuario && (
                    <BotonRapido icono={<UserRound className="h-5 w-5" />} etiqueta="Perfil" href={`/profile/${encodeURIComponent(usuario)}`} color="#14B8A6" />
                )}
                {esGrupo && p.onEditarGrupo && (
                    <BotonRapido icono={<Pencil className="h-5 w-5" />} etiqueta="Editar" onClick={p.onEditarGrupo} color="#FFBF00" />
                )}
                <BotonRapido icono={<Search className="h-5 w-5" />} etiqueta="Buscar" onClick={p.onBuscar} color="#007FFF" />
            </div>
        </div>
    );
}

function Inicio(p: PanelInfoHiloProps) {
    const ctx = useContextoHilo();
    const esGrupo = p.thread.kind === "group";
    const [editandoGrupo, setEditandoGrupo] = useState(false);
    const admin = esGrupo && puedoAdministrar(p.thread, p.miembros, ctx?.miUid ?? null);
    const archivos = useMemo(() => recopilarArchivos(ctx?.mensajes ?? [], ctx?.miUid ?? null), [ctx?.mensajes, ctx?.miUid]);
    const fotos = archivos.filter((a) => a.categoria === "imagen" && a.url).slice(-4).reverse();
    const nCarpetas = (ctx?.carpetas.carpetas ?? []).filter((c) => !c.borrado).length;
    const ef = ctx?.efectivos;

    return (
        <div className="space-y-3.5 pb-8">
            <Portada {...p} onEditarGrupo={admin ? () => setEditandoGrupo((v) => !v) : undefined} />

            {editandoGrupo && <EditorGrupo thread={p.thread} onThreadUpdated={p.onThreadUpdated} onCerrar={() => setEditandoGrupo(false)} />}

            <Tarjeta className="p-1.5">
                <FilaNavegable
                    icono={<Paperclip className="h-[18px] w-[18px]" />}
                    titulo="Archivos, enlaces y documentos"
                    detalle={archivos.length ? `${archivos.length} ${archivos.length === 1 ? "elemento" : "elementos"} en lo cargado` : "Fotos, documentos, enlaces, apps en vivo…"}
                    onClick={() => p.onCambiarVista("archivos")}
                    color="#7C5CFF"
                />
                {fotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 px-2.5 pb-2">
                        {fotos.map((f) => (
                            <button key={f.id} type="button" onClick={() => p.onCambiarVista("archivos")} aria-label={`Ver ${f.nombre}`} className="aspect-square cursor-pointer overflow-hidden rounded-xl bg-white/[0.04]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={urlVigenteAdjunto(f.url)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                            </button>
                        ))}
                    </div>
                )}
                <FilaNavegable
                    icono={<Folder className="h-[18px] w-[18px]" />}
                    titulo="Carpetas del chat"
                    detalle={nCarpetas ? `${nCarpetas} ${nCarpetas === 1 ? "carpeta" : "carpetas"}` : "Ordena lo compartido en carpetas"}
                    onClick={() => p.onCambiarVista("carpetas")}
                    color="#FFBF00"
                />
            </Tarjeta>

            {!esGrupo && p.otroId && <ContactoEnChat userId={p.otroId} perfil={p.perfilOtro} contacto={p.contacto} />}

            {esGrupo && (
                <MiembrosGrupo
                    thread={p.thread}
                    miembros={p.miembros}
                    idsMiembros={p.idsMiembros}
                    presencia={p.presencia}
                    onThreadUpdated={p.onThreadUpdated}
                    onMiembrosCambiados={p.onMiembrosCambiados}
                    onSalir={p.onSalir}
                    limite={6}
                    onVerTodos={() => p.onCambiarVista("miembros")}
                />
            )}

            <Tarjeta className="p-1.5">
                <FilaNavegable
                    icono={<Settings2 className="h-[18px] w-[18px]" />}
                    titulo="Ajustes de este chat"
                    detalle={[ef?.apodo ? `Apodo: ${ef.apodo}` : null, ef?.silenciado ? "Silenciado" : null, ef?.fijado ? "Fijado" : null, ef?.archivado ? "Archivado" : null].filter(Boolean).join(" · ") || "Apodo, avisos, privacidad, archivar…"}
                    onClick={() => p.onCambiarVista("ajustes")}
                    color="#14B8A6"
                />
                <FilaNavegable
                    icono={<Paintbrush className="h-[18px] w-[18px]" />}
                    titulo="Fondo y apariencia"
                    detalle="Fondo, letra, color de tus burbujas"
                    onClick={() => p.onCambiarVista("ajustes", "apariencia")}
                    color="#EC4899"
                />
                {esGrupo && (
                    <FilaNavegable icono={<Users className="h-[18px] w-[18px]" />} titulo="Miembros" detalle={`${p.idsMiembros.length} en el grupo`} onClick={() => p.onCambiarVista("miembros")} color="#10B981" />
                )}
            </Tarjeta>
        </div>
    );
}

export function PanelInfoHilo(p: PanelInfoHiloProps) {
    const ctx = useContextoHilo();
    const reducido = useMovimientoReducido();
    const tituloRef = useRef<HTMLHeadingElement>(null);
    const [direccion, setDireccion] = useState(1);

    // Escape cierra (o vuelve atrás), salvo que haya un diálogo abierto encima.
    useEffect(() => {
        if (!p.abierto) return;
        const tecla = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return;
            if (p.vista !== "inicio") {
                setDireccion(-1);
                p.onCambiarVista("inicio");
            } else p.onCerrar();
        };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [p.abierto, p.vista, p]);

    useEffect(() => {
        if (p.abierto) setTimeout(() => tituloRef.current?.focus(), 60);
    }, [p.abierto, p.vista]);

    const irA = (v: VistaInfo, foco?: string) => {
        setDireccion(v === "inicio" ? -1 : 1);
        p.onCambiarVista(v, foco);
    };

    const esGrupo = p.thread.kind === "group";
    const titulo = p.vista === "inicio" ? (esGrupo ? "Info del grupo" : "Info del contacto") : TITULOS[p.vista];
    const props = { ...p, onCambiarVista: irA };

    const muelle = transicionPanel(reducido);

    return (
        <AnimatePresence>
            {p.abierto && (
                <>
                    {!p.esMovil && (
                        <motion.button
                            key="velo"
                            type="button"
                            aria-label="Cerrar la información"
                            className="absolute inset-0 z-30 cursor-default bg-black/35"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reducido ? 0 : 0.2 }}
                            onClick={p.onCerrar}
                        />
                    )}
                    <motion.aside
                        key="panel"
                        role="dialog"
                        aria-modal={p.esMovil ? "true" : "false"}
                        aria-labelledby="titulo-panel-info"
                        className={
                            p.esMovil
                                ? "absolute inset-0 z-40 flex flex-col"
                                : "absolute bottom-0 right-0 top-0 z-40 flex w-[min(400px,100%)] flex-col rounded-l-[24px] border-l border-white/[0.08]"
                        }
                        style={{ ...VIDRIO, background: "rgba(10,12,30,.86)" }}
                        initial={p.esMovil ? { y: "100%" } : { x: "100%" }}
                        animate={p.esMovil ? { y: 0 } : { x: 0 }}
                        exit={p.esMovil ? { y: "100%" } : { x: "100%" }}
                        transition={muelle}
                    >
                        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-2.5">
                            {p.vista !== "inicio" ? (
                                <button type="button" onClick={() => irA("inicio")} aria-label="Volver" className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                            ) : (
                                <span className="w-1" />
                            )}
                            <h2 ref={tituloRef} id="titulo-panel-info" tabIndex={-1} className="min-w-0 flex-1 text-[15px] font-semibold text-white outline-none">
                                {titulo}
                            </h2>
                            <button type="button" onClick={p.onCerrar} aria-label="Cerrar la información" title="Cerrar (Esc)" className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 [scrollbar-gutter:stable]">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={p.vista}
                                    initial={{ opacity: 0, x: reducido ? 0 : direccion * 24 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: reducido ? 0 : direccion * -24 }}
                                    transition={{ duration: reducido ? 0 : 0.18 }}
                                >
                                    {p.vista === "inicio" && <Inicio {...props} />}
                                    {p.vista === "archivos" && <ArchivosHilo hiloId={p.thread.id} miUid={ctx?.miUid ?? null} />}
                                    {p.vista === "carpetas" && <CarpetasHilo />}
                                    {p.vista === "ajustes" && <AjustesHiloPanel hiloId={p.thread.id} tipo={p.tipo} foco={p.foco} />}
                                    {p.vista === "miembros" && (
                                        <MiembrosGrupo
                                            thread={p.thread}
                                            miembros={p.miembros}
                                            idsMiembros={p.idsMiembros}
                                            presencia={p.presencia}
                                            onThreadUpdated={p.onThreadUpdated}
                                            onMiembrosCambiados={p.onMiembrosCambiados}
                                            onSalir={p.onSalir}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

export default PanelInfoHilo;
