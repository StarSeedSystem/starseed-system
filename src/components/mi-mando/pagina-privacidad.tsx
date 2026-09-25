"use client";

/**
 * Privacidad y seguridad — qué datos quedan en el dispositivo, cuáles en la
 * cuenta, qué permisos tiene el navegador y una copia de tus ajustes locales.
 * ─────────────────────────────────────────────────────────────────────────────
 * La exportación pasa por el filtro puro de src/lib/mi-mando/exportar.ts, que
 * deja fuera toda clave con nombre de credencial y, además, las que el propio
 * OS marca como secretas (`isNeverSyncedKey`): el archivo es tuyo y puede
 * acabar en cualquier sitio, así que no lleva nada con lo que entrar a nada.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, Download, HardDrive, Lock, ShieldCheck, Smartphone } from "lucide-react";

import { isNeverSyncedKey } from "@/lib/settings-sync";
import { construirExportacion, entradasDeStorage, nombreArchivoExportacion } from "@/lib/mi-mando/exportar";
import {
    DATOS_EN_CUENTA,
    DATOS_EN_DISPOSITIVO,
    estadoPermiso,
    etiquetaEstadoPermiso,
    PERMISOS_NAVEGADOR,
    type EstadoPermiso,
    type PermisoNavegador,
} from "@/lib/mi-mando/privacidad";
import { bytesLegibles } from "@/lib/mi-mando/avisos";

import { useMiMando } from "./contexto";
import { CabeceraPagina, CLASE_ACCION, Chip, Tarjeta } from "./piezas";

type Estados = Record<PermisoNavegador, EstadoPermiso>;

const INICIALES: Estados = {
    microphone: "no-disponible",
    camera: "no-disponible",
    notifications: "no-disponible",
    "persistent-storage": "no-disponible",
};

function usePermisosNavegador(): [Estados, () => void] {
    const [estados, setEstados] = useState<Estados>(INICIALES);
    const [vuelta, setVuelta] = useState(0);

    useEffect(() => {
        let vivo = true;
        const limpiezas: Array<() => void> = [];
        for (const p of PERMISOS_NAVEGADOR) {
            void (async () => {
                try {
                    // Algunos navegadores (Firefox, Safari) no conocen todos los nombres: lanzan y se queda «no disponible».
                    const st = await navigator.permissions.query({ name: p.id as PermissionName });
                    if (!vivo) return;
                    setEstados((e) => ({ ...e, [p.id]: estadoPermiso(st.state) }));
                    const alCambiar = () => setEstados((e) => ({ ...e, [p.id]: estadoPermiso(st.state) }));
                    st.addEventListener("change", alCambiar);
                    limpiezas.push(() => st.removeEventListener("change", alCambiar));
                } catch {
                    if (p.id === "notifications" && typeof Notification !== "undefined" && vivo) {
                        const n = Notification.permission === "default" ? "prompt" : Notification.permission;
                        setEstados((e) => ({ ...e, notifications: estadoPermiso(n) }));
                    }
                }
            })();
        }
        return () => {
            vivo = false;
            limpiezas.forEach((f) => f());
        };
    }, [vuelta]);

    return [estados, useCallback(() => setVuelta((v) => v + 1), [])];
}

function exportarAjustes(): { exportadas: number; omitidas: number } {
    const datos = construirExportacion(entradasDeStorage(window.localStorage), { esSecretaDelSistema: isNeverSyncedKey });
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoExportacion();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera en el siguiente turno: algunos navegadores cancelan la descarga si se revoca antes.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { exportadas: Object.keys(datos.ajustes).length, omitidas: datos.omitidas };
}

export default function PaginaPrivacidad() {
    const { almacenamiento, anunciar } = useMiMando();
    const [estados, releer] = usePermisosNavegador();

    const pedirNotificaciones = async () => {
        try {
            const r = await Notification.requestPermission();
            anunciar(r === "granted" ? "Notificaciones permitidas." : "No se permitieron las notificaciones.");
        } catch {
            anunciar("Este navegador no permite pedir notificaciones desde aquí.");
        }
        releer();
    };

    const protegerDatos = async () => {
        try {
            const ok = await navigator.storage.persist();
            anunciar(
                ok
                    ? "Listo: el navegador ya no borrará tus datos de StarSeed por falta de espacio."
                    : "El navegador no lo concedió. Suele concederlo si instalas StarSeed como app o lo usas a menudo.",
            );
        } catch {
            anunciar("Este navegador no permite proteger el almacenamiento.");
        }
        await almacenamiento.refrescar();
        releer();
    };

    const exportar = () => {
        try {
            const r = exportarAjustes();
            anunciar(
                `Descargados ${r.exportadas} ajustes locales. ${r.omitidas > 0 ? `Se dejaron fuera ${r.omitidas} por contener datos de acceso.` : ""}`.trim(),
            );
        } catch {
            anunciar("No se pudo preparar la descarga en este navegador.");
        }
    };

    return (
        <div className="space-y-4">
            <CabeceraPagina
                titulo="Privacidad y seguridad"
                texto="Tus datos son tuyos: aquí ves dónde está cada cosa y qué puede usar el navegador."
            />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Tarjeta titulo="Solo en este dispositivo" icono={Smartphone}>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-white/70">
                        {DATOS_EN_DISPOSITIVO.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                </Tarjeta>
                <Tarjeta titulo="En tu cuenta (si has iniciado sesión)" icono={Cloud}>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-white/70">
                        {DATOS_EN_CUENTA.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                </Tarjeta>
            </div>

            <Tarjeta titulo="Permisos del navegador" icono={ShieldCheck} descripcion="Para retirar un permiso, pulsa el candado junto a la dirección de la página.">
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {PERMISOS_NAVEGADOR.map((p) => {
                        const e = p.id === "persistent-storage" && almacenamiento.persistente ? "granted" : estados[p.id];
                        return (
                            <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-white">{p.etiqueta}</p>
                                    <Chip tono={e === "granted" ? "bien" : e === "denied" ? "atencion" : "neutro"}>{etiquetaEstadoPermiso(e)}</Chip>
                                </div>
                                <p className="text-[11px] leading-snug text-white/55">{p.para}</p>
                                {p.id === "notifications" && e === "prompt" && (
                                    <button type="button" onClick={() => void pedirNotificaciones()} className={CLASE_ACCION}>Permitir notificaciones</button>
                                )}
                                {p.id === "persistent-storage" && e !== "granted" && (
                                    <button type="button" onClick={() => void protegerDatos()} className={CLASE_ACCION}>
                                        <HardDrive className="h-3.5 w-3.5" aria-hidden />
                                        Proteger mis datos
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 text-[11px] text-white/50">
                    Espacio usado por StarSeed aquí: {bytesLegibles(almacenamiento.usado)} de {bytesLegibles(almacenamiento.cuota)}.
                </p>
            </Tarjeta>

            <Tarjeta titulo="Copia de tus ajustes locales" icono={Download} descripcion="Descarga un archivo con tus preferencias de StarSeed en este navegador. Nunca incluye claves, contraseñas ni sesiones.">
                <button type="button" onClick={exportar} className={CLASE_ACCION}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Exportar mis ajustes locales
                </button>
                <p className="mt-3 text-[11px] text-white/50">
                    Para revisar si hay datos sensibles guardados, usa el escáner de{" "}
                    <Link href="/seguridad" className="text-cyan-200 underline-offset-2 hover:underline">Seguridad</Link>.
                </p>
            </Tarjeta>

            <p className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/60">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Este es tu Puente de Mando personal. El Puente de Mando del proyecto, con el que el equipo programa StarSeed OS, es de acceso único del equipo y solo se abre en sus propias máquinas: desde aquí nadie puede tocar tu sistema ni tú el de otros.
            </p>
        </div>
    );
}
