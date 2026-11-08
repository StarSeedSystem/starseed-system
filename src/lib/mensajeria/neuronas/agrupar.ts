/**
 * Neuronas por cerebro para la pestaña «Neuronas» de Mensajes (MSJ1107A · 2026-11-07) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Cada aparato de la cuenta es una neurona, y las neuronas de la cuenta sirven a TODOS sus
 * cerebros (Cerebro → Neuronas enseña las mismas para cualquier cerebro activo), salvo que un
 * cerebro vincule neuronas concretas en sus servidores (`neuronId`). Para no repetir la misma
 * conversación en cada cerebro, los cerebros con EL MISMO conjunto de neuronas se juntan en una
 * sección («Cerebro StarSeed · Huerta»).
 *
 * Cerebros de grupos de otras cuentas que esta cuenta puede leer (compartidos): sus neuronas no se
 * pueden listar desde aquí, así que se ofrece UNA conversación por cuenta (`c:<uid>`), que llega a
 * cualquiera de sus aparatos enlazados contigo (vínculo entre cuentas o enlace local).
 */

import type { DestinoMalla } from "@/lib/mensajeria/medios/enviar";

export interface NeuronaBasica {
    id: string;
    name: string;
    kind?: string;
    online?: boolean;
    isThisDevice?: boolean;
    last_seen_at?: string;
    /** (NEU1108A) Capacidades guardadas de su fila (versión y aparato cuando la presencia no los trae). */
    capabilities?: Record<string, unknown> | null;
}

export interface CerebroBasico {
    id: string;
    name: string;
    scope?: string;
    scope_ref?: string | null;
    owner?: string;
    servers?: Array<Record<string, unknown>>;
    compartido?: boolean;
}

export type AmbitoSeccion = "cuenta" | "grupo" | "compartido" | "otras";

export interface ConversacionNeurona {
    /** `n:<neurona>` (de tu cuenta) o `c:<cuenta>` (cerebro compartido de otra cuenta). */
    clave: string;
    nombre: string;
    kind?: string;
    enLinea?: boolean;
    destino: DestinoMalla;
    /** Frase corta bajo el nombre. */
    detalle: string;
    /** ¿Es de esta cuenta? (el canal de la cuenta en el servidor solo llega a las tuyas). */
    propia: boolean;
    /** (NEU1108A) Capacidades guardadas de esa neurona (solo las de tu cuenta). */
    capacidades?: Record<string, unknown> | null;
}

export interface SeccionCerebro {
    id: string;
    titulo: string;
    ambito: AmbitoSeccion;
    /** Nombres de los cerebros que comparten esta sección. */
    cerebros: string[];
    conversaciones: ConversacionNeurona[];
}

export interface ResultadoAgrupar {
    secciones: SeccionCerebro[];
    /** Esta neurona (no se habla con uno mismo: se dice cuál es). */
    estaNeurona: NeuronaBasica | null;
    /** Conversaciones únicas (sin contar repeticiones). */
    total: number;
}

/** Ids de neurona que un cerebro vincula de forma explícita en sus servidores. */
export function neuronasExplicitas(c: CerebroBasico): string[] {
    const out: string[] = [];
    for (const s of c.servers ?? []) {
        if (!s || typeof s !== "object") continue;
        const config = (s.config && typeof s.config === "object" ? s.config : {}) as Record<string, unknown>;
        for (const v of [s.neuronId, s.neuron_id, config.neuronId, config.neuron_id]) {
            if (typeof v === "string" && v && !out.includes(v)) out.push(v);
        }
    }
    return out;
}

function esGrupal(c: CerebroBasico): boolean {
    return c.scope === "group" || c.scope === "page";
}

function titulo(nombres: string[]): string {
    if (nombres.length <= 3) return nombres.join(" · ");
    return `${nombres.slice(0, 3).join(" · ")} +${nombres.length - 3}`;
}

function ordenarConversaciones(cs: ConversacionNeurona[]): ConversacionNeurona[] {
    return [...cs].sort((a, b) => Number(!!b.enLinea) - Number(!!a.enLinea) || a.nombre.localeCompare(b.nombre, "es"));
}

export function conversacionDeNeurona(n: NeuronaBasica): ConversacionNeurona {
    return {
        clave: `n:${n.id}`,
        nombre: n.name || "Neurona",
        kind: n.kind,
        enLinea: !!n.online,
        destino: { neuronDeviceId: n.id },
        detalle: n.online ? "En línea" : "Desconectada",
        propia: true,
        ...(n.capabilities ? { capacidades: n.capabilities } : {}),
    };
}

/**
 * agruparNeuronasPorCerebro — secciones de la pestaña Neuronas. Pura y determinista.
 * `clavesConMensajes`: conversaciones que ya tienen mensajes en la bandeja; las que no encajen en
 * ninguna sección (una neurona olvidada, otra cuenta que te escribió) van a «Otras neuronas».
 */
export function agruparNeuronasPorCerebro(entrada: {
    cerebros: CerebroBasico[];
    neuronas: NeuronaBasica[];
    miUid: string | null;
    clavesConMensajes?: string[];
    nombresConocidos?: Record<string, string>;
}): ResultadoAgrupar {
    const { cerebros, neuronas, miUid } = entrada;
    const estaNeurona = neuronas.find((n) => n.isThisDevice) ?? null;
    const otras = neuronas.filter((n) => !n.isThisDevice);
    const porId = new Map(otras.map((n) => [n.id, n]));

    const propios = cerebros.filter((c) => !c.compartido && (!c.owner || !miUid || c.owner === miUid));
    const ajenos = cerebros.filter((c) => !propios.includes(c));

    // 1) Cerebros propios agrupados por conjunto de neuronas.
    const porConjunto = new Map<string, { ids: string[]; cerebros: CerebroBasico[] }>();
    for (const c of propios) {
        const explicitas = neuronasExplicitas(c).filter((id) => porId.has(id));
        const ids = (explicitas.length ? explicitas : otras.map((n) => n.id)).slice().sort();
        const k = ids.join(",");
        const g = porConjunto.get(k) ?? { ids, cerebros: [] };
        g.cerebros.push(c);
        porConjunto.set(k, g);
    }
    const secciones: SeccionCerebro[] = [];
    for (const g of porConjunto.values()) {
        if (!g.ids.length) continue;
        const nombres = g.cerebros.map((c) => c.name || "Cerebro");
        secciones.push({
            id: `cerebros:${g.cerebros.map((c) => c.id).join("+")}`,
            titulo: titulo(nombres),
            ambito: g.cerebros.every(esGrupal) ? "grupo" : "cuenta",
            cerebros: nombres,
            conversaciones: ordenarConversaciones(g.ids.map((id) => conversacionDeNeurona(porId.get(id) as NeuronaBasica))),
        });
    }
    // Sin cerebros propios pero con neuronas: una sección de la cuenta.
    if (!propios.length && otras.length) {
        secciones.push({
            id: "cuenta",
            titulo: "Neuronas de tu cuenta",
            ambito: "cuenta",
            cerebros: [],
            conversaciones: ordenarConversaciones(otras.map(conversacionDeNeurona)),
        });
    }

    // 2) Cerebros compartidos (de grupos de otras cuentas): una conversación por cuenta.
    const porDueno = new Map<string, CerebroBasico[]>();
    for (const c of ajenos) {
        if (!c.owner) continue;
        const l = porDueno.get(c.owner) ?? [];
        l.push(c);
        porDueno.set(c.owner, l);
    }
    for (const [owner, cs] of porDueno) {
        const nombres = cs.map((c) => c.name || "Cerebro");
        secciones.push({
            id: `compartido:${owner}`,
            titulo: titulo(nombres),
            ambito: "compartido",
            cerebros: nombres,
            conversaciones: [
                {
                    clave: `c:${owner}`,
                    nombre: `Neuronas de ${titulo(nombres)}`,
                    destino: { uid: owner },
                    detalle: "Cerebro compartido · llega a sus aparatos enlazados contigo",
                    propia: false,
                },
            ],
        });
    }

    // 3) Conversaciones con mensajes que no encajan en ninguna sección.
    const vistas = new Set(secciones.flatMap((s) => s.conversaciones.map((c) => c.clave)));
    const huerfanas: ConversacionNeurona[] = [];
    for (const clave of entrada.clavesConMensajes ?? []) {
        if (vistas.has(clave) || !(clave.startsWith("n:") || clave.startsWith("c:"))) continue;
        if (estaNeurona && clave === `n:${estaNeurona.id}`) continue;
        vistas.add(clave);
        const id = clave.slice(2);
        const conocido = entrada.nombresConocidos?.[clave];
        const propia = clave.startsWith("n:");
        huerfanas.push({
            clave,
            nombre: conocido || (propia ? `Neurona ${id.slice(0, 6)}` : `Cuenta ${id.slice(0, 6)}`),
            destino: propia ? { neuronDeviceId: id } : { uid: id },
            detalle: propia ? "Ya no está en la lista de tu cuenta" : "Otra cuenta que te escribió por la malla",
            propia,
        });
    }
    if (huerfanas.length) {
        secciones.push({ id: "otras", titulo: "Otras neuronas", ambito: "otras", cerebros: [], conversaciones: ordenarConversaciones(huerfanas) });
    }

    return { secciones, estaNeurona, total: vistas.size };
}
