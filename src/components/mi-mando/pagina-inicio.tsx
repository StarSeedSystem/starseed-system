"use client";

/**
 * Inicio — tu sistema de un vistazo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada tarjeta sale de datos reales del dispositivo o de la cuenta; si algo no
 * se puede medir se dice («no disponible»), nunca se rellena con un ejemplo.
 * Los avisos solo aparecen cuando piden una acción concreta.
 */

import Link from "next/link";
import {
    AlertTriangle,
    AppWindow,
    ArrowRight,
    CheckCircle2,
    CircleUser,
    HardDrive,
    Info,
    LogIn,
    Network,
    RefreshCw,
    SlidersHorizontal,
} from "lucide-react";

import { useActiveProfile, profileKindLabel } from "@/lib/profiles/profiles";
import { bytesLegibles, fraccionUso, type Aviso } from "@/lib/mi-mando/avisos";
import { fraseResumenNeuronas, resumenNeuronas } from "@/lib/mi-mando/neuronas";
import { cn } from "@/lib/utils";

import { useMiMando } from "./contexto";
import { BotonSincronizar } from "./boton-sincronizar";
import { CabeceraPagina, CLASE_ACCION, Chip, Tarjeta } from "./piezas";
import { useMisApps } from "./use-mis-apps";

function AccionDeAviso({ aviso }: { aviso: Aviso }) {
    const { irA } = useMiMando();
    const a = aviso.accion;
    if (!a) return null;
    if (a.tipo === "enlace") {
        return (
            <Link href={a.href} className={CLASE_ACCION}>
                {a.etiqueta}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
        );
    }
    return (
        <button type="button" onClick={() => irA(a.pagina)} className={CLASE_ACCION}>
            {a.etiqueta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
    );
}

function ListaAvisos() {
    const { avisos } = useMiMando();
    if (avisos.length === 0) {
        return (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Todo en orden: no hay nada que requiera tu atención.
            </p>
        );
    }
    return (
        <section aria-labelledby="mi-mando-avisos">
            <h3 id="mi-mando-avisos" className="sr-only">Avisos</h3>
            <ul className="space-y-2">
                {avisos.map((a) => {
                    const Icono = a.tono === "atencion" ? AlertTriangle : Info;
                    return (
                        <li
                            key={a.id}
                            className={cn(
                                "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                                a.tono === "atencion"
                                    ? "border-amber-400/25 bg-amber-500/10 text-amber-50"
                                    : "border-cyan-400/20 bg-cyan-500/10 text-cyan-50",
                            )}
                        >
                            <Icono className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1">{a.texto}</span>
                            <AccionDeAviso aviso={a} />
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function TarjetaCuenta() {
    const { sesion } = useMiMando();
    const { profile, loading } = useActiveProfile();
    return (
        <Tarjeta titulo="Cuenta y perfil" icono={CircleUser}>
            {sesion.cargando ? (
                <p className="text-xs text-white/55">Comprobando tu sesión…</p>
            ) : sesion.activa ? (
                <div className="space-y-2 text-sm">
                    <p className="text-white/80">
                        Sesión iniciada{sesion.correo ? <> como <span className="font-medium text-white">{sesion.correo}</span></> : null}.
                    </p>
                    <p className="text-white/70">
                        Perfil activo aquí:{" "}
                        {loading ? (
                            <span className="text-white/50">cargando…</span>
                        ) : profile ? (
                            <>
                                <span className="font-medium text-white">{profile.name}</span>{" "}
                                <Chip>{profileKindLabel(profile.kind)}</Chip>
                            </>
                        ) : (
                            <span className="text-white/50">aún no tienes perfiles</span>
                        )}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm text-white/70">
                        No has iniciado sesión. Puedes usar el sistema igual, pero tus dispositivos, apps y ajustes no se guardan en una cuenta.
                    </p>
                    <Link href="/login" className={CLASE_ACCION}>
                        <LogIn className="h-3.5 w-3.5" aria-hidden />
                        Iniciar sesión
                    </Link>
                </div>
            )}
        </Tarjeta>
    );
}

function TarjetaDispositivos() {
    const { neuronas, irA } = useMiMando();
    const r = resumenNeuronas(neuronas.lista);
    return (
        <Tarjeta
            titulo="Dispositivos"
            icono={Network}
            accion={
                <button type="button" onClick={() => irA("neuronas")} className={CLASE_ACCION}>
                    Ver
                </button>
            }
        >
            {neuronas.cargando && r.total === 0 ? (
                <p className="text-xs text-white/55">Detectando este dispositivo…</p>
            ) : (
                <div className="space-y-1 text-sm">
                    <p className="text-2xl font-semibold text-white">{fraseResumenNeuronas(r)}</p>
                    {r.total > 0 && (
                        <p className="text-xs text-white/60">
                            {r.conIaLocal} con IA local{r.esteDispositivo ? ` · estás en «${r.esteDispositivo}»` : ""}
                        </p>
                    )}
                </div>
            )}
        </Tarjeta>
    );
}

function TarjetaApps() {
    const { irA } = useMiMando();
    const { resumen } = useMisApps();
    return (
        <Tarjeta
            titulo="Apps"
            icono={AppWindow}
            accion={
                <button type="button" onClick={() => irA("apps")} className={CLASE_ACCION}>
                    Ver
                </button>
            }
        >
            {resumen.apps === 0 ? (
                <div className="space-y-2">
                    <p className="text-sm text-white/70">Aún no has instalado ninguna app.</p>
                    <Link href="/library" className={CLASE_ACCION}>Explorar la Biblioteca</Link>
                </div>
            ) : (
                <div className="space-y-1">
                    <p className="text-2xl font-semibold text-white">
                        {resumen.apps} {resumen.apps === 1 ? "app" : "apps"}
                    </p>
                    <p className="text-xs text-white/60">
                        {resumen.sitios === 0
                            ? "Guardadas en tu lista; aún sin sitio de instalación registrado."
                            : `Instaladas en ${resumen.sitios} ${resumen.sitios === 1 ? "sitio" : "sitios"} (web o dispositivos).`}
                    </p>
                </div>
            )}
        </Tarjeta>
    );
}

function TarjetaAlmacenamiento() {
    const { almacenamiento } = useMiMando();
    const f = fraccionUso(almacenamiento.usado ?? undefined, almacenamiento.cuota ?? undefined);
    return (
        <Tarjeta titulo="Almacenamiento de este dispositivo" icono={HardDrive}>
            {f === null ? (
                <p className="text-xs text-white/55">Este navegador no permite medir el espacio que usa StarSeed.</p>
            ) : (
                <div className="space-y-2">
                    <p className="text-sm text-white/80">
                        {bytesLegibles(almacenamiento.usado)} usados de {bytesLegibles(almacenamiento.cuota)} disponibles para StarSeed
                    </p>
                    <div
                        role="progressbar"
                        aria-label="Espacio usado por StarSeed en este dispositivo"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(f * 100)}
                        className="h-2 overflow-hidden rounded-full bg-white/10"
                    >
                        <div
                            className={cn("h-full rounded-full", f >= 0.8 ? "bg-amber-400" : "bg-cyan-400")}
                            style={{ width: `${Math.max(2, Math.round(f * 100))}%` }}
                        />
                    </div>
                    <p className="text-[11px] text-white/55">
                        {almacenamiento.persistente
                            ? "Protegido: el navegador no lo borrará por falta de espacio."
                            : "Sin protección: el navegador podría borrarlo si le falta espacio (actívala en Privacidad)."}
                    </p>
                </div>
            )}
        </Tarjeta>
    );
}

export function PaginaInicio() {
    const { irA } = useMiMando();
    return (
        <div>
            <CabeceraPagina
                titulo="Inicio"
                texto="Tu sistema de un vistazo: cuenta, dispositivos, apps, sincronización y espacio."
            />
            <div className="space-y-4">
                <ListaAvisos />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <TarjetaCuenta />
                    <TarjetaDispositivos />
                    <TarjetaApps />
                    <Tarjeta titulo="Sincronización con tu cuenta" icono={RefreshCw}>
                        <BotonSincronizar compacto />
                    </Tarjeta>
                    <TarjetaAlmacenamiento />
                    <Tarjeta titulo="Tu panel, a tu manera" icono={SlidersHorizontal}>
                        <p className="mb-3 text-xs text-white/60">Elige qué páginas ves aquí y en qué orden.</p>
                        <button type="button" onClick={() => irA("personalizar")} className={CLASE_ACCION}>
                            Personalizar este panel
                        </button>
                    </Tarjeta>
                </div>
            </div>
        </div>
    );
}
