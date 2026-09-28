"use client";

/**
 * SelectorVivoDialog — elegir QUÉ se comparte en vivo en el chat y con QUIÉN.
 *
 *   1. Tipo: rejilla de apps en vivo disponibles (y, aparte, lo que llega pronto con su motivo
 *      honesto: nada de botones que no hacen nada).
 *   2. Detalle: crear nuevo o compartir uno tuyo, título (y dirección web o plantilla si el tipo
 *      lo pide), acceso (este chat · chat e invitados · enlace público) y permiso.
 *   3. Compartir: crea el recurso + la sesión, da acceso y entrega el adjunto a `onEnviar`.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Info, LayoutTemplate, Loader2, Radio, Sparkles } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { DmAttachment } from "@/lib/messages/dm";
import type { ModoAcceso, PermisoVivo } from "@/lib/mensajeria/formato-tipos";
import {
    normalizarUrlWeb,
    plantillasDeSala,
    tiposDisponibles,
    tiposProximamente,
    type EntradaCatalogoVivo,
    type RecursoVivo,
} from "@/components/messages/vivo/catalogo-vivo";
import {
    avisarPorMensaje,
    compartirVivo,
    copiarAlPortapapeles,
} from "@/components/messages/vivo/acciones-vivo";
import {
    ChipVivo,
    colorTextoSobre,
    IconoTipoVivo,
    MODOS_INFO,
    PERMISOS_INFO,
    RotuloVivo,
} from "@/components/messages/vivo/comun-vivo";
import {
    SELECCION_VACIA,
    SelectorPersonas,
    cuantosElegidos,
    resolverSeleccion,
    type SeleccionInvitados,
} from "@/components/messages/vivo/selector-personas";

const MUELLE = { type: "spring" as const, stiffness: 380, damping: 32 };
const MODOS: ModoAcceso[] = ["chat", "invitados", "publico"];

export interface SelectorVivoProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    hiloId: string;
    onEnviar: (r: { body: string; attachments: DmAttachment[] }) => void | Promise<void>;
}

export function SelectorVivoDialog({ open, onOpenChange, hiloId, onEnviar }: SelectorVivoProps) {
    const [entrada, setEntrada] = useState<EntradaCatalogoVivo | null>(null);

    const cerrar = useCallback(
        (v: boolean) => {
            onOpenChange(v);
            if (!v) setTimeout(() => setEntrada(null), 250);
        },
        [onOpenChange],
    );

    return (
        <Dialog open={open} onOpenChange={cerrar}>
            <DialogContent className="max-h-[92dvh] w-[95vw] max-w-2xl gap-0 border-white/10 bg-[rgba(12,14,34,.88)] p-0 text-white backdrop-blur-2xl rounded-[24px] sm:rounded-[24px]">
                <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                    <DialogHeader className="mb-4 pr-12 text-left">
                        <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Radio className="h-5 w-5 text-[#7C5CFF]" aria-hidden="true" />
                            Compartir en vivo
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-white/65">
                            Abre algo que todas las personas del chat podéis usar a la vez.
                        </DialogDescription>
                    </DialogHeader>

                    <AnimatePresence mode="wait" initial={false}>
                        {entrada ? (
                            <motion.div
                                key={`config-${entrada.tipo}`}
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={MUELLE}
                            >
                                <PasoDetalle
                                    entrada={entrada}
                                    hiloId={hiloId}
                                    onVolver={() => setEntrada(null)}
                                    onHecho={async (r) => {
                                        await onEnviar(r);
                                        cerrar(false);
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="tipos"
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={MUELLE}
                            >
                                <PasoTipo onElegir={setEntrada} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ───────────────────────────── Paso 1: tipo ─────────────────────────────

function PasoTipo({ onElegir }: { onElegir: (e: EntradaCatalogoVivo) => void }) {
    const disponibles = useMemo(() => tiposDisponibles(), []);
    const pronto = useMemo(() => tiposProximamente(), []);
    const [verPronto, setVerPronto] = useState(false);
    const idPronto = useId();

    return (
        <div className="space-y-4">
            <ul className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2" aria-label="Apps en vivo disponibles">
                {disponibles.map((e) => (
                    <li key={e.tipo}>
                        <button
                            type="button"
                            onClick={() => onElegir(e)}
                            className="group flex h-full w-full cursor-pointer items-start gap-3 rounded-[16px] p-3.5 text-left transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hover:translate-y-0"
                            style={{
                                background: `linear-gradient(160deg, ${e.color}17, rgba(255,255,255,.025))`,
                                boxShadow: `inset 0 0 0 1px ${e.color}33, inset 0 1px 0 rgba(255,255,255,.06)`,
                                outlineColor: e.color,
                            }}
                        >
                            <IconoTipoVivo entrada={e} tam={44} />
                            <span className="min-w-0 flex-1 space-y-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[15px] font-semibold text-white">{e.etiqueta}</span>
                                    <ChipVivo color="#10B981">En vivo</ChipVivo>
                                </span>
                                <span className="block text-[13px] leading-snug text-white/65">{e.descripcion}</span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>

            {pronto.length > 0 && (
                <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={() => setVerPronto((v) => !v)}
                        aria-expanded={verPronto}
                        aria-controls={idPronto}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[16px] px-3.5 py-3 text-left text-[13px] font-semibold text-white/75 transition-colors duration-200 hover:bg-white/[0.04]"
                    >
                        <span className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-white/50" aria-hidden="true" />
                            Próximamente ({pronto.length})
                        </span>
                        <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${verPronto ? "rotate-180" : ""}`}
                            aria-hidden="true"
                        />
                    </button>
                    <AnimatePresence initial={false}>
                        {verPronto && (
                            <motion.ul
                                id={idPronto}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22 }}
                                className="overflow-hidden px-3.5"
                                aria-label="Apps en vivo que llegan pronto"
                            >
                                {pronto.map((e) => (
                                    <li key={e.tipo} className="flex items-start gap-3 border-t border-white/[0.06] py-3 first:border-t-0">
                                        <IconoTipoVivo entrada={e} tam={32} apagado />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-white/80">
                                                {e.etiqueta}
                                                <ChipVivo color="#9CA3AF">Próximamente</ChipVivo>
                                            </p>
                                            <p className="mt-0.5 text-[12px] leading-snug text-white/55">{e.motivo}</p>
                                        </div>
                                    </li>
                                ))}
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── Paso 2: detalle ─────────────────────────────

function Segmentado<T extends string>({
    opciones,
    valor,
    onCambiar,
    etiqueta,
    color,
}: {
    opciones: { id: T; texto: string }[];
    valor: T;
    onCambiar: (v: T) => void;
    etiqueta: string;
    color: string;
}) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
            {opciones.map((o) => {
                const activo = o.id === valor;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        onClick={() => onCambiar(o.id)}
                        className="ss-redondo cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={
                            activo
                                ? { background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}99`, color: "#fff", outlineColor: color }
                                : { background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", outlineColor: color }
                        }
                    >
                        {o.texto}
                    </button>
                );
            })}
        </div>
    );
}

function PasoDetalle({
    entrada,
    hiloId,
    onVolver,
    onHecho,
}: {
    entrada: EntradaCatalogoVivo;
    hiloId: string;
    onVolver: () => void;
    onHecho: (r: { body: string; attachments: DmAttachment[] }) => Promise<void>;
}) {
    const color = entrada.color;
    const [origen, setOrigen] = useState<"nuevo" | "existente">("nuevo");
    const [existentes, setExistentes] = useState<RecursoVivo[] | null>(null);
    const [elegido, setElegido] = useState<RecursoVivo | null>(null);
    const [titulo, setTitulo] = useState("");
    const [url, setUrl] = useState("");
    const plantillas = useMemo(() => (entrada.pide === "plantilla" ? plantillasDeSala() : []), [entrada.pide]);
    const [plantillaId, setPlantillaId] = useState<string | null>(plantillas[0]?.id ?? null);
    const [modo, setModo] = useState<ModoAcceso>("chat");
    const [permiso, setPermiso] = useState<PermisoVivo>(entrada.permisos.includes("editar") ? "editar" : entrada.permisos[0]);
    const [seleccion, setSeleccion] = useState<SeleccionInvitados>(SELECCION_VACIA);
    const [avisar, setAvisar] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idTitulo = useId();
    const idUrl = useId();
    const idAvisar = useId();

    useEffect(() => {
        if (origen !== "existente" || existentes !== null || !entrada.listarMios) return;
        let vivo = true;
        void entrada.listarMios().then(
            (xs) => vivo && setExistentes(xs),
            () => vivo && setExistentes([]),
        );
        return () => {
            vivo = false;
        };
    }, [origen, existentes, entrada]);

    const plantilla = plantillas.find((p) => p.id === plantillaId) ?? null;
    const urlValida = entrada.pide === "url" ? normalizarUrlWeb(url) : null;
    const tituloSugerido = origen === "existente"
        ? elegido?.titulo ?? ""
        : urlValida
            ? new URL(urlValida).hostname
            : plantilla?.nombre ?? entrada.etiqueta;

    const compartir = async () => {
        setError(null);
        if (origen === "existente" && !elegido) {
            setError(`Elige cuál de tus ${entrada.etiqueta.toLowerCase()}s quieres compartir.`);
            return;
        }
        if (origen === "nuevo" && entrada.pide === "url" && !normalizarUrlWeb(url)) {
            setError("Escribe una dirección web válida, por ejemplo https://starseed.network");
            return;
        }
        setEnviando(true);
        try {
            const invitados = modo === "invitados" ? await resolverSeleccion(seleccion) : [];
            if (modo === "invitados" && invitados.length === 0) {
                setError("Elige al menos a una persona o un grupo con miembros.");
                return;
            }
            const r = await compartirVivo({
                hiloId,
                entrada,
                titulo: titulo.trim() || tituloSugerido,
                opciones: { url, plantillaId },
                existente: origen === "existente" ? elegido : null,
                modo,
                permiso,
                invitados,
            });
            if (!r.ok) {
                setError(r.error);
                return;
            }
            await onHecho({ body: r.body, attachments: [r.adjunto] });
            toast.success("Compartido en el chat", { description: r.adjunto.name });
            if (r.urlPublica) {
                const copiado = await copiarAlPortapapeles(r.urlPublica);
                if (copiado) toast.message("Enlace público copiado", { description: "Pégalo donde quieras invitar." });
                else toast.message("Enlace público", { description: r.urlPublica });
            }
            for (const aviso of r.avisos) toast.message(aviso);
            if (modo === "invitados" && avisar && invitados.length > 0) {
                const n = await avisarPorMensaje(r.sesion, invitados);
                if (n > 0) toast.message(n === 1 ? "Invitación enviada por mensaje directo" : `${n} invitaciones enviadas por mensaje directo`);
            }
        } catch (e) {
            setError((e as Error)?.message || "No se pudo compartir. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onVolver}
                    className="ss-redondo grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white/[0.06] text-white/80 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
                    aria-label="Volver a elegir el tipo"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <IconoTipoVivo entrada={entrada} tam={40} />
                <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-white">{entrada.etiqueta}</p>
                    <p className="text-[12px] text-white/60">{entrada.descripcion}</p>
                </div>
            </div>

            {entrada.nota && (
                <p className="flex items-start gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-[12px] leading-snug text-white/70">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
                    {entrada.nota}
                </p>
            )}

            {entrada.listarMios && (
                <Segmentado
                    etiqueta="Qué compartir"
                    color={color}
                    valor={origen}
                    onCambiar={(v) => {
                        setOrigen(v);
                        setError(null);
                    }}
                    opciones={[
                        { id: "nuevo", texto: "Crear nuevo" },
                        { id: "existente", texto: "Compartir uno existente" },
                    ]}
                />
            )}

            {origen === "existente" ? (
                <section className="space-y-2">
                    <RotuloVivo>Tus {entrada.etiqueta.toLowerCase()}s compartibles</RotuloVivo>
                    {existentes === null ? (
                        <p className="flex items-center gap-2 py-3 text-[13px] text-white/60">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando las tuyas…
                        </p>
                    ) : existentes.length === 0 ? (
                        <p className="rounded-[14px] bg-white/[0.03] px-3 py-3 text-[13px] text-white/60">
                            Aún no has creado ninguna que se pueda compartir. Crea una nueva.
                        </p>
                    ) : (
                        <ul role="radiogroup" aria-label={`Elige ${entrada.etiqueta.toLowerCase()}`} className="max-h-52 space-y-1 overflow-y-auto pr-1">
                            {existentes.map((r) => {
                                const activo = elegido?.refId === r.refId;
                                return (
                                    <li key={r.refId}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={activo}
                                            onClick={() => setElegido(r)}
                                            className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] text-white transition-colors duration-200 hover:bg-white/[0.06]"
                                            style={activo ? { background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}66` } : undefined}
                                        >
                                            <IconoTipoVivo entrada={entrada} tam={28} />
                                            <span className="min-w-0 flex-1 font-semibold">{r.titulo}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            ) : (
                <>
                    {plantillas.length > 0 && (
                        <section className="space-y-2">
                            <RotuloVivo>Plantilla</RotuloVivo>
                            <ul role="radiogroup" aria-label="Plantilla de la sala" className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                                {[...plantillas.map((p) => ({ id: p.id as string | null, nombre: p.nombre, texto: p.proposito })),
                                    { id: null, nombre: "En blanco", texto: "Una sala vacía para lo que surja." }].map((p) => {
                                    const activo = plantillaId === p.id;
                                    return (
                                        <li key={p.id ?? "blanco"}>
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={activo}
                                                onClick={() => setPlantillaId(p.id)}
                                                className="flex h-full w-full cursor-pointer items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06]"
                                                style={activo
                                                    ? { background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}77` }
                                                    : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                                            >
                                                <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
                                                <span className="min-w-0">
                                                    <span className="block text-[14px] font-semibold text-white">{p.nombre}</span>
                                                    <span className="block text-[12px] leading-snug text-white/60">{p.texto}</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {entrada.pide === "url" && (
                        <div className="space-y-1.5">
                            <label htmlFor={idUrl} className="block">
                                <RotuloVivo>Dirección web</RotuloVivo>
                            </label>
                            <input
                                id={idUrl}
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                inputMode="url"
                                autoComplete="url"
                                spellCheck={false}
                                placeholder="https://…"
                                className="h-11 w-full rounded-[14px] border border-white/10 bg-white/[0.05] px-3.5 text-[15px] text-white outline-none transition-colors duration-200 placeholder:text-white/35 focus:border-white/25"
                            />
                        </div>
                    )}
                </>
            )}

            <div className="space-y-1.5">
                <label htmlFor={idTitulo} className="block">
                    <RotuloVivo>Título</RotuloVivo>
                </label>
                <input
                    id={idTitulo}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value.slice(0, 200))}
                    placeholder={tituloSugerido || entrada.etiqueta}
                    className="h-11 w-full rounded-[14px] border border-white/10 bg-white/[0.05] px-3.5 text-[15px] text-white outline-none transition-colors duration-200 placeholder:text-white/40 focus:border-white/25"
                />
            </div>

            <section className="space-y-2">
                <RotuloVivo>Quién puede entrar</RotuloVivo>
                <ul role="radiogroup" aria-label="Quién puede entrar" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {MODOS.map((m) => {
                        const info = MODOS_INFO[m];
                        const Icono = info.icono;
                        const activo = modo === m;
                        return (
                            <li key={m}>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={activo}
                                    onClick={() => setModo(m)}
                                    className="flex h-full w-full cursor-pointer items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06]"
                                    style={activo
                                        ? { background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}77` }
                                        : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                                >
                                    <Icono className="mt-0.5 h-4 w-4 shrink-0" style={{ color: activo ? color : "rgba(255,255,255,.6)" }} aria-hidden="true" />
                                    <span className="min-w-0">
                                        <span className="block text-[14px] font-semibold text-white">
                                            {m === "invitados" ? "Invitados concretos" : m === "chat" ? "Solo este chat" : info.etiqueta}
                                        </span>
                                        <span className="block text-[12px] leading-snug text-white/60">{info.ayuda}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {modo === "invitados" && (
                <section className="space-y-2 rounded-[16px] bg-white/[0.02] p-3" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" }}>
                    <SelectorPersonas seleccion={seleccion} onCambiar={setSeleccion} color={color} />
                    <label htmlFor={idAvisar} className="flex cursor-pointer items-center gap-2.5 pt-1 text-[13px] text-white/75">
                        <input
                            id={idAvisar}
                            type="checkbox"
                            checked={avisar}
                            onChange={(e) => setAvisar(e.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-[#7C5CFF]"
                        />
                        Avisar por mensaje directo a quien invite
                        {cuantosElegidos(seleccion) > 0 ? ` (${cuantosElegidos(seleccion)})` : ""}
                    </label>
                </section>
            )}

            {entrada.permisos.length > 1 && (
                <section className="space-y-2">
                    <RotuloVivo>Permiso</RotuloVivo>
                    <Segmentado
                        etiqueta="Permiso"
                        color={color}
                        valor={permiso}
                        onCambiar={setPermiso}
                        opciones={entrada.permisos.map((p) => ({ id: p, texto: PERMISOS_INFO[p].etiqueta }))}
                    />
                    <p className="text-[12px] text-white/55">{PERMISOS_INFO[permiso].ayuda}</p>
                    {modo === "publico" && !entrada.edicionPorEnlacePublico && permiso !== "ver" && (
                        <p className="flex items-start gap-2 text-[12px] leading-snug text-amber-200/85">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Por el enlace público se entra a ver. Para editar, la persona necesita estar en el chat o invitada.
                        </p>
                    )}
                </section>
            )}

            {error && (
                <p role="alert" className="rounded-[14px] bg-[#DC143C]/15 px-3 py-2.5 text-[13px] text-rose-100" style={{ boxShadow: "inset 0 0 0 1px #DC143C55" }}>
                    {error}
                </p>
            )}

            <button
                type="button"
                onClick={() => void compartir()}
                disabled={enviando}
                className="ss-redondo flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}b3)`, boxShadow: `0 10px 24px -12px ${color}`, color: colorTextoSobre(color) }}
            >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Radio className="h-4 w-4" aria-hidden="true" />}
                {enviando ? "Compartiendo…" : "Compartir en el chat"}
            </button>
        </div>
    );
}
