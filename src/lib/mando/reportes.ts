// src/lib/mando/reportes.ts
// -----------------------------------------------------------------------------
// Bandeja curada de Reportes del Puente de Mando (Ola p323A).
//
// No es otro chat de eventos crudos (eso ya lo hace `chat-orquestacion.tsx`):
// aquí cada entrada EXPLICA qué pasó, por qué importa y cómo comprobarlo, con
// enlaces al cambio y modo de probarlo. Es un módulo PURO — sin fetch, sin fs,
// sin `Date.now()` escondido: la hora entra por parámetro — para poder testear
// toda la lógica (clasificación, relevancia, orden y filtros) sin red ni disco.
// -----------------------------------------------------------------------------

import type { EventoRelevo } from "@/lib/mando/tipos";

/** Clase de un reporte: qué tipo de hecho cuenta. */
export type ClaseReporte =
    | "ola-cerrada"
    | "ola-nueva"
    | "cambio"
    | "sugerencia"
    | "nota"
    | "aviso"
    | "espera";

/** Importancia del HECHO en sí (no de este momento: eso es la relevancia). */
export type Importancia = "critica" | "alta" | "normal" | "baja";

/** Enlace a un cambio: diff remoto, ruta local para probarlo o archivo. */
export interface EnlaceReporte {
    clase: "diff" | "local" | "archivo";
    texto: string;
    url: string;
}

/** Cómo comprobar un reporte: código ejecutable o captura de localhost. */
export interface PruebaReporte {
    clase: "codigo" | "captura";
    lenguaje?: string;
    texto?: string;
    ruta?: string;
    pie: string;
}

/** Un reporte curado: el qué, el porqué y el cómo comprobarlo. */
export interface Reporte {
    id: string;
    t: string;
    clase: ClaseReporte;
    importancia: Importancia;
    /** Relevancia de ESTE momento (0-100): ya con la antigüedad descontada. */
    relevancia: number;
    titulo: string;
    contexto: string;
    ola?: string;
    tarea?: string;
    quien?: string;
    enlaces: EnlaceReporte[];
    pruebas: PruebaReporte[];
}

/** Datos auxiliares para decidir la importancia de un hecho. */
export interface DatosImportancia {
    /** En 'aviso': true si bloquea a otras tareas. */
    bloqueante?: boolean;
    /** En 'ola-cerrada': cuántas tareas de la ola fallaron. */
    fallidas?: number;
    /** En 'sugerencia': true si la lanza un director. */
    esDirector?: boolean;
}

/** Un commit a convertir en reporte 'cambio'. */
export interface CommitEntrada {
    sha: string;
    asunto: string;
    cuerpo?: string | null;
    fecha: string;
    archivos: string[];
}

/** Una tarea en curso que puede estar esperando a una persona. */
export interface ProgresoEntrada {
    id?: string;
    tarea?: string;
    estado: string;
    ola?: string;
    texto?: string;
}

/** Una cola publicada por el enjambre (aporta contexto a 'ola-nueva'). */
export interface ColaEntrada {
    id?: string;
    titulo?: string;
    partes?: number;
    t?: string;
}

/** Entradas que `construirReportes` ingiere para armar la bandeja. */
export interface DatosConstruccion {
    eventos: EventoRelevo[];
    progreso: ProgresoEntrada[];
    commits: CommitEntrada[];
    colas: ColaEntrada[];
    /** Momento de referencia (ms). Todo el cálculo de antigüedad parte de aquí. */
    ahora: number;
    /** Origen de los enlaces 'diff' (p. ej. la web pública del repo). */
    baseRemota: string;
    /** Origen de los enlaces 'local' (p. ej. http://localhost:9002). */
    baseLocal: string;
}

/** Filtros opcionales de `filtrar`. */
export interface FiltroReporte {
    clases?: ClaseReporte[];
    importanciaMinima?: Importancia;
    relevanciaMinima?: number;
    ola?: string;
    texto?: string;
}

/** Importancia según la clase y los datos del hecho. */
export function importanciaDe(clase: ClaseReporte, datos?: DatosImportancia): Importancia {
    switch (clase) {
        // Una 'espera' es critica porque algo se detiene hasta que una PERSONA actúa.
        case "espera":
            return "critica";
        // Un 'aviso' solo corta la bandeja si bloquea a otras tareas.
        case "aviso":
            return datos?.bloqueante ? "critica" : "alta";
        // Una ola con fallidas pide revisión; sin fallidas es rutina.
        case "ola-cerrada":
            return datos?.fallidas && datos.fallidas > 0 ? "alta" : "normal";
        // Que lo diga un director le da peso; una nota al aire, no.
        case "sugerencia":
            return datos?.esDirector ? "alta" : "normal";
        case "cambio":
        case "ola-nueva":
            return "normal";
        case "nota":
            return "baja";
    }
}

/**
 * Relevancia 0-100 de un reporte en ESTE momento (no es lo mismo que su importancia:
 * la importancia es del hecho; la relevancia decide qué ve Alex primero AHORA).
 * Fórmula completa, para poder discutirla sin leer la UI:
 *   + base por importancia: critica 60 · alta 45 · normal 25 · baja 10
 *   + 20 si pide una decisión suya (clase 'espera' o 'sugerencia')
 *   + 15 si trae pruebas (código ejecutable o captura)
 *   + 10 si trae enlace local para probarlo en localhost
 *   − 1 por cada hora cumplida de antigüedad (cuentan horas enteras)
 *   con suelo 0 y techo 100.
 */
export function puntuarRelevancia(r: Reporte, ahora: number): number {
    const base = { critica: 60, alta: 45, normal: 25, baja: 10 }[r.importancia];
    let puntos = base;
    if (r.clase === "espera" || r.clase === "sugerencia") puntos += 20;
    if (r.pruebas.length > 0) puntos += 15;
    if (r.enlaces.some((e) => e.clase === "local")) puntos += 10;
    // Sin fecha válida no hay descuento: mejor mostrarlo que esconderlo.
    const nacimiento = new Date(r.t).getTime();
    if (!Number.isFinite(nacimiento)) return Math.max(0, Math.min(100, puntos));
    const horas = Math.max(0, Math.floor((ahora - nacimiento) / 3_600_000));
    puntos -= horas;
    return Math.max(0, Math.min(100, puntos));
}

/**
 * Deduce la ruta de Next.js que sirve una página: quita `src/app`, los grupos
 * de rutas `(grupo)` y el `/page.tsx` final. Devuelve null si no es una página.
 * Es el puente entre «commit que toca src/app/…» y «pruébalo en localhost:…».
 */
export function rutaLocalDe(archivo: string): string | null {
    if (!archivo.startsWith("src/app/")) return null;
    if (!archivo.endsWith("/page.tsx")) return null;
    let ruta = archivo.slice("src/app".length, -"/page.tsx".length);
    ruta = ruta.replace(/\(\w[\w-]*\)/g, ""); // grupos de ruta, p. ej. (app)
    ruta = ruta.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return ruta === "" ? "/" : ruta;
}

/**
 * Agrupa los archivos por carpeta y los cuenta en prosa («5 archivos en
 * src/lib/mando y 2 en src/app»), para que el contexto de un commit se lea
 * de un vistazo en vez de ser una lista cruda de rutas.
 */
function archivosEnProsa(archivos: string[]): string {
    const porCarpeta = new Map<string, number>();
    for (const a of archivos) {
        const corte = a.lastIndexOf("/");
        const carpeta = corte > 0 ? a.slice(0, corte) : ".";
        porCarpeta.set(carpeta, (porCarpeta.get(carpeta) ?? 0) + 1);
    }
    const partes = [...porCarpeta.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([carpeta, n]) => `${n} ${n === 1 ? "archivo" : "archivos"} en ${carpeta}`);
    return partes.join(", ");
}

/** Clase de un evento de la bitácora según su semántica. */
function claseDeEvento(e: EventoRelevo): ClaseReporte {
    if (e.tipo === "cola_terminada") return "ola-cerrada";
    if (e.tipo === "inicio" && /^cola/i.test(e.texto ?? "")) return "ola-nueva";
    if (e.quien?.startsWith("director")) return "sugerencia";
    if (e.tipo === "aviso" || e.tipo === "error" || e.tipo === "bloqueo") return "aviso";
    return "nota";
}

/** Construye la bandeja ordenada desde los distintos orígenes. */
export function construirReportes(d: DatosConstruccion): Reporte[] {
    const reportes: Reporte[] = [];

    // Cada commit integrado es un 'cambio' que cuenta qué se movió y cómo verlo.
    for (const c of d.commits) {
        const enlaces: EnlaceReporte[] = [
            { clase: "diff", texto: `Diff ${c.sha.slice(0, 7)}`, url: `${d.baseRemota}/commit/${c.sha}` },
        ];
        // Si el commit toca una página de Next, Alex puede probarlo en local al instante.
        for (const a of c.archivos) {
            const ruta = rutaLocalDe(a);
            if (ruta) {
                enlaces.push({ clase: "local", texto: `Probar ${ruta}`, url: `${d.baseLocal}${ruta}` });
                break;
            }
        }
        const base = c.cuerpo?.trim() ? c.cuerpo.trim() : c.asunto;
        const contexto = c.archivos.length > 0
            ? `${base}. Toca ${archivosEnProsa(c.archivos)}.`
            : base;
        const r: Reporte = {
            id: `cambio:${c.sha}`,
            t: c.fecha,
            clase: "cambio",
            importancia: importanciaDe("cambio"),
            relevancia: 0,
            titulo: c.asunto,
            contexto,
            enlaces,
            pruebas: [],
        };
        r.relevancia = puntuarRelevancia(r, d.ahora);
        reportes.push(r);
    }

    // Eventos de la bitácora: se clasifican por semántica, no por orden.
    for (const e of d.eventos) {
        const clase = claseDeEvento(e);
        const bloqueante = e.tipo === "bloqueo";
        const r: Reporte = {
            id: `${clase}:${e.tarea || "sin-tarea"}:${e.t}`,
            t: e.t,
            clase,
            importancia: importanciaDe(clase, {
                bloqueante,
                esDirector: e.quien?.startsWith("director") ?? false,
            }),
            relevancia: 0,
            titulo: e.texto?.slice(0, 90) || e.tipo,
            contexto: e.texto || "",
            tarea: e.tarea || undefined,
            quien: e.quien || undefined,
            enlaces: [],
            pruebas: [],
        };
        r.relevancia = puntuarRelevancia(r, d.ahora);
        reportes.push(r);
    }

    // Tareas detenidas hasta que una persona decida: la parte más urgente de la bandeja.
    for (const p of d.progreso) {
        if (p.estado !== "esperando_aprobacion" && p.estado !== "bloqueante") continue;
        const tarea = p.tarea || p.id || "";
        const r: Reporte = {
            id: `espera:${tarea}:${p.ola || ""}`,
            t: d.ahora > 0 ? new Date(d.ahora).toISOString() : "",
            clase: "espera",
            importancia: importanciaDe("espera"),
            relevancia: 0,
            titulo: p.texto?.slice(0, 90) || `${tarea} espera aprobación`,
            contexto: p.texto || `La tarea ${tarea} está ${p.estado.replace(/_/g, " ")} y necesita una decisión.`,
            ola: p.ola || undefined,
            tarea: tarea || undefined,
            enlaces: [],
            pruebas: [],
        };
        r.relevancia = puntuarRelevancia(r, d.ahora);
        reportes.push(r);
    }

    // Relevancia primero; a igualdad, lo más reciente arriba.
    reportes.sort((a, b) => b.relevancia - a.relevancia || b.t.localeCompare(a.t));
    return reportes;
}

/** Filtra una bandeja por clase, importancia, relevancia, ola o texto libre. */
export function filtrar(reportes: Reporte[], f: FiltroReporte): Reporte[] {
    return reportes.filter((r) => {
        if (f.clases && f.clases.length > 0 && !f.clases.includes(r.clase)) return false;
        if (f.importanciaMinima && f.importanciaMinima !== r.importancia) {
            const orden: Importancia[] = ["baja", "normal", "alta", "critica"];
            if (orden.indexOf(r.importancia) < orden.indexOf(f.importanciaMinima)) return false;
        }
        if (f.relevanciaMinima != null && r.relevancia < f.relevanciaMinima) return false;
        if (f.ola && r.ola !== f.ola) return false;
        if (f.texto) {
            const texto = f.texto.toLowerCase();
            const hayo = `${r.titulo} ${r.contexto}`.toLowerCase();
            if (!hayo.includes(texto)) return false;
        }
        return true;
    });
}