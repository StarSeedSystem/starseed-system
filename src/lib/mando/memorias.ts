/**
 * Memorias del Puente de Mando — lógica PURA (pestaña «Memorias», Ola de Memorias)
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo que se puede probar sin disco ni red: qué archivo se omite por su
 * nombre, cómo se redactan secretos, cómo se extraen vínculos (`[[wiki]]`,
 * enlaces markdown internos e ids de tarea/ola como `p318Jb` u «Ola 318»), cómo
 * se agrupan los archivos en capas, cómo se resuelven esos vínculos contra un
 * índice de archivos conocidos (para el grafo y los «mencionado por»), y cómo
 * se puntúa una búsqueda.
 *
 * Este módulo NUNCA toca disco ni red (sin `node:*`): lo importa tanto
 * `memorias-servidor.ts` (que sí lee el disco) como `panel-memorias.tsx` (el
 * cliente), así que tiene que seguir siendo seguro de mandar al navegador.
 *
 * ⚠️ Seguridad: `redactarTexto` es la única barrera entre lo que hay en disco
 * y lo que llega al cliente para claves sueltas en el TEXTO de un archivo. Los
 * archivos que son ELLOS MISMOS secretos (`*env*`, `*.key`, `*token*`, …) se
 * descartan enteros con `debeOmitirArchivo`, antes de leer ni una línea.
 */

// ─── Capas ──────────────────────────────────────────────────────────────────

/** Identificador de cada capa de memoria, en el orden fijo que pide el panel. */
export type IdCapa =
    | "nucleo"
    | "proyecto"
    | "relevo"
    | "aprendizajes"
    | "recuerdos-tarea"
    | "preferencias"
    | "agentes-externos"
    | "programas";

/** Definición estática de cada capa: id, título humano y qué guarda. */
export interface DefinicionCapa {
    id: IdCapa;
    titulo: string;
    descripcion: string;
}

/** Las ocho capas, en el orden en que se listan y se pintan siempre. */
export const DEFINICION_CAPAS: readonly DefinicionCapa[] = [
    {
        id: "nucleo",
        titulo: "Núcleo",
        descripcion: "Principios e instrucciones del proyecto: CLAUDE.md, AGENTS.md, PUENTE-DE-MANDO.md, DESIGN.md, README.md.",
    },
    {
        id: "proyecto",
        titulo: "Proyecto",
        descripcion: "Memoria viva del proyecto en memory/*.md: arquitectura, estado, glosario, hoja de ruta.",
    },
    {
        id: "relevo",
        titulo: "Relevo e informes",
        descripcion: "Informes de cierre de ola y la bitácora de relevo entre agentes.",
    },
    {
        id: "aprendizajes",
        titulo: "Aprendizajes",
        descripcion: "Corpus de aprendizaje continuo, verificaciones y evaluaciones de las olas.",
    },
    {
        id: "recuerdos-tarea",
        titulo: "Recuerdos por tarea",
        descripcion: "Cualquier memoria de otra capa que menciona una tarea o una ola concreta.",
    },
    {
        id: "preferencias",
        titulo: "Preferencias y configuración",
        descripcion: "Ajustes del enjambre, del Mando y configuración local — nunca claves.",
    },
    {
        id: "agentes-externos",
        titulo: "Agentes externos",
        descripcion: "Memorias de Hermes, mem0, Cognee, Letta y el backend de Astraura.",
    },
    {
        id: "programas",
        titulo: "Programas, enlaces, medios y versiones",
        descripcion: "Versiones del OS, servicios conocidos del proyecto y recuento de carpetas de medios.",
    },
] as const;

// ─── Tipos de datos ─────────────────────────────────────────────────────────

/** Una memoria (archivo o entrada sintética) catalogada por el Mando. */
export interface ArchivoMemoria {
    /** Ruta relativa al repositorio, o pseudo-ruta `~/...` fuera de él; nunca una ruta absoluta del disco. */
    ruta: string;
    /** Primer encabezado `#`/`##`, o el nombre del archivo si no hay ninguno. */
    titulo: string;
    /** Tamaño en bytes (0 para entradas sintéticas). */
    tamano: number;
    /** Fecha de modificación en ISO 8601. */
    actualizado: string;
    /** Primeras líneas con contenido, YA redactadas y recortadas. */
    resumen: string;
    /** Ids/rutas a los que este archivo hace referencia (wiki-links, enlaces md, ids de tarea/ola). */
    vinculos: string[];
    etiquetas: string[];
    capa: IdCapa;
    /** true para entradas que no son un archivo real (versión, servicio, recuento de medios). */
    sintetico?: boolean;
}

/** Una capa con sus archivos ya cargados. */
export interface CapaMemoria extends DefinicionCapa {
    /** De dónde sale esta capa (directorios u orígenes), en texto para humanos. */
    origen: string;
    archivos: ArchivoMemoria[];
}

export interface NodoGrafoMemoria {
    id: string;
    titulo: string;
    capa: IdCapa;
}

export interface AristaGrafoMemoria {
    origen: string;
    destino: string;
}

export interface GrafoMemoria {
    nodos: NodoGrafoMemoria[];
    aristas: AristaGrafoMemoria[];
}

/** Un vínculo del texto ya resuelto (o no) contra el índice de archivos conocidos. */
export interface VinculoResuelto {
    texto: string;
    ruta: string | null;
}

export interface RespuestaMemorias {
    capas: CapaMemoria[];
    ultimasActualizaciones: ArchivoMemoria[];
    grafo: GrafoMemoria;
    totalArchivos: number;
    generadoEn: string;
}

export interface DetalleArchivoMemoria {
    ruta: string;
    titulo: string;
    capa: IdCapa;
    actualizado: string;
    tamano: number;
    texto: string;
    vinculosResueltos: VinculoResuelto[];
    mencionadoPor: string[];
}

// ─── Qué archivo NUNCA se lee ───────────────────────────────────────────────

/**
 * Archivos que se descartan ENTEROS, sin leer una sola línea:
 *  • por su NOMBRE: `*env*`, `*.key`, `*token*`, `*secret*`, `credentials*`,
 *    `auth*.json`.
 *  • por vivir dentro de una carpeta claramente hecha para secretos
 *    (`.../keys/...`, `.../secrets/...`, `.../credentials/...`,
 *    `.../private/...`) — aunque el nombre del archivo en sí sea inocente,
 *    como `~/.astraura/keys/agent_apis.json` (visto de verdad en esta
 *    máquina: guarda claves de agente en texto plano).
 *
 * Acepta un nombre suelto o una ruta con `/`; con un nombre suelto se
 * comporta igual que antes. Esta es la barrera principal contra los
 * secretos: si un archivo pasa esta prueba, su CONTENIDO todavía se redacta
 * con `redactarTexto`.
 */
export function debeOmitirArchivo(rutaOArchivo: string): boolean {
    const valor = (rutaOArchivo || "").toLowerCase().trim();
    if (!valor) return true;
    const segmentos = valor.split(/[\\/]/).filter(Boolean);
    if (segmentos.some((s) => /^(keys?|secrets?|credentials?|private)$/.test(s))) return true;
    const nombre = segmentos[segmentos.length - 1] ?? valor;
    if (nombre.includes("env")) return true;
    if (nombre.endsWith(".key")) return true;
    if (nombre.includes("token")) return true;
    if (nombre.includes("secret")) return true;
    if (nombre.startsWith("credentials")) return true;
    if (/^auth.*\.json$/.test(nombre)) return true;
    // (2026-09-25) La URL del túnel del Mando solo vive en ~/.starseed/tunel-mando.json y
    // en el chat privado de Alex: nunca se enseña en ninguna otra pantalla.
    if (nombre.includes("tunel") || nombre.includes("tunnel")) return true;
    return false;
}

// ─── Redacción ──────────────────────────────────────────────────────────────

/**
 * `api_key: valor`, `API-KEY=valor`, `token: valor`, `secret=valor`,
 * `password: valor`, y también la forma JSON `"api_key": "valor"` (la comilla
 * de cierre de la clave y la de apertura del valor son OPCIONALES en el
 * patrón, así que ambos estilos entran por el mismo sitio). El valor nunca
 * incluye comillas, comas ni llaves, así que un archivo JSON sigue siendo
 * legible después de redactar.
 */
const RE_CLAVE_ASIGNADA = /(api[_-]?key|token|secret|password)([a-z0-9_-]*"?\s*[:=]\s*"?)([^\s"',}]+)/gi;
/** `Authorization: Bearer <valor>` y variantes sin cabecera («Bearer <valor>»), en texto plano o dentro de un valor JSON. */
const RE_BEARER = /\b(bearer)(\s+)([^\s"',}]+)/gi;
/** Cadenas hexadecimales largas (≥ 32) sueltas: huellas, hashes, claves en hex. */
const RE_HEX_LARGO = /\b[0-9a-fA-F]{32,}\b/g;
/** Cadenas base64 largas (≥ 32) sueltas. Exige letras/dígitos (no una raya de separación «====»). */
const RE_BASE64_LARGO = /\b[A-Za-z0-9+/]{32,}={0,2}\b/g;

/**
 * Redacta secretos en un texto SIN romper el resto del formato: sustituye el
 * VALOR (nunca el nombre de la variable) por «[oculto]». Tolerante: un texto
 * vacío o `null`/`undefined` vuelve tal cual.
 */
export function redactarTexto(texto: string): string {
    if (!texto) return texto ?? "";
    let salida = texto.replace(RE_CLAVE_ASIGNADA, "$1$2[oculto]");
    salida = salida.replace(RE_BEARER, "$1$2[oculto]");
    salida = salida.replace(RE_HEX_LARGO, "[oculto]");
    salida = salida.replace(RE_BASE64_LARGO, "[oculto]");
    return salida;
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

const RE_WIKI = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const RE_MD_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const RE_PROTOCOLO = /^[a-z][a-z0-9+.-]*:\/\//i;
const RE_OLA = /\bOla\s+(p?\d{2,4}[A-Za-z0-9]*)\b/gi;
const RE_TOKEN = /\b[A-Za-z][A-Za-z0-9]{1,8}\b/g;

/** Cierto si un texto tiene la forma de un id de tarea (`p318Jb`, `X4F2`, `AS1`…) o de una referencia a ola (`Ola 318`). */
export function esIdDeTarea(token: string): boolean {
    const t = (token || "").trim();
    if (!t) return false;
    if (/^Ola\s+\S+/i.test(t)) return true;
    return /^[A-Za-z][A-Za-z0-9]{1,8}$/.test(t) && /[0-9]/.test(t) && /[A-Za-z]/.test(t);
}

/** Extrae ids de tarea (`p318Jb`) y referencias a ola (`Ola 318`) de un texto libre. PURA. */
export function extraerIdsTarea(texto: string): string[] {
    if (!texto) return [];
    const ids = new Set<string>();
    for (const m of texto.matchAll(RE_OLA)) ids.add(`Ola ${m[1]}`);
    for (const m of texto.matchAll(RE_TOKEN)) {
        const tok = m[0];
        if (/[0-9]/.test(tok) && /[A-Za-z]/.test(tok)) ids.add(tok);
    }
    return [...ids];
}

/**
 * Todos los vínculos de un texto: `[[wiki]]`, enlaces markdown internos
 * (sin esquema `http(s)://`, no anclas sueltas `#...`) e ids de tarea/ola.
 * Deduplicado y acotado a `limite` para no arrastrar textos enormes.
 */
export function extraerVinculos(texto: string, limite = 50): string[] {
    if (!texto) return [];
    const vinculos = new Set<string>();

    for (const m of texto.matchAll(RE_WIKI)) {
        const t = m[1]?.trim();
        if (t) vinculos.add(t);
    }
    for (const m of texto.matchAll(RE_MD_LINK)) {
        const url = m[1]?.trim();
        if (!url || url.startsWith("#") || RE_PROTOCOLO.test(url)) continue;
        vinculos.add(url);
    }
    for (const id of extraerIdsTarea(texto)) vinculos.add(id);

    return [...vinculos].slice(0, Math.max(0, limite));
}

// ─── Título, resumen y tamaño ───────────────────────────────────────────────

/** Recorta un texto a `maximo` caracteres añadiendo una elipsis. PURA. */
export function recortarTexto(texto: string, maximo: number): string {
    if (!texto) return texto ?? "";
    if (texto.length <= maximo) return texto;
    return `${texto.slice(0, Math.max(0, maximo - 1)).trimEnd()}…`;
}

/** El primer encabezado `#`/`##` del markdown, o `nombreAlterno` si no hay ninguno. PURA. */
export function extraerTitulo(texto: string, nombreAlterno: string): string {
    const cabeza = (texto || "").split("\n").find((l) => /^#{1,2}\s+\S/.test(l.trim()));
    if (cabeza) return cabeza.replace(/^#{1,2}\s+/, "").trim();
    return nombreAlterno;
}

/** Primeras líneas con contenido (sin encabezados vacíos ni rayas de separación), redactadas y recortadas. PURA. */
export function extraerResumen(texto: string, limite = 400): string {
    const lineas = (texto || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^[-=_*]{3,}$/.test(l));
    const cuerpo = lineas.slice(0, 6).join(" ").replace(/^#{1,6}\s+/, "");
    return recortarTexto(redactarTexto(cuerpo), limite);
}

/** «2» en vez de «2.0», pero «1.5» cuando de verdad hay decimal. */
function formateaUnidad(valor: number): string {
    const redondeado = Math.round(valor * 10) / 10;
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
}

/** Tamaño en bytes formateado a humano («1.5 KB», «3 MB»). PURA. */
export function formatoTamano(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${formateaUnidad(kb)} KB`;
    const mb = kb / 1024;
    return `${formateaUnidad(mb)} MB`;
}

// ─── Etiquetas ──────────────────────────────────────────────────────────────

/** Etiquetas derivadas de una memoria: extensión, si es externa (`~/...`), si se redactó y si menciona una tarea. PURA. */
export function etiquetasDe(info: { ruta: string; redactado?: boolean; vinculos: string[] }): string[] {
    const etiquetas: string[] = [];
    const ext = /\.([a-z0-9]+)$/i.exec(info.ruta)?.[1]?.toLowerCase();
    if (ext) etiquetas.push(ext);
    if (info.ruta.startsWith("~/")) etiquetas.push("externo");
    if (info.redactado) etiquetas.push("redactado");
    if (info.vinculos.some((v) => esIdDeTarea(v))) etiquetas.push("tarea");
    return etiquetas;
}

// ─── Capas: agrupar, filtrar, contar ────────────────────────────────────────

/** Agrupa una lista plana de archivos por su `capa`, en el orden fijo de `DEFINICION_CAPAS`. PURA. */
export function agruparPorCapa(archivos: readonly ArchivoMemoria[]): Record<IdCapa, ArchivoMemoria[]> {
    const grupos = Object.fromEntries(DEFINICION_CAPAS.map((c) => [c.id, [] as ArchivoMemoria[]])) as Record<
        IdCapa,
        ArchivoMemoria[]
    >;
    for (const a of archivos) {
        if (grupos[a.capa]) grupos[a.capa].push(a);
    }
    return grupos;
}

/** Construye las ocho `CapaMemoria` (con sus archivos) a partir de una lista plana. PURA. */
export function construirCapas(
    archivos: readonly ArchivoMemoria[],
    origenes: Partial<Record<IdCapa, string>> = {},
): CapaMemoria[] {
    const grupos = agruparPorCapa(archivos);
    return DEFINICION_CAPAS.map((def) => ({
        ...def,
        origen: origenes[def.id] ?? "",
        archivos: grupos[def.id] ?? [],
    }));
}

/** Cuenta de archivos por capa (para la cabecera del panel). PURA. */
export function contarPorCapa(capas: readonly CapaMemoria[]): Record<string, number> {
    const cuentas: Record<string, number> = {};
    for (const c of capas) cuentas[c.id] = c.archivos.length;
    return cuentas;
}

/** Los archivos de OTRAS capas que mencionan una tarea o una ola: la capa virtual «Recuerdos por tarea». PURA. */
export function seleccionarRecuerdosDeTarea(archivos: readonly ArchivoMemoria[]): ArchivoMemoria[] {
    return archivos.filter((a) => a.vinculos.some((v) => esIdDeTarea(v)));
}

/**
 * Los `limite` archivos reales (no sintéticos) más recientes por `actualizado`,
 * SIN repetir una misma `ruta` — una memoria que vive a la vez en «Proyecto» y
 * en «Aprendizajes» (mismo archivo, dos lentes) cuenta una sola vez aquí. PURA.
 */
export function masRecientes(archivos: readonly ArchivoMemoria[], limite = 20): ArchivoMemoria[] {
    const tope = Math.max(0, limite);
    if (tope === 0) return [];
    const ordenados = [...archivos]
        .filter((a) => !a.sintetico && a.actualizado)
        .sort((a, b) => (a.actualizado < b.actualizado ? 1 : a.actualizado > b.actualizado ? -1 : 0));
    const vistos = new Set<string>();
    const resultado: ArchivoMemoria[] = [];
    for (const a of ordenados) {
        if (vistos.has(a.ruta)) continue;
        vistos.add(a.ruta);
        resultado.push(a);
        if (resultado.length >= tope) break;
    }
    return resultado;
}

// ─── Índice, grafo y backlinks ──────────────────────────────────────────────

/** Normaliza una clave para comparar rutas/títulos sin tildes, mayúsculas ni extensión. */
function normalizarClave(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\.(md|json)$/i, "")
        .replace(/^\.\/?/, "")
        .trim();
}

/** Índice ruta-completa/nombre-de-archivo/título → ruta, para resolver vínculos. PURA. */
export function construirIndice(archivos: readonly Pick<ArchivoMemoria, "ruta" | "titulo">[]): Map<string, string> {
    const indice = new Map<string, string>();
    for (const a of archivos) {
        const basename = a.ruta.split("/").pop() ?? a.ruta;
        for (const clave of [a.ruta, basename, a.titulo]) {
            const k = normalizarClave(clave);
            if (k && !indice.has(k)) indice.set(k, a.ruta);
        }
    }
    return indice;
}

/** Resuelve un vínculo (texto de `[[wiki]]`, ruta de enlace md, o id) contra el índice. `null` si no coincide con ninguna memoria conocida. PURA. */
export function resolverVinculo(vinculo: string, indice: ReadonlyMap<string, string>): string | null {
    const clave = normalizarClave(vinculo);
    return indice.get(clave) ?? null;
}

/** Resuelve una lista de vínculos contra el índice, para pintarlos como navegables o no. PURA. */
export function resolverVinculos(vinculos: readonly string[], indice: ReadonlyMap<string, string>): VinculoResuelto[] {
    return vinculos.map((texto) => ({ texto, ruta: resolverVinculo(texto, indice) }));
}

/**
 * El grafo memorias→memorias: nodos = archivos (deduplicados por `ruta` — una
 * memoria vista desde dos capas es UN nodo), aristas = vínculos que SÍ
 * resuelven a otra memoria conocida. PURA.
 */
export function construirGrafo(archivos: readonly ArchivoMemoria[]): GrafoMemoria {
    const indice = construirIndice(archivos);
    const vistosNodos = new Set<string>();
    const nodos: NodoGrafoMemoria[] = [];
    for (const a of archivos) {
        if (vistosNodos.has(a.ruta)) continue;
        vistosNodos.add(a.ruta);
        nodos.push({ id: a.ruta, titulo: a.titulo, capa: a.capa });
    }
    const aristas: AristaGrafoMemoria[] = [];
    const vistas = new Set<string>();
    for (const a of archivos) {
        for (const v of a.vinculos) {
            const destino = resolverVinculo(v, indice);
            if (!destino || destino === a.ruta) continue;
            const clave = `${a.ruta}\u0000${destino}`;
            if (vistas.has(clave)) continue;
            vistas.add(clave);
            aristas.push({ origen: a.ruta, destino });
        }
    }
    return { nodos, aristas };
}

/** destino → [orígenes que lo mencionan] («Mencionado por» del panel). PURA. */
export function construirBacklinks(grafo: GrafoMemoria): Map<string, string[]> {
    const mapa = new Map<string, string[]>();
    for (const arista of grafo.aristas) {
        const lista = mapa.get(arista.destino) ?? [];
        lista.push(arista.origen);
        mapa.set(arista.destino, lista);
    }
    return mapa;
}

// ─── Búsqueda ───────────────────────────────────────────────────────────────

/** Normaliza para buscar sin tildes ni mayúsculas. PURA. */
export function normalizarBusqueda(texto: string): string {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Puntúa una memoria frente a una consulta: título pesa más que ruta, que
 * pesa más que resumen. `0` = no coincide. Case/acento-insensible. PURA.
 */
export function puntuarBusqueda(
    archivo: Pick<ArchivoMemoria, "titulo" | "resumen" | "ruta">,
    consulta: string,
): number {
    const q = normalizarBusqueda(consulta.trim());
    if (!q) return 0;
    let puntos = 0;
    if (normalizarBusqueda(archivo.titulo).includes(q)) puntos += 5;
    if (normalizarBusqueda(archivo.ruta).includes(q)) puntos += 3;
    if (normalizarBusqueda(archivo.resumen).includes(q)) puntos += 1;
    return puntos;
}

/** Filtra y ordena por relevancia descendente; consulta vacía devuelve la lista tal cual. PURA. */
export function buscarArchivos<T extends Pick<ArchivoMemoria, "titulo" | "resumen" | "ruta">>(
    archivos: readonly T[],
    consulta: string,
): T[] {
    const q = (consulta || "").trim();
    if (!q) return [...archivos];
    return archivos
        .map((a) => ({ a, p: puntuarBusqueda(a, q) }))
        .filter((x) => x.p > 0)
        .sort((x, y) => y.p - x.p)
        .map((x) => x.a);
}

/** Aplica `buscarArchivos` dentro de cada capa (para `?q=` y para el filtro del panel). PURA. */
export function filtrarCapasPorBusqueda(capas: readonly CapaMemoria[], consulta: string): CapaMemoria[] {
    const q = (consulta || "").trim();
    if (!q) return [...capas];
    return capas.map((c) => ({ ...c, archivos: buscarArchivos(c.archivos, q) }));
}

// ─── Rutas seguras ──────────────────────────────────────────────────────────

/**
 * Verdadero si una ruta (relativa al repo, o pseudo-ruta `~/...`) es segura
 * de aceptar como parámetro de cliente: sin `..`, sin nulos, sin ruta
 * absoluta del disco (`/etc/passwd`, `C:\...`). PURA — no comprueba que el
 * archivo EXISTA ni que esté dentro de una raíz concreta; eso lo hace el
 * servidor buscándola en el catálogo ya construido.
 */
export function rutaSegura(ruta: string): boolean {
    if (typeof ruta !== "string") return false;
    if (ruta.length === 0 || ruta.length > 512) return false;
    if (ruta.includes("\0")) return false;
    const normal = ruta.replace(/\\/g, "/");
    if (/^[a-zA-Z]:\//.test(normal)) return false; // C:/...
    if (normal.startsWith("/")) return false; // ninguna ruta catalogada empieza por "/": ni relativa al repo ni "~/..."
    if (normal.split("/").some((seg) => seg === "." || seg === "..")) return false;
    return true;
}
