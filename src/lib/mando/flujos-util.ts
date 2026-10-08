/**
 * Utilidades puras del motor de flujos, compartidas entre cliente y servidor.
 * No contiene "use client" ni dependencias de React/DOM.
 */

export interface Posicion {
    x: number;
    y: number;
}

export interface NodoUI {
    id: string;
    tipo: string;
    configuracion: Record<string, unknown>;
    reintentos: number;
    espera_ms: number;
    posicion: Posicion;
}

export interface ConexionUI {
    origen: string;
    destino: string;
}

export interface FlujoUI {
    id: string;
    nombre: string;
    nodos: NodoUI[];
    conexiones: ConexionUI[];
}

export interface ResumenFlujo {
    id: string;
    nombre: string;
    nodos: number;
    disparador: string | null;
}

export interface TipoNodo {
    tipo: string;
    etiqueta: string;
    disparador: boolean;
}

/** Paleta de tipos del motor propio (FLU1005B): disparadores primero. */
export const TIPOS_NODO: TipoNodo[] = [
    { tipo: "webhook", etiqueta: "Webhook", disparador: true },
    { tipo: "cron", etiqueta: "Cron", disparador: true },
    { tipo: "bus", etiqueta: "Bus del enjambre", disparador: true },
    { tipo: "chat", etiqueta: "Chat Director", disparador: true },
    { tipo: "http", etiqueta: "HTTP", disparador: false },
    { tipo: "ntfy", etiqueta: "ntfy", disparador: false },
    { tipo: "telegram", etiqueta: "Telegram", disparador: false },
    { tipo: "chat_director", etiqueta: "Aviso al Chat Director", disparador: false },
    { tipo: "ia", etiqueta: "Modelo de IA", disparador: false },
    { tipo: "conocimiento", etiqueta: "Conocimiento", disparador: false },
    { tipo: "si", etiqueta: "Condición", disparador: false },
    { tipo: "switch", etiqueta: "Switch", disparador: false },
    { tipo: "fusion", etiqueta: "Fusión", disparador: false },
    { tipo: "set", etiqueta: "Fijar campos", disparador: false },
    { tipo: "esperar", etiqueta: "Esperar", disparador: false },
];

const ANCHO_NODO = 176;
const ALTO_NODO = 56;

function numero(valor: unknown, respaldo: number): number {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) ? n : respaldo;
}

/** Traduce el JSON del servicio (poste de `modelo.py`) a `FlujoUI`, tolerante. */
export function flujoDesdeServidor(datos: unknown): FlujoUI | null {
    if (!datos || typeof datos !== "object") return null;
    const f = datos as Record<string, unknown>;
    if (typeof f.id !== "string" || !Array.isArray(f.nodos)) return null;
    const nodos: NodoUI[] = [];
    let fila = 0;
    for (const crudo of f.nodos) {
        if (!crudo || typeof crudo !== "object") continue;
        const n = crudo as Record<string, unknown>;
        if (typeof n.id !== "string" || typeof n.tipo !== "string") continue;
        const config = n.configuracion && typeof n.configuracion === "object"
            ? { ...(n.configuracion as Record<string, unknown>) }
            : {};
        const pos = config.posicion as Record<string, unknown> | undefined;
        delete config.posicion;
        // Descartar nodos sin id válido
        if (!n.id || typeof n.id !== "string" || n.id.trim() === "") {
            continue;
        }
        nodos.push({
            id: n.id,
            tipo: n.tipo,
            configuracion: config,
            reintentos: numero(n.reintentos, 0),
            espera_ms: numero(n.espera_ms, 0),
            posicion: {
                x: numero(pos?.x, 40 + (fila % 3) * 220),
                y: numero(pos?.y, 40 + Math.floor(fila / 3) * 120),
            },
        });
        fila += 1;
    }
    const conocidos = new Set(nodos.map((n) => n.id));
    const conexiones: ConexionUI[] = [];
    if (Array.isArray(f.conexiones)) {
        for (const c of f.conexiones) {
            if (!c || typeof c !== "object") continue;
            const { origen, destino } = c as Record<string, unknown>;
            if (conocidos.has(String(origen)) && conocidos.has(String(destino))) {
                conexiones.push({ origen: String(origen), destino: String(destino) });
            }
        }
    }
    return {
        id: f.id,
        nombre: typeof f.nombre === "string" ? f.nombre : f.id,
        nodos,
        conexiones,
    };
}

/** El `FlujoUI` de vuelta al JSON que esperan la ruta y el motor Python. */
export function flujoParaServidor(flujo: FlujoUI): Record<string, unknown> {
    return {
        id: flujo.id,
        nombre: flujo.nombre,
        nodos: flujo.nodos.map((n) => ({
            id: n.id,
            tipo: n.tipo,
            configuracion: { ...n.configuracion, posicion: { ...n.posicion } },
            reintentos: n.reintentos,
            espera_ms: n.espera_ms,
        })),
        conexiones: flujo.conexiones.map((c) => ({ ...c })),
    };
}

/** Curva SVG cúbica entre el puerto de salida del origen y el del destino. */
export function rutaConexion(origen: Posicion, destino: Posicion): string {
    const salto = Math.max(40, Math.abs(destino.x - origen.x) / 2);
    return `M ${origen.x} ${origen.y} C ${origen.x + salto} ${origen.y}, ${destino.x - salto} ${destino.y}, ${destino.x} ${destino.y}`;
}

/** Puerto de salida (derecha) o de entrada (izquierda) de un nodo del lienzo. */
export function puertoDe(nodo: NodoUI, lado: "entrada" | "salida"): Posicion {
    return {
        x: nodo.posicion.x + (lado === "salida" ? ANCHO_NODO : 0),
        y: nodo.posicion.y + ALTO_NODO / 2,
    };
}

/** Id nuevo `tipo-N` que no choque con los existentes. */
export function nuevoIdNodo(nodos: NodoUI[], tipo: string): string {
    const base = tipo.replace(/_/g, "-");
    const usados = new Set(nodos.map((n) => n.id));
    let n = 1;
    while (usados.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

/** Campos por tipo de nodo, en el orden del motor. */
export interface CampoNodo {
    clave: string;
    etiqueta: string;
    tipo: "texto" | "area" | "numero" | "variable" | "select" | "casilla";
    opciones?: { valor: string; etiqueta: string }[];
    ayuda?: string;
}

export const CAMPOS_POR_TIPO: Record<string, CampoNodo[]> = {
    webhook: [
        { clave: "ruta", etiqueta: "Ruta del webhook", tipo: "texto", ayuda: "Letras, dígitos, guion y guion bajo; firma HMAC en la entrada." },
    ],
    cron: [
        { clave: "expresion", etiqueta: "Expresión cron", tipo: "texto", ayuda: "minuto hora día mes día-semana (cinco campos)." },
    ],
    bus: [
        { clave: "tipos", etiqueta: "Tipos de evento", tipo: "texto", ayuda: "Lista separada por comas: commit, rechazada, publicada…" },
    ],
    chat: [],
    http: [
        { clave: "metodo", etiqueta: "Método", tipo: "select", opciones: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ valor: m, etiqueta: m })) },
        { clave: "url", etiqueta: "URL", tipo: "texto" },
        { clave: "credencial", etiqueta: "Credencial (nombre de variable)", tipo: "variable" },
        { clave: "cuerpo", etiqueta: "Cuerpo", tipo: "area" },
    ],
    ntfy: [
        { clave: "tema", etiqueta: "Tema", tipo: "texto" },
        { clave: "titulo", etiqueta: "Título", tipo: "texto" },
        { clave: "mensaje", etiqueta: "Mensaje", tipo: "area" },
        { clave: "servidor_env", etiqueta: "Servidor (nombre de variable)", tipo: "variable", ayuda: "Sin valor: https://ntfy.sh." },
    ],
    telegram: [
        { clave: "chat_id", etiqueta: "Chat de destino", tipo: "texto" },
        { clave: "texto", etiqueta: "Texto", tipo: "area" },
    ],
    chat_director: [
        { clave: "texto", etiqueta: "Texto", tipo: "area" },
        { clave: "canal", etiqueta: "Canal", tipo: "texto" },
    ],
    ia: [
        { clave: "prompt", etiqueta: "Prompt", tipo: "area", ayuda: "Admite {{ $json.campo }} y {{ $nodo.id.campo }}." },
        { clave: "campo", etiqueta: "Campo de salida", tipo: "texto" },
    ],
    conocimiento: [
        { clave: "base", etiqueta: "Base de conocimiento", tipo: "texto" },
        { clave: "consulta", etiqueta: "Consulta", tipo: "area" },
        { clave: "k", etiqueta: "Fragmentos (k)", tipo: "numero" },
    ],
    si: [
        { clave: "condicion", etiqueta: "Condición", tipo: "texto", ayuda: "Expresión segura, sin eval: «$json.estado == 'ok'»." },
    ],
    switch: [
        { clave: "expresion", etiqueta: "Expresión", tipo: "texto" },
        { clave: "casos", etiqueta: "Casos (JSON)", tipo: "area" },
    ],
    fusion: [
        { clave: "modo", etiqueta: "Modo", tipo: "select", opciones: [
            { valor: "concatenar", etiqueta: "Concatenar" },
            { valor: "parear", etiqueta: "Parear" },
        ] },
    ],
    set: [
        { clave: "campos", etiqueta: "Campos (JSON)", tipo: "area" },
        { clave: "conservar", etiqueta: "Conservar el ítem original", tipo: "casilla" },
    ],
    esperar: [
        { clave: "ms", etiqueta: "Espera (ms)", tipo: "numero" },
    ],
};