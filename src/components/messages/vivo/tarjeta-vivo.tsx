"use client";

/**
 * TarjetaVivo (contrato C6) — cómo se ve una app en vivo dentro de la burbuja del chat.
 *
 * Color e icono por tipo, título, cuántas personas hay DENTRO ahora (canal de presencia
 * `vivo:<id>`, al que la tarjeta solo se une mientras se ve: fuera de pantalla no gasta tráfico),
 * permiso y acceso, un [Abrir] grande y un menú vertical con Invitar · enlace privado · enlace
 * público · Guardar en Biblioteca · Terminar sesión. Una sesión terminada se ve apagada.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CircleStop, Globe2, Link2, Loader2, MoreVertical, UserPlus } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SaveToLibrary } from "@/components/library/save-to-library";
import type { DmAttachment } from "@/lib/messages/dm";
import type { AdjuntoVivo, SesionViva } from "@/lib/mensajeria/formato-tipos";
import {
    construirUrlPublica,
    enlacePrivado,
    miUid,
    origenActual,
    rutaConSesion,
    sesionVigente,
    tipoVivoDe,
    urlAbsoluta,
    usePresentesSesion,
    useSesionViva,
} from "@/lib/mensajeria/sesiones-vivas";
import { entradaVivo } from "@/components/messages/vivo/catalogo-vivo";
import {
    activarEnlacePublico,
    copiarAlPortapapeles,
    esAdjuntoVivo,
    sincronizarAccesoDelChat,
    terminarVivo,
} from "@/components/messages/vivo/acciones-vivo";
import {
    ChipVivo,
    ESTILO_CRISTAL,
    IconoTipoVivo,
    MODOS_INFO,
    PERMISOS_INFO,
    VIOLETA_MENSAJES,
    colorTextoSobre,
} from "@/components/messages/vivo/comun-vivo";
import estilos from "./tarjeta-vivo.module.css";

const InvitarSesionDialog = dynamic(
    () => import("@/components/messages/vivo/invitar-sesion").then((m) => m.InvitarSesionDialog),
    { ssr: false },
);

export interface TarjetaVivoProps {
    adjunto: DmAttachment;
    mio: boolean;
}

/** ¿Se ve la tarjeta? Sin IntersectionObserver no se da por vista (así no abre canales de más). */
function useVisible<T extends Element>(ref: RefObject<T | null>): boolean {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver(
            (entradas) => {
                for (const e of entradas) setVisible(e.isIntersecting);
            },
            { threshold: 0.2 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return visible;
}

/** «En vivo» mientras no haya nadie anunciado (o no se sepa): nunca se afirma un vacío que no consta. */
export function textoPresencia(n: number | null): string {
    if (n === null || n <= 0) return "En vivo";
    if (n === 1) return "En vivo · 1 persona dentro";
    return `En vivo · ${n} personas dentro`;
}

export function TarjetaVivo({ adjunto, mio }: TarjetaVivoProps) {
    const valido = esAdjuntoVivo(adjunto);
    const vivo = adjunto as AdjuntoVivo;
    const sesionId = valido ? vivo.sesionId : null;
    const entrada = entradaVivo(valido ? vivo.tipoVivo : tipoVivoDe((adjunto as Partial<AdjuntoVivo>).tipoVivo));
    const color = entrada?.color ?? VIOLETA_MENSAJES;

    const { sesion, listo } = useSesionViva(sesionId);
    const [uid, setUid] = useState<string | null>(null);
    useEffect(() => {
        void miUid().then(setUid);
    }, []);

    const raiz = useRef<HTMLElement>(null);
    const visible = useVisible(raiz);
    const terminada = Boolean(sesion && !sesionVigente(sesion));
    const presentes = usePresentesSesion(sesionId, visible && !terminada);
    const soyCreador = Boolean(sesion && uid && sesion.creador === uid);

    const router = useRouter();
    const confirmar = useConfirm();
    const [invitarAbierto, setInvitarAbierto] = useState(false);
    const [invitarUsado, setInvitarUsado] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    const titulo = (valido ? vivo.name : adjunto.name)?.trim() || entrada?.etiqueta || "App en vivo";
    const permiso = sesion?.permiso ?? (valido ? vivo.permiso : undefined) ?? "editar";
    const infoPermiso = PERMISOS_INFO[permiso] ?? PERMISOS_INFO.editar;
    const privado = sesionId ? enlacePrivado({ id: sesionId, tipo: `vivo:${entrada?.tipo ?? "sala"}` }) : null;

    const abrir = () => {
        if (!sesionId) return;
        if (sesion && sesionVigente(sesion) && valido) {
            if (soyCreador) void sincronizarAccesoDelChat(sesion);
            router.push(rutaConSesion(sesion.ruta ?? vivo.route, sesionId));
            return;
        }
        // Sin sesión legible (sin acceso, aún cargando, servidor sin migración): la página de
        // entrada explica qué pasa en vez de abrir una app vacía.
        if (privado) router.push(privado);
    };

    const copiarPrivado = async () => {
        if (!privado) return;
        const url = urlAbsoluta(privado);
        const ok = await copiarAlPortapapeles(url);
        if (ok) toast.success("Enlace privado copiado", { description: "Solo entran quienes están en el chat o invitados." });
        else toast.message("Copia el enlace a mano", { description: url });
    };

    const enlacePublico = async (s: SesionViva) => {
        if (s.modo === "publico" && s.tokenPublico) {
            const url = construirUrlPublica(origenActual(), s, s.tokenPublico);
            const ok = await copiarAlPortapapeles(url);
            if (ok) toast.success("Enlace público copiado");
            else toast.message("Enlace público", { description: url });
            return;
        }
        setOcupado(true);
        try {
            const r = await activarEnlacePublico(s, s.permiso);
            if (!r.url) {
                toast.error(r.error ?? "No se pudo crear el enlace público.");
                return;
            }
            const ok = await copiarAlPortapapeles(r.url);
            toast.success("Enlace público creado", {
                description: ok ? "Copiado. Cualquiera con él puede entrar." : r.url,
            });
            if (r.aviso) toast.message(r.aviso);
        } finally {
            setOcupado(false);
        }
    };

    const terminar = async (s: SesionViva) => {
        const si = await confirmar({
            title: "¿Terminar la sesión?",
            description: "Nadie podrá volver a entrar desde el chat ni por sus enlaces. El contenido no se borra: sigue siendo tuyo.",
            confirmText: "Terminar sesión",
            cancelText: "Seguir en vivo",
            destructive: true,
        });
        if (!si) return;
        setOcupado(true);
        try {
            const err = await terminarVivo(s);
            if (err) toast.error(err);
            else toast.success("Sesión terminada");
        } finally {
            setOcupado(false);
        }
    };

    const activa = Boolean(sesion && !terminada);

    return (
        <article
            ref={raiz}
            aria-label={`${entrada?.etiqueta ?? "App en vivo"}: ${titulo}${terminada ? " (sesión terminada)" : ""}`}
            data-estado={terminada ? "terminada" : "activa"}
            className={`relative w-[min(100%,330px)] overflow-hidden rounded-[20px] text-left text-white transition-[filter,opacity] duration-300 ${terminada ? "opacity-70 saturate-[.35]" : ""}`}
            style={{
                ...ESTILO_CRISTAL,
                background: terminada
                    ? "rgba(12,14,34,.55)"
                    : `linear-gradient(165deg, ${color}26 0%, rgba(12,14,34,.62) 55%)`,
                border: `1px solid ${terminada ? "rgba(255,255,255,.08)" : `${color}40`}`,
                boxShadow: mio
                    ? `inset 0 1px 0 rgba(255,255,255,.08), 0 14px 30px -18px ${terminada ? "rgba(0,0,0,.6)" : color}`
                    : ESTILO_CRISTAL.boxShadow,
            }}
        >
            <div className="space-y-3 p-3.5">
                <div className="flex items-start gap-3">
                    <IconoTipoVivo entrada={entrada} tam={44} apagado={terminada} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: terminada ? "rgba(255,255,255,.55)" : color }}>
                            {entrada?.etiqueta ?? "App en vivo"}
                        </p>
                        <p className="break-words text-[15px] font-semibold leading-snug text-white">{titulo}</p>
                    </div>
                    {sesionId && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="ss-redondo -mr-1 -mt-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
                                    aria-label="Más opciones de la app en vivo"
                                >
                                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MoreVertical className="h-4 w-4" aria-hidden="true" />}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64 border-white/10 bg-[rgba(12,14,34,.92)] p-1.5 text-white backdrop-blur-2xl">
                                {activa && soyCreador && sesion && (
                                    <DropdownMenuItem
                                        className="cursor-pointer gap-2.5 rounded-[12px] px-2.5 py-2 text-[14px]"
                                        onSelect={() => {
                                            setInvitarUsado(true);
                                            setInvitarAbierto(true);
                                        }}
                                    >
                                        <UserPlus className="h-4 w-4 text-white/75" aria-hidden="true" /> Invitar a más personas
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="cursor-pointer gap-2.5 rounded-[12px] px-2.5 py-2 text-[14px]" onSelect={() => void copiarPrivado()}>
                                    <Link2 className="h-4 w-4 text-white/75" aria-hidden="true" /> Copiar enlace privado
                                </DropdownMenuItem>
                                {activa && soyCreador && sesion && (
                                    <DropdownMenuItem className="cursor-pointer gap-2.5 rounded-[12px] px-2.5 py-2 text-[14px]" onSelect={() => void enlacePublico(sesion)}>
                                        <Globe2 className="h-4 w-4 text-white/75" aria-hidden="true" />
                                        {sesion.modo === "publico" && sesion.tokenPublico ? "Copiar enlace público" : "Crear enlace público"}
                                    </DropdownMenuItem>
                                )}
                                {privado && (
                                    <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                                        <div className="px-0 py-0">
                                            <SaveToLibrary
                                                variant="menu-item"
                                                label="Guardar en Biblioteca"
                                                className="rounded-[12px] px-2.5 py-2 text-[14px]"
                                                item={{ type: "route", route: privado, title: titulo }}
                                            />
                                        </div>
                                    </DropdownMenuItem>
                                )}
                                {activa && soyCreador && sesion && (
                                    <>
                                        <DropdownMenuSeparator className="bg-white/10" />
                                        <DropdownMenuItem
                                            className="cursor-pointer gap-2.5 rounded-[12px] px-2.5 py-2 text-[14px] text-rose-200 focus:text-rose-100"
                                            onSelect={() => void terminar(sesion)}
                                        >
                                            <CircleStop className="h-4 w-4 text-[#DC143C]" aria-hidden="true" /> Terminar sesión
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {terminada ? (
                        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/70">
                            <span className={`${estilos.punto} ${estilos.quieto}`} aria-hidden="true" />
                            Sesión terminada
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-2 text-[13px] text-white/80" aria-live="polite">
                            <span className={sesion ? estilos.punto : `${estilos.punto} ${estilos.quieto}`} aria-hidden="true" />
                            {!listo && sesionId
                                ? "Comprobando…"
                                : sesion
                                    ? textoPresencia(presentes)
                                    : "App compartida en el chat"}
                        </span>
                    )}
                </div>

                {!terminada && (
                    <div className="flex flex-wrap gap-1.5">
                        <ChipVivo color={color} icono={infoPermiso.icono}>{infoPermiso.etiqueta}</ChipVivo>
                        {sesion && (
                            <ChipVivo color="#FFFFFF" icono={MODOS_INFO[sesion.modo].icono} titulo={MODOS_INFO[sesion.modo].ayuda}>
                                {MODOS_INFO[sesion.modo].etiqueta}
                            </ChipVivo>
                        )}
                    </div>
                )}

                {terminada ? (
                    <p className="text-[12px] leading-snug text-white/55">
                        Ya no está abierta. Lo que se hizo sigue guardado en su {entrada?.etiqueta.toLowerCase() ?? "app"}.
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={abrir}
                        disabled={!sesionId}
                        className="ss-redondo flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:active:scale-100"
                        style={{
                            background: `linear-gradient(135deg, ${color}, ${color}b3)`,
                            color: colorTextoSobre(color),
                            boxShadow: `0 10px 22px -14px ${color}`,
                        }}
                        aria-label={`Abrir ${titulo}`}
                    >
                        Abrir
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            {invitarUsado && sesionId && (
                <InvitarSesionDialog open={invitarAbierto} onOpenChange={setInvitarAbierto} sesionId={sesionId} />
            )}
        </article>
    );
}

export default TarjetaVivo;
