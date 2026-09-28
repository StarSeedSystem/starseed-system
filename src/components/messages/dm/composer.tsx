"use client";

/**
 * Compositor del chat (2026-09-28). Conserva lo de siempre —selector universal de adjuntos,
 * sobre de invitaciones, arrastrar y soltar (con respaldo dataURL sin red), @aurora, Enter o
 * Mayús+Enter según los ajustes— y suma: estilo rápido (se envía como `formato:{v:1, estilo}`
 * junto al texto plano), «Crear mensaje» con el editor enriquecido, compartir una app en vivo
 * y el aviso de «escribiendo…». En móvil queda UNA fila: «+» (menú vertical con lo secundario),
 * el texto y enviar.
 */

import {
    Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
    type CSSProperties, type ErrorInfo, type ReactNode,
} from "react";
import { toast } from "sonner";
import {
    FileIcon, Loader2, Mail, Music, Paperclip, Plus, Reply, Send, Sparkles, Type, Video as VideoIcon, Wand2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DmAttachment } from "@/lib/messages/dm";
import type { EstiloMensaje, FormatoMensaje } from "@/lib/mensajeria/formato-tipos";
import { AttachFilePickerButton, UniversalFilePicker } from "@/components/files/universal-file-picker";
import { fileToAttachment, uploadFile, type UniversalAttachment } from "@/lib/files/os-files";
import { InviteComposerButton, type InviteAttachmentPayload } from "@/components/invitations/invite-composer-button";
// Contratos C4 y C6.
import { estiloACss, validarFormato } from "@/lib/mensajeria/formato";
import { BotonEstiloRapido } from "@/components/messages/rico/estilo-rapido";
import { EditorMensajeRico } from "@/components/messages/rico/editor-mensaje-rico";
import { BotonCompartirVivo } from "@/components/messages/vivo/boton-compartir-vivo";

const MAX_INLINE_BYTES = 300_000; // ~0.3MB: respaldo sin red (dataURL) para adjuntos muy pequeños.

function tipoDeArchivo(file: File): DmAttachment["kind"] {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    return "file";
}

function leerComoDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** ¿Sin red AHORA MISMO? (heurística, sin peticiones). */
function pareceSinRed(): boolean {
    try {
        return typeof navigator !== "undefined" && navigator.onLine === false;
    } catch {
        return false;
    }
}

function aAdjunto(a: UniversalAttachment): DmAttachment {
    return {
        kind: a.kind,
        name: a.name,
        mime: a.mime,
        url: a.url,
        size: a.size,
        // Referencia de «Contenido de la red»: conserva refKind/refId/route para
        // embeberla en vivo; si no, refKind "file" para archivos de os_files.
        refKind: a.refKind ?? (a.fileId ? "file" : undefined),
        refId: a.refId ?? a.fileId,
        route: a.route,
    };
}

/** Si un componente de otro módulo falla, el compositor sigue entero. */
class Aislado extends Component<{ children: ReactNode }, { roto: boolean }> {
    state = { roto: false };
    static getDerivedStateFromError() {
        return { roto: true };
    }
    componentDidCatch(e: Error, info: ErrorInfo) {
        console.warn("[composer] pieza aislada falló:", e.message, info.componentStack?.slice(0, 200));
    }
    render() {
        return this.state.roto ? null : this.props.children;
    }
}

export interface EnvioComposer {
    body: string;
    attachments: DmAttachment[];
    formato?: FormatoMensaje | null;
}

export interface ComposerHandle {
    enfocar(): void;
    /** Archivos soltados en cualquier parte del chat. */
    recibirArchivos(files: FileList | File[]): void;
}

export interface ComposerHiloProps {
    hiloId: string;
    agenteActivo: boolean;
    enviarConEnter: boolean;
    esMovil: boolean;
    respondiendoA: { nombre: string; texto: string } | null;
    onCancelarRespuesta: () => void;
    /** Devuelve true si se envió (para limpiar). */
    onEnviar: (e: EnvioComposer) => Promise<boolean>;
    onPreguntarAurora: (prompt: string) => Promise<boolean>;
    preguntandoAurora: boolean;
    estadoAurora: string;
    onEscribiendo?: () => void;
    adjuntoPendiente?: DmAttachment | null;
    onConsumirAdjunto?: () => void;
    autoFocus?: boolean;
}

const BOTON =
    "ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/65 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]";

const FILA_MENU =
    "flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]";

/** Contenido de una fila del menú «+»: icono en su halo, nombre y una línea de ayuda. */
function ContenidoFila({ icono, color, titulo, detalle }: { icono: ReactNode; color: string; titulo: string; detalle: string }) {
    return (
        <>
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
                {icono}
            </span>
            <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-white">{titulo}</span>
                <span className="block text-[12px] text-white/60">{detalle}</span>
            </span>
        </>
    );
}

export const ComposerHilo = forwardRef<ComposerHandle, ComposerHiloProps>(function ComposerHilo(p, ref) {
    const [texto, setTexto] = useState("");
    const [adjuntos, setAdjuntos] = useState<DmAttachment[]>([]);
    const [subiendo, setSubiendo] = useState<string[]>([]);
    const [estilo, setEstilo] = useState<EstiloMensaje | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [selectorAbierto, setSelectorAbierto] = useState(false);
    const [editorAbierto, setEditorAbierto] = useState(false);
    const [masAbierto, setMasAbierto] = useState(false);
    const [barraEstilo, setBarraEstilo] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const pieRef = useRef<HTMLElement>(null);
    const [estrecho, setEstrecho] = useState(false);
    // Compacto también en escritorio cuando el chat es estrecho (lista + chat en 768 px).
    useEffect(() => {
        const el = pieRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const obs = new ResizeObserver(([e]) => setEstrecho((e?.contentRect.width ?? 999) < 540));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    const compacto = p.esMovil || estrecho;
    const ultimoAviso = useRef(0);

    const enfocar = useCallback(() => areaRef.current?.focus(), []);

    // Deep-link `?to=<handle>`: el cursor ya está listo al abrir el hilo.
    useEffect(() => {
        if (!p.autoFocus) return;
        const t = setTimeout(enfocar, 200);
        return () => clearTimeout(t);
    }, [p.autoFocus, p.hiloId, enfocar]);

    // Al cambiar de chat, el borrador no viaja al otro.
    useEffect(() => {
        setTexto("");
        setAdjuntos([]);
        setMasAbierto(false);
    }, [p.hiloId]);

    // Adjunto de servidor prellenado (?attachServer=<slug>).
    useEffect(() => {
        if (p.adjuntoPendiente) {
            setAdjuntos((prev) => [...prev, p.adjuntoPendiente!]);
            p.onConsumirAdjunto?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.adjuntoPendiente]);

    // Altura automática del área de texto (hasta ~6 líneas).
    useEffect(() => {
        const el = areaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [texto]);

    // Cerrar el menú «+» al tocar fuera o con Escape.
    useEffect(() => {
        if (!masAbierto) return;
        const fuera = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMasAbierto(false);
        };
        const tecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMasAbierto(false);
        };
        document.addEventListener("pointerdown", fuera);
        window.addEventListener("keydown", tecla);
        const primero = menuRef.current?.querySelector<HTMLElement>("[data-fila-menu]");
        primero?.focus();
        return () => {
            document.removeEventListener("pointerdown", fuera);
            window.removeEventListener("keydown", tecla);
        };
    }, [masAbierto]);

    const recibirArchivos = useCallback(
        async (lista: FileList | File[]) => {
            const files = Array.from(lista ?? []);
            if (!files.length) return;
            for (const file of files) {
                if (pareceSinRed()) {
                    // Respaldo sin red: archivos pequeños como dataURL (se envían igual).
                    if (file.size > MAX_INLINE_BYTES) {
                        toast.error(`«${file.name}» es grande para enviarlo sin conexión (máx. ~300 KB). Vuelve a intentarlo con red.`);
                        continue;
                    }
                    try {
                        const url = await leerComoDataUrl(file);
                        setAdjuntos((prev) => [...prev, { kind: tipoDeArchivo(file), name: file.name, mime: file.type, url, size: file.size }]);
                    } catch {
                        toast.error(`No se pudo leer «${file.name}».`);
                    }
                    continue;
                }
                const marca = `${file.name}-${Date.now()}`;
                setSubiendo((prev) => [...prev, marca]);
                try {
                    const res = await uploadFile(file, { folder: "mensajes", meta: { context: "mensaje", threadId: p.hiloId } });
                    if (res.ok && res.file) {
                        setAdjuntos((prev) => [...prev, aAdjunto(fileToAttachment(res.file!))]);
                        if (res.warning) toast.message(res.warning);
                    } else if (file.size <= MAX_INLINE_BYTES) {
                        const url = await leerComoDataUrl(file);
                        setAdjuntos((prev) => [...prev, { kind: tipoDeArchivo(file), name: file.name, mime: file.type, url, size: file.size }]);
                        toast.message(`«${file.name}» va dentro del mensaje: ${res.error || "no se pudo subir a la nube"}.`);
                    } else {
                        toast.error(res.error || `No se pudo subir «${file.name}».`);
                    }
                } catch {
                    toast.error(`No se pudo subir «${file.name}».`);
                } finally {
                    setSubiendo((prev) => prev.filter((m) => m !== marca));
                }
            }
        },
        [p.hiloId],
    );

    useImperativeHandle(ref, () => ({ enfocar, recibirArchivos: (f) => void recibirArchivos(f) }), [enfocar, recibirArchivos]);

    const cambiarTexto = (v: string) => {
        setTexto(v);
        const ahora = Date.now();
        if (v && p.onEscribiendo && ahora - ultimoAviso.current > 2500) {
            ultimoAviso.current = ahora;
            p.onEscribiendo();
        }
    };

    const enviar = async () => {
        const body = texto.trim();
        if ((!body && adjuntos.length === 0) || enviando) return;
        let formato: FormatoMensaje | null = null;
        if (estilo && body) {
            const r = validarFormato({ v: 1, estilo });
            if (r.ok) formato = r.formato;
            else toast.message(`El estilo no se pudo aplicar (${r.error}); se envía como texto normal.`);
        }
        setEnviando(true);
        try {
            const ok = await p.onEnviar({ body, attachments: adjuntos, formato });
            if (ok) {
                setTexto("");
                setAdjuntos([]);
                enfocar();
            }
        } finally {
            setEnviando(false);
        }
    };

    const preguntarAurora = async () => {
        const ok = await p.onPreguntarAurora(texto.trim());
        if (ok) setTexto("");
    };

    const estiloVista = useMemo<CSSProperties>(() => {
        if (!estilo) return {};
        const css = estiloACss(estilo) ?? {};
        return {
            fontFamily: css.fontFamily,
            color: css.color,
            fontWeight: css.fontWeight,
            fontStyle: css.fontStyle,
            textAlign: css.textAlign,
        };
    }, [estilo]);

    const puedeEnviar = !!texto.trim() || adjuntos.length > 0;
    const colorAccion = "#7C5CFF";

    const quitarAdjunto = (i: number) => setAdjuntos((prev) => prev.filter((_, j) => j !== i));

    const invitar = (a: InviteAttachmentPayload) => setAdjuntos((prev) => [...prev, a]);

    const enviarVivo = async (r: { body: string; attachments: DmAttachment[] }) => {
        await p.onEnviar({ body: r.body, attachments: r.attachments });
    };

    const botonCrear = (
        <button
            type="button"
            onClick={() => setEditorAbierto(true)}
            aria-label="Crear mensaje enriquecido"
            title="Crear mensaje (texto con formato, lienzo, medios)"
            className={BOTON}
        >
            <Wand2 className="h-[18px] w-[18px]" />
        </button>
    );

    return (
        <footer
            ref={pieRef}
            className="relative z-10 shrink-0 space-y-2 border-t border-white/[0.08] px-2.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 sm:px-4"
            style={{ background: "rgba(12,14,34,.55)", backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)" }}
        >
            {p.respondiendoA && (
                <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: "rgba(124,92,255,.10)", boxShadow: "inset 3px 0 0 #7C5CFF, inset 0 0 0 1px rgba(124,92,255,.25)" }}>
                    <Reply className="h-4 w-4 shrink-0 text-[#b7a6ff]" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-semibold text-[#b7a6ff]">Respondiendo a {p.respondiendoA.nombre}</p>
                        <p className="truncate text-[12.5px] text-white/70">{p.respondiendoA.texto || "Adjunto"}</p>
                    </div>
                    <button type="button" onClick={p.onCancelarRespuesta} aria-label="Cancelar respuesta" className={cn(BOTON, "h-8 w-8")}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {(adjuntos.length > 0 || subiendo.length > 0) && (
                <div className="flex flex-wrap gap-2" aria-label="Adjuntos del mensaje">
                    {adjuntos.map((a, i) => {
                        const Icono = a.kind === "audio" ? Music : a.kind === "video" ? VideoIcon : FileIcon;
                        return (
                            <span key={`${a.name}-${i}`} className="group/adj relative inline-flex max-w-[220px] items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-[12px] text-white/85" style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}>
                                {a.kind === "image" && a.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={a.url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                                ) : (
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06]"><Icono className="h-4 w-4 text-white/60" /></span>
                                )}
                                <span className="min-w-0 truncate">{a.name || a.kind}</span>
                                <button type="button" onClick={() => quitarAdjunto(i)} aria-label={`Quitar ${a.name || "adjunto"}`} className="ss-redondo grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </span>
                        );
                    })}
                    {subiendo.map((m) => (
                        <span key={m} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-white/70" style={{ background: "rgba(255,255,255,.05)" }}>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…
                        </span>
                    ))}
                </div>
            )}

            {(p.preguntandoAurora || p.estadoAurora) && (
                <p className="flex items-center gap-1.5 text-[11.5px] text-[#7fb8ff]" role="status">
                    <Loader2 className="h-3 w-3 animate-spin" /> {p.estadoAurora || "Aurora está pensando…"}
                </p>
            )}

            {compacto && (barraEstilo || estilo) && (
                <div className="flex items-center gap-2 rounded-2xl px-2 py-1.5" style={{ background: "rgba(255,255,255,.05)" }}>
                    <Aislado>
                        <BotonEstiloRapido estilo={estilo} onChange={setEstilo} />
                    </Aislado>
                    <span className="min-w-0 flex-1 text-[12px] text-white/65">{estilo ? "Tus mensajes saldrán con este estilo" : "Elige un estilo para tu mensaje"}</span>
                    <button
                        type="button"
                        onClick={() => { setEstilo(null); setBarraEstilo(false); }}
                        aria-label="Quitar el estilo"
                        className={cn(BOTON, "h-8 w-8")}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div
                className="flex items-end gap-1 rounded-[22px] px-1.5 py-1 transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_1px_rgba(124,92,255,.55),0_0_0_3px_rgba(124,92,255,.12)]"
                style={{ background: "rgba(255,255,255,.055)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09)" }}
            >
                {compacto ? (
                    <div ref={menuRef} className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setMasAbierto((v) => !v)}
                            aria-label="Más acciones: adjuntar, estilo, crear, en vivo, invitar"
                            aria-haspopup="menu"
                            aria-expanded={masAbierto}
                            className={cn(BOTON, masAbierto && "bg-white/10 text-white")}
                        >
                            <Plus className={cn("h-5 w-5 transition-transform duration-200", masAbierto && "rotate-45")} />
                        </button>
                        {/* Siempre montado (oculto al cerrarse): así los diálogos que abre cada fila sobreviven. */}
                        <div
                            role="menu"
                            aria-label="Acciones del mensaje"
                            aria-hidden={!masAbierto}
                            inert={!masAbierto}
                            className={cn(
                                "absolute bottom-full left-0 z-40 mb-2 w-[min(320px,calc(100vw-28px))] origin-bottom-left rounded-2xl p-1.5 transition-all duration-200",
                                masAbierto ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none translate-y-1 scale-95 opacity-0",
                            )}
                            style={{
                                background: "rgba(12,14,34,.94)",
                                backdropFilter: "blur(20px) saturate(140%)",
                                WebkitBackdropFilter: "blur(20px) saturate(140%)",
                                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1), inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px rgba(0,0,0,.45)",
                            }}
                            onClick={(e) => {
                                // Cualquier fila elegida cierra el menú (los diálogos siguen montados).
                                if ((e.target as HTMLElement).closest("button")) setMasAbierto(false);
                            }}
                        >
                            <button type="button" role="menuitem" data-fila-menu className={FILA_MENU} onClick={() => setSelectorAbierto(true)}>
                                <ContenidoFila icono={<Paperclip className="h-4 w-4" />} color="#007FFF" titulo="Adjuntar archivo" detalle="Fotos, documentos, audio o de tus bibliotecas" />
                            </button>
                            <button type="button" role="menuitem" data-fila-menu className={FILA_MENU} onClick={() => setBarraEstilo(true)}>
                                <ContenidoFila icono={<Type className="h-4 w-4" />} color="#FFBF00" titulo="Estilo del mensaje" detalle="Letra, color y animación para lo que escribes" />
                            </button>
                            <button type="button" role="menuitem" data-fila-menu className={FILA_MENU} onClick={() => setEditorAbierto(true)}>
                                <ContenidoFila icono={<Wand2 className="h-4 w-4" />} color="#EC4899" titulo="Crear mensaje" detalle="Texto con formato, lienzo, fotos y ventanas" />
                            </button>
                            <div role="none">
                                <Aislado>
                                    <BotonCompartirVivo hiloId={p.hiloId} onEnviar={enviarVivo} modo="item-menu" />
                                </Aislado>
                            </div>
                            <InviteComposerButton onPick={invitar} title="Invitar a grupo, página o evento" className={FILA_MENU}>
                                <ContenidoFila icono={<Mail className="h-4 w-4" />} color="#14B8A6" titulo="Invitar" detalle="A un grupo, una página o un evento" />
                            </InviteComposerButton>
                        </div>
                    </div>
                ) : (
                    <>
                        <AttachFilePickerButton onPick={(xs) => setAdjuntos((prev) => [...prev, ...xs.map(aAdjunto)])} folder="mensajes" title="Adjuntar archivo al mensaje" className={BOTON}>
                            <Paperclip className="h-[18px] w-[18px]" />
                        </AttachFilePickerButton>
                        <InviteComposerButton onPick={invitar} title="Invitar a grupo, página o evento" className={BOTON}>
                            <Mail className="h-[18px] w-[18px]" />
                        </InviteComposerButton>
                        <Aislado>
                            <BotonEstiloRapido estilo={estilo} onChange={setEstilo} />
                        </Aislado>
                        {botonCrear}
                        <Aislado>
                            <BotonCompartirVivo hiloId={p.hiloId} onEnviar={enviarVivo} modo="boton" />
                        </Aislado>
                    </>
                )}

                <textarea
                    ref={areaRef}
                    value={texto}
                    rows={1}
                    onChange={(e) => cambiarTexto(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                        const enviarAhora = p.enviarConEnter ? !e.shiftKey : e.ctrlKey || e.metaKey;
                        if (enviarAhora) {
                            e.preventDefault();
                            void enviar();
                        }
                    }}
                    onPaste={(e) => {
                        const files = e.clipboardData?.files;
                        if (files && files.length) {
                            e.preventDefault();
                            void recibirArchivos(files);
                        }
                    }}
                    placeholder={p.agenteActivo ? "Escribe un mensaje… o menciona @aurora" : "Escribe un mensaje…"}
                    aria-label="Escribe un mensaje"
                    className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-snug text-white outline-none placeholder:text-white/40"
                    style={estiloVista}
                />

                {p.agenteActivo && (
                    <button
                        type="button"
                        onClick={() => void preguntarAurora()}
                        disabled={p.preguntandoAurora}
                        aria-label="Preguntar a Aurora"
                        title="Preguntar a Aurora"
                        className={cn(BOTON, "text-[#7fb8ff] hover:bg-[#007FFF]/15 disabled:cursor-wait")}
                    >
                        {p.preguntandoAurora ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando || !puedeEnviar}
                    aria-label="Enviar mensaje"
                    title={p.enviarConEnter ? "Enviar (Enter)" : "Enviar (Ctrl+Enter)"}
                    className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-all duration-200 disabled:cursor-not-allowed"
                    style={
                        puedeEnviar
                            ? { background: `linear-gradient(135deg, ${colorAccion}, #5B3FD9)`, boxShadow: `0 6px 16px ${colorAccion}55` }
                            : { background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)" }
                    }
                >
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -translate-x-[1px] translate-y-[1px]" />}
                </button>
            </div>

            <UniversalFilePicker
                open={selectorAbierto}
                onOpenChange={setSelectorAbierto}
                onPick={(xs) => {
                    setAdjuntos((prev) => [...prev, ...xs.map(aAdjunto)]);
                    setSelectorAbierto(false);
                }}
                folder="mensajes"
                title="Adjuntar archivo al mensaje"
            />

            <Aislado>
                <EditorMensajeRico
                    open={editorAbierto}
                    onOpenChange={setEditorAbierto}
                    hiloId={p.hiloId}
                    textoInicial={texto}
                    onEnviar={async (r: { body: string; formato: FormatoMensaje; attachments: DmAttachment[] }) => {
                        const ok = await p.onEnviar({ body: r.body, attachments: r.attachments, formato: r.formato });
                        if (ok) {
                            setTexto("");
                            setEditorAbierto(false);
                        }
                    }}
                />
            </Aislado>
        </footer>
    );
});

export default ComposerHilo;
