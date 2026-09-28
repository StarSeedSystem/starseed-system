/**
 * La palabra secreta de quien dibuja, guardada SOLO en este navegador (para sobrevivir a una
 * recarga a mitad de ronda). Nunca sale de aquí antes de revelarla: en la sala solo viaja su
 * compromiso (hash). Si no hay almacenamiento, vale: la ronda se anulará si se pierde.
 */

const CLAVE = "starseed.juego.dibujo.secreto";

export interface SecretoDibujo {
    rid: string;
    ronda: number;
    palabra: string;
    sal: string;
}

export function guardarSecreto(s: SecretoDibujo): void {
    try {
        globalThis.localStorage?.setItem(CLAVE, JSON.stringify(s));
    } catch {
        /* sin almacenamiento */
    }
}

export function leerSecreto(rid: string, ronda: number): SecretoDibujo | null {
    try {
        const bruto = globalThis.localStorage?.getItem(CLAVE);
        if (!bruto) return null;
        const s = JSON.parse(bruto) as Partial<SecretoDibujo>;
        if (s && s.rid === rid && s.ronda === ronda && typeof s.palabra === "string" && typeof s.sal === "string") {
            return { rid, ronda, palabra: s.palabra, sal: s.sal };
        }
    } catch {
        /* dato roto: se ignora */
    }
    return null;
}

export function borrarSecreto(): void {
    try {
        globalThis.localStorage?.removeItem(CLAVE);
    } catch {
        /* noop */
    }
}

/** Sal aleatoria de 16 caracteres hexadecimales. */
export function salAzar(): string {
    try {
        const c = globalThis.crypto;
        if (c?.getRandomValues) {
            const b = new Uint8Array(8);
            c.getRandomValues(b);
            return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
        }
    } catch {
        /* sigue */
    }
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
