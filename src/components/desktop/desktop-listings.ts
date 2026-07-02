// ════════════════════════════════════════════════════════════════
// StarSeed OS — Listados publicables de personalización del escritorio
// ----------------------------------------------------------------
// Datos puros (SIN dependencias de la Librería ni de React) para que
// la Librería pueda publicar los cursores y las animaciones de gesto
// como Entidades Únicas instalables. Los ids coinciden con los del
// store de cursor-fx ('starseed.cursorfx.v1').
// ════════════════════════════════════════════════════════════════

export interface DesktopListing {
    id: string;
    nombre: string;
    descripcion: string;
    /** Vista previa rápida (emoji) para tarjetas de la Librería. */
    preview: string;
    /** Paleta representativa (hex) para el marco/acento de la tarjeta. */
    paleta: string[];
}

/** Cursores del escritorio (opciones de `cursor` en cursor-fx). */
export const CURSOR_LISTINGS: DesktopListing[] = [
    {
        id: "system",
        nombre: "Cursor del sistema",
        descripcion: "El puntero nativo de tu dispositivo, sin modificaciones. Máxima familiaridad y precisión.",
        preview: "🖱️",
        paleta: ["#E2E8F0", "#94A3B8"],
    },
    {
        id: "starseed-triangle",
        nombre: "Triángulo StarSeed",
        descripcion: "El símbolo original de StarSeed convertido en puntero: triángulo cristalino de punta afilada con borde de neón azur-violeta.",
        preview: "🔺",
        paleta: ["#66E3FF", "#007FFF", "#7C3AED"],
    },
    {
        id: "orb",
        nombre: "Orbe mini",
        descripcion: "Una pequeña esfera de luz líquida con brillo interior. Suave, orgánica y visible sobre cualquier fondo.",
        preview: "🔮",
        paleta: ["#EAF6FF", "#3FB6FF", "#6D28D9"],
    },
];

/** Animaciones de gesto/clic del escritorio (opciones de `click` en cursor-fx). */
export const GESTURE_ANIMATION_LISTINGS: DesktopListing[] = [
    {
        id: "none",
        nombre: "Sin animación",
        descripcion: "Interacción silenciosa: ningún efecto visual al hacer clic o tocar.",
        preview: "∅",
        paleta: ["#64748B"],
    },
    {
        id: "liquid-ripple",
        nombre: "Onda líquida",
        descripcion: "Anillos cristalinos concéntricos que se expanden desde el punto de contacto, como una gota sobre vidrio líquido.",
        preview: "💧",
        paleta: ["#8FE8FF", "#007FFF", "#FFFFFF"],
    },
    {
        id: "star-burst",
        nombre: "Destello estelar",
        descripcion: "Una estrella de 4 puntas que florece y se desvanece con chispas cardinales. El toque StarSeed clásico.",
        preview: "✨",
        paleta: ["#FFFFFF", "#66E3FF", "#FFBF00"],
    },
    {
        id: "neon-bubble",
        nombre: "Burbuja neón",
        descripcion: "Una burbuja de borde neón que asciende, ondula y estalla suavemente. Juguetona y ciberdélica.",
        preview: "🫧",
        paleta: ["#39FF14", "#22D3EE", "#A855F7"],
    },
];
