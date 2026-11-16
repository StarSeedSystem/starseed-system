import { IDIOMAS } from "../idiomas/idiomas";

export interface Destinatario {
    personaId: string;
    idioma: string;
}

export interface EntradaTraducir {
    mensajeRecibido: string;
    idiomaConversacion: string;
    peticion?: string;
    destinatarios?: Destinatario[];
    detectado: { codigo: string | null; confianza: number };
}

export interface SalidaTraducir {
    llamar: boolean;
    razon: "idioma-distinto" | "peticion" | "varias-personas" | "ninguna";
    destino?: string;
}

const PALABRAS_TRADUCIR = ["traduce", "traducir", "traduzca", "traduzir"];

const DIRECTIVAS_IDIOMA: ReadonlyArray<{ pattern: RegExp; codigo: string }> = [
    { pattern: /\btraduce\s+en\s+inglés\b/i, codigo: "en" },
    { pattern: /\btraduce\s+en\s+français\b/i, codigo: "fr" },
    { pattern: /\btraduce\s+en\s+alemán\b/i, codigo: "de" },
    { pattern: /\btraduce\s+en\s+italiano\b/i, codigo: "it" },
    { pattern: /\btraduce\s+en\s+português\b/i, codigo: "pt" },
    { pattern: /\btraduce\s+en\s+ruso\b/i, codigo: "ru" },
    { pattern: /\btraduce\s+en\s+chino\b/i, codigo: "zh" },
    { pattern: /\btraduce\s+en\s+japonés\b/i, codigo: "ja" },
    { pattern: /\btraduce\s+en\s+árabe\b/i, codigo: "ar" },
    { pattern: /\bresponde\s+en\s+inglés\b/i, codigo: "en" },
    { pattern: /\bresponde\s+en\s+français\b/i, codigo: "fr" },
    { pattern: /\bresponde\s+en\s+alemán\b/i, codigo: "de" },
    { pattern: /\bresponde\s+en\s+italiano\b/i, codigo: "it" },
    { pattern: /\bresponde\s+en\s+português\b/i, codigo: "pt" },
    { pattern: /\bresponde\s+en\s+ruso\b/i, codigo: "ru" },
    { pattern: /\bresponde\s+en\s+chino\b/i, codigo: "zh" },
    { pattern: /\bresponde\s+en\s+japonés\b/i, codigo: "ja" },
    { pattern: /\bresponde\s+en\s+árabe\b/i, codigo: "ar" },
    { pattern: /\ben\s*ingl[eés]?\b/i, codigo: "en" },
    { pattern: /\ben\s*français\b/i, codigo: "fr" },
    { pattern: /\ben\s*alemán\b/i, codigo: "de" },
    { pattern: /\bin\s*italiano\b/i, codigo: "it" },
    { pattern: /\bem\s*português\b/i, codigo: "pt" },
    { pattern: /\ben\s*russian\b/i, codigo: "ru" },
    { pattern: /na\s+русском/i, codigo: "ru" },
    { pattern: /中文/i, codigo: "zh" },
    { pattern: /日本語/i, codigo: "ja" },
    { pattern: /عربي/i, codigo: "ar" },
    { pattern: /\bfrançais\b/i, codigo: "fr" },
    { pattern: /\bfrench\b/i, codigo: "fr" },
    { pattern: /\balemán\b/i, codigo: "de" },
    { pattern: /\bgerman\b/i, codigo: "de" },
    { pattern: /\bitaliano\b/i, codigo: "it" },
    { pattern: /\bportuguês\b/i, codigo: "pt" },
    { pattern: /\bruso\b/i, codigo: "ru" },
    { pattern: /\brussian\b/i, codigo: "ru" },
    { pattern: /\bjapanese\b/i, codigo: "ja" },
    { pattern: /\bchino[sz]?\b/i, codigo: "zh" },
    { pattern: /\barabe?\b/i, codigo: "ar" },
] as const;

const PALABRAS_INGLES = [
    "hello", "world", "how", "are", "you", "today", "day", "is", "good", "nice", "morning", "afternoon",
    "evening", "please", "thank", "thanks", "hi", "hey", "greetings", "good", "great", "fine",
];

const PALABRAS_ESPAÑOL = [
    "hola", "mundo", "cómo", "estás", "hoy", "dia", "es", "muy", "bien", "por", "favor",
    "gracias", "hola", "que", "y", "a", "de", "en", "un", "ser", "se", "no", "te", "lo", "le",
];

const PALABRAS_FRANCES = [
    "bonjour", "monde", "comment", "allez", "vous", "aujourd'hui", "jour", "est", "très", "bien",
    "s'il", "vous", "plaît", "merci", "le", "la", "de", "et", "à", "un", "il", "être", "que",
];

const PALABRAS_ALEMAN = [
    "hallo", "welt", "wie", "geht", "es", "dir", "tag", "schön", "bitte", "danke", "guten",
    "morgen", "tag", "ist", "gut", "en", "und", "in", "den", "von", "zu", "das", "mit",
];

const PALABRAS_PORTUGES = [
    "olá", "mundo", "como", "você", "hoje", "dia", "é", "muito", "bom", "por", "favor",
    "obrigado", "obrigada", "olá", "que", "e", "a", "de", "em", "um", "para", "é",
];

const PALABRAS_ITALIANO = [
    "ciao", "mondo", "come", "stai", "oggi", "giorno", "è", "molto", "bene", "per", "favore",
    "grazie", "ciao", "che", "e", "il", "la", "di", "per", "un", "in", "con",
];

const PALABRAS_RUSO = [
    "привет", "мир", "как", "дела", "сегодня", "день", "хороший", "здравствуйте", "пожалуйста",
    "спасибо", "всегда", "всегда", "и", "в", "не", "на", "я", "что",
];

function contienePalabrasTraduccion(texto: string): boolean {
    const t = texto.trim().toLowerCase();
    return PALABRAS_TRADUCIR.some((palabra) => t.includes(palabra));
}

function tienePatronIdiomaIstricto(texto: string, idiomaConversacion: string): { match: boolean; codigo?: string } {
    const t = texto.trim();
    for (const directive of DIRECTIVAS_IDIOMA) {
        const match = directive.pattern.test(t);
        if (!match) continue;
        if (directive.codigo) {
            return { match: true, codigo: directive.codigo };
        }
    }

    if (contienePalabrasTraduccion(t)) {
        for (const directive of DIRECTIVAS_IDIOMA) {
            if (directive.pattern.test(t) && directive.codigo) {
                return { match: true, codigo: directive.codigo };
            }
        }

        const palabrasIdioma = [
            { palabras: PALABRAS_INGLES, codigo: "en" },
            { palabras: PALABRAS_FRANCES, codigo: "fr" },
            { palabras: PALABRAS_ALEMAN, codigo: "de" },
            { palabras: PALABRAS_PORTUGES, codigo: "pt" },
            { palabras: PALABRAS_ITALIANO, codigo: "it" },
            { palabras: PALABRAS_RUSO, codigo: "ru" },
        ];

        for (const { palabras, codigo } of palabrasIdioma) {
            if (t.toLowerCase().split(/\s+/).some((w) => palabras.includes(w.toLowerCase()))) {
                return { match: true, codigo };
            }
        }

        return { match: true, codigo: idiomaConversacion };
    }

    return { match: false };
}

function esCodigoValido(codigo: string | null | undefined): boolean {
    if (!codigo) return false;
    return IDIOMAS.some((i) => i.codigo === codigo);
}

export function decidirTraducir(entrada: EntradaTraducir): SalidaTraducir {
    const { mensajeRecibido, idiomaConversacion, peticion, destinatarios, detectado } = entrada;
    const texto = mensajeRecibido;
    const letras = Array.from(texto).filter((ch) => /^\p{L}$/u.test(ch)).length;

    if (detectado.codigo && detectado.codigo !== idiomaConversacion && detectado.confianza >= 0.8 && letras >= 12) {
        return {
            llamar: true,
            razon: "idioma-distinto",
            destino: detectado.codigo,
        };
    }

    if (peticion) {
        const resultadoPatron = tienePatronIdiomaIstricto(peticion, idiomaConversacion);
        if (resultadoPatron.match && resultadoPatron.codigo) {
            return {
                llamar: true,
                razon: "peticion",
                destino: resultadoPatron.codigo,
            };
        }
    }

    if (destinatarios && destinatarios.length > 1) {
        const idiomasDistintos = new Set(destinatarios.map((d) => d.idioma));
        if (idiomasDistintos.size > 1) {
            for (const d of destinatarios) {
                if (esCodigoValido(d.idioma)) {
                    return {
                        llamar: true,
                        razon: "varias-personas",
                        destino: d.idioma,
                    };
                }
            }
        }
    }

    return {
        llamar: false,
        razon: "ninguna",
    };
}