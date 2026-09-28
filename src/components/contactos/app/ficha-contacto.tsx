"use client";

/**
 * FichaContacto — el panel de detalle: héroe con avatar grande, relación, favorito y
 * visibilidad; acciones rápidas redondas (Mensaje, Llamar, Correo, Perfil, Editar); datos por
 * secciones; categorías y listas; «Guardar en Biblioteca» (solo nombre y ruta, jamás teléfono,
 * correo ni notas) y la línea de tiempo privada.
 */

import Link from "next/link";
import { useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import {
    AtSign,
    Briefcase,
    Cake,
    ChevronLeft,
    CircleUser,
    Copy,
    ExternalLink,
    FolderHeart,
    Globe2,
    History,
    Library,
    Link2,
    ListChecks,
    Lock,
    Mail,
    MapPin,
    MessageSquare,
    Pencil,
    Phone,
    Plus,
    Sparkles,
    Star,
    Tag,
    Trash2,
} from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { proximosCumpleanos } from "@/lib/contactos/modelo";
import type { Contacto, ContactosApi } from "@/lib/contactos/tipos";
import { cn } from "@/lib/utils";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import { LineaTiempoNotas } from "@/components/contactos/linea-tiempo-notas";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_FOCO,
    CLASE_ITEM_MENU,
    CLASE_MENU,
    colorSiguiente,
    infoRelacion,
    pildora,
} from "@/components/contactos/app/estilos";
import { iconoRelacion } from "@/components/contactos/app/iconos";
import { ChipColor, Interruptor, Seccion } from "@/components/contactos/app/piezas";
import { aplicarVisibilidad } from "@/components/contactos/app/acciones";
import { etiquetaCumple, formatearCumple, hostDeUrl } from "@/components/contactos/app/vista";

export interface FichaContactoProps {
    contacto: Contacto;
    api: ContactosApi;
    enLinea: boolean;
    hoy: Date;
    onEditar: () => void;
    /** En móvil/tableta: volver a la lista. */
    onVolver?: () => void;
    onEliminado: () => void;
}

const ORIGEN: Record<Contacto["origen"], string> = {
    starseed: "añadido desde la red StarSeed",
    manual: "creado a mano",
    vcard: "importado de una vCard",
    seguido: "traído de las personas que seguías",
};

function fechaLarga(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** `mailto:` solo con la dirección (sin `?cc=`/`&body=` colados desde una vCard importada). */
function hrefCorreo(valor: string): string {
    return `mailto:${valor.trim().split(/[?&\s]/)[0]}`;
}

/** `tel:` solo con dígitos y `+`. */
function hrefTelefono(valor: string): string {
    return `tel:${valor.replace(/[^\d+]/g, "")}`;
}

async function copiar(texto: string, que: string) {
    try {
        await navigator.clipboard.writeText(texto);
        toast.success(`${que} copiado`);
    } catch {
        toast.error("No se pudo copiar en este navegador.");
    }
}

// ─────────────────────────── Acción rápida redonda ───────────────────────────

function AccionRedonda({
    texto,
    icono: Icono,
    href,
    interno,
    onClick,
    motivo,
}: {
    texto: string;
    icono: ComponentType<{ className?: string; style?: CSSProperties }>;
    href?: string | null;
    interno?: boolean;
    onClick?: () => void;
    motivo?: string;
}) {
    const disco = (
        <span
            aria-hidden
            className="ss-redondo flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 sm:h-[52px] sm:w-[52px] group-hover/acc:scale-105 group-hover/acc:shadow-[0_0_24px_-4px_rgba(20,184,166,0.8)]"
            style={pildora(ACENTO)}
        >
            <Icono className="h-5 w-5 text-white" />
        </span>
    );
    const etiqueta = <span className="text-[12px] font-medium text-white/80">{texto}</span>;
    const clase = cn("group/acc flex w-14 cursor-pointer flex-col items-center gap-1.5 rounded-2xl py-1 sm:w-16", CLASE_FOCO);

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={clase}>
                {disco}
                {etiqueta}
            </button>
        );
    }
    if (href) {
        return interno ? (
            <Link href={href} className={clase}>
                {disco}
                {etiqueta}
            </Link>
        ) : (
            <a href={href} className={clase}>
                {disco}
                {etiqueta}
            </a>
        );
    }
    return (
        <span aria-disabled="true" title={motivo} className="flex w-14 cursor-not-allowed flex-col items-center gap-1.5 py-1 opacity-35 sm:w-16">
            <span className="sr-only">{`${texto}: ${motivo ?? "no disponible"}`}</span>
            <span aria-hidden className="contents">
                {disco}
                {etiqueta}
            </span>
        </span>
    );
}

// ─────────────────────────── Filas de datos ───────────────────────────

function FilaDato({ etiqueta, children, accion }: { etiqueta: string; children: ReactNode; accion?: ReactNode }) {
    return (
        <li className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
                <p className="text-[12px] capitalize text-white/50">{etiqueta}</p>
                <div className="break-words text-[15px] text-white">{children}</div>
            </div>
            {accion}
        </li>
    );
}

// ─────────────────────────── Asignar categorías / listas ───────────────────────────

function Asignador({
    titulo,
    icono,
    items,
    asignados,
    onCambiar,
    onCrear,
    textoNueva,
}: {
    titulo: string;
    icono: typeof Tag;
    items: { id: string; nombre: string; color: string }[];
    asignados: string[];
    onCambiar: (ids: string[]) => void;
    onCrear: (nombre: string) => string;
    textoNueva: string;
}) {
    const preguntar = usePrompt();
    const actuales = items.filter((i) => asignados.includes(i.id));
    const disponibles = items.filter((i) => !asignados.includes(i.id));
    const crear = async () => {
        const nombre = await preguntar({ title: textoNueva, placeholder: "Nombre", confirmText: "Crear y añadir" });
        if (!nombre?.trim()) return;
        const id = onCrear(nombre.trim());
        onCambiar([...asignados, id]);
    };
    return (
        <Seccion
            titulo={titulo}
            icono={icono}
            accion={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" className={cn(CLASE_BOTON, "px-2.5 py-1 text-[12px]")}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Añadir
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" collisionPadding={12} className={cn(CLASE_MENU, "max-h-[60dvh] overflow-y-auto")}>
                        {disponibles.map((i) => (
                            <DropdownMenuItem key={i.id} className={CLASE_ITEM_MENU} onSelect={() => onCambiar([...asignados, i.id])}>
                                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                                {i.nombre}
                            </DropdownMenuItem>
                        ))}
                        {disponibles.length ? <DropdownMenuSeparator className="my-1 bg-white/10" /> : null}
                        <DropdownMenuItem className={CLASE_ITEM_MENU} onSelect={() => void crear()}>
                            <Plus className="h-4 w-4 text-white/60" aria-hidden />
                            {textoNueva}…
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            }
        >
            {actuales.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {actuales.map((i) => (
                        <ChipColor key={i.id} nombre={i.nombre} color={i.color} onQuitar={() => onCambiar(asignados.filter((x) => x !== i.id))} />
                    ))}
                </div>
            ) : (
                <p className="text-[13px] text-white/45">Ninguna todavía.</p>
            )}
        </Seccion>
    );
}

// ─────────────────────────── Ficha ───────────────────────────

export function FichaContacto({ contacto: c, api, enLinea, hoy, onEditar, onVolver, onEliminado }: FichaContactoProps) {
    const confirmar = useConfirm();
    const [cambiandoVis, setCambiandoVis] = useState(false);
    const rel = infoRelacion(c.relacion);
    const IconoRel = iconoRelacion(c.relacion);
    const publica = c.visibilidad === "publica";
    const telefono = c.telefonos[0]?.valor;
    const correo = c.correos[0]?.valor;
    const proximo = useMemo(() => proximosCumpleanos([c], hoy, 366)[0], [c, hoy]);
    const cumpleTexto = formatearCumple(c.cumpleanos);

    const categorias = useMemo(() => api.categorias.map((x) => ({ id: x.id, nombre: x.nombre, color: x.color })), [api.categorias]);
    const listas = useMemo(() => api.listas.map((x) => ({ id: x.id, nombre: x.nombre, color: x.color })), [api.listas]);

    const cambiarVisibilidad = async (v: boolean) => {
        setCambiandoVis(true);
        const err = await aplicarVisibilidad(api, c.id, v ? "publica" : "privada");
        setCambiandoVis(false);
        if (err) toast.error(err);
        else toast.success(v ? "Ahora aparece en tu lista pública" : "Ahora es privado: solo tú lo ves");
    };

    const eliminar = async () => {
        const ok = await confirmar({
            title: `¿Eliminar a ${c.nombre}?`,
            description: "Se borra de tu libreta en todos tus dispositivos. Si estaba en tu lista pública, sale de ella.",
            confirmText: "Eliminar contacto",
            destructive: true,
        });
        if (!ok) return;
        api.eliminar(c.id);
        toast.success(`${c.nombre} ya no está en tu libreta`);
        onEliminado();
    };

    const explicacion = !c.userId
        ? "Solo los contactos con cuenta StarSeed pueden ser públicos: esta persona no ha consentido aparecer en la red."
        : publica
          ? "Aparece en tu lista pública: los demás ven su perfil y el tipo de relación, nada más."
          : "Solo tú sabes que está en tu libreta.";

    return (
        <article className="flex min-h-full flex-col" aria-label={`Ficha de ${c.nombre}`} data-testid="ficha-contacto">
            {onVolver ? (
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[rgba(12,14,34,0.85)] px-2 py-2 backdrop-blur-xl">
                    <button type="button" onClick={onVolver} className={cn(CLASE_BOTON, "border-transparent bg-transparent px-2.5")}>
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                        Contactos
                    </button>
                    <span className="min-w-0 flex-1" />
                    <button type="button" onClick={onEditar} className={cn(CLASE_BOTON, "px-3 py-1.5")}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        Editar
                    </button>
                </div>
            ) : null}

            {/* ── Héroe ── */}
            <header
                className="relative px-3 pb-6 pt-8 text-center sm:px-5"
                style={{ background: `radial-gradient(120% 90% at 50% -10%, ${rel.color}3d, transparent 62%)` }}
            >
                <button
                    type="button"
                    onClick={() => api.alternarFavorito(c.id)}
                    aria-pressed={c.favorito}
                    aria-label={c.favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                    title={c.favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                    className={cn(CLASE_BOTON_ICONO, "absolute right-4 top-4 h-10 w-10")}
                >
                    <Star className={cn("h-5 w-5 transition-colors", c.favorito ? "fill-amber-300 text-amber-300" : "text-white/60")} aria-hidden />
                </button>
                <div className="flex justify-center">
                    <AvatarContacto nombre={c.nombre} avatarUrl={c.perfil?.avatarUrl} tam={108} relacion={c.relacion} enLinea={enLinea} />
                </div>
                <h2 className="mt-4 break-words text-[26px] font-semibold leading-tight text-white">{c.nombre}</h2>
                {c.apodo ? <p className="mt-0.5 text-[15px] text-white/65">«{c.apodo}»</p> : null}
                {c.username ? <p className="mt-0.5 text-[13px] text-white/50">@{c.username}{enLinea ? " · en línea" : ""}</p> : null}
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    <span className="ss-redondo inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-white" style={pildora(rel.color)}>
                        <IconoRel className="h-3.5 w-3.5" style={{ color: rel.color }} aria-hidden />
                        {rel.etiqueta}
                        {c.relacionDetalle ? <span className="font-normal text-white/70">· {c.relacionDetalle}</span> : null}
                    </span>
                    {c.cargo || c.organizacion ? (
                        <span className="ss-redondo inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] text-white/75" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}>
                            <Briefcase className="h-3.5 w-3.5 text-white/50" aria-hidden />
                            {[c.cargo, c.organizacion].filter(Boolean).join(" · ")}
                        </span>
                    ) : null}
                </div>

                <ul className="mt-6 flex flex-wrap justify-center gap-x-1 gap-y-3 sm:gap-x-4" aria-label="Acciones rápidas">
                    <li>
                        <AccionRedonda
                            texto="Mensaje"
                            icono={MessageSquare}
                            href={c.username ? `/messages?to=@${encodeURIComponent(c.username)}` : null}
                            interno
                            motivo="Solo con cuenta StarSeed"
                        />
                    </li>
                    <li>
                        <AccionRedonda texto="Llamar" icono={Phone} href={telefono ? hrefTelefono(telefono) : null} motivo="Sin teléfono" />
                    </li>
                    <li>
                        <AccionRedonda texto="Correo" icono={Mail} href={correo ? hrefCorreo(correo) : null} motivo="Sin correo" />
                    </li>
                    <li>
                        <AccionRedonda
                            texto="Perfil"
                            icono={CircleUser}
                            href={c.username ? `/profile/${encodeURIComponent(c.username)}` : null}
                            interno
                            motivo="Solo con cuenta StarSeed"
                        />
                    </li>
                    <li>
                        <AccionRedonda texto="Editar" icono={Pencil} onClick={onEditar} />
                    </li>
                </ul>
            </header>

            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-10 sm:px-6">
                <Seccion titulo="Visibilidad" icono={publica ? Globe2 : Lock}>
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium text-white">{publica ? "Pública" : "Privada"}</p>
                            <p id={`vis-${c.id}`} className="text-[12px] leading-relaxed text-white/55">
                                {explicacion}
                            </p>
                        </div>
                        <Interruptor
                            activo={publica}
                            onCambiar={(v) => void cambiarVisibilidad(v)}
                            etiqueta="Contacto público"
                            deshabilitado={!c.userId || cambiandoVis}
                            describedBy={`vis-${c.id}`}
                        />
                    </div>
                </Seccion>

                <Seccion titulo="Descripción personal" icono={FolderHeart}>
                    {c.descripcion ? (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/90">{c.descripcion}</p>
                    ) : (
                        <button type="button" onClick={onEditar} className={cn("cursor-pointer rounded-lg text-left text-[14px] text-white/50 transition-colors hover:text-white/80", CLASE_FOCO)}>
                            Escribe quién es para ti: cómo os conocisteis, qué os une…
                        </button>
                    )}
                </Seccion>

                {c.perfil?.bio ? (
                    <Seccion titulo="En StarSeed" icono={Sparkles}>
                        <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/75">{c.perfil.bio}</p>
                    </Seccion>
                ) : null}

                {c.telefonos.length ? (
                    <Seccion titulo="Teléfonos" icono={Phone}>
                        <ul className="flex flex-col divide-y divide-white/[0.06]">
                            {c.telefonos.map((t) => (
                                <FilaDato
                                    key={t.id}
                                    etiqueta={t.etiqueta || "teléfono"}
                                    accion={
                                        <button type="button" onClick={() => void copiar(t.valor, "Teléfono")} aria-label={`Copiar ${t.valor}`} className={CLASE_BOTON_ICONO}>
                                            <Copy className="h-4 w-4" aria-hidden />
                                        </button>
                                    }
                                >
                                    <a href={hrefTelefono(t.valor)} className={cn("cursor-pointer rounded hover:underline", CLASE_FOCO)} style={{ color: "#5EEAD4" }}>
                                        {t.valor}
                                    </a>
                                </FilaDato>
                            ))}
                        </ul>
                    </Seccion>
                ) : null}

                {c.correos.length ? (
                    <Seccion titulo="Correos" icono={AtSign}>
                        <ul className="flex flex-col divide-y divide-white/[0.06]">
                            {c.correos.map((e) => (
                                <FilaDato
                                    key={e.id}
                                    etiqueta={e.etiqueta || "correo"}
                                    accion={
                                        <button type="button" onClick={() => void copiar(e.valor, "Correo")} aria-label={`Copiar ${e.valor}`} className={CLASE_BOTON_ICONO}>
                                            <Copy className="h-4 w-4" aria-hidden />
                                        </button>
                                    }
                                >
                                    <a href={hrefCorreo(e.valor)} className={cn("cursor-pointer break-all rounded hover:underline", CLASE_FOCO)} style={{ color: "#5EEAD4" }}>
                                        {e.valor}
                                    </a>
                                </FilaDato>
                            ))}
                        </ul>
                    </Seccion>
                ) : null}

                {c.enlaces.length ? (
                    <Seccion titulo="Enlaces" icono={Link2}>
                        <ul className="flex flex-col divide-y divide-white/[0.06]">
                            {c.enlaces.map((en) => {
                                const host = hostDeUrl(en.url);
                                return (
                                    <FilaDato key={en.id} etiqueta={en.titulo || host || "enlace"}>
                                        {host ? (
                                            <a
                                                href={en.url}
                                                target="_blank"
                                                rel="noopener noreferrer nofollow"
                                                className={cn("inline-flex cursor-pointer items-center gap-1.5 break-all rounded hover:underline", CLASE_FOCO)}
                                                style={{ color: "#5EEAD4" }}
                                            >
                                                {host}
                                                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            </a>
                                        ) : (
                                            <span className="text-white/70">{en.url}</span>
                                        )}
                                    </FilaDato>
                                );
                            })}
                        </ul>
                    </Seccion>
                ) : null}

                {c.direccion ? (
                    <Seccion titulo="Dirección" icono={MapPin}>
                        <p className="whitespace-pre-wrap break-words text-[15px] text-white/90">{c.direccion}</p>
                        <a
                            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(c.direccion)}`}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className={cn("mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded text-[13px] hover:underline", CLASE_FOCO)}
                            style={{ color: "#5EEAD4" }}
                        >
                            Ver en el mapa
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                    </Seccion>
                ) : null}

                {cumpleTexto ? (
                    <Seccion titulo="Cumpleaños" icono={Cake}>
                        <p className="text-[15px] text-white/90">{cumpleTexto}</p>
                        {proximo ? <p className="mt-0.5 text-[13px] text-rose-200/80">Próximo: {etiquetaCumple(proximo, hoy)}</p> : null}
                    </Seccion>
                ) : null}

                <div className="grid gap-6 sm:grid-cols-2">
                    <Asignador
                        titulo="Categorías"
                        icono={Tag}
                        items={categorias}
                        asignados={c.categorias}
                        onCambiar={(ids) => api.actualizar(c.id, { categorias: ids })}
                        onCrear={(nombre) => api.crearCategoria(nombre, colorSiguiente(api.categorias.length)).id}
                        textoNueva="Nueva categoría"
                    />
                    <Asignador
                        titulo="Listas"
                        icono={ListChecks}
                        items={listas}
                        asignados={c.listas}
                        onCambiar={(ids) => api.actualizar(c.id, { listas: ids })}
                        onCrear={(nombre) => api.crearLista(nombre, colorSiguiente(api.listas.length + 3)).id}
                        textoNueva="Nueva lista"
                    />
                </div>

                <Seccion titulo="Guardar en Biblioteca" icono={Library}>
                    <div className="flex flex-wrap items-center gap-3">
                        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/55">
                            Guarda un acceso a esta ficha en una carpeta de tu Biblioteca. Solo viaja su nombre: nunca el teléfono, el correo ni tus notas.
                        </p>
                        <SaveToLibrary
                            item={{ type: "contact", refId: c.id, route: `/contactos?c=${encodeURIComponent(c.id)}`, title: c.nombre, tags: ["contacto"] }}
                            label="Guardar en Biblioteca…"
                        />
                    </div>
                </Seccion>

                <Seccion titulo="Línea de tiempo" icono={History} sinTarjeta>
                    <LineaTiempoNotas contactoId={c.id} />
                </Seccion>

                <footer className="mt-2 flex flex-col items-center gap-3 border-t border-white/[0.06] pt-6 text-center">
                    <p className="text-[12px] text-white/40">
                        En tu libreta desde el {fechaLarga(c.creado)} · {ORIGEN[c.origen] ?? "creado a mano"}
                    </p>
                    <button
                        type="button"
                        onClick={() => void eliminar()}
                        className={cn(CLASE_BOTON, "border-rose-400/30 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/15 hover:text-white")}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Eliminar contacto
                    </button>
                </footer>
            </div>
        </article>
    );
}
