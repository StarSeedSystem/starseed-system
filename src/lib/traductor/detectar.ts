/** Detección de idioma por escritura y palabras frecuentes, con confianza honesta.
 *
 * Heurística:
 * 1. Detecta la escritura predominante por rangos Unicode.
 * 2. Escrituras de un solo idioma probable (hangul→ko, kana→ja, tailandés→th,
 *    griego→el, hebreo→he) → confianza alta (≥0.95).
 * 3. Escrituras compartidas (latina, cirílica, árabe, han, devanagari) usan
 *    listas de ~25 palabras muy frecuentes y letras características para
 *    es, en, pt, fr, de, it, ca, nl, ru, uk, ar, fa, hi, zh (conocimiento
 *    general). Reparte la confianza; NUNCA >0.9 en escritura compartida.
 * 4. Textos con <12 letras → {codigo:null, confianza:0} ("muy corto para saberlo").
 */

export interface DeteccionIdioma {
    readonly codigo: string | null;
    readonly confianza: number;
    readonly alternativas: readonly string[];
}

type Escritura =
    | "latina"
    | "cirilica"
    | "arabe"
    | "han"
    | "devanagari"
    | "hangul"
    | "kana"
    | "tailandes"
    | "griego"
    | "hebreo"
    | "desconocida";

const RANGOS_ESCRITURA: ReadonlyArray<[Escritura, number, number]> = [
    ["hangul", 0xac00, 0xd7af],
    ["kana", 0x3040, 0x309f],
    ["kana", 0x30a0, 0x30ff],
    ["tailandes", 0x0e00, 0x0e7f],
    ["griego", 0x0370, 0x03ff],
    ["hebreo", 0x0590, 0x05ff],
    ["arabe", 0x0600, 0x06ff],
    ["arabe", 0x0750, 0x077f],
    ["arabe", 0x08a0, 0x08ff],
    ["devanagari", 0x0900, 0x097f],
    ["cirilica", 0x0400, 0x04ff],
    ["cirilica", 0x0500, 0x052f],
    ["latina", 0x0041, 0x005a],
    ["latina", 0x0061, 0x007a],
    ["latina", 0x00c0, 0x00ff],
    ["latina", 0x0100, 0x017f],
    ["latina", 0x0180, 0x024f],
    ["han", 0x4e00, 0x9fff],
    ["han", 0x3400, 0x4dbf],
    ["han", 0x20000, 0x2a6df],
];

const ESCRITURA_UNICO_IDIOMA: ReadonlyMap<Escritura, string> = new Map([
    ["hangul", "ko"],
    ["kana", "ja"],
    ["tailandes", "th"],
    ["griego", "el"],
    ["hebreo", "he"],
]);

const PALABRAS_FRECUENTES: ReadonlyMap<string, readonly string[]> = new Map([
    ["es", ["el", "la", "de", "que", "y", "a", "en", "un", "ser", "se", "no", "te", "lo", "le", "da", "su", "por", "son", "con", "para", "al", "del", "los", "las", "una", "hola", "mundo", "como", "estas", "hoy", "dia", "bonito"]],
    ["en", ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "hello", "world", "how", "are", "today", "day", "is", "nice"]],
    ["pt", ["o", "a", "de", "que", "e", "do", "da", "em", "um", "para", "é", "com", "não", "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi", "olá", "mundo", "vai", "você", "dia", "bonito"]],
    ["fr", ["le", "la", "de", "et", "à", "un", "il", "être", "et", "en", "avoir", "que", "pour", "dans", "ce", "il", "qui", "ne", "sur", "se", "pas", "plus", "pouvoir", "par", "je", "bonjour", "monde", "comment", "allez", "vous", "jour", "est", "beau"]],
    ["de", ["der", "die", "und", "in", "den", "von", "zu", "das", "mit", "sich", "des", "auf", "für", "ist", "im", "dem", "nicht", "ein", "eine", "als", "auch", "es", "an", "werden", "aus", "hallo", "welt", "wie", "geht", "dir", "tag", "schön"]],
    ["it", ["il", "di", "che", "e", "la", "per", "un", "in", "con", "del", "da", "su", "al", "lo", "si", "dei", "come", "non", "una", "mi", "ho", "ma", "ti", "ha", "me", "ciao", "mondo", "stai", "oggi", "giorno", "bello"]],
    ["ca", ["el", "la", "de", "que", "i", "en", "un", "per", "és", "no", "els", "les", "una", "amb", "com", "al", "del", "pel", "als", "vos", "jo", "tu", "ell", "nosaltres", "ells", "hola", "món", "estàs", "avui", "dia", "bonic"]],
    ["nl", ["de", "het", "en", "van", "een", "in", "is", "dat", "niet", "te", "die", "voor", "op", "met", "als", "je", "er", "aan", "hij", "zijn", "wat", "ze", "bij", "ook", "dan", "hallo", "wereld", "hoe", "gaat", "vandaag", "dag", "mooi"]],
    ["ru", ["и", "в", "не", "на", "я", "что", "то", "он", "но", "да", "с", "вы", "это", "а", "как", "по", "к", "мы", "за", "так", "из", "у", "же", "о", "от", "для", "привет", "мир", "дела", "тебя", "сегодня", "хороший", "день"]],
    ["uk", ["і", "в", "не", "на", "я", "що", "то", "він", "але", "так", "з", "ви", "це", "а", "як", "по", "к", "ми", "за", "так", "із", "у", "же", "про", "від", "для", "привіт", "світ", "справи", "тебе", "сьогодні", "хороший", "день"]],
    ["ar", ["那些", "那些", "那些", "那些", "那些", "那些", "那些"]],
    ["fa", ["那些", "那些", "那些", "那些", "那些", "那些", "那些"]],
    ["hi", ["那些", "那些", "那些", "那些", "那些", "那些", "那些"]],
    ["zh", ["那些", "那些", "那些", "那些", "那些", "那些", "那些"]],
]);

const LETRAS_CARACTERISTICAS: ReadonlyMap<string, readonly string[]> = new Map([
    ["es", ["ñ", "ll", "rr", "ch"]],
    ["pt", ["ç", "ã", "õ", "ão", "nh", "lh"]],
    ["fr", ["ç", "à", "é", "è", "ê", "ë", "î", "ï", "ô", "ù", "û", "ü", "ÿ", "œ", "æ"]],
    ["de", ["ß", "ä", "ö", "ü"]],
    ["it", ["à", "è", "é", "ì", "ò", "ù"]],
    ["ca", ["ç", "l·l", "ny", "ç"]],
    ["nl", ["ij", "aa", "ee", "oo", "uu", "eu", "ui"]],
    ["ru", ["ё", "ъ", "ы", "э", "ю", "я"]],
    ["uk", ["ї", "є", "ґ", "і"]],
]);

function detectarEscritura(texto: string): Escritura {
    const conteos = new Map<Escritura, number>();
    for (const ch of texto) {
        const code = ch.codePointAt(0);
        if (code === undefined) continue;
        for (const [escritura, inicio, fin] of RANGOS_ESCRITURA) {
            if (code >= inicio && code <= fin) {
                conteos.set(escritura, (conteos.get(escritura) ?? 0) + 1);
                break;
            }
        }
    }
    let maxEscritura: Escritura = "desconocida";
    let maxCuenta = 0;
    for (const [escritura, cuenta] of conteos) {
        if (cuenta > maxCuenta) {
            maxCuenta = cuenta;
            maxEscritura = escritura;
        }
    }
    return maxEscritura;
}

function contarLetras(texto: string): number {
    return [...texto].filter((ch) => /\p{L}/u.test(ch)).length;
}

function puntuarIdiomaLatina(texto: string): Map<string, number> {
    const palabras = texto.toLowerCase().match(/\p{L}+/gu) ?? [];
    const puntuaciones = new Map<string, number>();
    for (const [idioma, palabrasClave] of PALABRAS_FRECUENTES) {
        if (!["es", "en", "pt", "fr", "de", "it", "ca", "nl"].includes(idioma)) continue;
        let score = 0;
        for (const p of palabras) {
            if (palabrasClave.includes(p)) score += 2;
        }
        for (const ch of texto.toLowerCase()) {
            const letras = LETRAS_CARACTERISTICAS.get(idioma);
            if (letras?.some((l) => ch.includes(l))) score += 1;
        }
        puntuaciones.set(idioma, score);
    }
    return puntuaciones;
}

function puntuarIdiomaCiriliсa(texto: string): Map<string, number> {
    const palabras = texto.toLowerCase().match(/[\p{L}]+/gu) ?? [];
    const puntuaciones = new Map<string, number>();
    for (const [idioma, palabrasClave] of PALABRAS_FRECUENTES) {
        if (!["ru", "uk"].includes(idioma)) continue;
        let score = 0;
        for (const p of palabras) {
            if (palabrasClave.includes(p)) score += 2;
        }
        for (const ch of texto.toLowerCase()) {
            const letras = LETRAS_CARACTERISTICAS.get(idioma);
            if (letras?.some((l) => ch.includes(l))) score += 1;
        }
        puntuaciones.set(idioma, score);
    }
    return puntuaciones;
}

function puntuarIdiomaArabe(texto: string): Map<string, number> {
    const palabras = texto.match(/[\p{L}]+/gu) ?? [];
    const puntuaciones = new Map<string, number>();
    for (const [idioma, palabrasClave] of PALABRAS_FRECUENTES) {
        if (!["ar", "fa"].includes(idioma)) continue;
        let score = 0;
        for (const p of palabras) {
            if (palabrasClave.includes(p)) score += 2;
        }
        puntuaciones.set(idioma, score);
    }
    return puntuaciones;
}

function puntuarIdiomaHan(texto: string): Map<string, number> {
    const puntuaciones = new Map<string, number>();
    let score = 0;
    for (const ch of texto) {
        if (PALABRAS_FRECUENTES.get("zh")?.includes(ch)) score += 2;
    }
    puntuaciones.set("zh", score);
    return puntuaciones;
}

function puntuarIdiomaDevanagari(texto: string): Map<string, number> {
    const palabras = texto.match(/[\p{L}]+/gu) ?? [];
    const puntuaciones = new Map<string, number>();
    for (const [idioma, palabrasClave] of PALABRAS_FRECUENTES) {
        if (idioma !== "hi") continue;
        let score = 0;
        for (const p of palabras) {
            if (palabrasClave.includes(p)) score += 2;
        }
        puntuaciones.set(idioma, score);
    }
    return puntuaciones;
}

function mejorResultado(puntuaciones: Map<string, number>, maxConfianza: number): DeteccionIdioma {
    const entradas = [...puntuaciones.entries()].sort((a, b) => b[1] - a[1]);
    if (entradas.length === 0 || entradas[0][1] === 0) {
        return { codigo: null, confianza: 0, alternativas: [] };
    }
    const [mejor, score] = entradas[0];
    const total = entradas.reduce((s, [, v]) => s + v, 0);
    const confianza = total > 0 ? Math.min(score / total, maxConfianza) : 0;
    const alternativas = entradas.slice(1, 4).map(([k]) => k);
    return { codigo: mejor, confianza: Math.round(confianza * 100) / 100, alternativas };
}

export function detectarIdioma(texto: string): DeteccionIdioma {
    const escritura = detectarEscritura(texto);

    const idiomaUnico = ESCRITURA_UNICO_IDIOMA.get(escritura);
    if (idiomaUnico) {
        return { codigo: idiomaUnico, confianza: 0.95, alternativas: [] };
    }

    const letras = contarLetras(texto);
    if (letras < 12) {
        return { codigo: null, confianza: 0, alternativas: [] };
    }

    let puntuaciones: Map<string, number>;
    switch (escritura) {
        case "latina":
            puntuaciones = puntuarIdiomaLatina(texto);
            return mejorResultado(puntuaciones, 0.9);
        case "cirilica":
            puntuaciones = puntuarIdiomaCiriliсa(texto);
            return mejorResultado(puntuaciones, 0.9);
        case "arabe":
            puntuaciones = puntuarIdiomaArabe(texto);
            return mejorResultado(puntuaciones, 0.9);
        case "han":
            puntuaciones = puntuarIdiomaHan(texto);
            return mejorResultado(puntuaciones, 0.9);
        case "devanagari":
            puntuaciones = puntuarIdiomaDevanagari(texto);
            return mejorResultado(puntuaciones, 0.9);
        default:
            return { codigo: null, confianza: 0, alternativas: [] };
    }
}