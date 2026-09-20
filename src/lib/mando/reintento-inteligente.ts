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

    // Regla 2: sin_cambios por fallo de proveedor
    if (estado === "sin_cambios") {
        const patronesProveedor = ["usage limit", "sin respuesta", "ningún modelo", "429", "sin cupo"];
        const esFalloProveedor = patronesProveedor.some((p) => nota.includes(p));
        if (esFalloProveedor) {
            return { accion: "reintentar", motivo: "no era la tarea, era el proveedor" };
        }
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
