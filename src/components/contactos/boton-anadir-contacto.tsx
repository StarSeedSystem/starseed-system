"use client";

/**
 * BotonAnadirContacto (C9) — sustituye a «Seguir» para PERSONAS en todo el OS
 * (perfil, Hub, Explorer). Un perfil no se "sigue": se añade a la libreta de
 * Contactos (`@/lib/contactos/store`), pública o privada.
 *
 *   · Sin contacto  → «Añadir a contactos» (UserPlus). Al pulsar, un popover:
 *     Pública/Privada (por defecto privada) · chips de relación · categoría
 *     opcional · [Añadir] → `crear()` + `cambiarVisibilidad()` si es pública.
 *   · Ya es contacto → pastilla teal «En tus contactos» (UserCheck) con un
 *     MENÚ VERTICAL (nunca una tira horizontal): Ver ficha · Editar (ambos
 *     abren `/contactos?c=<id>` — el editor vive en la app de Contactos) ·
 *     Hacer pública/privada · Quitar de contactos (confirmación).
 *   · Oculto en el propio perfil. Sin sesión → enlace a /login. Cargando
 *     mientras el almacén hidrata.
 *
 * Reutiliza el lenguaje visual ya establecido por la app de Contactos
 * (`@/components/contactos/app/estilos`) para que perfil/Hub/Explorer y la
 * app de Contactos se vean como un mismo sistema.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    UserPlus,
    UserCheck,
    Loader2,
    Lock,
    IdCard,
    Pencil,
    Eye,
    EyeOff,
    Trash2,
} from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccount } from "@/context/account-context";
import { useContactos } from "@/lib/contactos/store";
import { RELACIONES, type Contacto, type ContactosApi, type TipoRelacion, type VisibilidadContacto } from "@/lib/contactos/tipos";
import { ACENTO, CLASE_BOTON_PRINCIPAL, CLASE_MENU, CLASE_ITEM_MENU, CLASE_ROTULO, pildora } from "@/components/contactos/app/estilos";
import { iconoRelacion } from "@/components/contactos/app/iconos";

export type VarianteBotonContacto = "completo" | "compacto" | "icono";

export interface BotonAnadirContactoProps {
    userId: string;
    username?: string | null;
    nombre: string;
    avatarUrl?: string | null;
    bio?: string | null;
    variante?: VarianteBotonContacto;
}

const SIN_CATEGORIA = "__ninguna";

/** Clases base del "chip"/botón, según la variante (nunca truncan la etiqueta completa). */
function claseTrigger(variante: VarianteBotonContacto): string {
    if (variante === "icono") {
        return "ss-redondo inline-flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 sm:min-h-[2.5rem] sm:min-w-[2.5rem]";
    }
    if (variante === "compacto") {
        return "ss-redondo inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-200";
    }
    return "ss-redondo inline-flex min-h-[2.75rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-xs font-semibold backdrop-blur transition-colors duration-200 sm:min-h-0";
}

// ─────────────────────────────── Ya es contacto ───────────────────────────────

function ContactoChip({
    contacto, contactos, variante,
}: { contacto: Contacto; contactos: ContactosApi; variante: VarianteBotonContacto }) {
    const [ocupado, setOcupado] = useState(false);

    const alternarVisibilidad = async () => {
        if (!contacto.userId) return;
        setOcupado(true);
        const siguiente: VisibilidadContacto = contacto.visibilidad === "publica" ? "privada" : "publica";
        const error = await contactos.cambiarVisibilidad(contacto.id, siguiente);
        setOcupado(false);
        if (error) toast.error(error);
    };

    const quitar = () => {
        if (typeof window !== "undefined" && !window.confirm(`¿Quitar a ${contacto.nombre} de tus contactos?`)) return;
        contactos.eliminar(contacto.id);
    };

    const estiloChip = { ...pildora(ACENTO), borderColor: `${ACENTO}66`, color: ACENTO };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    title="En tus contactos"
                    aria-label={variante === "icono" ? "En tus contactos, más acciones" : undefined}
                    className={claseTrigger(variante)}
                    style={estiloChip}
                >
                    <UserCheck className={variante === "icono" ? "h-4 w-4" : "h-3.5 w-3.5"} />
                    {variante !== "icono" && "En tus contactos"}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(CLASE_MENU, "w-60")}>
                <DropdownMenuItem asChild className={CLASE_ITEM_MENU}>
                    <Link href={`/contactos?c=${contacto.id}`}>
                        <IdCard className="h-4 w-4" /> Ver ficha
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={CLASE_ITEM_MENU}>
                    {/* El editor vive en la app de Contactos: misma ruta, con la ficha abierta para editar. */}
                    <Link href={`/contactos?c=${contacto.id}`}>
                        <Pencil className="h-4 w-4" /> Editar
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-white/10" />
                <DropdownMenuItem
                    disabled={ocupado || !contacto.userId}
                    onSelect={() => void alternarVisibilidad()}
                    className={CLASE_ITEM_MENU}
                >
                    {contacto.visibilidad === "publica" ? (
                        <>
                            <EyeOff className="h-4 w-4" /> Hacer privada
                        </>
                    ) : (
                        <>
                            <Eye className="h-4 w-4" /> Hacer pública
                        </>
                    )}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-white/10" />
                <DropdownMenuItem onSelect={quitar} className={cn(CLASE_ITEM_MENU, "text-red-300 focus:text-red-200")}>
                    <Trash2 className="h-4 w-4" /> Quitar de contactos
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ─────────────────────────────── Añadir (popover) ───────────────────────────────

function AnadirPopover({
    userId, username, nombre, avatarUrl, bio, variante = "completo", contactos,
}: BotonAnadirContactoProps & { contactos: ContactosApi }) {
    const [open, setOpen] = useState(false);
    const [relacion, setRelacion] = useState<TipoRelacion>("amistad");
    const [visibilidad, setVisibilidad] = useState<VisibilidadContacto>("privada");
    const [categoriaId, setCategoriaId] = useState<string>(SIN_CATEGORIA);
    const [guardando, setGuardando] = useState(false);

    const anadir = async () => {
        setGuardando(true);
        try {
            const nuevo = contactos.crear({
                nombre,
                userId,
                username: username ?? null,
                perfil: {
                    nombre,
                    avatarUrl: avatarUrl ?? undefined,
                    bio: bio ?? undefined,
                    tomada: new Date().toISOString(),
                },
                relacion,
                categorias: categoriaId !== SIN_CATEGORIA ? [categoriaId] : [],
                origen: "starseed",
            });
            if (visibilidad === "publica") {
                const error = await contactos.cambiarVisibilidad(nuevo.id, "publica");
                if (error) toast.error(error);
            }
            setOpen(false);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    title="Añadir a contactos"
                    aria-label={variante === "icono" ? "Añadir a contactos" : undefined}
                    className={cn(claseTrigger(variante), "border-white/15 bg-white/[0.04] text-foreground/85 hover:border-white/30 hover:text-foreground")}
                >
                    <UserPlus className={variante === "icono" ? "h-4 w-4" : "h-3.5 w-3.5"} />
                    {variante === "completo" && "Añadir a contactos"}
                    {variante === "compacto" && "Añadir"}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-[19rem] space-y-4 rounded-[22px] border border-white/[0.08] bg-[rgba(12,14,34,0.92)] p-4 text-white shadow-2xl backdrop-blur-[20px] backdrop-saturate-[1.4]"
            >
                <div>
                    <p className="text-sm font-semibold text-white">Añadir a contactos</p>
                    <p className="text-xs text-white/60">{nombre}</p>
                </div>

                <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Visibilidad del contacto">
                    {(
                        [
                            { id: "privada" as const, titulo: "Privada", detalle: "solo tú lo sabes" },
                            { id: "publica" as const, titulo: "Pública", detalle: "aparece en tu perfil" },
                        ]
                    ).map((op) => (
                        <button
                            key={op.id}
                            type="button"
                            role="radio"
                            aria-checked={visibilidad === op.id}
                            onClick={() => setVisibilidad(op.id)}
                            className={cn(
                                "cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                                visibilidad === op.id
                                    ? "border-[#14B8A6]/60 bg-[#14B8A6]/15 text-white"
                                    : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85",
                            )}
                        >
                            <span className="block text-sm font-semibold">{op.titulo}</span>
                            <span className="text-[11px]">{op.detalle}</span>
                        </button>
                    ))}
                </div>

                <div>
                    <p className={cn(CLASE_ROTULO, "mb-1.5")}>Relación</p>
                    <div className="flex flex-wrap gap-1.5">
                        {RELACIONES.map((r) => {
                            const Icono = iconoRelacion(r.id);
                            const activo = relacion === r.id;
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    aria-pressed={activo}
                                    onClick={() => setRelacion(r.id)}
                                    className={cn(
                                        "ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200",
                                        !activo && "border-white/12 text-white/60 hover:text-white/90",
                                    )}
                                    style={activo ? { ...pildora(r.color), borderColor: `${r.color}88`, color: "#fff" } : undefined}
                                >
                                    <Icono className="h-3 w-3" /> {r.etiqueta}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {contactos.categorias.length > 0 && (
                    <div>
                        <p className={cn(CLASE_ROTULO, "mb-1.5")}>Categoría (opcional)</p>
                        <Select value={categoriaId} onValueChange={setCategoriaId}>
                            <SelectTrigger className="h-9 rounded-lg border-white/10 bg-white/[0.04] text-sm text-white">
                                <SelectValue placeholder="Sin categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
                                {contactos.categorias.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => void anadir()}
                    disabled={guardando}
                    className={cn(CLASE_BOTON_PRINCIPAL, "ss-redondo w-full rounded-full")}
                >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Añadir
                </button>
            </PopoverContent>
        </Popover>
    );
}

// ─────────────────────────────── Componente público ───────────────────────────────

export function BotonAnadirContacto({
    userId, username, nombre, avatarUrl, bio, variante = "completo",
}: BotonAnadirContactoProps) {
    const { user } = useAccount();
    const contactos = useContactos();

    // Oculto en el propio perfil: nadie se añade a su propia libreta.
    if (user?.id && user.id === userId) return null;

    if (contactos.sinSesion) {
        return (
            <Link
                href="/login"
                title="Inicia sesión para añadir a contactos"
                aria-label="Inicia sesión para añadir a contactos"
                className={cn(
                    claseTrigger(variante),
                    "border-white/15 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white/85",
                )}
            >
                <Lock className={variante === "icono" ? "h-4 w-4" : "h-3.5 w-3.5"} />
                {variante === "completo" && "Inicia sesión"}
                {variante === "compacto" && "Entrar"}
            </Link>
        );
    }

    if (!contactos.listo) {
        return (
            <span
                aria-hidden
                className={cn(claseTrigger(variante), "border-white/10 bg-white/[0.02] text-white/40")}
            >
                <Loader2 className={cn(variante === "icono" ? "h-4 w-4" : "h-3.5 w-3.5", "animate-spin")} />
                {variante === "completo" && "Cargando…"}
            </span>
        );
    }

    const existente = contactos.porUserId(userId);
    if (existente) {
        return <ContactoChip contacto={existente} contactos={contactos} variante={variante} />;
    }

    return (
        <AnadirPopover
            userId={userId}
            username={username}
            nombre={nombre}
            avatarUrl={avatarUrl}
            bio={bio}
            variante={variante}
            contactos={contactos}
        />
    );
}

export default BotonAnadirContacto;
