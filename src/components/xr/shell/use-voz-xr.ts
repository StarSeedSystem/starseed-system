"use client";
/**
 * StarSeed XR · hook de voz de la Trinity (tarea XR1010P). Envuelve `crearSesionVoz`
 * (máquina PURA en `./voz-xr.ts`, probada) y carga las LISTAS REALES de la cuenta:
 * grupos del hub (`useLiveGroups`, tabla `os_groups`), contactos (`useContactos`),
 * estaciones (`listarEstaciones`) y servidores (`listServers`, los de `/servidores`).
 * Lecturas de una sola vez (sin sondeos en bucle); no se inventa nada.
 * Privacidad: el micrófono arranca CERRADO; solo la acción `hablar` lo abre.
 * Consumo: la tarjeta de confirmación y los ejecutores los cablean XR1010Q y XR1010T.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveGroups } from "@/lib/widget-data/os-live";
import { useContactos } from "@/lib/contactos/store";
import { listarEstaciones } from "@/lib/estaciones/datos";
import { listServers } from "@/lib/brains/servers";
import { construirContexto, crearSesionVoz, MOTIVO_SIN_VOZ, reconocedorDelNavegador, reconocedorLocal, type EstadoVoz, type Referenciable, type Reparto, type SesionVoz } from "./voz-xr";

export interface OpcionesVozXR {
    /** «este grupo» / lo señalado con el rayo (§3 f): lo trae XR1010Q. */
    enfoque?: { tipo: "grupo" | "persona" | "estacion" | "servidor"; id: string } | null;
    /** El mundo o entidad actual (para «lo creado» / «súbelo»). */
    mundoActual?: { id: string; nombre: string } | null;
    /** Hay una Protomolécula con foco abierto: lo da XR1010T. */
    moleculaConFoco?: boolean;
}

export interface VozXR {
    estado: EstadoVoz;
    parcial: string;
    resultado: Reparto | null;
    /** `true` = pulsar (abre el mic); `false` = soltar (cierra el mic y reparte). */
    hablar(sube: boolean): void;
    cancelar(): void;
}

export function useVozXR(opciones: OpcionesVozXR = {}): VozXR {
    const [estado, setEstado] = useState<EstadoVoz>({ estado: "cerrado" });
    const [parcial, setParcial] = useState("");
    const [resultado, setResultado] = useState<Reparto | null>(null);

    const grupos = useLiveGroups();
    const libreta = useContactos();
    const [extras, setExtras] = useState<{ estaciones: Referenciable[]; servidores: Referenciable[] }>({ estaciones: [], servidores: [] });
    useEffect(() => {
        let vivo = true;
        const usar = async () => {
            const [es, sv] = await Promise.all([
                listarEstaciones({ limite: 40 }).catch(() => []),
                listServers().catch(() => []),
            ]);
            if (!vivo) return;
            setExtras({
                estaciones: es.filter((e) => e.titulo).map((e) => ({ id: e.id, nombre: e.titulo })),
                servidores: sv.filter((s) => s.name).map((s) => ({ id: s.id, nombre: s.name })),
            });
        };
        void usar();
        return () => { vivo = false };
    }, []);

    // Contexto de voz FRESCO en cada render, pero congelado al soltar (lo lee `preguntar`).
    const ctx = useMemo(() => {
        const gs: Referenciable[] = grupos.rows.filter((g) => !!g.name).map((g) => ({ id: g.id, nombre: g.name!, ...(typeof g.member_count === "number" ? { miembros: g.member_count } : {}) }));
        const cs: Referenciable[] = libreta.contactos.map((c) => ({ id: c.id, nombre: c.nombre, ...(c.username ? { alias: [c.username] } : {}) }));
        return construirContexto(
            { grupos: gs, contactos: cs, estaciones: extras.estaciones, servidores: extras.servidores },
            opciones.enfoque ?? null,
            opciones.mundoActual ?? null,
        );
    }, [grupos.rows, libreta.contactos, extras.estaciones, extras.servidores, opciones.enfoque, opciones.mundoActual]);
    const ctxRef = useRef(ctx); ctxRef.current = ctx;
    const opcionesRef = useRef(opciones); opcionesRef.current = opciones;

    // Reconocedor 1 (navegador) con respaldo 2 (oído local de la neurona); si ninguno, sin voz.
    const recon = useMemo(() => reconocedorDelNavegador() ?? reconocedorLocal(), []);

    const [sesion, setSesion] = useState<SesionVoz | null>(null);
    useEffect(() => {
        const s = crearSesionVoz(recon, {
            preguntar: () => ({ ctx: ctxRef.current, molecula: opcionesRef.current.moleculaConFoco ?? false }),
            alEstado: (e) => setEstado(e),
            alParcial: (t) => setParcial(t),
            alReparto: (r) => setResultado(r),
        });
        setSesion(s);
        if (!recon) setEstado({ estado: "sin-voz", motivo: MOTIVO_SIN_VOZ });
        return () => { s.cerrar(); };
    }, [recon]);

    const hablar = useCallback((sube: boolean) => { void sesion?.hablar(sube); }, [sesion]);
    const cancelar = useCallback(() => { sesion?.cancelar(); setParcial(""); setResultado(null); }, [sesion]);

    return { estado, parcial, resultado, hablar, cancelar };
}
