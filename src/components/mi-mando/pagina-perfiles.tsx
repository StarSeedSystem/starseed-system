"use client";

/**
 * Perfiles — tus facetas de StarSeed y cuál está activa en ESTE dispositivo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Usa `useActiveProfile` (src/lib/profiles/profiles.ts): lista viva de
 * `os_account_profiles` de la cuenta y el perfil activo por dispositivo
 * (`setActiveProfile`). Crear, editar o borrar perfiles sigue en el Centro de
 * Cuenta, al que se enlaza: aquí solo se ve y se cambia el activo.
 */

import Link from "next/link";
import { CircleUser, LogIn, Plus, Settings2 } from "lucide-react";

import { profileKindHint, profileKindLabel, useActiveProfile } from "@/lib/profiles/profiles";
import { cn } from "@/lib/utils";

import { useMiMando } from "./contexto";
import { CabeceraPagina, Cargando, CLASE_ACCION, Chip, EstadoVacio } from "./piezas";

export default function PaginaPerfiles() {
    const { sesion, anunciar } = useMiMando();
    const { profile, profiles, loading, setActive } = useActiveProfile();

    const gestionar = (
        <Link href="/cuenta?section=info-personal" className={CLASE_ACCION}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            Gestionar perfiles
        </Link>
    );

    if (!sesion.cargando && !sesion.activa) {
        return (
            <div>
                <CabeceraPagina titulo="Perfiles" texto="Tus facetas públicas (personal, grupal, temática…) vinculadas a tu cuenta." />
                <EstadoVacio
                    icono={LogIn}
                    titulo="Inicia sesión para ver tus perfiles"
                    texto="Los perfiles pertenecen a tu cuenta. Al iniciar sesión podrás elegir con cuál actúas en este dispositivo."
                    accion={<Link href="/login" className={CLASE_ACCION}>Iniciar sesión</Link>}
                />
            </div>
        );
    }

    return (
        <div>
            <CabeceraPagina
                titulo="Perfiles"
                texto="Elige con qué perfil actúas en este dispositivo. Cada dispositivo puede tener uno distinto."
                accion={gestionar}
            />
            {loading ? (
                <Cargando texto="Cargando tus perfiles…" />
            ) : profiles.length === 0 ? (
                <EstadoVacio
                    icono={CircleUser}
                    titulo="Aún no tienes perfiles"
                    texto="Crea tu primer perfil para publicar, participar y organizar tu Biblioteca por facetas."
                    accion={
                        <Link href="/cuenta?createProfile=true" className={CLASE_ACCION}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Crear perfil
                        </Link>
                    }
                />
            ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {profiles.map((p) => {
                        const activo = p.id === profile?.id;
                        return (
                            <li
                                key={p.id}
                                className={cn(
                                    "flex flex-col gap-3 rounded-2xl border bg-black/25 p-4 text-white shadow-lg backdrop-blur-md",
                                    activo ? "border-cyan-400/35" : "border-white/10",
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    {p.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- avatar externo del usuario, tamaño fijo
                                        <img src={p.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover" />
                                    ) : (
                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5">
                                            <CircleUser className="h-5 w-5 text-white/60" aria-hidden />
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                                        <p className="truncate text-xs text-white/55">{p.handle ? `@${p.handle}` : "sin @nombre"}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <Chip>{profileKindLabel(p.kind)}</Chip>
                                    {p.isDefault && <Chip tono="info">Principal</Chip>}
                                    {activo && <Chip tono="bien">Activo aquí</Chip>}
                                </div>
                                <p className="text-[11px] text-white/50">{profileKindHint(p.kind)}</p>
                                <div className="mt-auto">
                                    {activo ? (
                                        <p className="text-xs text-white/55">Estás usando este perfil.</p>
                                    ) : (
                                        <button
                                            type="button"
                                            className={CLASE_ACCION}
                                            onClick={() => {
                                                setActive(p.id);
                                                anunciar(`Ahora actúas como «${p.name}» en este dispositivo.`);
                                            }}
                                        >
                                            Usar este perfil
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
