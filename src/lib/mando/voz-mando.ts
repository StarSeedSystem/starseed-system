/**
 * VOZ DEL MANDO — lógica pura (Ola 275 · Tarea V1 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * El Puente de Mando HABLA: anuncia con la voz elegida lo que importa de la
 * orquestación (visto bueno pendiente, integradas, fallidas, proveedores que
 * caen o vuelven, publicaciones) y cada agente/personalidad puede tener su
 * propia voz.
 *
 * Este módulo es PURO: nada de React, Node ni `window`. Decide QUÉ decir, en
 * qué orden y con qué timbre; la síntesis la hace la capa de UI llamando al
 * motor único `hablarStarSeed()` (contexto "aviso").
 */

import type { EventoRelevo } from "./tipos";

/** Preferencias persistentes de la voz del Mando. */
export interface PreferenciasVozMando {
    activa: boolean;
    /** Timbre por defecto de avisos (id de `TIMBRES`), null = el activo del OS. */
    timbreId: string | null;
    anunciar: {
        vistoBueno: boolean;
        integradas: boolean;
        fallidas: boolean;
        proveedores: boolean;
        publicaciones: boolean;
        olaTerminada: boolean;
    };
    /** Silencio mínimo entre avisos, en segundos (nunca menos de 5). */
    silencioS: number;
    /** Volumen relativo de los avisos (0.2–1). */
    volumenRelativo: number;
}

export const PREFERENCIAS_VOZ_POR_DEFECTO: PreferenciasVozMando = {
    activa: false,
    timbreId: null,
    anunciar: {
        vistoBueno: true,
        integradas: false,
        fallidas: true,
        proveedores: true,
        publicaciones: true,
        olaTerminada: true,
    },
    silencioS: 20,
    volumenRelativo: 1,
};

/** Un aviso listo para hablar. */
export interface AnuncioVoz {
    /** Id del evento que lo generó (para no repetir). */
    clave: string;
    /** 1 = visto bueno / fallo / publicación · 2 = proveedor · 3 = integrada / ola. */
    prioridad: 1 | 2 | 3;
    texto: string;
    emocion?: string;
    timbreId?: string;
}

/** Voz asignada a un agente o personalidad (mapa persistido). */
export interface VozDeAgente {
    /** Modelo «prov/modelo», id de agente 1.58 o id de personalidad. */
    id: string;
    tipo: "escritor" | "revisor" | "agente158" | "personalidad" | "proceso";
    timbreId: string;
    emocion?: string;
}

// ── Utilidades de lectura ─────────────────────────────────────────────────────

/** Números en letras hasta doce, para que la voz suene natural. */
const LETRAS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];

/** 0–12 → palabra; el resto se dice con dígitos (suficiente para avisos). */
export function numeroEnLetras(n: number): string {
    const e = Math.round(n);
    return e >= 0 && e <= 12 ? LETRAS[e] : String(e);
}

/** Lee una propiedad de `datos` de forma segura (datos es `unknown`). */
function dato(datos: unknown, clave: string): unknown {
    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
        return (datos as Record<string, unknown>)[clave];
    }
    return undefined;
}

/** Texto corto de una propiedad de `datos`, o null si no es cadena útil. */
function datoTexto(datos: unknown, clave: string): string | null {
    const v = dato(datos, clave);
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
}

/** Número ≥ 0 de una propiedad de `datos`, o null. */
function datoNumero(datos: unknown, clave: string): number | null {
    const v = dato(datos, clave);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return null;
}

// ── Validación de preferencias ────────────────────────────────────────────────

/**
 * Sanea un valor cualesquiera (JSON persistido, payload de API) hasta dejar un
 * `PreferenciasVozMando` válido. Nunca lanza: lo que no cuadra cae al defecto.
 * El silencio queda acotado a ≥ 5 s (un aviso cada instante aturde) y el
 * volumen a 0.2–1.
 */
export function validarPreferenciasVoz(bruto: unknown): PreferenciasVozMando {
    const base = PREFERENCIAS_VOZ_POR_DEFECTO;
    if (!bruto || typeof bruto !== "object") {
        return { ...base, anunciar: { ...base.anunciar } };
    }
    const o = bruto as Record<string, unknown>;
    const a = (o.anunciar && typeof o.anunciar === "object" ? o.anunciar : {}) as Record<string, unknown>;
    const silencio = typeof o.silencioS === "number" && Number.isFinite(o.silencioS) ? o.silencioS : base.silencioS;
    const volumen = typeof o.volumenRelativo === "number" && Number.isFinite(o.volumenRelativo) ? o.volumenRelativo : base.volumenRelativo;
    return {
        activa: typeof o.activa === "boolean" ? o.activa : base.activa,
        timbreId: typeof o.timbreId === "string" && o.timbreId ? o.timbreId : null,
        anunciar: {
            vistoBueno: typeof a.vistoBueno === "boolean" ? a.vistoBueno : base.anunciar.vistoBueno,
            integradas: typeof a.integradas === "boolean" ? a.integradas : base.anunciar.integradas,
            fallidas: typeof a.fallidas === "boolean" ? a.fallidas : base.anunciar.fallidas,
            proveedores: typeof a.proveedores === "boolean" ? a.proveedores : base.anunciar.proveedores,
            publicaciones: typeof a.publicaciones === "boolean" ? a.publicaciones : base.anunciar.publicaciones,
            olaTerminada: typeof a.olaTerminada === "boolean" ? a.olaTerminada : base.anunciar.olaTerminada,
        },
        silencioS: Math.max(5, Math.round(silencio)),
        volumenRelativo: Math.min(1, Math.max(0.2, volumen)),
    };
}

// ── De eventos a anuncios ─────────────────────────────────────────────────────

/** Nombre amable de un proveedor para decirlo en voz alta. */
function nombreProveedor(bruto: string | null): string {
    const p = (bruto ?? "").toLowerCase();
    if (p.includes("nvidia") || p === "nim") return "NVIDIA";
    if (p.includes("xkiro")) return "xKiro";
    if (p.includes("aihubmix")) return "AIHubMix";
    if (p.includes("tokenrouter")) return "TokenRouter";
    if (p.includes("openrouter")) return "OpenRouter";
    if (p.includes("gemini") || p.includes("google")) return "Gemini";
    return bruto ?? "un proveedor";
}

/**
 * Frase de una tarea: su id corto («H2», «VZ1») o, si el evento no trae
 * `tarea`, una mención genérica. Nunca se lee el título completo: las frases
 * de aviso deben ser cortas (el título ya está en pantalla).
 */
function nombreTarea(e: EventoRelevo): string {
    return e.tarea.trim() || "la tarea";
}

/** Convierte UN evento en su anuncio, o null si no merece voz. */
function anuncioDeEvento(e: EventoRelevo, prefs: PreferenciasVozMando): Omit<AnuncioVoz, "timbreId"> | null {
    const t = nombreTarea(e);
    switch (e.tipo) {
        case "esperando_aprobacion": {
            if (!prefs.anunciar.vistoBueno) return null;
            // El motivo del dictamen es lo que importa para decidir.
            const motivo = datoTexto(e.datos, "motivo")
                ?? datoTexto(e.datos, "dictamen")
                ?? null;
            const texto = motivo
                ? `Tarea ${t} espera tu visto bueno: ${motivo}.`
                : `Tarea ${t} espera tu visto bueno.`;
            return { clave: e.id, prioridad: 1, texto, emocion: "seria" };
        }
        case "fallida": {
            if (!prefs.anunciar.fallidas) return null;
            const motivo = datoTexto(e.datos, "motivo") ?? datoTexto(e.datos, "error");
            const texto = motivo
                ? `Tarea ${t} fallida: ${motivo}.`
                : `Tarea ${t} fallida.`;
            return { clave: e.id, prioridad: 1, texto, emocion: "seria" };
        }
        case "publicado": {
            if (!prefs.anunciar.publicaciones) return null;
            const n = datoNumero(e.datos, "commits") ?? datoNumero(e.datos, "sinPush");
            const texto = n != null && n > 0
                ? `Publicado en producción: ${numeroEnLetras(n)} ${n === 1 ? "commit" : "commits"} del OS.`
                : "Publicado en producción.";
            return { clave: e.id, prioridad: 1, texto, emocion: "entusiasta" };
        }
        case "proveedor_caido": {
            if (!prefs.anunciar.proveedores) return null;
            const prov = nombreProveedor(datoTexto(e.datos, "proveedor") ?? e.texto);
            const relevo = datoTexto(e.datos, "sustituto") ?? datoTexto(e.datos, "relevo");
            const texto = relevo
                ? `Proveedor ${prov} caído; sigo con ${nombreProveedor(relevo)}.`
                : `Proveedor ${prov} caído.`;
            return { clave: e.id, prioridad: 2, texto, emocion: "seria" };
        }
        case "proveedor_recuperado": {
            if (!prefs.anunciar.proveedores) return null;
            const prov = nombreProveedor(datoTexto(e.datos, "proveedor") ?? e.texto);
            return { clave: e.id, prioridad: 2, texto: `Proveedor ${prov} recuperado.`, emocion: "alegre" };
        }
        case "integrada": {
            if (!prefs.anunciar.integradas) return null;
            const ola = datoTexto(e.datos, "ola");
            const texto = ola
                ? `Tarea ${t} integrada en la ola ${ola}.`
                : `Tarea ${t} integrada.`;
            return { clave: e.id, prioridad: 3, texto };
        }
        case "fin": {
            // Solo se anuncia si el evento es el fin de una ola completa.
            if (!prefs.anunciar.olaTerminada) return null;
            const ola = datoTexto(e.datos, "ola");
            if (!ola) return null;
            const integradas = datoNumero(e.datos, "integradas");
            const fallidas = datoNumero(e.datos, "fallidas");
            const partes: string[] = [];
            if (integradas != null) partes.push(`${numeroEnLetras(integradas)} integradas`);
            if (fallidas != null && fallidas > 0) partes.push(`${numeroEnLetras(fallidas)} fallidas`);
            const texto = partes.length
                ? `Ola ${ola} terminada: ${partes.join(", ")}.`
                : `Ola ${ola} terminada.`;
            return { clave: e.id, prioridad: 3, texto };
        }
        default:
            // latido, arranque, aviso, reenrutado… no se anuncian a pelo.
            return null;
    }
}

/** Busca la voz asignada al agente del que habla el evento. */
function timbreDelEvento(e: EventoRelevo, vocesPorAgente: Record<string, string>): string | undefined {
    // Se mira el modelo («prov/modelo») y luego el id de la tarea: dos claves
    // razonables para que una personalidad/agente tenga «su voz».
    const candidatos = [
        datoTexto(e.datos, "modelo"),
        datoTexto(e.datos, "agente"),
        datoTexto(e.datos, "personalidad"),
        e.tarea.trim() || null,
    ];
    for (const c of candidatos) {
        if (c && vocesPorAgente[c]) return vocesPorAgente[c];
    }
    return undefined;
}

/**
 * Traduce una tanda de eventos a anuncios listos para hablar:
 *  · solo los tipos que merecen voz (nunca `latido`/`arranque` sueltos);
 *  · respeta los interruptores de `prefs.anunciar`;
 *  · no repite claves ya anunciadas;
 *  · ordena por prioridad (1 antes) y, a igual prioridad, por hora `t`;
 *  · aplica la voz del agente si `vocesPorAgente` la tiene (si no, la
 *    preferida del Mando y, en su defecto, ninguna: el motor usará la activa).
 */
export function anunciosDe(
    eventos: EventoRelevo[],
    prefs: PreferenciasVozMando,
    yaAnunciados: Set<string>,
    vocesPorAgente: Record<string, string>,
): AnuncioVoz[] {
    if (!prefs.activa) return [];
    const salida: AnuncioVoz[] = [];
    for (const e of eventos) {
        if (!e || !e.id || yaAnunciados.has(e.id)) continue;
        const a = anuncioDeEvento(e, prefs);
        if (!a) continue;
        const timbreId = timbreDelEvento(e, vocesPorAgente) ?? prefs.timbreId ?? undefined;
        salida.push({ ...a, timbreId });
    }
    salida.sort((x, y) => x.prioridad - y.prioridad || x.clave.localeCompare(y.clave));
    return salida;
}

/**
 * Corta la lista según el silencio mínimo desde el ÚLTIMO aviso hablado
 * (`ultimoMs`). Si ya pasó el silencio, caben todos (se hablarán en cola, uno
 * tras otro). Si no, solo UNA alerta de prioridad 1 puede saltárselo: lo
 * urgente no espera a que pase la pausa, pero el diluvio de urgencias sí.
 */
export function planificar(
    anuncios: AnuncioVoz[],
    ahoraMs: number,
    ultimoMs: number,
    silencioS: number,
): AnuncioVoz[] {
    if (!anuncios.length) return [];
    const pausa = Math.max(5, silencioS) * 1000;
    if (ahoraMs - ultimoMs >= pausa) return anuncios.slice();
    const urgente = anuncios.find((a) => a.prioridad === 1);
    return urgente ? [urgente] : [];
}

// ── Voces por agente ──────────────────────────────────────────────────────────

/** Hash FNV-1a de 32 bits: barato, estable entre procesos y sin colisiones prácticas para ids. */
function hash32(texto: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Géneros en orden de rotación para alternar voces al asignar automáticamente. */
const GENEROS_ROTACION: Array<"masculina" | "femenina" | "neutra"> = ["masculina", "femenina", "neutra", "femenina", "masculina", "neutra"];

/**
 * Asigna una voz automática a un agente/personalidad SIN que la vea el
 * usuario: DETERMINISTA por hash del id (el mismo agente siempre recibe la
 * misma voz, en esta y en cualquier máquina con el mismo catálogo).
 *
 * `timbresDisponibles` son ids de `TIMBRES` con su género codificado en el
 * prefijo (`fem-`, `masc-`, `neu-`): se alterna el género según el hash para
 * que un enjambre de agentes no suene a coro monocorde. Si nada encaja con el
 * género buscado, se usa el id más próximo del catálogo por hash.
 */
export function asignarVozAutomatica(
    id: string,
    tipo: VozDeAgente["tipo"],
    timbresDisponibles: string[],
): VozDeAgente {
    const lista = timbresDisponibles.filter(Boolean);
    const h = hash32(`${tipo}:${id}`);
    let timbreId: string;
    if (lista.length) {
        const genero = GENEROS_ROTACION[h % GENEROS_ROTACION.length];
        const delGenero = lista.filter((t) => t.startsWith(genero.slice(0, 3)));
        const candidatos = delGenero.length ? delGenero : lista;
        timbreId = candidatos[h % candidatos.length];
    } else {
        // Catálogo vacío: el motor usará el timbre activo del OS.
        timbreId = "neu-zenit";
    }
    // El procesos del sistema hablan serios; los agentes creativos, alegres.
    const emocion = tipo === "proceso" ? "seria" : tipo === "revisor" ? "serena" : undefined;
    return { id, tipo, timbreId, emocion };
}

// ── «Léeme el estado» ─────────────────────────────────────────────────────────

/**
 * Párrafo de 2–3 frases para el botón «Léeme el estado» del Mando. Resume lo
 * que importa AHORA: ola activa, recuento y salud de proveedores. No mira
 * pantallas: solo los números que recibe.
 */
export function resumenParaLeer(estado: {
    olaActiva?: string;
    cuentas?: { integradas: number; enCurso: number; fallidas: number; pendientes: number };
    proveedoresCaidos?: string[];
    sinPublicar?: number;
}): string {
    const frases: string[] = [];
    const c = estado.cuentas;
    if (estado.olaActiva && c) {
        frases.push(
            `En la ola ${estado.olaActiva}: ${numeroEnLetras(c.integradas)} integradas, ` +
            `${numeroEnLetras(c.enCurso)} en curso, ${numeroEnLetras(c.fallidas)} fallidas ` +
            `y ${numeroEnLetras(c.pendientes)} pendientes.`,
        );
    } else if (estado.olaActiva) {
        frases.push(`La ola activa es la ${estado.olaActiva}.`);
    } else if (c && c.pendientes > 0) {
        frases.push(`Hay ${numeroEnLetras(c.pendientes)} tareas pendientes sin ola activa.`);
    } else {
        frases.push("No hay ola activa ni tareas pendientes.");
    }
    const caidos = (estado.proveedoresCaidos ?? []).map(nombreProveedor);
    if (caidos.length === 1) {
        frases.push(`El proveedor ${caidos[0]} está caído.`);
    } else if (caidos.length > 1) {
        frases.push(`Están caídos ${caidos.slice(0, -1).join(", ")} y ${caidos[caidos.length - 1]}.`);
    } else {
        frases.push("Todos los proveedores responden.");
    }
    if (estado.sinPublicar != null && estado.sinPublicar > 0) {
        frases.push(`Quedan ${numeroEnLetras(estado.sinPublicar)} commits sin publicar.`);
    }
    return frases.slice(0, 3).join(" ");
}
