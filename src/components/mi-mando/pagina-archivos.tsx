"use client";

/**
 * Archivos y sincronización — carpetas vinculadas y qué viaja con tu cuenta.
 * ─────────────────────────────────────────────────────────────────────────────
 * Las carpetas son las de src/lib/storage/carpetas-vinculadas.ts (la misma
 * lista que usan el rito de bienvenida, los cerebros y los agentes). Honestidad
 * ante todo: el navegador NO deja guardar el permiso de una carpeta entre
 * sesiones, así que se enseña cuáles están «con acceso ahora» y cuáles
 * necesitan un clic para volver a concederlo.
 */

import { useId, useState } from "react";
import Link from "next/link";
import { Cloud, FolderOpen, FolderPlus, HardDrive, Plug, RefreshCw, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSavedLibrary } from "@/lib/library-store";
import {
    agregarCarpetaDispositivo,
    agregarCarpetaServicio,
    quitarCarpeta,
    reconectarCarpeta,
    SERVICIOS,
    soportaCarpetasDispositivo,
    type CarpetaVinculada,
    type ServicioAlmacenamiento,
} from "@/lib/storage/carpetas-vinculadas";

import { useMiMando } from "./contexto";
import { BotonSincronizar } from "./boton-sincronizar";
import { CabeceraPagina, CLASE_ACCION, CLASE_ACCION_PELIGRO, Chip, EstadoVacio, Tarjeta } from "./piezas";
import { useMisApps } from "./use-mis-apps";

function FilaCarpeta({ c }: { c: CarpetaVinculada }) {
    const { anunciar } = useMiMando();
    const confirmar = useConfirm();
    const servicio = c.servicio ? SERVICIOS.find((s) => s.id === c.servicio) : undefined;

    const quitar = async () => {
        const ok = await confirmar({
            title: `Quitar «${c.nombre}»`,
            description: "Se quita de la lista de carpetas vinculadas. No se borra ningún archivo, ni en el disco ni en el servicio.",
            confirmText: "Quitar",
            cancelText: "Cancelar",
            destructive: true,
        });
        if (!ok) return;
        quitarCarpeta(c.id);
        anunciar(`«${c.nombre}» ya no está vinculada.`);
    };

    const reconectar = async () => {
        const ok = await reconectarCarpeta(c.id);
        anunciar(ok ? `Acceso a «${c.nombre}» concedido de nuevo.` : "No se concedió el acceso (cancelado o denegado).");
    };

    return (
        <li className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {c.tipo === "dispositivo" ? (
                <HardDrive className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
            ) : (
                <Cloud className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{c.nombre}</p>
                <p className="text-[11px] text-white/55">
                    {c.tipo === "dispositivo" ? "Carpeta de este dispositivo" : `${servicio?.label ?? "Servicio externo"} · ${servicio?.nota ?? ""}`}
                </p>
            </div>
            {c.tipo === "dispositivo" ? (
                c.vivo ? (
                    <Chip tono="bien">Con acceso ahora</Chip>
                ) : (
                    <button type="button" onClick={() => void reconectar()} className={CLASE_ACCION}>
                        <Plug className="h-3.5 w-3.5" aria-hidden />
                        Volver a dar permiso
                    </button>
                )
            ) : (
                <Link href="/integraciones" className={CLASE_ACCION}>Autorizar en Integraciones</Link>
            )}
            <button type="button" onClick={() => void quitar()} className={CLASE_ACCION_PELIGRO} aria-label={`Quitar ${c.nombre}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
        </li>
    );
}

function AgregarServicio() {
    const { anunciar } = useMiMando();
    const id = useId();
    const [servicio, setServicio] = useState<ServicioAlmacenamiento>("google-drive");
    return (
        <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                const c = agregarCarpetaServicio(servicio);
                anunciar(`«${c.nombre}» declarada. Autorízala en Integraciones para usarla.`);
            }}
        >
            <div className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-[11px] text-white/55">Almacenamiento externo</label>
                <select
                    id={id}
                    value={servicio}
                    onChange={(e) => setServicio(e.target.value as ServicioAlmacenamiento)}
                    className="h-10 rounded-full border border-white/15 bg-black/30 px-3 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                    {SERVICIOS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>
            </div>
            <button type="submit" className={CLASE_ACCION}>
                <Cloud className="h-3.5 w-3.5" aria-hidden />
                Declarar
            </button>
        </form>
    );
}

export default function PaginaArchivos() {
    const { carpetas, anunciar, destinos } = useMiMando();
    const { items } = useSavedLibrary();
    const { apps } = useMisApps();
    const soporta = soportaCarpetasDispositivo();

    const agregar = async () => {
        const c = await agregarCarpetaDispositivo();
        anunciar(c ? `Carpeta «${c.nombre}» vinculada.` : "No se añadió ninguna carpeta (cancelado o sin permiso).");
    };

    const QUE_VIAJA: { titulo: string; detalle: string; cuenta: boolean }[] = [
        { titulo: "Biblioteca", detalle: `${items.length} ${items.length === 1 ? "elemento guardado" : "elementos guardados"}`, cuenta: true },
        { titulo: "Apps", detalle: `${apps.length} en tu lista`, cuenta: true },
        { titulo: "Instalaciones", detalle: `${destinos.length} ${destinos.length === 1 ? "sitio registrado" : "sitios registrados"}`, cuenta: true },
        { titulo: "Ajustes del sistema", detalle: "Apariencia, dock, Aurora y preferencias (sin claves ni contraseñas)", cuenta: true },
        { titulo: "Carpetas vinculadas", detalle: "El permiso de cada carpeta es de este dispositivo: el navegador no deja compartirlo", cuenta: false },
    ];

    return (
        <div className="space-y-4">
            <CabeceraPagina
                titulo="Archivos y sincronización"
                texto="Las carpetas que StarSeed puede usar en este dispositivo y lo que se copia a tu cuenta para verlo en todos tus dispositivos."
            />

            <Tarjeta
                titulo="Carpetas vinculadas"
                icono={FolderOpen}
                descripcion="StarSeed solo lee o escribe en las carpetas que tú eliges aquí."
                accion={
                    soporta ? (
                        <button type="button" onClick={() => void agregar()} className={CLASE_ACCION}>
                            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
                            Añadir carpeta
                        </button>
                    ) : undefined
                }
            >
                {!soporta && (
                    <p className="mb-3 text-xs text-white/55">
                        Este navegador no permite elegir carpetas del dispositivo (funciona en Chrome o Edge de escritorio). Puedes declarar un almacenamiento externo.
                    </p>
                )}
                {carpetas.length === 0 ? (
                    <EstadoVacio
                        icono={FolderOpen}
                        titulo="Ninguna carpeta vinculada"
                        texto="Añade una carpeta de este dispositivo o declara un almacenamiento externo (Google Drive, Dropbox, Nextcloud…)."
                    />
                ) : (
                    <ul className="space-y-2">
                        {carpetas.map((c) => (
                            <FilaCarpeta key={c.id} c={c} />
                        ))}
                    </ul>
                )}
                <div className="mt-4 border-t border-white/10 pt-4">
                    <AgregarServicio />
                </div>
            </Tarjeta>

            <Tarjeta titulo="Qué se guarda en tu cuenta" icono={RefreshCw} descripcion="Todo funciona sin conexión; con sesión, esto se copia a tu cuenta para el resto de tus dispositivos.">
                <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QUE_VIAJA.map((q) => (
                        <li key={q.titulo} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-white">{q.titulo}</p>
                                <Chip tono={q.cuenta ? "info" : "neutro"}>{q.cuenta ? "Con tu cuenta" : "Solo aquí"}</Chip>
                            </div>
                            <p className="mt-1 text-[11px] text-white/55">{q.detalle}</p>
                        </li>
                    ))}
                </ul>
                <BotonSincronizar />
            </Tarjeta>
        </div>
    );
}
