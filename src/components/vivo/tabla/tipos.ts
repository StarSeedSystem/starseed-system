/** Tipos y utilidades compartidas por los componentes de la tabla. */
import { Calendar, CheckSquare, Hash, Link2, Sigma, Tag, Type, User, type LucideIcon } from "lucide-react";
import type { CambioCelda } from "@/lib/vivo/tabla/operaciones";
import type { Columna, TipoColumna, TotalFn } from "@/lib/vivo/tabla/modelo";
import { TOTALES } from "@/lib/vivo/tabla/modelo";

export const ICONO_TIPO: Record<TipoColumna, LucideIcon> = {
    texto: Type,
    numero: Hash,
    fecha: Calendar,
    casilla: CheckSquare,
    seleccion: Tag,
    enlace: Link2,
    persona: User,
    calculado: Sigma,
};

/** Alto fijo de las filas de escritorio (permite pintar solo las visibles). */
export const ALTO_FILA = 40;
export const ALTO_CABECERA = 44;
export const ANCHO_CANAL = 56;

export interface DestinoPegado {
    filaIds: readonly string[];
    desdeFila: number;
    colIds: readonly string[];
    desdeCol: number;
}

export interface AccionesTabla {
    escribir(cambios: CambioCelda[]): void;
    escribirTexto(filaId: string, colId: string, texto: string): void;
    pegar(matriz: string[][], destino: DestinoPegado): number;
    limpiar(filaIds: readonly string[], colIds: readonly string[]): void;
    alternarCasilla(filaId: string, colId: string): void;
    crearOpcion(colId: string, nombre: string): string | null;
    anadirFila(donde?: { antesDe?: string; despuesDe?: string }): void;
    duplicarFila(filaId: string): void;
    borrarFilas(ids: readonly string[]): void;
    moverFila(filaId: string, haciaIndice: number): void;
    moverColumna(colId: string, haciaIndice: number): void;
    redimensionar(colId: string, ancho: number): void;
    abrirColumna(colId: string): void;
    ordenar(colId: string, dir: "asc" | "desc" | null): void;
    filtrarPor(colId: string): void;
    borrarColumna(colId: string): void;
    establecerTotal(colId: string, fn: TotalFn): void;
    deshacer(): void;
    rehacer(): void;
}

/** Los totales que tienen sentido para esta columna. */
export function totalesPara(col: Columna): readonly TotalFn[] {
    const t = col.tipo.v;
    if (t === "numero" || t === "calculado") return TOTALES;
    return ["ninguno", "contar"];
}

/** Lo que el editor de columna puede hacer (todo se guarda como cambios por registro). */
export interface AccionesColumna {
    renombrar(colId: string, nombre: string): void;
    cambiarTipo(colId: string, tipo: TipoColumna): void;
    establecerFormula(colId: string, almacenada: string): void;
    establecerTotal(colId: string, fn: TotalFn): void;
    redimensionar(colId: string, ancho: number): void;
    mover(colId: string, delta: -1 | 1): void;
    borrar(colId: string): void;
    anadirOpcion(colId: string, nombre: string): string | null;
    editarOpcion(colId: string, opcionId: string, cambio: { nombre?: string; color?: string }): void;
    quitarOpcion(colId: string, opcionId: string): void;
    moverOpcion(colId: string, opcionId: string, delta: -1 | 1): void;
}
