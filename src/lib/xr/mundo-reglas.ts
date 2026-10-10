/**
 * StarSeed XR · REGLAS de un MundoSpec: «cuando X, entonces Y» con vocabulario CERRADO. No hay scripts ni
 * expresiones: quien necesite más lógica la pide a la Protomolécula, que la propone como candidato aislado
 * que una persona acepta (contrato §6). Una regla con una referencia rota se descarta y se explica.
 */
import { MAX_ACCIONES_POR_REGLA, MAX_REGLAS, CIELOS_MUNDO, type AccionMundo, type Disparador, type ReglaMundo } from "./mundo-tipos";
import { Acta, cad, color, elegir, esObjeto, ident, num, urlHttps, vec } from "./mundo-saneo";

export interface Referencias {
    objetos: Set<string>;
    zonas: Set<string>;
    spawns: Set<string>;
    pizarras: Set<string>;
    pantallas: Set<string>;
}

const CON_ZONA = ["al-entrar", "al-salir"];
const CON_OBJETO = ["al-tocar", "al-agarrar", "al-soltar", "al-chocar"];
const SOBRE_OBJETO = ["mostrar", "ocultar", "alternar", "mover", "girar", "color", "fuerza"];

function existe(conj: Set<string>, id: unknown, ruta: string, que: string, a: Acta): string | null {
    if (typeof id === "string" && conj.has(id)) return id;
    a.error(ruta, `La regla apunta a ${que} «${String(id)}» que no existe.`, `Usa el id de ${que} ya declarado, o crea primero ese elemento.`);
    return null;
}

function disparador(v: unknown, r: Referencias, ruta: string, a: Acta): Disparador | null {
    if (!esObjeto(v)) { a.error(ruta, "Falta el disparador.", "Define `cuando` con un `tipo` de la lista."); return null; }
    const t = v.tipo;
    if (typeof t === "string" && CON_ZONA.includes(t)) {
        const z = existe(r.zonas, v.zona, `${ruta}.zona`, "zona", a);
        return z ? { tipo: t as "al-entrar" | "al-salir", zona: z } : null;
    }
    if (typeof t === "string" && CON_OBJETO.includes(t)) {
        const o = existe(r.objetos, v.objeto, `${ruta}.objeto`, "objeto", a);
        return o ? { tipo: t as "al-tocar", objeto: o } : null;
    }
    if (t === "cada") return { tipo: "cada", ms: num(v.ms, 500, 3_600_000, 5000, `${ruta}.ms`, a) };
    if (t === "al-llegar-persona") return { tipo: "al-llegar-persona" };
    a.error(`${ruta}.tipo`, `Disparador «${String(t)}» desconocido.`, "Admitidos: al-entrar, al-salir, al-tocar, al-agarrar, al-soltar, al-chocar, cada, al-llegar-persona.");
    return null;
}

function accion(v: unknown, r: Referencias, ruta: string, a: Acta): AccionMundo | null {
    if (!esObjeto(v) || typeof v.tipo !== "string") { a.error(ruta, "Acción sin tipo.", "Cada acción lleva un `tipo` de la lista cerrada."); return null; }
    const t = v.tipo;
    if (SOBRE_OBJETO.includes(t)) {
        const objeto = existe(r.objetos, v.objeto, `${ruta}.objeto`, "objeto", a);
        if (!objeto) return null;
        if (t === "mover" || t === "girar") return { tipo: t, objeto, valor: vec(v.valor, -500, 500, [0, 0, 0], `${ruta}.valor`, a), ms: num(v.ms, 0, 60_000, 600, `${ruta}.ms`, a) };
        if (t === "color") return { tipo: "color", objeto, color: color(v.color, "#ffffff", `${ruta}.color`, a) };
        if (t === "fuerza") return { tipo: "fuerza", objeto, vector: vec(v.vector, -50, 50, [0, 0, 0], `${ruta}.vector`, a) };
        return { tipo: t as "mostrar", objeto };
    }
    if (t === "teletransportar") { const s = existe(r.spawns, v.spawn, `${ruta}.spawn`, "punto de entrada", a); return s ? { tipo: t, spawn: s } : null; }
    if (t === "abrir-pizarra") { const p = existe(r.pizarras, v.pizarra, `${ruta}.pizarra`, "pizarra", a); return p ? { tipo: t, pizarra: p } : null; }
    if (t === "abrir-pantalla") { const p = existe(r.pantallas, v.pantalla, `${ruta}.pantalla`, "pantalla", a); return p ? { tipo: t, pantalla: p } : null; }
    if (t === "mensaje" || t === "pedir-a-astraura") {
        const texto = cad(v.texto, t === "mensaje" ? 140 : 280, "", `${ruta}.texto`, a);
        return texto ? { tipo: t, texto } : null;
    }
    if (t === "cielo") return { tipo: "cielo", cielo: elegir(v.cielo, CIELOS_MUNDO, "noche", `${ruta}.cielo`, a) };
    if (t === "sonido") {
        const f = typeof v.fuente === "string" && v.fuente.startsWith("https:") ? urlHttps(v.fuente, `${ruta}.fuente`, a) : ident(v.fuente, `${ruta}.fuente`, a);
        return f ? { tipo: "sonido", fuente: f, objeto: typeof v.objeto === "string" && r.objetos.has(v.objeto) ? v.objeto : undefined } : null;
    }
    a.error(`${ruta}.tipo`, `Acción «${t}» desconocida.`, "No hay scripts: usa sólo mostrar, ocultar, alternar, mover, girar, color, fuerza, sonido, teletransportar, mensaje, cielo, abrir-pizarra, abrir-pantalla o pedir-a-astraura.");
    return null;
}

export function sanearReglas(brutas: unknown, r: Referencias, a: Acta): ReglaMundo[] {
    if (brutas === undefined) return [];
    if (!Array.isArray(brutas)) { a.error("reglas", "Las reglas deben ser una lista.", "Usa `reglas: []` y añade objetos {id, cuando, entonces}."); return []; }
    if (brutas.length > MAX_REGLAS) a.error("reglas", `Hay ${brutas.length} reglas (máximo ${MAX_REGLAS}).`, "Fusiona reglas parecidas o pide a la Protomolécula un candidato de lógica compuesta.");
    const vistos = new Set<string>();
    const salida: ReglaMundo[] = [];
    brutas.slice(0, MAX_REGLAS).forEach((b, i) => {
        const ruta = `reglas[${i}]`;
        if (!esObjeto(b)) { a.error(ruta, "Regla inválida.", "Debe ser un objeto {id, cuando, entonces}."); return; }
        const id = ident(b.id, `${ruta}.id`, a);
        if (!id) return;
        if (vistos.has(id)) { a.error(`${ruta}.id`, `Id repetido «${id}».`, "Cada regla lleva un id distinto."); return; }
        const cuando = disparador(b.cuando, r, `${ruta}.cuando`, a);
        const lista = Array.isArray(b.entonces) ? b.entonces : [];
        if (!lista.length) a.error(`${ruta}.entonces`, "La regla no hace nada.", "Añade entre 1 y 6 acciones.");
        if (lista.length > MAX_ACCIONES_POR_REGLA) a.error(`${ruta}.entonces`, `Demasiadas acciones (${lista.length}).`, `Máximo ${MAX_ACCIONES_POR_REGLA}; divide la regla.`);
        const entonces = lista.slice(0, MAX_ACCIONES_POR_REGLA).map((x, j) => accion(x, r, `${ruta}.entonces[${j}]`, a)).filter((x): x is AccionMundo => x !== null);
        if (!cuando || !entonces.length) return;
        vistos.add(id);
        salida.push({ id, cuando, entonces, ...(b.unaVez === true ? { unaVez: true } : {}) });
    });
    return salida;
}
