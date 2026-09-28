"use client";

/**
 * Piezas comunes de las salas de juego y de programa: botones, avisos, avatares, indicador de
 * conexión y la preferencia de movimiento. Vidrio oscuro StarSeed; iconos de lucide (nunca emojis).
 */
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { AlertTriangle, Info, Wifi, WifiOff, X } from "lucide-react";
import { colorDePersona, inicialesDe } from "@/lib/vivo/juegos/asientos";
import type { EstadoConexion } from "@/lib/vivo/juegos/controlador";
import type { Presente } from "@/lib/vivo/juegos/tipos";
import styles from "./juegos.module.css";

export const estilos = styles;

const unir = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "normal" | "primario" | "peligro";

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
    variante?: Variante;
    /** Botón circular (solo icono): pide siempre `aria-label`. */
    redondo?: boolean;
    icono?: ReactNode;
}

export function Boton({ variante = "normal", redondo, icono, className, children, type = "button", ...resto }: PropsBoton) {
    return (
        <button
            type={type}
            {...resto}
            className={unir(
                styles.boton,
                variante === "primario" && styles.botonPrimario,
                variante === "peligro" && styles.botonPeligro,
                redondo && `${styles.botonRedondo} ss-redondo`,
                className,
            )}
        >
            {icono}
            {children}
        </button>
    );
}

/** ¿Hay que evitar animaciones? (preferencia del sistema o modo eco del OS). */
export function useSinAnimacion(): boolean {
    const reducido = useReducedMotion();
    const [eco, setEco] = useState(false);
    useEffect(() => {
        if (typeof document === "undefined") return;
        const leer = () => setEco(document.documentElement.dataset.perf === "eco");
        leer();
        if (typeof MutationObserver === "undefined") return;
        const o = new MutationObserver(leer);
        o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-perf"] });
        return () => o.disconnect();
    }, []);
    return !!reducido || eco;
}

/** Reloj que se actualiza cada `cadaMs` mientras `activo` (para cuentas atrás). */
export function useReloj(activo: boolean, cadaMs = 500): number {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        if (!activo) return;
        setAhora(Date.now());
        const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
        return () => window.clearInterval(id);
    }, [activo, cadaMs]);
    return ahora;
}

export function Aviso({
    tipo = "aviso",
    children,
    alCerrar,
}: {
    tipo?: "aviso" | "error" | "info";
    children: ReactNode;
    alCerrar?: () => void;
}) {
    const Icono = tipo === "info" ? Info : AlertTriangle;
    return (
        <div
            className={unir(styles.aviso, tipo === "error" && styles.avisoError, tipo === "info" && styles.avisoInfo)}
            role={tipo === "error" ? "alert" : "status"}
        >
            <Icono size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <div className={styles.avisoTexto}>{children}</div>
            {alCerrar && (
                <Boton redondo onClick={alCerrar} aria-label="Cerrar aviso" style={{ width: 30, minHeight: 30 }}>
                    <X size={16} aria-hidden="true" />
                </Boton>
            )}
        </div>
    );
}

export function Avatar({ uid, nombre, tamano }: { uid: string; nombre: string; tamano?: number }) {
    return (
        <span
            className={styles.avatar}
            style={{ background: colorDePersona(uid), color: "#0B0D1F", ...(tamano ? { width: tamano, height: tamano } : {}) }}
            title={nombre}
            aria-label={nombre || "Persona"}
            role="img"
        >
            {inicialesDe(nombre)}
        </span>
    );
}

/** Quién está en la sala ahora mismo (presencia): hasta 5 avatares y «+n». */
export function PresenciaSala({ presentes }: { presentes: Presente[] }) {
    if (presentes.length === 0) return null;
    const visibles = presentes.slice(0, 5);
    const resto = presentes.length - visibles.length;
    return (
        <div className={styles.presentes} role="group" aria-label={`${presentes.length} en la sala ahora`}>
            {visibles.map((p) => (
                <Avatar key={p.uid} uid={p.uid} nombre={p.nombre || "Persona"} />
            ))}
            {resto > 0 && (
                <span className={`${styles.avatar} ${styles.avatarMas}`} aria-label={`y ${resto} más`}>
                    +{resto}
                </span>
            )}
        </div>
    );
}

export function IndicadorConexion({ conexion }: { conexion: EstadoConexion }) {
    const enVivo = conexion === "en-vivo";
    const Icono = enVivo ? Wifi : WifiOff;
    const texto = enVivo ? "En vivo" : conexion === "conectando" ? "Conectando" : "Sin conexión en vivo";
    return (
        <span
            className={unir(styles.pildora, enVivo ? styles.encendido : styles.reconectando)}
            role="status"
            title={enVivo ? "Las jugadas llegan al instante" : "Lo que hagas se guarda y se sincroniza al volver"}
        >
            <Icono size={14} aria-hidden="true" />
            {texto}
        </span>
    );
}
