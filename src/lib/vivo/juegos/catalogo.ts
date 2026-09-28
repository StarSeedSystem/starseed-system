/**
 * Los juegos que ofrece la sala de juegos: nombre, descripción, cuántas personas y qué opciones
 * admite. Es solo información para la interfaz (y para el selector del chat); las reglas viven
 * en cada juego.
 */
import type { IdJuego } from "./tipos";

export interface InfoJuego {
    id: IdJuego;
    nombre: string;
    descripcion: string;
    jugadores: string;
    /** Nombre de icono de lucide-react. */
    icono: "Hash" | "CircleDot" | "Crown" | "Brush";
    color: string;
}

export const JUEGOS_DISPONIBLES: readonly InfoJuego[] = [
    {
        id: "tres-en-raya",
        nombre: "Tres en raya",
        descripcion: "El clásico de tres en línea. Rápido para romper el hielo.",
        jugadores: "2 personas",
        icono: "Hash",
        color: "#10B981",
    },
    {
        id: "conecta-4",
        nombre: "Conecta 4",
        descripcion: "Deja caer fichas y alinea cuatro antes que tu rival.",
        jugadores: "2 personas",
        icono: "CircleDot",
        color: "#DC143C",
    },
    {
        id: "ajedrez",
        nombre: "Ajedrez",
        descripcion: "Reglas completas: enroque, captura al paso, coronación, jaque mate y tablas.",
        jugadores: "2 personas",
        icono: "Crown",
        color: "#FFBF00",
    },
    {
        id: "dibujo",
        nombre: "Dibujo-adivina",
        descripcion: "Una persona dibuja, las demás adivinan. Cooperativo: suma el grupo entero.",
        jugadores: "2 a 8 personas",
        icono: "Brush",
        color: "#7C5CFF",
    },
];

export function infoJuego(id: string): InfoJuego | null {
    return JUEGOS_DISPONIBLES.find((j) => j.id === id) ?? null;
}
