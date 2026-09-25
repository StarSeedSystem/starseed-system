"use client";

/**
 * Secciones del diálogo «¿Dónde quieres instalar…?» — separadas del diálogo para que
 * cada archivo se lea de un vistazo. Todo el texto explica lo que de verdad pasará:
 * si una web no puede hacer algo (escribir un instalador en una carpeta elegida), se dice.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { Cpu, ExternalLink, FolderPlus, Laptop, Monitor, Server, Smartphone, Tablet, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tamanoLegible, type AssetClasificado, type DispositivoParaInstalar } from "@/lib/apps-oficiales/apps-oficiales";
import type { Neuron, NeuronKind } from "@/lib/neurons/neurons";
import type { CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import { vistoHace, type AppParaInstalar } from "@/lib/instalaciones/plan";

const ICONO_NEURONA: Record<NeuronKind, LucideIcon> = {
    desktop: Monitor,
    laptop: Laptop,
    mobile: Smartphone,
    tablet: Tablet,
    server: Server,
    other: Cpu,
};

const SISTEMA_LEGIBLE: Record<DispositivoParaInstalar["sistema"], string> = {
    android: "Android",
    ios: "iPhone o iPad",
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
    otro: "este sistema",
};

/** Casilla accesible: la etiqueta entera es clicable y la descripción va enlazada por aria. */
export function Casilla({
    id,
    marcada,
    onCambio,
    titulo,
    descripcion,
    children,
    deshabilitada,
}: {
    id: string;
    marcada: boolean;
    onCambio: (v: boolean) => void;
    titulo: ReactNode;
    descripcion?: ReactNode;
    children?: ReactNode;
    deshabilitada?: boolean;
}) {
    return (
        <div className={cn("rounded-xl border p-3 transition-colors", marcada ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]")}>
            <label htmlFor={id} className={cn("flex items-start gap-3", deshabilitada ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                <input
                    id={id}
                    type="checkbox"
                    checked={marcada}
                    disabled={deshabilitada}
                    onChange={(e) => onCambio(e.target.checked)}
                    aria-describedby={descripcion ? `${id}-desc` : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{titulo}</span>
                    {descripcion && (
                        <span id={`${id}-desc`} className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {descripcion}
                        </span>
                    )}
                </span>
            </label>
            {children && <div className="mt-2 pl-7">{children}</div>}
        </div>
    );
}

function notaArquitectura(a: AssetClasificado, d: DispositivoParaInstalar): string | null {
    if (d.arquitectura !== "desconocida" || a.arquitectura === "desconocida" || a.arquitectura === "universal") return null;
    if (a.sistema === "macos" && a.arquitectura === "arm64") return "Es para Mac con chip Apple (M1 o posterior). Si tu Mac es Intel, usa la versión web.";
    if (a.arquitectura === "arm64") return "Es para procesadores ARM de 64 bits.";
    return "Es para procesadores Intel o AMD de 64 bits.";
}

export interface SeccionEsteDispositivoProps {
    app: AppParaInstalar;
    nombreDispositivo: string;
    marcada: boolean;
    onCambio: (v: boolean) => void;
    instalable: AssetClasificado | null;
    buscandoVersion: boolean;
    dispositivo: DispositivoParaInstalar;
    esNativa: boolean;
    carpetas: CarpetaVinculada[];
    carpetaSel: string;
    onCarpeta: (id: string) => void;
    puedeVincularCarpeta: boolean;
    onVincularCarpeta: () => void;
    onInstalarDesdeWeb: () => void;
}

export function SeccionEsteDispositivo(p: SeccionEsteDispositivoProps) {
    const conReleases = Boolean(p.app.oficialId);
    let descripcion: ReactNode;
    if (conReleases && p.instalable) {
        descripcion = `Se descargará el ${p.instalable.formato}${p.instalable.bytes ? ` · ${tamanoLegible(p.instalable.bytes)}` : ""} (${p.instalable.nombre}) y la app se añadirá a tu Lanzador.`;
    } else if (conReleases && p.buscandoVersion) {
        descripcion = "Buscando la última versión publicada…";
    } else if (conReleases) {
        descripcion = `No hay instalador de ${p.app.nombre} para ${SISTEMA_LEGIBLE[p.dispositivo.sistema]}: aquí se usará la versión web y se añadirá a tu Lanzador.`;
    } else {
        descripcion = "Esta app se usa desde el propio OS o su web: se añadirá a tu Lanzador (el menú de apps de este dispositivo).";
    }
    const nota = p.instalable ? notaArquitectura(p.instalable, p.dispositivo) : null;

    return (
        <Casilla
            id="instalar-este"
            marcada={p.marcada}
            onCambio={p.onCambio}
            titulo={p.nombreDispositivo ? `Este dispositivo (${p.nombreDispositivo})` : "Este dispositivo"}
            descripcion={descripcion}
        >
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                {nota && <p className="text-amber-200/90">{nota}</p>}
                {p.instalable && (
                    <p>
                        {p.esNativa
                            ? "La descarga se abrirá con el gestor de descargas de tu sistema."
                            : "Tu navegador lo guardará en su carpeta de Descargas; desde ahí lo abres para instalarlo."}
                    </p>
                )}
                {p.instalable && p.carpetas.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <label htmlFor="instalar-carpeta" className="font-semibold text-white/85">
                            Carpeta de la biblioteca (opcional)
                        </label>
                        <select
                            id="instalar-carpeta"
                            value={p.carpetaSel}
                            onChange={(e) => p.onCarpeta(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/15 bg-black/40 px-2 text-sm text-white"
                        >
                            <option value="">Ninguna: dejarlo en Descargas</option>
                            {p.carpetas.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nombre}
                                </option>
                            ))}
                        </select>
                        <p>
                            Una web no puede escribir el instalador directamente en otra carpeta (GitHub no lo permite entre sitios
                            distintos). Anotaremos esta carpeta para recordarte dónde moverlo.
                        </p>
                    </div>
                )}
                {p.instalable && p.carpetas.length === 0 && p.puedeVincularCarpeta && (
                    <Button type="button" variant="ghost" size="sm" onClick={p.onVincularCarpeta} className="h-8 w-fit gap-1.5 px-2 text-xs cursor-pointer">
                        <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Vincular una carpeta de este dispositivo
                    </Button>
                )}
                {!p.instalable && p.app.web && !p.buscandoVersion && (
                    <Button type="button" variant="outline" size="sm" onClick={p.onInstalarDesdeWeb} className="h-8 w-fit gap-1.5 border-white/15 text-xs cursor-pointer">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        {conReleases ? "Instalar como app desde su web" : "Abrir su web"}
                    </Button>
                )}
                {!p.instalable && p.app.web && conReleases && !p.buscandoVersion && (
                    <p>En su web, el navegador ofrece «Instalar app» o «Añadir a pantalla de inicio».</p>
                )}
            </div>
        </Casilla>
    );
}

export function SeccionNeuronas({
    sesion,
    cargando,
    otras,
    seleccion,
    onCambio,
}: {
    sesion: boolean;
    cargando: boolean;
    otras: Neuron[];
    seleccion: readonly string[];
    onCambio: (id: string, marcada: boolean) => void;
}) {
    if (cargando) return <p className="text-xs text-muted-foreground">Buscando tus neuronas…</p>;
    if (!sesion) {
        return (
            <p className="text-xs text-muted-foreground">
                Para ver tus otras neuronas (los dispositivos vinculados a tu cuenta) hay que{" "}
                <Link href="/login" className="font-semibold text-emerald-300 underline-offset-2 hover:underline">
                    iniciar sesión
                </Link>
                .
            </p>
        );
    }
    if (!otras.length) {
        return (
            <p className="text-xs text-muted-foreground">
                No hay más neuronas en tu cuenta. Abre StarSeed OS con tu cuenta en otro dispositivo y aparecerá aquí.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                Les llegará el pedido: cada una lo verá al momento si está abierta, o al abrirse, y allí se decide si se instala.
            </p>
            <ul className="flex flex-col gap-2">
                {otras.map((n) => {
                    const Icono = ICONO_NEURONA[n.kind] ?? Cpu;
                    const estado = vistoHace(n.last_seen_at, n.online);
                    return (
                        <li key={n.id}>
                            <Casilla
                                id={`instalar-neurona-${n.id}`}
                                marcada={seleccion.includes(n.id)}
                                onCambio={(v) => onCambio(n.id, v)}
                                titulo={
                                    <span className="flex items-center gap-2">
                                        <Icono className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                                        <span className="truncate">{n.name}</span>
                                    </span>
                                }
                                descripcion={
                                    <span className="flex items-center gap-1.5">
                                        <span className={cn("h-1.5 w-1.5 rounded-full", n.online ? "bg-emerald-400" : "bg-white/30")} aria-hidden />
                                        {estado}
                                    </span>
                                }
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
