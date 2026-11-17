"use client";

/*
 * usarEspacio · SES1115Q P1-B: lee y escribe la clave `espacio` de una entidad.
 * Solo muestra lo que `puedeVerPestana` permite; las acciones exigen `puedeGestionarEspacio`
 * y devuelven un motivo. Un fallo de lectura va a `error`, nunca se disfraza de «no hay».
 */

import { useEffect, useMemo, useState } from "react";
import { currentUserRef, getEntityStateChecked, setEntityStateChecked, type EntityRef } from "@/lib/sync/entity-state";
import { anadirPestana, CLAVE_ESPACIO, normalizarEspacio, quitarPestana, type Pestana, type Visibilidad } from "./modelo";
import { cambioDeVisibilidad, puedeGestionarEspacio, puedeVerPestana } from "./permisos";

export type AccesoSesion = "privada" | "entidad" | "publica";

export interface ContextoEspacio {
    rango: number;
    roles?: string[];
    anonimo?: boolean;
    /** Acceso de la sesión enlazada; sin dato manda la visibilidad de la pestaña. */
    accesoSesion?: (pestana: Pestana) => AccesoSesion;
}

export interface ResultadoAccion {
    ok: boolean;
    motivo?: string;
}

export interface EstadoEspacio {
    pestanas: Pestana[];
    cargando: boolean;
    error: string | null;
    anadir: (pestana: Pestana) => Promise<ResultadoAccion>;
    quitar: (id: string) => Promise<ResultadoAccion>;
    cambiarVisibilidad: (id: string, visibilidad: Visibilidad) => Promise<ResultadoAccion>;
}

const SIN_SESION = "Sin sesión: inicia sesión para ver las pestañas de este espacio.";
const SIN_PERMISO = "Solo quien gestiona el espacio puede cambiar sus pestañas.";
const NO_SE = "No sé si hay pestañas.";

export function usarEspacio(entidad: EntityRef, ctx: ContextoEspacio): EstadoEspacio {
    const [todas, setTodas] = useState<Pestana[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        const ref = { kind: entidad.kind, id: entidad.id };
        setCargando(true);
        setError(null);
        void (async () => {
            if (!(await currentUserRef())) {
                if (vivo) { setTodas([]); setError(SIN_SESION); setCargando(false); }
                return;
            }
            const { row, error: fallo } = await getEntityStateChecked<Pestana[]>(ref, CLAVE_ESPACIO);
            if (!vivo) return;
            setTodas(fallo ? [] : normalizarEspacio(row?.value));
            setError(fallo ? fallo || NO_SE : null);
            setCargando(false);
        })();
        return () => { vivo = false; };
        // El ref se reconstruye dentro: solo importan el tipo y el id de la entidad.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entidad.kind, entidad.id]);

    const pestanas = useMemo(() => {
        const contexto = { rango: ctx.rango, roles: ctx.roles ?? [], anonimo: ctx.anonimo ?? false };
        const acceso = ctx.accesoSesion ?? (() => "publica" as AccesoSesion);
        return todas.filter((p) => puedeVerPestana(p, contexto, acceso(p)));
    }, [todas, ctx.rango, ctx.roles, ctx.anonimo, ctx.accesoSesion]);

    async function guardar(siguiente: Pestana[]): Promise<ResultadoAccion> {
        const ref = { kind: entidad.kind, id: entidad.id };
        const { error: fallo } = await setEntityStateChecked<Pestana[]>(ref, CLAVE_ESPACIO, siguiente);
        if (fallo) { setError(fallo); return { ok: false, motivo: fallo }; }
        setError(null);
        setTodas(siguiente);
        return { ok: true };
    }

    function negado(): ResultadoAccion | null {
        return puedeGestionarEspacio(ctx.rango) ? null : { ok: false, motivo: SIN_PERMISO };
    }

    async function anadir(pestana: Pestana): Promise<ResultadoAccion> {
        const no = negado();
        if (no) return no;
        const siguiente = anadirPestana(todas, pestana);
        if (siguiente.length === todas.length) return { ok: false, motivo: "No se añadió: esa pestaña ya existe o el espacio está lleno." };
        return guardar(siguiente);
    }

    async function quitar(id: string): Promise<ResultadoAccion> {
        const no = negado();
        if (no) return no;
        const siguiente = quitarPestana(todas, id);
        if (siguiente.length === todas.length) return { ok: false, motivo: "Esa pestaña ya no está en el espacio." };
        return guardar(siguiente);
    }

    async function cambiarVisibilidad(id: string, visibilidad: Visibilidad): Promise<ResultadoAccion> {
        const no = negado();
        if (no) return no;
        const actual = todas.find((p) => p.id === id);
        if (!actual) return { ok: false, motivo: "Esa pestaña no está en el espacio." };
        if (!cambioDeVisibilidad(ctx.rango, actual.visibilidad, visibilidad).permitido) {
            return { ok: false, motivo: SIN_PERMISO };
        }
        const siguiente: Pestana[] = todas.map((p) =>
            p.id === id
                ? { ...p, visibilidad, accesoPublico: visibilidad === "publica" ? "ver" : "ninguno", roles: visibilidad === "roles" ? p.roles ?? [] : undefined }
                : p,
        );
        return guardar(siguiente);
    }

    return { pestanas, cargando, error, anadir, quitar, cambiarVisibilidad };
}
