/**
 * Proyección de un programa en vivo a `UiSpec` (la interfaz-como-dato del núcleo, Ola 307).
 *
 * El vocabulario de `UiSpec` es PRESENTACIONAL —panel, rejilla, lista, texto…—: no tiene bloques
 * con estado ni acciones que cambien datos, y el OS aún no trae un renderizador general. Por eso
 * el programa en vivo tiene su propio vocabulario cerrado (`ProgramaSpec`) y su propio
 * renderizador seguro; esta función ofrece la FOTO del programa como `UiSpec` para poder
 * exportarla, revisarla o embeberla en cualquier superficie que ya entienda `UiSpec`.
 *
 * La foto solo lleva lo que ya es público del programa y NUNCA los datos personales de las
 * respuestas de un formulario (solo cuántas hay). Toda cadena pasa por la guarda anticódigo,
 * de modo que `validarUiSpec` siempre la acepta.
 */
import { pareceCodigo, type BloqueUi, type UiSpec } from "@/lib/nucleo/ui-spec";
import { columnasKanban, plazasLibres, resultadosEncuesta, totalContador } from "./derivados";
import { limpiarLinea, limpiarParrafo } from "./esquema";
import type { BloqueProg, EstadoPrograma } from "./tipos";

const OMITIDO = "[contenido omitido]";

function seguro(v: string, max = 600): string {
    const s = limpiarParrafo(v, max);
    return pareceCodigo(s) ? OMITIDO : s;
}

function seguroLinea(v: string, max = 200): string {
    const s = limpiarLinea(v, max);
    return pareceCodigo(s) ? OMITIDO : s;
}

function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

function bloqueAUi(b: BloqueProg, e: EstadoPrograma): BloqueUi | null {
    const datos = e.datos[b.id];
    switch (b.tipo) {
        case "titulo":
            return { tipo: "texto", id: b.id, props: { contenido: seguroLinea(b.texto), nivel: b.nivel } };
        case "texto":
            return { tipo: "texto", id: b.id, props: { contenido: seguro(b.texto, 2000) } };
        case "tareas": {
            const items = datos?.tipo === "tareas" ? datos.items : [];
            return {
                tipo: "panel",
                id: b.id,
                props: { titulo: seguroLinea(b.titulo), icono: "ListChecks" },
                hijos: [
                    {
                        tipo: "lista",
                        id: `${b.id}.lista`,
                        props: {
                            elementos: items.map((t) => `${t.hecha ? "[x]" : "[ ]"} ${seguroLinea(t.texto)}`),
                            vacio: "Sin tareas todavía.",
                        },
                    },
                ],
            };
        }
        case "contador": {
            const aportes = datos?.tipo === "contador" ? datos.aportes : {};
            const total = totalContador(b, aportes);
            const personas = Object.keys(aportes).length;
            return {
                tipo: "panel",
                id: b.id,
                props: { titulo: seguroLinea(b.titulo), icono: "Hash" },
                hijos: [
                    { tipo: "texto", id: `${b.id}.total`, props: { contenido: `${total}${b.unidad ? ` ${seguroLinea(b.unidad, 24)}` : ""}`, nivel: 2, enfasis: "fuerte" } },
                    { tipo: "texto", id: `${b.id}.personas`, props: { contenido: `${plural(personas, "persona ha aportado", "personas han aportado")}.`, tono: "suave" } },
                ],
            };
        }
        case "encuesta": {
            const votos = datos?.tipo === "encuesta" ? datos.votos : {};
            const r = resultadosEncuesta(b, votos, null);
            return {
                tipo: "panel",
                id: b.id,
                props: { titulo: seguroLinea(b.titulo), subtitulo: seguroLinea(b.pregunta, 160), icono: "ChartBar" },
                hijos: [
                    {
                        tipo: "lista",
                        id: `${b.id}.resultados`,
                        props: { elementos: r.opciones.map((o) => `${seguroLinea(o.texto)}: ${plural(o.votos, "voto", "votos")} (${o.porcentaje} %)`) },
                    },
                    { tipo: "texto", id: `${b.id}.votantes`, props: { contenido: `${plural(r.votantes, "persona ha votado", "personas han votado")}.`, tono: "suave" } },
                ],
            };
        }
        case "kanban": {
            const tarjetas = datos?.tipo === "kanban" ? datos.tarjetas : [];
            const columnas = columnasKanban(b, tarjetas);
            return {
                tipo: "panel",
                id: b.id,
                props: { titulo: seguroLinea(b.titulo), icono: "Kanban" },
                hijos: [
                    {
                        tipo: "rejilla",
                        id: `${b.id}.columnas`,
                        props: { columnas: Math.max(1, Math.min(columnas.length, 4)) },
                        hijos: columnas.map((c) => ({
                            tipo: "lista" as const,
                            id: `${b.id}.tar.${c.id}`,
                            props: { titulo: `${seguroLinea(c.titulo)} (${c.tarjetas.length})`, elementos: c.tarjetas.map((t) => seguroLinea(t.texto)), vacio: "Vacía." },
                        })),
                    },
                ],
            };
        }
        case "formulario": {
            const respuestas = datos?.tipo === "formulario" ? datos.respuestas : [];
            const libres = plazasLibres(b, respuestas);
            const cerrado = datos?.tipo === "formulario" && datos.cerrado;
            const resumen = `${plural(respuestas.length, "respuesta", "respuestas")}${libres === null ? "" : ` · ${plural(libres, "plaza libre", "plazas libres")}`}${cerrado ? " · cerrado" : ""}.`;
            return {
                tipo: "panel",
                id: b.id,
                props: { titulo: seguroLinea(b.titulo), subtitulo: seguroLinea(b.descripcion, 240), icono: "ClipboardList" },
                hijos: [
                    { tipo: "lista", id: `${b.id}.campos`, props: { titulo: "Campos", elementos: b.campos.map((c) => `${seguroLinea(c.etiqueta)}${c.obligatorio ? " *" : ""}`) } },
                    { tipo: "texto", id: `${b.id}.resumen`, props: { contenido: resumen, tono: "suave" } },
                ],
            };
        }
    }
}

/** Foto del programa como `UiSpec` (sin datos personales de formularios). */
export function programaAUiSpec(estado: EstadoPrograma, opciones: { id?: string } = {}): UiSpec {
    const id = (opciones.id ?? "").replace(/[^a-z0-9._:-]/gi, "-").slice(0, 100) || "sin-id";
    const bloques: BloqueUi[] = [];
    for (const b of estado.bloques) {
        const u = bloqueAUi(b, estado);
        if (u) bloques.push(u);
    }
    return {
        version: 1,
        superficie: `programa/${id}`,
        titulo: seguroLinea(estado.titulo, 120) || "Programa",
        bloques,
        meta: { origen: "programa-en-vivo", ...(estado.descripcion ? { descripcion: seguro(estado.descripcion, 400) } : {}) },
    };
}
