"use client";

/**
 * estados — las pantallas «de estado» de la app de Contactos: invitación a entrar sin sesión,
 * libreta vacía con guía, esqueleto de carga, aviso de error de sincronía y ficha en blanco.
 */

import Link from "next/link";
import { AlertTriangle, BookUser, Cake, FileUp, LogIn, Lock, Sparkles, Star, UserPlus, Users, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_BOTON_PRINCIPAL,
    CLASE_PANEL,
    CLASE_TARJETA,
    pildora,
} from "@/components/contactos/app/estilos";
import estilos from "@/components/contactos/app/contactos.module.css";

function Emblema({ tam = 64 }: { tam?: number }) {
    return (
        <span
            aria-hidden
            className={cn("ss-redondo flex items-center justify-center rounded-full", estilos.latido)}
            style={{
                width: tam,
                height: tam,
                background: `radial-gradient(circle at 35% 30%, ${ACENTO}66, ${ACENTO}14 70%)`,
                boxShadow: `inset 0 0 0 1px ${ACENTO}80, 0 0 40px -8px ${ACENTO}`,
            }}
        >
            <BookUser className="text-white" style={{ width: tam * 0.44, height: tam * 0.44 }} />
        </span>
    );
}

export function InvitacionSesion() {
    return (
        <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-10">
            <div className={cn(CLASE_PANEL, "flex w-full max-w-md flex-col items-center gap-5 px-6 py-9 text-center")}>
                <Emblema tam={72} />
                <div className="flex flex-col gap-2">
                    <h1 className="text-[22px] font-semibold text-white">Tu libreta de contactos te espera</h1>
                    <p className="text-[14px] leading-relaxed text-white/65">
                        Guarda a las personas que importan, con sus datos, tus notas y tus listas. Todo es privado por defecto y
                        viaja contigo entre tus dispositivos.
                    </p>
                </div>
                <ul className="flex w-full flex-col gap-2 text-left text-[13px] text-white/70">
                    <li className="flex items-center gap-2.5">
                        <Lock className="h-4 w-4 shrink-0" style={{ color: ACENTO }} aria-hidden />
                        Nadie más ve tu libreta ni tus notas
                    </li>
                    <li className="flex items-center gap-2.5">
                        <FileUp className="h-4 w-4 shrink-0" style={{ color: ACENTO }} aria-hidden />
                        Importa los contactos de tu móvil con un archivo vCard
                    </li>
                    <li className="flex items-center gap-2.5">
                        <Users className="h-4 w-4 shrink-0" style={{ color: ACENTO }} aria-hidden />
                        Vincula a quien ya está en la red StarSeed
                    </li>
                </ul>
                <Link href="/login" className={cn(CLASE_BOTON_PRINCIPAL, "w-full py-3 text-[14px]")}>
                    <LogIn className="h-4 w-4" aria-hidden />
                    Entrar en StarSeed
                </Link>
            </div>
        </div>
    );
}

export function EstadoVacio({ onNuevo, onImportar }: { onNuevo: () => void; onImportar: () => void }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-10 text-center" data-testid="contactos-vacio">
            <Emblema />
            <div className="flex max-w-sm flex-col gap-1.5">
                <h2 className="text-[18px] font-semibold text-white">Empieza tu libreta</h2>
                <p className="text-[14px] leading-relaxed text-white/60">
                    Trae los contactos de tu móvil o de tu correo con un archivo vCard, o crea la primera ficha a mano.
                </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
                <button type="button" onClick={onImportar} className={cn(CLASE_BOTON_PRINCIPAL, "w-full py-2.5")}>
                    <FileUp className="h-4 w-4" aria-hidden />
                    Importar vCard (.vcf)
                </button>
                <button type="button" onClick={onNuevo} className={cn(CLASE_BOTON, "w-full py-2.5")}>
                    <UserPlus className="h-4 w-4" aria-hidden />
                    Crear contacto
                </button>
            </div>
            <p className={cn(CLASE_TARJETA, "max-w-sm px-4 py-3 text-left text-[12px] leading-relaxed text-white/55")}>
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" style={{ color: ACENTO }} aria-hidden />
                En el perfil de cualquier persona de la red, pulsa «Añadir a contactos» y aparecerá aquí vinculada a su cuenta.
            </p>
        </div>
    );
}

export function Esqueleto() {
    return (
        <div className="mx-auto flex h-[calc(100dvh-6rem)] w-full max-w-[1680px] gap-4 px-3 pt-3 sm:px-4 sm:pt-4" aria-busy="true" aria-label="Abriendo tu libreta">
            <div className={cn(CLASE_PANEL, "hidden w-[250px] animate-pulse lg:block")} />
            <div className={cn(CLASE_PANEL, "flex w-full flex-col gap-3 p-4 md:w-[360px]")}>
                <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
                {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.06]" />
                        <div className="h-4 flex-1 animate-pulse rounded bg-white/[0.05]" />
                    </div>
                ))}
            </div>
            <div className={cn(CLASE_PANEL, "hidden flex-1 animate-pulse md:block")} />
        </div>
    );
}

export function AvisoError({ texto, onCerrar }: { texto: string; onCerrar: () => void }) {
    return (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-50/90 ring-1 ring-amber-400/25">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            <p className="min-w-0 flex-1 leading-relaxed">
                No hay sincronía con la nube ahora mismo ({texto}). Tu libreta sigue funcionando aquí y se subirá sola en cuanto
                vuelva la conexión.
            </p>
            <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className={cn(CLASE_BOTON_ICONO, "h-7 w-7")}>
                <X className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    );
}

export function FichaVacia({ total, favoritos, cumpleanos }: { total: number; favoritos: number; cumpleanos: number }) {
    const datos = [
        { icono: Users, valor: total, texto: total === 1 ? "persona" : "personas" },
        { icono: Star, valor: favoritos, texto: favoritos === 1 ? "favorita" : "favoritas" },
        { icono: Cake, valor: cumpleanos, texto: "cumpleaños en 30 días" },
    ];
    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-10 text-center">
            <Emblema tam={80} />
            <div className="flex max-w-sm flex-col gap-1.5">
                <h2 className="text-[20px] font-semibold text-white">Elige a alguien</h2>
                <p className="text-[14px] text-white/55">Su ficha, vuestra línea de tiempo y todo lo que sabes de esa persona aparecerán aquí.</p>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
                {datos.map(({ icono: Icono, valor, texto }) => (
                    <li key={texto} className="ss-redondo inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-white/80" style={pildora(ACENTO)}>
                        <Icono className="h-3.5 w-3.5" style={{ color: ACENTO }} aria-hidden />
                        <span className="font-semibold text-white">{valor}</span> {texto}
                    </li>
                ))}
            </ul>
        </div>
    );
}
