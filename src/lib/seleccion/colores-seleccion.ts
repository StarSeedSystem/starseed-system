/**
 * Colores de selección únicos por usuario (MetaGenesis + StarSeed OS).
 *
 * Módulo 100 % puro (cliente y servidor, cero `node:*`):
 *   - Asigna a cada usuario un color único sin colisiones dentro de una misma sesión
 *     compartida, transmisión en vivo, sesión de nodos, canal o control remoto.
 *   - Genera tintes RGBA accesibles y variables CSS (`--selection-background`,
 *     `--selection-foreground`) listas para aplicar en documentos o contenedores.
 *   - Persiste y sincroniza la preferencia del usuario actual en localStorage.
 */

export interface ColorSeleccionPreset {
    id: string;
    nombre: string;
    hex: string;
    textoHex: string;
}

export interface PreferenciaSeleccion {
    colorId: string;
    hexPersonalizado?: string;
    unicidadCompartida: boolean;
}

export interface ParticipanteSeleccion {
    id: string;
    nombre?: string;
    colorPreferido?: string;
}

export interface ColorAsignadoUsuario {
    id: string;
    nombre: string;
    hex: string;
    fondo: string;
    borde: string;
    texto: string;
    cssVars: Record<string, string>;
}

export const CLAVE_PREFERENCIA_SELECCION = "starseed.seleccion.preferencia.v1";

/** Paleta armónica de alto contraste basada en la Trinidad StarSeed (Zenith, Horizon, Logic, Anchor + acentos seguros). */
export const PALETA_SELECCION_USUARIOS: readonly ColorSeleccionPreset[] = [
    { id: "zenith", nombre: "Zenith (Cian)", hex: "#007FFF", textoHex: "#FFFFFF" },
    { id: "horizon", nombre: "Horizon (Esmeralda)", hex: "#10B981", textoHex: "#03150E" },
    { id: "logic", nombre: "Logic (Ámbar)", hex: "#FFBF00", textoHex: "#1A1200" },
    { id: "anchor", nombre: "Anchor (Carmesí)", hex: "#DC143C", textoHex: "#FFFFFF" },
    { id: "violeta", nombre: "Violeta cuántico", hex: "#A78BFA", textoHex: "#0F0A1E" },
    { id: "celeste", nombre: "Celeste cristal", hex: "#22D3EE", textoHex: "#04161A" },
    { id: "rosa", nombre: "Rosa neón", hex: "#F472B6", textoHex: "#1D0712" },
    { id: "indigo", nombre: "Índigo orbital", hex: "#818CF8", textoHex: "#0B0D24" },
    { id: "lima", nombre: "Lima vital", hex: "#84CC16", textoHex: "#0E1802" },
    { id: "coral", nombre: "Coral solar", hex: "#FB7185", textoHex: "#1E050A" },
    { id: "turquesa", nombre: "Turquesa vivo", hex: "#2DD4BF", textoHex: "#041815" },
    { id: "naranja", nombre: "Fuego suave", hex: "#FB923C", textoHex: "#1D0C02" },
] as const;

export const PREFERENCIA_SELECCION_DEFECTO: PreferenciaSeleccion = {
    colorId: "zenith",
    unicidadCompartida: true,
};

function normalizarHex(hex: string): string | null {
    const limpio = hex.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(limpio)) return `#${limpio.toUpperCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(limpio)) {
        const exp = limpio
            .split("")
            .map((c) => c + c)
            .join("");
        return `#${exp.toUpperCase()}`;
    }
    return null;
}

function hexARgb(hex: string): { r: number; g: number; b: number } {
    const norm = normalizarHex(hex) ?? "#007FFF";
    const num = Number.parseInt(norm.slice(1), 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

function contrasteTextoParaHex(hex: string): string {
    const { r, g, b } = hexARgb(hex);
    // Luminancia relativa sRGB aproximada para garantizar legibilidad WCAG del texto seleccionado.
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.62 ? "#071019" : "#FFFFFF";
}

function hashEstable(texto: string): number {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Construye los estilos listos para pintar selección propia o compartida a partir de un hex. */
export function estiloSeleccionUsuario(hex: string): {
    hex: string;
    fondo: string;
    borde: string;
    texto: string;
    cssVars: Record<string, string>;
} {
    const norm = normalizarHex(hex) ?? "#007FFF";
    const { r, g, b } = hexARgb(norm);
    const fondo = `rgba(${r}, ${g}, ${b}, 0.42)`;
    const borde = `rgba(${r}, ${g}, ${b}, 0.85)`;
    const texto = contrasteTextoParaHex(norm);
    return {
        hex: norm,
        fondo,
        borde,
        texto,
        cssVars: {
            "--selection-background": fondo,
            "--selection-foreground": texto,
            "--starseed-seleccion-color": norm,
            "--starseed-seleccion-borde": borde,
        },
    };
}

/** Resuelve el hex efectivo de la preferencia actual. */
export function hexDePreferencia(pref: PreferenciaSeleccion): string {
    if (pref.hexPersonalizado) {
        const norm = normalizarHex(pref.hexPersonalizado);
        if (norm) return norm;
    }
    const preset = PALETA_SELECCION_USUARIOS.find((p) => p.id === pref.colorId);
    return preset?.hex ?? PALETA_SELECCION_USUARIOS[0].hex;
}

/** Calcula un color determinista para un usuario individual (si no se pasó color explícito). */
export function colorSeleccionUsuario(
    usuarioId: string,
    preferenciaPropia?: PreferenciaSeleccion,
): ColorAsignadoUsuario {
    const idLimpio = usuarioId.trim() || "anonimo";
    const preset = preferenciaPropia
        ? hexDePreferencia(preferenciaPropia)
        : PALETA_SELECCION_USUARIOS[hashEstable(idLimpio) % PALETA_SELECCION_USUARIOS.length].hex;
    const estilos = estiloSeleccionUsuario(preset);
    return {
        id: idLimpio,
        nombre: idLimpio,
        ...estilos,
    };
}

/**
 * Asigna colores ÚNICOS a todos los participantes de una sesión compartida, transmisión,
 * sesión de nodo, canal o control remoto. Si dos usuarios comparten color preferido o caen en
 * el mismo índice de hash, resuelve la colisión rotando sobre los slots libres de la paleta.
 */
export function asignarColoresUnicos(
    participantes: readonly ParticipanteSeleccion[],
): Record<string, ColorAsignadoUsuario> {
    const resultado: Record<string, ColorAsignadoUsuario> = {};
    const usados = new Set<string>();

    for (let idx = 0; idx < participantes.length; idx += 1) {
        const p = participantes[idx];
        const idLimpio = p.id.trim() || `participante-${idx + 1}`;
        const preferido = p.colorPreferido ? normalizarHex(p.colorPreferido) : null;

        let elegido: string | null = preferido && !usados.has(preferido) ? preferido : null;

        if (!elegido) {
            const inicio = hashEstable(idLimpio) % PALETA_SELECCION_USUARIOS.length;
            for (let paso = 0; paso < PALETA_SELECCION_USUARIOS.length; paso += 1) {
                const candidato =
                    PALETA_SELECCION_USUARIOS[(inicio + paso) % PALETA_SELECCION_USUARIOS.length].hex;
                if (!usados.has(candidato)) {
                    elegido = candidato;
                    break;
                }
            }
        }

        if (!elegido) {
            // Más usuarios que colores base: genera un matiz HSL espaciado por ángulo áureo.
            const hue = Math.round((idx * 137.508 + (hashEstable(idLimpio) % 45)) % 360);
            elegido = hslAHex(hue, 84, 58);
        }

        usados.add(elegido);
        const estilos = estiloSeleccionUsuario(elegido);
        resultado[idLimpio] = {
            id: idLimpio,
            nombre: p.nombre?.trim() || idLimpio,
            ...estilos,
        };
    }

    return resultado;
}

function hslAHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const lig = l / 100;
    const a = sat * Math.min(lig, 1 - lig);
    const canal = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${canal(0)}${canal(8)}${canal(4)}`.toUpperCase();
}

export function leerPreferenciaSeleccion(
    almacen?: Pick<Storage, "getItem">,
): PreferenciaSeleccion {
    try {
        const storage =
            almacen ??
            (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
        if (!storage) {
            return { ...PREFERENCIA_SELECCION_DEFECTO };
        }
        const crudo = storage.getItem(CLAVE_PREFERENCIA_SELECCION);
        if (!crudo) return { ...PREFERENCIA_SELECCION_DEFECTO };
        const parsed = JSON.parse(crudo) as Partial<PreferenciaSeleccion>;
        const colorId = typeof parsed.colorId === "string" && parsed.colorId.trim() ? parsed.colorId : "zenith";
        const hexPersonalizado =
            typeof parsed.hexPersonalizado === "string" ? normalizarHex(parsed.hexPersonalizado) ?? undefined : undefined;
        return {
            colorId,
            ...(hexPersonalizado ? { hexPersonalizado } : {}),
            unicidadCompartida: parsed.unicidadCompartida !== false,
        };
    } catch {
        return { ...PREFERENCIA_SELECCION_DEFECTO };
    }
}

export function guardarPreferenciaSeleccion(
    pref: PreferenciaSeleccion,
    almacen?: Pick<Storage, "setItem">,
): PreferenciaSeleccion {
    const limpia: PreferenciaSeleccion = {
        colorId: pref.colorId || "zenith",
        ...(pref.hexPersonalizado ? { hexPersonalizado: normalizarHex(pref.hexPersonalizado) ?? undefined } : {}),
        unicidadCompartida: pref.unicidadCompartida !== false,
    };
    try {
        const storage =
            almacen ??
            (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
        storage?.setItem(CLAVE_PREFERENCIA_SELECCION, JSON.stringify(limpia));
    } catch {
        // Sin almacenamiento persistente; se aplica en la sesión activa.
    }
    return limpia;
}

/** Aplica inmediatamente los tokens `--selection-background` y `--selection-foreground` al DOM raíz. */
export function aplicarSeleccionEnDocumento(pref: PreferenciaSeleccion, raiz?: HTMLElement | null): void {
    if (typeof document === "undefined") return;
    const destino = raiz ?? document.documentElement;
    if (!destino) return;
    const hex = hexDePreferencia(pref);
    const { fondo, texto, borde } = estiloSeleccionUsuario(hex);
    destino.style.setProperty("--selection-background", fondo);
    destino.style.setProperty("--selection-foreground", texto);
    destino.style.setProperty("--starseed-seleccion-color", hex);
    destino.style.setProperty("--starseed-seleccion-borde", borde);
}
