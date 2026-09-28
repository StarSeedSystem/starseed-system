"use client";
/**
 * Abre un documento vivo (`MotorColab`) para un componente de React.
 *
 * El motor se crea DENTRO del efecto (seguro con StrictMode: la primera pasada se cancela y la
 * segunda es la buena) y se destruye al desmontar, que guarda lo pendiente. El snapshot es el del
 * propio motor (estable mientras nada cambie), así que `useSyncExternalStore` no entra en bucle.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SNAPSHOT_INICIAL, type MotorColab, type SnapshotMotor } from "@/lib/vivo/tabla/motor-colab";
import { miUid } from "@/lib/vivo/tabla/espacio";

const sinSuscripcion = () => () => {};
const inicial = () => SNAPSHOT_INICIAL;

export interface MotorVivo<D> {
    motor: MotorColab<D> | null;
    snap: SnapshotMotor<D>;
    uid: string | null;
}

export function useMotorVivo<D>(clave: string, crear: (uid: string | null) => MotorColab<D>): MotorVivo<D> {
    const [estado, setEstado] = useState<{ motor: MotorColab<D>; uid: string | null } | null>(null);
    const crearRef = useRef(crear);
    crearRef.current = crear;

    useEffect(() => {
        let vivo = true;
        let motor: MotorColab<D> | null = null;
        const limpiezas: (() => void)[] = [];
        void (async () => {
            const uid = await miUid();
            if (!vivo) return;
            const m = crearRef.current(uid);
            motor = m;
            setEstado({ motor: m, uid });
            void m.iniciar();
            const visibilidad = () => {
                if (document.visibilityState === "hidden") {
                    m.alOcultar();
                    void m.guardarYa();
                } else m.alMostrar();
            };
            const online = () => m.alVolverRed();
            const salir = () => void m.guardarYa();
            document.addEventListener("visibilitychange", visibilidad);
            window.addEventListener("online", online);
            window.addEventListener("pagehide", salir);
            limpiezas.push(
                () => document.removeEventListener("visibilitychange", visibilidad),
                () => window.removeEventListener("online", online),
                () => window.removeEventListener("pagehide", salir),
            );
        })();
        return () => {
            vivo = false;
            for (const f of limpiezas) f();
            motor?.destruir();
            setEstado(null);
        };
    }, [clave]);

    const motor = estado?.motor ?? null;
    const snap = useSyncExternalStore(
        motor ? motor.subscribe : sinSuscripcion,
        motor ? motor.getSnapshot : (inicial as () => SnapshotMotor<D>),
        inicial as () => SnapshotMotor<D>,
    );
    return { motor, snap, uid: estado?.uid ?? null };
}
