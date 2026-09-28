"use client";

/**
 * ContactosPerfil (C9) — sección "Contactos" del perfil.
 *
 *   · Visitas → la lista PÚBLICA del dueño (`listarContactosPublicos`): grid
 *     responsivo de tarjetas con buscador y contador; vacío honesto y aviso
 *     amable (sin caer nunca, ni con la migración aún sin aplicar) cuando el
 *     servidor todavía no tiene la tabla.
 *   · Dueño/a → segmentado «Públicos | Todos (solo tú)»: «Públicos» reutiliza
 *     la MISMA vista pública (así ve exactamente lo que ven las visitas);
 *     «Todos» lista TODA su libreta (`useContactos`) con un interruptor
 *     Privada/Pública en línea y un acceso directo a la app de Contactos.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Globe2, Lock as LockIcon, Search, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { foldTexto } from "@/lib/contactos/modelo";
import { listarContactosPublicos, type FilaContactoPublico } from "@/lib/contactos/publicos";
import { useContactos } from "@/lib/contactos/store";
import { RELACIONES, type Contacto, type VisibilidadContacto } from "@/lib/contactos/tipos";
import { BotonAnadirContacto } from "@/components/contactos/boton-anadir-contacto";
import { ACENTO, CLASE_CAMPO, CLASE_ROTULO, CLASE_TARJETA } from "@/components/contactos/app/estilos";

export interface ContactosPerfilProps {
    /** uid REAL del perfil visitado (null si aún no se pudo resolver: no se monta). */
    ownerUserId: string;
    esPropio: boolean;
}

function etiquetaRelacion(id: string): string {
    return RELACIONES.find((r) => r.id === id)?.etiqueta ?? "";
}

function inicialDe(nombre: string | undefined | null): string {
    const c = (nombre ?? "").trim().charAt(0);
    return c ? c.toUpperCase() : "?";
}

// ─────────────────────────── Tarjeta de la lista pública ───────────────────────────

function TarjetaPublica({ fila }: { fila: FilaContactoPublico }) {
    return (
        <div className={cn(CLASE_TARJETA, "flex items-center gap-3 p-3")}>
            <Link
                href={`/profile/${fila.perfil.username}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/60 rounded-xl"
            >
                <Avatar className="h-10 w-10 shrink-0 ring-2 ring-white/10">
                    <AvatarImage src={fila.perfil.avatarUrl} alt="" />
                    <AvatarFallback className="bg-[#14B8A6]/15 text-xs font-bold text-[#14B8A6]">
                        {inicialDe(fila.perfil.displayName || fila.perfil.username)}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{fila.perfil.displayName}</p>
                    <p className="truncate text-[11px] text-white/50">@{fila.perfil.username}</p>
                    {fila.etiqueta && (
                        <span className="mt-0.5 block text-[10px] font-semibold" style={{ color: ACENTO }}>
                            {fila.etiqueta}
                        </span>
                    )}
                </div>
            </Link>
            <BotonAnadirContacto
                userId={fila.contactoUserId}
                username={fila.perfil.username}
                nombre={fila.perfil.displayName}
                avatarUrl={fila.perfil.avatarUrl}
                bio={fila.perfil.bio}
                variante="icono"
            />
        </div>
    );
}

/** Grid público con buscador — la usan las visitas Y, reutilizada, el segmento «Públicos» del dueño. */
function GridPublica({ ownerUserId }: { ownerUserId: string }) {
    const [filas, setFilas] = useState<FilaContactoPublico[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");

    useEffect(() => {
        let vivo = true;
        setCargando(true);
        setError(null);
        void listarContactosPublicos(ownerUserId).then((r) => {
            if (!vivo) return;
            setFilas(r.filas);
            setError(r.error);
            setCargando(false);
        });
        return () => {
            vivo = false;
        };
    }, [ownerUserId]);

    const visibles = useMemo(() => {
        const q = foldTexto(busqueda.trim());
        if (!q) return filas;
        return filas.filter((f) => foldTexto(`${f.perfil.displayName} ${f.perfil.username}`).includes(q));
    }, [filas, busqueda]);

    if (cargando) {
        return (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="status" aria-busy>
                <span className="sr-only">Cargando contactos públicos…</span>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} aria-hidden className="h-[4.25rem] animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.03]" />
                ))}
            </div>
        );
    }

    // Cualquier error ya llega como un mensaje HONESTO y en español (incluida
    // la tabla aún sin migrar): nunca se lanza y nunca se reintenta solo.
    if (error) {
        return (
            <div className={cn(CLASE_TARJETA, "flex flex-col items-center gap-2 p-8 text-center")}>
                <Users className="h-6 w-6 text-white/40" />
                <p className="text-sm text-white/60">{error}</p>
            </div>
        );
    }

    if (filas.length === 0) {
        return (
            <div className={cn(CLASE_TARJETA, "flex flex-col items-center gap-2 p-8 text-center")}>
                <Users className="h-6 w-6 text-white/40" />
                <p className="text-sm text-white/60">Aún no comparte contactos públicos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar en contactos públicos…"
                        aria-label="Buscar en contactos públicos"
                        className={cn(CLASE_CAMPO, "pl-9")}
                    />
                </div>
                <span className={CLASE_ROTULO}>
                    {filas.length} {filas.length === 1 ? "contacto" : "contactos"}
                </span>
            </div>
            {visibles.length === 0 ? (
                <p className="p-4 text-center text-xs text-white/50">Ninguno coincide con «{busqueda.trim()}».</p>
            ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibles.map((f) => (
                        <TarjetaPublica key={f.contactoUserId} fila={f} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────── Fila privada (dueño/a, segmento «Todos») ───────────────────────────

function FilaPrivada({ contacto }: { contacto: Contacto }) {
    const contactos = useContactos();
    const [ocupado, setOcupado] = useState(false);
    const puedeSerPublico = Boolean(contacto.userId);

    const alternar = async (v: VisibilidadContacto) => {
        if (ocupado || v === contacto.visibilidad || (v === "publica" && !puedeSerPublico)) return;
        setOcupado(true);
        const error = await contactos.cambiarVisibilidad(contacto.id, v);
        setOcupado(false);
        if (error) toast.error(error);
    };

    return (
        <div className={cn(CLASE_TARJETA, "flex items-center gap-3 p-3")}>
            <Avatar className="h-10 w-10 shrink-0 ring-2 ring-white/10">
                <AvatarImage src={contacto.perfil?.avatarUrl} alt="" />
                <AvatarFallback className="bg-[#14B8A6]/15 text-xs font-bold text-[#14B8A6]">
                    {inicialDe(contacto.nombre)}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{contacto.nombre}</p>
                <p className="truncate text-[11px] text-white/50">
                    {contacto.username ? `@${contacto.username}` : etiquetaRelacion(contacto.relacion)}
                </p>
            </div>
            <div
                className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5"
                role="group"
                aria-label={`Visibilidad de ${contacto.nombre}`}
            >
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void alternar("privada")}
                    aria-pressed={contacto.visibilidad === "privada"}
                    title="Privada — solo tú lo sabes"
                    className={cn(
                        "ss-redondo grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed",
                        contacto.visibilidad === "privada" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70",
                    )}
                >
                    <LockIcon className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    disabled={ocupado || !puedeSerPublico}
                    onClick={() => void alternar("publica")}
                    aria-pressed={contacto.visibilidad === "publica"}
                    title={puedeSerPublico ? "Pública — aparece en tu perfil" : "Solo un contacto con cuenta StarSeed puede ser público"}
                    className={cn(
                        "ss-redondo grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-30",
                        contacto.visibilidad === "publica" ? "text-[#0b0b12]" : "text-white/40 hover:text-white/70",
                    )}
                    style={contacto.visibilidad === "publica" ? { background: ACENTO } : undefined}
                >
                    <Globe2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

type Segmento = "publicos" | "todos";

function SegmentoBoton({
    activo, onClick, children,
}: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activo}
            className={cn(
                "ss-redondo cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200",
                activo ? "text-[#0b0b12]" : "text-white/60 hover:text-white/90",
            )}
            style={activo ? { background: ACENTO } : undefined}
        >
            {children}
        </button>
    );
}

function VistaPropia({ ownerUserId }: { ownerUserId: string }) {
    const [segmento, setSegmento] = useState<Segmento>("publicos");
    const contactos = useContactos();
    const [busqueda, setBusqueda] = useState("");

    const todos = useMemo(() => {
        const q = foldTexto(busqueda.trim());
        if (!q) return contactos.contactos;
        return contactos.contactos.filter((c) => foldTexto(`${c.nombre} ${c.username ?? ""}`).includes(q));
    }, [contactos.contactos, busqueda]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                    <SegmentoBoton activo={segmento === "publicos"} onClick={() => setSegmento("publicos")}>
                        Públicos
                    </SegmentoBoton>
                    <SegmentoBoton activo={segmento === "todos"} onClick={() => setSegmento("todos")}>
                        Todos <span className="opacity-70">(solo tú)</span>
                    </SegmentoBoton>
                </div>
                <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="ss-redondo min-h-[2.75rem] cursor-pointer gap-1.5 rounded-full border-white/15 bg-white/[0.03] sm:min-h-0"
                >
                    <Link href="/contactos">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir Contactos
                    </Link>
                </Button>
            </div>

            {segmento === "publicos" ? (
                <GridPublica ownerUserId={ownerUserId} />
            ) : (
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar en todos tus contactos…"
                            aria-label="Buscar en todos tus contactos"
                            className={cn(CLASE_CAMPO, "pl-9")}
                        />
                    </div>
                    {!contactos.listo ? (
                        <p className="p-4 text-center text-xs text-white/50">Cargando tu libreta…</p>
                    ) : todos.length === 0 ? (
                        <p className="p-4 text-center text-xs text-white/50">
                            {busqueda.trim() ? `Ninguno coincide con «${busqueda.trim()}».` : "Aún no tienes contactos."}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {todos.map((c) => (
                                <FilaPrivada key={c.id} contacto={c} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ContactosPerfil({ ownerUserId, esPropio }: ContactosPerfilProps) {
    return esPropio ? <VistaPropia ownerUserId={ownerUserId} /> : <GridPublica ownerUserId={ownerUserId} />;
}

export default ContactosPerfil;
