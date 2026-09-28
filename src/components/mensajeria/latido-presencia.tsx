"use client";

/** LatidoPresencia — componente invisible: solo llama a `useLatidoPresencia()`. Se monta una vez (p.ej. en un layout). */
import { useLatidoPresencia } from "@/lib/mensajeria/presencia";

export function LatidoPresencia(): null {
    useLatidoPresencia();
    return null;
}
