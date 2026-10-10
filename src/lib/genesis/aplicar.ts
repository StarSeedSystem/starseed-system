/**
 * GENESIS · APLICAR Y DESHACER (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Aplica una operación YA VALIDADA (`operaciones.ts`) con los módulos del OS y
 * devuelve el inverso exacto para deshacerla. Todo lo de fuera entra por
 * `PuertosGenesis` (Supabase con la sesión y la RLS de la persona, dock,
 * tableros, agentes, apariencia), así que este archivo se prueba sin navegador
 * ni red: las implementaciones reales viven en `puertos-os.ts`.
 *
 * Promesas:
 *   · Se vuelve a validar justo antes de aplicar (el contexto puede haber
 *     cambiado desde la vista previa).
 *   · Un 0 filas actualizadas NO es un éxito: se dice que la base de datos no
 *     dejó (RLS) en vez de enseñar «hecho».
 *   · Deshacer nunca pisa un cambio posterior: si el campo ya no tiene lo que
 *     dejó Genesis, se dice y no se toca.
 *
 * Sin React ni `node:*`. Nunca lanza: todo error vuelve como `{ ok:false, motivo }`.
 */

import { aplicarAccion } from "@/lib/astraura/ui-aplicador";
import type { AccionUi } from "@/lib/astraura/ui-acciones";
import type { AppearanceConfig } from "@/context/appearance-context";
import {
    camposEnConflicto,
    describirOperacion,
    validarOperacion,
    type Ambito,
    type ContextoValidacion,
    type EntradaGenesis,
    type Inverso,
    type Operacion,
    type TipoEntidad,
} from "./operaciones";

/* ── Puertos ─────────────────────────────────────────────────────────────── */

export type TablaPerfil = "os_profiles" | "profiles" | "os_account_profiles";

export interface FilaDock {
    id: string;
    label: string;
    iconKey: string;
    path: string;
    color: string;
    enabled: boolean;
    origin: "preset" | "user";
}

export interface WidgetTablero {
    id: string;
    dashboard_id: string;
    widget_type: string;
    layout: { x: number; y: number; w: number; h: number; i?: string };
    settings: Record<string, unknown>;
    created_at: string;
    size?: string;
}

export interface PuertosGenesis {
    perfil: {
        /** Lee los campos del perfil principal (o de una faceta). `clave` identifica la fila. */
        leer(faceta?: string): Promise<{ ok: true; tabla: TablaPerfil; clave: string; valores: Record<string, string | null> } | { ok: false; motivo: string }>;
        /** Escribe; devuelve cuántas filas cambiaron (0 = la RLS no dejó o no existe). */
        escribir(tabla: TablaPerfil, clave: string, valores: Record<string, string | null>): Promise<{ ok: boolean; filas: number; motivo?: string }>;
    };
    entidad: {
        crearPagina(datos: { nombre: string; descripcion?: string; etiquetas?: string[]; acento?: string }): Promise<{ ok: boolean; slug?: string; motivo?: string }>;
        leer(tipo: TipoEntidad, slug: string): Promise<{ ok: true; valores: Record<string, unknown> } | { ok: false; motivo: string }>;
        /** `soloDueña`: además filtra por la cuenta dueña (Genesis personal: solo tus páginas). */
        escribir(tipo: TipoEntidad, slug: string, valores: Record<string, unknown>, opciones?: { soloDueña?: boolean }): Promise<{ ok: boolean; filas: number; motivo?: string }>;
        /** Publicaciones de la página (null = no se pudo contar). */
        contarPublicaciones(slug: string): Promise<number | null>;
        borrarPagina(slug: string): Promise<{ ok: boolean; motivo?: string }>;
    };
    /** Solo existe en el navegador con `AppearanceProvider` montado. */
    apariencia?: {
        leer(): AppearanceConfig;
        escribir(parche: Record<string, unknown>): void;
        /** Ámbito en el que la Apariencia escribe hoy el fondo. */
        ambitoFondo: "cuenta" | "perfil" | "pagina";
    };
    dock: {
        leer(): FilaDock[];
        guardar(items: FilaDock[]): void;
        iconoValido(clave: string): boolean;
    };
    tableros: {
        listar(): { id: string; nombre: string; principal: boolean }[];
        leerWidgets(tablero: string): WidgetTablero[];
        guardarWidgets(tablero: string, widgets: WidgetTablero[]): void;
        /** Huella por defecto del widget, o null si el OS no lo conoce. */
        widgetConocido(tipo: string): { w: number; h: number; minW: number; minH: number; nombre: string } | null;
    };
    agentes: {
        crear(datos: { nombre: string; descripcion?: string; persona?: string; icono?: string; visibilidad?: "private" | "public" }): { id: string } | null;
        borrar(id: string): boolean;
        vincular(id: string, tipo: "page" | "group", entidadId: string, publico: boolean): boolean;
        desvincular(id: string, tipo: "page" | "group", entidadId: string): void;
    };
    ahora(): number;
    nuevoId(): string;
}

export type ResultadoAplicar =
    | { ok: true; entrada: EntradaGenesis; resultado: string }
    | { ok: false; motivo: string };

/* ── Mapas de campos (nombre del vocabulario → columna) ───────────────────── */

const COLUMNAS_PERFIL: Record<TablaPerfil, Record<string, string>> = {
    os_profiles: { nombre: "display_name", bio: "bio", avatar: "avatar_url", portada: "cover_url" },
    profiles: { nombre: "display_name", bio: "bio", avatar: "avatar_url", portada: "cover_url" },
    os_account_profiles: { nombre: "name", bio: "bio", avatar: "avatar_url", portada: "cover_url" },
};

const COLUMNAS_ENTIDAD: Record<string, string> = {
    nombre: "name",
    descripcion: "description",
    etiquetas: "tags",
    acento: "accent",
    avatar: "avatar_url",
    portada: "cover_url",
};

function aColumnas(cambios: Record<string, unknown>, mapa: Record<string, string>, vacioANull: boolean): Record<string, unknown> {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cambios)) {
        const col = mapa[k];
        if (!col) continue;
        salida[col] = vacioANull && v === "" ? null : v;
    }
    return salida;
}

function soloClaves<T>(o: Record<string, T>, claves: string[]): Record<string, T | null> {
    const salida: Record<string, T | null> = {};
    for (const k of claves) salida[k] = (o[k] ?? null) as T | null;
    return salida;
}

function contextoDesde(p: PuertosGenesis, ambito: Ambito, paginasPropias?: string[]): ContextoValidacion {
    let dock: ContextoValidacion["dock"];
    try {
        dock = p.dock.leer().map((b) => ({ id: b.id, ruta: b.path, etiqueta: b.label, activo: b.enabled }));
    } catch {
        dock = undefined;
    }
    return { ambito, dock, paginasPropias };
}

function tableroDestino(p: PuertosGenesis, pedido?: string): { id: string; nombre: string } | null {
    const lista = p.tableros.listar();
    if (!lista.length) return null;
    if (pedido) {
        const q = pedido.trim().toLowerCase();
        const exacto = lista.find((t) => t.id === pedido || t.nombre.trim().toLowerCase() === q);
        if (exacto) return exacto;
        const parecido = lista.find((t) => t.nombre.toLowerCase().includes(q));
        return parecido ?? null;
    }
    return lista.find((t) => t.principal) ?? lista[0];
}

/* ── Aplicar ─────────────────────────────────────────────────────────────── */

/**
 * Aplica una operación con confirmación ya dada. Devuelve la entrada del
 * registro (con su inverso) o el motivo honesto por el que no se aplicó.
 */
export async function aplicarOperacion(
    bruto: Operacion,
    ambito: Ambito,
    p: PuertosGenesis,
    opciones: { paginasPropias?: string[] } = {},
): Promise<ResultadoAplicar> {
    try {
        const v = validarOperacion(bruto, contextoDesde(p, ambito, opciones.paginasPropias));
        if (!v.ok) return { ok: false, motivo: v.problemas.join(" ") };
        const op = v.op;
        const hecho = (inverso: Inverso | null, resultado: string): ResultadoAplicar => ({
            ok: true,
            resultado,
            entrada: {
                id: p.nuevoId(),
                at: p.ahora(),
                ambito,
                operacion: op,
                titulo: describirOperacion(op, ambito).titulo,
                estado: "aplicada",
                inverso,
                resultado,
            },
        });

        switch (op.tipo) {
            case "perfil.editar": {
                const lectura = await p.perfil.leer(op.faceta);
                if (!lectura.ok) return { ok: false, motivo: lectura.motivo };
                const valores = aColumnas(op.cambios as Record<string, unknown>, COLUMNAS_PERFIL[lectura.tabla], false) as Record<string, string | null>;
                const columnas = Object.keys(valores);
                const antes = soloClaves(lectura.valores, columnas);
                const r = await p.perfil.escribir(lectura.tabla, lectura.clave, valores);
                if (!r.ok) return { ok: false, motivo: r.motivo ?? "No se pudo guardar el perfil." };
                if (r.filas === 0) return { ok: false, motivo: "La base de datos no dejó guardar ese perfil (no es tuyo o ya no existe)." };
                return hecho({ tipo: "perfil.restaurar", tabla: lectura.tabla, clave: lectura.clave, antes, despues: valores }, "Perfil actualizado.");
            }

            case "pagina.crear": {
                const r = await p.entidad.crearPagina(op.datos);
                if (!r.ok || !r.slug) return { ok: false, motivo: r.motivo ?? "No se pudo crear la página." };
                return hecho({ tipo: "pagina.borrar", slug: r.slug }, `Página creada: /pagina/${r.slug}.`);
            }

            case "pagina.editar": {
                const { tipo, slug } = op.destino;
                const lectura = await p.entidad.leer(tipo, slug);
                if (!lectura.ok) return { ok: false, motivo: lectura.motivo };
                const valores = aColumnas(op.cambios as Record<string, unknown>, COLUMNAS_ENTIDAD, true);
                const columnas = Object.keys(valores);
                const antes = soloClaves(lectura.valores, columnas);
                const r = await p.entidad.escribir(tipo, slug, valores, { soloDueña: ambito.tipo === "persona" });
                if (!r.ok) return { ok: false, motivo: r.motivo ?? "No se pudo guardar." };
                if (r.filas === 0) {
                    return {
                        ok: false,
                        motivo:
                            ambito.tipo === "persona"
                                ? "La base de datos no dejó guardar: esa página no es tuya o ya no existe."
                                : "La base de datos no dejó guardar: hoy solo la cuenta dueña puede cambiar los datos de esta " +
                                  (tipo === "grupo" ? "comunidad" : "página") +
                                  " (los roles de gestión necesitan la migración de PoliGenesis aplicada).",
                    };
                }
                return hecho({ tipo: "entidad.restaurar", entidad: tipo, slug, antes, despues: valores }, "Cambios guardados.");
            }

            case "apariencia.aplicar": {
                const ap = p.apariencia;
                if (!ap) return { ok: false, motivo: "La apariencia solo se cambia desde el navegador con el OS abierto." };
                if (op.parche.background && ap.ambitoFondo !== "cuenta") {
                    return {
                        ok: false,
                        motivo: `Tu Apariencia está escribiendo el fondo en «${ap.ambitoFondo}». Para que Genesis pueda deshacerlo exacto, pon el ámbito del fondo en «cuenta» (Ajustes › Apariencia) o cámbialo desde allí.`,
                    };
                }
                const actual = ap.leer();
                const { entrada } = aplicarAccion(actual, {
                    tipo: op.faja,
                    ambito: "cuenta",
                    parche: op.parche as AccionUi["parche"],
                    motivo: op.motivo,
                    actor: "agente:genesis",
                });
                ap.escribir(op.parche);
                return hecho({ tipo: "apariencia.restaurar", parche: entrada.inverso as Record<string, unknown> }, entrada.resumen || "Apariencia cambiada.");
            }

            case "dock.añadir": {
                const items = p.dock.leer();
                const e = op.elemento;
                if (e.id) {
                    const i = items.findIndex((b) => b.id === e.id);
                    if (i < 0) return { ok: false, motivo: `No existe el botón «${e.id}».` };
                    const estaba = items[i].enabled;
                    const siguiente = items.map((b, j) => (j === i ? { ...b, enabled: true } : b));
                    p.dock.guardar(siguiente);
                    return hecho({ tipo: "dock.restaurar", id: e.id, existia: true, estabaActivo: estaba }, `«${items[i].label}» está en tu dock.`);
                }
                const base = (e.etiqueta ?? "boton").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "boton";
                let id = `genesis-${base}`;
                for (let n = 2; items.some((b) => b.id === id); n++) id = `genesis-${base}-${n}`;
                const icono = e.icono && p.dock.iconoValido(e.icono) ? e.icono : "AppWindow";
                const nuevo: FilaDock = { id, label: e.etiqueta ?? id, iconKey: icono, path: e.ruta ?? "/", color: e.color ?? "neutral", enabled: true, origin: "user" };
                p.dock.guardar([...items, nuevo]);
                return hecho(
                    { tipo: "dock.restaurar", id, existia: false, estabaActivo: false },
                    `Botón «${nuevo.label}» añadido${icono !== e.icono && e.icono ? " (icono por defecto: el pedido no existe)" : ""}.`,
                );
            }

            case "dock.quitar": {
                const items = p.dock.leer();
                const i = items.findIndex((b) => b.id === op.id);
                if (i < 0) return { ok: false, motivo: `No existe el botón «${op.id}».` };
                p.dock.guardar(items.map((b, j) => (j === i ? { ...b, enabled: false } : b)));
                return hecho({ tipo: "dock.restaurar", id: op.id, existia: true, estabaActivo: items[i].enabled }, `«${items[i].label}» ya no está en el dock (sigue en el lanzador).`);
            }

            case "dashboard.widget.añadir": {
                const conocido = p.tableros.widgetConocido(op.widget);
                if (!conocido) return { ok: false, motivo: `El OS no conoce el widget ${op.widget}.` };
                const tablero = tableroDestino(p, op.tablero);
                if (!tablero) return { ok: false, motivo: op.tablero ? `No encuentro el tablero «${op.tablero}».` : "No tienes ningún tablero todavía: abre el Dashboard una vez." };
                const actuales = p.tableros.leerWidgets(tablero.id);
                const escala = op.talla === "S" ? 0.75 : op.talla === "L" ? 1.5 : 1;
                const w = Math.min(12, Math.max(conocido.minW, Math.round(conocido.w * escala)));
                const h = Math.max(conocido.minH, Math.round(conocido.h * escala));
                const y = actuales.reduce((m, x) => Math.max(m, (x.layout?.y ?? 0) + (x.layout?.h ?? 0)), 0);
                const id = p.nuevoId();
                const nuevo: WidgetTablero = {
                    id,
                    dashboard_id: tablero.id,
                    widget_type: op.widget,
                    layout: { x: 0, y, w, h, i: id },
                    settings: {},
                    created_at: new Date(p.ahora()).toISOString(),
                    ...(op.talla ? { size: op.talla } : {}),
                };
                p.tableros.guardarWidgets(tablero.id, [...actuales, nuevo]);
                return hecho({ tipo: "widget.quitar", tablero: tablero.id, widgetId: id }, `${conocido.nombre} añadido a «${tablero.nombre}».`);
            }

            case "dashboard.widget.quitar": {
                const tablero = tableroDestino(p, op.tablero);
                if (!tablero) return { ok: false, motivo: op.tablero ? `No encuentro el tablero «${op.tablero}».` : "No tienes ningún tablero." };
                const actuales = p.tableros.leerWidgets(tablero.id);
                const quitado = actuales.find((x) => x.widget_type === op.widget);
                if (!quitado) return { ok: false, motivo: `«${tablero.nombre}» no tiene el widget ${op.widget}.` };
                p.tableros.guardarWidgets(tablero.id, actuales.filter((x) => x.id !== quitado.id));
                return hecho({ tipo: "widget.reponer", tablero: tablero.id, widget: quitado as unknown as Record<string, unknown> }, `Widget quitado de «${tablero.nombre}».`);
            }

            case "agente.crear": {
                const creado = p.agentes.crear(op.agente);
                if (!creado) return { ok: false, motivo: "No se pudo crear el agente." };
                let vinculo: { tipo: "page" | "group"; id: string } | undefined;
                if (ambito.tipo === "entidad") {
                    vinculo = { tipo: ambito.entidad.tipo === "grupo" ? "group" : "page", id: ambito.entidad.id };
                    if (!p.agentes.vincular(creado.id, vinculo.tipo, vinculo.id, op.agente.visibilidad === "public")) {
                        p.agentes.borrar(creado.id);
                        return { ok: false, motivo: "No se pudo vincular el agente a la entidad; no se ha creado." };
                    }
                }
                return hecho(
                    { tipo: "agente.borrar", agenteId: creado.id, ...(vinculo ? { vinculo } : {}) },
                    ambito.tipo === "entidad"
                        ? "Agente creado y vinculado. Vive en tu biblioteca; el resto del grupo lo ve cuando lo compartes como público."
                        : "Agente creado en tu biblioteca.",
                );
            }
        }
        return { ok: false, motivo: "Operación no reconocida." };
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo aplicar." };
    }
}

/* ── Deshacer ────────────────────────────────────────────────────────────── */

export type ResultadoDeshacer = { ok: true; resultado: string } | { ok: false; motivo: string };

const NOMBRES_COLUMNA: Record<string, string> = {
    display_name: "nombre",
    name: "nombre",
    bio: "biografía",
    avatar_url: "foto",
    cover_url: "portada",
    description: "descripción",
    tags: "etiquetas",
    accent: "color",
};

function conflicto(campos: string[]): string {
    return `No se deshace para no pisar un cambio posterior: ${campos.map((c) => NOMBRES_COLUMNA[c] ?? c).join(", ")} ya no tiene lo que dejó Genesis.`;
}

/** Deshace una entrada aplicada. No toca nada si alguien lo cambió después. */
export async function deshacerEntrada(e: EntradaGenesis, p: PuertosGenesis): Promise<ResultadoDeshacer> {
    try {
        if (e.estado !== "aplicada" || !e.inverso) return { ok: false, motivo: "Esta entrada no se puede deshacer." };
        const inv = e.inverso;
        switch (inv.tipo) {
            case "perfil.restaurar": {
                const faceta = e.operacion.tipo === "perfil.editar" ? e.operacion.faceta : undefined;
                const lectura = await p.perfil.leer(faceta);
                if (!lectura.ok) return { ok: false, motivo: lectura.motivo };
                const choque = camposEnConflicto(lectura.valores, inv.despues);
                if (choque.length) return { ok: false, motivo: conflicto(choque) };
                const r = await p.perfil.escribir(inv.tabla, inv.clave, inv.antes);
                if (!r.ok || r.filas === 0) return { ok: false, motivo: r.motivo ?? "La base de datos no dejó restaurar el perfil." };
                return { ok: true, resultado: "Perfil como estaba." };
            }
            case "entidad.restaurar": {
                const lectura = await p.entidad.leer(inv.entidad, inv.slug);
                if (!lectura.ok) return { ok: false, motivo: lectura.motivo };
                const choque = camposEnConflicto(lectura.valores, inv.despues);
                if (choque.length) return { ok: false, motivo: conflicto(choque) };
                const r = await p.entidad.escribir(inv.entidad, inv.slug, inv.antes, { soloDueña: e.ambito.tipo === "persona" });
                if (!r.ok || r.filas === 0) return { ok: false, motivo: r.motivo ?? "La base de datos no dejó restaurar." };
                return { ok: true, resultado: "Restaurado como estaba." };
            }
            case "pagina.borrar": {
                const n = await p.entidad.contarPublicaciones(inv.slug);
                if (n === null) return { ok: false, motivo: "No se pudo comprobar si la página tiene publicaciones; no se borra a ciegas." };
                if (n > 0) return { ok: false, motivo: `La página ya tiene ${n} publicación(es): no se borra para no perder contenido. Bórrala tú desde la página si quieres.` };
                const r = await p.entidad.borrarPagina(inv.slug);
                return r.ok ? { ok: true, resultado: "Página retirada." } : { ok: false, motivo: r.motivo ?? "No se pudo borrar la página." };
            }
            case "apariencia.restaurar": {
                if (!p.apariencia) return { ok: false, motivo: "La apariencia solo se restaura desde el navegador con el OS abierto." };
                if (inv.parche.background && p.apariencia.ambitoFondo !== "cuenta") {
                    return { ok: false, motivo: "Pon el ámbito del fondo en «cuenta» (Ajustes › Apariencia) para restaurarlo exacto." };
                }
                p.apariencia.escribir(inv.parche);
                return { ok: true, resultado: "Apariencia como estaba." };
            }
            case "dock.restaurar": {
                const items = p.dock.leer();
                const i = items.findIndex((b) => b.id === inv.id);
                if (!inv.existia) {
                    if (i < 0) return { ok: true, resultado: "Ese botón ya no estaba." };
                    p.dock.guardar(items.filter((b) => b.id !== inv.id));
                    return { ok: true, resultado: "Botón quitado." };
                }
                if (i < 0) return { ok: false, motivo: "Ese botón ya no existe en tu dock." };
                p.dock.guardar(items.map((b, j) => (j === i ? { ...b, enabled: inv.estabaActivo } : b)));
                return { ok: true, resultado: inv.estabaActivo ? "Botón de vuelta en el dock." : "Botón fuera del dock otra vez." };
            }
            case "widget.quitar": {
                const actuales = p.tableros.leerWidgets(inv.tablero);
                if (!actuales.some((x) => x.id === inv.widgetId)) return { ok: true, resultado: "Ese widget ya no estaba." };
                p.tableros.guardarWidgets(inv.tablero, actuales.filter((x) => x.id !== inv.widgetId));
                return { ok: true, resultado: "Widget quitado." };
            }
            case "widget.reponer": {
                const actuales = p.tableros.leerWidgets(inv.tablero);
                const w = inv.widget as unknown as WidgetTablero;
                if (actuales.some((x) => x.id === w.id)) return { ok: true, resultado: "Ese widget ya estaba." };
                p.tableros.guardarWidgets(inv.tablero, [...actuales, w]);
                return { ok: true, resultado: "Widget repuesto." };
            }
            case "agente.borrar": {
                if (inv.vinculo) p.agentes.desvincular(inv.agenteId, inv.vinculo.tipo, inv.vinculo.id);
                const borrado = p.agentes.borrar(inv.agenteId);
                return borrado ? { ok: true, resultado: "Agente borrado." } : { ok: true, resultado: "Ese agente ya no estaba." };
            }
        }
        return { ok: false, motivo: "No sé deshacer esto." };
    } catch (err) {
        return { ok: false, motivo: err instanceof Error ? err.message : "No se pudo deshacer." };
    }
}
