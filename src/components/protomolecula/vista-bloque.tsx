"use client";

// Bloque «protomolecula» del lienzo universal, pintado en el feed. SOLO LECTURA:
// lo que se ve es un dato (`leerBloque`), nunca se ejecuta nada ni se edita la
// original. «Abrir copia propia» guarda una copia con id NUEVO en el almacén local
// y abre `/protomolecula?molecula=<idNuevo>`. Contrato: `architecture/protomolecula.md`.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { esAtomoVideoHtml, leerBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { almacenNavegador, guardarMolecula, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { claveDe, formatearValor } from "@/lib/protomolecula/parametros";
import { obtenerAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { VistaVideoHtml } from "./vista-video-html";
import type { Molecula } from "@/lib/protomolecula/tipos";

const NOMBRE_AMBITO: Record<string, string> = {
    personal: "Personal",
    perfil: "Perfil",
    grupo: "Grupo",
    publica: "Pública",
};

/** Copia con id nuevo, versión 1 y fechas de ahora; la original no se toca. */
export function copiaPropia(m: Molecula, idNuevo: string, ahora: number): Molecula {
    return {
        ...m,
        id: idNuevo,
        titulo: `${m.titulo} (copia)`,
        capas: m.capas.map((c) => ({ ...c, referencia: c.referencia ? { ...c.referencia } : null })),
        atomos: m.atomos.map((a) => ({ ...a })),
        valores: { ...m.valores },
        version: 1,
        creadaEn: ahora,
        actualizadaEn: ahora,
    };
}

const idAleatorio = (): string =>
    `mol-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

export interface VistaBloqueProps {
    texto: string;
    /** Inyectables (pruebas): por defecto, el almacén del navegador, el router y el registro de átomos. */
    almacen?: AlmacenLocal | null;
    navegar?: (ruta: string) => void;
    nuevoId?: () => string;
    buscarAtomo?: (herramientaId: string) => DefinicionAtomo | undefined;
    /** Estado del servicio local de HyperFrames (127.0.0.1) y del render en la malla: lo sabe el padre,
     *  no el bloque (una instantánea no sondea por su cuenta). Por defecto: sin servicio y sin render. */
    servicioVivo?: boolean;
    renderHecho?: boolean;
    urlVideo?: string;
    urlPoster?: string;
    urlServicio?: string;
}

export function VistaBloqueProtomolecula({
    texto, almacen, navegar, nuevoId = idAleatorio, buscarAtomo = obtenerAtomo,
    servicioVivo = false, renderHecho = false, urlVideo, urlPoster, urlServicio,
}: VistaBloqueProps) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const resultado = leerBloque(texto);

    if (!resultado.ok) {
        return (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="font-medium">Esta molécula no se puede mostrar</p>
                <p className="text-muted-foreground">Motivo: {resultado.motivo}</p>
            </div>
        );
    }
    const m = resultado.valor;

    const abrirCopia = () => {
        const destino = almacen === undefined ? almacenNavegador() : almacen;
        if (!destino) return setError("No hay almacén local en este medio: no se pudo guardar la copia.");
        const id = nuevoId();
        if (!guardarMolecula(destino, copiaPropia(m, id, Date.now()))) return setError("No se pudo guardar la copia.");
        (navegar ?? ((r: string) => router.push(r)))(`/protomolecula?molecula=${encodeURIComponent(id)}`);
    };

    return (
        <div data-testid="vista-bloque-protomolecula" className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-lg font-semibold">{m.titulo || "Molécula sin título"}</h3>
                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">{NOMBRE_AMBITO[m.ambito] ?? m.ambito}</span>
            </div>
            <section className="mb-3">
                <h4 className="mb-1 text-sm font-medium">Capas</h4>
                {m.capas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin capas.</p>
                ) : (
                    <ul className="list-inside list-disc text-sm">
                        {[...m.capas].sort((a, b) => a.orden - b.orden).map((c) => (
                            <li key={c.id}>{c.titulo} <span className="text-muted-foreground">({c.tipo})</span></li>
                        ))}
                    </ul>
                )}
            </section>
            <section className="mb-3">
                <h4 className="mb-1 text-sm font-medium">Herramientas y valores</h4>
                {m.atomos.length === 0 && <p className="text-xs text-muted-foreground">Sin herramientas.</p>}
                {m.atomos.map((a) => {
                    const def = buscarAtomo(a.herramientaId);
                    if (esAtomoVideoHtml(a.herramientaId)) {
                        return (
                            <div key={a.id} className="mb-2 rounded border border-border/40 p-2 text-sm">
                                <p className="mb-1 font-medium">{a.titulo ?? def?.nombre ?? a.herramientaId}</p>
                                <VistaVideoHtml
                                    atomo={a}
                                    servicioVivo={servicioVivo}
                                    renderHecho={renderHecho}
                                    urlVideo={urlVideo}
                                    urlPoster={urlPoster}
                                    urlServicio={urlServicio}
                                />
                            </div>
                        );
                    }
                    const parametros = (def?.parametros ?? []).filter((p) => m.valores[claveDe({ atomoId: a.id, parametroId: p.id })] !== undefined);
                    return (
                        <div key={a.id} className="mb-2 rounded border border-border/40 p-2 text-sm">
                            <p className="font-medium">{a.titulo ?? def?.nombre ?? a.herramientaId}</p>
                            {parametros.length === 0 && <p className="text-xs text-muted-foreground">Sin valores fijados.</p>}
                            {parametros.map((p) => (
                                <div key={p.id} className="flex justify-between gap-2">
                                    <span>{p.nombre}</span>
                                    <span className="font-mono">{formatearValor(p, m.valores[claveDe({ atomoId: a.id, parametroId: p.id })])}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </section>
            <button type="button" onClick={abrirCopia} className="w-full cursor-pointer rounded bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-600">
                Abrir copia propia
            </button>
            {error && <p role="status" className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
    );
}
