/** IDI1115N · utilidades compartidas por extraer/rellenar/cobertura y por la prueba de cobertura. */
import fs from "node:fs";
import path from "node:path";

export const RAIZ = path.resolve(new URL("../..", import.meta.url).pathname);
export const DIR = path.join(RAIZ, "src/lib/idiomas");
export const leerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export const sinTraducir = () => new Set(leerJson(path.join(DIR, "sin-traducir.json")).textos);
export const cargarFuente = () => leerJson(path.join(DIR, "catalogos/fuente.json"));
export const cargarUnidades = () => leerJson(path.join(DIR, "unidades.json"));
export const rutaCatalogo = (codigo) => path.join(DIR, "catalogos", `${codigo}.json`);
export const cargarCatalogo = (codigo) => fs.existsSync(rutaCatalogo(codigo)) ? leerJson(rutaCatalogo(codigo)) : { codigo, revisado: false, entradas: {} };

/** Textos fuente de una unidad (acceso, shell, ajustes) o de un área del extractor («components/settings»). */
export function textosDeUnidad(fuente, unidades, nombre) {
    const L = fuente.archivosLista;
    const u = unidades[nombre];
    const quita = (rel) => rel;
    const coincide = u
        ? (rel) => u.prefijos.some((p) => rel.startsWith(p))
        : (rel) => rel.startsWith(nombre.replace(/^components\//, "components/").replace(/^app\//, "app/") + "/");
    const exentos = sinTraducir();
    return Object.entries(fuente.claves).filter(([t, f]) => !exentos.has(t) && f.some((i) => coincide(quita(L[i])))).map(([t]) => t);
}

/** Valores {n} de un texto: el conjunto debe conservarse en la traducción. */
export const valores = (t) => [...t.matchAll(/\{\s*(\d+)\s*[,}]/g)].map((m) => m[1]).sort().filter((v, i, a) => a.indexOf(v) === i).join(",");
export const etiquetas = (t) => (t.match(/<\/?[a-zA-Z][^>]*>/g) ?? []).sort().join("");
const rama = (t) => [...t.matchAll(/\b(zero|one|two|few|many|other|=\d+)\s*\{/g)].map((m) => m[1]);
export const marcas = ["StarSeed", "Astraura", "Genesis", "MetaGenesis", "PoliGenesis", "ProtoGenesis", "Protomolécula", "Trinity"];

/** Motivo por el que una traducción NO es aceptable, o null si lo es. */
export function rechazo(fuente, traduccion) {
    if (!traduccion || !traduccion.trim()) return "vacía";
    if (valores(fuente) !== valores(traduccion)) return `pierde o cambia un valor ({n}): «${valores(fuente)}» ≠ «${valores(traduccion)}»`;
    if (etiquetas(fuente) !== etiquetas(traduccion)) return "pierde o cambia una etiqueta";
    if (rama(fuente).length && !rama(traduccion).includes("other")) return "plural sin rama «other»";
    for (const m of marcas) if (fuente.includes(m) && !traduccion.includes(m)) return `pierde la marca «${m}»`;
    const abre = (traduccion.match(/\{/g) ?? []).length, cierra = (traduccion.match(/\}/g) ?? []).length;
    if (abre !== cierra) return "llaves sin cerrar";
    return null;
}

/** Cobertura de un catálogo en una unidad o área: total, presentes, ausentes y caducas (sobran o son inválidas). */
export function coberturaDe(fuente, unidades, catalogo, nombre) {
    const textos = textosDeUnidad(fuente, unidades, nombre);
    const conjunto = new Set(textos);
    const ausentes = textos.filter((t) => !catalogo.entradas[t]);
    const invalidas = textos.filter((t) => catalogo.entradas[t] && rechazo(t, catalogo.entradas[t]));
    // «Caduca»: entrada cuyo texto fuente ya no existe en ninguna parte del código medido.
    const caducas = Object.keys(catalogo.entradas).filter((t) => !(t in fuente.claves));
    return { total: textos.length, presentes: textos.length - ausentes.length, ausentes, invalidas, caducas, conjunto };
}
export const idiomasConCatalogo = () => fs.readdirSync(path.join(DIR, "catalogos")).filter((f) => /^[a-z-]+\.json$/.test(f) && f !== "fuente.json").map((f) => f.replace(".json", "")).sort();
