/**
 * Grafo de orquestación (Ola 239 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Construye el grafo que une cómo se produce el desarrollo: cada ola contiene
 * sus tareas, las tareas dependen unas de otras, cada tarea la escribió un
 * modelo, la revisó un revisor y produjo un commit. Lo consume el panel de
 * mando (pestaña «Grafo») y `GET /api/mando/grafo`.
 *
 * Fuentes: reutiliza los lectores de `lector-local.ts` (`leerColas`,
 * `leerProgreso` y `leerRevisiones`) — jamás reimplementa la lectura del
 * disco. Cada función es TOLERANTE: si no hay olas, tareas, progreso o
 * revisiones, devuelve un grafo vacío (nunca lanza).
 *
 * ⚠️ Seguridad: solo se importa desde rutas de servidor y solo produce
 * etiquetas/identificadores de trabajo, nunca claves ni rutas absolutas del
 * disco del usuario.
 */

import {
    leerColas,
    leerProgreso,
    leerRevisiones,
} from "@/lib/mando/lector-local";
import type { AristaGrafo, GrafoOrquestacion, NodoGrafo } from "@/lib/mando/tipos";

/** Para que el grafo sea legible solo se dibujan las 12 olas más recientes. */
const LIMITE_OLAS = 12;

/** Convierte un valor en texto seguro (nunca `any`). */
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Lee un objeto plano de forma tolerante. */
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
}

/** Número de ola extraído de un identificador (o NaN si no es numérico). */
function numeroOla(etiqueta: string): number {
    const n = Number.parseInt(etiqueta.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Construye el grafo de orquestación completo. Tolerante: si las fuentes están
 * vacías devuelve un grafo vacío para que la API y el panel sigan funcionando.
 */
export async function construirGrafo(): Promise<GrafoOrquestacion> {
    const [tareas, progreso, revisiones] = await Promise.all([
        leerColas(),
        leerProgreso(),
        leerRevisiones(),
    ]);

    const nodos: NodoGrafo[] = [];
    const aristas: AristaGrafo[] = [];
    const nodosVistos = new Set<string>();
    const idTarea = new Set<string>();

    const añadirNodo = (nodo: NodoGrafo): void => {
        if (nodosVistos.has(nodo.id)) return;
        nodosVistos.add(nodo.id);
        nodos.push(nodo);
    };

    // Las olas, ordenadas numéricamente para quedarnos con las más recientes.
    const colas = [...new Set(tareas.map((t) => t.ola || t.id))].sort((a, b) => {
        const na = numeroOla(a);
        const nb = numeroOla(b);
        if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
        if (Number.isNaN(na)) return -1;
        if (Number.isNaN(nb)) return 1;
        return na - nb;
    });
    const colasRecientes = new Set(colas.slice(-LIMITE_OLAS));

    for (const cola of colasRecientes) {
        añadirNodo({ id: `ola:${cola}`, tipo: "ola", etiqueta: cola });
    }

    // Nodos tarea (solo de las olas recientes) + arista «contiene».
    for (const tarea of tareas) {
        if (!colasRecientes.has(tarea.ola || tarea.id)) continue;
        idTarea.add(tarea.id);
        const estado = texto(objeto(progreso[tarea.id]).estado);
        const nodo: NodoGrafo = {
            id: `tarea:${tarea.id}`,
            tipo: "tarea",
            etiqueta: tarea.titulo || tarea.id,
            ola: tarea.ola || tarea.id,
        };
        if (estado) nodo.estado = estado;
        añadirNodo(nodo);
        aristas.push({
            de: `ola:${tarea.ola || tarea.id}`,
            a: `tarea:${tarea.id}`,
            tipo: "contiene",
        });
    }

    // Dependencias, modelo que escribió y commit producido por cada tarea.
    for (const tarea of tareas) {
        if (!colasRecientes.has(tarea.ola || tarea.id)) continue;

        for (const dep of tarea.dependencias) {
            // Solo se enlazan dependencias cuya tarea exista en el grafo, para
            // no dejar aristas a nodos fuera de las 12 olas mostradas.
            if (idTarea.has(dep)) {
                aristas.push({ de: `tarea:${tarea.id}`, a: `tarea:${dep}`, tipo: "depende" });
            }
        }

        const datos = objeto(progreso[tarea.id]);

        // Modelo que escribió la tarea (uno por modelo distinto).
        const modelo = texto(datos.modelo);
        if (modelo) {
            añadirNodo({ id: `modelo:${modelo}`, tipo: "modelo", etiqueta: modelo });
            aristas.push({ de: `modelo:${modelo}`, a: `tarea:${tarea.id}`, tipo: "escribio" });
        }

        // Commit producido: el sha del campo «nota» con formato «<sha> · revisión ok».
        const nota = texto(datos.nota);
        const sha = /([0-9a-f]{7,40})\s*·/.exec(nota);
        if (sha) {
            añadirNodo({ id: `commit:${sha[1]}`, tipo: "commit", etiqueta: sha[1] });
            aristas.push({ de: `tarea:${tarea.id}`, a: `commit:${sha[1]}`, tipo: "produjo" });
        }
    }

    // Revisores de `olas/revisiones.md` con cabecera «**Revisión (proveedor/modelo)**».
    const listaRecientes = [...colasRecientes];
    const ultimaOla = listaRecientes[listaRecientes.length - 1] ?? null;
    for (const revision of revisiones) {
        const cabecera = /Revisión\s*\(([^)]+)\)/.exec(
            `${revision.titulo}\n${revision.markdown}`,
        );
        if (!cabecera) continue;
        const revisor = cabecera[1].trim();
        if (!revisor) continue;

        añadirNodo({ id: `revisor:${revisor}`, tipo: "revisor", etiqueta: revisor });

        // Cada revisión revisa una ola concreta: se busca su número en el
        // título/fecha de la sección y, si no se encuentra, se asocia a la ola
        // más reciente del grafo.
        const numOla = numeroOla(`${revision.titulo} ${revision.fecha}`);
        let objetivo = ultimaOla;
        if (!Number.isNaN(numOla)) {
            const candidata = [...colasRecientes].find((c) => numeroOla(c) === numOla);
            if (candidata) objetivo = candidata;
        }
        if (objetivo) {
            aristas.push({ de: `revisor:${revisor}`, a: `ola:${objetivo}`, tipo: "reviso" });
        }
    }

    return { nodos, aristas };
}