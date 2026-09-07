/**
 * NORMALIZACIÓN DE NÚMEROS EN ESPAÑOL (Tarea J1a · Ola 264 · Forja fases 2-3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte cifras a palabras con concordancia de género para que el frontend
 * (y, por extensión, la voz) hable en español natural: «21 archivos», «dos mil
 * veintiséis», «14:30 → catorce y media».
 *
 * Decisiones fijas:
 *  · Módulo PURO y SIN dependencias: no importa nada, no toca DOM ni estado.
 *    Así se puede usar desde el cliente, el servidor o un worker de voz sin
 *    riesgo de romper el árbol de dependencias.
 *  · Todo el texto se construye por CONTIGUIDAD: cada componente de millares
 *    añade su propia palabra y el espacio separador, sin recursión sobre
 *    partes ya resueltas (menos estados intermedios que probar).
 *  · El género («veintiún»/«veintiuna») se resuelve en la capa de cardinal
 *    con sustantivo, porque la forma apocopada solo aplica DELANTE de él.
 *
 * Fuente de las reglas: Real Academia Española (Ortografía 2010) para los
 * ordinales y la apócope de «uno» → «un».
 *
 * Módulo creado como hito pendiente de la fase 1 de la Forja («frontend en
 * español»). (2026-09-06, Ola 264)
 */

const GENERO_SUSTANTIVO_MASCULINO = new Set([
    "día",
    "mapa",
    "problema",
    "sistema",
    "tema",
    "idioma",
]);

const UNIDADES = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
] as const;

const DECENAS = [
    "",
    "diez",
    "veinte",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
] as const;

const DIEZ_A_DIECINUEVE = [
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
] as const;

const CENTENAS = [
    "",
    "cien",
    "doscientos",
    "trescientos",
    "cuatrocientos",
    "quinientos",
    "seiscientos",
    "setecientos",
    "ochocientos",
    "novecientos",
] as const;

// ordinales hasta 100: índice = n (1..100). 21-99 se componen con «‑».
const ORDINALES_UNIDAD = ["", "primero", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno"];
const ORDINALES_DECENA = ["", "décimo", "vigésimo", "trigésimo", "cuadragésimo", "quincuagésimo", "sexagésimo", "septuagésimo", "octogésimo", "nonagésimo"];
const ORDINALES_DIEZ = [
    "undécimo",
    "duodécimo",
    "decimotercero",
    "decimocuarto",
    "decimoquinto",
    "decimosexto",
    "decimoséptimo",
    "decimoctavo",
    "decimonoveno",
];

/** Cardinal de 0..999 en palabras (sin apócope: devuelve «uno», «veintiuno»…). */
function cardinalHastaMil(n: number, genero: "m" | "f"): string {
    if (n === 0) return "";
    const femenino = genero === "f";
    if (n < 10) return n === 1 && femenino ? "una" : UNIDADES[n];
    if (n < 20) return DIEZ_A_DIECINUEVE[n - 10];
    if (n < 30) {
        if (n === 21) return femenino ? "veintiuna" : "veintiuno";
        const unidad = UNIDADES[n % 10];
        if (unidad === "") return "veinte";
        // 22-29 llevan tilde en el componente simple (veintidós, veintiséis…).
        const acento: Record<string, string> = { dos: "dos", tres: "tres", seis: "séis" };
        const unidadTilde = acento[unidad] ?? unidad;
        return `veinti${unidadTilde}`;
    }
    if (n < 100) {
        const decena = DECENAS[Math.floor(n / 10)];
        const resto = n % 10;
        if (resto === 0) return decena;
        return `${decena} y ${cardinalHastaMil(resto, genero)}`;
    }
    const centena = Math.floor(n / 100);
    const resto = n % 100;
    // «cien» solo cuando no le sigue nada; «ciento» + resto en el resto de casos.
    if (resto === 0) return centena === 1 ? "cien" : CENTENAS[centena];
    const palabraCien = centena === 1 ? "ciento" : CENTENAS[centena];
    return `${palabraCien} ${cardinalHastaMil(resto, genero)}`;
}

/** Cardinal de 1..999 999 (0..999 999 incluye cero para el grupo de miles). */
function cardinalHastaMillon(n: number, genero: "m" | "f"): string {
    if (n < 1000) return cardinalHastaMil(n, genero);
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const palabraMiles = miles === 1 ? "mil" : `${cardinalHastaMil(miles, genero)} mil`;
    const restoPalabra = resto === 0 ? "" : ` ${cardinalHastaMil(resto, genero)}`;
    return `${palabraMiles}${restoPalabra}`;
}

/**
 * Cardinal de 0 a 999 999 999 999 con las reglas del español.
 * Negativos se prefijan con «menos». Sin apócope salvo en millón/millones.
 */
export function numeroAPalabras(n: number, genero: "m" | "f" = "m"): string {
    if (n === 0) return "cero";
    const negativo = n < 0;
    const abs = Math.abs(n);
    let base: string;

    if (abs < 1_000_000) {
        base = cardinalHastaMillon(abs, genero);
    } else {
        const millones = Math.floor(abs / 1_000_000);
        const resto = abs % 1_000_000;
        const palabraMillones =
            millones === 1
                ? "un millón"
                : `${cardinalHastaMil(millones, genero)} millones`;
        base = resto === 0 ? palabraMillones : `${palabraMillones} ${cardinalHastaMillon(resto, genero)}`;
    }

    return negativo ? `menos ${base}` : base;
}

/**
 * Resuelve el género de un sustantivo por su terminación (singular -a →
 * femenino), salvo las excepciones cortas habituales (día, mapa, problema…).
 * Se normaliza el plural (terminado en -s) a su singular antes de mirar la -a.
 */
function generoDeSustantivo(sustantivo: string): "m" | "f" {
    const singular = sustantivo.endsWith("s") ? sustantivo.slice(0, -1) : sustantivo;
    if (GENERO_SUSTANTIVO_MASCULINO.has(singular)) return "m";
    return singular.endsWith("a") ? "f" : "m";
}

/**
 * Cardinal apocopado ante sustantivo: «21 archivos» → «veintiún archivos»,
 * «21 tareas» → «veintiuna tareas», «1 archivo» → «un archivo».
 */
export function cardinalAnteSustantivo(n: number, sustantivo: string): string {
    const genero = generoDeSustantivo(sustantivo);
    const numero = numeroAPalabras(n, genero);
    // Apócope de «uno» solo en masculino y siempre delante del sustantivo.
    if (genero === "m") {
        return `${numero.replace(/\bveintiuno$/, "veintiún").replace(/\buno$/, "un")} ${sustantivo}`;
    }
    return `${numero} ${sustantivo}`;
}

/**
 * Convierte una cifra decimal en texto («1,5» → «uno coma cinco»).
 * Acepta coma decimal siempre; punto decimal solo si hay ≤ 2 decimales y no
 * es separador de miles («1.000» → «mil»).
 */
export function decimalAPalabras(texto: string): string {
    // «1.000» con punto: si la parte tras el punto tiene 3+ cifras es miles.
    if (texto.includes(".") && !texto.includes(",")) {
        const decimales = texto.split(".")[1];
        if (decimales !== undefined && decimales.length > 2) {
            // Punto de miles: se quitan los puntos y se lee como entero.
            return numeroAPalabras(Number(texto.split(".").join("")));
        }
    }
    const numero = Number(texto.replace(",", "."));
    if (Number.isNaN(numero)) return texto;
    const separador = texto.includes(",") ? "," : ".";
    const [entera, decimal] = texto.split(separador);
    const palabraEntera = numeroAPalabras(Number(entera || "0"));
    if (decimal === undefined) return palabraEntera;
    // La parte decimal se lee como cardinal completo («14» → «catorce»).
    const palabraDecimal = numeroAPalabras(Number(decimal || "0"));
    return `${palabraEntera} coma ${palabraDecimal}`;
}

/**
 * Ordinal de 1..100 con concordancia de género: «primero»/«primera»,
 * «vigésimo»/«vigésima», «centésimo». Fuera de rango devuelve el cardinal.
 */
export function ordinalAPalabras(n: number, genero: "m" | "f" = "m"): string {
    const raiz = ordinalAPalabrasMasc(n);
    return genero === "f" ? raiz.replace(/o$/, "a") : raiz;
}

/** Ordinal masculino en bruto; base para el femenino vía sufijo. */
function ordinalAPalabrasMasc(n: number): string {
    if (n < 1 || n > 100) return numeroAPalabras(n);
    if (n <= 10) return ORDINALES_UNIDAD[n];
    if (n <= 19) return ORDINALES_DIEZ[n - 11];
    if (n === 100) return "centésimo";
    if (n % 10 === 0) return ORDINALES_DECENA[Math.floor(n / 10)];
    const decena = ORDINALES_DECENA[Math.floor(n / 10)];
    const unidad = ORDINALES_UNIDAD[n % 10];
    return `${decena} ${unidad}`;
}

/**
 * Hora de 0..23 en palabras: «nueve en punto», «catorce y cinco»,
 * «catorce y cuarto», «catorce y media», «catorce menos cuarto» para :45,
 * «catorce y cincuenta». Fuera de rango se devuelve el número literal.
 */
export function horaAPalabras(hh: number, mm: number): string {
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return `${hh}:${mm}`;
    }
    const horas = numeroAPalabras(hh);
    if (mm === 0) return `${horas} en punto`;
    if (mm === 15) return `${horas} y cuarto`;
    if (mm === 30) return `${horas} y media`;
    if (mm === 45) return `${numeroAPalabras(hh + 1)} menos cuarto`;
    return `${horas} y ${numeroAPalabras(mm)}`;
}

const MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

/**
 * Fecha completa en palabras: «seis de septiembre de dos mil veintiséis».
 * El día 1 se lee «primero»; fuera de rango se devuelve la fecha literal.
 */
export function fechaAPalabras(d: number, m: number, a: number): string {
    if (d < 1 || d > 31 || m < 1 || m > 12) return `${d}/${m}/${a}`;
    const dia = d === 1 ? "primero" : numeroAPalabras(d);
    const mes = MESES[m - 1];
    const ano = numeroAPalabras(Math.abs(a));
    return `${dia} de ${mes} de ${ano}`;
}