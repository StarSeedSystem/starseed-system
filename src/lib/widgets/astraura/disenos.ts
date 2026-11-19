import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import type { ReactNode } from "react";

export type Diseno = "minimo" | "conversacion" | "acciones" | "voz";
export type EleccionDiseno = Diseno | "auto";

export const DISENOS: Record<Diseno, { nombre: string; sirvePara: string }> = {
    minimo: {
        nombre: "Mínimo",
        sirvePara: "Solo la forma, el estado y una línea para preguntar: para un panel que no quiere distracciones",
    },
    conversacion: {
        nombre: "Conversación",
        sirvePara: "La forma pequeña y el último intercambio con quién habló y cuándo: para retomar una charla",
    },
    acciones: {
        nombre: "Acciones",
        sirvePara: "La forma y atajos: resumir mi día, qué hay nuevo, abrir el chat, ordenar tareas: para empezar rápido",
    },
    voz: {
        nombre: "Voz",
        sirvePara: "La forma grande y un botón enorme de hablar con su estado: para manos ocupadas, tabletas y pantallas lejanas",
    },
};

export type TamanoWidget = "compacto" | "medio" | "grande";

export function tamanoDe(clase: ClaseTamano): TamanoWidget {
    if (clase === "micro" || clase === "s") return "compacto";
    if (clase === "m" || clase === "panoramico") return "medio";
    return "grande";
}

export function disenoValido(x: unknown): EleccionDiseno {
    if (typeof x === "string") {
        const v = x as EleccionDiseno;
        if (v === "minimo" || v === "conversacion" || v === "acciones" || v === "voz" || v === "auto") {
            return v;
        }
    }
    return "auto";
}

export interface ContextoDiseno {
    tamano: TamanoWidget;
    tactil: boolean;
    hayVoz: boolean;
    hayConversacion: boolean;
}

export interface ResultadoDiseno {
    diseno: Diseno;
    degradado: boolean;
}

function autoPara(ctx: ContextoDiseno): Diseno {
    if (ctx.tamano === "compacto") return "minimo";
    if (ctx.tamano === "medio") return ctx.hayConversacion ? "conversacion" : "acciones";
    if (ctx.tactil && ctx.hayVoz) return "voz";
    if (ctx.hayConversacion) return "conversacion";
    return "acciones";
}

export function resolverDiseno(eleccion: EleccionDiseno, ctx: ContextoDiseno): ResultadoDiseno {
    const valida = disenoValido(eleccion);
    if (valida !== "auto") {
        if (ctx.tamano === "compacto" && valida !== "minimo") {
            return { diseno: "minimo", degradado: true };
        }
        return { diseno: valida, degradado: false };
    }
    return { diseno: autoPara(ctx), degradado: false };
}

export interface PropsDiseno {
    estado: EstadoAsistente;
    tam: number;
    ultima: { texto: string; ts: number } | null;
    hilo: { rol: "user" | "aurora"; texto: string; ts: number }[];
    ahora: number;
    tactil: boolean;
    voz: boolean;
    preguntar: ReactNode;
    botonVoz: ReactNode;
    sugerencias: string[];
    onAbrirChat: () => void;
    onSugerencia: (t: string) => void;
}

export type EstadoAsistente = "calma" | "escuchando" | "pensando" | "hablando" | "error";