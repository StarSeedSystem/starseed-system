import { IDIOMAS } from "../idiomas/idiomas";

interface EntradaDecidirTraducir {
    mensajeRecibido: string;
    idiomaConversacion: string;
    peticion?: string;
    destinatarios?: { personaId: string; idioma: string }[];
    detectado: { codigo: string; confianza: number };
}

export interface ResultadoDecidirTraducir {
    llamar: boolean;
    razon: "idioma-distinto" | "peticion" | "varias-personas" | "ninguna";
    destino?: string;
}

function contarLetras(texto: string): number {
    return (texto.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;
}

function esCodigoOUrl(texto: string): boolean {
    const urlPattern = /^https?:\/\/|ftp:\/\//i;
    const codePatterns = [
        /^\d+$/,
        /^[a-f0-9]{40,}$/i,
        /^\.[\w-]+(\.[\w-]+)*$/,
        /^[\w.-]+@[\w.-]+\.\w+$/
    ];
    
    if (urlPattern.test(texto)) return true;
    for (const pattern of codePatterns) {
        if (pattern.test(texto)) return true;
    }
    return false;
}

function detectarPatronTraduccion(peticion: string): string | null {
    const texto = peticion.toLowerCase();
    const idiomas: Record<string, string> = {
        "inglés": "en", "ingles": "en", "english": "en",
        "español": "es", "espanol": "es", "spanish": "es",
        "francés": "fr", "frances": "fr", "french": "fr",
        "portugués": "pt", "portugues": "pt", "portuguese": "pt",
        "alemán": "de", "aleman": "de", "german": "de",
        "italiano": "it", "italian": "it",
        "neerlandés": "nl", "neerlandes": "nl", "dutch": "nl",
        "catalán": "ca", "catalan": "ca",
        "gallego": "gl", "galician": "gl",
        "euskera": "eu", "basque": "eu",
        "ruso": "ru", "russian": "ru",
        "ucraniano": "uk", "ukrainian": "uk",
        "polaco": "pl", "polish": "pl",
        "turco": "tr", "turkish": "tr",
        "árabe": "ar", "arabe": "ar", "arabic": "ar",
        "hebreo": "he", "hebrew": "he",
        "persa": "fa", "persian": "fa",
        "urdu": "ur",
        "hindi": "hi",
        "bengalí": "bn", "bengali": "bn",
        "chino": "zh", "chinese": "zh",
        "japonés": "ja", "japones": "ja", "japanese": "ja",
        "coreano": "ko", "korean": "ko",
        "tailandés": "th", "tailandes": "th", "thai": "th",
        "vietnamita": "vi", "vietnamese": "vi",
        "indonesio": "id", "indonesian": "id",
        "suajili": "sw", "swahili": "sw",
        "griego": "el", "greek": "el",
        "sueco": "sv", "swedish": "sv",
        "checo": "cs", "czech": "cs",
        "rumano": "ro", "romanian": "ro",
        "húngaro": "hu", "hungaro": "hu", "hungarian": "hu",
        "finés": "fi", "fines": "fi", "finnish": "fi",
        "danés": "da", "danes": "da", "danish": "da",
        "noruego": "nb", "norwegian": "nb"
    };

    if (texto.includes("traduce")) {
        for (const [nombre, codigo] of Object.entries(idiomas)) {
            if (texto.includes(nombre) || texto.includes(codigo)) {
                return codigo;
            }
        }
    }

    if (texto.includes("traducir")) {
        const match = texto.match(/traducir\s+(?:al|a|la)\s+([\wáéíóúüñ]+)/i);
        if (match && match[1]) {
            const lang = match[1].toLowerCase();
            for (const [nombre, codigo] of Object.entries(idiomas)) {
                if (nombre.toLowerCase() === lang || codigo === lang) {
                    return codigo;
                }
            }
        }
    }

    const responsePatterns = [
        /respond\s+in\s+([\wáéíóúüñ]+)/i,
        /(?:reply|translate)\s+(?:en|in)\s+([\wáéíóúüñ]+)/i,
        /(?:en|al|a la)\s+([\wáéíóúüñ]+)/i
    ];

    for (const pattern of responsePatterns) {
        const match = texto.match(pattern);
        if (match && match[1]) {
            const lang = match[1].toLowerCase();
            for (const [nombre, codigo] of Object.entries(idiomas)) {
                if (nombre.toLowerCase() === lang || codigo === lang) {
                    return codigo;
                }
            }
        }
    }

    if (texto.includes("translate to") || texto.includes("translate ")) {
        const match = texto.match(/translate\s+(?:to\s+)?([\wáéíóúüñ]+)/i);
        if (match && match[1]) {
            const lang = match[1].toLowerCase();
            for (const [nombre, codigo] of Object.entries(idiomas)) {
                if (nombre.toLowerCase() === lang || codigo === lang) {
                    return codigo;
                }
            }
        }
    }

    return null;
}

export function decidirTraducir(entrada: EntradaDecidirTraducir): ResultadoDecidirTraducir {
    const { mensajeRecibido, idiomaConversacion, peticion, destinatarios, detectado } = entrada;

    if (esCodigoOUrl(mensajeRecibido)) {
        return { llamar: false, razon: "ninguna" };
    }

    if (peticion) {
        const idiomaDestino = detectarPatronTraduccion(peticion);
        if (idiomaDestino) {
            return {
                llamar: true,
                razon: "peticion",
                destino: idiomaDestino
            };
        }
    }

    if (detectado.codigo !== idiomaConversacion && detectado.confianza >= 0.8) {
        const letras = contarLetras(mensajeRecibido);
        if (letras >= 12) {
            return {
                llamar: true,
                razon: "idioma-distinto",
                destino: idiomaConversacion
            };
        }
    }

    if (destinatarios && destinatarios.length > 1) {
        const idiomasUnicos = new Set(destinatarios.map(d => d.idioma));
        if (idiomasUnicos.size > 1) {
            const primerIdiomaDistinto = destinatarios.find(d => d.idioma !== idiomaConversacion);
            if (primerIdiomaDistinto) {
                return {
                    llamar: true,
                    razon: "varias-personas",
                    destino: primerIdiomaDistinto.idioma
                };
            }
        }
    }

    return { llamar: false, razon: "ninguna" };
}