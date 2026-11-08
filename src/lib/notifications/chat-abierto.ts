/**
 * El chat que la persona tiene abierto ahora (NOT1108A · 2026-11-08).
 * Una sola fuente para los avisos de mensajes: un mensaje de ESE chat, con la app a la vista, no avisa.
 * Claves: `n:<neurona>` / `c:<cuenta>` (Mensajes › Neuronas, lo fija `fijarHiloAbierto` de buzon.ts) y
 * `dm:<hilo>` (chats y grupos, lo fija la página de Mensajes). Sin dependencias: lo importa el buzón.
 */

let abierto: string | null = null;

export function fijarChatAbierto(clave: string | null): void {
    abierto = clave || null;
}

export function chatAbierto(): string | null {
    return abierto;
}
