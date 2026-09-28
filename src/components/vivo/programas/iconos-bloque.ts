import { AlignLeft, ChartBar, ClipboardList, Hash, Heading, Kanban, ListChecks, type LucideIcon } from "lucide-react";
import type { TipoBloqueProg } from "@/lib/vivo/programas/tipos";

export const ICONO_BLOQUE: Record<TipoBloqueProg, LucideIcon> = {
    titulo: Heading,
    texto: AlignLeft,
    tareas: ListChecks,
    contador: Hash,
    encuesta: ChartBar,
    kanban: Kanban,
    formulario: ClipboardList,
};

export const COLOR_BLOQUE: Record<TipoBloqueProg, string> = {
    titulo: "#94A3B8",
    texto: "#94A3B8",
    tareas: "#10B981",
    contador: "#FFBF00",
    encuesta: "#7C5CFF",
    kanban: "#007FFF",
    formulario: "#EC4899",
};

export const DESCRIPCION_BLOQUE: Record<TipoBloqueProg, string> = {
    titulo: "Un encabezado para separar secciones.",
    texto: "Un párrafo de explicación para todo el grupo.",
    tareas: "Una lista que todos pueden ampliar y marcar.",
    contador: "Un número que sube y baja entre todos, o un voto por persona.",
    encuesta: "Una pregunta con opciones y resultados al instante.",
    kanban: "Tarjetas en columnas que se mueven entre todos.",
    formulario: "Campos a medida y un cupo de plazas.",
};
