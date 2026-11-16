/**
 * IMA9 · Importación de XLIFF, .strings (Apple) y strings.xml (Android).
 * Módulo PURO: sin red, sin disco, sin procesos. Analizador por RegEx con límites de tamaño.
 */

export const LIMITES = {
    bytes: 10_000_000,
    entradas: 50_000,
} as const;

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: string[];
    avisos: string[];
}

const limpiarEntidad = (s: string): string => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const esEtiqueta = (s: string): boolean => /<[a-zA-Z]/.test(s);

export function desdeXliff(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: string[] = [];
    const avisos: string[] = [];

    if (!texto || typeof texto !== 'string') {
        return { entradas, descartadas, avisos: ['Texto vacío o inválido'] };
    }

    const hayTransUnit = /<trans-unit/i.test(texto);
    const haySegment = /<segment/i.test(texto);
    const hayElemento = /<[a-zA-Z][^>]*>/g;
    
    if (!hayTransUnit && !haySegment) {
        return { entradas, descartadas, avisos: ['XML roto: sin elementos válidos'] };
    }

    // XLIFF 1.2: <trans-unit> con <source>, <target>
    const transUnits = [...texto.matchAll(/<trans-unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/trans-unit>/gi)];
    for (const [, id, contenido] of transUnits) {
        const targetMatch = contenido.match(/<target[^>]*>([\s\S]*?)<\/target>/i);
        if (targetMatch && targetMatch[1].trim()) {
            const limpio = limpiarEntidad(targetMatch[1].trim());
            if (esEtiqueta(limpio)) {
                descartadas.push(id);
            } else {
                entradas[id] = limpio;
            }
        }
    }

    // XLIFF 2.0: <unit><segment><source/><target/>
    const units = [...texto.matchAll(/<unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/gi)];
    for (const [, id, contenido] of units) {
        const targetMatch = contenido.match(/<target[^>]*>([\s\S]*?)<\/target>/i);
        if (targetMatch && targetMatch[1].trim()) {
            const limpio = limpiarEntidad(targetMatch[1].trim());
            if (esEtiqueta(limpio)) {
                descartadas.push(id);
            } else {
                entradas[id] = limpio;
            }
        }
    }

    return { entradas, descartadas, avisos };
}

export function desdeStringsApple(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: string[] = [];
    const avisos: string[] = [];

    if (!texto || typeof texto !== 'string') {
        return { entradas, descartadas, avisos: ['Texto vacío o inválido'] };
    }

    let limpio = texto.replace(/\/\*[\s\S]*?\*\//g, '');
    limpio = limpio.replace(/\/\/.*/g, '');

    const lines = limpio.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines) {
        const match = line.match(/"([^"]+)"\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)";/);
        if (match) {
            const id = match[1];
            const val = match[2];
            const procesado = limpiarEntidad(val.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
            if (esEtiqueta(procesado)) {
                descartadas.push(id);
            } else {
                entradas[id] = procesado;
            }
        }
    }

    return { entradas, descartadas, avisos };
}

export function desdeStringsAndroid(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: string[] = [];
    const avisos: string[] = [];

    if (!texto || typeof texto !== 'string') {
        return { entradas, descartadas, avisos: ['Texto vacío o inválido'] };
    }

    const matches = [...texto.matchAll(/<string\s+name="([^"]+)"(?:\s+translatable="(true|false)")?[^>]*>([\s\S]*?)<\/string>/gi)];
    for (const [, id, translatable, val] of matches) {
        if (translatable === 'false') {
            descartadas.push(id);
            continue;
        }

        let procesado = val;
        procesado = procesado.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        procesado = procesado.replace(/%1\$s/g, '{0}').replace(/%s/g, '{0}');
        procesado = limpiarEntidad(procesado);

        if (esEtiqueta(procesado)) {
            descartadas.push(id);
        } else {
            entradas[id] = procesado;
        }
    }

    return { entradas, descartadas, avisos };
}