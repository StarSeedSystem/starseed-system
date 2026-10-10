/**
 * GENESIS · OPERACIONES TIPADAS (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Genesis (cada persona) y PoliGenesis (grupos y páginas) cambian la CUENTA, no
 * el código del OS. Un agente (modelos gratuitos del OS) solo puede PROPONER
 * operaciones de este vocabulario cerrado; este módulo las valida con
 * desconfianza, las cuenta en palabras para la vista previa y define el registro
 * que permite deshacerlas. Aplicarlas es cosa de `aplicar.ts`.
 *
 * Reglas que este archivo hace cumplir:
 *   · Vocabulario cerrado: un `tipo` desconocido se rechaza; un campo que no está
 *     declarado se descarta. Nada de código: cualquier texto que «huela» a código
 *     (`pareceCodigo` del núcleo) invalida la operación.
 *   · Invariantes del núcleo (`src/lib/nucleo/invariantes.ts`): quitar del dock
 *     Ajustes, la Biblioteca, el Hub, el Perfil… se rechaza con su reparación.
 *   · Ámbito: PoliGenesis solo admite lo que es de la entidad y el destino lo
 *     fija el ámbito, nunca el agente.
 *
 * Módulo PURO: sin React, sin red, sin `node:*`. Nunca lanza.
 * Contrato: architecture/genesis-niveles-malla-universal-estaciones.md §A.2.
 * SOP: architecture/genesis-personas-poligenesis.md
 */

import { validarContraInvariantes, type Violacion } from "@/lib/nucleo/invariantes";
import { pareceCodigo } from "@/lib/nucleo/ui-spec";
import { validarAccionUi, type TipoAccionUi } from "@/lib/astraura/ui-acciones";

/* ── Vocabulario ─────────────────────────────────────────────────────────── */

export type TipoOperacion =
    | "perfil.editar"
    | "pagina.crear"
    | "pagina.editar"
    | "apariencia.aplicar"
    | "dock.añadir"
    | "dock.quitar"
    | "dashboard.widget.añadir"
    | "dashboard.widget.quitar"
    | "agente.crear";

export const TIPOS_OPERACION: readonly TipoOperacion[] = [
    "perfil.editar",
    "pagina.crear",
    "pagina.editar",
    "apariencia.aplicar",
    "dock.añadir",
    "dock.quitar",
    "dashboard.widget.añadir",
    "dashboard.widget.quitar",
    "agente.crear",
];

/** Lo que cada nivel puede tocar. PoliGenesis: solo lo de la entidad. */
export const OPERACIONES_POR_AMBITO: Record<"persona" | "entidad", readonly TipoOperacion[]> = {
    persona: TIPOS_OPERACION,
    entidad: ["pagina.editar", "agente.crear"],
};

export type TipoEntidad = "pagina" | "grupo";

export interface EntidadAmbito {
    tipo: TipoEntidad;
    /** uuid de la fila (os_pages / os_groups). */
    id: string;
    slug: string;
    nombre: string;
}

export type Ambito = { tipo: "persona" } | { tipo: "entidad"; entidad: EntidadAmbito };

export type FajaApariencia = Exclude<TipoAccionUi, "restaurar">;
export const FAJAS_APARIENCIA: readonly FajaApariencia[] = ["apariencia", "fondo", "tipografia", "distribucion", "preset", "movimiento"];

export type ColorDock = "neutral" | "cyan" | "crimson" | "amber" | "emerald" | "purple";
export const COLORES_DOCK: readonly ColorDock[] = ["neutral", "cyan", "crimson", "amber", "emerald", "purple"];

export interface CambiosPerfil {
    nombre?: string;
    bio?: string;
    avatar?: string;
    portada?: string;
}

export interface CambiosPagina {
    nombre?: string;
    descripcion?: string;
    etiquetas?: string[];
    acento?: string;
    avatar?: string;
    portada?: string;
}

export interface DatosPaginaNueva {
    nombre: string;
    descripcion?: string;
    etiquetas?: string[];
    acento?: string;
}

export interface ElementoDock {
    /** Id de un botón que ya existe (activarlo). Sin id → botón nuevo propio. */
    id?: string;
    etiqueta?: string;
    ruta?: string;
    icono?: string;
    color?: ColorDock;
}

export interface DatosAgente {
    nombre: string;
    descripcion?: string;
    persona?: string;
    icono?: string;
    visibilidad?: "private" | "public";
}

interface Base {
    /** Por qué, en una frase (se enseña en la vista previa). */
    motivo: string;
}

export type Operacion =
    | (Base & { tipo: "perfil.editar"; faceta?: string; cambios: CambiosPerfil })
    | (Base & { tipo: "pagina.crear"; datos: DatosPaginaNueva })
    | (Base & { tipo: "pagina.editar"; destino: { tipo: TipoEntidad; slug: string }; cambios: CambiosPagina })
    | (Base & { tipo: "apariencia.aplicar"; faja: FajaApariencia; parche: Record<string, unknown> })
    | (Base & { tipo: "dock.añadir"; elemento: ElementoDock })
    | (Base & { tipo: "dock.quitar"; id: string })
    | (Base & { tipo: "dashboard.widget.añadir"; tablero?: string; widget: string; talla?: "S" | "M" | "L" })
    | (Base & { tipo: "dashboard.widget.quitar"; tablero?: string; widget: string })
    | (Base & { tipo: "agente.crear"; agente: DatosAgente });

/** Lo que la validación sabe del entorno (lo pasa quien llama; todo opcional). */
export interface ContextoValidacion {
    ambito: Ambito;
    /** Botones del dock de esta persona (para quitar/activar con conocimiento). */
    dock?: { id: string; ruta: string; etiqueta: string; activo: boolean }[];
    /** Páginas propias (slug) para `pagina.editar` en el ámbito persona. */
    paginasPropias?: string[];
}

export type ResultadoValidacion =
    | { ok: true; op: Operacion; avisos: string[] }
    | { ok: false; problemas: string[]; violaciones: Violacion[] };

/* ── Límites ─────────────────────────────────────────────────────────────── */

export const LIMITES = {
    motivo: 240,
    nombre: 80,
    bio: 600,
    descripcion: 1000,
    persona: 2000,
    url: 500,
    etiqueta: 32,
    etiquetas: 12,
    loteMaximo: 8,
} as const;

const PATRON_ID = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const PATRON_SLUG = /^[a-z0-9][a-z0-9_.-]{0,119}$/i;
const PATRON_RUTA = /^\/[a-z0-9\-_/.?=&%]*$/i;
const PATRON_HEX = /^#[0-9a-f]{6}$/i;
const PATRON_WIDGET = /^[A-Z][A-Z0-9_]{1,59}$/;
const PATRON_ICONO = /^[A-Z][A-Za-z0-9]{1,39}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Botones del dock que llevan a superficies del núcleo (id del preset → ruta). Sirve para
 * proteger el núcleo aunque quien valide no tenga a mano el dock de la persona.
 */
export const DOCK_NUCLEO: Readonly<Record<string, { ruta: string; nombre: string }>> = {
    settings: { ruta: "/settings", nombre: "Ajustes" },
    profile: { ruta: "/profile", nombre: "Perfil" },
    mylib: { ruta: "/library", nombre: "Biblioteca" },
    hub: { ruta: "/hub", nombre: "Hub" },
    decisiones: { ruta: "/decisiones", nombre: "Decisiones" },
    seguridad: { ruta: "/seguridad", nombre: "Seguridad" },
};

/** Widgets que llevan código o HTML propio: Genesis nunca los crea. */
export const WIDGETS_VETADOS = new Set(["AI_GENERATED", "CUSTOM_HTML", "IFRAME", "EMBED_HTML"]);

/* ── Utilidades ──────────────────────────────────────────────────────────── */

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Texto limpio o `null` si no es texto, es demasiado largo o parece código. */
function texto(v: unknown, max: number, campo: string, problemas: string[], vacioPermitido = false): string | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") {
        problemas.push(`«${campo}» debe ser texto.`);
        return undefined;
    }
    const limpio = v.replace(CONTROL, "").trim();
    if (!limpio && !vacioPermitido) {
        problemas.push(`«${campo}» está vacío.`);
        return undefined;
    }
    if (limpio.length > max) {
        problemas.push(`«${campo}» supera ${max} caracteres.`);
        return undefined;
    }
    if (pareceCodigo(limpio)) {
        problemas.push(`«${campo}» contiene algo que parece código; Genesis solo acepta contenido.`);
        return undefined;
    }
    return limpio;
}

/** Enlace a una imagen: https:// o ruta interna del OS. Vacío = quitarla. */
function enlace(v: unknown, campo: string, problemas: string[]): string | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") {
        problemas.push(`«${campo}» debe ser un enlace.`);
        return undefined;
    }
    const limpio = v.trim();
    if (limpio === "") return "";
    if (limpio.length > LIMITES.url) {
        problemas.push(`«${campo}» es demasiado largo.`);
        return undefined;
    }
    if (pareceCodigo(limpio) || /^(data|blob|file|javascript|vbscript):/i.test(limpio)) {
        problemas.push(`«${campo}» no es un enlace admitido.`);
        return undefined;
    }
    if (/^https:\/\/[^\s"'<>]+$/i.test(limpio) || /^\/[^\s"'<>]*$/.test(limpio)) return limpio;
    problemas.push(`«${campo}» debe empezar por https:// o ser una ruta del OS.`);
    return undefined;
}

function etiquetas(v: unknown, problemas: string[]): string[] | undefined {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v)) {
        problemas.push("«etiquetas» debe ser una lista.");
        return undefined;
    }
    const salida: string[] = [];
    for (const e of v.slice(0, LIMITES.etiquetas)) {
        const t = texto(e, LIMITES.etiqueta, "etiqueta", problemas);
        if (t && !salida.includes(t.toLowerCase())) salida.push(t.toLowerCase());
    }
    return salida;
}

function color(v: unknown, problemas: string[]): string | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && PATRON_HEX.test(v.trim())) return v.trim().toLowerCase();
    problemas.push("«acento» debe ser un color como #a855f7.");
    return undefined;
}

function sinIndefinidos<T extends object>(o: T): Partial<T> {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined) salida[k] = v;
    return salida as Partial<T>;
}

/** ¿Algún texto del árbol parece código? (para parches de apariencia). */
function arbolConCodigo(v: unknown, profundidad = 0): boolean {
    if (profundidad > 8) return true;
    if (typeof v === "string") return pareceCodigo(v) || /^(javascript|vbscript):/i.test(v.trim()) || /url\(\s*['"]?\s*javascript:/i.test(v);
    if (Array.isArray(v)) return v.some((x) => arbolConCodigo(x, profundidad + 1));
    if (esObjeto(v)) return Object.values(v).some((x) => arbolConCodigo(x, profundidad + 1));
    return false;
}

function tocaFondo(parche: Record<string, unknown>): boolean {
    return esObjeto(parche.background);
}

/* ── Validación ──────────────────────────────────────────────────────────── */

/**
 * Valida con desconfianza una operación propuesta (por el agente o a mano) y
 * devuelve una copia saneada, o los problemas. Nunca lanza.
 */
export function validarOperacion(bruto: unknown, ctx: ContextoValidacion): ResultadoValidacion {
    const problemas: string[] = [];
    const avisos: string[] = [];
    const fallo = (violaciones: Violacion[] = []): ResultadoValidacion => ({ ok: false, problemas, violaciones });
    try {
        if (!esObjeto(bruto)) {
            problemas.push("La operación no es un objeto.");
            return fallo();
        }
        const tipo = bruto.tipo;
        if (typeof tipo !== "string" || !(TIPOS_OPERACION as readonly string[]).includes(tipo)) {
            problemas.push(`Tipo de operación desconocido: «${String(tipo).slice(0, 40)}».`);
            return fallo();
        }
        const ambitoTipo = ctx.ambito.tipo;
        if (!OPERACIONES_POR_AMBITO[ambitoTipo].includes(tipo as TipoOperacion)) {
            problemas.push(
                ambitoTipo === "entidad"
                    ? `En PoliGenesis «${tipo}» no está disponible: aquí solo se cambia lo de la entidad.`
                    : `«${tipo}» no está disponible aquí.`,
            );
            return fallo();
        }
        const motivo = texto(bruto.motivo ?? "Lo pediste tú.", LIMITES.motivo, "motivo", problemas) ?? "";
        if (problemas.length) return fallo();

        switch (tipo as TipoOperacion) {
            case "perfil.editar": {
                const c = esObjeto(bruto.cambios) ? bruto.cambios : {};
                const cambios = sinIndefinidos<CambiosPerfil>({
                    nombre: texto(c.nombre, LIMITES.nombre, "nombre", problemas),
                    bio: texto(c.bio, LIMITES.bio, "bio", problemas, true),
                    avatar: enlace(c.avatar, "avatar", problemas),
                    portada: enlace(c.portada, "portada", problemas),
                });
                if (esObjeto(bruto.cambios) && ("handle" in c || "@" in c || "usuario" in c)) {
                    avisos.push("El @ no se cambia desde Genesis: se cambia en Ajustes › Cuenta, porque renombra también tus correos.");
                }
                const faceta = bruto.faceta === undefined || bruto.faceta === null || bruto.faceta === "principal" ? undefined : bruto.faceta;
                if (faceta !== undefined && (typeof faceta !== "string" || !PATRON_ID.test(faceta) && !/^[0-9a-f-]{36}$/i.test(faceta))) {
                    problemas.push("«faceta» no es un identificador de perfil válido.");
                }
                if (problemas.length) return fallo();
                if (Object.keys(cambios).length === 0) {
                    problemas.push("No hay ningún cambio de perfil que aplicar.");
                    return fallo();
                }
                return { ok: true, avisos, op: { tipo: "perfil.editar", motivo, cambios, ...(faceta ? { faceta: faceta as string } : {}) } };
            }

            case "pagina.crear": {
                const d = esObjeto(bruto.datos) ? bruto.datos : {};
                const nombre = texto(d.nombre, LIMITES.nombre, "nombre", problemas);
                const datos = sinIndefinidos<Partial<DatosPaginaNueva>>({
                    nombre,
                    descripcion: texto(d.descripcion, LIMITES.descripcion, "descripcion", problemas, true),
                    etiquetas: etiquetas(d.etiquetas, problemas),
                    acento: color(d.acento, problemas),
                });
                if (!nombre && !problemas.length) problemas.push("La página nueva necesita un nombre.");
                if (problemas.length) return fallo();
                return { ok: true, avisos, op: { tipo: "pagina.crear", motivo, datos: datos as DatosPaginaNueva } };
            }

            case "pagina.editar": {
                const c = esObjeto(bruto.cambios) ? bruto.cambios : {};
                const cambios = sinIndefinidos<CambiosPagina>({
                    nombre: texto(c.nombre, LIMITES.nombre, "nombre", problemas),
                    descripcion: texto(c.descripcion, LIMITES.descripcion, "descripcion", problemas, true),
                    etiquetas: etiquetas(c.etiquetas, problemas),
                    acento: color(c.acento, problemas),
                    avatar: enlace(c.avatar, "avatar", problemas),
                    portada: enlace(c.portada, "portada", problemas),
                });
                let destino: { tipo: TipoEntidad; slug: string } | null = null;
                if (ctx.ambito.tipo === "entidad") {
                    // En PoliGenesis el destino lo fija el ámbito, nunca el agente.
                    destino = { tipo: ctx.ambito.entidad.tipo, slug: ctx.ambito.entidad.slug };
                } else {
                    const d = esObjeto(bruto.destino) ? bruto.destino : {};
                    const slug = typeof d.slug === "string" ? d.slug.trim().toLowerCase() : "";
                    const tipoD = d.tipo === "grupo" ? "grupo" : "pagina";
                    if (!PATRON_SLUG.test(slug)) problemas.push("Falta la página a editar (su slug).");
                    else if (tipoD === "grupo") problemas.push("Los grupos se editan desde PoliGenesis, con el rol que tengas en ellos.");
                    else if (ctx.paginasPropias && !ctx.paginasPropias.includes(slug)) problemas.push(`«${slug}» no es una de tus páginas.`);
                    else destino = { tipo: "pagina", slug };
                }
                if (problemas.length || !destino) return fallo();
                if (Object.keys(cambios).length === 0) {
                    problemas.push("No hay ningún cambio de página que aplicar.");
                    return fallo();
                }
                return { ok: true, avisos, op: { tipo: "pagina.editar", motivo, destino, cambios } };
            }

            case "apariencia.aplicar": {
                const faja = bruto.faja;
                if (typeof faja !== "string" || !(FAJAS_APARIENCIA as readonly string[]).includes(faja)) {
                    problemas.push("«faja» debe ser apariencia, fondo, tipografia, distribucion, preset o movimiento.");
                    return fallo();
                }
                if (!esObjeto(bruto.parche) || arbolConCodigo(bruto.parche)) {
                    problemas.push("El parche de apariencia no es válido o contiene algo que parece código.");
                    return fallo();
                }
                const accion = validarAccionUi({ tipo: faja, ambito: "cuenta", parche: bruto.parche, motivo, actor: "agente:genesis" });
                const parche = (accion?.parche ?? {}) as Record<string, unknown>;
                if (!accion || Object.keys(parche).length === 0) {
                    problemas.push(`Nada del parche cae dentro de lo que la faja «${faja}» puede cambiar.`);
                    return fallo();
                }
                if (tocaFondo(parche)) avisos.push("Toca el fondo: se escribe en el ámbito que tengas activo en Apariencia.");
                return { ok: true, avisos, op: { tipo: "apariencia.aplicar", motivo, faja: faja as FajaApariencia, parche } };
            }

            case "dock.añadir": {
                const e = esObjeto(bruto.elemento) ? bruto.elemento : {};
                const id = typeof e.id === "string" && e.id.trim() ? e.id.trim() : undefined;
                if (id !== undefined && !PATRON_ID.test(id)) {
                    problemas.push("«id» del botón no es válido.");
                    return fallo();
                }
                if (id && ctx.dock) {
                    const actual = ctx.dock.find((b) => b.id === id);
                    if (!actual) {
                        problemas.push(`No existe ningún botón «${id}» en tu dock.`);
                        return fallo();
                    }
                    if (actual.activo) {
                        problemas.push(`«${actual.etiqueta}» ya está en tu dock.`);
                        return fallo();
                    }
                    return { ok: true, avisos, op: { tipo: "dock.añadir", motivo, elemento: { id } } };
                }
                if (id) return { ok: true, avisos, op: { tipo: "dock.añadir", motivo, elemento: { id } } };
                const etiqueta = texto(e.etiqueta, 40, "etiqueta", problemas);
                const ruta = typeof e.ruta === "string" ? e.ruta.trim() : "";
                if (!PATRON_RUTA.test(ruta) || ruta.startsWith("//") || /^\/api(\/|$)/i.test(ruta) || ruta.includes("..")) {
                    problemas.push("La ruta del botón debe ser una página del OS (empieza por /).");
                }
                const icono = typeof e.icono === "string" && PATRON_ICONO.test(e.icono) ? e.icono : undefined;
                const colorDock = typeof e.color === "string" && (COLORES_DOCK as readonly string[]).includes(e.color) ? (e.color as ColorDock) : undefined;
                if (!etiqueta && !problemas.length) problemas.push("El botón nuevo necesita una etiqueta.");
                if (problemas.length || !etiqueta) return fallo();
                if (ctx.dock?.some((b) => b.ruta === ruta && b.activo)) {
                    problemas.push(`Ya tienes un botón que abre ${ruta}.`);
                    return fallo();
                }
                return {
                    ok: true,
                    avisos,
                    op: { tipo: "dock.añadir", motivo, elemento: sinIndefinidos<ElementoDock>({ etiqueta, ruta, icono, color: colorDock }) as ElementoDock },
                };
            }

            case "dock.quitar": {
                const id = typeof bruto.id === "string" ? bruto.id.trim() : "";
                if (!PATRON_ID.test(id)) {
                    problemas.push("Falta el botón del dock a quitar (su id).");
                    return fallo();
                }
                const actual = ctx.dock?.find((b) => b.id === id);
                if (ctx.dock && !actual) {
                    problemas.push(`No existe ningún botón «${id}» en tu dock.`);
                    return fallo();
                }
                if (actual && !actual.activo) {
                    problemas.push(`«${actual.etiqueta}» ya no está en tu dock.`);
                    return fallo();
                }
                // Quitar del dock esconde esa ruta de la navegación principal: Ajustes, Perfil,
                // Biblioteca, Hub, Decisiones… son del núcleo y no se quitan.
                const ruta = actual?.ruta ?? DOCK_NUCLEO[id]?.ruta;
                const violaciones = ruta ? validarContraInvariantes({ rutasOcultas: [ruta] }) : [];
                if (violaciones.length) {
                    const nombre = actual?.etiqueta ?? DOCK_NUCLEO[id]?.nombre ?? id;
                    problemas.push(...violaciones.map((v) => `«${nombre}» no se quita del dock (es del núcleo del OS): ${v.que} Puedes moverlo o plegarlo en una carpeta.`));
                    return fallo(violaciones);
                }
                return { ok: true, avisos, op: { tipo: "dock.quitar", motivo, id } };
            }

            case "dashboard.widget.añadir":
            case "dashboard.widget.quitar": {
                const widget = typeof bruto.widget === "string" ? bruto.widget.trim().toUpperCase() : "";
                if (!PATRON_WIDGET.test(widget)) {
                    problemas.push("Falta el tipo de widget (por ejemplo AGORA_CAUSAL).");
                    return fallo();
                }
                if (WIDGETS_VETADOS.has(widget)) {
                    problemas.push("Ese widget lleva código propio; Genesis no lo crea (usa la Forja de widgets).");
                    return fallo();
                }
                const tablero = typeof bruto.tablero === "string" && bruto.tablero.trim() ? bruto.tablero.trim().slice(0, 120) : undefined;
                if (tablero !== undefined && pareceCodigo(tablero)) {
                    problemas.push("«tablero» no es válido.");
                    return fallo();
                }
                if (tipo === "dashboard.widget.quitar") {
                    return { ok: true, avisos, op: { tipo: "dashboard.widget.quitar", motivo, widget, ...(tablero ? { tablero } : {}) } };
                }
                const talla = bruto.talla === "S" || bruto.talla === "M" || bruto.talla === "L" ? bruto.talla : undefined;
                return { ok: true, avisos, op: { tipo: "dashboard.widget.añadir", motivo, widget, ...(tablero ? { tablero } : {}), ...(talla ? { talla } : {}) } };
            }

            case "agente.crear": {
                const a = esObjeto(bruto.agente) ? bruto.agente : {};
                const nombre = texto(a.nombre, LIMITES.nombre, "nombre", problemas);
                const agente = sinIndefinidos<Partial<DatosAgente>>({
                    nombre,
                    descripcion: texto(a.descripcion, LIMITES.descripcion, "descripcion", problemas, true),
                    persona: texto(a.persona, LIMITES.persona, "persona", problemas, true),
                    icono: typeof a.icono === "string" && PATRON_ICONO.test(a.icono) ? a.icono : undefined,
                    visibilidad: a.visibilidad === "public" ? "public" : "private",
                });
                if (!nombre && !problemas.length) problemas.push("El agente necesita un nombre.");
                if (problemas.length) return fallo();
                return { ok: true, avisos, op: { tipo: "agente.crear", motivo, agente: agente as DatosAgente } };
            }
        }
        problemas.push("Operación no reconocida.");
        return fallo();
    } catch {
        problemas.push("No se pudo validar la operación.");
        return fallo();
    }
}

/** Valida un lote (lo que propone el agente de una vez). Máximo `LIMITES.loteMaximo`. */
export function validarLote(
    lista: unknown,
    ctx: ContextoValidacion,
): { validas: { op: Operacion; avisos: string[] }[]; rechazadas: { indice: number; problemas: string[] }[] } {
    const validas: { op: Operacion; avisos: string[] }[] = [];
    const rechazadas: { indice: number; problemas: string[] }[] = [];
    if (!Array.isArray(lista)) return { validas, rechazadas: [{ indice: 0, problemas: ["No llegó una lista de operaciones."] }] };
    lista.forEach((bruto, indice) => {
        if (indice >= LIMITES.loteMaximo) {
            rechazadas.push({ indice, problemas: [`Como mucho ${LIMITES.loteMaximo} operaciones por propuesta.`] });
            return;
        }
        const r = validarOperacion(bruto, ctx);
        if (r.ok) validas.push({ op: r.op, avisos: r.avisos });
        else rechazadas.push({ indice, problemas: r.problemas });
    });
    return { validas, rechazadas };
}

/* ── Vista previa en palabras ────────────────────────────────────────────── */

const NOMBRE_CAMPO: Record<string, string> = {
    nombre: "nombre",
    bio: "biografía",
    avatar: "foto",
    portada: "portada",
    descripcion: "descripción",
    etiquetas: "etiquetas",
    acento: "color de acento",
};

const NOMBRE_FAJA: Record<FajaApariencia, string> = {
    apariencia: "el estilo visual",
    fondo: "el fondo",
    tipografia: "la tipografía",
    distribucion: "la distribución",
    preset: "el preset visual",
    movimiento: "el movimiento",
};

function valorCorto(v: unknown): string {
    if (Array.isArray(v)) return v.length ? v.join(", ") : "(ninguna)";
    if (v === "") return "(quitar)";
    const s = String(v);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function rutasDe(o: Record<string, unknown>, base = ""): string[] {
    const salida: string[] = [];
    for (const [k, v] of Object.entries(o)) {
        const ruta = base ? `${base}.${k}` : k;
        if (esObjeto(v)) salida.push(...rutasDe(v, ruta));
        else salida.push(`${ruta} → ${valorCorto(v)}`);
    }
    return salida;
}

export interface VistaPrevia {
    titulo: string;
    detalles: string[];
    /** Cómo se deshace, dicho en claro. */
    deshacer: string;
}

/** Cuenta una operación ya validada en palabras (vista previa antes de aplicar). */
export function describirOperacion(op: Operacion, ambito: Ambito): VistaPrevia {
    const de = ambito.tipo === "entidad" ? ` de «${ambito.entidad.nombre}»` : "";
    switch (op.tipo) {
        case "perfil.editar":
            return {
                titulo: op.faceta ? "Editar una faceta de tu perfil" : "Editar tu perfil",
                detalles: Object.entries(op.cambios).map(([k, v]) => `${NOMBRE_CAMPO[k] ?? k}: ${valorCorto(v)}`),
                deshacer: "Deshacer repone los valores anteriores si nadie los ha cambiado después.",
            };
        case "pagina.crear":
            return {
                titulo: `Crear la página «${op.datos.nombre}»`,
                detalles: Object.entries(op.datos)
                    .filter(([k]) => k !== "nombre")
                    .map(([k, v]) => `${NOMBRE_CAMPO[k] ?? k}: ${valorCorto(v)}`),
                deshacer: "Deshacer la borra solo si sigue vacía (sin publicaciones).",
            };
        case "pagina.editar":
            return {
                titulo: ambito.tipo === "entidad" ? `Editar${de}` : `Editar tu página «${op.destino.slug}»`,
                detalles: Object.entries(op.cambios).map(([k, v]) => `${NOMBRE_CAMPO[k] ?? k}: ${valorCorto(v)}`),
                deshacer: "Deshacer repone los valores anteriores si nadie los ha cambiado después.",
            };
        case "apariencia.aplicar":
            return {
                titulo: `Cambiar ${NOMBRE_FAJA[op.faja]}`,
                detalles: rutasDe(op.parche).slice(0, 8),
                deshacer: "Deshacer repone exactamente lo que había en esas opciones.",
            };
        case "dock.añadir":
            return {
                titulo: op.elemento.id ? `Poner «${op.elemento.id}» en tu dock` : `Añadir al dock «${op.elemento.etiqueta}»`,
                detalles: op.elemento.id ? [] : [`abre: ${op.elemento.ruta}`, ...(op.elemento.icono ? [`icono: ${op.elemento.icono}`] : [])],
                deshacer: "Deshacer lo vuelve a quitar.",
            };
        case "dock.quitar":
            return { titulo: `Quitar «${op.id}» del dock`, detalles: ["Sigue disponible en el lanzador de apps."], deshacer: "Deshacer lo vuelve a poner." };
        case "dashboard.widget.añadir":
            return {
                titulo: `Añadir el widget ${op.widget}`,
                detalles: [`tablero: ${op.tablero ?? "el principal"}`, ...(op.talla ? [`talla: ${op.talla}`] : [])],
                deshacer: "Deshacer quita ese widget.",
            };
        case "dashboard.widget.quitar":
            return { titulo: `Quitar el widget ${op.widget}`, detalles: [`tablero: ${op.tablero ?? "el principal"}`], deshacer: "Deshacer lo repone con su configuración." };
        case "agente.crear":
            return {
                titulo: `Crear el agente «${op.agente.nombre}»${de}`,
                detalles: [
                    ...(op.agente.descripcion ? [`descripción: ${valorCorto(op.agente.descripcion)}`] : []),
                    `visibilidad: ${op.agente.visibilidad === "public" ? "pública" : "privada"}`,
                    ...(ambito.tipo === "entidad" ? ["queda vinculado a la entidad"] : []),
                ],
                deshacer: "Deshacer lo borra de tu biblioteca.",
            };
    }
}

/* ── Rol y modo de gobierno (PoliGenesis) ────────────────────────────────── */

/** Mismo rango que `public.access_role_rank` de la base de datos. */
export function rangoDeRol(rol: string | null | undefined): number {
    switch ((rol ?? "").trim().toLowerCase()) {
        case "total":
        case "owner":
        case "dueño":
            return 4;
        case "gestor":
        case "admin":
            return 3;
        case "colaborador":
        case "editor":
            return 2;
        case "observador":
        case "viewer":
            return 1;
        default:
            return 0;
    }
}

export type ModoAplicacion = "aplicar" | "proponer" | "sin-permiso";

/**
 * ¿Qué hace «aplicar» en este ámbito? Persona: aplicar. Entidad jerárquica:
 * aplica quien gestiona (rango ≥ 3). Entidad democrática: cualquier
 * colaborador (rango ≥ 2) PROPONE y la entidad vota.
 */
export function decidirAplicacion(ambito: Ambito, rango: number, democratico: boolean): { modo: ModoAplicacion; motivo: string } {
    if (ambito.tipo === "persona") return { modo: "aplicar", motivo: "Es tu cuenta." };
    if (democratico) {
        return rango >= 2
            ? { modo: "proponer", motivo: "Esta entidad decide en democracia: cada cambio se convierte en una propuesta que se vota." }
            : { modo: "sin-permiso", motivo: "Para proponer cambios necesitas al menos rol de colaboración en esta entidad." };
    }
    return rango >= 3
        ? { modo: "aplicar", motivo: "Tienes rol de gestión en esta entidad." }
        : { modo: "sin-permiso", motivo: "En modo jerárquico solo aplican cambios quienes tienen rol de gestión (o la cuenta dueña)." };
}

/* ── Registro y deshacer ─────────────────────────────────────────────────── */

export type Inverso =
    | { tipo: "perfil.restaurar"; tabla: "os_profiles" | "profiles" | "os_account_profiles"; clave: string; antes: Record<string, string | null>; despues: Record<string, string | null> }
    | { tipo: "pagina.borrar"; slug: string }
    | { tipo: "entidad.restaurar"; entidad: TipoEntidad; slug: string; antes: Record<string, unknown>; despues: Record<string, unknown> }
    | { tipo: "apariencia.restaurar"; parche: Record<string, unknown> }
    | { tipo: "dock.restaurar"; id: string; existia: boolean; estabaActivo: boolean }
    | { tipo: "widget.quitar"; tablero: string; widgetId: string }
    | { tipo: "widget.reponer"; tablero: string; widget: Record<string, unknown> }
    | { tipo: "agente.borrar"; agenteId: string; vinculo?: { tipo: "page" | "group"; id: string } };

export type EstadoEntrada = "aplicada" | "deshecha" | "propuesta" | "fallida";

export interface EntradaGenesis {
    id: string;
    /** ms desde época. */
    at: number;
    ambito: Ambito;
    operacion: Operacion;
    /** Título de la vista previa, tal y como se enseñó. */
    titulo: string;
    estado: EstadoEntrada;
    inverso: Inverso | null;
    /** Qué pasó, en palabras (resultado de aplicar o motivo del fallo). */
    resultado: string;
    propuestaId?: string;
    deshechaEn?: number;
}

/** ¿Se puede deshacer esta entrada? */
export function puedeDeshacer(e: EntradaGenesis): boolean {
    return e.estado === "aplicada" && e.inverso !== null;
}

/** Entradas más nuevas primero, recortadas. */
export function ordenarRegistro(lista: EntradaGenesis[], max = 100): EntradaGenesis[] {
    return [...lista].sort((a, b) => b.at - a.at).slice(0, max);
}

/**
 * Campos que cambiaron después de aplicar (comparando lo que hay ahora con lo
 * que dejó la operación). Si hay alguno, deshacer pisaría un cambio nuevo.
 */
export function camposEnConflicto(actual: Record<string, unknown>, despues: Record<string, unknown>): string[] {
    const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    return Object.keys(despues).filter((k) => !igual(actual[k], despues[k]));
}
