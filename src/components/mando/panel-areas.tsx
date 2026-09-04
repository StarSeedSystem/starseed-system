"use client";

/**
 * Panel de áreas de trabajo, memorias y permisos (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * El Centro de Mando también es el índice del proyecto: por dónde se trabaja
 * y con qué memorias y permisos. Rejilla de tarjetas por área (cada una con
 * su color de `ACENTOS`), con sus accesos directos, sus documentos de memoria
 * y un resumen de su última actividad sacado de los eventos del relevo.
 *
 * Al final, la tarjeta «Memorias y permisos» enumera las claves de memoria
 * local del OS (solo nombres, jamás contenido) y el estado en vivo de los
 * permisos del navegador (micrófono, notificaciones, almacenamiento), con
 * enlaces a las pantallas donde se gestionan.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
    Bell,
    BookOpen,
    ExternalLink,
    HardDrive,
    KeyRound,
    Map,
    Mic,
    RefreshCw,
} from "lucide-react";

import { ACENTOS, acentoDeIndice, clasesAcento, type Acento } from "@/lib/ui/acentos";
import { AREAS_TRABAJO, CLAVES_MEMORIA_OS, type AreaTrabajo } from "@/lib/mando/areas";
import { cargarEventos } from "@/lib/mando/eventos";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Resuelve el acento de un área; si la clave no está en la paleta, rota por índice. */
function acentoDeArea(area: AreaTrabajo, índice: number): Acento {
    if ((ACENTOS as readonly string[]).includes(area.color)) return area.color as Acento;
    return acentoDeIndice(índice);
}

/** ¿Habla este evento de esta área? (por id, nombre u olas que la tocaron). */
function eventoDelArea(evento: EventoRelevo, area: AreaTrabajo): boolean {
    const texto = `${evento.texto} ${evento.tarea} ${evento.tipo}`.toLowerCase();
    if (texto.includes(area.id.toLowerCase())) return true;
    if (area.nombre && texto.includes(area.nombre.toLowerCase())) return true;
    return area.olas.some(
        (ola) => texto.includes(`ola ${ola}`) || texto.includes(` ${ola} `),
    );
}

/** Estado de un permiso del navegador, listo para pintar. */
interface PermisoNavegador {
    nombre: string;
    estado: "otorgado" | "denegado" | "pendiente" | "desconocido";
    href: string;
}

const TEXTO_PERMISO: Record<PermisoNavegador["estado"], string> = {
    otorgado: "Otorgado",
    denegado: "Denegado",
    pendiente: "Por decidir",
    desconocido: "Sin consultar",
};

const CLASE_PERMISO: Record<PermisoNavegador["estado"], string> = {
    otorgado: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    denegado: "border-red-400/30 bg-red-500/10 text-red-200",
    pendiente: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    desconocido: "border-white/10 bg-white/5 text-white/50",
};

/** Consulta en vivo el estado de los permisos clave (micrófono, notificaciones, almacenamiento). */
async function leerPermisos(): Promise<PermisoNavegador[]> {
    const base: Array<Omit<PermisoNavegador, "estado"> & { clave: PermissionName }> = [
        { nombre: "Micrófono", clave: "microphone" as PermissionName, href: "/agent?tab=privacidad" },
        { nombre: "Notificaciones", clave: "notifications" as PermissionName, href: "/notifications" },
        { nombre: "Almacenamiento persistente", clave: "persistent-storage" as PermissionName, href: "/almacenes" },
    ];

    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        return base.map(({ nombre, href }) => ({ nombre, href, estado: "desconocido" }));
    }

    return Promise.all(
        base.map(async ({ nombre, clave, href }) => {
            try {
                const resultado = await navigator.permissions.query({ name: clave });
                const estado: PermisoNavegador["estado"] =
                    resultado.state === "granted"
                        ? "otorgado"
                        : resultado.state === "denied"
                          ? "denegado"
                          : "pendiente";
                return { nombre, href, estado };
            } catch {
                return { nombre, href, estado: "desconocido" as const };
            }
        }),
    );
}

/** Icono de cada permiso por su nombre. */
function IconoPermiso({ nombre }: { nombre: string }) {
    if (nombre.startsWith("Mic")) return <Mic className="h-3.5 w-3.5" />;
    if (nombre.startsWith("Noti")) return <Bell className="h-3.5 w-3.5" />;
    return <HardDrive className="h-3.5 w-3.5" />;
}

/** Tarjeta de un área: accesos, documentos y última actividad. */
function TarjetaArea({
    area,
    acento,
    eventos,
}: {
    area: AreaTrabajo;
    acento: Acento;
    eventos: EventoRelevo[];
}) {
    const clases = clasesAcento(acento);
    const ultimo = eventos.find((evento) => eventoDelArea(evento, area)) ?? null;

    return (
        <article className={`rounded-xl border ${clases.borde} bg-black/30 p-4`}>
            <header className="flex items-start justify-between gap-2">
                <h3 className={`text-sm font-semibold ${clases.texto}`}>{area.nombre}</h3>
                <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-r ${clases.degradado}`}
                />
            </header>
            <p className="mt-1 text-xs text-white/60">{area.descripcion}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {area.rutas.map((ruta) => {
                    const externa = ruta.href.startsWith("http");
                    const clasesEnlace = `inline-flex cursor-pointer items-center gap-1 rounded-lg border ${clases.borde} ${clases.fondo} px-2 py-1 text-[11px] text-white/90 transition-colors hover:bg-white/10`;
                    return externa ? (
                        <a
                            key={ruta.href}
                            href={ruta.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={clasesEnlace}
                        >
                            <ExternalLink className="h-3 w-3" />
                            {ruta.etiqueta}
                        </a>
                    ) : (
                        <Link key={ruta.href} href={ruta.href} className={clasesEnlace}>
                            {ruta.etiqueta}
                        </Link>
                    );
                })}
            </div>

            <div className="mt-3 border-t border-white/10 pt-2">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-white/40">
                    <BookOpen className="h-3 w-3" />
                    Memorias del área
                </p>
                <ul className="mt-1 space-y-0.5">
                    {area.documentos.map((documento) => (
                        <li key={documento} className="truncate font-mono text-[11px] text-white/50">
                            {documento}
                        </li>
                    ))}
                </ul>
            </div>

            <p className="mt-2 text-[11px] text-white/50">
                {ultimo ? (
                    <>
                        <span className="text-white/70">Última actividad:</span>{" "}
                        {ultimo.texto.slice(0, 140)}
                    </>
                ) : (
                    "Sin actividad reciente registrada en los eventos."
                )}
            </p>
            {area.olas.length > 0 && (
                <p className="mt-1 text-[11px] text-white/40">
                    Olas: {area.olas.join(" · ")}
                </p>
            )}
        </article>
    );
}

/** Tarjeta final: claves de memoria del OS y permisos del navegador en vivo. */
function TarjetaMemoriasPermisos({ permisos }: { permisos: PermisoNavegador[] }) {
    return (
        <article className="rounded-xl border border-trinity-amber/40 bg-black/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-trinity-amber">
                <KeyRound className="h-4 w-4" />
                Memorias y permisos
            </h3>
            <p className="mt-1 text-xs text-white/60">
                Qué guarda el OS en este dispositivo (solo nombres, nunca contenido) y qué
                permisos tiene concedidos el navegador ahora mismo.
            </p>

            <div className="mt-3 border-t border-white/10 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                    Claves de memoria local
                </p>
                <ul className="mt-1 space-y-1.5">
                    {CLAVES_MEMORIA_OS.map((memoria) => (
                        <li key={memoria.clave}>
                            <p className="truncate font-mono text-[11px] text-white/70">
                                {memoria.clave}
                            </p>
                            <p className="text-[11px] text-white/50">{memoria.proposito}</p>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-3 border-t border-white/10 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
                    Permisos del navegador
                </p>
                <ul className="mt-1 space-y-1.5">
                    {permisos.map((permiso) => (
                        <li key={permiso.nombre} className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
                                <IconoPermiso nombre={permiso.nombre} />
                                <span className="truncate">{permiso.nombre}</span>
                            </span>
                            <Link
                                href={permiso.href}
                                className={`shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/10 ${CLASE_PERMISO[permiso.estado]}`}
                                title={`Gestionar en ${permiso.href}`}
                            >
                                {TEXTO_PERMISO[permiso.estado]}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </article>
    );
}

/** Panel principal: rejilla de áreas + tarjeta de memorias y permisos. */
export function PanelAreas() {
    const [eventos, setEventos] = useState<EventoRelevo[]>([]);
    const [permisos, setPermisos] = useState<PermisoNavegador[]>([]);
    const [cargando, setCargando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        const [lista, permisosVivos] = await Promise.all([cargarEventos(0, 300), leerPermisos()]);
        setEventos(lista);
        setPermisos(permisosVivos);
        setCargando(false);
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    return (
        <section className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Map className="h-4 w-4" />
                    Áreas de trabajo, memorias y permisos
                </h2>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
                    disabled={cargando}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
                    Actualizar
                </button>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {AREAS_TRABAJO.map((area, índice) => (
                    <TarjetaArea
                        key={area.id}
                        area={area}
                        acento={acentoDeArea(area, índice)}
                        eventos={eventos}
                    />
                ))}
                <TarjetaMemoriasPermisos permisos={permisos} />
            </div>
        </section>
    );
}
