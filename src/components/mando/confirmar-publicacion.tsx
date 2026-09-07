"use client";

/**
 * Diálogo de confirmación de una publicación (Ola 274 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal accesible (role="dialog", cierre con Escape, foco inicial en el campo)
 * que firma la publicación del Mando. Publicar en producción dispara Vercel, por
 * eso exige escribir exactamente «PUBLICAR»; para vista previa y paquete basta
 * con «OK». Nada de `window.confirm`: la firma es escrita y deliberada.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import type { EstadoRepoPublicable, ModoPublicacion } from "@/lib/mando/publicaciones";

/** Datos mínimos para componer el diálogo: el repo y el modo elegidos. */
export type PeticionDeConfirmacion = {
    repo: EstadoRepoPublicable;
    modo: ModoPublicacion;
    /** Sha completo de corte para «Publicar hasta aquí» (o undefined para todo). */
    hasta?: string;
    /** Puntuación de la última verificación de la neurona (null si no hay). */
    verificacionNeurona: number | null;
};

export type ResultadoDeConfirmacion = {
    repo: string;
    modo: ModoPublicacion;
    hasta?: string;
    confirmacion: string;
};

export const TITULOS_MODO: Record<ModoPublicacion, string> = {
    produccion: "Publicar en producción",
    "vista-previa": "Vista previa en Vercel",
    paquete: "Guardar paquete",
};

/** Texto exacto que hay que escribir según el modo. */
export const TEXTO_CONFIRMACION: Record<ModoPublicacion, string> = {
    produccion: "PUBLICAR",
    "vista-previa": "OK",
    paquete: "OK",
};

/** Lista de comprobación previa: cada punto es {claveRevisado, ok, texto, peligro}. */
type PuntoChequeo = { ok: boolean; texto: string; peligro: boolean };

/** Compone la lista de comprobación previa a partir del estado del repo. */
function listaDeChequeo(peticion: PeticionDeConfirmacion): PuntoChequeo[] {
    const { repo, modo, verificacionNeurona } = peticion;
    const puntos: PuntoChequeo[] = [
        {
            ok: repo.arbolLimpio,
            texto: repo.arbolLimpio ? "Árbol limpio" : "Hay cambios sin commitear",
            peligro: !repo.arbolLimpio,
        },
        {
            ok: !repo.enjambreEscribiendo,
            texto: repo.enjambreEscribiendo ? "El enjambre está escribiendo" : "Enjambre no escribiendo",
            peligro: repo.enjambreEscribiendo,
        },
        {
            ok: !repo.remotoMovido,
            texto: repo.remotoMovido ? "El remoto se movió desde la última lectura" : "Remoto sin cambios",
            peligro: repo.remotoMovido,
        },
    ];
    if (verificacionNeurona === null) {
        puntos.push({
            ok: true,
            texto: "Neurona sin verificación registrada (no bloquea)",
            peligro: false,
        });
    } else {
        puntos.push({
            ok: verificacionNeurona >= 70,
            texto: `Última verificación de la Neurona: ${verificacionNeurona} puntos`,
            peligro: verificacionNeurona < 70,
        });
    }
    if (modo === "produccion") {
        puntos.push({
            ok: true,
            texto: "Vercel desplegará producción en cuanto termine el push",
            peligro: false,
        });
    }
    return puntos;
}

/** Cuenta los archivos e inserciones/borrados sumando los commits pendientes. */
function resumenStats(repo: EstadoRepoPublicable): { archivos: number; mas: number; menos: number } {
    let archivos = 0;
    let mas = 0;
    let menos = 0;
    for (const c of repo.commits) {
        archivos += c.archivos;
        mas += c.mas;
        menos += c.menos;
    }
    return { archivos, mas, menos };
}

/** Corte real del diálogo: el repo antes del «hasta» o, si no, el más antiguo. */
function rangoDesdeHasta(repo: EstadoRepoPublicable, hasta?: string): string {
    const masNuevo = repo.commits[0]?.corto ?? "";
    if (hasta) return `${masNuevo}…${hasta.slice(0, 7)}`;
    return masNuevo;
}

/**
 * Modal de confirmación. `peticion` es null mientras no se abre; al confirmar
 * llama a `alConfirmar` con la firma exacta escrita por el usuario. `alCerrar`
 * cierra sin publicar. Cierra con Escape y devuelve el foco al abrir.
 */
export function ConfirmarPublicacion({
    peticion,
    alConfirmar,
    alCerrar,
}: {
    peticion: PeticionDeConfirmacion | null;
    alConfirmar: (resultado: ResultadoDeConfirmacion) => void;
    alCerrar: () => void;
}) {
    const [escrito, setEscrito] = useState("");
    const campoRef = useRef<HTMLInputElement>(null);

    // Al abrir (cambia la petición) se limpia la firma y se devuelve el foco al campo.
    useEffect(() => {
        setEscrito("");
        if (peticion) {
            const t = window.setTimeout(() => campoRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
    }, [peticion]);

    // Cierre con Escape (solo si hay diálogo abierto).
    useEffect(() => {
        if (!peticion) return;
        const alTecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") alCerrar();
        };
        document.addEventListener("keydown", alTecla);
        return () => document.removeEventListener("keydown", alTecla);
    }, [peticion, alCerrar]);

    if (!peticion) return null;

    const esperada = TEXTO_CONFIRMACION[peticion.modo];
    const puntos = listaDeChequeo(peticion);
    const stats = resumenStats(peticion.repo);
    const totalCommits = peticion.repo.commits.length;
    const rango = rangoDesdeHasta(peticion.repo, peticion.hasta);
    const listo = escrito === esperada;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(e) => {
                // Clic fuera del panel cierra; el panel detiene la propagación.
                if (e.target === e.currentTarget) alCerrar();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="titulo-confirmar-publicacion"
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 id="titulo-confirmar-publicacion" className="text-base font-semibold text-white">
                        {TITULOS_MODO[peticion.modo]}
                    </h2>
                    <button
                        type="button"
                        onClick={alCerrar}
                        aria-label="Cerrar"
                        className="cursor-pointer rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </div>

                <dl className="space-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                    <div className="flex justify-between">
                        <dt>Repositorio</dt>
                        <dd className="font-mono text-white/90">{peticion.repo.nombre}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt>Commits</dt>
                        <dd className="font-mono text-white/90">{totalCommits}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt>Rango</dt>
                        <dd className="font-mono text-white/90">{rango}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt>Cambios</dt>
                        <dd className="font-mono text-white/90">
                            +{stats.mas} −{stats.menos} · {stats.archivos} archivos
                        </dd>
                    </div>
                </dl>

                <ul className="mt-3 space-y-1.5">
                    {puntos.map((p) => (
                        <li key={p.texto} className="flex items-start gap-2 text-xs">
                            {p.ok ? (
                                <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                            ) : (
                                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                            )}
                            <span className={p.peligro && !p.ok ? "text-amber-200" : "text-white/70"}>
                                {p.texto}
                            </span>
                        </li>
                    ))}
                </ul>

                <label className="mt-4 block">
                    <span className="text-xs text-white/60">
                        Escribe <span className="font-mono font-semibold text-white">{esperada}</span> para confirmar:
                    </span>
                    <input
                        ref={campoRef}
                        type="text"
                        value={escrito}
                        onChange={(e) => setEscrito(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
                    />
                </label>

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={alCerrar}
                        className="cursor-pointer rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={!listo}
                        onClick={() => alConfirmar({ repo: peticion.repo.repo, modo: peticion.modo, hasta: peticion.hasta, confirmacion: escrito })}
                        className="cursor-pointer rounded-md bg-trinity-azure px-3 py-1.5 text-xs font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}