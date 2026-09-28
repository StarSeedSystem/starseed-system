"use client";

/**
 * EditorContacto (contrato C8) — crear o editar una persona de la libreta. Diálogo de cristal
 * en escritorio y hoja a pantalla completa en móvil. Todo lo que se escribe aquí es PRIVADO;
 * lo único que puede salir de la cuenta es el propio contacto en la lista pública (solo si
 * tiene cuenta StarSeed y se marca «Pública»), y aun así sin teléfono, correo ni notas.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
    AtSign,
    Briefcase,
    Cake,
    Check,
    FolderHeart,
    Globe2,
    Link2,
    ListChecks,
    Loader2,
    Lock,
    MapPin,
    Phone,
    Plus,
    Search,
    Sparkles,
    Star,
    Tag,
    Trash2,
    UserRound,
    X,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useContactos } from "@/lib/contactos/store";
import { aplicarCambios } from "@/lib/contactos/modelo";
import { RELACIONES, type Contacto, type ContactoEntrada } from "@/lib/contactos/tipos";
import { searchUsers, type OsProfile } from "@/lib/social/os-profiles";
import { cn } from "@/lib/utils";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_BOTON_PRINCIPAL,
    CLASE_CAMPO,
    CLASE_FOCO,
    CLASE_ROTULO,
    CLASE_TARJETA,
    colorSiguiente,
    pildora,
} from "@/components/contactos/app/estilos";
import { iconoRelacion } from "@/components/contactos/app/iconos";
import { Interruptor } from "@/components/contactos/app/piezas";
import { aplicarVisibilidad } from "@/components/contactos/app/acciones";
import {
    ETIQUETAS_CORREO,
    ETIQUETAS_TELEFONO,
    borradorDesde,
    entradaDesde,
    filaCorreoVacia,
    filaEnlaceVacia,
    filaTelefonoVacia,
    validarBorrador,
    type Borrador,
    type FilaDato,
    type ModoCumple,
} from "@/components/contactos/app/borrador";
import { NOMBRES_MES, ymdLocal } from "@/components/contactos/app/vista";

export interface EditorContactoProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Si se pasa, edita ese contacto; si no, crea uno nuevo. */
    contactoId?: string;
    /** Valores iniciales al crear (p. ej. desde un perfil o `?nuevo=`). */
    inicial?: ContactoEntrada;
    onGuardado?: (c: Contacto) => void;
}

const PERSONALIZADA = "__personalizada__";

// ─────────────────────────── Piezas del formulario ───────────────────────────

function Bloque({ titulo, icono: Icono, children, ayuda }: { titulo: string; icono: typeof Phone; children: ReactNode; ayuda?: string }) {
    return (
        <fieldset className="flex min-w-0 flex-col gap-2.5">
            <legend className={cn(CLASE_ROTULO, "mb-2.5 inline-flex items-center gap-1.5")}>
                <Icono className="h-3.5 w-3.5" style={{ color: ACENTO }} aria-hidden />
                {titulo}
            </legend>
            {ayuda ? <p className="-mt-1 text-[12px] text-white/50">{ayuda}</p> : null}
            {children}
        </fieldset>
    );
}

function MensajeError({ id, texto }: { id: string; texto?: string }) {
    if (!texto) return null;
    return (
        <p id={id} className="text-[12px] text-rose-300">
            {texto}
        </p>
    );
}

function FilasDatos({
    filas,
    tipo,
    errores,
    onCambiar,
}: {
    filas: FilaDato[];
    tipo: "telefono" | "correo";
    errores: Record<string, string>;
    onCambiar: (filas: FilaDato[]) => void;
}) {
    const base = useId();
    const predefinidas: readonly string[] = tipo === "telefono" ? ETIQUETAS_TELEFONO : ETIQUETAS_CORREO;
    const nombre = tipo === "telefono" ? "teléfono" : "correo";
    const actualizar = (id: string, patch: Partial<FilaDato>) => onCambiar(filas.map((f) => (f.id === id ? { ...f, ...patch } : f)));

    return (
        <div className="flex flex-col gap-2">
            {filas.map((f, i) => {
                const idError = `${base}-err-${f.id}`;
                const error = errores[`${tipo}:${f.id}`];
                return (
                    <div key={f.id} className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                            <label className="sr-only" htmlFor={`${base}-et-${f.id}`}>
                                Etiqueta del {nombre} {i + 1}
                            </label>
                            <select
                                id={`${base}-et-${f.id}`}
                                value={f.personalizada ? PERSONALIZADA : f.etiqueta}
                                onChange={(e) =>
                                    e.target.value === PERSONALIZADA
                                        ? actualizar(f.id, { personalizada: true, etiqueta: "" })
                                        : actualizar(f.id, { personalizada: false, etiqueta: e.target.value })
                                }
                                className={cn(CLASE_CAMPO, "w-auto cursor-pointer capitalize [color-scheme:dark] sm:w-36")}
                            >
                                {predefinidas.map((p) => (
                                    <option key={p} value={p} className="capitalize">
                                        {p}
                                    </option>
                                ))}
                                <option value={PERSONALIZADA}>Personalizada…</option>
                            </select>
                            {f.personalizada ? (
                                <>
                                    <label className="sr-only" htmlFor={`${base}-etp-${f.id}`}>
                                        Etiqueta personalizada del {nombre} {i + 1}
                                    </label>
                                    <input
                                        id={`${base}-etp-${f.id}`}
                                        value={f.etiqueta}
                                        onChange={(e) => actualizar(f.id, { etiqueta: e.target.value })}
                                        placeholder="Etiqueta"
                                        className={cn(CLASE_CAMPO, "w-32")}
                                    />
                                </>
                            ) : null}
                            <label className="sr-only" htmlFor={`${base}-v-${f.id}`}>
                                {tipo === "telefono" ? `Teléfono ${i + 1}` : `Correo ${i + 1}`}
                            </label>
                            <input
                                id={`${base}-v-${f.id}`}
                                type={tipo === "telefono" ? "tel" : "email"}
                                inputMode={tipo === "telefono" ? "tel" : "email"}
                                autoComplete="off"
                                value={f.valor}
                                onChange={(e) => actualizar(f.id, { valor: e.target.value })}
                                placeholder={tipo === "telefono" ? "+34 600 000 000" : "nombre@dominio.org"}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? idError : undefined}
                                className={cn(CLASE_CAMPO, "min-w-0 flex-1", error && "border-rose-400/60")}
                            />
                            <button
                                type="button"
                                onClick={() => onCambiar(filas.filter((x) => x.id !== f.id))}
                                aria-label={`Quitar ${tipo === "telefono" ? "teléfono" : "correo"} ${i + 1}`}
                                className={cn(CLASE_BOTON_ICONO, "hover:text-rose-300")}
                            >
                                <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                        <MensajeError id={idError} texto={error} />
                    </div>
                );
            })}
            <button
                type="button"
                onClick={() => onCambiar([...filas, tipo === "telefono" ? filaTelefonoVacia() : filaCorreoVacia()])}
                className={cn(CLASE_BOTON, "self-start")}
            >
                <Plus className="h-4 w-4" aria-hidden />
                {tipo === "telefono" ? "Añadir teléfono" : "Añadir correo"}
            </button>
        </div>
    );
}

/** Chips seleccionables (categorías o listas) con creación en línea. */
function SelectorEtiquetas({
    titulo,
    items,
    seleccion,
    onCambiar,
    onCrear,
    textoCrear,
}: {
    titulo: string;
    items: { id: string; nombre: string; color: string }[];
    seleccion: string[];
    onCambiar: (ids: string[]) => void;
    onCrear: (nombre: string) => string | null;
    textoCrear: string;
}) {
    const id = useId();
    const [creando, setCreando] = useState(false);
    const [nombre, setNombre] = useState("");
    const crear = () => {
        const n = nombre.trim();
        if (!n) return;
        const nuevoId = onCrear(n);
        if (nuevoId) onCambiar([...seleccion, nuevoId]);
        setNombre("");
        setCreando(false);
    };
    return (
        <div className="flex flex-col gap-2">
            {items.length ? (
                <div role="group" aria-label={titulo} className="flex flex-wrap gap-1.5">
                    {items.map((it) => {
                        const activo = seleccion.includes(it.id);
                        return (
                            <button
                                key={it.id}
                                type="button"
                                aria-pressed={activo}
                                onClick={() => onCambiar(activo ? seleccion.filter((x) => x !== it.id) : [...seleccion, it.id])}
                                className={cn(
                                    "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200",
                                    activo ? "text-white" : "text-white/60 hover:text-white/90",
                                    CLASE_FOCO,
                                )}
                                style={activo ? pildora(it.color) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
                            >
                                {activo ? (
                                    <Check className="h-3.5 w-3.5" style={{ color: it.color }} aria-hidden />
                                ) : (
                                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: it.color }} />
                                )}
                                {it.nombre}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="text-[12px] text-white/45">Aún no has creado ninguna.</p>
            )}
            {creando ? (
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`${id}-nueva`} className="sr-only">
                        {textoCrear}
                    </label>
                    <input
                        id={`${id}-nueva`}
                        autoFocus
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                crear();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                setCreando(false);
                            }
                        }}
                        placeholder="Nombre"
                        className={cn(CLASE_CAMPO, "min-w-0 flex-1")}
                    />
                    <button type="button" onClick={crear} disabled={!nombre.trim()} className={CLASE_BOTON_PRINCIPAL}>
                        Crear
                    </button>
                    <button type="button" onClick={() => setCreando(false)} className={CLASE_BOTON}>
                        Cancelar
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setCreando(true)} className={cn(CLASE_BOTON, "self-start")}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {textoCrear}
                </button>
            )}
        </div>
    );
}

/** Búsqueda de perfiles StarSeed para vincular la ficha a una cuenta. */
function VincularCuenta({
    borrador,
    contactoId,
    porUserId,
    onVincular,
    onDesvincular,
}: {
    borrador: Borrador;
    contactoId?: string;
    porUserId: (uid: string) => Contacto | undefined;
    onVincular: (p: OsProfile) => void;
    onDesvincular: () => void;
}) {
    const id = useId();
    const [q, setQ] = useState("");
    const [resultados, setResultados] = useState<OsProfile[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [buscado, setBuscado] = useState(false);

    useEffect(() => {
        const termino = q.trim().replace(/^@+/, "");
        if (termino.length < 2) {
            setResultados([]);
            setBuscando(false);
            setBuscado(false);
            return;
        }
        let vivo = true;
        setBuscando(true);
        const t = setTimeout(async () => {
            try {
                const r = await searchUsers(termino, 6);
                if (vivo) setResultados(r);
            } catch {
                if (vivo) setResultados([]);
            } finally {
                if (vivo) {
                    setBuscando(false);
                    setBuscado(true);
                }
            }
        }, 300);
        return () => {
            vivo = false;
            clearTimeout(t);
        };
    }, [q]);

    if (borrador.userId) {
        const nombre = borrador.perfil?.nombre || borrador.nombre || borrador.username || "Cuenta StarSeed";
        return (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl p-3" style={pildora(ACENTO)}>
                <AvatarContacto nombre={nombre} avatarUrl={borrador.perfil?.avatarUrl} tam={44} />
                <div className="min-w-0 flex-1">
                    <p className="break-words text-[14px] font-semibold text-white">{nombre}</p>
                    {borrador.username ? <p className="text-[12px] text-white/65">@{borrador.username}</p> : null}
                </div>
                <button type="button" onClick={onDesvincular} className={CLASE_BOTON}>
                    <X className="h-4 w-4" aria-hidden />
                    Desvincular
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="relative">
                <label htmlFor={`${id}-q`} className="sr-only">
                    Buscar una cuenta StarSeed
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                <input
                    id={`${id}-q`}
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Busca por nombre o @usuario"
                    autoComplete="off"
                    className={cn(CLASE_CAMPO, "pl-9")}
                />
                {buscando ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" aria-label="Buscando" />
                ) : null}
            </div>
            {resultados.length ? (
                <ul className="flex flex-col gap-1" aria-label="Cuentas encontradas">
                    {resultados.map((p) => {
                        const ya = porUserId(p.userId);
                        const yaEsOtro = Boolean(ya && ya.id !== contactoId);
                        return (
                            <li key={p.userId}>
                                <button
                                    type="button"
                                    disabled={yaEsOtro}
                                    onClick={() => onVincular(p)}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-55",
                                        CLASE_FOCO,
                                    )}
                                >
                                    <AvatarContacto nombre={p.displayName} avatarUrl={p.avatarUrl} tam={36} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-[14px] font-semibold text-white">{p.displayName}</span>
                                        <span className="block text-[12px] text-white/55">
                                            @{p.username}
                                            {yaEsOtro ? ` · ya está en tus contactos como «${ya?.nombre}»` : ""}
                                        </span>
                                    </span>
                                    {!yaEsOtro ? <span className="text-[12px] font-medium" style={{ color: ACENTO }}>Vincular</span> : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : buscado && !buscando ? (
                <p className="text-[12px] text-white/50">No encontramos a nadie con ese nombre en la red.</p>
            ) : null}
        </div>
    );
}

// ─────────────────────────── Editor ───────────────────────────

export function EditorContacto({ open, onOpenChange, contactoId, inicial, onGuardado }: EditorContactoProps) {
    const api = useContactos();
    const base = useId();
    const formRef = useRef<HTMLFormElement>(null);
    const existente = contactoId ? api.porId(contactoId) : undefined;

    const [b, setB] = useState<Borrador>(() => borradorDesde(existente ?? inicial));
    const [errores, setErrores] = useState<Record<string, string>>({});
    const [intentado, setIntentado] = useState(false);
    const [guardando, setGuardando] = useState(false);

    // Reinicia el formulario cada vez que se abre (o cambia de contacto estando abierto).
    const claveApertura = open ? `abierto:${contactoId ?? "nuevo"}` : "cerrado";
    const ultimaClave = useRef<string>("");
    useEffect(() => {
        if (claveApertura === ultimaClave.current) return;
        ultimaClave.current = claveApertura;
        if (!open) return;
        setB(borradorDesde(existente ?? inicial));
        setErrores({});
        setIntentado(false);
        setGuardando(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claveApertura]);

    const cambiar = (patch: Partial<Borrador>) => {
        const siguiente = { ...b, ...patch };
        setB(siguiente);
        if (intentado) setErrores(validarBorrador(siguiente));
    };

    const categorias = useMemo(() => api.categorias.map((c) => ({ id: c.id, nombre: c.nombre, color: c.color })), [api.categorias]);
    const listas = useMemo(() => api.listas.map((l) => ({ id: l.id, nombre: l.nombre, color: l.color })), [api.listas]);
    const numErrores = Object.keys(errores).length;
    const esNuevo = !existente;

    const guardar = async () => {
        const errs = validarBorrador(b);
        setErrores(errs);
        setIntentado(true);
        if (Object.keys(errs).length) {
            requestAnimationFrame(() => {
                const primero = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
                primero?.focus();
            });
            return;
        }
        setGuardando(true);
        const entrada = entradaDesde(b);
        try {
            let resultado: Contacto;
            if (existente) {
                const eraPublica = existente.visibilidad === "publica";
                const cambiaCuenta = (existente.userId ?? null) !== (b.userId ?? null);
                // Retirar ANTES de actualizar: la retirada usa la cuenta vinculada que tenía.
                if (eraPublica && (b.visibilidad === "privada" || cambiaCuenta)) {
                    const err = await aplicarVisibilidad(api, existente.id, "privada");
                    if (err) toast.error(`No se pudo retirar de tu lista pública: ${err}`);
                }
                api.actualizar(existente.id, entrada);
                resultado = aplicarCambios(existente, entrada);
                resultado = { ...resultado, visibilidad: eraPublica && (b.visibilidad === "privada" || cambiaCuenta) ? "privada" : existente.visibilidad };
                const quierePublica = b.visibilidad === "publica" && Boolean(b.userId);
                const republicar = quierePublica && (resultado.visibilidad !== "publica" || existente.relacion !== b.relacion);
                if (republicar) {
                    const err = await aplicarVisibilidad(api, existente.id, "publica");
                    if (err) toast.error(`Guardado, pero no se pudo hacer público: ${err}`);
                    else resultado = { ...resultado, visibilidad: "publica" };
                }
                toast.success("Cambios guardados");
            } else {
                resultado = api.crear({
                    ...entrada,
                    visibilidad: "privada",
                    origen: inicial?.origen ?? (b.userId ? "starseed" : "manual"),
                });
                if (b.visibilidad === "publica" && b.userId) {
                    const err = await aplicarVisibilidad(api, resultado.id, "publica");
                    if (err) toast.error(`Guardado como privado: ${err}`);
                    else resultado = { ...resultado, visibilidad: "publica" };
                }
                toast.success(`${resultado.nombre} ya está en tus contactos`);
            }
            onGuardado?.(resultado);
            onOpenChange(false);
        } catch (e) {
            toast.error((e as Error)?.message || "No se pudo guardar el contacto.");
        } finally {
            setGuardando(false);
        }
    };

    const vincular = (p: OsProfile) => {
        cambiar({
            userId: p.userId,
            username: p.username,
            perfil: { nombre: p.displayName, avatarUrl: p.avatarUrl, bio: p.bio || undefined, tomada: new Date().toISOString() },
            nombre: b.nombre.trim() ? b.nombre : p.displayName,
        });
    };

    const desvincular = () => cambiar({ userId: null, username: null, perfil: null, visibilidad: "privada" });

    const setCumpleModo = (m: ModoCumple) => cambiar({ cumpleModo: m });
    const idDescVis = `${base}-vis`;
    const errNombre = errores.nombre;
    const errCumple = errores.cumple;

    const campoTexto = (
        clave: "apodo" | "organizacion" | "cargo",
        etiqueta: string,
        placeholder: string,
    ) => (
        <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${base}-${clave}`} className="text-[12px] font-medium text-white/65">
                {etiqueta}
            </label>
            <input
                id={`${base}-${clave}`}
                value={b[clave]}
                onChange={(e) => cambiar({ [clave]: e.target.value } as Partial<Borrador>)}
                placeholder={placeholder}
                className={CLASE_CAMPO}
            />
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={(v) => !guardando && onOpenChange(v)}>
            <DialogContent
                className={cn(
                    "gap-0 p-0 text-white sm:max-h-[min(92dvh,920px)] sm:max-w-2xl sm:rounded-[24px]",
                    "max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0",
                )}
                data-testid="editor-contacto"
            >
                <form
                    ref={formRef}
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void guardar();
                    }}
                    className="flex min-h-full flex-col"
                >
                    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[rgba(10,12,30,0.88)] px-5 py-4 pr-16 backdrop-blur-xl">
                        <AvatarContacto
                            nombre={b.nombre || b.perfil?.nombre || "?"}
                            avatarUrl={b.perfil?.avatarUrl}
                            relacion={b.relacion}
                            tam={48}
                        />
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-[18px] font-semibold leading-tight text-white">
                                {esNuevo ? "Nuevo contacto" : "Editar contacto"}
                            </DialogTitle>
                            <DialogDescription className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-white/55">
                                <Lock className="h-3 w-3" aria-hidden />
                                Todo lo que guardes aquí es privado
                            </DialogDescription>
                        </div>
                    </header>

                    <div className="flex flex-col gap-7 px-5 py-5">
                        <Bloque titulo="Identidad" icono={UserRound}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                                    <label htmlFor={`${base}-nombre`} className="text-[12px] font-medium text-white/65">
                                        Nombre <span className="text-white/40">(obligatorio)</span>
                                    </label>
                                    <input
                                        id={`${base}-nombre`}
                                        value={b.nombre}
                                        onChange={(e) => cambiar({ nombre: e.target.value })}
                                        placeholder="Cómo lo guardas tú"
                                        autoComplete="off"
                                        autoFocus={esNuevo && !inicial?.nombre}
                                        aria-invalid={errNombre ? true : undefined}
                                        aria-describedby={errNombre ? `${base}-err-nombre` : undefined}
                                        className={cn(CLASE_CAMPO, "text-[15px] font-medium", errNombre && "border-rose-400/60")}
                                    />
                                    <MensajeError id={`${base}-err-nombre`} texto={errNombre} />
                                </div>
                                {campoTexto("apodo", "Apodo", "Cómo le llamas")}
                            </div>
                        </Bloque>

                        <Bloque titulo="Relación" icono={Sparkles}>
                            <div role="radiogroup" aria-label="Tipo de relación" className="flex flex-wrap gap-1.5">
                                {RELACIONES.map((r) => {
                                    const Icono = iconoRelacion(r.id);
                                    const activo = b.relacion === r.id;
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={activo}
                                            onClick={() => cambiar({ relacion: r.id })}
                                            className={cn(
                                                "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
                                                activo ? "text-white" : "text-white/60 hover:text-white/90",
                                                CLASE_FOCO,
                                            )}
                                            style={activo ? pildora(r.color) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
                                        >
                                            <Icono className="h-3.5 w-3.5" style={{ color: r.color }} aria-hidden />
                                            {r.etiqueta}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor={`${base}-detalle`} className="text-[12px] font-medium text-white/65">
                                    Matiz de la relación
                                </label>
                                <input
                                    id={`${base}-detalle`}
                                    value={b.relacionDetalle}
                                    onChange={(e) => cambiar({ relacionDetalle: e.target.value })}
                                    placeholder="prima, compañera de huerto, mentor de cerámica…"
                                    className={CLASE_CAMPO}
                                />
                            </div>
                        </Bloque>

                        <Bloque titulo="Descripción personal" icono={FolderHeart} ayuda="Quién es para ti. Solo tú lo lees.">
                            <label htmlFor={`${base}-desc`} className="sr-only">
                                Descripción personal
                            </label>
                            <textarea
                                id={`${base}-desc`}
                                value={b.descripcion}
                                onChange={(e) => cambiar({ descripcion: e.target.value })}
                                rows={3}
                                placeholder="Nos conocimos en el solsticio; le encanta la fermentación y los mapas antiguos…"
                                className={cn(CLASE_CAMPO, "resize-y leading-relaxed")}
                            />
                        </Bloque>

                        <Bloque titulo="Teléfonos" icono={Phone}>
                            <FilasDatos filas={b.telefonos} tipo="telefono" errores={errores} onCambiar={(telefonos) => cambiar({ telefonos })} />
                        </Bloque>

                        <Bloque titulo="Correos" icono={AtSign}>
                            <FilasDatos filas={b.correos} tipo="correo" errores={errores} onCambiar={(correos) => cambiar({ correos })} />
                        </Bloque>

                        <Bloque titulo="Enlaces" icono={Link2}>
                            <div className="flex flex-col gap-2">
                                {b.enlaces.map((en, i) => {
                                    const error = errores[`enlace:${en.id}`];
                                    const idErr = `${base}-err-en-${en.id}`;
                                    return (
                                        <div key={en.id} className="flex flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                                <label htmlFor={`${base}-ent-${en.id}`} className="sr-only">
                                                    Título del enlace {i + 1}
                                                </label>
                                                <input
                                                    id={`${base}-ent-${en.id}`}
                                                    value={en.titulo}
                                                    onChange={(e) =>
                                                        cambiar({ enlaces: b.enlaces.map((x) => (x.id === en.id ? { ...x, titulo: e.target.value } : x)) })
                                                    }
                                                    placeholder="Título (web, portafolio…)"
                                                    className={cn(CLASE_CAMPO, "w-full sm:w-44")}
                                                />
                                                <label htmlFor={`${base}-enu-${en.id}`} className="sr-only">
                                                    Dirección del enlace {i + 1}
                                                </label>
                                                <input
                                                    id={`${base}-enu-${en.id}`}
                                                    type="url"
                                                    inputMode="url"
                                                    value={en.url}
                                                    onChange={(e) =>
                                                        cambiar({ enlaces: b.enlaces.map((x) => (x.id === en.id ? { ...x, url: e.target.value } : x)) })
                                                    }
                                                    placeholder="https://…"
                                                    aria-invalid={error ? true : undefined}
                                                    aria-describedby={error ? idErr : undefined}
                                                    className={cn(CLASE_CAMPO, "min-w-0 flex-1", error && "border-rose-400/60")}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => cambiar({ enlaces: b.enlaces.filter((x) => x.id !== en.id) })}
                                                    aria-label={`Quitar enlace ${i + 1}`}
                                                    className={cn(CLASE_BOTON_ICONO, "hover:text-rose-300")}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                            <MensajeError id={idErr} texto={error} />
                                        </div>
                                    );
                                })}
                                <button type="button" onClick={() => cambiar({ enlaces: [...b.enlaces, filaEnlaceVacia()] })} className={cn(CLASE_BOTON, "self-start")}>
                                    <Plus className="h-4 w-4" aria-hidden />
                                    Añadir enlace
                                </button>
                            </div>
                        </Bloque>

                        <Bloque titulo="Organización y cargo" icono={Briefcase}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {campoTexto("organizacion", "Organización", "Cooperativa, comunidad, empresa…")}
                                {campoTexto("cargo", "Cargo", "Qué hace allí")}
                            </div>
                        </Bloque>

                        <Bloque titulo="Dirección" icono={MapPin}>
                            <label htmlFor={`${base}-dir`} className="sr-only">
                                Dirección
                            </label>
                            <textarea
                                id={`${base}-dir`}
                                value={b.direccion}
                                onChange={(e) => cambiar({ direccion: e.target.value })}
                                rows={2}
                                placeholder="Calle, número, ciudad…"
                                className={cn(CLASE_CAMPO, "resize-y")}
                            />
                        </Bloque>

                        <Bloque titulo="Cumpleaños" icono={Cake}>
                            <div role="radiogroup" aria-label="Cumpleaños" className="inline-flex flex-wrap gap-1 self-start rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                                {(
                                    [
                                        ["ninguno", "Sin fecha"],
                                        ["completo", "Con año"],
                                        ["sinAnio", "Sin año"],
                                    ] as const
                                ).map(([m, texto]) => (
                                    <button
                                        key={m}
                                        type="button"
                                        role="radio"
                                        aria-checked={b.cumpleModo === m}
                                        onClick={() => setCumpleModo(m)}
                                        className={cn(
                                            "cursor-pointer rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors duration-200",
                                            b.cumpleModo === m ? "bg-white/[0.12] text-white" : "text-white/55 hover:text-white/85",
                                            CLASE_FOCO,
                                        )}
                                    >
                                        {texto}
                                    </button>
                                ))}
                            </div>
                            {b.cumpleModo === "completo" ? (
                                <div className="flex flex-col gap-1">
                                    <label htmlFor={`${base}-cumple`} className="text-[12px] font-medium text-white/65">
                                        Fecha de nacimiento
                                    </label>
                                    <input
                                        id={`${base}-cumple`}
                                        type="date"
                                        value={b.cumpleFecha}
                                        max={ymdLocal(new Date())}
                                        onChange={(e) => cambiar({ cumpleFecha: e.target.value })}
                                        aria-invalid={errCumple ? true : undefined}
                                        aria-describedby={errCumple ? `${base}-err-cumple` : undefined}
                                        className={cn(CLASE_CAMPO, "w-auto [color-scheme:dark] sm:w-56", errCumple && "border-rose-400/60")}
                                    />
                                </div>
                            ) : b.cumpleModo === "sinAnio" ? (
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label htmlFor={`${base}-cdia`} className="text-[12px] font-medium text-white/65">
                                            Día
                                        </label>
                                        <select
                                            id={`${base}-cdia`}
                                            value={b.cumpleDia}
                                            onChange={(e) => cambiar({ cumpleDia: e.target.value })}
                                            aria-invalid={errCumple ? true : undefined}
                                            className={cn(CLASE_CAMPO, "w-24 cursor-pointer [color-scheme:dark]")}
                                        >
                                            <option value="">—</option>
                                            {Array.from({ length: 31 }, (_, i) => (
                                                <option key={i + 1} value={String(i + 1)}>
                                                    {i + 1}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label htmlFor={`${base}-cmes`} className="text-[12px] font-medium text-white/65">
                                            Mes
                                        </label>
                                        <select
                                            id={`${base}-cmes`}
                                            value={b.cumpleMes}
                                            onChange={(e) => cambiar({ cumpleMes: e.target.value })}
                                            aria-invalid={errCumple ? true : undefined}
                                            className={cn(CLASE_CAMPO, "w-44 cursor-pointer capitalize [color-scheme:dark]")}
                                        >
                                            <option value="">—</option>
                                            {NOMBRES_MES.map((m, i) => (
                                                <option key={m} value={String(i + 1)} className="capitalize">
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ) : null}
                            <MensajeError id={`${base}-err-cumple`} texto={errCumple} />
                        </Bloque>

                        <Bloque titulo="Categorías" icono={Tag}>
                            <SelectorEtiquetas
                                titulo="Categorías"
                                items={categorias}
                                seleccion={b.categorias}
                                onCambiar={(categorias) => cambiar({ categorias })}
                                onCrear={(nombre) => api.crearCategoria(nombre, colorSiguiente(api.categorias.length)).id}
                                textoCrear="Nueva categoría"
                            />
                        </Bloque>

                        <Bloque titulo="Listas" icono={ListChecks}>
                            <SelectorEtiquetas
                                titulo="Listas"
                                items={listas}
                                seleccion={b.listas}
                                onCambiar={(listas) => cambiar({ listas })}
                                onCrear={(nombre) => api.crearLista(nombre, colorSiguiente(api.listas.length + 3)).id}
                                textoCrear="Nueva lista"
                            />
                        </Bloque>

                        <Bloque titulo="Vincular con una cuenta StarSeed" icono={Globe2} ayuda="Si esta persona está en la red, vincúlala: verás su perfil y podrás escribirle.">
                            <VincularCuenta
                                borrador={b}
                                contactoId={contactoId}
                                porUserId={api.porUserId}
                                onVincular={vincular}
                                onDesvincular={desvincular}
                            />
                        </Bloque>

                        <Bloque titulo="Preferencias" icono={Star}>
                            <div className={cn(CLASE_TARJETA, "flex flex-col divide-y divide-white/[0.06]")}>
                                <div className="flex items-center gap-3 p-3.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[14px] font-medium text-white">
                                            {b.visibilidad === "publica" ? "Pública" : "Privada"}
                                        </p>
                                        <p id={idDescVis} className="text-[12px] text-white/55">
                                            {!b.userId
                                                ? "Solo los contactos con cuenta StarSeed pueden ser públicos: una persona sin cuenta no ha consentido aparecer en la red."
                                                : b.visibilidad === "publica"
                                                  ? "Aparece en tu lista pública: los demás ven su perfil y el tipo de relación, nada más."
                                                  : "Solo tú sabes que está en tu libreta."}
                                        </p>
                                    </div>
                                    <Interruptor
                                        activo={b.visibilidad === "publica"}
                                        onCambiar={(v) => cambiar({ visibilidad: v ? "publica" : "privada" })}
                                        etiqueta="Contacto público"
                                        deshabilitado={!b.userId}
                                        describedBy={idDescVis}
                                    />
                                </div>
                                <div className="flex items-center gap-3 p-3.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[14px] font-medium text-white">Favorito</p>
                                        <p className="text-[12px] text-white/55">Aparece en «Favoritos» y arriba en tus accesos.</p>
                                    </div>
                                    <Interruptor
                                        activo={b.favorito}
                                        onCambiar={(v) => cambiar({ favorito: v })}
                                        etiqueta="Marcar como favorito"
                                        color="#FFBF00"
                                    />
                                </div>
                            </div>
                        </Bloque>
                    </div>

                    <footer className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] bg-[rgba(10,12,30,0.9)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
                        <p role="alert" aria-live="assertive" className="mr-auto text-[12px] text-rose-300">
                            {intentado && numErrores
                                ? numErrores === 1
                                    ? "Revisa el campo marcado."
                                    : `Revisa los ${numErrores} campos marcados.`
                                : ""}
                        </p>
                        <button type="button" onClick={() => onOpenChange(false)} disabled={guardando} className={CLASE_BOTON}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={guardando} className={CLASE_BOTON_PRINCIPAL}>
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                            {esNuevo ? "Crear contacto" : "Guardar cambios"}
                        </button>
                    </footer>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default EditorContacto;
