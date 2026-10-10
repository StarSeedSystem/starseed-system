/**
 * StarSeed XR · VALIDADOR de MundoSpec. Entra cualquier cosa (la IA, otra persona, la red) y sale un mundo
 * DEPURADO y seguro más la lista de problemas, cada uno con su «cómo arreglarlo». Lo que no está en el
 * vocabulario cerrado se descarta; nunca se ejecuta nada. `costoMundo` dice a qué nivel de calidad cabe y
 * `adaptarANivel` lo recorta con honestidad cuando se abre en un aparato más modesto. Módulo PURO.
 */
import type { NivelCalidad, Vec3 } from "./tipos";
import { NIVELES_CALIDAD } from "./tipos";
import {
    CIELOS_MUNDO, CUERPOS, EFECTOS_ZONA, FORMAS_CUERPO, FORMAS_PRIMITIVAS, FORMATOS_BIBLIOTECA, LIMITES, TERRENOS, VERSION_MUNDO,
    type CuerpoFisico, type FuenteObjeto, type MundoSpec, type ObjetoMundo, type PantallaMundo, type PortalMundo, type ZonaMundo,
} from "./mundo-tipos";
import { Acta, cad, color, elegir, esObjeto, ident, num, urlHttps, vec, type ProblemaMundo } from "./mundo-saneo";
import { sanearReglas } from "./mundo-reglas";

export type { ProblemaMundo } from "./mundo-saneo";
export interface CostoMundo { objetos: number; luces: number; cuerpos: number; portales: number; pantallas: number; pizarras: number; zonas: number; triangulos: number; nivelMinimo: NivelCalidad | null }
export interface ResultadoMundo { ok: boolean; mundo: MundoSpec | null; problemas: ProblemaMundo[]; costo: CostoMundo | null }

const CERO: Vec3 = [0, 0, 0];
const UNO: Vec3 = [1, 1, 1];
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function cuerpo(v: unknown, ruta: string, a: Acta): CuerpoFisico | undefined {
    if (!esObjeto(v)) return undefined;
    return {
        tipo: elegir(v.tipo, CUERPOS, "fijo", `${ruta}.tipo`, a), forma: elegir(v.forma, FORMAS_CUERPO, "caja", `${ruta}.forma`, a),
        masa: num(v.masa, 0.01, 1000, 1, `${ruta}.masa`, a), rebote: num(v.rebote, 0, 1, 0.2, `${ruta}.rebote`, a),
        friccion: num(v.friccion, 0, 2, 0.6, `${ruta}.friccion`, a), agarrable: v.agarrable === true,
    };
}

function fuente(v: unknown, ruta: string, a: Acta): FuenteObjeto | null {
    if (!esObjeto(v)) { a.error(ruta, "Falta la fuente del objeto.", "Usa {tipo:'primitiva'|'biblioteca'|'texto', …}."); return null; }
    if (v.tipo === "primitiva") return { tipo: "primitiva", forma: elegir(v.forma, FORMAS_PRIMITIVAS, "caja", `${ruta}.forma`, a) };
    if (v.tipo === "texto") return { tipo: "texto", contenido: cad(v.contenido, 280, "", `${ruta}.contenido`, a) };
    if (v.tipo === "biblioteca") {
        const id = ident(v.id, `${ruta}.id`, a);
        return id ? { tipo: "biblioteca", id, formato: elegir(v.formato, FORMATOS_BIBLIOTECA, "glb", `${ruta}.formato`, a) } : null;
    }
    a.error(`${ruta}.tipo`, `Fuente «${String(v.tipo)}» desconocida.`, "Admitidas: primitiva, biblioteca (por id de la Biblioteca, nunca una URL suelta) y texto.");
    return null;
}

/** Recorre una lista de elementos con id único y devuelve sólo los válidos. */
function coleccion<T extends { id: string }>(brutos: unknown, nombre: string, a: Acta, uno: (b: Record<string, unknown>, id: string, ruta: string) => T | null): T[] {
    const vistos = new Set<string>();
    const salida: T[] = [];
    lista(brutos).forEach((b, i) => {
        const ruta = `${nombre}[${i}]`;
        if (!esObjeto(b)) { a.error(ruta, "Elemento inválido.", "Debe ser un objeto con `id`."); return; }
        const id = ident(b.id, `${ruta}.id`, a);
        if (!id) return;
        if (vistos.has(id)) { a.error(`${ruta}.id`, `Id repetido «${id}».`, "Cada elemento lleva un id distinto."); return; }
        const t = uno(b, id, ruta);
        if (t) { vistos.add(id); salida.push(t); }
    });
    return salida;
}

export function validarMundo(bruto: unknown, nivel?: NivelCalidad): ResultadoMundo {
    const a = new Acta();
    if (!esObjeto(bruto) || bruto.tipo !== "mundo-xr") {
        a.error("tipo", "No es un mundo XR.", "Debe ser un objeto con `tipo: \"mundo-xr\"` y `version: 1`.");
        return { ok: false, mundo: null, problemas: a.problemas, costo: null };
    }
    if (bruto.version !== VERSION_MUNDO) a.error("version", `Versión ${String(bruto.version)} no soportada.`, `Esta versión del OS lee la ${VERSION_MUNDO}.`);
    const ent = esObjeto(bruto.entorno) ? bruto.entorno : {};
    const fis = esObjeto(bruto.fisica) ? bruto.fisica : {};
    const inter = esObjeto(bruto.interaccion) ? bruto.interaccion : {};
    const mundo: MundoSpec = {
        version: 1, tipo: "mundo-xr", nombre: cad(bruto.nombre, 60, "Mundo sin nombre", "nombre", a),
        ...(bruto.descripcion !== undefined ? { descripcion: cad(bruto.descripcion, 280, "", "descripcion", a) } : {}),
        modo: elegir(bruto.modo, ["vr", "ar", "ambos"] as const, "ambos", "modo", a),
        entorno: {
            cielo: elegir(ent.cielo, CIELOS_MUNDO, "nebulosa", "entorno.cielo", a), terreno: elegir(ent.terreno, TERRENOS, "plano", "entorno.terreno", a),
            tamano: num(ent.tamano, 4, 500, 40, "entorno.tamano", a), colorSuelo: color(ent.colorSuelo, "#1c1b2e", "entorno.colorSuelo", a),
            semilla: Math.trunc(num(ent.semilla, 0, 2 ** 31 - 1, 1, "entorno.semilla", a)), alturaMax: num(ent.alturaMax, 0, 30, 2, "entorno.alturaMax", a),
        },
        fisica: { gravedad: num(fis.gravedad, -30, 0, -9.81, "fisica.gravedad", a), suelo: fis.suelo !== false },
        interaccion: { tocar: elegir(inter.tocar, ["dueno", "editor", "comentarista", "observador"] as const, "observador", "interaccion.tocar", a), agarrar: elegir(inter.agarrar, ["dueno", "editor", "comentarista", "observador"] as const, "editor", "interaccion.agarrar", a) },
        maxJugadores: Math.trunc(num(bruto.maxJugadores, 1, 64, 8, "maxJugadores", a)),
        spawns: coleccion(bruto.spawns, "spawns", a, (b, id, r) => ({ id, pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), yaw: num(b.yaw, -Math.PI * 2, Math.PI * 2, 0, `${r}.yaw`, a) })),
        luces: coleccion(bruto.luces, "luces", a, (b, id, r) => ({
            id, clase: elegir(b.clase, ["ambiente", "direccional", "puntual", "foco"] as const, "puntual", `${r}.clase`, a), pos: vec(b.pos, -500, 500, [0, 3, 0], `${r}.pos`, a),
            color: color(b.color, "#ffffff", `${r}.color`, a), intensidad: num(b.intensidad, 0, 20, 1, `${r}.intensidad`, a), alcance: num(b.alcance, 0, 200, 0, `${r}.alcance`, a),
        })),
        objetos: coleccion<ObjetoMundo>(bruto.objetos, "objetos", a, (b, id, r) => {
            const f = fuente(b.fuente, `${r}.fuente`, a);
            if (!f) return null;
            const cuerpoDe = cuerpo(b.cuerpo, `${r}.cuerpo`, a);
            return {
                id, nombre: cad(b.nombre, 60, id, `${r}.nombre`, a), fuente: f, pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), rot: vec(b.rot, -Math.PI * 2, Math.PI * 2, CERO, `${r}.rot`, a),
                esc: vec(b.esc, 0.01, 100, UNO, `${r}.esc`, a), color: color(b.color, "#7c5cff", `${r}.color`, a), ...(b.oculto === true ? { oculto: true } : {}),
                ...(cuerpoDe ? { cuerpo: cuerpoDe } : {}),
                ...(b.triangulos !== undefined ? { triangulos: Math.trunc(num(b.triangulos, 0, 5_000_000, 0, `${r}.triangulos`, a)) } : {}),
                prioridad: Math.trunc(num(b.prioridad, 0, 3, 1, `${r}.prioridad`, a)) as 0 | 1 | 2 | 3,
            };
        }),
        portales: coleccion<PortalMundo>(bruto.portales, "portales", a, (b, id, r) => {
            const d = esObjeto(b.destino) ? b.destino : {};
            const dest = ident(d.tipo === "punto" ? d.spawn : d.id, `${r}.destino`, a);
            const tipo = d.tipo;
            if (!dest || (tipo !== "punto" && tipo !== "mundo" && tipo !== "estacion" && tipo !== "servidor" && tipo !== "sala")) { if (dest) a.error(`${r}.destino.tipo`, `Destino «${String(tipo)}» desconocido.`, "Admitidos: punto, mundo, estacion, servidor, sala."); return null; }
            return { id, nombre: cad(b.nombre, 60, id, `${r}.nombre`, a), pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), rot: vec(b.rot, -Math.PI * 2, Math.PI * 2, CERO, `${r}.rot`, a), radio: num(b.radio, 0.3, 5, 1, `${r}.radio`, a), destino: tipo === "punto" ? { tipo, spawn: dest } : { tipo, id: dest } };
        }),
        zonas: coleccion<ZonaMundo>(bruto.zonas, "zonas", a, (b, id, r) => ({ id, nombre: cad(b.nombre, 60, id, `${r}.nombre`, a), forma: b.forma === "esfera" ? "esfera" : "caja", pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), tam: vec(b.tam, 0.1, 500, UNO, `${r}.tam`, a), efecto: elegir(b.efecto, EFECTOS_ZONA, "nada", `${r}.efecto`, a) })),
        pizarras: coleccion(bruto.pizarras, "pizarras", a, (b, id, r) => ({ id, pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), rot: vec(b.rot, -Math.PI * 2, Math.PI * 2, CERO, `${r}.rot`, a), ancho: num(b.ancho, 0.3, 8, 2, `${r}.ancho`, a), alto: num(b.alto, 0.3, 5, 1.2, `${r}.alto`, a), ...(typeof b.salaId === "string" && ident(b.salaId, `${r}.salaId`, a) ? { salaId: b.salaId } : {}) })),
        pantallas: coleccion<PantallaMundo>(bruto.pantallas, "pantallas", a, (b, id, r) => {
            const f = esObjeto(b.fuente) ? b.fuente : {};
            let fu: PantallaMundo["fuente"] | null = null;
            if (f.tipo === "llamada") fu = { tipo: "llamada" };
            else if (f.tipo === "estacion") { const e = ident(f.id, `${r}.fuente.id`, a); fu = e ? { tipo: "estacion", id: e } : null; }
            else if (f.tipo === "https") { const u = urlHttps(f.url, `${r}.fuente.url`, a); fu = u ? { tipo: "https", url: u } : null; }
            else if (f.tipo === "app" && typeof f.ruta === "string" && /^\/(?!\/)[a-z0-9\-_/.]*$/i.test(f.ruta) && !f.ruta.includes("..")) fu = { tipo: "app", ruta: f.ruta };
            else a.error(`${r}.fuente`, "Fuente de pantalla no válida.", "Usa estacion (id), llamada, https (url) o app (ruta interna que empiece por /).");
            return fu ? { id, pos: vec(b.pos, -500, 500, CERO, `${r}.pos`, a), rot: vec(b.rot, -Math.PI * 2, Math.PI * 2, CERO, `${r}.rot`, a), ancho: num(b.ancho, 0.3, 12, 3, `${r}.ancho`, a), fuente: fu, sonido: b.sonido === "mudo" ? "mudo" : "espacial" } : null;
        }),
        reglas: [],
    };
    if (!mundo.spawns.length) { a.aviso("spawns", "No hay punto de entrada.", "Se añadió uno en el centro; añade `spawns` para elegir dónde aparece cada persona."); mundo.spawns.push({ id: "entrada", pos: CERO, yaw: 0 }); }
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
    mundo.reglas = sanearReglas(bruto.reglas, { objetos: ids(mundo.objetos), zonas: ids(mundo.zonas), spawns: ids(mundo.spawns), pizarras: ids(mundo.pizarras), pantallas: ids(mundo.pantallas) }, a);
    mundo.portales = mundo.portales.filter((p, i) => {
        if (p.destino.tipo !== "punto" || mundo.spawns.some((s) => s.id === (p.destino as { spawn: string }).spawn)) return true;
        a.error(`portales[${i}].destino`, "El portal lleva a un punto que no existe.", "Usa el id de uno de `spawns`.");
        return false;
    });
    const costo = costoMundo(mundo);
    if (nivel) {
        const l = LIMITES[nivel];
        const sobre = (k: keyof typeof l, n: number, que: string) => n > l[k] && a.error(k, `${n} ${que} superan el límite del nivel «${nivel}» (${l[k]}).`, `Quita o agrupa ${n - l[k]}, o abre el mundo en un aparato de nivel superior (nivel mínimo: ${costo.nivelMinimo ?? "ninguno"}).`);
        sobre("objetos", costo.objetos, "objetos"); sobre("luces", costo.luces, "luces"); sobre("cuerpos", costo.cuerpos, "cuerpos físicos"); sobre("portales", costo.portales, "portales");
        sobre("pantallas", costo.pantallas, "pantallas"); sobre("pizarras", costo.pizarras, "pizarras"); sobre("zonas", costo.zonas, "zonas"); sobre("triangulos", costo.triangulos, "triángulos"); sobre("jugadores", mundo.maxJugadores, "jugadores");
    }
    return { ok: !a.hayErrores, mundo, problemas: a.problemas, costo };
}

const TRIANGULOS_ESTIMADOS = { primitiva: 600, texto: 300, biblioteca: 20_000 } as const;

export function costoMundo(m: MundoSpec): CostoMundo {
    const triangulos = m.objetos.reduce((s, o) => s + (o.triangulos ?? TRIANGULOS_ESTIMADOS[o.fuente.tipo]), 0);
    const c = { objetos: m.objetos.length, luces: m.luces.length, cuerpos: m.objetos.filter((o) => o.cuerpo && o.cuerpo.tipo !== "fijo").length, portales: m.portales.length, pantallas: m.pantallas.length, pizarras: m.pizarras.length, zonas: m.zonas.length, triangulos };
    const cabe = (n: NivelCalidad) => { const l = LIMITES[n]; return c.objetos <= l.objetos && c.luces <= l.luces && c.cuerpos <= l.cuerpos && c.portales <= l.portales && c.pantallas <= l.pantallas && c.pizarras <= l.pizarras && c.zonas <= l.zonas && triangulos <= l.triangulos && m.maxJugadores <= l.jugadores; };
    return { ...c, nivelMinimo: NIVELES_CALIDAD.find(cabe) ?? null };
}

/** Recorta un mundo ya válido para un nivel más modesto: poda lo decorativo primero y dice qué quitó. */
export function adaptarANivel(m: MundoSpec, nivel: NivelCalidad): { mundo: MundoSpec; recortes: string[] } {
    const l = LIMITES[nivel];
    const recortes: string[] = [];
    const recorta = <T,>(xs: T[], max: number, que: string, orden?: (a: T, b: T) => number): T[] => {
        if (xs.length <= max) return xs;
        recortes.push(`${xs.length - max} ${que} quitados para el nivel «${nivel}».`);
        const idx = xs.map((x, i) => ({ x, i }));
        if (orden) idx.sort((p, q) => orden(p.x, q.x) || p.i - q.i);
        return idx.slice(0, max).sort((p, q) => p.i - q.i).map((p) => p.x);
    };
    const referenciados = new Set<string>();
    m.reglas.forEach((r) => { if ("objeto" in r.cuando) referenciados.add(r.cuando.objeto); r.entonces.forEach((x) => { if ("objeto" in x && x.objeto) referenciados.add(x.objeto); }); });
    const peso = (o: ObjetoMundo) => o.prioridad + (referenciados.has(o.id) ? 4 : 0);
    let objetos = recorta(m.objetos, l.objetos, "objetos decorativos", (p, q) => peso(q) - peso(p));
    let dinamicos = 0;
    objetos = objetos.map((o) => {
        if (!o.cuerpo || o.cuerpo.tipo === "fijo") return o;
        dinamicos += 1;
        return dinamicos > l.cuerpos ? { ...o, cuerpo: { ...o.cuerpo, tipo: "fijo" as const } } : o;
    });
    if (dinamicos > l.cuerpos) recortes.push(`${dinamicos - l.cuerpos} cuerpos físicos pasaron a fijos para el nivel «${nivel}».`);
    const adaptado: MundoSpec = {
        ...m, objetos, luces: recorta(m.luces, l.luces, "luces"), portales: recorta(m.portales, l.portales, "portales"), zonas: recorta(m.zonas, l.zonas, "zonas"),
        pantallas: recorta(m.pantallas, l.pantallas, "pantallas"), pizarras: recorta(m.pizarras, l.pizarras, "pizarras"), maxJugadores: Math.min(m.maxJugadores, l.jugadores),
    };
    // Revalidar descarta las reglas y portales que apuntaban a lo recortado, y lo dice.
    const rev = validarMundo(adaptado);
    if (rev.mundo && rev.mundo.reglas.length < m.reglas.length) recortes.push(`${m.reglas.length - rev.mundo.reglas.length} reglas quitadas porque apuntaban a elementos recortados.`);
    return { mundo: rev.mundo ?? adaptado, recortes };
}
