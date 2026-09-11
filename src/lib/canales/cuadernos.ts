/**
 * Cuadernos de NotebookLM como fuente viva de los telecomunicadores (Ola 290 · T6 · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Los cuadernos de NotebookLM del proyecto son memoria fundamental (fundamentos,
 * diseños e I+D). NotebookLM NO tiene API pública: este módulo NO llama a ninguna
 * red, solo construye el ÍNDICE local (en `starseed_memory_root/cuadernos/`) que el
 * resto del sistema rellena a mano o con el navegador. Los canales se apoyan en él
 * y en los artefactos de su Studio (Audio Overview, Slide Deck, Vídeo, Mapas…).
 *
 * El núcleo (normalización, puntuación de artefactos y bloque de fuentes) es PURO
 * y testeable sin disco ni red. Solo las envolturas asíncronas leen/escriben disco.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";

/** Herramientas del Studio de NotebookLM que producen un artefacto reutilizable. */
export type TipoArtefacto =
    | "audio"
    | "diapositivas"
    | "video"
    | "mapa-mental"
    | "informe"
    | "fichas"
    | "cuestionario"
    | "infografia"
    | "nota";

/** Un artefacto generado por el Studio de un cuaderno (Audio Overview, Deck…). */
export interface ArtefactoCuaderno {
    id: string;
    cuadernoId: string;
    tipo: TipoArtefacto;
    titulo: string;
    resumen: string;
    archivo?: string;
    url?: string;
    creado: string;
    temas: string[];
}

/** Un cuaderno de NotebookLM del proyecto con sus artefactos del Studio. */
export interface Cuaderno {
    id: string;
    nombre: string;
    descripcion: string;
    temas: string[];
    url: string;
    artefactos: ArtefactoCuaderno[];
}

/** Qué produce cada herramienta del Studio y para qué canal sirve (texto en español). */
export interface TipoArtefactoInfo {
    tipo: TipoArtefacto;
    etiqueta: string;
    para: string;
}

/** Los tres cuadernos del proyecto con origen público (solo identificadores). */
export const CUADERNOS_SEMILLA: Cuaderno[] = [
    {
        id: "1f0ef34c-7eb2-41f6-8a3b-ded7f74804a6",
        nombre: "I+D de Astraura 1.58",
        descripcion:
            "Cuaderno de investigación y desarrollo del sistema primario Astraura 1.58-bit: arquitectura, modelo b1.58 y evolución del backend soberano.",
        temas: ["astraura", "modelo", "arquitectura", "investigacion", "desarrollo"],
        url: "https://notebook.google.com/notebook/1f0ef34c-7eb2-41f6-8a3b-ded7f74804a6",
        artefactos: [],
    },
    {
        id: "f8f45e80-9ed0-49b8-8c1f-75a6e123ad1d",
        nombre: "Fundamentos de StarSeed",
        descripcion:
            "Memoria fundamental de los principios, la Tríada Ideológica y las invariantes que sostienen el Sistema Operativo Social.",
        temas: ["fundamentos", "ontocracia", "ciberdelia", "transhumanismo", "principios"],
        url: "https://notebook.google.com/notebook/f8f45e80-9ed0-49b8-8c1f-75a6e123ad1d",
        artefactos: [],
    },
    {
        id: "e769a118-bcba-4cac-8f69-484f7aa611b2",
        nombre: "Diseños de StarSeed",
        descripcion:
            "Documentación de diseño del OS: sistema visual Crystal Liquid Glass, Trinity y las decisiones de producto y experiencia.",
        temas: ["diseño", "interfaz", "trinity", "experiencia", "visual"],
        url: "https://notebook.google.com/notebook/e769a118-bcba-4cac-8f69-484f7aa611b2",
        artefactos: [],
    },
];

/** Herramientas del Studio explicadas en español según su utilidad en un canal. */
export const TIPOS_ARTEFACTO: TipoArtefactoInfo[] = [
    { tipo: "audio", etiqueta: "Audio Overview", para: "pieza de voz de 3 a 8 minutos para un canal de audio o un pódcast." },
    { tipo: "diapositivas", etiqueta: "Slide Deck", para: "presentación en diapositivas lista para un canal de vídeo o una charla." },
    { tipo: "video", etiqueta: "Video Overview", para: "píldora de vídeo explicativo para un canal visual o un carrete." },
    { tipo: "mapa-mental", etiqueta: "Mind Map", para: "mapa mental para una infografía o un post que resuma relaciones entre ideas." },
    { tipo: "informe", etiqueta: "Report", para: "informe extenso de fondo para una publicación documental o un hilo." },
    { tipo: "fichas", etiqueta: "Flashcards", para: "fichas de repaso para un quiz o un formato de microaprendizaje." },
    { tipo: "cuestionario", etiqueta: "Quiz", para: "preguntas con respuesta para un formato interactivo en el canal." },
    { tipo: "infografia", etiqueta: "Infographic", para: "infografía estática lista para compartir como imagen en el canal." },
    { tipo: "nota", etiqueta: "Nota", para: "apunte breve de un cuaderno como semilla de una publicación." },
];

/** Palabras vacías en español que no aportan señal como tema. */
const PALABRAS_VACIAS = new Set([
    "la", "el", "los", "las", "un", "una", "unos", "unas", "de", "del", "y", "o", "u",
    "en", "al", "a", "con", "por", "para", "que", "es", "son", "su", "sus", "lo", "se",
]);

/** Ruta base de la persistencia de cuadernos bajo la raíz del proyecto. */
function carpetaCuadernos(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "cuadernos");
}

/** Ruta del índice de cuadernos (lista serializada con sus artefactos). */
function rutaIndice(): string {
    return path.join(carpetaCuadernos(), "indice.json");
}

/** Quita tildes y pasa a minúsculas (mismo criterio que el slug de canales). */
function sinTildes(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

/**
 * Convierte un texto libre en temas normalizados (PURA): minúsculas, sin tildes,
 * sin palabras vacías en español, sin duplicados y máximo 12. Orden estable.
 */
export function normalizarTemas(texto: string): string[] {
    const vistos = new Set<string>();
    const temas: string[] = [];
    const piezas = (texto ?? "")
        .split(/[^a-záéíóúñü0-9]+/i)
        .map((p) => p.trim())
        .filter(Boolean);

    for (const pieza of piezas) {
        if (temas.length >= 12) break;
        const clave = sinTildes(pieza);
        if (clave.length < 2) continue;
        if (PALABRAS_VACIAS.has(clave)) continue;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        temas.push(clave);
    }
    return temas;
}

/**
 * Puntúa un artefacto frente a un tema (PURA): +3 por cada tema en común con el
 * cuaderno (a través de `temas`) y +2 si el título contiene el tema. Mayor puntuación
 * = más relevante.
 */
function puntuarArtefacto(a: ArtefactoCuaderno, tema: string): number {
    const n = sinTildes(tema);
    let puntos = 0;
    for (const t of a.temas) if (sinTildes(t) === n) puntos += 3;
    if (sinTildes(a.titulo).includes(n)) puntos += 2;
    return puntos;
}

/**
 * Devuelve los artefactos más relevantes para un tema (PURA). Puntúa por temas en
 * común y por coincidencia en el título, ordena por puntuación descendente y corta
 * en `max` (por defecto 3). Ignora los que no puntúan nada.
 */
export function artefactosParaTema(cuadernos: Cuaderno[], tema: string, max = 3): ArtefactoCuaderno[] {
    const puntuados: { a: ArtefactoCuaderno; p: number }[] = [];
    for (const cuaderno of cuadernos) {
        for (const a of cuaderno.artefactos) {
            const p = puntuarArtefacto(a, tema);
            if (p > 0) puntuados.push({ a, p });
        }
    }
    puntuados.sort((x, y) => y.p - x.p);
    return puntuados.slice(0, max).map((e) => e.a);
}

/**
 * Bloque de texto en español para inyectar en el prompt del telecomunicador (PURA).
 * Devuelve cadena vacía si no hay artefactos; si no, una cabecera y una línea
 * `tipo · título — resumen` por artefacto.
 */
export function bloqueDeFuentes(artefactos: ArtefactoCuaderno[]): string {
    if (!artefactos.length) return "";
    const lineas = artefactos.map((a) => `${a.tipo} · ${a.titulo} — ${a.resumen}`);
    return ["Fuentes de los cuadernos del proyecto:", ...lineas].join("\n");
}

/** Tipos de artefacto válidos (para validación en tiempo de ejecución). */
const TIPOS_VALIDOS: readonly string[] = TIPOS_ARTEFACTO.map((t) => t.tipo);

/**
 * Valida un valor desconocido como artefacto (PURA). Devuelve `ok: false` con la
 * lista de errores si el tipo, los campos obligatorios o sus formas no cuadran.
 */
export function validarArtefacto(a: unknown): { ok: boolean; errores: string[] } {
    const errores: string[] = [];
    if (typeof a !== "object" || a === null) {
        return { ok: false, errores: ["El artefacto debe ser un objeto."] };
    }
    const o = a as Record<string, unknown>;

    if (typeof o.id !== "string" || o.id.length === 0) errores.push("Falta el id.");
    if (typeof o.cuadernoId !== "string" || o.cuadernoId.length === 0) errores.push("Falta el cuadernoId.");
    if (typeof o.tipo !== "string" || !TIPOS_VALIDOS.includes(o.tipo)) errores.push("Tipo de artefacto desconocido.");
    if (typeof o.titulo !== "string" || o.titulo.trim().length === 0) errores.push("Falta el título.");
    if (typeof o.resumen !== "string") errores.push("Falta el resumen.");
    if (typeof o.creado !== "string" || o.creado.length === 0) errores.push("Falta la fecha de creación.");
    if (!Array.isArray(o.temas)) {
        errores.push("Los temas deben ser una lista.");
    } else if (!o.temas.every((t) => typeof t === "string")) {
        errores.push("Los temas deben ser cadenas de texto.");
    }

    return { ok: errores.length === 0, errores };
}

/** Crea la carpeta de cuadernos si no existe (idempotente). */
async function asegurarCarpeta(): Promise<void> {
    await fs.mkdir(carpetaCuadernos(), { recursive: true });
}

/** Escritura atómica: vuelca a un `.tmp` y lo renombra encima del destino. */
async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
    const tmp = `${ruta}.tmp`;
    await fs.writeFile(tmp, contenido, "utf8");
    await fs.rename(tmp, ruta);
}

/**
 * Lee los cuadernos del índice local. Si el archivo no existe (o está corrupto)
 * devuelve `CUADERNOS_SEMILLA` para que el sistema nunca arranque sin fuentes.
 */
export async function leerCuadernos(): Promise<Cuaderno[]> {
    await asegurarCarpeta();
    try {
        const texto = await fs.readFile(rutaIndice(), "utf8");
        const datos = JSON.parse(texto) as unknown;
        if (!Array.isArray(datos)) return CUADERNOS_SEMILLA;
        const cuadernos = datos.filter(
            (d): d is Cuaderno =>
                typeof d === "object" &&
                d !== null &&
                typeof (d as Cuaderno).id === "string" &&
                typeof (d as Cuaderno).nombre === "string",
        );
        return cuadernos.length ? cuadernos : CUADERNOS_SEMILLA;
    } catch {
        return CUADERNOS_SEMILLA;
    }
}

/**
 * Guarda (crea o reemplaza por id) un artefacto dentro de su cuaderno. Valida el
 * artefacto, siembra el índice si hace falta y persiste con escritura atómica.
 */
export async function guardarArtefacto(a: ArtefactoCuaderno): Promise<void> {
    const validado = validarArtefacto(a);
    if (!validado.ok) throw new Error(`Artefacto inválido: ${validado.errores.join(" · ")}`);

    const cuadernos = await leerCuadernos();
    const cuaderno = cuadernos.find((c) => c.id === a.cuadernoId);
    if (!cuaderno) throw new Error(`Cuaderno «${a.cuadernoId}» no encontrado.`);

    const indice = cuaderno.artefactos.findIndex((x) => x.id === a.id);
    if (indice >= 0) {
        cuaderno.artefactos[indice] = a;
    } else {
        cuaderno.artefactos.push(a);
    }
    await escribirAtomico(rutaIndice(), JSON.stringify(cuadernos, null, 2));
}

/**
 * Borra un artefacto por id; devuelve true si existía y se borró. Si el índice no
 * existe aún no hay nada que borrar.
 */
export async function borrarArtefacto(id: string): Promise<boolean> {
    const cuadernos = await leerCuadernos();
    let borrado = false;
    for (const cuaderno of cuadernos) {
        const antes = cuaderno.artefactos.length;
        cuaderno.artefactos = cuaderno.artefactos.filter((a) => a.id !== id);
        if (cuaderno.artefactos.length < antes) borrado = true;
    }
    if (borrado) {
        await escribirAtomico(rutaIndice(), JSON.stringify(cuadernos, null, 2));
    }
    return borrado;
}