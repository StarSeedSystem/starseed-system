#!/usr/bin/env node
/**
 * IDI1115N · Extractor del catálogo fuente (español) con la API del compilador de TypeScript.
 * Recoge los textos que una persona lee o escucha: texto JSX, atributos visibles
 * (aria-label, placeholder, title, alt, label…), textos literales de JSX en expresiones y
 * los pasados a avisos y diálogos (toast, confirm, alert…). Un texto con valores
 * interpolados queda como patrón con {0}, {1}… Agrupa por área: primeras carpetas de
 * src/app y src/components. Escribe src/lib/idiomas/catalogos/fuente.json e imprime el recuento.
 * Uso: node scripts/idiomas/extraer.mjs [--raiz .] [--salida ruta]
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export const ATRIBUTOS_VISIBLES = new Set(["aria-label", "aria-description", "aria-placeholder", "aria-valuetext", "placeholder", "title", "alt", "label", "description", "helperText", "emptyText", "tooltip", "caption"]);
const LLAMADAS_AVISO = new Set(["toast", "notify", "notificar", "confirm", "alert", "prompt", "avisar", "useConfirm", "pedirConfirmacion", "mostrarAviso"]);
const PROPIEDADES_AVISO = new Set(["title", "description", "message", "mensaje", "titulo", "descripcion", "label", "confirmLabel", "cancelLabel", "text", "texto", "body", "action"]);

/** Propiedades de objetos de datos que llevan texto de pantalla (etiquetas de pestañas, pasos, opciones). */
const PROPIEDADES_DATOS = new Set(["label", "etiqueta", "titulo", "title", "descripcion", "description", "texto", "text", "mensaje", "txt", "ayuda", "hint", "subtitulo", "placeholder", "aviso", "tooltip", "cta", "nombre_visible"]);
/** setXxx(«texto») de estados que se pintan: avisos, mensajes y errores de formulario. */
const RE_ESTADO_TEXTO = /^set[A-Z]\w*(Msg|Mensaje|Error|Aviso|Texto|Status|Estado|Notice|Feedback)\w*$/;
const tieneLetra = (t) => /\p{L}/u.test(t);
export const normalizar = (t) => t.replace(/\s+/g, " ").trim();

/** Texto de un literal o plantilla; las expresiones pasan a {0}, {1}… */
function textoDeNodo(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) {
        let i = 0, s = n.head.text;
        for (const p of n.templateSpans) s += `{${i++}}` + p.literal.text;
        return s;
    }
    return null;
}
/** Literales alcanzables sin pasar por una llamada: a, a ? b : c, a ?? b, a || b, paréntesis. */
function literalesDe(n, salida = []) {
    if (!n) return salida;
    if (ts.isParenthesizedExpression(n)) return literalesDe(n.expression, salida);
    if (ts.isConditionalExpression(n)) { literalesDe(n.whenTrue, salida); literalesDe(n.whenFalse, salida); return salida; }
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(n.operatorToken.kind)) {
        literalesDe(n.left, salida); literalesDe(n.right, salida); return salida;
    }
    const t = textoDeNodo(n);
    if (t !== null) salida.push(t);
    return salida;
}
const nombreLlamada = (e) => ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? nombreLlamada(e.expression) : null;

export function extraerDeFuente(codigo, nombre) {
    const sf = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, nombre.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const textos = [];
    const anota = (t) => { const n = normalizar(t); if (n && tieneLetra(n) && n.length <= 600) textos.push(n); };
    const dentroDeAviso = (nodo) => {
        for (let p = nodo.parent; p; p = p.parent) {
            if (ts.isCallExpression(p) && LLAMADAS_AVISO.has(nombreLlamada(p.expression) ?? "")) return true;
        }
        return false;
    };
    const visita = (n) => {
        if (ts.isJsxText(n)) { anota(n.text); }
        else if (ts.isJsxAttribute(n) && n.name && ATRIBUTOS_VISIBLES.has(n.name.getText(sf))) {
            const v = n.initializer;
            if (v && ts.isStringLiteral(v)) anota(v.text);
            else if (v && ts.isJsxExpression(v)) literalesDe(v.expression).forEach(anota);
        } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
            literalesDe(n.expression).forEach(anota); // {"texto"} o {cond ? "a" : "b"} como hijo
        } else if (ts.isPropertyAssignment(n) && PROPIEDADES_DATOS.has(n.name.getText(sf).replace(/['"]/g, "")) && !dentroDeAviso(n)) {
            literalesDe(n.initializer).forEach(anota);
        } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && RE_ESTADO_TEXTO.test(n.expression.text)) {
            for (const arg of n.arguments) {
                literalesDe(arg).forEach(anota);
                if (ts.isObjectLiteralExpression(arg)) for (const p of arg.properties) if (ts.isPropertyAssignment(p) && PROPIEDADES_DATOS.has(p.name.getText(sf))) literalesDe(p.initializer).forEach(anota);
            }
        } else if (ts.isCallExpression(n) && LLAMADAS_AVISO.has(nombreLlamada(n.expression) ?? "")) {
            for (const arg of n.arguments) {
                literalesDe(arg).forEach(anota);
                if (ts.isObjectLiteralExpression(arg)) {
                    for (const p of arg.properties) {
                        if (ts.isPropertyAssignment(p) && PROPIEDADES_AVISO.has(p.name.getText(sf))) literalesDe(p.initializer).forEach(anota);
                    }
                }
            }
        }
        ts.forEachChild(n, visita);
    };
    visita(sf);
    return textos;
}

/** Archivos de datos (no JSX) cuyos literales son texto de pantalla: pasos de la guía de la ventana de acceso. */
export const ARCHIVOS_DATOS = ["lib/onboarding/guia-completa.ts", "lib/onboarding/guia-temas-red.ts", "lib/onboarding/guia-temas-sistema.ts"];
/** De un archivo de datos: literales con aspecto de frase (espacio o inicial mayúscula) que no son rutas ni identificadores. */
export function extraerDatos(codigo, nombre) {
    const sf = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const textos = [];
    const visita = (n) => {
        if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
            const t = normalizar(textoDeNodo(n) ?? "");
            if (t && tieneLetra(t) && /[ ¿¡]|^\p{Lu}/u.test(t) && !/^[\w./:#@-]+$/.test(t) && !/^[a-z]+(-[a-z0-9]+)+$/.test(t)) textos.push(t);
        }
        ts.forEachChild(n, visita);
    };
    visita(sf);
    return textos;
}

export function areaDe(rel) {
    const p = rel.split("/");
    if ((p[0] === "app" || p[0] === "components") && p.length > 1) {
        let i = 1;
        while (p[i] && /^\(.*\)$/.test(p[i]) && p.length > i + 1) i++; // grupos de rutas (app), (main)
        return p[i] && !p[i].includes(".") ? `${p[0]}/${p[i].replace(/[()]/g, "")}` : `${p[0]}/(raíz)`;
    }
    return p[0] === "lib" ? "datos/onboarding" : null;
}

function* ficheros(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = path.join(dir, e.name);
        if (e.isDirectory()) { if (!["__tests__", "node_modules", "api"].includes(e.name)) yield* ficheros(r); }
        else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) yield r;
    }
}

export function extraerTodo(raiz) {
    const src = path.join(raiz, "src");
    const claves = {}; // texto → { areas:Set, archivos:[] }
    let archivos = 0;
    for (const base of ["app", "components"]) {
        for (const f of ficheros(path.join(src, base))) {
            const rel = path.relative(src, f).split(path.sep).join("/");
            const area = areaDe(rel);
            archivos++;
            for (const t of extraerDeFuente(fs.readFileSync(f, "utf8"), f)) {
                const c = (claves[t] ??= { areas: new Set(), archivos: new Set() });
                c.areas.add(area); c.archivos.add(rel);
            }
        }
    }
    for (const rel of ARCHIVOS_DATOS) {
        const f = path.join(src, rel);
        if (!fs.existsSync(f)) continue;
        archivos++;
        for (const t of extraerDatos(fs.readFileSync(f, "utf8"), f)) {
            const c = (claves[t] ??= { areas: new Set(), archivos: new Set() });
            c.areas.add(areaDe(rel)); c.archivos.add(rel);
        }
    }
    return { claves, archivos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
    const raiz = path.resolve(arg("--raiz", "."));
    const salida = path.resolve(raiz, arg("--salida", "src/lib/idiomas/catalogos/fuente.json"));
    const { claves, archivos } = extraerTodo(raiz);
    const orden = Object.keys(claves).sort();
    const porArea = {};
    for (const t of orden) for (const a of claves[t].areas) (porArea[a] ??= new Set()).add(t);
    const tabla = [...new Set(orden.flatMap((t) => [...claves[t].archivos]))].sort();
    const out = { version: 1, archivos, total: orden.length, porArea: Object.fromEntries(Object.entries(porArea).map(([a, s]) => [a, s.size]).sort()), archivosLista: tabla, claves: Object.fromEntries(orden.map((t) => [t, [...claves[t].archivos].map((a) => tabla.indexOf(a)).sort((x, y) => x - y)])) };
    fs.mkdirSync(path.dirname(salida), { recursive: true });
    fs.writeFileSync(salida, JSON.stringify(out));
    console.log(`archivos leídos: ${archivos} · textos únicos: ${orden.length} · patrones con valores: ${orden.filter((t) => /\{\d+\}/.test(t)).length}`);
    const filas = Object.entries(out.porArea).sort((a, b) => b[1] - a[1]);
    for (const [a, n] of filas) console.log(String(n).padStart(6), a);
}
