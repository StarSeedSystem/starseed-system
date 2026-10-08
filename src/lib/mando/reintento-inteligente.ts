/** Reglas puras para reparar tareas bloqueadas sin repetir el fallo anterior. */
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
    [clave: string]: unknown;
}

export interface FuentesCambio {
    revisionesMd?: string;
    eventos?: string;
    pasos?: string;
    log?: string;
    tsc?: string;
    faltantes?: string[];
}

export interface ClasificacionResultado {
    accion: "reintentar" | "escalar" | "esperar" | "descartar";
    motivo: string;
}

export interface TareaReencolada extends TareaAnalizar {
    id: string;
    prompt: string;
    archivos: string[];
    depende: string[];
}

export interface ResultadoReintento {
    id: string;
    accion: "reintentada" | "escalada" | "esperando" | "descartada";
    motivo: string;
    sucesor?: string;
    posicion?: number;
}

const FALLOS = new Set([
    "fallo", "fallo_motor", "fallo_tsc", "fallo_tests", "sin_cambios",
    "interrumpida", "conflicto", "rechazada", "bloqueante", "bloqueada", "faltan",
    // (2026-10-08) La rama que esperó un visto bueno con revisión BLOQUEANTE y nadie decidió:
    // el veredicto ya está dado. Antes se quedaba ahí para siempre bloqueando su cadena.
    "pendiente_aprobacion",
]);
const DESCARTABLES = new Set(["sustituida", "reasignada", "duplicada", "descartada"]);
const VIVOS = new Set(["", "pendiente", "en_curso", "escribiendo", "esperando"]);

export function extraerIdsProgreso(progreso: unknown): string[] {
    if (Array.isArray(progreso)) return progreso.flatMap((e) =>
        typeof e === "string" ? [e] : e && typeof e === "object" && "id" in e && typeof e.id === "string" ? [e.id] : []);
    return progreso && typeof progreso === "object" ? Object.keys(progreso) : [];
}

export function obtenerBaseId(id: string): string {
    return /[A-Z0-9][b-z]$/.test(id) ? id.slice(0, -1) : id;
}

function ordenId(id: string): number {
    const base = obtenerBaseId(id);
    return id === base ? 0 : Math.max(1, id.charCodeAt(id.length - 1) - 96);
}

function idsCadena(id: string, progreso: unknown): string[] {
    const base = obtenerBaseId(id);
    return [...new Set([...extraerIdsProgreso(progreso), id])]
        .filter((x) => obtenerBaseId(x) === base)
        .sort((a, b) => ordenId(a) - ordenId(b));
}

function numeroIntento(id: string, progreso: unknown): number {
    return Math.max(idsCadena(id, progreso).length, ordenId(id), 1);
}

function entradaDe(progreso: unknown, id: string): Partial<TareaAnalizar> {
    if (Array.isArray(progreso)) {
        const e = progreso.find((x) => x && typeof x === "object" && "id" in x && x.id === id);
        return (e as Partial<TareaAnalizar> | undefined) ?? {};
    }
    if (progreso && typeof progreso === "object") {
        const e = (progreso as Record<string, unknown>)[id];
        return e && typeof e === "object" ? e as Partial<TareaAnalizar> : {};
    }
    return {};
}

export function objecionDe(md: string, id: string): string | null {
    if (!md.trim() || !id) return null;
    const secciones = md.split(/(?=^#{1,3}\s)/m).filter((s) =>
        new RegExp(`(?:^|[·\\s])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[:·\\s]|$)`, "im").test(s));
    const seccion = secciones.at(-1);
    if (!seccion || !/Seguimiento[:：].*bloqueante/i.test(seccion)) return null;
    const riesgos = seccion.match(/(?:\*\*)?Riesgos reales(?:\*\*)?\s*([\s\S]*?)(?=\n(?:\*\*)?Probar|\n(?:\*\*)?Seguimiento)/i)?.[1]?.trim();
    const seguimiento = seccion.match(/Seguimiento[:：]\s*([^\n]+)/i)?.[0]?.replace(/\*\*|[«»]/g, "").trim();
    return [riesgos ? `Riesgos reales:\n${riesgos}` : "", seguimiento ?? ""].filter(Boolean).join("\n\n") || null;
}

const HUELLAS_MEDIO: Array<[string, string]> = [
    ["429", "el proveedor devolvió 429"], ["402", "el proveedor devolvió 402"],
    ["timeout", "se agotó el tiempo de espera"], ["red ca", "se cayó la red"],
    ["network", "problema de red"], ["connection", "problema de conexión"],
    ["ningún proveedor", "ningún proveedor respondió"], ["ningun proveedor", "ningún proveedor respondió"],
    ["does not exist", "el modelo ya no existe"], ["se colg", "el modelo se colgó"],
    ["sin respuesta", "el proveedor no contestó"], ["usage limit", "tope de uso del proveedor"],
];

export function causaDelMedio(nota: string): string {
    const n = nota.toLowerCase();
    return HUELLAS_MEDIO.find(([huella]) => n.includes(huella))?.[1] ?? "falló el medio";
}

export function esFalloDelMedio(estado: string, nota: string): boolean {
    return FALLOS.has(estado.toLowerCase()) && HUELLAS_MEDIO.some(([huella]) => nota.toLowerCase().includes(huella));
}

function lineasUtiles(texto: string, patron: RegExp): string {
    return texto.split("\n").filter((linea) => patron.test(linea)).slice(-40).join("\n").trim();
}

function eventoDe(texto: string, id: string): string {
    return texto.split("\n").filter((linea) => linea.includes(id) && /revisi|bloque|rechaz/i.test(linea)).slice(-8).join("\n");
}

export function cambioAutomatico(tarea: TareaAnalizar, fuentes: FuentesCambio = {}): string {
    const estado = String(tarea.estado ?? "").toLowerCase();
    const nota = String(tarea.nota ?? tarea.motivo ?? "").trim();
    if (estado === "rechazada" || estado === "bloqueante" || estado === "pendiente_aprobacion") {
        const objecion = (objecionDe(fuentes.revisionesMd ?? "", tarea.id)
            ?? eventoDe(fuentes.eventos ?? "", tarea.id))
            || nota || "La revisión fue bloqueante.";
        return `Corrige cada punto de esta objeción literal y añade una prueba para cada uno:\n${objecion}`;
    }
    if (estado === "fallo_tests") {
        const salida = lineasUtiles(`${fuentes.pasos ?? ""}\n${fuentes.log ?? ""}`, /test|fail|error|expected|received|×|✗/i);
        return `Repara las pruebas que fallaron y conserva las que ya pasan:\n${salida || nota || "Fallo de pruebas sin salida legible."}`;
    }
    if (estado === "fallo_tsc") {
        const salida = fuentes.tsc?.trim() || lineasUtiles(`${fuentes.pasos ?? ""}\n${fuentes.log ?? ""}`, /tsc|typescript|error ts\d+|type error/i);
        return `Corrige todos los errores de TypeScript de los archivos declarados:\n${salida || nota || "Fallo de tsc sin salida legible."}`;
    }
    if (estado === "sin_cambios") {
        const archivos = fuentes.faltantes?.length ? fuentes.faltantes : tarea.archivos ?? [];
        return `Tu intento no tocó tus archivos declarados: ${archivos.join(", ") || "no constan"} no existen o no cambiaron. Créalos o modifícalos según el contrato.`;
    }
    if (estado === "faltan") {
        return `Completa los archivos que faltan: ${(fuentes.faltantes ?? tarea.archivos ?? []).join(", ") || nota}.`;
    }
    if (estado === "interrumpida" || esFalloDelMedio(estado, nota)) {
        return `Repite la misma tarea con otro proveedor; el intento anterior falló por el medio (${causaDelMedio(nota)}).`;
    }
    if (estado === "conflicto") return "Parte de main actual y rehace el cambio sobre él; no reutilices la rama antigua en conflicto.";
    return nota || "Repara el fallo indicado, comprueba cada archivo declarado y añade las pruebas correspondientes.";
}

export function clasificar(tarea: TareaAnalizar, progreso: unknown, revisionesMd = ""): ClasificacionResultado {
    const estado = String(tarea.estado ?? "").toLowerCase();
    if (DESCARTABLES.has(estado)) return { accion: "descartar", motivo: "ya vive con otro id" };
    // (2026-10-05) Un fallo del MEDIO (429, red caída, ningún proveedor contestó) no gasta
    // intento: es la regla del 2026-09-22 que la reescritura de BLQ1005Ad dejó caer. Sin ella,
    // una tarea que solo se encontró los proveedores saturados escalaba al tercer id, y las
    // pruebas de `veredicto-servidor` tumbaban la publicación. Un rechazo o un bloqueo NO
    // entran aquí aunque su nota hable de «timeout»: ahí alguien miró el trabajo.
    const nota = String(tarea.nota ?? tarea.motivo ?? "");
    if (!["rechazada", "bloqueante", "bloqueada"].includes(estado) && esFalloDelMedio(estado, nota)) {
        return { accion: "reintentar", motivo: `era el medio (${causaDelMedio(nota)}): vuelve a la cola sin gastar intento` };
    }
    // Una rama EN VERDE esperando el visto bueno de una persona no se repara: se aprueba o no.
    if (estado === "pendiente_aprobacion" && String((tarea as Record<string, unknown>).revisor ?? "") !== "bloqueante") {
        return { accion: "esperar", motivo: "rama en verde: espera el visto bueno de una persona" };
    }
    if (numeroIntento(tarea.id, progreso) >= 3) return { accion: "escalar", motivo: "tercer intento fallido: escala al director, nunca se descarta" };
    if (estado === "bloqueada") {
        return { accion: "esperar", motivo: "esperando a que se integre la dependencia" };
    }
    if (FALLOS.has(estado)) {
        const cambio = cambioAutomatico(tarea, { revisionesMd });
        return { accion: "reintentar", motivo: cambio.split("\n")[0] ?? "reparación automática" };
    }
    return { accion: "esperar", motivo: "no está en un estado de fallo o bloqueo" };
}

export function elegirModelo(fallido: string, candidatos: string[], intentos: number): string | undefined {
    const codex = "codex/gpt-5.6-sol";
    const unicos = [...new Set([...candidatos, codex, "nim/kimi-k3", "google/gemini-3.6-flash"])]
        .filter((modelo) => modelo && modelo !== fallido);
    return intentos >= 1 && codex !== fallido ? codex : unicos[0];
}

export function reencolar(
    tarea: TareaAnalizar,
    cambio: string,
    progreso: unknown,
    candidatos: string[] = [],
): TareaReencolada {
    const intentos = numeroIntento(tarea.id, progreso);
    const base = obtenerBaseId(tarea.id);
    const siguiente = String.fromCharCode(97 + intentos);
    const promptBase = String(tarea.prompt ?? "").split(/\n+## REPARACIÓN\b/)[0]?.trimEnd() ?? "";
    const modeloElegido = elegirModelo(String(tarea.modelo ?? ""), candidatos, intentos);
    const { id: _id, prompt: _prompt, estado: _estado, nota: _nota, motivo: _motivo, modelo: _modelo, ...resto } = tarea;
    void [_id, _prompt, _estado, _nota, _motivo, _modelo];
    return {
        ...resto,
        id: `${base}${siguiente}`,
        ola: String(tarea.ola ?? ""),
        titulo: String(tarea.titulo ?? ""),
        archivos: [...(tarea.archivos ?? [])],
        depende: [...(tarea.depende ?? [])],
        prompt: `${promptBase}\n\n## REPARACIÓN\n${cambio}\n\nCorrige cada punto y añade pruebas que demuestren la reparación.`.trim(),
        ...(modeloElegido ? { modelo: modeloElegido } : {}),
    };
}

export function ponerPrimera(actuales: TareaAnalizar[], nuevas: TareaAnalizar[]): TareaAnalizar[] {
    const idsNuevos = new Set(nuevas.map((t) => t.id));
    const vistos = new Set<string>();
    return [...nuevas, ...actuales.filter((t) => !idsNuevos.has(t.id))].filter((t) => {
        if (vistos.has(t.id)) return false;
        vistos.add(t.id);
        return true;
    });
}

export function obtenerTareaAnalizar(id: string, progreso: unknown, colas: TareaAnalizar[] = []): TareaAnalizar {
    const cola = colas.find((t) => t.id === id) ?? { id };
    return { ...cola, ...entradaDe(progreso, id), id };
}

export function obtenerIdsElegibles(progreso: unknown, colas: TareaAnalizar[] = []): string[] {
    return [...new Set([...extraerIdsProgreso(progreso), ...colas.map((t) => t.id)])].filter((id) => {
        const estado = String(obtenerTareaAnalizar(id, progreso, colas).estado ?? "").toLowerCase();
        return FALLOS.has(estado);
    });
}

export interface EjecucionReintentoParams {
    ids?: string[];
    progreso: unknown;
    revisionesMd: string;
    colasTareas?: TareaAnalizar[];
    fuentes?: Record<string, FuentesCambio>;
    cambio?: string;
    modelos?: string[];
    escalar?: boolean;
}

export interface EjecucionReintentoResultado {
    resultados: ResultadoReintento[];
    reintentadas: string[];
    escaladas: Array<{ id: string; motivo: string }>;
    descartadas: Array<{ id: string; motivo: string }>;
    esperando: Array<{ id: string; motivo: string }>;
    reencoladas: TareaReencolada[];
}

export function ejecutarReintentoInteligente(p: EjecucionReintentoParams): EjecucionReintentoResultado {
    const colas = p.colasTareas ?? [];
    const universo = [...extraerIdsProgreso(p.progreso), ...colas.map((t) => t.id)];
    const ids = p.ids?.length ? p.ids : obtenerIdsElegibles(p.progreso, colas);
    const resultados: ResultadoReintento[] = [], reencoladas: TareaReencolada[] = [];
    const cadenasProcesadas = new Set<string>();
    for (const pedido of ids) {
        const base = obtenerBaseId(pedido);
        if (cadenasProcesadas.has(base)) continue;
        cadenasProcesadas.add(base);
        const cadena = idsCadena(pedido, universo);
        const ultimoId = cadena.at(-1) ?? pedido;
        const tarea = obtenerTareaAnalizar(ultimoId, p.progreso, colas);
        if (ultimoId !== pedido && VIVOS.has(String(tarea.estado ?? "").toLowerCase())) {
            resultados.push({ id: pedido, accion: "esperando", motivo: `ya existe un sucesor vivo: ${ultimoId}` });
            continue;
        }
        const clasificacion = p.escalar ? { accion: "escalar" as const, motivo: "escalado pedido desde Genesis" }
            : clasificar(tarea, universo, p.revisionesMd);
        if (clasificacion.accion !== "reintentar") {
            const accion = clasificacion.accion === "escalar" ? "escalada"
                : clasificacion.accion === "descartar" ? "descartada" : "esperando";
            resultados.push({ id: pedido, accion, motivo: clasificacion.motivo });
            continue;
        }
        const fuentes = { revisionesMd: p.revisionesMd, ...(p.fuentes?.[ultimoId] ?? {}) };
        const cambio = p.cambio?.trim() || cambioAutomatico(tarea, fuentes);
        const nueva = reencolar(tarea, cambio, universo, p.modelos);
        reencoladas.push(nueva);
        universo.push(nueva.id);
        resultados.push({ id: pedido, accion: "reintentada", motivo: cambio, sucesor: nueva.id });
    }
    const por = (accion: ResultadoReintento["accion"]) => resultados.filter((r) => r.accion === accion);
    return {
        resultados, reencoladas,
        reintentadas: por("reintentada").flatMap((r) => r.sucesor ? [r.sucesor] : []),
        escaladas: por("escalada").map(({ id, motivo }) => ({ id, motivo })),
        descartadas: por("descartada").map(({ id, motivo }) => ({ id, motivo })),
        esperando: por("esperando").map(({ id, motivo }) => ({ id, motivo })),
    };
}

export function contarVeredictos(veredictos: Array<{ accion: string } | null | undefined>) {
    const reintentarCount = veredictos.filter((v) => v?.accion === "reintentar" || v?.accion === "escalar").length;
    const esperarCount = veredictos.filter((v) => v?.accion === "esperar").length;
    const descartarCount = veredictos.length - reintentarCount - esperarCount;
    return { reintentarCount, descartarCount, esperarCount,
        resumenTexto: `${reintentarCount} se reintentan · ${descartarCount} se descartan · ${esperarCount} esperan` };
}

export function resumenVeredictos(tareas: TareaAnalizar[], progreso: unknown, revisionesMd: string) {
    return contarVeredictos(tareas.map((t) => clasificar(t, progreso, revisionesMd)));
}
