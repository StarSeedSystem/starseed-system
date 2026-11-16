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

function detectarPatronTraduccion(peticion: string): string | null {
    const texto = peticion.toLowerCase();
    const patrones: RegExp[] = [
        /traduce/i,
        /traducir/i,
        /responde en (\w+)/i,
        /en (ingl[eé]s|espa[ñn]ol|franc[eé]s|portugu[eé]s|alem[aá]n|italiano|neerland[eé]s|catal[aá]|gallego|euskera|ruso|ucraniano|polaco|turco|[aá]rabe|hebreo|persa|urdu|hindi|bengal[ií]|chino|japon[eé]s|coreano|tailand[eé]s|vietnamita|indonesio|suajili|griego|sueco|checo|rumano|h[úu]ngaro|fin[ée]s|dan[ée]s|noruego)/i,
        /(en|al|a la) (ingl[eé]s|espa[ñn]ol|franc[eé]s|portugu[eé]s|alem[aá]n|italiano|neerland[eé]s|catal[aá]|gallego|euskera|ruso|ucraniano|polaco|turco|[aá]rabe|hebreo|persa|urdu|hindi|bengal[ií]|chino|japon[eé]s|coreano|tailand[eé]s|vietnamita|indonesio|suajili|griego|sueco|checo|rumano|h[úu]ngaro|fin[ée]s|dan[ée]s|noruego)/i,
        /(translate|reply in|in )(english|spanish|french|portuguese|german|italian|dutch|catalan|galician|basque|russian|ukrainian|polish|turkish|arabic|hebrew|persian|urdu|hindi|bengali|chinese|japanese|korean|thai|vietnamese|indonesian|swahili|greek|swedish|czech|romanian|hungarian|finnish|danish|norwegian)/i
    ];

    for (const patron of patrones) {
        const match = texto.match(patron);
        if (match) {
            if (patron.toString().includes("responde en") || patron.toString().includes("en ")) {
                const idiomas: Record<string, string> = {
                    "inglés": "en", "ingles": "en", "english": "en",
                    "español": "es", "espanol": "es", "spanish": "es",
                    "francés": "fr", "frances": "fr", "french": "fr",
                    "portugués": "pt", "portugues": "pt", "portuguese": "pt",
                    "alemán": "de", "aleman": "de", "german": "de",
                    "italiano": "it", "italian": "it",
                    "neerlandés": "nl", "neerlandes": "nl", "dutch": "nl",
                    "catalán": "ca", "catalan": "ca", "catalan": "ca",
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
                for (const [nombre, codigo] of Object.entries(idiomas)) {
                    if (texto.includes(nombre.toLowerCase())) {
                        return codigo;
                    }
                }
            }
            return "detectado";
        }
    }
    return null;
}

export function decidirTraducir(entrada: EntradaDecidirTraducir): ResultadoDecidirTraducir {
    const { mensajeRecibido, idiomaConversacion, peticion, destinatarios, detectado } = entrada;

    // Regla (b): petición explícita de traducción
    if (peticion) {
        const idiomaDestino = detectarPatronTraduccion(peticion);
        if (idiomaDestino) {
            return {
                llamar: true,
                razon: "peticion",
                destino: idiomaDestino === "detectado" ? undefined : idiomaDestino
            };
        }
    }

    // Regla (a): idioma detectado distinto al de la conversación
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

    // Regla (c): varias personas en idiomas distintos
    if (destinatarios && destinatarios.length > 1) {
        const idiomasUnicos = new Set(destinatarios.map(d => d.idioma));
        if (idiomasUnicos.size > 1 && !idiomasUnicos.has(idiomaConversacion)) {
            // Tomar el primer idioma distinto como destino
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