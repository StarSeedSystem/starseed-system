/** base64url sin relleno ⇄ bytes (Ola 382). Puro: sirve en el navegador y en las pruebas. */
export function aB64url(datos: ArrayBuffer | Uint8Array): string {
    const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function desdeB64url(texto: string): Uint8Array {
    const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export function aleatorios(n: number): Uint8Array {
    const b = new Uint8Array(n);
    globalThis.crypto.getRandomValues(b);
    return b;
}
