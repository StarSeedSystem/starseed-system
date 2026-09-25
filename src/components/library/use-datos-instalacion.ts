"use client";

/**
 * Datos que el diálogo de instalar necesita de la cuenta y del dispositivo:
 * sesión, esta neurona, las demás neuronas, los perfiles y las carpetas vinculadas.
 *
 * Se piden UNA vez al abrir el diálogo (nada de sondeos): las neuronas y los perfiles
 * viven en Supabase y cambian poco; las carpetas sí se escuchan en vivo porque la persona
 * puede vincular una desde el propio diálogo.
 */

import { useEffect, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { listNeurons, thisDeviceId, type Neuron } from "@/lib/neurons/neurons";
import { activeProfileId, listMyProfiles, type AccountProfile } from "@/lib/profiles/profiles";
import { listarCarpetas, suscribirCarpetas, type CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import type { NeuronaBreve } from "@/lib/instalaciones/plan";

export interface DatosInstalacion {
    cargando: boolean;
    sesion: boolean;
    estaNeurona: NeuronaBreve | null;
    /** Neuronas de la cuenta, sin esta. */
    otras: Neuron[];
    perfiles: AccountProfile[];
    /** Perfil activo en este dispositivo, si sigue existiendo. */
    perfilActivo: string | null;
    /** Carpetas del dispositivo vinculadas (no las de servicios externos). */
    carpetas: CarpetaVinculada[];
}

async function haySesion(): Promise<boolean> {
    try {
        const { data } = await createClient().auth.getUser();
        return Boolean(data?.user?.id);
    } catch {
        return false;
    }
}

const soloDispositivo = (l: CarpetaVinculada[]) => l.filter((c) => c.tipo === "dispositivo");

export function useDatosInstalacion(): DatosInstalacion {
    const [datos, setDatos] = useState<DatosInstalacion>({
        cargando: true,
        sesion: false,
        estaNeurona: null,
        otras: [],
        perfiles: [],
        perfilActivo: null,
        carpetas: [],
    });

    useEffect(() => {
        let vivo = true;
        const yo = thisDeviceId();
        // Esta neurona se conoce ya por su id (el nombre llega con listNeurons): así «Instalar»
        // en este dispositivo guarda su destino aunque la lista de neuronas aún no haya llegado.
        setDatos((d) => ({ ...d, carpetas: soloDispositivo(listarCarpetas()), estaNeurona: yo ? { id: yo, nombre: "" } : null }));
        // Los perfiles llegan por su lado: listNeurons tarda más (registra esta neurona y
        // mide sus capacidades) y no debe retrasar el selector de perfil.
        void listMyProfiles().then((perfiles) => {
            if (!vivo) return;
            const activo = activeProfileId();
            setDatos((d) => ({ ...d, perfiles, perfilActivo: activo && perfiles.some((p) => p.id === activo) ? activo : null }));
        });
        void Promise.all([haySesion(), listNeurons()]).then(([sesion, neuronas]) => {
            if (!vivo) return;
            const esta = neuronas.find((n) => n.isThisDevice || n.id === yo) ?? null;
            setDatos((d) => ({
                ...d,
                cargando: false,
                sesion,
                estaNeurona: esta ? { id: esta.id, nombre: esta.name } : yo ? { id: yo, nombre: "" } : null,
                otras: neuronas.filter((n) => n.id !== (esta?.id ?? yo)),
            }));
        });
        const off = suscribirCarpetas((l) => {
            if (vivo) setDatos((d) => ({ ...d, carpetas: soloDispositivo(l) }));
        });
        return () => {
            vivo = false;
            off();
        };
    }, []);

    return datos;
}
