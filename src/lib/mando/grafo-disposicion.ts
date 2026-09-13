/**
 * Disposición del grafo de orquestación (Ola 239 · MD7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (sin disco, red ni DOM) que calcula cómo se dibuja el grafo del
 * Mando: columnas fijas —olas a la izquierda, luego tareas, modelos, revisores
 * y commits a la derecha—, filas repartidas por columna y aristas como curvas
 * bezier. Lo consume `panel-grafo.tsx`; no sabe nada de React.
 */

import type {
    AristaGrafo,
    GrafoOrquestacion,
    NodoGrafo,
} from "@/lib/mando/tipos";

export const ANCHO_COLUMNA = 210;
export const MARGEN_X = 56;
export const ALTO_MINIMO = 380;
export const ALTO_POR_NODO = 58;

export const ORDEN_COLUMNAS: NodoGrafo["tipo"][] = [
    "ola",
    "tarea",
    "modelo",
    "revisor",
    "commit",
];

export interface PosicionNodo {
    x: number;
    y: number;
}

export interface ColumnaDisposicion {
    tipo: NodoGrafo["tipo"];
    ids: string[];
}

export interface DisposicionGrafo {
    ancho: number;
    alto: number;
    posiciones: Record<string, PosicionNodo>;
    columnas: ColumnaDisposicion[];
    aristas: AristaGrafo[];
    nodos: NodoGrafo[];
}

/** Color por tipo de arista: contiene gris · depende ámbar · escribio azul · reviso violeta · produjo verde. */
export function colorArista(tipo: AristaGrafo["tipo"]): string {
    switch (tipo) {
        case "contiene":
            return "#a1a1aa";
        case "depende":
            return "#fbbf24";
        case "escribio":
            return "#60a5fa";
        case "reviso":
            return "#c084fc";
        case "produjo":
            return "#34d399";
        default:
            return "#71717a";
    }
}

/** Relleno del nodo tarea según su estado (commit verde · sin_cambios gris · fallo/conflicto rojo · en curso azul). */
export function tonoNodoTarea(estado: string | undefined): string {
    if (estado === "commit") return "#34d399";
    if (estado === "sin_cambios" || estado === "sustituida") return "#a1a1aa";
    if (
        (estado ?? "").startsWith("fallo") ||
        estado === "conflicto" ||
        estado === "bloqueada"
    ) {
        return "#f87171";
    }
    if ((estado ?? "").startsWith("en_curso") || estado === "esperando_aprobacion") {
        return "#60a5fa";
    }
    return "#52525b";
}

/** Estado tal cual, con guiones bajos cambiados por espacios. */
export function etiquetaEstado(estado: string): string {
    return estado.replace(/_/g, " ");
}

/** Las olas presentes en el grafo, en el orden en que aparecen como nodos. */
export function olasDelGrafo(nodos: NodoGrafo[]): string[] {
    return nodos.filter((n) => n.tipo === "ola").map((n) => n.etiqueta);
}

/**
 * Nodos que se dibujan: con filtro de ola, los nodos de esa ola y los
 * modelo/revisor/commit que siguen conectados a tareas suyas.
 */
export function nodosVisibles(
    grafo: GrafoOrquestacion,
    filtroOla: string | null,
): Set<string> {
    if (!filtroOla) return new Set(grafo.nodos.map((n) => n.id));

    const visibles = new Set<string>();
    const porId = new Map(grafo.nodos.map((n) => [n.id, n]));
    for (const nodo of grafo.nodos) {
        if (nodo.tipo === "ola" && nodo.id === `ola:${filtroOla}`) {
            visibles.add(nodo.id);
        } else if (nodo.tipo === "tarea" && nodo.ola === filtroOla) {
            visibles.add(nodo.id);
        }
    }

    // Propagación: modelo→tarea, tarea→commit y revisor→ola visibles.
    let creció = true;
    while (creció) {
        creció = false;
        for (const arista of grafo.aristas) {
            const de = porId.get(arista.de);
            const a = porId.get(arista.a);
            if (!de || !a) continue;
            if (de.tipo === "tarea" && visibles.has(de.id)) {
                if (a.tipo === "modelo" || a.tipo === "commit") {
                    if (!visibles.has(a.id)) {
                        visibles.add(a.id);
                        creció = true;
                    }
                }
            }
            if (a.tipo === "tarea" && de.tipo === "modelo" && visibles.has(a.id)) {
                if (!visibles.has(de.id)) {
                    visibles.add(de.id);
                    creció = true;
                }
            }
            if (a.tipo === "ola" && de.tipo === "revisor" && visibles.has(a.id)) {
                if (!visibles.has(de.id)) {
                    visibles.add(de.id);
                    creció = true;
                }
            }
        }
    }
    return visibles;
}

/** Curva bezier horizontal entre dos puntos. */
export function rutaBezier(de: PosicionNodo, a: PosicionNodo): string {
    const dx = (a.x - de.x) / 2;
    return `M ${de.x} ${de.y} C ${de.x + dx} ${de.y}, ${a.x - dx} ${a.y}, ${a.x} ${a.y}`;
}

/**
 * Disposición por columnas fijas: olas a la izquierda, luego tareas, modelos,
 * revisores y commits. Las filas se reparten a lo alto de cada columna y las
 * aristas quedan recortadas a los nodos visibles.
 */
export function disponerGrafo(
    grafo: GrafoOrquestacion,
    filtroOla: string | null,
): DisposicionGrafo {
    const visibles = nodosVisibles(grafo, filtroOla);
    const nodos = grafo.nodos.filter((n) => visibles.has(n.id));
    const aristas = grafo.aristas.filter(
        (a) => visibles.has(a.de) && visibles.has(a.a),
    );

    // Columnas en orden fijo; solo se crean las que tienen nodos.
    const columnas: ColumnaDisposicion[] = [];
    for (const tipo of ORDEN_COLUMNAS) {
        const ids = nodos.filter((n) => n.tipo === tipo).map((n) => n.id);
        if (ids.length > 0) columnas.push({ tipo, ids });
    }

    const alto = Math.max(
        ALTO_MINIMO,
        ...columnas.map((c) => c.ids.length * ALTO_POR_NODO + 40),
    );

    // Filas repartidas por columna a lo alto total.
    const posiciones: Record<string, PosicionNodo> = {};
    columnas.forEach((columna, índice) => {
        const x = MARGEN_X + índice * ANCHO_COLUMNA;
        const paso = alto / columna.ids.length;
        columna.ids.forEach((id, fila) => {
            posiciones[id] = { x, y: paso * fila + paso / 2 };
        });
    });

    const ancho = MARGEN_X * 2 + Math.max(columnas.length - 1, 0) * ANCHO_COLUMNA;
    return { ancho, alto, posiciones, columnas, aristas, nodos };
}
