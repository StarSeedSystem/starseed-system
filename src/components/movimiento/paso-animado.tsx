"use client";

/**
 * PasoAnimado — cambio de paso de asistentes y guías con profundidad.
 * ─────────────────────────────────────────────────────────────────────────────
 * El paso nuevo entra de canto desde el lado hacia el que se avanza y el
 * anterior sale por el otro, como hojas que giran en 3D (resorte natural). Al
 * retroceder, el movimiento se invierte: la dirección se deduce sola del
 * índice (`useDireccionPaso`). Graduado por `useNivelMovimiento`: sin 3D en
 * equipos modestos y solo fundido con «menos movimiento».
 *
 * (Ola 1025U · GUIA1025U) `sinSalida`: el paso nuevo entra y el anterior se quita al instante, sin esperar su
 * despedida. Con `AnimatePresence mode="wait"` un cambio que llega a mitad de una salida (dos clics seguidos
 * en «Siguiente», una flecha del teclado mientras se desliza) puede dejar el paso viejo en pantalla; en una
 * guía de veinte pasos, por la que se va rápido, eso no puede ocurrir.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import { transicionPaso, variantesPaso, type Direccion } from "@/lib/movimiento/transiciones";

/** 1 si el índice avanzó, -1 si retrocedió (recuerda el anterior entre renders). */
export function useDireccionPaso(indice: number): Direccion {
    const anteriorRef = useRef(indice);
    const direccionRef = useRef<Direccion>(1);
    if (indice !== anteriorRef.current) {
        direccionRef.current = indice > anteriorRef.current ? 1 : -1;
        anteriorRef.current = indice;
    }
    return direccionRef.current;
}

export function PasoAnimado({
    clave,
    direccion,
    children,
    className,
    style,
    sinSalida = false,
}: {
    /** Identidad del paso: al cambiar, sale el anterior y entra el nuevo. */
    clave: string;
    direccion: Direccion;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** El anterior se quita al instante (ver arriba): solo anima la entrada. */
    sinSalida?: boolean;
}) {
    const nivel = useNivelMovimiento();
    const primeraVezRef = useRef(true);
    useEffect(() => {
        primeraVezRef.current = false;
    }, []);
    const v = variantesPaso(nivel);
    const variantes: Variants = {
        entrar: (d: Direccion) => v.entrar(d),
        centro: { ...v.centro, transition: transicionPaso(nivel) },
        // La salida es corta: el paso nuevo no debe esperar a una despedida larga.
        salir: (d: Direccion) => ({ ...v.salir(d), transition: { duration: nivel === "minimo" ? 0.1 : 0.16, ease: "easeIn" } }),
    };
    const paso = (
        <motion.div
            key={clave}
            custom={direccion}
            variants={variantes}
            initial={sinSalida && primeraVezRef.current ? false : "entrar"}
            animate="centro"
            {...(sinSalida ? {} : { exit: "salir" })}
            className={className}
            style={{ transformOrigin: direccion === 1 ? "0% 50%" : "100% 50%", ...style }}
        >
            {children}
        </motion.div>
    );
    return (
        <div style={{ perspective: nivel === "completo" ? 1200 : undefined }}>
            {sinSalida ? (
                paso
            ) : (
                <AnimatePresence mode="wait" initial={false} custom={direccion}>
                    {paso}
                </AnimatePresence>
            )}
        </div>
    );
}

export default PasoAnimado;
