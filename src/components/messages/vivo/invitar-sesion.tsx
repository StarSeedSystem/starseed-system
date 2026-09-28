"use client";

/**
 * InvitarSesionDialog (contrato C6) — invitar a más gente a una app en vivo o a una llamada:
 *   · personas (tus contactos primero), perfiles de la red y grupos → `invitar()` + acceso real
 *     al recurso, con aviso opcional por mensaje directo;
 *   · enlace privado (solo chat e invitados, con cuenta);
 *   · enlace público (crear / revocar, permiso, copiar).
 * Solo quien abrió la sesión puede invitar o abrir el enlace público (RLS de os_sesiones_vivas);
 * el resto ve el enlace privado y el motivo.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Globe2, Info, Loader2, Lock, RefreshCw, UserPlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { PermisoVivo, SesionViva } from "@/lib/mensajeria/formato-tipos";
import {
    construirUrlPublica,
    enlacePrivado,
    esTipoLlamada,
    miUid,
    origenActual,
    sesionVigente,
    urlAbsoluta,
    useSesionViva,
} from "@/lib/mensajeria/sesiones-vivas";
import { entradaVivo } from "@/components/messages/vivo/catalogo-vivo";
import {
    activarEnlacePublico,
    copiarAlPortapapeles,
    desactivarEnlacePublico,
    invitarASesion,
    tituloDeSesion,
} from "@/components/messages/vivo/acciones-vivo";
import {
    IconoTipoVivo,
    PERMISOS_INFO,
    RotuloVivo,
    VIOLETA_MENSAJES,
    colorTextoSobre,
} from "@/components/messages/vivo/comun-vivo";
import {
    SELECCION_VACIA,
    SelectorPersonas,
    cuantosElegidos,
    resolverSeleccion,
    type SeleccionInvitados,
} from "@/components/messages/vivo/selector-personas";

export interface InvitarSesionDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    sesionId: string;
}

export function InvitarSesionDialog({ open, onOpenChange, sesionId }: InvitarSesionDialogProps) {
    const { sesion, error, listo, recargar } = useSesionViva(open ? sesionId : null);
    const [uid, setUid] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        recargar();
        void miUid().then(setUid);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sesionId]);

    const entrada = sesion ? entradaVivo(sesion.tipo) : null;
    const llamada = sesion ? esTipoLlamada(sesion.tipo) : false;
    const color = entrada?.color ?? (llamada ? "#10B981" : VIOLETA_MENSAJES);
    const soyCreador = Boolean(sesion && uid && sesion.creador === uid);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92dvh] w-[95vw] max-w-lg gap-0 border-white/10 bg-[rgba(12,14,34,.88)] p-0 text-white backdrop-blur-2xl rounded-[24px] sm:rounded-[24px]">
                <div className="space-y-5 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                    <DialogHeader className="pr-12 text-left">
                        <div className="flex items-center gap-3">
                            <IconoTipoVivo
                                entrada={entrada ?? { icono: sesion?.tipo === "llamada:video" ? "Video" : "Phone", color }}
                                tam={40}
                            />
                            <div className="min-w-0">
                                <DialogTitle className="text-lg font-semibold text-white">
                                    {sesion ? `Invitar a ${tituloDeSesion(sesion)}` : "Invitar"}
                                </DialogTitle>
                                <DialogDescription className="text-[13px] text-white/65">
                                    {llamada ? "Suma personas a la llamada o comparte un enlace." : "Suma personas o comparte un enlace para entrar en vivo."}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {!listo ? (
                        <p className="flex items-center gap-2 py-6 text-[13px] text-white/60">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando la sesión…
                        </p>
                    ) : !sesion ? (
                        <p role="alert" className="rounded-[14px] bg-white/[0.04] px-3 py-3 text-[13px] text-white/75">
                            {error ?? "No encuentro esta sesión, o no tienes acceso a ella."}
                        </p>
                    ) : !sesionVigente(sesion) ? (
                        <p className="rounded-[14px] bg-white/[0.04] px-3 py-3 text-[13px] text-white/75">
                            Esta sesión ya terminó: no se puede invitar a nadie más.
                        </p>
                    ) : (
                        <>
                            {soyCreador ? (
                                <SeccionPersonas sesion={sesion} color={color} onHecho={recargar} />
                            ) : (
                                <p className="flex items-start gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-[12px] leading-snug text-white/70">
                                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
                                    Solo quien abrió la sesión puede invitar a más personas o crear un enlace público. Puedes compartir el enlace privado con quien ya esté en el chat.
                                </p>
                            )}
                            <SeccionEnlacePrivado sesion={sesion} />
                            {soyCreador && <SeccionEnlacePublico sesion={sesion} color={color} onHecho={recargar} />}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ───────────────────────────── Personas ─────────────────────────────

function SeccionPersonas({ sesion, color, onHecho }: { sesion: SesionViva; color: string; onHecho: () => void }) {
    const [seleccion, setSeleccion] = useState<SeleccionInvitados>(SELECCION_VACIA);
    // El aviso por mensaje directo lleva la tarjeta de la app; las llamadas avisan con su timbre.
    const permiteAvisar = !esTipoLlamada(sesion.tipo);
    const [avisarElegido, setAvisar] = useState(true);
    const avisar = permiteAvisar && avisarElegido;
    const [enviando, setEnviando] = useState(false);
    const idAvisar = useId();
    const excluir = useMemo(() => [sesion.creador, ...sesion.invitados], [sesion.creador, sesion.invitados]);
    const n = cuantosElegidos(seleccion);

    const invitarYa = async () => {
        setEnviando(true);
        try {
            const ids = await resolverSeleccion(seleccion, excluir);
            if (ids.length === 0) {
                toast.error("Esas personas ya estaban invitadas, o el grupo no tiene miembros.");
                return;
            }
            const r = await invitarASesion(sesion, ids, { avisar });
            if (r.error) {
                toast.error(r.error);
                return;
            }
            toast.success(ids.length === 1 ? "Persona invitada" : `${ids.length} personas invitadas`, {
                description: r.avisados > 0
                    ? `Les llegó la invitación por mensaje directo${r.avisados < ids.length ? ` (${r.avisados} de ${ids.length})` : ""}.`
                    : "Ya pueden entrar con su cuenta desde el enlace privado.",
            });
            if (r.concedidos !== null && r.concedidos < ids.length) {
                toast.message("Algunas personas aún no tienen acceso al contenido", {
                    description: "Vuelve a invitarlas en un momento.",
                });
            }
            setSeleccion(SELECCION_VACIA);
            onHecho();
        } finally {
            setEnviando(false);
        }
    };

    return (
        <section className="space-y-3" aria-labelledby={`${idAvisar}-titulo`}>
            <div className="flex items-baseline justify-between gap-2">
                <RotuloVivo id={`${idAvisar}-titulo`}>Personas y grupos</RotuloVivo>
                {sesion.invitados.length > 0 && (
                    <span className="text-[12px] text-white/55">
                        {sesion.invitados.length === 1 ? "1 invitada" : `${sesion.invitados.length} invitadas`}
                    </span>
                )}
            </div>
            <SelectorPersonas seleccion={seleccion} onCambiar={setSeleccion} excluir={excluir} color={color} />
            {permiteAvisar && (
                <label htmlFor={idAvisar} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-white/75">
                    <input
                        id={idAvisar}
                        type="checkbox"
                        checked={avisarElegido}
                        onChange={(e) => setAvisar(e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-[#7C5CFF]"
                    />
                    Avisar por mensaje directo
                </label>
            )}
            <button
                type="button"
                onClick={() => void invitarYa()}
                disabled={n === 0 || enviando}
                className="ss-redondo flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-[filter,opacity] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}b3)`, color: colorTextoSobre(color) }}
            >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                {enviando ? "Invitando…" : n > 0 ? `Invitar (${n})` : "Invitar"}
            </button>
        </section>
    );
}

// ───────────────────────────── Enlaces ─────────────────────────────

function FilaEnlace({ url, etiquetaCopiar = "Copiar" }: { url: string; etiquetaCopiar?: string }) {
    return (
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center">
            <code className="min-w-0 flex-1 break-all rounded-[12px] bg-black/30 px-3 py-2 font-mono text-[12px] text-white/80">
                {url}
            </code>
            <button
                type="button"
                onClick={async () => {
                    const ok = await copiarAlPortapapeles(url);
                    if (ok) toast.success("Enlace copiado");
                    else toast.message("Copia el enlace a mano", { description: url });
                }}
                className="ss-redondo inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-white/[0.14]"
            >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {etiquetaCopiar}
            </button>
        </div>
    );
}

function SeccionEnlacePrivado({ sesion }: { sesion: SesionViva }) {
    const url = urlAbsoluta(enlacePrivado(sesion));
    return (
        <section className="space-y-2 rounded-[16px] bg-white/[0.03] p-3.5" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" }}>
            <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-white/70" aria-hidden="true" />
                <p className="text-[14px] font-semibold text-white">Enlace privado</p>
            </div>
            <p className="text-[12px] leading-snug text-white/60">
                Solo entran, con su cuenta, las personas de este chat y las que invites.
            </p>
            <FilaEnlace url={url} />
        </section>
    );
}

function SeccionEnlacePublico({ sesion, color, onHecho }: { sesion: SesionViva; color: string; onHecho: () => void }) {
    const entrada = entradaVivo(sesion.tipo);
    const llamada = esTipoLlamada(sesion.tipo);
    const permisos: PermisoVivo[] = entrada?.permisos ?? [];
    const activo = sesion.modo === "publico" && Boolean(sesion.tokenPublico);
    const [permiso, setPermiso] = useState<PermisoVivo>(
        permisos.includes(sesion.permiso) ? sesion.permiso : permisos[0] ?? sesion.permiso,
    );
    const [ocupado, setOcupado] = useState(false);
    const idSwitch = useId();
    const url = activo && sesion.tokenPublico ? construirUrlPublica(origenActual(), sesion, sesion.tokenPublico) : null;

    const crear = async (p: PermisoVivo, rotar: boolean) => {
        setOcupado(true);
        try {
            const r = await activarEnlacePublico(sesion, p);
            if (!r.url) {
                toast.error(r.error ?? "No se pudo crear el enlace público.");
                return;
            }
            const copiado = await copiarAlPortapapeles(r.url);
            toast.success(rotar ? "Enlace público nuevo" : "Enlace público creado", {
                description: `${copiado ? "Copiado. " : ""}${rotar ? "El anterior ya no funciona." : "Cualquiera con él puede entrar."}`,
            });
            if (r.aviso) toast.message(r.aviso);
            onHecho();
        } finally {
            setOcupado(false);
        }
    };

    const revocar = async () => {
        setOcupado(true);
        try {
            const err = await desactivarEnlacePublico(sesion);
            if (err) toast.error(err);
            else toast.success("Enlace público desactivado", { description: "Quien lo tenga ya no puede entrar." });
            onHecho();
        } finally {
            setOcupado(false);
        }
    };

    return (
        <section className="space-y-3 rounded-[16px] bg-white/[0.03] p-3.5" style={{ boxShadow: activo ? `inset 0 0 0 1px ${color}55` : "inset 0 0 0 1px rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={idSwitch} className="flex cursor-pointer items-center gap-2">
                    <Globe2 className="h-4 w-4" style={{ color: activo ? color : "rgba(255,255,255,.7)" }} aria-hidden="true" />
                    <span className="text-[14px] font-semibold text-white">Enlace público</span>
                </label>
                <span className="flex items-center gap-2">
                    {ocupado && <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-label="Guardando" />}
                    <Switch
                        id={idSwitch}
                        checked={activo}
                        disabled={ocupado}
                        onCheckedChange={(v) => void (v ? crear(permiso, false) : revocar())}
                        aria-label={activo ? "Desactivar el enlace público" : "Activar el enlace público"}
                        className="cursor-pointer"
                    />
                </span>
            </div>
            <p className="text-[12px] leading-snug text-white/60">
                Cualquiera con el enlace puede entrar, aunque no tenga cuenta. Lo puedes desactivar cuando quieras.
            </p>

            {!llamada && permisos.length > 1 && (
                <div className="space-y-1.5">
                    <RotuloVivo>Permiso por el enlace</RotuloVivo>
                    <div role="radiogroup" aria-label="Permiso por el enlace público" className="flex flex-wrap gap-1.5">
                        {permisos.map((p) => {
                            const sel = p === permiso;
                            return (
                                <button
                                    key={p}
                                    type="button"
                                    role="radio"
                                    aria-checked={sel}
                                    disabled={ocupado}
                                    onClick={() => {
                                        setPermiso(p);
                                        if (activo && p !== sesion.permiso) void crear(p, true);
                                    }}
                                    className="ss-redondo cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 disabled:cursor-wait"
                                    style={sel
                                        ? { background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}99`, color: "#fff" }
                                        : { background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)" }}
                                >
                                    {PERMISOS_INFO[p].etiqueta}
                                </button>
                            );
                        })}
                    </div>
                    {entrada && !entrada.edicionPorEnlacePublico && permiso !== "ver" && (
                        <p className="flex items-start gap-2 text-[12px] leading-snug text-amber-200/85">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Por el enlace público se entra a ver. Para editar, la persona necesita estar en el chat o invitada.
                        </p>
                    )}
                    {activo && (
                        <p className="text-[12px] text-white/50">Cambiar el permiso crea un enlace nuevo; el anterior deja de funcionar.</p>
                    )}
                </div>
            )}

            {url && (
                <div className="space-y-2">
                    <FilaEnlace url={url} />
                    <button
                        type="button"
                        onClick={() => void crear(permiso, true)}
                        disabled={ocupado}
                        className="ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white/75 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white disabled:cursor-wait"
                    >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Crear un enlace nuevo (anula el actual)
                    </button>
                </div>
            )}
        </section>
    );
}

export default InvitarSesionDialog;
