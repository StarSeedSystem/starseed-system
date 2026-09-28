/**
 * Modelo del editor de bloques: el «borrador» que edita la persona (todo texto, como en los
 * campos de un formulario) y su conversión de ida y vuelta a un bloque de programa. Lo que sale
 * de `bloqueDeBorrador` es un objeto CRUDO: el editor lo pasa siempre por `sanearBloque` antes de
 * proponerlo, de modo que las reglas de validación son las del motor y nunca dos versiones.
 */
import type { BloqueProg, TipoBloqueProg, TipoCampo } from "@/lib/vivo/programas/tipos";

export interface ItemBorrador {
    id: string;
    texto: string;
}

export interface CampoBorrador {
    id: string;
    etiqueta: string;
    tipo: TipoCampo;
    obligatorio: boolean;
    /** Una opción por línea (solo para `opcion`). */
    opciones: string;
}

export type ModoContador = "libre" | "voto" | "limite";

export type BorradorBloque =
    | { tipo: "titulo"; id: string; texto: string; nivel: 1 | 2 | 3 }
    | { tipo: "texto"; id: string; texto: string }
    | { tipo: "tareas"; id: string; titulo: string; iniciales: string }
    | {
          tipo: "contador";
          id: string;
          titulo: string;
          inicial: string;
          paso: string;
          min: string;
          max: string;
          unidad: string;
          modo: ModoContador;
          limite: string;
      }
    | { tipo: "encuesta"; id: string; titulo: string; pregunta: string; opciones: ItemBorrador[]; maxElecciones: string }
    | { tipo: "kanban"; id: string; titulo: string; columnas: ItemBorrador[] }
    | { tipo: "formulario"; id: string; titulo: string; descripcion: string; campos: CampoBorrador[]; cupo: string; confirmacion: string };

/** Identificador nuevo para un bloque, distinto de los que ya hay. */
export function idBloqueNuevo(existentes: readonly string[], azar: () => number = Math.random): string {
    for (let i = 0; i < 20; i++) {
        const id = `b${Date.now().toString(36)}${Math.floor(azar() * 36 ** 3).toString(36).padStart(3, "0")}`;
        if (!existentes.includes(id)) return id;
    }
    return `b${existentes.length + 1}x${Math.floor(azar() * 1e6)}`;
}

/** Siguiente identificador de una serie («o3», «c2», «f5»…) que no choque con los existentes. */
export function siguienteId(prefijo: string, existentes: readonly string[]): string {
    let n = existentes.length + 1;
    while (existentes.includes(`${prefijo}${n}`)) n += 1;
    return `${prefijo}${n}`;
}

export function borradorNuevo(tipo: TipoBloqueProg, id: string): BorradorBloque {
    switch (tipo) {
        case "titulo":
            return { tipo, id, texto: "", nivel: 2 };
        case "texto":
            return { tipo, id, texto: "" };
        case "tareas":
            return { tipo, id, titulo: "Tareas", iniciales: "" };
        case "contador":
            return { tipo, id, titulo: "Contador", inicial: "0", paso: "1", min: "", max: "", unidad: "", modo: "libre", limite: "3" };
        case "encuesta":
            return {
                tipo,
                id,
                titulo: "Encuesta",
                pregunta: "",
                opciones: [
                    { id: "o1", texto: "" },
                    { id: "o2", texto: "" },
                ],
                maxElecciones: "1",
            };
        case "kanban":
            return {
                tipo,
                id,
                titulo: "Tablero",
                columnas: [
                    { id: "c1", texto: "Por hacer" },
                    { id: "c2", texto: "En curso" },
                    { id: "c3", texto: "Hecho" },
                ],
            };
        case "formulario":
            return {
                tipo,
                id,
                titulo: "Formulario",
                descripcion: "",
                campos: [{ id: "f1", etiqueta: "Nombre", tipo: "texto", obligatorio: true, opciones: "" }],
                cupo: "",
                confirmacion: "",
            };
    }
}

const texto = (n: number | null): string => (n === null ? "" : String(n));

export function borradorDeBloque(b: BloqueProg): BorradorBloque {
    switch (b.tipo) {
        case "titulo":
            return { tipo: "titulo", id: b.id, texto: b.texto, nivel: b.nivel };
        case "texto":
            return { tipo: "texto", id: b.id, texto: b.texto };
        case "tareas":
            return { tipo: "tareas", id: b.id, titulo: b.titulo, iniciales: "" };
        case "contador":
            return {
                tipo: "contador",
                id: b.id,
                titulo: b.titulo,
                inicial: String(b.inicial),
                paso: String(b.paso),
                min: texto(b.min),
                max: texto(b.max),
                unidad: b.unidad,
                modo: b.porPersona === null ? "libre" : b.porPersona === 1 ? "voto" : "limite",
                limite: b.porPersona !== null && b.porPersona > 1 ? String(b.porPersona) : "3",
            };
        case "encuesta":
            return {
                tipo: "encuesta",
                id: b.id,
                titulo: b.titulo,
                pregunta: b.pregunta,
                opciones: b.opciones.map((o) => ({ id: o.id, texto: o.texto })),
                maxElecciones: String(b.maxElecciones),
            };
        case "kanban":
            return { tipo: "kanban", id: b.id, titulo: b.titulo, columnas: b.columnas.map((c) => ({ id: c.id, texto: c.titulo })) };
        case "formulario":
            return {
                tipo: "formulario",
                id: b.id,
                titulo: b.titulo,
                descripcion: b.descripcion,
                campos: b.campos.map((c) => ({ id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: (c.opciones ?? []).join("\n") })),
                cupo: texto(b.cupo),
                confirmacion: b.confirmacion,
            };
    }
}

/** Número de un campo de texto: vacío = `vacio`; algo que no es número = NaN (el validador lo rechaza con motivo). */
function numero(v: string, vacio: number | null): number | null {
    const t = v.trim();
    if (t === "") return vacio;
    return Number(t.replace(",", "."));
}

/** El bloque CRUDO que sale del borrador (aún sin validar). */
export function bloqueDeBorrador(b: BorradorBloque): Record<string, unknown> {
    switch (b.tipo) {
        case "titulo":
            return { id: b.id, tipo: "titulo", texto: b.texto, nivel: b.nivel };
        case "texto":
            return { id: b.id, tipo: "texto", texto: b.texto };
        case "tareas":
            return {
                id: b.id,
                tipo: "tareas",
                titulo: b.titulo,
                iniciales: b.iniciales.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
            };
        case "contador":
            return {
                id: b.id,
                tipo: "contador",
                titulo: b.titulo,
                inicial: numero(b.inicial, 0),
                paso: numero(b.paso, 1),
                min: numero(b.min, null),
                max: numero(b.max, null),
                unidad: b.unidad,
                porPersona: b.modo === "libre" ? null : b.modo === "voto" ? 1 : numero(b.limite, 1),
            };
        case "encuesta":
            return {
                id: b.id,
                tipo: "encuesta",
                titulo: b.titulo,
                pregunta: b.pregunta,
                opciones: b.opciones.map((o) => ({ id: o.id, texto: o.texto })),
                maxElecciones: numero(b.maxElecciones, 1),
            };
        case "kanban":
            return { id: b.id, tipo: "kanban", titulo: b.titulo, columnas: b.columnas.map((c) => ({ id: c.id, titulo: c.texto })) };
        case "formulario":
            return {
                id: b.id,
                tipo: "formulario",
                titulo: b.titulo,
                descripcion: b.descripcion,
                campos: b.campos.map((c) => ({
                    id: c.id,
                    etiqueta: c.etiqueta,
                    tipo: c.tipo,
                    obligatorio: c.obligatorio,
                    ...(c.tipo === "opcion" ? { opciones: c.opciones.split("\n").map((l) => l.trim()).filter((l) => l.length > 0) } : {}),
                })),
                cupo: numero(b.cupo, null),
                confirmacion: b.confirmacion,
            };
    }
}
