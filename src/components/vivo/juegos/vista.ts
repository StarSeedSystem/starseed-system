import type { ReactNode } from "react";
import type { Controlador, Instantanea } from "@/lib/vivo/juegos/controlador";
import type { EstadoMesa } from "@/lib/vivo/juegos/mesa";
import type { Sonidos } from "@/lib/vivo/juegos/sonidos";
import type { Datos } from "@/lib/vivo/juegos/tipos";

/** Lo que recibe la vista de cada juego (escenario + lateral) de la sala. */
export interface PropsVista {
    estado: EstadoMesa;
    inst: Instantanea;
    controlador: Controlador;
    /** Asientos que ocupo yo. */
    misAsientos: number[];
    /** ¿Puedo actuar? (con sesión y con permiso de escritura). */
    puedeActuar: boolean;
    /** Propone una entrada al diario; si las reglas no la permiten, avisa. */
    enviar: (k: string, d?: Datos) => boolean;
    rendirse: () => void;
    /** Panel de asientos y turno (lo pone la sala). */
    panelMesa: ReactNode;
    /** Banner del resultado (lo pone la sala). */
    resultado: ReactNode;
    sonidos: Sonidos;
}
