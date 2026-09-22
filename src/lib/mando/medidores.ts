// src/lib/mando/medidores.ts
// -----------------------------------------------------------------------------
// Qué hay DETRÁS de cada medidor de la cabecera y qué se puede hacer con ello.
//
// POR QUÉ (2026-09-15). Los medidores decían un número y te dejaban solo: «23
// bloqueadas» y a buscarte la vida. Alex pidió que cada uno se abra y enseñe
// cuáles son, por qué, y con qué acciones — descartar, reintentar describiendo
// el cambio, publicar.
//
// Todo lo que decide vive AQUÍ y es puro. La interfaz no repite ni una regla:
// si mañana cambia qué se puede descartar, se cambia en un sitio y no en cinco.
// -----------------------------------------------------------------------------

import { ETAPAS, etapaDeFase } from "@/lib/mando/etapas";
import { obtenerIdsBloqueados, type FilaContable } from "@/lib/mando/conteo-operativo";

export type ClaveMedidor =
    | "en-curso"
    | "agentes"
    | "listas"
    | "bloqueadas"
    | "sin-publicar"
    | "proveedores"
    | "contenedores"
    | "memoria"
    | "disco"
    | "ola-activa";

export type ClaseAccion =
    | "descartar"
    | "descartar-todas"
    | "reintentar"
    | "publicar"
    | "ir-a"
    // (2026-09-22) Los contenedores de nube: volver a sondear todos los servicios, y
    // desplegar agentes en uno concreto. Alex los pidió a mano desde la ventana.
    | "sondear-contenedores"
    | "desplegar-nube";

export interface AccionMedidor {
    clase: ClaseAccion;
    texto: string;
    /** Pestaña del Mando para `ir-a`. */
    destino?: string;
    /** Rojo + confirmación en dos pasos. Nunca se omite en algo que borra. */
    destructiva: boolean;
    /** Si está, la acción pide texto antes de poder enviarse. */
    pideTexto?: string;
}

export interface FilaMedidor {
    id: string;
    titulo: string;
    estado?: string;
    /** Avance 0-100 de ESA tarea por el camino de seis etapas. Solo donde significa algo:
     *  en curso, agentes y listas. En «bloqueadas» o «sin publicar» no se pone, porque un
     *  porcentaje ahí sería inventado. */
    porcentaje?: number;
    /** En qué etapa del camino va, con el nombre que usa `etapas.ts`. */
    etapa?: string;
    /** En castellano y en una frase: por qué esta fila está donde está. */
    porque?: string;
    desde?: string;
    quien?: string;
    enlace?: string;
    acciones: AccionMedidor[];
    /** True si pertenece a una ola cerrada (histórica), false o undefined si es operativa. */
    historica?: boolean;
    /** (2026-09-22) Ficha ampliada de la fila: pares etiqueta/valor con enlace opcional.
     *  Alex pidió ver, de cada agente, los archivos y el entorno en que trabaja, el modelo,
     *  su enrutado y su historial; y de cada tarea, lo equivalente para su función. Va como
     *  lista genérica y no como campos fijos porque cada medidor tiene cosas distintas que
     *  contar, y porque así una ficha nueva no obliga a tocar el tipo otra vez. */
    ficha?: DatoDeFicha[];
    /** Historial de acciones, lo más reciente primero. */
    historial?: SucesoDeFila[];
}

export interface DatoDeFicha {
    etiqueta: string;
    valor: string;
    /** Enlace externo (GitHub) o interno del Mando. Opcional: muchos datos no llevan. */
    enlace?: string;
    /** Para pintar en rojo lo que merece mirarse. */
    aviso?: boolean;
}

export interface SucesoDeFila {
    t: string;
    de: string;
    texto: string;
}

export interface DetalleMedidor {
    clave: ClaveMedidor;
    titulo: string;
    resumen: string;
    filas: FilaMedidor[];
    acciones: AccionMedidor[];
    /** Media del avance de las filas que lo tienen, para la cabecera del panel. */
    porcentajeMedio?: number;
    /** Qué decir cuando no hay filas. Nunca una lista en blanco y muda. */
    vacio?: string;
    /** Número de tareas en la sección histórica de olas cerradas. */
    historicas?: number;
}

/** Estados que ya terminaron: nada de lo que hay aquí se descarta ni se reintenta. */
export const TERMINALES = new Set(["commit", "hecho"]);

/**
 * Avance 0-100 de una tarea por el camino de seis etapas de `etapas.ts`.
 *
 * Se reutiliza ese camino a propósito: es el mismo que dibuja la barra de fases en
 * Procesos. Con dos escalas distintas, el mismo agente diría 50 % en un sitio y 33 %
 * en otro, y volveríamos a tener dos verdades sobre el mismo hecho.
 */
export function avanceDe(fase: string | undefined, estado: string | undefined): { porcentaje: number; etapa?: string } {
    const etapa = etapaDeFase(fase ?? "", estado ?? null);
    // Sin fase reconocible el trabajo aún no ha empezado: 0 %, no «desconocido».
    if (!etapa) return { porcentaje: 0 };
    const indice = ETAPAS.indexOf(etapa);
    return { porcentaje: Math.round(((indice + 1) / ETAPAS.length) * 100), etapa };
}

// -----------------------------------------------------------------------------
// Avance que SÍ se mueve dentro de la etapa (p324A · 2026-09-16)
// -----------------------------------------------------------------------------

const ETAPAS_CAMINO = ["escribiendo", "verificando", "probando", "revisando", "visto bueno", "integrada"] as const;

/** Segundos típicos por etapa (de los topes de atasco en etapas.ts). */
const TIEMPO_TIPICO_SEG: Record<string, number> = {
    escribiendo: 25 * 60,
    verificando: 20 * 60,
    probando: 20 * 60,
    revisando: 15 * 60,
    "visto bueno": 20 * 60,
    integrada: 0,
};

export interface DatosAvance {
    etapa: string;
    segundosEnEtapa: number;
    porcentajePrevio?: number;
    /** El «ahora» entra como parámetro: la función nunca mira el reloj del sistema. */
    ahora?: number;
}

/**
 * Porcentaje combinado: base de etapa + fracción dentro de la etapa según
 * segundos transcurridos frente a un tiempo típico. Puro: sin fechas del
 * sistema, sin disco, sin red.
 */
export function avanceCombinado(datos: DatosAvance): number {
    const indice = ETAPAS_CAMINO.indexOf(datos.etapa as (typeof ETAPAS_CAMINO)[number]);
    if (indice === -1) return datos.porcentajePrevio ?? 0;
    if (datos.etapa === "integrada") return 100;

    const base = Math.round(((indice + 1) / ETAPAS_CAMINO.length) * 100);
    const siguienteBase = Math.round(((indice + 2) / ETAPAS_CAMINO.length) * 100);

    const tipico = TIEMPO_TIPICO_SEG[datos.etapa] ?? 0;
    let fraccion = 0;
    if (tipico > 0 && datos.segundosEnEtapa > 0) {
        fraccion = Math.min(datos.segundosEnEtapa / tipico, 1);
    }

    // Nunca más allá del inicio de la etapa siguiente: la fracción no supera 1.
    let rango = siguienteBase - base;
    // La última etapa antes de integrada nunca llega al 100 % antes de tiempo.
    if (datos.etapa === "visto bueno") rango = rango * 0.99;

    let porcentaje = base + Math.round(fraccion * rango);

    // Nunca retroceder.
    if (datos.porcentajePrevio !== undefined && porcentaje < datos.porcentajePrevio) {
        porcentaje = datos.porcentajePrevio;
    }
    // Nunca llegar al 100 % antes de estar integrada.
    if (datos.etapa !== "integrada" && porcentaje >= 100) porcentaje = 99;

    return porcentaje;
}

/** Media redondeada del avance de las filas que lo traen; 0 si ninguna lo trae. */
export function mediaDeAvance(filas: FilaMedidor[]): number {
    const conAvance = filas.filter((f) => typeof f.porcentaje === "number");
    if (conAvance.length === 0) return 0;
    return Math.round(conAvance.reduce((t, f) => t + (f.porcentaje ?? 0), 0) / conAvance.length);
}

/**
 * Agentes que caben ahora mismo en los contenedores de nube, según lo MEDIDO.
 *
 * PURA. Vale 0 cuando no hay inventario, y eso es a propósito: ofrecer «desplegar más
 * agentes» sin haber medido sitio sería prometer capacidad que nadie ha comprobado.
 */
export function libresDeContenedores(inv: DatosMedidores["contenedores"]): number {
    const n = inv?.resumen?.agentes_libres;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

const IR_A = (texto: string, destino: string): AccionMedidor => ({
    clase: "ir-a",
    texto,
    destino,
    destructiva: false,
});

/**
 * Acciones legales para UNA tarea según su estado.
 *
 * La regla que no se negocia: lo que ya está en main no se descarta desde un
 * panel. Un clic de más no puede deshacer trabajo integrado.
 */
export function accionesDeTarea(estado: string | undefined): AccionMedidor[] {
    if (!estado || TERMINALES.has(estado)) return [];
    return [
        { clase: "descartar", texto: "Descartar", destructiva: true },
        {
            clase: "reintentar",
            texto: "Reintentar con un cambio",
            destructiva: false,
            pideTexto: "¿Qué hay que cambiar para que salga bien esta vez?",
        },
    ];
}

/** «dependencia no integrada: X (bloqueada)» → «X». */
export function dependenciaDeNota(nota: string | undefined): string[] {
    const m = /dependencia no integrada:\s*(.+)$/i.exec(nota ?? "");
    if (!m) return [];
    return m[1]
        .split(",")
        .map((t) => t.trim().replace(/\s*\(.*$/, ""))
        .filter(Boolean);
}

/**
 * Por qué está bloqueada esta tarea, dicho para una persona.
 *
 * El caso que importa: si su dependencia YA está integrada, la tarea no está
 * esperando nada — está esperando a que alguien se dé cuenta. Decirlo cambia lo
 * que haces con ella.
 */
/** Estados de los que una dependencia ya NO sale por sí sola: esperarla es esperar a nadie. */
const MUERTAS_DEP = new Set(["rechazada", "bloqueante", "descartada", "sustituida", "cancelada"]);

export function porqueBloqueada(
    nota: string | undefined,
    estadoDe: (id: string) => string | undefined,
): string {
    const deps = dependenciaDeNota(nota);
    if (deps.length === 0) return nota?.trim() || "bloqueada sin motivo anotado";
    const abiertas = deps.filter((d) => !TERMINALES.has(estadoDe(d) ?? ""));
    if (abiertas.length === 0) {
        return `${deps.join(", ")} ya está integrada: esto puede desbloquearse`;
    }
    return `espera a ${abiertas.join(", ")}`;
}

/**
 * La ficha de una BLOQUEADA: de qué espera, en qué estado está eso, y si la espera
 * puede resolverse alguna vez.
 *
 * (2026-09-22, Alex: «la informacion de las tareas bloqueadas aun no es coherente ni
 * esta completa») Antes la fila decía «espera a RM2» y ahí acababa. Eso no basta para
 * decidir nada: no dice qué es RM2, ni en qué estado está, ni —lo importante— si esa
 * espera es VIVA o MUERTA. Una dependencia rechazada no se va a integrar sola, y una que
 * no existe no se va a integrar nunca: las dos son bloqueos permanentes disfrazados de
 * paciencia. Nos costó diez horas de Mac parada el día 21 con `p318Jb` esperando a
 * `p318I`, que no existía en ninguna parte.
 */
export function fichaDeBloqueada(
    nota: string | undefined,
    estadoDe: (id: string) => string | undefined,
    titulo: (id: string) => string,
    entrada?: DatosMedidores["progreso"][string],
): { ficha: DatoDeFicha[]; veredicto: string; muerta: boolean } {
    const ficha: DatoDeFicha[] = [];
    const deps = dependenciaDeNota(nota);
    if (entrada?.estado) ficha.push({ etiqueta: "Estado", valor: entrada.estado });
    if (entrada?.t) ficha.push({ etiqueta: "Bloqueada desde", valor: entrada.t });

    if (deps.length === 0) {
        ficha.push({
            etiqueta: "Espera a",
            valor: "nada anotado",
            aviso: true,
        });
        return {
            ficha,
            veredicto: nota?.trim() || "bloqueada sin motivo anotado: nadie sabe qué espera",
            muerta: true,
        };
    }

    let vivas = 0;
    let muertas = 0;
    let fantasmas = 0;
    for (const dep of deps) {
        const est = estadoDe(dep);
        // Sin estado NO significa «va a llegar»: significa que nadie la ha ejecutado nunca.
        // Si además no figura en ninguna cola, es una dependencia fantasma.
        const esFantasma = est === undefined || est === "";
        const esMuerta = !esFantasma && MUERTAS_DEP.has(est);
        const esViva = !esFantasma && !esMuerta && !TERMINALES.has(est);
        if (esFantasma) fantasmas += 1;
        else if (esMuerta) muertas += 1;
        else if (esViva) vivas += 1;
        ficha.push({
            etiqueta: "Espera a",
            valor: `${dep} — ${titulo(dep) || "sin título"}`,
        });
        ficha.push({
            etiqueta: "↳ su estado",
            valor: esFantasma
                ? "NO EXISTE: ninguna ola la ha ejecutado nunca"
                : esMuerta
                  ? `${est} — no se va a integrar sola`
                  : TERMINALES.has(est)
                    ? `${est} — ya está: esto puede desbloquearse`
                    : est,
            aviso: esFantasma || esMuerta,
        });
    }

    const listas = deps.length - vivas - muertas - fantasmas;
    let veredicto: string;
    if (fantasmas) {
        veredicto = `espera a ${fantasmas} tarea(s) que NO EXISTEN: este bloqueo no se resuelve nunca`;
    } else if (muertas) {
        veredicto = `espera a ${muertas} tarea(s) que no se van a integrar solas: hay que reencolarlas o descartar esta`;
    } else if (vivas) {
        veredicto = `espera a ${vivas} tarea(s) que siguen vivas: es una espera normal`;
    } else if (listas) {
        veredicto = `${deps.join(", ")} ya está integrada: esto puede desbloquearse`;
    } else {
        veredicto = `espera a ${deps.join(", ")}`;
    }
    ficha.push({
        etiqueta: "Veredicto",
        valor: veredicto,
        aviso: Boolean(fantasmas || muertas),
    });
    return { ficha, veredicto, muerta: Boolean(fantasmas || muertas) };
}

/** Coincidencia histórica por palabra entera; no basta para afirmar integración. */
/** El enlace a una rama en GitHub, si sabemos de qué repo hablamos. */
export function enlaceDeRama(repo?: string, rama?: string): string | undefined {
    if (!repo || !rama) return undefined;
    return `https://github.com/${repo}/tree/${rama}`;
}

/** El enlace a un commit en GitHub. */
export function enlaceDeCommit(repo?: string, sha?: string): string | undefined {
    if (!repo || !sha) return undefined;
    return `https://github.com/${repo}/commit/${sha}`;
}

/**
 * La ficha de un AGENTE: quién es, dónde trabaja y por dónde ha pasado.
 *
 * (2026-09-22, pedido por Alex) «los agentes deben mostrar más información de cada uno
 * incluyendo los archivos y entornos que está en desarrollo e información de los modelos
 * usados y sus tokens y los enrutamientos del agente y su historial».
 *
 * Todo lo de aquí sale de algo medido. Lo que NO tenemos se dice que no lo tenemos, en vez
 * de rellenarlo: los agentes corren por `opencode` y `codex`, que no nos devuelven su
 * cuenta de tokens, así que el gasto del agente se mide hoy en BYTES ESCRITOS y en tiempo.
 * Inventar un número de tokens sería justo la clase de dato falso que llevamos días
 * quitando del Puente.
 */
export function fichaDeAgente(
    l: DatosMedidores["latidos"][number],
    entrada: DatosMedidores["progreso"][string] | undefined,
    obra: { rama?: string; archivos?: string[]; ruta?: string } | undefined,
    repo?: string,
): DatoDeFicha[] {
    const ficha: DatoDeFicha[] = [];
    const proveedor = l.proveedor ?? l.modelo.split("/")[0];
    ficha.push({ etiqueta: "Modelo", valor: l.modelo });
    ficha.push({ etiqueta: "Proveedor", valor: proveedor });
    ficha.push({
        etiqueta: "Entorno",
        valor: l.donde === "mac" ? "Mac de Alex (local)" : l.donde,
    });
    if (l.medio) ficha.push({ etiqueta: "Medio", valor: l.medio });
    if (l.cola) ficha.push({ etiqueta: "Cola", valor: l.cola });
    ficha.push({ etiqueta: "Trabaja en", valor: l.tarea });
    ficha.push({ etiqueta: "Fase", valor: l.fase });
    if (typeof entrada?.intento === "number" && entrada.intento > 1) {
        ficha.push({ etiqueta: "Intento", valor: `${entrada.intento}º`, aviso: true });
    }

    // El entorno de desarrollo real: su worktree y su rama.
    if (obra?.ruta) ficha.push({ etiqueta: "Worktree", valor: obra.ruta });
    if (obra?.rama) {
        ficha.push({ etiqueta: "Rama", valor: obra.rama, enlace: enlaceDeRama(repo, obra.rama) });
    }
    const archivos = obra?.archivos ?? [];
    if (archivos.length) {
        ficha.push({ etiqueta: "Archivos que toca", valor: `${archivos.length}` });
        for (const a of archivos.slice(0, 8)) ficha.push({ etiqueta: "·", valor: a });
        if (archivos.length > 8) {
            ficha.push({ etiqueta: "·", valor: `y ${archivos.length - 8} más` });
        }
    } else {
        ficha.push({
            etiqueta: "Archivos que toca",
            valor: "ninguno todavía",
            aviso: l.fase === "escribiendo",
        });
    }

    // El enrutado: por qué modelos pasó antes de este.
    const fallidos = entrada?.modelos_fallidos ?? [];
    if (fallidos.length) {
        ficha.push({
            etiqueta: "Enrutado",
            valor: `${fallidos.length} modelo(s) antes de este`,
            aviso: fallidos.length >= 3,
        });
        for (const m of fallidos.slice(0, 6)) ficha.push({ etiqueta: "↳ no pudo", valor: m });
    } else {
        ficha.push({ etiqueta: "Enrutado", valor: "entró al primero" });
    }

    // Lo que gasta. Tokens NO: quien los sabría es opencode/codex y no nos los devuelve.
    const escritos = bytesLegibles(l.bytesLog);
    ficha.push({ etiqueta: "Escrito", valor: escritos ?? "nada aún" });
    ficha.push({ etiqueta: "Lleva", valor: `${l.minutos} min` });
    if (typeof l.quietoSegundos === "number") {
        const min = Math.round(l.quietoSegundos / 60);
        ficha.push({
            etiqueta: "Sin escribir desde",
            valor: min < 1 ? "ahora mismo" : `${min} min`,
            aviso: l.quietoSegundos > 180,
        });
    }
    ficha.push({
        etiqueta: "Tokens",
        valor: "no los publica su motor (opencode/codex); se mide por bytes y tiempo",
    });
    return ficha;
}

/**
 * La ficha de una TAREA: qué tiene que hacer, con qué, y cómo va.
 *
 * Lo mismo que la del agente pero por el otro lado: aquí el sujeto es el trabajo. Lo que
 * más falta hacía es comparar lo que la tarea DECLARÓ que iba a tocar con lo que está
 * tocando de verdad: esa diferencia es la que nos ha costado horas toda la semana.
 */
export function fichaDeTarea(
    id: string,
    entrada: DatosMedidores["progreso"][string] | undefined,
    declarados: string[] | undefined,
    obra: { rama?: string; archivos?: string[]; ruta?: string } | undefined,
    repo?: string,
    latido?: DatosMedidores["latidos"][number],
): DatoDeFicha[] {
    const ficha: DatoDeFicha[] = [];
    ficha.push({ etiqueta: "Estado", valor: entrada?.estado ?? "sin empezar" });
    if (latido) {
        ficha.push({ etiqueta: "Fase", valor: latido.fase });
        ficha.push({ etiqueta: "La escribe", valor: latido.modelo });
        ficha.push({
            etiqueta: "Dónde",
            valor: latido.donde === "mac" ? "Mac de Alex (local)" : latido.donde,
        });
    } else if (entrada?.modelo && entrada.modelo !== "-") {
        ficha.push({ etiqueta: "Último modelo", valor: entrada.modelo });
    }

    const dec = declarados ?? [];
    const tocados = obra?.archivos ?? [];
    if (dec.length) {
        ficha.push({ etiqueta: "Archivos declarados", valor: `${dec.length}` });
        for (const a of dec.slice(0, 8)) {
            // Lo que se declaró y no se ha tocado se marca: es la causa de rechazo más
            // frecuente, y verla a tiempo evita perder una hora de agente.
            const tocado = tocados.some((t) => t === a || t.endsWith(a) || a.endsWith(t));
            ficha.push({
                etiqueta: tocado ? "✓" : "·",
                valor: a,
                aviso: !tocado && tocados.length > 0,
            });
        }
    }
    if (tocados.length) {
        const extra = tocados.filter((t) => !dec.some((a) => a === t || t.endsWith(a)));
        if (extra.length) {
            ficha.push({
                etiqueta: "Toca sin declarar",
                valor: extra.slice(0, 5).join(", "),
                aviso: true,
            });
        }
    }
    if (entrada?.faltan?.length) {
        ficha.push({ etiqueta: "Alcance", valor: `faltan ${entrada.faltan.join(", ")}`, aviso: true });
    }

    if (obra?.rama ?? entrada?.rama) {
        const rama = obra?.rama ?? entrada?.rama;
        ficha.push({ etiqueta: "Rama", valor: rama!, enlace: enlaceDeRama(repo, rama) });
    }
    if (entrada?.sha) {
        ficha.push({
            etiqueta: "Commit",
            valor: entrada.sha.slice(0, 8),
            enlace: enlaceDeCommit(repo, entrada.sha),
        });
    }
    if (entrada?.revisor) {
        ficha.push({
            etiqueta: "Revisión",
            valor: entrada.revisor,
            aviso: entrada.revisor === "bloqueante",
        });
    }
    if (entrada?.motivo_vb) ficha.push({ etiqueta: "Motivo", valor: entrada.motivo_vb });
    if (typeof entrada?.segundos === "number" && entrada.segundos > 0) {
        ficha.push({ etiqueta: "Tiempo de agente", valor: `${Math.round(entrada.segundos / 60)} min` });
    }
    const fallidos = entrada?.modelos_fallidos ?? [];
    if (fallidos.length) {
        ficha.push({ etiqueta: "Modelos que no pudieron", valor: fallidos.slice(0, 6).join(", ") });
    }
    if (entrada?.nota) ficha.push({ etiqueta: "Nota", valor: entrada.nota });
    return ficha;
}

/** Bytes de log escritos, en palabras. Es la prueba de que un agente esta vivo de verdad. */
export function bytesLegibles(bytes?: number): string | undefined {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return undefined;
    const n = Number(bytes);
    if (n < 1024) return `${n} B escritos`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB escritos`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB escritos`;
}

export function idEnAsuntos(id: string, asuntos: string): boolean {
    if (!id) return false;
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9])${escapado}([^A-Za-z0-9]|$)`, "m").test(asuntos);
}

/**
 * La misma marca de integración que reconoce el vigilante: el id debe ir al
 * inicio del asunto o después de `·`, y justo antes de `:`. Una mención suelta
 * en un asunto de reparto no demuestra que la tarea esté integrada.
 */
export function idIntegradoEnAsuntos(id: string, asuntos: string): boolean {
    if (!id) return false;
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patron = new RegExp(`(?:^|·\\s*)${escapado}\\s*:`);
    return asuntos.split(/\r?\n/).some((asunto) => patron.test(asunto));
}

/** Estados con los que el vigilante NO relanza nada solo: aquí tampoco cuentan como listas. */
const ABIERTOS = new Set(["pendiente", ""]);

/**
 * Las que el enjambre cogería AHORA si se le suelta. Es la misma regla que
 * `scripts/puente/vigilante_logica.seleccionar_pendientes`, y tiene que serlo: si
 * aquí se usara otra, el medidor diría 78 listas mientras el vigilante coge 4, y
 * no habría forma de saber cuál de los dos miente.
 *
 * Tres filtros, los tres del vigilante:
 *   1. solo colas FUENTE — `cola-auto-*` son copias de ejecución que el propio
 *      enjambre genera al relanzar, no demanda nueva;
 *   2. sin estado que lo impida (bloqueada, rechazada, commit… no se relanzan);
 *   3. fuera lo que ya figura en un commit de `main`, aunque nadie actualizara su
 *      estado. Eso es lo que inflaba la cuenta: 74 tareas de olas viejas, hechas y
 *      publicadas hace semanas, sin entrada en progreso.json.
 */
export function ejecutablesDeColas(
    colas: { id: string; titulo?: string; ola?: string; cola?: string }[],
    progreso: Record<string, { estado?: string } | undefined>,
    asuntosDeMain: string,
): { id: string; titulo: string; ola?: string }[] {
    const vistos = new Set<string>();
    const salida: { id: string; titulo: string; ola?: string }[] = [];
    for (const t of colas) {
        if (!t.id || vistos.has(t.id)) continue;
        if ((t.cola ?? "").startsWith("auto-")) continue;
        vistos.add(t.id);
        if (!ABIERTOS.has(progreso[t.id]?.estado ?? "")) continue;
        if (idIntegradoEnAsuntos(t.id, asuntosDeMain)) continue;
        salida.push({ id: t.id, titulo: t.titulo ?? "", ola: t.ola });
    }
    return salida;
}

export interface DatosMedidores {
    progreso: Record<
        string,
        {
            estado?: string;
            nota?: string;
            t?: string;
            modelo?: string;
            /** Los modelos que se probaron ANTES del que trabajó: el rastro del enrutado. */
            modelos_fallidos?: string[];
            segundos?: number;
            rama?: string;
            sha?: string;
            revisor?: string;
            motivo_vb?: string;
            faltan?: string[];
            intento?: number;
        }
    >;
    titulos: Record<string, string>;
    /** (2026-09-21) `quietoSegundos`, `bytesLog`, `cola` y `medio` los leia ya
     *  `leerLatidos` y la ruta los tiraba, asi que el medidor de agentes no tenia con que
     *  distinguirse del de tareas. Sin ellos no se puede decir si un agente escribe o
     *  lleva rato callado, que es la unica pregunta interesante sobre un agente. */
    latidos: {
        tarea: string;
        fase: string;
        modelo: string;
        minutos: number;
        donde: string;
        proveedor?: string;
        quietoSegundos?: number;
        bytesLog?: number;
        cola?: string;
        medio?: string;
    }[];
    /**
     * Inventario de contenedores en la nube, tal como lo escribe
     * `scripts/puente/contenedores_nube.py` en `mando/contenedores.json`.
     *
     * (2026-09-22) Alex: «debe incluir toda la información de cada servicio y proveedor de
     * los contenedores en la nube disponibles para que los directores de los agentes
     * también usen esa información para enrutar procesos». Es el MISMO archivo que lee el
     * director de la nube para decidir dónde desplegar: la pantalla y la decisión salen
     * del mismo sitio, que es justo lo que antes no pasaba (el director llevaba sus topes
     * escritos a mano).
     */
    contenedores?: {
        generado?: string;
        contenedores: {
            id: string;
            servicio: string;
            proveedor: string;
            estado: string;
            maquina: string;
            jobs_simultaneos: number;
            agentes_por_job: number;
            agentes_ahora: number;
            runs_ahora: number;
            agentes_libres: number;
            coste: string;
            detalle: string;
            falta: string;
            siguiente_paso: string;
            lanza: string;
            desplegable: boolean;
        }[];
        resumen?: {
            contenedores?: number;
            usables?: number;
            agentes_ahora?: number;
            agentes_libres?: number;
            agentes_tope?: number;
            por_hacer?: number;
        };
    } | null;
    commitsSinPublicar: { sha: string; asunto: string; fecha?: string }[];
    ejecutables: { id: string; titulo: string; ola?: string }[];
    /** Asuntos recientes de `main`; ausente si Git no pudo leerse. */
    asuntosDeMain?: string | null;
    proveedores: { id: string; estado: string; motivo?: string }[];
    olaActiva?: string;
    /** ¿Hay orquestador vivo? ¿Está el enjambre en pausa? Sin esto, «13 listas y 0 agentes»
     *  no se puede explicar, y un número sin explicación parece una avería aunque no lo sea. */
    enjambreVivo?: boolean;
    enjambrePausado?: boolean;
    disco?: { libreGb: number; usadoPct: number };
    memoria?: { libreMb: number; swapMb: number };
    /** (2026-09-22) Lo que cada tarea viva está tocando AHORA en su worktree, y su
     *  historial de mensajes. Lo lee la ruta (toca disco) y aquí solo se pinta. */
    obras?: Record<string, { rama?: string; archivos?: string[]; ruta?: string }>;
    historiales?: Record<string, SucesoDeFila[]>;
    /** Archivos que la cola DECLARÓ para cada tarea, para poder comparar con los tocados. */
    declarados?: Record<string, string[]>;
    /** Dueño del repo en GitHub, para poder enlazar ramas y commits. */
    repoGitHub?: string;
    /** Fila operativa opcional de tareas activas en colas. */
    fila?: FilaContable[];
}

const vacios: DatosMedidores = {
    progreso: {},
    titulos: {},
    latidos: [],
    commitsSinPublicar: [],
    ejecutables: [],
    proveedores: [],
};

/** El detalle completo de un medidor: filas, porqués y acciones. */
export function detalleDeMedidor(
    clave: ClaveMedidor,
    datos: Partial<DatosMedidores>,
    ahora?: number,
): DetalleMedidor {
    const d = { ...vacios, ...datos };
    const estadoDe = (id: string) => d.progreso[id]?.estado;
    const titulo = (id: string) => d.titulos[id] || id;

    switch (clave) {
        case "bloqueadas": {
            const idsBloqueadosOperativos = d.fila
                ? obtenerIdsBloqueados(d.fila, d.latidos)
                : null;

            const todasBloqueadasProgreso = Object.entries(d.progreso)
                .filter(([, v]) => v?.estado === "bloqueada" || v?.estado === "bloqueante");

            const filasOperativas: FilaMedidor[] = [];
            const filasHistoricas: FilaMedidor[] = [];

            if (idsBloqueadosOperativos !== null && d.fila) {
                const idsProgresoProcesados = new Set<string>();

                for (const [id, v] of todasBloqueadasProgreso) {
                    if (idsBloqueadosOperativos.has(id)) {
                        idsProgresoProcesados.add(id);
                        const b =
                            v.estado === "bloqueante"
                                ? null
                                : fichaDeBloqueada(v.nota, estadoDe, titulo, v);
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                            porque:
                                v.estado === "bloqueante"
                                    ? "agotó los reintentos gratuitos: necesita una persona"
                                    : (b?.veredicto ?? porqueBloqueada(v.nota, estadoDe)),
                            desde: v.t,
                            ficha: b?.ficha,
                            historial: d.historiales?.[id]?.slice(0, 4),
                            acciones: accionesDeTarea(v.estado),
                            historica: false,
                        });
                    } else if (!d.fila.some((t) => t.id === id)) {
                        filasHistoricas.push({
                            id,
                            titulo: titulo(id),
                            estado: `${v.estado} (ola cerrada)`,
                            porque:
                                v.estado === "bloqueante"
                                    ? "de ola cerrada · agotó reintentos"
                                    : `de ola cerrada · ${porqueBloqueada(v.nota, estadoDe)}`,
                            desde: v.t,
                            acciones: accionesDeTarea(v.estado),
                            historica: true,
                        });
                    }
                }

                for (const id of idsBloqueadosOperativos) {
                    if (!idsProgresoProcesados.has(id)) {
                        const tareaFila = d.fila.find((t) => t.id === id);
                        const pend = tareaFila?.dependenciasPendientes ?? [];
                        // Misma ficha que las demás: se construye una nota con la forma que
                        // `dependenciaDeNota` entiende, para no tener DOS maneras de decir
                        // lo mismo (que es como llegamos a tres números distintos).
                        const b = pend.length
                            ? fichaDeBloqueada(`dependencia no integrada: ${pend.join(", ")}`, estadoDe, titulo, {
                                  estado: "bloqueada",
                              })
                            : null;
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado: b?.muerta ? "bloqueada sin salida" : "bloqueada",
                            porque: b?.veredicto ?? "bloqueada en cola activa, sin dependencia anotada",
                            ficha: b?.ficha,
                            historial: d.historiales?.[id]?.slice(0, 4),
                            acciones: accionesDeTarea("bloqueada"),
                            historica: false,
                        });
                    }
                }
            } else {
                // Camino de respaldo, sin cola activa que consultar. (2026-09-22) Aquí
                // faltaba la ficha, y por eso este camino daba MENOS información que el
                // otro para la misma tarea: una tercera manera de contar lo mismo, que es
                // exactamente el problema que estamos cerrando. Las dos ramas dicen ya lo
                // mismo; lo detectaron dos pruebas, no una revisión.
                for (const [id, v] of todasBloqueadasProgreso) {
                    const b =
                        v.estado === "bloqueante" ? null : fichaDeBloqueada(v.nota, estadoDe, titulo, v);
                    filasOperativas.push({
                        id,
                        titulo: titulo(id),
                        estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                        porque:
                            v.estado === "bloqueante"
                                ? "agotó los reintentos gratuitos: necesita una persona"
                                : (b?.veredicto ?? porqueBloqueada(v.nota, estadoDe)),
                        desde: v.t,
                        ficha: b?.ficha,
                        historial: d.historiales?.[id]?.slice(0, 4),
                        acciones: accionesDeTarea(v.estado),
                        historica: false,
                    });
                }
            }

            filasOperativas.sort((a, b) => a.id.localeCompare(b.id));
            filasHistoricas.sort((a, b) => a.id.localeCompare(b.id));

            const totalOperativas = filasOperativas.length;
            const totalHistoricas = filasHistoricas.length;
            const listas = filasOperativas.filter((f) => f.porque?.includes("puede desbloquearse")).length;
            // (2026-09-22) Las que esperan a algo que no va a llegar. Son las que hay que
            // mirar HOY: las demás se desbloquean solas cuando su dependencia termine.
            const sinSalida = filasOperativas.filter((f) => f.estado === "bloqueada sin salida").length;

            const todasFilas = [...filasOperativas, ...filasHistoricas];

            // (2026-09-22, Alex: «aparece diferente numero de tareas bloqueadas del medidor
            // a las bloqueadas y rechazadas de la ventana emergente»). Y es cierto, pero no
            // es el mismo dato: este medidor cuenta SOLO las que esperan a otra tarea
            // (`bloqueada`/`bloqueante`), y el panel de Ramificación cuenta además las
            // rechazadas, los fallos y las `sin_cambios`. Dos preguntas distintas con
            // etiquetas parecidas parecen una contradicción, así que aquí se dice EN VOZ
            // ALTA qué se está contando y dónde están las otras.
            let resumenText = "";
            if (totalOperativas === 0) {
                resumenText = totalHistoricas > 0 ? `0 esperando · ${totalHistoricas} de olas cerradas` : "nada esperando";
            } else {
                resumenText = `${totalOperativas} esperando a otra tarea${
                    sinSalida > 0 ? ` · ${sinSalida} SIN SALIDA` : ""
                }${listas > 0 ? ` · ${listas} ya pueden desbloquearse` : ""}${
                    totalHistoricas > 0 ? ` · ${totalHistoricas} de olas cerradas` : ""
                } · las rechazadas y los fallos van en Ramificación`;
            }

            return {
                clave,
                titulo: "Bloqueadas",
                resumen: resumenText,
                filas: todasFilas,
                historicas: totalHistoricas,
                acciones: todasFilas.length
                    ? [{ clase: "descartar-todas", texto: "Descartar todas", destructiva: true }]
                    : [],
                vacio: "Ninguna tarea espera a otra: lo que queda o está en marcha o está hecho.",
            };
        }

        case "sin-publicar": {
            const filas: FilaMedidor[] = d.commitsSinPublicar.map((c) => ({
                id: c.sha.slice(0, 8),
                titulo: c.asunto,
                estado: "sin publicar",
                desde: c.fecha,
                // Un commit no se tira desde un panel: solo se publica o se deja.
                acciones: [],
            }));
            return {
                clave,
                titulo: "Sin publicar",
                resumen: filas.length === 0 ? "todo publicado" : `${filas.length} commits esperando`,
                filas,
                acciones: filas.length
                    ? [{ clase: "publicar", texto: "Publicar en origin/main", destructiva: false }]
                    : [],
                vacio: "No hay nada sin publicar: la rama está igual que el remoto.",
            };
        }

        // (2026-09-21) Estos DOS medidores compartian rama —`case "en-curso": case "agentes":`—
        // y por construccion enseñaban exactamente las mismas filas. Alex: «en las ventanas de
        // tareas en curso y de agentes son los mismos datos». Son dos preguntas distintas y
        // ahora se responden distinto:
        //   · Tareas en curso  -> el TRABAJO: que tarea es, en que fase va y cuanto lleva hecho.
        //   · Agentes trabajando -> el TRABAJADOR: que modelo, en que medio, desde cuando y si
        //     de verdad esta escribiendo o lleva rato callado.
        // El mismo latido alimenta las dos, pero cada una enseña su lado.
        case "agentes": {
            const filas: FilaMedidor[] = d.latidos.map((l) => {
                const proveedor = l.proveedor ?? l.modelo.split("/")[0];
                const modelo = l.modelo.split("/").slice(-1)[0];
                const quieto = l.quietoSegundos ?? null;
                // «Escribiendo» solo si ha tocado el log hace poco. Un agente que lleva cinco
                // minutos sin escribir un byte no esta trabajando, esta pensando o colgado, y
                // llamarle «escribiendo» es justo lo que impide verlo.
                const callado = quieto !== null && quieto > 180;
                const obra = d.obras?.[l.tarea];
                return {
                    id: `${proveedor} · ${modelo}`,
                    titulo: `${proveedor} · ${modelo} en ${l.donde}`,
                    estado: callado ? "callado" : "escribiendo",
                    // El avance del agente es el de su tarea: es lo unico que ha avanzado.
                    porcentaje: avanceDe(l.fase, estadoDe(l.tarea)).porcentaje,
                    etapa: `trabaja en ${l.tarea}`,
                    quien: l.cola ? `cola ${l.cola}` : l.medio ?? l.donde,
                    desde: `${l.minutos} min`,
                    porque: callado
                        ? `sin escribir desde hace ${Math.round((quieto ?? 0) / 60)} min`
                        : bytesLegibles(l.bytesLog),
                    ficha: fichaDeAgente(l, d.progreso[l.tarea], obra, d.repoGitHub),
                    historial: d.historiales?.[l.tarea]?.slice(0, 6),
                    acciones: [],
                };
            });
            const callados = filas.filter((f) => f.estado === "callado").length;
            const medioAg = mediaDeAvance(filas);
            return {
                clave,
                titulo: "Agentes trabajando",
                resumen:
                    filas.length === 0
                        ? "ningún agente escribiendo"
                        : `${filas.length} ${filas.length === 1 ? "agente" : "agentes"}${
                              callados ? ` · ${callados} sin escribir` : ""
                          } · ${new Set(d.latidos.map((l) => l.donde)).size} medio(s)`,
                filas,
                porcentajeMedio: medioAg,
                // (2026-09-22) Alex pidió DOS VECES un botón aquí «para buscar en todos los
                // medios de contenedores disponibles de agentes en la nube manualmente».
                // Van en esta ventana y no solo en la de contenedores porque es aquí donde
                // se mira cuando faltan agentes.
                acciones: [
                    { clase: "sondear-contenedores", texto: "Buscar contenedores en la nube", destructiva: false },
                    ...(libresDeContenedores(d.contenedores) > 0
                        ? [
                              {
                                  clase: "desplegar-nube" as const,
                                  texto: `Desplegar más agentes en la nube (${libresDeContenedores(d.contenedores)} libres)`,
                                  destructiva: false,
                              },
                          ]
                        : []),
                    IR_A("Ver la ramificación", "procesos"),
                ],
                vacio: "Ningún agente está escribiendo ahora mismo.",
            };
        }

        case "en-curso": {
            const filas: FilaMedidor[] = d.latidos.map((l) => {
                const avance = avanceDe(l.fase, estadoDe(l.tarea));
                return {
                    id: l.tarea,
                    titulo: titulo(l.tarea),
                    estado: l.fase,
                    porcentaje: avance.porcentaje,
                    etapa: avance.etapa,
                    quien: `${l.proveedor ?? l.modelo.split("/")[0]} · ${l.modelo.split("/").slice(-1)[0]} en ${l.donde}`,
                    desde: `${l.minutos} min`,
                    porque: l.minutos > 45 ? "lleva mucho sin cambiar de fase" : undefined,
                    ficha: fichaDeTarea(
                        l.tarea,
                        d.progreso[l.tarea],
                        d.declarados?.[l.tarea],
                        d.obras?.[l.tarea],
                        d.repoGitHub,
                        l,
                    ),
                    historial: d.historiales?.[l.tarea]?.slice(0, 6),
                    acciones: [],
                };
            });
            // Un `en_curso` sin latido es un estado rancio, y verlo es media reparación.
            const rancias = Object.entries(d.progreso)
                .filter(([id, v]) => v?.estado === "en_curso" && !d.latidos.some((l) => l.tarea === id))
                .map(([id, v]) => ({
                    id,
                    titulo: titulo(id),
                    estado: "en_curso sin agente",
                    porcentaje: 0,
                    porque: "figura en curso pero ningún agente late por ella: estado rancio",
                    desde: v.t,
                    ficha: fichaDeTarea(id, v, d.declarados?.[id], d.obras?.[id], d.repoGitHub),
                    historial: d.historiales?.[id]?.slice(0, 6),
                    acciones: accionesDeTarea(v.estado),
                }));
            const todas = [...rancias, ...filas];
            const medio = mediaDeAvance(todas);
            return {
                clave,
                titulo: "Tareas en curso",
                resumen:
                    filas.length === 0
                        ? "ninguna tarea en curso"
                        : `${filas.length} en marcha · ${medio} % de avance medio${rancias.length ? ` · ${rancias.length} rancias` : ""}`,
                filas: todas,
                porcentajeMedio: medio,
                acciones: [IR_A("Ver la ramificación", "procesos")],
                vacio: "Ninguna tarea en curso ahora mismo.",
            };
        }

        case "listas": {
            // Por qué NO las está cogiendo nadie, que es la pregunta de verdad cuando ves
            // «13 listas · 0 agentes». Son tres situaciones distintas y hasta ahora las tres
            // se veían igual: un número en rojo.
            const porQueNadieLasCoge = d.enjambrePausado
                ? "el enjambre está EN PAUSA: nadie las va a coger hasta que se reanude"
                : d.enjambreVivo
                  ? "el enjambre está vivo y las va cogiendo por tandas, según los trabajadores libres"
                  : "no hay orquestador vivo; el vigilante lo relanza solo en menos de 90 s";
            const asuntosDeMain = d.asuntosDeMain;
            const asuntosDisponibles = typeof asuntosDeMain === "string";
            // Sin una lectura fiable no se adivina: ocultar trabajo válido sería
            // peor que mostrarlo y avisar con claridad de que falta comprobar Git.
            const ejecutables = asuntosDisponibles
                ? d.ejecutables.filter((t) => !idIntegradoEnAsuntos(t.id, asuntosDeMain))
                : d.ejecutables;
            const avisoGit = asuntosDisponibles
                ? ""
                : " · no se pudieron leer los asuntos de Git; no se filtró por commits";
            const filas: FilaMedidor[] = ejecutables.map((t) => ({
                id: t.id,
                titulo: t.titulo,
                estado: "lista",
                // 0 % de seis etapas: definida y sin empezar. Con la barra al lado se ve
                // de un vistazo lo que queda por delante de cada una.
                porcentaje: 0,
                porque: t.ola ? `de la ola ${t.ola} · ${porQueNadieLasCoge}` : porQueNadieLasCoge,
                acciones: accionesDeTarea("pendiente"),
            }));
            return {
                clave,
                titulo: "Listas para trabajar",
                resumen: (
                    filas.length === 0
                        ? "sin trabajo ejecutable"
                        : `${filas.length} se pueden coger ya · 0 % avanzadas · ${porQueNadieLasCoge}`
                ) + avisoGit,
                filas,
                porcentajeMedio: 0,
                acciones: [IR_A("Ver procesos", "procesos")],
                vacio: "No queda trabajo ejecutable: todo lo definido está integrado, bloqueado o esperándote.",
            };
        }

        case "proveedores": {
            const filas: FilaMedidor[] = d.proveedores.map((p) => ({
                id: p.id,
                titulo: p.id,
                estado: p.estado,
                porque: p.motivo,
                acciones: [],
            }));
            const malos = filas.filter((f) => f.estado !== "vivo").length;
            return {
                clave,
                titulo: "Flota de proveedores",
                resumen: `${filas.length - malos} vivos · ${malos} sin cupo o caídos`,
                filas,
                acciones: [IR_A("Ver la flota", "flota")],
                vacio: "No hay pasarelas declaradas en esta máquina.",
            };
        }

        case "contenedores": {
            // (2026-09-22) Ni un número de aquí se calcula en esta función: todos vienen
            // medidos de `contenedores_nube.py`, el mismo archivo que usa el director de la
            // nube para elegir dónde desplegar. Si esta ventana y el director dijeran cosas
            // distintas volveríamos a la enfermedad de siempre.
            const inv = d.contenedores;
            const lista = inv?.contenedores ?? [];
            const r = inv?.resumen ?? {};

            const filas: FilaMedidor[] = lista.map((c) => {
                const usable = c.estado === "listo" || c.estado === "usable";
                const ficha: DatoDeFicha[] = [
                    { etiqueta: "Servicio", valor: c.servicio },
                    { etiqueta: "Proveedor", valor: c.proveedor || "—" },
                    { etiqueta: "Máquina", valor: c.maquina || "sin dato" },
                    {
                        etiqueta: "Capacidad",
                        valor: c.jobs_simultaneos
                            ? `${c.jobs_simultaneos} job(s) simultáneo(s) × ${c.agentes_por_job} agentes = ${c.jobs_simultaneos * c.agentes_por_job}`
                            : "sin forma de lanzar agentes todavía",
                    },
                    { etiqueta: "Agentes ahora", valor: `${c.agentes_ahora} en ${c.runs_ahora} ejecución(es)` },
                    {
                        etiqueta: "Sitio libre",
                        valor: `${c.agentes_libres} agente(s)`,
                        aviso: usable && c.agentes_libres === 0,
                    },
                    { etiqueta: "Coste", valor: c.coste || "—" },
                ];
                if (c.detalle) ficha.push({ etiqueta: "Medido", valor: c.detalle });
                if (c.falta) ficha.push({ etiqueta: "Falta", valor: c.falta, aviso: true });
                if (c.siguiente_paso) ficha.push({ etiqueta: "Siguiente paso", valor: c.siguiente_paso });

                return {
                    id: c.id,
                    titulo: `${c.servicio} · ${c.proveedor || c.id}`,
                    estado: c.estado,
                    porque: usable
                        ? `${c.agentes_libres} de ${c.jobs_simultaneos * c.agentes_por_job} agente(s) libres · ${c.maquina}`
                        : c.falta || c.detalle || "no está disponible",
                    quien: c.maquina,
                    ficha,
                    acciones: c.desplegable
                        ? [
                              {
                                  clase: "desplegar-nube" as const,
                                  texto: `Desplegar ${c.agentes_por_job} agentes aquí`,
                                  destructiva: false,
                              },
                          ]
                        : [],
                };
            });

            const libres = r.agentes_libres ?? 0;
            const tope = r.agentes_tope ?? 0;
            return {
                clave,
                titulo: "Contenedores en la nube",
                resumen: inv
                    ? `${r.agentes_ahora ?? 0} agente(s) trabajando · ${libres} libre(s) de ${tope} · ${r.usables ?? 0} de ${r.contenedores ?? 0} servicio(s) usable(s)${inv.generado ? ` · medido ${inv.generado}` : ""}`
                    : "sin medir todavía: pulsa «Buscar contenedores ahora»",
                filas,
                acciones: [
                    { clase: "sondear-contenedores", texto: "Buscar contenedores ahora", destructiva: false },
                    ...(libres > 0
                        ? [{ clase: "desplegar-nube" as const, texto: `Desplegar en el que tenga más sitio (${libres} libres)`, destructiva: false }]
                        : []),
                    IR_A("Ver la flota", "flota"),
                ],
                vacio: "Ningún contenedor medido aún. «Buscar contenedores ahora» sondea GitHub Actions, Hugging Face, Cloud Run y Colab.",
            };
        }

        case "disco":
            return {
                clave,
                titulo: "Disco",
                resumen: d.disco ? `${d.disco.libreGb} GB libres · ${d.disco.usadoPct} % usado` : "sin dato",
                filas: [],
                acciones: [IR_A("Ver almacenamiento", "neurona")],
                vacio: "Lo primero que se puede retirar son los worktrees de tareas ya cerradas.",
            };

        case "memoria":
            return {
                clave,
                titulo: "Memoria",
                resumen: d.memoria ? `${d.memoria.libreMb} MB libres · swap ${d.memoria.swapMb} MB` : "sin dato",
                filas: [],
                acciones: [IR_A("Ver la neurona", "neurona")],
                vacio: "El swap alto con el enjambre vivo es normal; con el enjambre parado, no.",
            };

        case "ola-activa":
        default:
            return {
                clave: "ola-activa",
                titulo: "Ola activa",
                resumen: d.olaActiva || "ninguna",
                filas: [],
                acciones: [IR_A("Ver olas e informes", "olas")],
                vacio: "Ninguna ola en marcha.",
            };
    }
}

export interface ConfiguracionMedidores {
    ocultos: ClaveMedidor[];
    orden: ClaveMedidor[];
    filasMaximas: number;
}

export const ORDEN_POR_DEFECTO: ClaveMedidor[] = [
    "ola-activa",
    "en-curso",
    "agentes",
    // Justo detrás de «agentes» porque responde a la pregunta que sigue: si hay pocos
    // agentes, ¿dónde caben más? (2026-09-22)
    "contenedores",
    "listas",
    "bloqueadas",
    "sin-publicar",
    "proveedores",
    "memoria",
    "disco",
];

export function configuracionPorDefecto(): ConfiguracionMedidores {
    return { ocultos: [], orden: [...ORDEN_POR_DEFECTO], filasMaximas: 40 };
}

/** Recorta el detalle a lo que cabe, diciendo cuántas quedan fuera. */
export function aplicarConfiguracion(detalle: DetalleMedidor, cfg: ConfiguracionMedidores): DetalleMedidor {
    if (detalle.filas.length <= cfg.filasMaximas) return detalle;
    const sobran = detalle.filas.length - cfg.filasMaximas;
    return {
        ...detalle,
        filas: detalle.filas.slice(0, cfg.filasMaximas),
        resumen: `${detalle.resumen} · se muestran ${cfg.filasMaximas}, hay ${sobran} más`,
    };
}

/** Los medidores visibles, en el orden pedido y sin perder ninguno por el camino. */
export function medidoresVisibles(cfg: ConfiguracionMedidores): ClaveMedidor[] {
    const pedidos = cfg.orden.filter((c) => !cfg.ocultos.includes(c));
    const olvidados = ORDEN_POR_DEFECTO.filter((c) => !cfg.orden.includes(c) && !cfg.ocultos.includes(c));
    return [...pedidos, ...olvidados];
}
