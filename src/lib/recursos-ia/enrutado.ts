/**
 * Destino de IA por capacidad según la topología (Ola 1023R · RIA1023C, 2026-10-23).
 * SOP `architecture/recursos-ia-neurona.md`: §2 (topologías y vías), §3 (reglas duras: la antena
 * no lleva chat, solo decisiones) y §6 (el servidor propio de IA en el puerto 4480).
 *
 * PURA: entrada → salida; nada de `node:*`, ni `fetch`, ni disco. Lo importa el cliente.
 * `destinoDeIA(plan, asignaciones, inventario, capacidad)` responde a qué servidor va cada
 * capacidad: la neurona, la vía y —para la topología «servidor-propio»— la URL de su servidor
 * (`http://<host>:4480/v1`; el host sale del inventario: la `ruta` de un almacén
 * `servidor-externo` que la propia neurona declara). Si no se conoce, `baseUrl: null` con un
 * motivo legible. Las asignaciones por elemento viajan en el plan por capacidades; si un día
 * se afina por elemento, lo aplica el llamador: aquí manda la topología.
 */
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";
import type { Asignacion, Capacidad, ConfigTopologia, InventarioRecursos, Via } from "./tipos";

/** A dónde va una capacidad. `neuronaId` vacío = el enrutador por internet (sin neurona). */
export interface DestinoIA {
    via: Via;
    neuronaId: string;
    baseUrl: string | null;
    motivo: string;
}

/** Destino de fallback honesto: el enrutador económico por internet, sin neurona ni URL. */
function porInternet(motivo: string): DestinoIA {
    return { via: "internet", neuronaId: "", baseUrl: null, motivo };
}

const BUCLE = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** El chat no viaja por antena; las decisiones tipadas sí (§3). */
export function sinAntena(vias: Via[], capacidad: Capacidad): Via[] {
    return capacidad === "decision" ? [...vias] : vias.filter((v) => v !== "antena");
}

/**
 * Host legible de una ruta declarada: `http://a1.local:4480/v1`, `a1.local` o `192.168.1.7`.
 * Sin host válido (o bucle local cuando la neurona no es esta) → `null`. PURA.
 */
export function hostDeRuta(ruta: string, bucleOk: boolean): string | null {
    let host: string | null = null;
    try {
        const u = new URL(ruta);
        if (/^https?:$/.test(u.protocol)) host = u.hostname;
    } catch {
        /* sin esquema: abajo se prueba el host pelado */
    }
    if (!host && !ruta.includes("/") && /^[\p{L}\p{N}._-]+$/u.test(ruta)) host = ruta;
    if (!host) return null;
    const esBucle = BUCLE.has(host) || host.startsWith("127.");
    if (esBucle && !bucleOk) return null;
    return host;
}

/** `http://<host>:4480/v1` — el plano común compatible con OpenAI del servidor propio (§6). */
export function urlServidor(host: string): string {
    return `http://${host}:${PUERTO_SERVIDOR_IA}/v1`;
}

/**
 * Host del servidor de IA de una neurona: la `ruta` de un almacén `servidor-externo` SUYO del
 * inventario (así declara la neurona dónde escucha, sea otra o esta misma). PURA.
 */
export function hostDeNeurona(inventario: InventarioRecursos, neuronaId: string): string | null {
    const bucleOk = neuronaId === inventario.estaNeuronaId;
    const n = inventario.neuronas.find((x) => x.id === neuronaId);
    const candidatos = [...(n?.almacenes ?? []), ...inventario.almacenesSueltos].filter(
        (a) => a.tipo === "servidor-externo" && a.neuronaId === neuronaId && !!a.ruta,
    );
    for (const a of candidatos) {
        const h = hostDeRuta(a.ruta ?? "", bucleOk);
        if (h) return h;
    }
    return null;
}

/**
 * La vía para llegar a una neurona: la primera de las permitidas por el plan que la neurona
 * comprende, sin antena si la capacidad no es decisión (§3). `null` = no se llega
 * (invisible, o solo al alcance por antena cuando la capacidad no puede viajar por radio). PURA.
 */
function viaHacia(
    plan: ConfigTopologia,
    inventario: InventarioRecursos,
    neuronaId: string,
    capacidad: Capacidad,
): Via | null {
    if (neuronaId === inventario.estaNeuronaId) return "local";
    const n = inventario.neuronas.find((x) => x.id === neuronaId);
    const alcanzables = sinAntena(n?.vias ?? [], capacidad);
    if (!alcanzables.length) return null;
    const permitidas = sinAntena(plan.vias, capacidad);
    return permitidas.find((v) => alcanzables.includes(v)) ?? alcanzables[0];
}

/** Los procesadores de todas las neuronas, más los servidores sueltos (comunales, de cerebros). */
function procesadorPorId(inventario: InventarioRecursos, id: string) {
    return [...inventario.neuronas.flatMap((n) => n.procesadores), ...inventario.procesadoresSueltos].find(
        (p) => p.id === id,
    );
}

/** Si un procesador acaba en «servidor-propio», la URL del servidor OpenAI-compatible de su neurona (§6). */
function urlDelProcesador(plan: ConfigTopologia, inventario: InventarioRecursos, neuronaId: string): string | null {
    if (plan.topologia !== "servidor-propio" || plan.servidorNeuronaId !== neuronaId) return null;
    const host = hostDeNeurona(inventario, neuronaId);
    return host ? urlServidor(host) : null;
}

/**
 * A qué servidor va una capacidad según la topología. `asignaciones` (el estado por elemento)
 * se recibe por contrato del plan de Recursos de IA: aquí la topología (`plan`) y el inventario
 * mandan; el afinado por elemento lo aplica el llamador. PURA.
 */
export function destinoDeIA(
    plan: ConfigTopologia,
    _asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    switch (plan.topologia) {
        case "servidor-propio": {
            const id = plan.servidorNeuronaId;
            if (!id) return porInternet("Topología «servidor propio» sin neurona elegida: la capacidad va por el enrutador (internet).");
            const n = inventario.neuronas.find((x) => x.id === id);
            if (!n) return porInternet(`El servidor propio «${id}» no está visible en el inventario de esta neurona: va por el enrutador (internet).`);
            if (!n.online) return porInternet(`El servidor propio «${n.nombre}» está apagado: la capacidad va por el enrutador (internet).`);
            const via = viaHacia(plan, inventario, id, capacidad);
            if (!via) return porInternet(`No hay vía sin antena hacia «${n.nombre}» y el chat no viaja por antena (§3): va por el enrutador (internet).`);
            const host = hostDeNeurona(inventario, id);
            return {
                via,
                neuronaId: id,
                baseUrl: host ? urlServidor(host) : null,
                motivo: host
                    ? `La IA de toda la cuenta la sirve «${n.nombre}»: su servidor de IA contesta en ${urlServidor(host)} por la vía «${via}».`
                    : `La IA la sirve «${n.nombre}», pero no se conoce su dirección: levanta su servidor de IA (puerto ${PUERTO_SERVIDOR_IA}) o declara la ruta en su inventario.`,
            };
        }
        case "cada-neurona":
            return {
                via: "local",
                neuronaId: inventario.estaNeuronaId,
                baseUrl: null,
                motivo: "Topología «cada neurona con lo suyo»: la IA se procesa en esta misma neurona.",
            };
        case "almacen-externo": {
            const etiq = inventario.almacenesSueltos.find((a) => a.id === plan.almacenExternoId)?.etiqueta;
            return {
                via: "local",
                neuronaId: inventario.estaNeuronaId,
                baseUrl: null,
                motivo: `Los modelos viven en «${etiq ?? "un almacenamiento externo"}»: los procesa la neurona donde se conectan (esta).`,
            };
        }
        case "fragmentada": {
            const local = { via: "local" as Via, neuronaId: inventario.estaNeuronaId, baseUrl: null };
            const elegido = plan.porCapacidad?.[capacidad]?.procesaEn;
            if (!elegido || elegido === "auto")
                return { ...local, motivo: `Topología «Repartida entre mis neuronas»: sin asignación para «${capacidad}», se procesa en esta neurona.` };
            const p = procesadorPorId(inventario, elegido);
            if (!p || !p.disponible)
                return { ...local, motivo: `El procesador «${elegido}» de «${capacidad}» no está disponible: se procesa en esta neurona.` };
            const esNeurona = inventario.neuronas.some((x) => x.id === p.neuronaId);
            let via: Via | null = esNeurona ? viaHacia(plan, inventario, p.neuronaId, capacidad) : (sinAntena([p.via], capacidad)[0] ?? null);
            if (via === null)
                return porInternet(`El procesador de «${capacidad}» solo está al alcance por antena y el chat no viaja por antena (§3): va por el enrutador (internet).`);
            return {
                via,
                neuronaId: p.neuronaId,
                baseUrl: urlDelProcesador(plan, inventario, p.neuronaId),
                motivo: `«${capacidad}» se procesa en «${p.nombre}» (reparto entre neuronas y servidores).`,
            };
        }
        case "comunal": {
            const p = inventario.procesadoresSueltos.find((x) => x.tipo === "servidor" && x.disponible && x.prestable === true);
            if (!p) return porInternet("Sin servidores del grupo o la comunidad visibles y disponibles: la capacidad va por el enrutador (internet).");
            if (p.via === "antena" && capacidad !== "decision")
                return porInternet(`La comunidad solo presta «${p.nombre}» por antena y el chat no viaja por antena (§3): va por el enrutador (internet).`);
            return {
                via: p.via,
                neuronaId: p.neuronaId,
                baseUrl: null,
                motivo: `La capacidad va a los servidores de la comunidad: la presta «${p.nombre}».`,
            };
        }
    }
}
