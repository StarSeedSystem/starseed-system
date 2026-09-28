/**
 * vcard — parser/exportador PURO de vCard 2.1 / 3.0 / 4.0 (sin React, sin Supabase).
 *
 * `parseVCard` es deliberadamente tolerante (nunca lanza; una tarjeta rara se
 * descarta en vez de tumbar la importación entera). `exportarVCard` genera 4.0
 * con plegado a 75 octetos y JAMÁS incluye las notas privadas (línea de tiempo):
 * solo `descripcion` sale como NOTE.
 */

import { nuevoId } from "@/lib/contactos/modelo";
import type { Contacto, ContactoEntrada, DatoEtiquetado, EnlaceContacto } from "@/lib/contactos/tipos";

// ─────────────────────────── Desdoblado + tokenizado ───────────────────────────

interface LineaVCard {
    nombre: string;
    params: Record<string, string[]>;
    valor: string;
}

function parseLinea(linea: string): LineaVCard | null {
    const idx = linea.indexOf(":");
    if (idx < 0) return null;
    const cabecera = linea.slice(0, idx);
    const valor = linea.slice(idx + 1);

    const partes = cabecera.split(";");
    let nombre = partes.shift() ?? "";
    // Prefijo de grupo estilo "item1.TEL" → nos quedamos con la propiedad.
    const punto = nombre.lastIndexOf(".");
    if (punto >= 0) nombre = nombre.slice(punto + 1);
    nombre = nombre.trim().toUpperCase();
    if (!nombre) return null;

    const params: Record<string, string[]> = {};
    for (const p of partes) {
        const eq = p.indexOf("=");
        if (eq < 0) {
            // vCard 2.1: parámetro-flag sin "=" (p.ej. "TEL;HOME;CELL:…").
            const flag = p.replace(/^"|"$/g, "").trim();
            if (!flag) continue;
            params.TYPE = [...(params.TYPE ?? []), flag];
            continue;
        }
        const clave = p.slice(0, eq).trim().toUpperCase();
        const valores = p
            .slice(eq + 1)
            .split(",")
            .map((v) => v.trim().replace(/^"|"$/g, ""))
            .filter(Boolean);
        if (!valores.length) continue;
        params[clave] = [...(params[clave] ?? []), ...valores];
    }
    return { nombre, params, valor };
}

function decodificarQuotedPrintable(valor: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < valor.length; i++) {
        const ch = valor[i];
        if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(valor.slice(i + 1, i + 3))) {
            bytes.push(parseInt(valor.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(ch.charCodeAt(0) & 0xff);
        }
    }
    try {
        return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    } catch {
        return valor;
    }
}

/** Deshace el escapado `\,` `\;` `\n` `\\` de un valor de vCard (3.0/4.0). */
function desescaparValor(valor: string): string {
    let out = "";
    for (let i = 0; i < valor.length; i++) {
        if (valor[i] === "\\" && i + 1 < valor.length) {
            const sig = valor[i + 1];
            if (sig === "n" || sig === "N") {
                out += "\n";
                i++;
                continue;
            }
            if (sig === "," || sig === ";" || sig === "\\") {
                out += sig;
                i++;
                continue;
            }
        }
        out += valor[i];
    }
    return out;
}

/** Valor bruto tras deshacer QUOTED-PRINTABLE (si el parámetro lo pide), antes de desescapar `\,`/`\;`. */
function valorCrudoQP(linea: LineaVCard): string {
    const encoding = (linea.params.ENCODING?.[0] ?? "").toUpperCase();
    return encoding === "QUOTED-PRINTABLE" ? decodificarQuotedPrintable(linea.valor) : linea.valor;
}

/** Valor final de una propiedad simple: QP (si aplica) + desescapado. */
function valorDe(linea: LineaVCard): string {
    return desescaparValor(valorCrudoQP(linea));
}

/** Divide un valor estructurado (N, ADR) por `;` NO escapados, respetando `\;`. */
function splitCampos(valor: string): string[] {
    const partes: string[] = [];
    let actual = "";
    for (let i = 0; i < valor.length; i++) {
        if (valor[i] === "\\" && i + 1 < valor.length) {
            actual += valor[i] + valor[i + 1];
            i++;
            continue;
        }
        if (valor[i] === ";") {
            partes.push(actual);
            actual = "";
            continue;
        }
        actual += valor[i];
    }
    partes.push(actual);
    return partes;
}

function camposDe(linea: LineaVCard): string[] {
    return splitCampos(valorCrudoQP(linea)).map(desescaparValor);
}

function etiquetaDeTipo(tipos: string[]): string {
    const bajos = tipos.map((t) => t.toLowerCase());
    if (bajos.includes("cell") || bajos.includes("mobile")) return "móvil";
    if (bajos.includes("home")) return "casa";
    if (bajos.includes("work")) return "trabajo";
    return bajos[0] || "otro";
}

function normalizarBday(valorCrudo: string): string | undefined {
    const v = valorCrudo.trim();
    if (!v) return undefined;
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    m = /^--(\d{2})(\d{2})$/.exec(v);
    if (m) return `--${m[1]}-${m[2]}`;
    if (/^--\d{2}-\d{2}$/.test(v)) return v;
    return v;
}

// ─────────────────────────── Parser ───────────────────────────

/**
 * Interpreta texto vCard (2.1/3.0/4.0, una o varias tarjetas) y devuelve las
 * entradas listas para `crearContacto`. Nunca lanza: una tarjeta sin nombre
 * resoluble (ni FN ni N) se descarta en silencio.
 */
export function parseVCard(texto: string): ContactoEntrada[] {
    if (!texto) return [];
    const normalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const crudas = normalizado.split("\n");

    // 1) Desdoblado QUOTED-PRINTABLE (2.1): una línea que declara ENCODING=QP y
    //    termina en "=" continúa en la siguiente SIN espacio inicial — no es el
    //    plegado estándar del formato, es propio de QP.
    const trasQp: string[] = [];
    for (const linea of crudas) {
        const anterior = trasQp[trasQp.length - 1];
        if (anterior !== undefined && /ENCODING=QUOTED-PRINTABLE/i.test(anterior) && anterior.endsWith("=")) {
            trasQp[trasQp.length - 1] = anterior.slice(0, -1) + linea;
        } else {
            trasQp.push(linea);
        }
    }

    // 2) Desdoblado estándar (RFC 6350 §3.2): línea que empieza por espacio/tab
    //    es continuación de la anterior (se le quita ESE único carácter).
    const lineas: string[] = [];
    for (const linea of trasQp) {
        if (lineas.length && (linea.startsWith(" ") || linea.startsWith("\t"))) {
            lineas[lineas.length - 1] += linea.slice(1);
        } else if (linea.trim().length) {
            lineas.push(linea);
        }
    }

    // 3) Separa en tarjetas.
    const tarjetas: string[][] = [];
    let actual: string[] | null = null;
    for (const linea of lineas) {
        const t = linea.trim();
        if (/^BEGIN:VCARD$/i.test(t)) actual = [];
        else if (/^END:VCARD$/i.test(t)) {
            if (actual) tarjetas.push(actual);
            actual = null;
        } else if (actual) actual.push(linea);
    }

    const salida: ContactoEntrada[] = [];
    for (const tarjeta of tarjetas) {
        const entrada = parseTarjeta(tarjeta);
        if (entrada) salida.push(entrada);
    }
    return salida;
}

function parseTarjeta(lineasCrudas: string[]): ContactoEntrada | null {
    const props = lineasCrudas.map(parseLinea).filter((l): l is LineaVCard => l !== null);
    if (!props.length) return null;

    let fn = "";
    let nApellido = "";
    let nNombre = "";
    let apodo: string | undefined;
    let organizacion: string | undefined;
    let cargo: string | undefined;
    let direccion: string | undefined;
    let cumpleanos: string | undefined;
    let descripcion: string | undefined;
    let username: string | undefined;
    let userId: string | undefined;
    const telefonos: DatoEtiquetado[] = [];
    const correos: DatoEtiquetado[] = [];
    const enlaces: EnlaceContacto[] = [];

    for (const linea of props) {
        switch (linea.nombre) {
            case "FN":
                fn = valorDe(linea).trim();
                break;
            case "N": {
                const campos = camposDe(linea);
                nApellido = (campos[0] ?? "").trim();
                nNombre = (campos[1] ?? "").trim();
                break;
            }
            case "NICKNAME":
                apodo = valorDe(linea).trim() || undefined;
                break;
            case "TEL": {
                const valor = valorDe(linea).trim();
                if (valor) telefonos.push({ id: nuevoId(), etiqueta: etiquetaDeTipo(linea.params.TYPE ?? []), valor });
                break;
            }
            case "EMAIL": {
                const valor = valorDe(linea).trim();
                if (valor) correos.push({ id: nuevoId(), etiqueta: etiquetaDeTipo(linea.params.TYPE ?? []), valor });
                break;
            }
            case "URL": {
                const valor = valorDe(linea).trim();
                if (valor) enlaces.push({ id: nuevoId(), titulo: "Enlace", url: valor });
                break;
            }
            case "ORG":
                organizacion = camposDe(linea).filter(Boolean).join(" · ") || undefined;
                break;
            case "TITLE":
                cargo = valorDe(linea).trim() || undefined;
                break;
            case "ADR": {
                const partes = camposDe(linea)
                    .map((p) => p.trim())
                    .filter(Boolean);
                direccion = partes.length ? partes.join(", ") : undefined;
                break;
            }
            case "BDAY":
                cumpleanos = normalizarBday(valorDe(linea));
                break;
            case "NOTE":
                descripcion = valorDe(linea).trim() || undefined;
                break;
            case "X-STARSEED-USERNAME":
                username = valorDe(linea).trim() || undefined;
                break;
            case "X-STARSEED-ID":
                userId = valorDe(linea).trim() || undefined;
                break;
            default:
                break;
        }
    }

    const nombreDeN = [nNombre, nApellido].filter(Boolean).join(" ").trim();
    const nombre = (fn || nombreDeN || apodo || "").trim();
    if (!nombre) return null;

    const entrada: ContactoEntrada = { nombre, origen: "vcard" };
    if (apodo) entrada.apodo = apodo;
    if (organizacion) entrada.organizacion = organizacion;
    if (cargo) entrada.cargo = cargo;
    if (direccion) entrada.direccion = direccion;
    if (cumpleanos) entrada.cumpleanos = cumpleanos;
    if (descripcion) entrada.descripcion = descripcion;
    if (username) entrada.username = username;
    if (userId) entrada.userId = userId;
    if (telefonos.length) entrada.telefonos = telefonos;
    if (correos.length) entrada.correos = correos;
    if (enlaces.length) entrada.enlaces = enlaces;
    return entrada;
}

// ─────────────────────────── Exportador (4.0) ───────────────────────────

function escaparValor(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Pliega una línea a 75 octetos UTF-8 (RFC 6350 §3.2), sin cortar un carácter multibyte. */
function plegarLinea(linea: string): string {
    const bytes = new TextEncoder().encode(linea);
    if (bytes.length <= 75) return linea;
    const partes: string[] = [];
    let i = 0;
    let limite = 75;
    while (i < bytes.length) {
        let fin = Math.min(i + limite, bytes.length);
        while (fin < bytes.length && (bytes[fin] & 0xc0) === 0x80) fin--;
        if (fin <= i) fin = i + 1; // salvaguarda: nunca queda atascado
        partes.push(new TextDecoder("utf-8").decode(bytes.slice(i, fin)));
        i = fin;
        limite = 74; // la continuación añade 1 espacio de plegado, que cuenta como octeto
    }
    return partes.join("\r\n ");
}

function lineaProp(nombre: string, valor: string, params?: string): string {
    const cabecera = params ? `${nombre};${params}` : nombre;
    return plegarLinea(`${cabecera}:${valor}`);
}

function tipoVCardDeEtiqueta(etiqueta: string): string {
    const e = etiqueta.toLowerCase();
    if (e === "móvil" || e === "movil") return "cell";
    if (e === "casa") return "home";
    if (e === "trabajo") return "work";
    return "other";
}

/**
 * Exporta contactos como vCard 4.0. NUNCA incluye las notas privadas (línea de
 * tiempo): solo `descripcion` sale como NOTE.
 */
export function exportarVCard(contactos: Contacto[]): string {
    const bloques = contactos.map((c) => {
        const lineas: string[] = ["BEGIN:VCARD", "VERSION:4.0"];
        lineas.push(lineaProp("FN", escaparValor(c.nombre)));
        // No guardamos apellido por separado: el nombre completo va en el componente "nombre de pila".
        lineas.push(lineaProp("N", `;${escaparValor(c.nombre)};;;`));
        if (c.apodo) lineas.push(lineaProp("NICKNAME", escaparValor(c.apodo)));
        for (const t of c.telefonos) {
            lineas.push(lineaProp("TEL", escaparValor(t.valor), `TYPE=${tipoVCardDeEtiqueta(t.etiqueta)}`));
        }
        for (const e of c.correos) {
            lineas.push(lineaProp("EMAIL", escaparValor(e.valor), `TYPE=${tipoVCardDeEtiqueta(e.etiqueta)}`));
        }
        for (const l of c.enlaces) lineas.push(lineaProp("URL", escaparValor(l.url)));
        if (c.organizacion) lineas.push(lineaProp("ORG", escaparValor(c.organizacion)));
        if (c.cargo) lineas.push(lineaProp("TITLE", escaparValor(c.cargo)));
        if (c.direccion) lineas.push(lineaProp("ADR", `;;${escaparValor(c.direccion)};;;;`));
        if (c.cumpleanos) lineas.push(lineaProp("BDAY", c.cumpleanos));
        if (c.descripcion) lineas.push(lineaProp("NOTE", escaparValor(c.descripcion)));
        if (c.username) lineas.push(lineaProp("X-STARSEED-USERNAME", escaparValor(c.username)));
        if (c.userId) lineas.push(lineaProp("X-STARSEED-ID", escaparValor(c.userId)));
        lineas.push("END:VCARD");
        return lineas.join("\r\n");
    });
    return bloques.length ? bloques.join("\r\n") + "\r\n" : "";
}
