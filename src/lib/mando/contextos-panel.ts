/**
 * Lógica pura del panel de contextos del Centro de Mando (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * Funciones de entrada → salida usadas por `panel-contextos.tsx`: filtro de
 * búsqueda, tiempos relativos y tamaños. Sin disco, sin red, sin procesos.
 *
 * ⚠️ Solo tipado y funciones puras: el cliente importa este archivo con
 * seguridad (no hay `node:*` aquí).
 */

import type { ContextoAgente } from "@/lib/mando/contextos";

/** Texto de un tiempo ISO como «hace 5 min» / «hace 2 h» / «hace 3 d». */
export function haceCuanto(iso: string, ahora = Date.now()): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "—";
    const min = Math.round((ahora - t) / 60_000);
    if (min < 1) return "ahora mismo";
    if (min < 60) return `hace ${min} min`;
    const horas = Math.round(min / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.round(horas / 24);
    return `hace ${dias} d`;
}

/** Tamaño del contexto en caracteres, con miles a la española. */
export function tamanoTexto(caracteres: number): string {
    if (!Number.isFinite(caracteres) || caracteres <= 0) return "—";
    return `${caracteres.toLocaleString("es-ES")} car.`;
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/** Si un contexto coincide con la búsqueda (id, título, área o habilidad). */
export function coincide(
    contexto: Pick<ContextoAgente, "tarea" | "titulo" | "area" | "habilidades">,
    consulta: string,
): boolean {
    const q = normalizar(consulta.trim());
    if (q.length === 0) return true;
    const bolsa = [
        contexto.tarea,
        contexto.titulo,
        contexto.area,
        ...contexto.habilidades,
    ];
    return bolsa.some((campo) => normalizar(campo).includes(q));
}
