"use client";

/**
 * Hook React de una sala colaborativa (Documento / Presentación).
 *
 * Abre el espacio (acepta la invitación pendiente, lee la fila, decide si puedes editar), crea el
 * motor con el transporte de Supabase, lo expone con `useSyncExternalStore` y se ocupa del ciclo
 * de vida: guardar al ocultar la pestaña, releer al volver, cerrar el canal al salir.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Space } from "@/lib/spaces/spaces";
import { abrirEspacioApp, type AppColaborativa } from "./espacios";
import { SalaColaborativa, type InstantaneaSala } from "./motor";
import { transporteEspacio } from "./transporte-supabase";

export interface OpcionesUsarSala<P, M> {
    app: AppColaborativa;
    espacioId: string | null;
    validarDatos: (raw: unknown) => P | null;
    validarMeta: (raw: unknown) => M | null;
    metaInicial: M;
    nombreCosa: string;
    femenino?: boolean;
    maxBytes?: number;
    maxUnidades?: number;
}

export type EstadoApertura = "cargando" | "no-encontrado" | "red" | "listo";

export interface UsarSala<P, M> {
    apertura: EstadoApertura;
    espacio: Space | null;
    sala: SalaColaborativa<P, M> | null;
    inst: InstantaneaSala<P, M> | null;
    reintentar: () => void;
}

const suscripcionNula = () => () => {};
const instantaneaNula = () => null;

export function useSalaColaborativa<P, M>(opciones: OpcionesUsarSala<P, M>): UsarSala<P, M> {
    const opcionesRef = useRef(opciones);
    opcionesRef.current = opciones;
    const { espacioId } = opciones;
    const [apertura, setApertura] = useState<EstadoApertura>("cargando");
    const [espacio, setEspacio] = useState<Space | null>(null);
    const [sala, setSala] = useState<SalaColaborativa<P, M> | null>(null);
    const [intento, setIntento] = useState(0);

    useEffect(() => {
        if (!espacioId) {
            setApertura("no-encontrado");
            return;
        }
        let vivo = true;
        let creada: SalaColaborativa<P, M> | null = null;
        setApertura("cargando");
        setSala(null);
        void abrirEspacioApp(espacioId).then((r) => {
            if (!vivo) return;
            if (!r.ok) {
                setApertura(r.motivo);
                return;
            }
            const o = opcionesRef.current;
            creada = new SalaColaborativa<P, M>({
                app: o.app,
                transporte: transporteEspacio(espacioId),
                validarDatos: o.validarDatos,
                validarMeta: o.validarMeta,
                metaInicial: o.metaInicial,
                nombreCosa: o.nombreCosa,
                femenino: o.femenino,
                maxBytes: o.maxBytes,
                maxUnidades: o.maxUnidades,
                yo: r.abierto.yo,
                puedeEditar: r.abierto.puedeEditar,
                debounceMs: 900,
                esperaMaxMs: 5000,
            });
            creada.iniciar();
            setEspacio(r.abierto.space);
            setSala(creada);
            setApertura("listo");
        });
        return () => {
            vivo = false;
            creada?.cerrar();
        };
    }, [espacioId, intento]);

    // Guardar al esconder la pestaña; releer al volver (alguien pudo guardar mientras tanto).
    useEffect(() => {
        if (!sala || typeof document === "undefined") return;
        const alCambiar = () => {
            if (document.visibilityState === "hidden") void sala.guardarAhora();
            else void sala.alVolver();
        };
        const alSalir = () => void sala.guardarAhora();
        document.addEventListener("visibilitychange", alCambiar);
        window.addEventListener("pagehide", alSalir);
        return () => {
            document.removeEventListener("visibilitychange", alCambiar);
            window.removeEventListener("pagehide", alSalir);
        };
    }, [sala]);

    const inst = useSyncExternalStore(
        sala ? sala.suscribir : suscripcionNula,
        sala ? sala.instantanea : instantaneaNula,
        instantaneaNula,
    );

    const reintentar = useCallback(() => setIntento((n) => n + 1), []);

    return { apertura, espacio, sala, inst, reintentar };
}
