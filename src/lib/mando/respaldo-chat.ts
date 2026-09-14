// src/lib/mando/respaldo-chat.ts
// -----------------------------------------------------------------------------
// Cadena de respaldo del chat del Mando (Ola 323).
//
// POR QUÉ. El 2026-09-14 el chat devolvía «This operation was aborted» y nada más.
// Medido en la máquina de Alex contra `/api/mando/asistente`:
//
//   nim/moonshotai/kimi-k3            → 200, pero 89 s  (el tope de aborto es 120 s)
//   nim/deepseek-ai/deepseek-v4-pro   → 502 «nim respondió 410» (modelo retirado)
//   nim/deepseek-ai/deepseek-v4-flash → 200 en 13 s
//
// Es decir: el chat elegía UN modelo, y si ese modelo tardaba o estaba retirado se
// rendía — el mismo fallo de raíz que tenía el enjambre con `intentos_reales < 2`.
// Había 15 modelos vivos al lado y no probaba ninguno.
//
// Este módulo es PURO: no llama a nadie, solo decide EN QUÉ ORDEN intentarlo. La
// llamada la hace `responder()` en asistente.ts. Así se puede probar sin red.
// -----------------------------------------------------------------------------

/** Lo mínimo que necesitamos de un modelo para ordenarlo; compatible con `ModeloDisponible`. */
export interface ModeloParaRespaldo {
    id: string;
    proveedor?: string;
    gratis?: boolean;
    escritor?: boolean;
    salud?: string;
}

/** Proveedor de un id «proveedor/modelo» (sin tocar el catálogo). */
export function proveedorDe(id: string): string {
    const i = id.indexOf("/");
    return i > 0 ? id.slice(0, i) : id;
}

/**
 * Orden de intentos para una pregunta del chat.
 *
 * Reglas, en este orden:
 *   1. El modelo que pidió la persona va SIEMPRE primero, aunque parezca enfermo:
 *      si lo eligió a mano, se respeta su elección antes de decidir por ella.
 *   2. Después, el resto de candidatos sanos y gratuitos, CRUZANDO PROVEEDOR: si el
 *      primero era de `nim`, el segundo intento no es otro `nim`. Un proveedor caído
 *      tumba a todos sus modelos a la vez; cambiar de casa es lo que salva el turno.
 *   3. Dentro de la misma vuelta se conserva el orden del catálogo.
 *   4. Sin duplicados y como mucho `tope` intentos, para no tener a la persona
 *      esperando ocho timeouts seguidos.
 *
 * Se descartan los marcados `sinCupo`/`caido` (salvo el pedido) y los de pago: el chat
 * del Mando es gratuito por regla de la casa.
 */
export function cadenaDeRespaldo(
    pedido: string,
    disponibles: ModeloParaRespaldo[],
    tope = 4,
): string[] {
    const cadena: string[] = [];
    const vistos = new Set<string>();

    const añadir = (id: string) => {
        if (!id || vistos.has(id) || cadena.length >= tope) return;
        vistos.add(id);
        cadena.push(id);
    };

    if (pedido) añadir(pedido);

    const sanos = disponibles.filter(
        (m) =>
            m.id &&
            m.id !== pedido &&
            m.gratis !== false &&
            m.escritor !== false &&
            m.salud !== "sinCupo" &&
            m.salud !== "caido",
    );

    // Vueltas cruzando proveedor: una por vuelta y casa, hasta llenar el tope.
    const porProveedor = new Map<string, ModeloParaRespaldo[]>();
    for (const m of sanos) {
        const p = m.proveedor || proveedorDe(m.id);
        const lista = porProveedor.get(p);
        if (lista) lista.push(m);
        else porProveedor.set(p, [m]);
    }
    // El proveedor del modelo pedido va al final de la primera vuelta: si ese falló,
    // lo último que queremos es reintentar en la misma casa.
    const casaPedida = pedido ? proveedorDe(pedido) : "";
    const casas = [...porProveedor.keys()].sort((a, b) =>
        a === casaPedida ? 1 : b === casaPedida ? -1 : 0,
    );

    let vuelta = 0;
    let quedan = true;
    while (quedan && cadena.length < tope) {
        quedan = false;
        for (const casa of casas) {
            const lista = porProveedor.get(casa) ?? [];
            if (vuelta < lista.length) {
                quedan = true;
                añadir(lista[vuelta].id);
                if (cadena.length >= tope) break;
            }
        }
        vuelta += 1;
    }

    return cadena;
}

/**
 * Traduce el fallo técnico de un intento a una frase que una persona entienda.
 * `This operation was aborted` es lo que lanza `fetch` cuando salta el AbortController:
 * no dice nada útil y era literalmente lo único que veía Alex en pantalla.
 */
export function motivoLegible(e: unknown, modelo: string, msTope: number): string {
    const bruto = e instanceof Error ? e.message : String(e ?? "");
    const corto = modelo.split("/").slice(-1)[0] || modelo;
    if (/abort/i.test(bruto)) return `${corto} no respondió en ${Math.round(msTope / 1000)} s`;
    if (/\b410\b/.test(bruto)) return `${corto} ya no existe en su proveedor (410)`;
    if (/\b429\b/.test(bruto)) return `${corto} sin cupo ahora mismo (429)`;
    if (/\b4\d\d\b|\b5\d\d\b/.test(bruto)) return `${corto}: ${bruto.slice(0, 80)}`;
    if (/sin clave/i.test(bruto)) return `${corto}: no hay clave de ese proveedor en esta máquina`;
    return `${corto}: ${bruto.slice(0, 80) || "fallo sin mensaje"}`;
}
