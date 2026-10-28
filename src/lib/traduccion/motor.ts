/** Motor de traducción por capas (TRD1020B, repos-libreria-1020d.md §4): el traductor del navegador
 * › LibreTranslate de la neurona › de la malla › Astraura, privacidad por alcance, marca protegida
 * y caché acotada. Puro: sin `node:*`; la red entra inyectada (API, cliente o función). */

export type AlcanceMotor = "aparato" | "cuenta" | "cerebro" | "malla" | "publico";
export const ALCANCES_PRIVADOS: AlcanceMotor[] = ["aparato", "cuenta", "cerebro"];
export interface ResultadoTexto { texto: string; motor: string; origen: string; motivo: string }
export interface MotorTraduccion {
    id: string;
    alcance: AlcanceMotor;
    disponible(origen: string, destino: string): Promise<boolean>;
    traducir(textos: string[], origen: string, destino: string): Promise<string[]>;
}

export const MARCAS = ["StarSeed", "Astraura", "Genesis", "MetaGenesis", "PoliGenesis", "ProtoGenesis", "Protomolécula", "Trinity"];

export function protegerMarcas(texto: string): { texto: string; marcas: string[] } {
    const marcas: string[] = [];
    let salida = texto;
    for (const marca of [...MARCAS].sort((a, b) => b.length - a.length)) {
        const escapada = marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        salida = salida.replace(new RegExp(escapada, "g"), (hallada) => {
            marcas.push(hallada);
            return `⟦M${marcas.length - 1}⟧`;
        });
    }
    return { texto: salida, marcas };
}

export function restaurarMarcas(texto: string, marcas: string[]): string {
    return texto.replace(new RegExp("⟦M(\\d+)⟧", "g"), (completo, i: string) => marcas[Number(i)] ?? completo);
}

export interface TranslatorInstancia { translate(texto: string): Promise<string> }
export interface TranslatorApi {
    availability(opciones: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
    create(opciones: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstancia>;
}

function esTranslatorApi(valor: unknown): valor is TranslatorApi {
    const p = valor as Partial<TranslatorApi> | null;
    return valor !== null && typeof valor === "object" && typeof p?.availability === "function" && typeof p?.create === "function";
}
/** Capa del aparato: la Translator API del navegador, sin red. Si el navegador no la trae, no disponible. */
export function motorNavegador(entorno: { Translator?: unknown } = globalThis as { Translator?: unknown }): MotorTraduccion {
    const api = esTranslatorApi(entorno?.Translator) ? entorno.Translator : null;
    return {
        id: "navegador",
        alcance: "aparato",
        disponible: async (origen, destino) => (!api ? false : api.availability({ sourceLanguage: origen, targetLanguage: destino }).then((r) => r === "available").catch(() => false)),
        traducir: async (textos, origen, destino) => {
            if (!api) throw new Error("Este navegador no trae la Translator API (y no se inventa traducción).");
            const instancia = await api.create({ sourceLanguage: origen, targetLanguage: destino });
            const salida: string[] = [];
            for (const texto of textos) salida.push(await instancia.translate(texto));
            return salida;
        },
    };
}
/** LibreTranslate (cliente de TRD1020A): el alcance lo dice quien coloca el servicio (neurona «aparato», el A1 «malla»…). */
export interface ClienteLibreTranslateLike {
    traducir(p: { q: string[]; source: string; target: string; format: string }): Promise<{ translatedText: string | string[] }>;
    salud(): Promise<boolean>;
}

export function motorLibreTranslate(cliente: ClienteLibreTranslateLike, alcance: AlcanceMotor = "cuenta"): MotorTraduccion {
    return {
        id: "libretranslate",
        alcance,
        disponible: () => cliente.salud().catch(() => false),
        traducir: async (textos, origen, destino) => {
            const r = await cliente.traducir({ q: textos, source: origen, target: destino, format: "text" });
            const lista = Array.isArray(r.translatedText) ? r.translatedText : [r.translatedText];
            if (lista.length !== textos.length) throw new Error("LibreTranslate devolvió otra cantidad de traducciones que la esperada.");
            return lista;
        },
    };
}
/** Astraura: el enrutador de IA gratis primero. Función inyectada que lo llama, para lo que Argos no cubre. */
export function motorAstraura(traducir: (textos: string[], origen: string, destino: string) => Promise<string[]>, alcance: AlcanceMotor = "publico"): MotorTraduccion {
    return { id: "astraura", alcance, disponible: async () => true, traducir };
}

export function crearTraductor(motores: MotorTraduccion[], opciones: { privado?: boolean; topeCache?: number } = {}) {
    const habilitados = opciones.privado ? motores.filter((m) => ALCANCES_PRIVADOS.includes(m.alcance)) : motores;
    const cache = new Map<string, ResultadoTexto>();

    async function aTravesDeLosMotores(pendientes: { texto: string; marcas: string[] }[], origen: string, destino: string): Promise<ResultadoTexto[]> {
        for (const motor of habilitados) {
            if (!(await motor.disponible(origen, destino).catch(() => false))) continue;
            try {
                const salida = await motor.traducir(pendientes.map((p) => p.texto), origen, destino);
                if (salida.length !== pendientes.length) throw new Error(`«${motor.id}» devolvió otra cantidad de traducciones que la esperada.`);
                return salida.map((texto, i) => ({ texto: restaurarMarcas(texto, pendientes[i].marcas), motor: motor.id, origen, motivo: `traducido con ${motor.id}` }));
            } catch { continue; } // pasa al siguiente motor: nada se inventa
        }
        throw new Error(`Ningún traductor disponible para ${origen} → ${destino}${opciones.privado ? " en modo privado" : ""}: no hay motor apto o todos fallaron.`);
    }

    return {
        async traducir(textos: string[], origen: string, destino: string): Promise<ResultadoTexto[]> {
            const resultados: ResultadoTexto[] = new Array(textos.length);
            const faltan: { i: number; texto: string }[] = [];
            textos.forEach((texto, i) => {
                const guardado = cache.get(`${origen}|${destino}|${texto}`);
                if (guardado) resultados[i] = { ...guardado, motivo: "desde la caché" };
                else faltan.push({ i, texto });
            });
            if (faltan.length > 0) {
                const traducidos = await aTravesDeLosMotores(faltan.map(({ texto }) => protegerMarcas(texto)), origen, destino);
                traducidos.forEach((r, j) => {
                    cache.set(`${origen}|${destino}|${faltan[j].texto}`, r);
                    if (cache.size > (opciones.topeCache ?? 500)) cache.delete(cache.keys().next().value as string);
                    resultados[faltan[j].i] = r;
                });
            }
            return resultados;
        },
    };
}
