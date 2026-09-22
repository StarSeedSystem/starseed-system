/**
 * Lógica pura del Reintento Inteligente (Ola 341 · Mando · Tarea RI1)
 * Extrae objeciones del revisor, clasifica tareas para reintento/descarte/espera
 * y genera tareas reencoladas con objeciones dentro del prompt.
 */

export interface TareaAnalizar {
    id: string;
    ola?: string;
    titulo?: string;
    archivos?: string[];
    prompt?: string;
    depende?: string[];
    estado?: string;
    nota?: string;
    motivo?: string;
    modelo?: string;
    [key: string]: unknown;
}

export interface ClasificacionResultado {
    accion: "reintentar" | "descartar" | "esperar";
    motivo: string;
}

export interface TareaReencolada extends TareaAnalizar {
    id: string;
    prompt: string;
    archivos: string[];
    depende: string[];
}

interface SeccionRevision {
    encabezado: string;
    lineas: string[];
    texto: string;
}

function partirSeccionesMd(md: string): SeccionRevision[] {
    if (!md || !md.trim()) return [];
    const lineas = md.split("\n");
    const secciones: SeccionRevision[] = [];
    let actualLineas: string[] = [];

    for (const linea of lineas) {
        if (/^#{1,3}\s+/.test(linea.trim())) {
            if (actualLineas.length > 0) {
                secciones.push({
                    encabezado: actualLineas[0] ?? "",
                    lineas: actualLineas,
                    texto: actualLineas.join("\n"),
                });
            }
            actualLineas = [linea];
        } else {
            actualLineas.push(linea);
        }
    }
    if (actualLineas.length > 0) {
        secciones.push({
            encabezado: actualLineas[0] ?? "",
            lineas: actualLineas,
            texto: actualLineas.join("\n"),
        });
    }
    return secciones;
}

export function objecionDe(revisionesMd: string, id: string): string | null {
    if (!revisionesMd || !id) return null;
    const secciones = partirSeccionesMd(revisionesMd);

    const patronId = new RegExp(`(?:[·\\s]|^)${id}(?:[:·\\s]|$)`, "i");
    const seccionesCoincidentes = secciones.filter((s) => patronId.test(s.encabezado));
    if (seccionesCoincidentes.length === 0) return null;

    const ultimaSeccion = seccionesCoincidentes[seccionesCoincidentes.length - 1];

    const coincideSeguimiento = /Seguimiento[:：]\s*(.*)/i.exec(ultimaSeccion.texto);
    if (!coincideSeguimiento) return null;

    let textoSeguimiento = coincideSeguimiento[1].trim();
    textoSeguimiento = textoSeguimiento.replace(/^[\*\s«"]+|[\*\s»"]+$/g, "").trim();

    if (!/bloqueante/i.test(textoSeguimiento)) return null;

    const seguimientoLimpio = `Seguimiento: ${textoSeguimiento}`;

    const riesgos: string[] = [];
    let enRiesgos = false;

    for (const linea of ultimaSeccion.lineas) {
        const lineaLimpia = linea.trim();
        if (/Riesgos reales/i.test(lineaLimpia)) {
            enRiesgos = true;
            continue;
        }
        if (enRiesgos) {
            if (/^(?:\*\*|#{1,3}\s+|Probar a mano|Seguimiento[:：])/i.test(lineaLimpia) && riesgos.length > 0) {
                enRiesgos = false;
                continue;
            }
            if (/^\d+[\.\)]\s+/.test(lineaLimpia)) {
                riesgos.push(lineaLimpia);
            }
        }
    }

    if (riesgos.length > 0) {
        return `${seguimientoLimpio}\n\nRiesgos reales:\n${riesgos.join("\n")}`;
    }

    return seguimientoLimpio;
}

export function extraerIdsProgreso(progreso: unknown): string[] {
    if (!progreso) return [];
    if (Array.isArray(progreso)) {
        return progreso
            .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "id" in item && typeof item.id === "string") {
                    return item.id;
                }
                return "";
            })
            .filter(Boolean);
    }
    if (typeof progreso === "object") {
        return Object.keys(progreso);
    }
    return [];
}

export function obtenerBaseId(id: string): string {
    if (!id) return "";
    const coincide = /^([A-Za-z0-9]+?)[a-z]{1,2}$/.exec(id);
    if (coincide && coincide[1] && /[A-Z0-9]$/.test(coincide[1])) {
        return coincide[1];
    }
    return id;
}

/**
 * Estados en los que la tarea no llegó a terminar por sí misma. Un `rechazada` NO está:
 * ahí alguien miró el trabajo y dijo que no, que es otra cosa.
 */
const ESTADOS_DE_FALLO = new Set([
    "fallo",
    "fallo_tsc",
    "fallo_tests",
    "fallo_motor",
    "interrumpida",
    "conflicto",
    "sin_cambios",
]);

/**
 * Huellas de que quien falló fue el MEDIO —la pasarela, el modelo, la red, la máquina— y
 * no lo que pedía la tarea. Están en minúsculas porque la nota se compara en minúsculas.
 */
const HUELLAS_DEL_MEDIO: [string, string][] = [
    ["ningún proveedor respondió", "ningún proveedor respondió"],
    ["ningun proveedor respondio", "ningún proveedor respondió"],
    ["does not exist", "el modelo ya no existe en la pasarela"],
    ["ningún modelo", "sin modelo disponible"],
    ["ningun modelo", "sin modelo disponible"],
    ["red caída", "se cayó la red"],
    ["red caida", "se cayó la red"],
    ["network", "problema de red"],
    ["connection", "problema de conexión"],
    ["timeout", "se agotó el tiempo de espera"],
    ["se colgó", "el modelo se colgó"],
    ["se colgo", "el modelo se colgó"],
    ["sin respuesta", "el proveedor no contestó"],
    ["usage limit", "tope de uso del proveedor"],
    ["sin cupo", "proveedor sin cupo"],
    ["429", "el proveedor devolvió 429"],
    ["402", "el proveedor devolvió 402"],
    ["500", "el proveedor devolvió 500"],
    ["503", "el proveedor devolvió 503"],
];

/** PURA: ¿la tarea murió por culpa del medio y no de lo que pedía? */
export function esFalloDelMedio(estado: string, nota: string): boolean {
    if (!ESTADOS_DE_FALLO.has(String(estado || "").toLowerCase())) return false;
    const n = String(nota || "").toLowerCase();
    return HUELLAS_DEL_MEDIO.some(([huella]) => n.includes(huella));
}

/** PURA: la causa en castellano, para que el veredicto diga POR QUÉ vuelve a la cola. */
export function causaDelMedio(nota: string): string {
    const n = String(nota || "").toLowerCase();
    for (const [huella, explicacion] of HUELLAS_DEL_MEDIO) {
        if (n.includes(huella)) return explicacion;
    }
    return "falló el medio";
}

export function clasificar(
    tarea: TareaAnalizar,
    progreso: unknown,
    revisionesMd: string
): ClasificacionResultado {
    const estado = (tarea.estado ?? "").toLowerCase();
    const nota = (tarea.nota ?? tarea.motivo ?? "").toLowerCase();

    // Regla 6: «sustituida», «reasignada» → descartar
    if (estado === "sustituida" || estado === "reasignada") {
        return { accion: "descartar", motivo: "ya vive con otro id" };
    }

    // Regla 3: bloqueada por dependencia
    if (
        estado === "bloqueada" ||
        nota.startsWith("dependencia no integrada") ||
        nota.startsWith("esperando a que se integre")
    ) {
        return { accion: "esperar", motivo: "esperando a que se integre la dependencia" };
    }

    // Regla 2: la causa fue del MEDIO, no de la tarea.
    //
    // (2026-09-22) Esta regla existía solo para `sin_cambios` y con cinco patrones, y por
    // eso el enjambre «no se autocorregía». Medido en la ola viva: RM3 murió con «ningún
    // proveedor respondió (does not exist)» —un id de modelo que ya no existe— y el
    // veredicto fue «descartar: sin acción requerida», porque `fallo` no entraba en
    // ninguna rama. p316Ic murió con «red caída» y acabó en «tres intentos: necesita una
    // persona». Ninguna de las dos tenía nada que ver con la tarea: eran el medio.
    //
    // Ahora cubre todos los estados de fallo y va ANTES del recuento de intentos, que es
    // lo que de verdad lo arregla: un corte de red no debe gastar uno de los tres intentos
    // que separan a una tarea de necesitar a una persona.
    if (esFalloDelMedio(estado, nota)) {
        return { accion: "reintentar", motivo: "no era la tarea, era el medio: " + causaDelMedio(nota) };
    }

    // Conteo de intentos del mismo id
    const idsProgreso = extraerIdsProgreso(progreso);
    const baseId = obtenerBaseId(tarea.id);
    const coincidenciaIds = new Set(
        idsProgreso.filter((id) => obtenerBaseId(id) === baseId || id.startsWith(baseId))
    );
    coincidenciaIds.add(tarea.id);

    // Regla 4: más de 3 intentos previos (>= 3 acumulados)
    if (coincidenciaIds.size >= 3) {
        return { accion: "descartar", motivo: "tres intentos: necesita una persona" };
    }

    // Regla 1 y 5: rechazada / bloqueante / fallo_tests
    const esRechazo = ["rechazada", "bloqueante", "fallo_tests"].includes(estado);
    if (esRechazo) {
        const objecion = objecionDe(revisionesMd, tarea.id) ?? objecionDe(revisionesMd, baseId);
        if (objecion) {
            const primeraLinea = objecion.split("\n")[0] ?? objecion;
            return { accion: "reintentar", motivo: primeraLinea };
        }
        return { accion: "descartar", motivo: "rechazo sin razón escrita: no hay cambio que hacer" };
    }

    return { accion: "descartar", motivo: "sin acción requerida" };
}

export function reencolar(
    tarea: TareaAnalizar,
    objecion: string,
    progreso: unknown
): TareaReencolada {
    const baseId = obtenerBaseId(tarea.id);
    const idsExistentes = new Set(extraerIdsProgreso(progreso));
    idsExistentes.add(tarea.id);

    const sufijos = "bcdefghijklmnopqrstuvwxyz".split("");
    let sufijoElegido = "b";

    for (const suf of sufijos) {
        const candidato = `${baseId}${suf}`;
        if (!idsExistentes.has(candidato)) {
            sufijoElegido = suf;
            break;
        }
    }

    const nuevoId = `${baseId}${sufijoElegido}`;
    const promptOriginal = tarea.prompt ?? "";
    const promptNuevo = `${promptOriginal}\n\nPOR QUÉ VUELVE: el intento anterior fue rechazado. Objeción literal del revisor:\n${objecion}\nAtiéndela punto por punto; si algún punto no aplica, di por qué en el commit.`;

    return {
        ...tarea,
        id: nuevoId,
        ola: tarea.ola ?? "",
        titulo: tarea.titulo ?? "",
        archivos: Array.isArray(tarea.archivos) ? [...tarea.archivos] : [],
        depende: Array.isArray(tarea.depende) ? [...tarea.depende] : [],
        prompt: promptNuevo,
    };
}

export interface EjecucionReintentoParams {
    ids?: string[];
    progreso: unknown;
    revisionesMd: string;
    colasTareas?: TareaAnalizar[];
}

export interface EjecucionReintentoResultado {
    reintentadas: string[];
    descartadas: Array<{ id: string; motivo: string }>;
    esperando: Array<{ id: string; motivo: string }>;
    reencoladas: TareaReencolada[];
}

export function obtenerTareaAnalizar(
    id: string,
    progreso: unknown,
    colasTareas?: TareaAnalizar[]
): TareaAnalizar {
    const enCola = colasTareas?.find((t) => t.id === id);
    let enProgreso: Partial<TareaAnalizar> = {};
    if (progreso && typeof progreso === "object") {
        if (Array.isArray(progreso)) {
            const hallada = progreso.find(
                (item) => item && typeof item === "object" && "id" in item && (item as { id?: string }).id === id
            );
            if (hallada) enProgreso = hallada as Partial<TareaAnalizar>;
        } else {
            const hallada = (progreso as Record<string, Partial<TareaAnalizar>>)[id];
            if (hallada && typeof hallada === "object") enProgreso = hallada;
        }
    }
    return {
        id,
        ola: (enProgreso.ola as string) ?? enCola?.ola ?? "",
        titulo: (enProgreso.titulo as string) ?? enCola?.titulo ?? "",
        archivos: Array.isArray(enProgreso.archivos) ? enProgreso.archivos : enCola?.archivos ?? [],
        prompt: (enProgreso.prompt as string) ?? enCola?.prompt ?? "",
        depende: Array.isArray(enProgreso.depende) ? enProgreso.depende : enCola?.depende ?? [],
        estado: (enProgreso.estado as string) ?? enCola?.estado ?? "",
        nota: (enProgreso.nota as string) ?? enCola?.nota ?? "",
        motivo: (enProgreso.motivo as string) ?? enCola?.motivo ?? "",
        modelo: (enProgreso.modelo as string) ?? enCola?.modelo ?? "",
    };
}

export function obtenerIdsElegibles(progreso: unknown, colasTareas?: TareaAnalizar[]): string[] {
    const idsProgreso = extraerIdsProgreso(progreso);
    const idsCola = (colasTareas ?? []).map((t) => t.id);
    const conjunto = new Set([...idsProgreso, ...idsCola]);
    const estadosCompletados = new Set(["commit", "integrada", "hecha", "aprobada"]);

    const resultado: string[] = [];
    for (const id of Array.from(conjunto)) {
        const tarea = obtenerTareaAnalizar(id, progreso, colasTareas);
        const est = (tarea.estado ?? "").toLowerCase();
        if (!estadosCompletados.has(est)) {
            resultado.push(id);
        }
    }
    return resultado;
}

export function ejecutarReintentoInteligente(
    params: EjecucionReintentoParams
): EjecucionReintentoResultado {
    const { progreso, revisionesMd, colasTareas } = params;
    const idsAProcesar =
        params.ids && params.ids.length > 0
            ? params.ids
            : obtenerIdsElegibles(progreso, colasTareas);

    const reintentadas: string[] = [];
    const descartadas: Array<{ id: string; motivo: string }> = [];
    const esperando: Array<{ id: string; motivo: string }> = [];
    const reencoladas: TareaReencolada[] = [];

    for (const id of idsAProcesar) {
        const tarea = obtenerTareaAnalizar(id, progreso, colasTareas);
        const clas = clasificar(tarea, progreso, revisionesMd);

        if (clas.accion === "reintentar") {
            const baseId = obtenerBaseId(tarea.id);
            const objecion =
                objecionDe(revisionesMd, tarea.id) ??
                objecionDe(revisionesMd, baseId) ??
                clas.motivo ??
                "Reintento inteligente pedido desde el Mando";

            const nuevaTarea = reencolar(tarea, objecion, progreso);
            reencoladas.push(nuevaTarea);
            reintentadas.push(nuevaTarea.id);
        } else if (clas.accion === "esperar") {
            esperando.push({ id: tarea.id, motivo: clas.motivo });
        } else {
            descartadas.push({ id: tarea.id, motivo: clas.motivo });
        }
    }

    return { reintentadas, descartadas, esperando, reencoladas };
}

export function resumenVeredictos(
    tareas: TareaAnalizar[],
    progreso: unknown,
    revisionesMd: string
): { reintentarCount: number; descartarCount: number; esperarCount: number; resumenTexto: string } {
    return contarVeredictos(tareas.map((t) => clasificar(t, progreso, revisionesMd)));
}

/**
 * El mismo recuento, pero a partir de veredictos YA calculados.
 *
 * (2026-09-22) Existe porque el navegador no puede calcularlos: llamaba a
 * `resumenVeredictos(tareas, {}, "")` —sin progreso y sin revisiones— y el resumen decía
 * «0 se reintentan · 24 se descartan» de trabajos cuya objeción estaba escrita palabra por
 * palabra en `revisiones.md`. Ahora el servidor los calcula una vez y aquí solo se cuentan.
 */
export function contarVeredictos(
    veredictos: Array<{ accion: string } | null | undefined>
): { reintentarCount: number; descartarCount: number; esperarCount: number; resumenTexto: string } {
    let reintentarCount = 0;
    let descartarCount = 0;
    let esperarCount = 0;

    for (const v of veredictos) {
        const accion = v?.accion;
        if (accion === "reintentar") reintentarCount++;
        else if (accion === "esperar") esperarCount++;
        else descartarCount++;
    }

    const resumenTexto = `${reintentarCount} se reintentan · ${descartarCount} se descartan · ${esperarCount} esperan`;
    return { reintentarCount, descartarCount, esperarCount, resumenTexto };
}
