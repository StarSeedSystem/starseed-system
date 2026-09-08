/**
 * Telecomunicadores StarSeed (Ola 287 · T1 · 2026-09-08) — SOLO servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * Los canales StarSeed son canales ACTIVOS: cada uno está atendido por un agente
 * telecomunicador —una personalidad del OS con su cerebro— que publica varias
 * veces al día. Este módulo planifica el día (cuándo publicar, con qué formato y
 * tema), compone el prompt con la voz de la personalidad + memorias del cerebro
 * y genera UNA publicación llamando al router de IA del OS (`llamarModelo`, que
 * ya elige proveedor con la salud de la flota). NUNCA publica por su cuenta: solo
 * devuelve el texto; el envío real lo hace el panel con el bot del usuario.
 *
 * El núcleo (`planDelDia`, `promptTelecomunicador`, `seleccionarMemorias`) es PURO
 * y testeable sin tocar disco ni red. Solo las envolturas (`generarPublicacion`)
 * leen canales, historial, memorias y llaman al router.
 */

import type { CanalStarSeed, HistorialCanal } from "./canales";
import { leerCanales, leerHistorial, registrarPublicacion } from "./canales";
import { llamarModelo, saludCruda } from "@/lib/mando/modelos-disponibles";
import { proveedoresDisponibles } from "@/lib/mando/proveedores-catalogo";

/** Una publicación prevista para un canal en el plan del día. */
export interface PlanPublicacion {
    canalId: string;
    /** Hora local «HH:MM» en la que se prevé publicar. */
    hora: string;
    formato: string;
    tema: string;
    fuente: "cuaderno" | "memoria" | "noticia" | "libre";
}

/** Quita acentos, pasa a minúsculas y parte en palabras (solo las de ≥ 3 letras). */
function palabrasClave(texto: string): string[] {
    const normalizado = texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return normalizado
        .split(/[^a-z0-9]+/i)
        .map((p) => p.trim())
        .filter((p) => p.length >= 3);
}

/** «HH:MM» local de una fecha. */
function horaLocal(fecha: Date): string {
    const h = fecha.getHours().toString().padStart(2, "0");
    const m = fecha.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
}

/** Clave «YYYY-M-D» local de una fecha (para agrupar el historial por día). */
function claveDia(fecha: Date): string {
    return `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;
}

/**
 * Plan del día de un canal (PURA). Reparte `cadenciaDia` publicaciones entre las
 * 09:00 y las 22:00 hora local con huecos iguales, alterna los formatos del canal
 * y elige un tema de sus categorías evitando las palabras de las últimas 20
 * publicaciones. Salta las horas que ya tienen una publicación de HOY (para no
 * duplicar si el plan se consulta a mitad de día).
 */
export function planDelDia(canal: CanalStarSeed, ahora: Date, historial: HistorialCanal[]): PlanPublicacion[] {
    const n = Math.max(0, Math.floor(canal.cadenciaDia || 0));
    if (n <= 0) return [];

    const inicio = 9;
    const fin = 22;
    const franja = fin - inicio;

    // Horas de publicación con huecos iguales dentro de la franja.
    const horas: string[] = [];
    for (let i = 0; i < n; i++) {
        const h = n === 1 ? inicio + Math.round(franja / 2) : inicio + Math.round((i * franja) / (n - 1));
        horas.push(`${h.toString().padStart(2, "0")}:00`);
    }

    // Horas de hoy ya ocupadas por publicaciones del mismo canal.
    const hoy = claveDia(ahora);
    const ocupadas = new Set<string>();
    for (const h of historial) {
        if (h.canalId !== canal.id) continue;
        const f = new Date(h.t);
        if (claveDia(f) === hoy) ocupadas.add(horaLocal(f));
    }

    // Palabras de los últimos 20 textos (para no repetir temas recién usados).
    const recientes = historial
        .filter((h) => h.canalId === canal.id)
        .slice(0, 20)
        .map((h) => new Set(palabrasClave(h.texto)));

    // Formatos alternados del canal (cae a «texto» si no hay ninguno).
    const formatos = canal.formatos.length ? canal.formatos : ["texto"];

    const disponibles = horas.filter((h) => !ocupadas.has(h));
    return disponibles.map((hora, idx) => ({
        canalId: canal.id,
        hora,
        formato: formatos[idx % formatos.length],
        tema: elegirTema(canal.categorias, recientes, idx),
        fuente: "libre" as const,
    }));
}

/**
 * Elige un tema para una publicación (PURA): recorre las categorías del canal
 * (rotando por `idx`) y devuelve la primera que no colisione con las palabras de
 * las publicaciones recientes; si todas colisionan, devuelve un tema genérico.
 */
function elegirTema(categorias: string[], recientes: Set<string>[], idx: number): string {
    const candidatos = categorias.length ? categorias : ["reflexión"];
    for (let k = 0; k < candidatos.length; k++) {
        const tema = candidatos[(idx + k) % candidatos.length];
        const palabras = new Set(palabrasClave(tema));
        if (!recientes.some((r) => [...palabras].some((p) => r.has(p)))) return tema;
    }
    return `Una reflexión de ${candidatos[0]}`;
}

/** Longitud máxima (caracteres) según el formato de la publicación. */
export const LIMITES_POR_FORMATO: Record<string, number> = {
    texto: 700,
    encuesta: 200,
    quiz: 300,
};

/** La forma mínima de una personalidad que el telecomunicador necesita. */
export interface PersonalidadTelecomunicador {
    nombre: string;
    esencia: string;
    estilo: string;
    idioma?: string;
}

/** Entrada para componer el prompt de una publicación. */
export interface EntradaPrompt {
    canal: CanalStarSeed;
    personalidad: PersonalidadTelecomunicador;
    memorias: string[];
    plan: PlanPublicacion;
    ultimos: string[];
}

/**
 * Compone el prompt (PURA): el `system` es la voz de la personalidad + las reglas
 * del canal (idioma, categorías, formato, longitud máxima, «no repitas lo ya
 * publicado» con los últimos titulares); el `user` pide UNA publicación concreta.
 */
export function promptTelecomunicador(entrada: EntradaPrompt): { system: string; user: string } {
    const limite = LIMITES_POR_FORMATO[entrada.plan.formato] ?? LIMITES_POR_FORMATO.texto;
    const idioma = entrada.personalidad.idioma ?? "es";
    const categorias = entrada.canal.categorias.length ? entrada.canal.categorias.join(", ") : "libres";
    const ultimos = entrada.ultimos.length ? entrada.ultimos.map((t) => `- ${t}`).join("\n") : "ninguno todavía";

    const system = [
        `Eres ${entrada.personalidad.nombre}. ${entrada.personalidad.esencia}`,
        `Estilo de expresión: ${entrada.personalidad.estilo || "cercano y claro"}.`,
        `Publicas en el canal «${entrada.canal.nombre}» (${entrada.canal.plataforma}).`,
        `Reglas del canal:`,
        `- Categorías: ${categorias}.`,
        `- Idioma: ${idioma}.`,
        `- Formato de esta publicación: ${entrada.plan.formato}.`,
        `- Longitud máxima: ${limite} caracteres.`,
        ``,
        `No repitas lo ya publicado. Últimos titulares del canal:`,
        ultimos,
    ].join("\n");

    const user = [
        `Escribe UNA publicación (${entrada.plan.formato}) sobre el tema: ${entrada.plan.tema}.`,
        `Respeta el formato y la longitud máxima, y usa un tono coherente con tu esencia.`,
        entrada.memorias.length ? `Inspírate en estas memorias del cerebro si te sirven:\n${entrada.memorias.join("\n\n")}` : "No hay memorias disponibles: crea desde cero.",
    ].join("\n");

    return { system, user };
}

/**
 * Selecciona las `max` memorias más pertinentes para un tema (PURA): puntúa cada
 * memoria por las palabras clave del tema que aparecen en ella y devuelve las de
 * mayor coincidencia (mantiene el orden original ante empates).
 */
export function seleccionarMemorias(memorias: string[], tema: string, max = 3): string[] {
    const palabras = new Set(palabrasClave(tema));
    if (palabras.size === 0) return memorias.slice(0, max);
    const puntuadas = memorias
        .map((m, i) => ({ m, i, n: palabrasClave(m).filter((p) => palabras.has(p)).length }))
        .sort((a, b) => b.n - a.n || a.i - b.i);
    return puntuadas.slice(0, max).map((x) => x.m);
}

/**
 * Modelos rápidos por proveedor, en el orden en que el telecomunicador releva.
 * Solo un modelo por proveedor: si uno de la flota responde, ya no hace falta
 * intentar otra vez el mismo proveedor (evita quemar su cupo).
 */
const MODELOS_RAPIDOS: Array<{ proveedor: string; modelo: string }> = [
    { proveedor: "groq", modelo: "openai/gpt-oss-120b" },
    { proveedor: "nim", modelo: "deepseek-ai/deepseek-v4-flash-0731" },
    { proveedor: "xkiro", modelo: "qwen/qwen3-coder-plus:free" },
    { proveedor: "llm7", modelo: "minimax-m2.7" },
];

/**
 * Candidatos de modelo para escribir una publicación (PURA, Ola 287 · T3). A
 * partir de la foto de proveedores que ya arma `proveedoresDisponibles(...)`
 * (que a su vez lee `saludCruda()`), devuelve hasta 4 identificadores
 * «proveedor/modelo»: primero el `preferido` si su proveedor está activo y
 * luego un modelo rápido por cada proveedor ACTIVO, en el orden de
 * `MODELOS_RAPIDOS`. Salta proveedores caídos o sin cupo y nunca repite
 * proveedor. No expone claves: solo ids.
 */
export function candidatosDeModelo(salud: unknown, preferido?: string): string[] {
    // Un proveedor solo entra si el cruce con su salud lo deja «activo».
    const activos = new Set(
        proveedoresDisponibles(salud)
            .filter((p) => p.estado === "activo")
            .map((p) => p.id),
    );
    const salida: string[] = [];
    const vistos = new Set<string>();
    if (preferido) {
        const proveedor = preferido.slice(0, preferido.indexOf("/"));
        if (activos.has(proveedor)) {
            salida.push(preferido);
            vistos.add(proveedor);
        }
    }
    for (const { proveedor, modelo } of MODELOS_RAPIDOS) {
        if (vistos.has(proveedor)) continue;
        if (!activos.has(proveedor)) continue;
        salida.push(`${proveedor}/${modelo}`);
        vistos.add(proveedor);
        if (salida.length >= 4) break;
    }
    return salida;
}

/**
 * Dice si un error vino del proveedor (429, 402, cuota o 5xx) y no de la
 * configuración local. Solo esos motivos justifican saltar al siguiente
 * candidato: un error de «sin clave» es un problema de la máquina que conviene
 * propagar, no disimular con otro modelo.
 */
function esErrorDeProveedor(e: unknown): boolean {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (/(^|\s)(402|429|4\d{2}|5\d{2})(\s|\.|$)/.test(mensaje)) return true;
    return /cuota|quota|abuse|recharg|insufficient balance|too many requests|rate limit|prevent abuse/i.test(mensaje);
}

/**
 * Genera un texto probando los candidatos de la flota en cadena: si un proveedor
 * responde, devuelve su texto y el modelo que escribió de verdad; si da 429/cuota
 * pasa al siguiente sin gastar tiempo, y solo falla cuando se acaban todos.
 */
async function generarConRelevo(
    mensajes: { system: string; user: string },
    opciones: { maxTokens: number; temperatura: number; timeoutMs: number },
): Promise<{ ok: boolean; texto?: string; modelo?: string; error?: string }> {
    const candidatos = candidatosDeModelo(await saludCruda());
    if (candidatos.length === 0) {
        return { ok: false, error: "ningún proveedor de la flota pudo escribir: no hay candidatos activos." };
    }
    const motivos: string[] = [];
    for (const id of candidatos) {
        try {
            const r = await llamarModelo(id, [
                { rol: "system", texto: mensajes.system },
                { rol: "user", texto: mensajes.user },
            ], opciones);
            return { ok: true, texto: r.texto, modelo: `${r.proveedor}/${r.modelo}` };
        } catch (e) {
            if (!esErrorDeProveedor(e)) throw e;
            const motivo = e instanceof Error ? e.message : String(e);
            motivos.push(`${id}: ${motivo}`);
        }
    }
    return { ok: false, error: `ningún proveedor de la flota pudo escribir: ${motivos.join(" · ")}` };
}

/** Lee las memorias de un cerebro (best-effort; sin sesión devuelve []). */
async function leerMemorias(cerebroId: string): Promise<string[]> {
    try {
        const { createClient } = await import("@/utils/supabase/server");
        const sb = await createClient();
        const { data } = await sb
            .from("brain_memory_files")
            .select("name, content")
            .eq("brain_id", cerebroId)
            .limit(50);
        const filas = Array.isArray(data) ? (data as Array<{ name?: string; content?: string }>) : [];
        return filas
            .map((f) => `${f.name ?? ""}\n${f.content ?? ""}`.trim())
            .filter((x) => x.length > 0);
    } catch {
        return [];
    }
}

/**
 * Resuelve la personalidad del canal (best-effort). El catálogo de perfiles vive
 * en localStorage del cliente, así que aquí se consulta la tabla legada de
 * Supabase y, si no hay nada (o falla), se usa el nombre y la descripción del
 * propio canal como voz por defecto. Nunca lanza.
 */
async function personalidadDe(canal: CanalStarSeed): Promise<PersonalidadTelecomunicador> {
    if (canal.personalidadId) {
        try {
            const { createClient } = await import("@/utils/supabase/server");
            const sb = await createClient();
            const { data } = await sb.from("aurora_personalities").select("name, prompts").eq("id", canal.personalidadId).maybeSingle();
            if (data && typeof data === "object") {
                const fila = data as { name?: string; prompts?: unknown };
                const prompts = fila.prompts && typeof fila.prompts === "object"
                    ? (fila.prompts as Record<string, unknown>)
                    : {};
                return {
                    nombre: fila.name ?? canal.nombre,
                    esencia: typeof prompts.esencia === "string" ? prompts.esencia : canal.descripcion,
                    estilo: typeof prompts.estilo === "string" ? prompts.estilo : "",
                };
            }
        } catch {
            // cae al nombre del canal
        }
    }
    return { nombre: canal.nombre, esencia: canal.descripcion, estilo: "" };
}

/**
 * Genera UNA publicación para un plan (NUNCA publica por su cuenta). Junta el
 * canal, las 3 memorias más pertinentes de su cerebro y compone el prompt con la
 * voz de la personalidad; el texto lo produce el router del OS (`llamarModelo`).
 */
export async function generarPublicacion(
    canalId: string,
    plan: PlanPublicacion,
): Promise<{ ok: boolean; texto?: string; modelo?: string; error?: string }> {
    try {
        const canal = (await leerCanales()).find((c) => c.id === canalId);
        if (!canal) return { ok: false, error: `Canal «${canalId}» no encontrado.` };

        const historial = await leerHistorial(canalId, 20);
        const memorias = canal.cerebroId ? await leerMemorias(canal.cerebroId) : [];
        const pertinentes = seleccionarMemorias(memorias, plan.tema);
        const personalidad = await personalidadDe(canal);

        const { system, user } = promptTelecomunicador({
            canal,
            personalidad,
            memorias: pertinentes,
            plan,
            ultimos: historial.slice(0, 5).map((h) => h.texto.slice(0, 80)),
        });

        const resp = await generarConRelevo(
            { system, user },
            { maxTokens: 900, temperatura: 0.7, timeoutMs: 120_000 },
        );
        if (!resp.ok) return resp;
        return { ok: true, texto: resp.texto, modelo: resp.modelo };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Registra una publicación como «listo para publicar» en el historial (el envío
 * real lo hace el panel con el bot del usuario, como en la Ola 285).
 */
export async function marcarListoParaPublicar(
    canalId: string,
    texto: string,
    formato: string,
): Promise<void> {
    await registrarPublicacion({
        canalId,
        t: new Date().toISOString(),
        texto,
        formato,
        ok: true,
        detalle: "listo para publicar",
    });
}