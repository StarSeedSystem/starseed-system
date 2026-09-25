"use client";

/**
 * Apps — lo que tienes instalado y DÓNDE vive cada app.
 * ─────────────────────────────────────────────────────────────────────────────
 * Junta la Biblioteca, el Lanzador y los destinos de instalación (web, este
 * dispositivo, tus otras neuronas, cada perfil). «Abrir» solo aparece cuando la
 * app guardó una dirección segura (ruta del OS o web https); «Quitar de mi
 * lista» no desinstala nada en tus dispositivos: lo deja claro antes de hacerlo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppWindow, ExternalLink, Library, Play, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { removeSaved, uninstallApp } from "@/lib/library-store";
import { etiquetaDestino, ETIQUETA_ESTADO } from "@/lib/instalaciones/destinos";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { ETIQUETA_ORIGEN, type AppMia } from "@/lib/mi-mando/apps";

import { useMiMando } from "./contexto";
import { CabeceraPagina, CLASE_ACCION, CLASE_ACCION_PELIGRO, Chip, EstadoVacio } from "./piezas";
import { useMisApps } from "./use-mis-apps";

function BotonAbrir({ app }: { app: AppMia }) {
    const a = app.apertura;
    if (!a) {
        return <span className="text-[11px] text-white/45">Sin dirección para abrirla desde aquí</span>;
    }
    if (a.tipo === "ruta") {
        return (
            <Link href={a.destino} className={CLASE_ACCION}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Abrir <span className="sr-only">{app.nombre}</span>
            </Link>
        );
    }
    return (
        <a href={a.destino} target="_blank" rel="noopener noreferrer" className={CLASE_ACCION}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Abrir <span className="sr-only">{app.nombre} (se abre en una pestaña nueva)</span>
        </a>
    );
}

function TarjetaApp({ app, esteId }: { app: AppMia; esteId: string }) {
    const { anunciar } = useMiMando();
    const confirmar = useConfirm();
    // Solo se puede quitar lo que está en la lista local (Biblioteca/Lanzador);
    // los destinos se gestionan desde la Biblioteca, donde se aceptan o cancelan.
    const quitable = app.idsBiblioteca.length + app.idsLanzador.length > 0;

    const quitar = async () => {
        const ok = await confirmar({
            title: `Quitar «${app.nombre}» de tu lista`,
            description:
                "Desaparecerá de tu Biblioteca y del Lanzador en todos tus dispositivos. Las copias ya instaladas (por ejemplo, una app descargada) no se borran: eso se hace en cada dispositivo.",
            confirmText: "Quitar",
            cancelText: "Cancelar",
            destructive: true,
        });
        if (!ok) return;
        app.idsBiblioteca.forEach((id) => removeSaved(id));
        app.idsLanzador.forEach((id) => uninstallApp(id));
        anunciar(`«${app.nombre}» ya no está en tu lista de apps.`);
    };

    return (
        <li className="rounded-2xl border border-white/10 bg-black/25 p-4 text-white shadow-lg backdrop-blur-md">
            <div className="flex flex-wrap items-start gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                    <AppWindow className="h-4 w-4 text-cyan-200" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{app.nombre}</h3>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                        {app.origenes.map((o) => (
                            <Chip key={o}>{ETIQUETA_ORIGEN[o]}</Chip>
                        ))}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <BotonAbrir app={app} />
                    {quitable && (
                        <button type="button" onClick={() => void quitar()} className={CLASE_ACCION_PELIGRO}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Quitar <span className="sr-only">{app.nombre} de mi lista</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">Dónde vive</p>
                {app.destinos.length === 0 ? (
                    <p className="text-xs text-white/55">
                        No hay instalaciones registradas: está en tu lista, pero aún no se instaló en la web ni en un dispositivo.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {app.destinos.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs text-white/75">
                                <span className="min-w-0">{etiquetaDestino(d, esteId)}</span>
                                <Chip tono={d.estado === "instalada" ? "bien" : d.estado === "fallida" ? "atencion" : "neutro"}>
                                    {ETIQUETA_ESTADO[d.estado]}
                                </Chip>
                                {d.version && <span className="text-white/45">{d.version}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </li>
    );
}

export default function PaginaApps() {
    const { apps } = useMisApps();
    const [esteId, setEsteId] = useState("");
    useEffect(() => setEsteId(thisDeviceId()), []);

    return (
        <div>
            <CabeceraPagina
                titulo="Apps"
                texto="Tus apps y en qué sitios están instaladas: la web de StarSeed, este dispositivo, tus otros dispositivos y tus perfiles."
                accion={
                    <Link href="/library" className={CLASE_ACCION}>
                        <Library className="h-3.5 w-3.5" aria-hidden />
                        Instalar más en la Biblioteca
                    </Link>
                }
            />
            {apps.length === 0 ? (
                <EstadoVacio
                    icono={AppWindow}
                    titulo="Aún no tienes apps instaladas"
                    texto="Las apps que instales desde la Biblioteca aparecerán aquí, con los sitios donde vive cada una."
                    accion={
                        <Link href="/library" className={CLASE_ACCION}>
                            Ir a la Biblioteca
                        </Link>
                    }
                />
            ) : (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {apps.map((a) => (
                        <TarjetaApp key={a.id} app={a} esteId={esteId} />
                    ))}
                </ul>
            )}
        </div>
    );
}
