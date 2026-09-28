/**
 * modelo — funciones PURAS del sistema de Contactos (sin React, sin Supabase).
 * Todo lo que toca la nube o el DOM vive en `store.ts`/`publicos.ts`; aquí solo
 * transformaciones deterministas sobre `Contacto`/`ContactosDoc`, para que sean
 * triviales de testear y de reutilizar (store, importadores, exportadores).
 *
 * Fusión LWW (`fusionarDocs`/`fusionarPorId`): por elemento, gana el `actualizado`
 * más reciente; en empate exacto se desempata de forma DETERMINISTA por el
 * contenido serializado (nunca por "quién es `a`/`b`"), para que la fusión sea
 * conmutativa de verdad: `fusionarDocs(a,b)` es siempre igual a `fusionarDocs(b,a)`.
 * Los borrados son lápidas (`borrado`) y viajan como un campo más del elemento.
 */

import {
    RELACIONES,
    type AgrupacionContactos,
    type CategoriaContactos,
    type Contacto,
    type ContactoEntrada,
    type ContactosDoc,
    type DatoEtiquetado,
    type EnlaceContacto,
    type FiltroContactos,
    type ListaContactos,
    type OrdenContactos,
    type TipoRelacion,
} from "@/lib/contactos/tipos";

// ─────────────────────────── Ids ───────────────────────────

/** uuid con fallback para entornos sin `crypto.randomUUID`. */
export function nuevoId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
        /* entorno sin crypto.randomUUID */
    }
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────── Helpers de texto ───────────────────────────

function trimOrUndef(v: string | undefined | null): string | undefined {
    if (v === undefined || v === null) return undefined;
    const t = v.trim();
    return t ? t : undefined;
}

/** Pliega acentos (NFD) y pasa a minúsculas, para comparar/buscar sin distinguir tildes. */
export function foldTexto(s: string | undefined | null): string {
    return (s ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

/** Normaliza un teléfono para comparar duplicados: solo dígitos y `+`, `00` inicial → `+`. */
export function normalizarTelefono(v: string): string {
    const digitos = (v || "").replace(/[^\d+]/g, "");
    return digitos.startsWith("00") ? `+${digitos.slice(2)}` : digitos;
}

function limpiarDatosEtiquetados(xs: DatoEtiquetado[] | undefined): DatoEtiquetado[] {
    if (!xs) return [];
    const out: DatoEtiquetado[] = [];
    for (const x of xs) {
        const valor = (x?.valor ?? "").trim();
        if (!valor) continue;
        out.push({ id: x.id && x.id.trim() ? x.id : nuevoId(), etiqueta: (x.etiqueta ?? "").trim(), valor });
    }
    return out;
}

function limpiarEnlaces(xs: EnlaceContacto[] | undefined): EnlaceContacto[] {
    if (!xs) return [];
    const out: EnlaceContacto[] = [];
    for (const x of xs) {
        const url = (x?.url ?? "").trim();
        if (!url) continue;
        out.push({ id: x.id && x.id.trim() ? x.id : nuevoId(), titulo: (x.titulo ?? "").trim(), url });
    }
    return out;
}

// ─────────────────────────── Crear / editar ───────────────────────────

/** Crea un contacto nuevo a partir de la entrada del formulario, con los defaults del contrato. */
export function crearContacto(entrada: ContactoEntrada, ahora: string = new Date().toISOString()): Contacto {
    return {
        id: nuevoId(),
        userId: entrada.userId ?? null,
        username: entrada.username ?? null,
        perfil: entrada.perfil ?? null,
        nombre: (entrada.nombre ?? "").trim(),
        apodo: trimOrUndef(entrada.apodo),
        descripcion: trimOrUndef(entrada.descripcion),
        relacion: entrada.relacion ?? "amistad",
        relacionDetalle: trimOrUndef(entrada.relacionDetalle),
        telefonos: limpiarDatosEtiquetados(entrada.telefonos),
        correos: limpiarDatosEtiquetados(entrada.correos),
        enlaces: limpiarEnlaces(entrada.enlaces),
        organizacion: trimOrUndef(entrada.organizacion),
        cargo: trimOrUndef(entrada.cargo),
        direccion: trimOrUndef(entrada.direccion),
        cumpleanos: entrada.cumpleanos,
        categorias: entrada.categorias ? [...entrada.categorias] : [],
        listas: entrada.listas ? [...entrada.listas] : [],
        favorito: entrada.favorito ?? false,
        visibilidad: entrada.visibilidad ?? "privada",
        origen: entrada.origen ?? (entrada.userId ? "starseed" : "manual"),
        creado: ahora,
        actualizado: ahora,
        borrado: null,
    };
}

/** Aplica un parche de edición a un contacto, tocando su reloj LWW (`actualizado`). */
export function aplicarCambios(
    c: Contacto,
    cambios: Partial<ContactoEntrada>,
    ahora: string = new Date().toISOString(),
): Contacto {
    const next: Contacto = { ...c };
    if (cambios.nombre !== undefined) next.nombre = cambios.nombre.trim();
    if (cambios.apodo !== undefined) next.apodo = trimOrUndef(cambios.apodo);
    if (cambios.descripcion !== undefined) next.descripcion = trimOrUndef(cambios.descripcion);
    if (cambios.relacion !== undefined) next.relacion = cambios.relacion;
    if (cambios.relacionDetalle !== undefined) next.relacionDetalle = trimOrUndef(cambios.relacionDetalle);
    if (cambios.telefonos !== undefined) next.telefonos = limpiarDatosEtiquetados(cambios.telefonos);
    if (cambios.correos !== undefined) next.correos = limpiarDatosEtiquetados(cambios.correos);
    if (cambios.enlaces !== undefined) next.enlaces = limpiarEnlaces(cambios.enlaces);
    if (cambios.organizacion !== undefined) next.organizacion = trimOrUndef(cambios.organizacion);
    if (cambios.cargo !== undefined) next.cargo = trimOrUndef(cambios.cargo);
    if (cambios.direccion !== undefined) next.direccion = trimOrUndef(cambios.direccion);
    if (cambios.cumpleanos !== undefined) next.cumpleanos = cambios.cumpleanos;
    if (cambios.categorias !== undefined) next.categorias = [...cambios.categorias];
    if (cambios.listas !== undefined) next.listas = [...cambios.listas];
    if (cambios.favorito !== undefined) next.favorito = cambios.favorito;
    if (cambios.visibilidad !== undefined) next.visibilidad = cambios.visibilidad;
    if (cambios.userId !== undefined) next.userId = cambios.userId;
    if (cambios.username !== undefined) next.username = cambios.username;
    if (cambios.perfil !== undefined) next.perfil = cambios.perfil;
    if (cambios.origen !== undefined) next.origen = cambios.origen;
    next.actualizado = ahora;
    return next;
}

/** Filtra los elementos vivos (sin lápida) de cualquier colección con `borrado`. */
export function vivos<T extends { borrado?: string | null }>(xs: T[]): T[] {
    return xs.filter((x) => !x.borrado);
}

// ─────────────────────────── Fusión LWW conmutativa ───────────────────────────

/** ISO más reciente de dos marcas; en empate exacto, desempate determinista por el string (conmutativo). */
export function maxIso(x: string, y: string): string {
    const tx = Date.parse(x) || 0;
    const ty = Date.parse(y) || 0;
    if (tx > ty) return x;
    if (ty > tx) return y;
    return x > y ? x : y;
}

/** Gana el elemento con `actualizado` más reciente; en empate, desempate determinista por contenido (conmutativo). */
function ganador<T extends { actualizado: string }>(x: T, y: T): T {
    const tx = Date.parse(x.actualizado) || 0;
    const ty = Date.parse(y.actualizado) || 0;
    if (tx !== ty) return tx > ty ? x : y;
    const sx = JSON.stringify(x);
    const sy = JSON.stringify(y);
    return sx <= sy ? x : y;
}

/**
 * Fusiona dos colecciones por `id` (unión de ids; por id, gana `ganador`). El
 * resultado se ordena por `id` para que el array sea IDÉNTICO sin importar el
 * orden de los argumentos — necesario para que la fusión sea de verdad conmutativa
 * también a nivel de array, no solo de contenido.
 */
export function fusionarPorId<T extends { id: string; actualizado: string }>(xs: T[], ys: T[]): T[] {
    const mapa = new Map<string, T>();
    for (const x of xs) mapa.set(x.id, x);
    for (const y of ys) {
        const existente = mapa.get(y.id);
        mapa.set(y.id, existente ? ganador(existente, y) : y);
    }
    return Array.from(mapa.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Fusiona dos documentos de la libreta NODO A NODO (contactos/categorías/listas
 * por id, LWW con lápidas incluidas). `migradoSeguidos` se conserva `true` si
 * cualquiera de los dos lo trae. Deterministo y conmutativo: `fusionarDocs(a,b)`
 * === `fusionarDocs(b,a)`.
 */
export function fusionarDocs(a: ContactosDoc, b: ContactosDoc): ContactosDoc {
    return {
        v: 1,
        contactos: fusionarPorId(a.contactos, b.contactos),
        categorias: fusionarPorId(a.categorias, b.categorias),
        listas: fusionarPorId(a.listas, b.listas),
        migradoSeguidos: Boolean(a.migradoSeguidos) || Boolean(b.migradoSeguidos),
        actualizado: maxIso(a.actualizado, b.actualizado),
    };
}

/** Quita de cada contacto los ids de categoría/lista que ya no existen vivos en el doc. */
export function limpiarReferencias(doc: ContactosDoc): ContactosDoc {
    const catIds = new Set(vivos(doc.categorias).map((c) => c.id));
    const listaIds = new Set(vivos(doc.listas).map((l) => l.id));
    const contactos = doc.contactos.map((c) => {
        const categorias = c.categorias.filter((id) => catIds.has(id));
        const listas = c.listas.filter((id) => listaIds.has(id));
        if (categorias.length === c.categorias.length && listas.length === c.listas.length) return c;
        return { ...c, categorias, listas };
    });
    return { ...doc, contactos };
}

// ─────────────────────────── Filtro / orden / agrupación ───────────────────────────

/** Texto de búsqueda accent-insensitive sobre los campos habituales (+ nombre de categoría, si se pasan). */
export function filtrarContactos(
    cs: Contacto[],
    filtro: FiltroContactos,
    categorias?: CategoriaContactos[],
): Contacto[] {
    let out = cs;
    if (filtro.visibilidad) out = out.filter((c) => c.visibilidad === filtro.visibilidad);
    if (filtro.relacion) out = out.filter((c) => c.relacion === filtro.relacion);
    if (filtro.categoria) out = out.filter((c) => c.categorias.includes(filtro.categoria as string));
    if (filtro.lista) out = out.filter((c) => c.listas.includes(filtro.lista as string));
    if (filtro.soloFavoritos) out = out.filter((c) => c.favorito);
    if (filtro.soloStarseed) out = out.filter((c) => Boolean(c.userId));

    const texto = filtro.texto?.trim();
    if (texto) {
        const needle = foldTexto(texto);
        const nombrePorCategoria = new Map((categorias ?? []).map((cat) => [cat.id, cat.nombre]));
        out = out.filter((c) => {
            const campos: (string | undefined | null)[] = [
                c.nombre,
                c.apodo,
                c.username,
                c.organizacion,
                c.descripcion,
                ...c.telefonos.map((t) => t.valor),
                ...c.correos.map((e) => e.valor),
                ...c.categorias.map((id) => nombrePorCategoria.get(id)),
            ];
            return campos.some((v) => v && foldTexto(v).includes(needle));
        });
    }
    return out;
}

/** Orden estable; `favorito` NO se fuerza primero aquí (lo decide la UI si quiere). */
export function ordenarContactos(cs: Contacto[], orden: OrdenContactos): Contacto[] {
    const out = [...cs];
    const porNombre = (a: Contacto, b: Contacto) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    switch (orden) {
        case "nombre":
            out.sort(porNombre);
            break;
        case "reciente":
            out.sort((a, b) => (Date.parse(b.actualizado) || 0) - (Date.parse(a.actualizado) || 0));
            break;
        case "relacion": {
            const indice = new Map(RELACIONES.map((r, i) => [r.id, i]));
            out.sort((a, b) => (indice.get(a.relacion) ?? 999) - (indice.get(b.relacion) ?? 999) || porNombre(a, b));
            break;
        }
        case "creado":
            out.sort((a, b) => (Date.parse(a.creado) || 0) - (Date.parse(b.creado) || 0));
            break;
    }
    return out;
}

export interface GrupoContactos {
    clave: string;
    titulo: string;
    color?: string;
    contactos: Contacto[];
}

const LETRAS_ES = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");

function letraDeAgrupacion(nombre: string): string {
    const c = (nombre || "").trim().charAt(0).toUpperCase();
    if (!c) return "#";
    if (c === "Ñ") return "Ñ";
    const plegada = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return /^[A-Z]$/.test(plegada) ? plegada : "#";
}

/**
 * Agrupa la lista de contactos según el criterio pedido:
 *  - `letra`: A–Z con Ñ en su sitio y `#` para el resto, plegando acentos.
 *  - `relacion`: un grupo por `TipoRelacion`, en el orden de `RELACIONES`.
 *  - `categoria`: un grupo por categoría (un contacto en 2 categorías aparece en las 2) + «Sin categoría».
 *  - `ninguna`: un único grupo con todos.
 */
export function agruparContactos(
    cs: Contacto[],
    agrupacion: AgrupacionContactos,
    categorias: CategoriaContactos[] = [],
): GrupoContactos[] {
    if (agrupacion === "ninguna") {
        return [{ clave: "todos", titulo: "Todos", contactos: cs }];
    }

    if (agrupacion === "letra") {
        const mapa = new Map<string, Contacto[]>();
        for (const c of cs) {
            const letra = letraDeAgrupacion(c.nombre);
            const arr = mapa.get(letra) ?? [];
            arr.push(c);
            mapa.set(letra, arr);
        }
        return [...LETRAS_ES, "#"]
            .filter((l) => mapa.has(l))
            .map((l) => ({ clave: l, titulo: l, contactos: mapa.get(l) as Contacto[] }));
    }

    if (agrupacion === "relacion") {
        const mapa = new Map<TipoRelacion, Contacto[]>();
        for (const c of cs) {
            const arr = mapa.get(c.relacion) ?? [];
            arr.push(c);
            mapa.set(c.relacion, arr);
        }
        return RELACIONES.filter((r) => mapa.has(r.id)).map((r) => ({
            clave: r.id,
            titulo: r.etiqueta,
            color: r.color,
            contactos: mapa.get(r.id) as Contacto[],
        }));
    }

    // categoria
    const porCategoria = new Map<string, Contacto[]>();
    const sinCategoria: Contacto[] = [];
    for (const c of cs) {
        if (!c.categorias.length) {
            sinCategoria.push(c);
            continue;
        }
        for (const catId of c.categorias) {
            const arr = porCategoria.get(catId) ?? [];
            arr.push(c);
            porCategoria.set(catId, arr);
        }
    }
    const grupos: GrupoContactos[] = [];
    for (const cat of categorias) {
        const arr = porCategoria.get(cat.id);
        if (arr?.length) grupos.push({ clave: cat.id, titulo: cat.nombre, color: cat.color, contactos: arr });
    }
    if (sinCategoria.length) {
        grupos.push({ clave: "__sin-categoria", titulo: "Sin categoría", contactos: sinCategoria });
    }
    return grupos;
}

// ─────────────────────────── Duplicados ───────────────────────────

/**
 * Agrupa contactos que probablemente son duplicados: mismo `userId`, mismo
 * teléfono normalizado, mismo correo (case-insensitive) o mismo nombre exacto
 * (plegado). Usa unión-búsqueda para que las coincidencias sean transitivas
 * (A~B por teléfono y B~C por correo → un solo grupo {A,B,C}).
 */
export function buscarDuplicados(cs: Contacto[]): Contacto[][] {
    const vivosCs = vivos(cs);
    const padre = new Map<string, string>();
    const buscar = (x: string): string => {
        let r = x;
        while (padre.get(r) && padre.get(r) !== r) r = padre.get(r) as string;
        padre.set(x, r);
        return r;
    };
    const unir = (a: string, b: string) => {
        const ra = buscar(a);
        const rb = buscar(b);
        if (ra !== rb) padre.set(ra, rb);
    };
    for (const c of vivosCs) padre.set(c.id, c.id);

    const porUserId = new Map<string, string[]>();
    const porTelefono = new Map<string, string[]>();
    const porCorreo = new Map<string, string[]>();
    const porNombre = new Map<string, string[]>();

    for (const c of vivosCs) {
        if (c.userId) {
            const arr = porUserId.get(c.userId) ?? [];
            arr.push(c.id);
            porUserId.set(c.userId, arr);
        }
        for (const t of c.telefonos) {
            const clave = normalizarTelefono(t.valor);
            if (!clave) continue;
            const arr = porTelefono.get(clave) ?? [];
            arr.push(c.id);
            porTelefono.set(clave, arr);
        }
        for (const e of c.correos) {
            const clave = e.valor.trim().toLowerCase();
            if (!clave) continue;
            const arr = porCorreo.get(clave) ?? [];
            arr.push(c.id);
            porCorreo.set(clave, arr);
        }
        const claveNombre = foldTexto(c.nombre.trim());
        if (claveNombre) {
            const arr = porNombre.get(claveNombre) ?? [];
            arr.push(c.id);
            porNombre.set(claveNombre, arr);
        }
    }
    for (const mapa of [porUserId, porTelefono, porCorreo, porNombre]) {
        for (const ids of mapa.values()) {
            for (let i = 1; i < ids.length; i++) unir(ids[0], ids[i]);
        }
    }

    const grupos = new Map<string, Contacto[]>();
    for (const c of vivosCs) {
        const raiz = buscar(c.id);
        const arr = grupos.get(raiz) ?? [];
        arr.push(c);
        grupos.set(raiz, arr);
    }
    return Array.from(grupos.values()).filter((g) => g.length >= 2);
}

function dedupDatos(xs: DatoEtiquetado[], clave: (x: DatoEtiquetado) => string): DatoEtiquetado[] {
    const vistos = new Set<string>();
    const out: DatoEtiquetado[] = [];
    for (const x of xs) {
        const k = clave(x);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        out.push(x);
    }
    return out;
}

function dedupEnlaces(xs: EnlaceContacto[]): EnlaceContacto[] {
    const vistos = new Set<string>();
    const out: EnlaceContacto[] = [];
    for (const x of xs) {
        const k = x.url.trim().toLowerCase();
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        out.push(x);
    }
    return out;
}

/**
 * Fusiona dos contactos duplicados en uno: unión de teléfonos/correos/enlaces
 * (dedup), unión de categorías/listas, `favorito` OR, identidad StarSeed
 * (`userId`/`username`/`perfil`) la de `base` salvo que le falte, y el resto de
 * campos escalares el valor NO VACÍO más reciente por `actualizado`.
 */
export function fusionarContactos(base: Contacto, otro: Contacto, ahora: string = new Date().toISOString()): Contacto {
    const masReciente = (Date.parse(otro.actualizado) || 0) > (Date.parse(base.actualizado) || 0);
    const vacio = (v: unknown) => v === undefined || v === null || v === "";
    function pickScalar<K extends keyof Contacto>(campo: K): Contacto[K] {
        const vb = base[campo];
        const vo = otro[campo];
        if (vacio(vb) && !vacio(vo)) return vo;
        if (!vacio(vb) && vacio(vo)) return vb;
        if (vacio(vb) && vacio(vo)) return vb;
        return masReciente ? vo : vb;
    }

    const tieneIdentidadPropia = Boolean(base.userId);
    const userId = base.userId ?? otro.userId;
    const username = tieneIdentidadPropia ? base.username : (base.username ?? otro.username);
    const perfil = tieneIdentidadPropia ? base.perfil : (base.perfil ?? otro.perfil);

    return {
        id: base.id,
        userId,
        username,
        perfil,
        nombre: pickScalar("nombre"),
        apodo: pickScalar("apodo"),
        descripcion: pickScalar("descripcion"),
        relacion: pickScalar("relacion"),
        relacionDetalle: pickScalar("relacionDetalle"),
        telefonos: dedupDatos([...base.telefonos, ...otro.telefonos], (t) => normalizarTelefono(t.valor)),
        correos: dedupDatos([...base.correos, ...otro.correos], (e) => e.valor.trim().toLowerCase()),
        enlaces: dedupEnlaces([...base.enlaces, ...otro.enlaces]),
        organizacion: pickScalar("organizacion"),
        cargo: pickScalar("cargo"),
        direccion: pickScalar("direccion"),
        cumpleanos: pickScalar("cumpleanos"),
        categorias: Array.from(new Set([...base.categorias, ...otro.categorias])),
        listas: Array.from(new Set([...base.listas, ...otro.listas])),
        favorito: base.favorito || otro.favorito,
        visibilidad: base.visibilidad,
        origen: base.origen,
        creado: (Date.parse(otro.creado) || 0) < (Date.parse(base.creado) || 0) ? otro.creado : base.creado,
        actualizado: ahora,
        borrado: null,
    };
}

/** Iniciales (1 o 2 letras) a partir del nombre completo, para avatares sin foto. */
export function iniciales(nombre: string): string {
    const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    const primera = partes[0].charAt(0).toUpperCase();
    const segunda = partes.length > 1 ? partes[partes.length - 1].charAt(0).toUpperCase() : "";
    return `${primera}${segunda}` || "?";
}

// ─────────────────────────── Cumpleaños ───────────────────────────

function parseCumple(cumple: string): { mes: number; dia: number; anio?: number } | null {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cumple);
    if (m) return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
    m = /^--(\d{2})-(\d{2})$/.exec(cumple);
    if (m) return { mes: Number(m[1]), dia: Number(m[2]) };
    return null;
}

function esBisiesto(anio: number): boolean {
    return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

export interface ProximoCumpleanos {
    contacto: Contacto;
    fecha: Date;
    /** Edad que cumple, si se conoce el año de nacimiento. */
    cumple?: number;
}

/** Cumpleaños dentro de los próximos `dias` (por defecto 30), cruzando fin de año; Feb-29 cae a Feb-28 en años no bisiestos. */
export function proximosCumpleanos(cs: Contacto[], hoy: Date, dias = 30): ProximoCumpleanos[] {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const limite = new Date(inicio);
    limite.setDate(limite.getDate() + dias);

    const out: ProximoCumpleanos[] = [];
    for (const c of vivos(cs)) {
        if (!c.cumpleanos) continue;
        const p = parseCumple(c.cumpleanos);
        if (!p) continue;
        for (const anioCandidato of [inicio.getFullYear(), inicio.getFullYear() + 1]) {
            const esFeb29 = p.mes === 2 && p.dia === 29;
            const dia = esFeb29 && !esBisiesto(anioCandidato) ? 28 : p.dia;
            const fecha = new Date(anioCandidato, p.mes - 1, dia);
            if (fecha > limite) break;
            if (fecha >= inicio) {
                out.push({ contacto: c, fecha, cumple: p.anio !== undefined ? anioCandidato - p.anio : undefined });
                break;
            }
        }
    }
    out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return out;
}
