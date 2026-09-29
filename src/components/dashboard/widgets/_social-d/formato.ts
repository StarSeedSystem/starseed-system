/**
 * Formato del paquete «Social, red y archivos» (Ola 0929 · D) — PURO.
 *
 * Tiempos relativos en español, iniciales, un tono estable por nombre, agrupación por día y la
 * puntuación de relevancia de una publicación. Sin `window`, sin red y sin azar: todo entra por
 * parámetro, así que se prueba entero y da lo mismo en el servidor que en la neurona.
 */

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Medianoche local del día de `ms`. */
function inicioDia(ms: number): number {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Días naturales entre dos instantes (0 = mismo día, 1 = ayer…). */
export function diasEntre(ms: number, ahora: number): number {
    return Math.round((inicioDia(ahora) - inicioDia(ms)) / DIA);
}

/**
 * «ahora», «hace 5 min», «hace 3 h», «ayer», «hace 4 días», «12 sep». Un instante futuro (reloj
 * desfasado entre neuronas) se dice «ahora», nunca «hace -3 min».
 */
export function tiempoRelativo(ms: number, ahora: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const d = ahora - ms;
    if (d < MIN) return "ahora";
    if (d < HORA) return `hace ${Math.floor(d / MIN)} min`;
    const dias = diasEntre(ms, ahora);
    if (dias === 0) return `hace ${Math.floor(d / HORA)} h`;
    if (dias === 1) return "ayer";
    if (dias < 7) return `hace ${dias} días`;
    const f = new Date(ms);
    const mismoAno = f.getFullYear() === new Date(ahora).getFullYear();
    return `${f.getDate()} ${MESES[f.getMonth()]}${mismoAno ? "" : ` ${f.getFullYear()}`}`;
}

/** Versión corta para columnas estrechas: «ahora», «5 min», «3 h», «ayer», «4 d», «12 sep». */
export function tiempoCorto(ms: number, ahora: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const d = ahora - ms;
    if (d < MIN) return "ahora";
    if (d < HORA) return `${Math.floor(d / MIN)} min`;
    const dias = diasEntre(ms, ahora);
    if (dias === 0) return `${Math.floor(d / HORA)} h`;
    if (dias === 1) return "ayer";
    if (dias < 7) return `${dias} d`;
    const f = new Date(ms);
    return `${f.getDate()} ${MESES[f.getMonth()]}`;
}

/** Hora «14:05» de un instante. */
export function horaCorta(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Fecha completa para `title`/lectores de pantalla: «lunes 22 de septiembre, 14:05». */
export function fechaLarga(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const d = new Date(ms);
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${nombreMes(d.getMonth())}, ${horaCorta(ms)}`;
}

function nombreMes(i: number): string {
    return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][i] ?? "";
}

/** Rótulo del día de un grupo: «Hoy», «Ayer», «El lunes», «12 de septiembre». */
export function rotuloDia(ms: number, ahora: number): string {
    const dias = diasEntre(ms, ahora);
    if (dias <= 0) return "Hoy";
    if (dias === 1) return "Ayer";
    const d = new Date(ms);
    if (dias < 7) return `El ${DIAS[d.getDay()]}`;
    return `${d.getDate()} de ${nombreMes(d.getMonth())}`;
}

export interface GrupoDia<T> {
    clave: string;
    rotulo: string;
    elementos: T[];
}

/** Agrupa (ya ordenados de más nuevo a más viejo) por día natural, conservando el orden. */
export function agruparPorDia<T>(elementos: T[], tiempo: (e: T) => number, ahora: number): GrupoDia<T>[] {
    const grupos: GrupoDia<T>[] = [];
    for (const e of elementos) {
        const ms = tiempo(e);
        const clave = ms > 0 ? String(inicioDia(ms)) : "sin-fecha";
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.clave === clave) ultimo.elementos.push(e);
        else grupos.push({ clave, rotulo: ms > 0 ? rotuloDia(ms, ahora) : "Sin fecha", elementos: [e] });
    }
    return grupos;
}

/** Iniciales legibles (máximo 2): «Alex Bordón» → «AB»; «@luz» → «L»; vacío → «·». */
export function iniciales(nombre: string | null | undefined): string {
    const limpio = (nombre ?? "").replace(/^@+/, "").trim();
    if (!limpio) return "·";
    const partes = limpio.split(/[\s._-]+/).filter(Boolean);
    const letras = partes.slice(0, 2).map((p) => Array.from(p)[0]?.toUpperCase() ?? "");
    return letras.join("") || "·";
}

/** Tono (0-359) estable para un texto: la misma persona siempre tiene el mismo color. */
export function tonoDe(texto: string | null | undefined): number {
    const s = texto ?? "";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
}

/** Color hex estable para un texto, en la gama de la marca (saturado y claro sobre vidrio). */
export function colorDe(texto: string | null | undefined): string {
    return hslAHex(tonoDe(texto), 0.68, 0.62);
}

/** hsl → #rrggbb (s y l en 0-1). */
export function hslAHex(h: number, s: number, l: number): string {
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hx = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    return `#${hx(f(0))}${hx(f(8))}${hx(f(4))}`;
}

/** Recorta en el último espacio antes de `max` (nunca a mitad de palabra) y añade «…». */
export function recortar(texto: string | null | undefined, max: number): string {
    const t = (texto ?? "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max);
    const espacio = corte.lastIndexOf(" ");
    return `${(espacio > max * 0.5 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** «1 miembro» / «3 miembros». */
export function plural(n: number, uno: string, varios: string): string {
    return `${formatoNumero(n)} ${n === 1 ? uno : varios}`;
}

const COMPACTO = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });
const ENTERO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

/** 1.234 → «1234»; 12.345 → «12,3 mil» (compacto a partir de 10.000). */
export function formatoNumero(n: number): string {
    if (!Number.isFinite(n)) return "0";
    return Math.abs(n) >= 10_000 ? COMPACTO.format(n) : ENTERO.format(n);
}

export interface SenalesPublicacion {
    reacciones: number;
    comentarios: number;
    ms: number;
}

/**
 * Relevancia honesta de una publicación: solo señales reales (reacciones, comentarios) y su
 * frescura. Gravedad a la manera de los agregadores: (1 + reacciones + 2·comentarios) /
 * (horas + 2)^1,4. Sin señales, manda la frescura — nunca un número inventado.
 */
export function relevancia(p: SenalesPublicacion, ahora: number): number {
    const horas = Math.max(0, (ahora - p.ms) / HORA);
    const peso = 1 + Math.max(0, p.reacciones) + 2 * Math.max(0, p.comentarios);
    return peso / Math.pow(horas + 2, 1.4);
}

/** ¿Una publicación es de las últimas 24 h? */
export function esReciente(ms: number, ahora: number): boolean {
    return ms > 0 && ahora - ms < DIA;
}

/** ISO o texto de fecha → ms (0 si no se entiende). */
export function msDe(iso: string | null | undefined): number {
    if (!iso) return 0;
    const n = Date.parse(iso);
    return Number.isNaN(n) ? 0 : n;
}

/** Publicaciones por día de los últimos `dias` días (el último cubo es hoy). */
export function seriePorDia(instantes: number[], ahora: number, dias = 7): number[] {
    const hoy = inicioDia(ahora);
    const cubos = new Array<number>(dias).fill(0);
    for (const ms of instantes) {
        if (!(ms > 0)) continue;
        const i = dias - 1 - Math.round((hoy - inicioDia(ms)) / DIA);
        if (i >= 0 && i < dias) cubos[i] += 1;
    }
    return cubos;
}

/** Filtro de texto sin tildes ni mayúsculas. */
export function coincide(texto: string | null | undefined, consulta: string): boolean {
    const q = plegar(consulta).trim();
    if (!q) return true;
    return plegar(texto ?? "").includes(q);
}

export function plegar(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Dominio legible de una URL («starseed.red»), o null. */
export function dominioDe(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

/** ¿Una URL parece una imagen servible en <img>? (http(s) o data:image). */
export function esImagen(url: string | null | undefined): boolean {
    if (!url) return false;
    if (/^data:image\//i.test(url)) return true;
    if (!/^https?:\/\//i.test(url)) return false;
    return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url) || /\/(image|images|img|media|storage)\//i.test(url);
}

/** ¿Una URL parece un vídeo? */
export function esVideo(url: string | null | undefined): boolean {
    return !!url && /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url);
}
