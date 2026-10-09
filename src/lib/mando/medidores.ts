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
import { estadoDeDependencia, INTEGRADOS, MUERTOS as MUERTOS_CADENA, sucesorasDe } from "@/lib/mando/cadenas";
import { resumenDeCambios, type ArchivoCambiado, type Ubicacion } from "@/lib/mando/integradas";
import { obtenerIdsBloqueados, type FilaContable } from "@/lib/mando/conteo-operativo";

import { ENLACE_USO_CLAUDE, estadoCreditoClaude, resumenCreditoClaude, type ConfigCreditoClaude } from "./credito-claude";
import { estadoLimitesClaude, resumenLimitesClaude } from "./limites-claude";
import { estadoCreditos, type DocCreditos } from "./creditos-pago-tipos";

export type ClaveMedidor =
    | "en-curso"
    | "agentes"
    | "listas"
    | "bloqueadas"
    | "sin-publicar"
    | "proveedores"
    | "contenedores"
    | "tokens"
    // (2026-09-23) Alex: «las tareas integradas con su información de los cambios y enlaces
    // a las funciones implementadas en su estado actual». La pastilla era un número sin
    // ventana.
    | "integradas"
    | "memoria"
    | "disco"
    | "ola-activa"
    // (2026-09-27) Alex: «agrega un medidor en el pulso de trabajo de lo que queda de los
    // 250 $ de crédito de Claude en la nube». Ver `credito-claude.ts`.
    | "credito-claude"
    // (2026-10-06) Alex: «El medidor de Claude debe usar la terminal para autoactualizarse y contar con un medidor para cada crédito del usuario en sus APIs y modelos de pago». MC1007G
    | "creditos"
    // (2026-10-09) «Fallidas 0» con PT1009Cb en fallo_tsc: la pastilla contaba solo la ola
    // activa. Este medidor cuenta lo que ha fallado HOY y nadie ha resuelto todavía.
    | "fallidas";

export type ClaseAccion =
    | "descartar"
    | "descartar-todas"
    | "reintentar"
    // (2026-09-23) Alex: «en el medidor de bloqueadas falta la opción de reintentar con
    // cambios automáticamente». (2026-10-05) El cambio automático lo calcula
    // `reintento-inteligente.ts` del estado y la nota de la tarea (objeción de la revisión,
    // pruebas en rojo, errores de tsc…), así que el botón se ofrece siempre que la tarea
    // no sea terminal: «Reparar ahora».
    | "reintentar-auto"
    // (2026-10-05) «Escalar a director»: la reparación pasa al director con otro modelo y
    // todo el contexto del fallo. Nunca descarta sola; descartar es cosa de una persona.
    | "escalar"
    | "publicar"
    | "ir-a"
    // (2026-09-22) Los contenedores de nube: volver a sondear todos los servicios, y
    // desplegar agentes en uno concreto. Alex los pidió a mano desde la ventana.
    | "sondear-contenedores"
    | "desplegar-nube"
    // (2026-09-23) Alex: «botones para buscar y asignar tareas faltantes … en Tareas en curso,
    // Agentes y Listas, en cada una y en general, para comprobar si es posible activar o
    // asignar tareas o agentes automáticamente». Los decide `scripts/puente/asignar_huecos.py`
    // (huecos = tope vivo − ocupados; nunca se salta el tope del gobernador ni se lanza un
    // orquestador desde aquí: si no hay tanda, se despierta al vigilante).
    | "asignar-huecos"
    // (2026-10-05) Alex: «de nuevo solo hay 3 activos, agrega un botón en el medidor de agentes
    // y de tareas en curso para buscar desde ahí si hay más espacios… sin que te tenga que
    // decir cada vez». Una pasada por TODOS los medios: llena la Mac, reabre en la nube lo que
    // solo agotó sus envíos con los proveedores saturados y lanza los jobs que quepan, y dice
    // medio por medio qué sumó y por qué no más (`scripts/puente/buscar_capacidad.py`).
    | "buscar-capacidad"
    | "asignar-tarea"
    | "comprobar-asignacion"
    | "comprobar-agente";

export interface AccionMedidor {
    clase: ClaseAccion;
    texto: string;
    /** Pestaña de Genesis para `ir-a`. */
    destino?: string;
    /** Rojo + confirmación en dos pasos. Nunca se omite en algo que borra. */
    destructiva: boolean;
    /** Si está, la acción pide texto antes de poder enviarse. */
    pideTexto?: string;
    /** (2026-09-23) El id que viaja al servidor si NO es el de la fila. La fila de un agente
     *  se llama «proveedor · modelo», pero lo que se comprueba es su TAREA. */
    objetivo?: string;
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
    /** Enlace externo (GitHub) o interno de Genesis. Opcional: muchos datos no llevan. */
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
    /** (2026-09-23) Algo se está haciendo AHORA detrás de este medidor (p. ej. una publicación):
     *  el panel pinta un indicador de carga con este texto y se relee solo hasta que acabe. */
    cargando?: { texto: string; progreso?: number };
    /** (2026-09-23) Algo que salió mal y hay que ver al abrir el panel (en rojo). */
    aviso?: string;
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

/** (2026-10-05) «Buscar más capacidad en todos los medios» (`scripts/puente/buscar_capacidad.py`). */
export const ACCION_BUSCAR_CAPACIDAD: AccionMedidor = {
    clase: "buscar-capacidad",
    texto: "Buscar más capacidad en todos los medios",
    destructiva: false,
};

/**
 * El botón general de «¿cabe más trabajo?» de Agentes, Tareas en curso, Listas y Contenedores.
 *
 * (2026-10-05, 17:20) Alex: «son demasiados botones los de Buscar más capacidad en todos los
 * medios, Buscar y asignar trabajo ahora, Comprobar si cabe más, Buscar contenedores en la
 * nube, Desplegar más agentes en la nube… que sea solo uno fusionado funcional». Eran cinco
 * caminos para la misma pregunta y ninguno la contestaba entera. Ahora es UNO: llena la Mac
 * (lo de «asignar»), vuelve a medir los contenedores (lo de «buscar contenedores»), reabre y
 * despliega en la nube (lo de «desplegar») y dice medio por medio qué sumó y por qué no más
 * (lo de «comprobar»). Las acciones POR FILA (asignar esta tarea, comprobar este agente,
 * desplegar en este contenedor) siguen: son de una cosa concreta, no de todo.
 */
export const ACCIONES_ASIGNAR: AccionMedidor[] = [ACCION_BUSCAR_CAPACIDAD];

/**
 * (2026-09-23) Indicador de carga de «Sin publicar»: qué paso de la publicación va y cuánto
 * lleva, como el «Comprobando…» de los demás medidores. Un diario «corriendo» de hace más de
 * dos horas no es una publicación viva: es un publicador que murió sin cerrar su diario, y
 * decir «publicando» para siempre sería mentir. PURA: el reloj entra por parámetro.
 */
export function cargaDePublicacion(
    diario: DatosMedidores["publicacion"] | undefined,
    ahoraMs: number,
): { texto: string; progreso?: number } | undefined {
    if (!diario || diario.estado !== "corriendo") return undefined;
    const pasos = diario.pasos ?? [];
    const hechos = pasos.filter((p) => p.estado === "ok" || p.estado === "omitido").length;
    const actual = pasos.find((p) => p.estado === "corriendo");
    const empezado = diario.empezado ? Date.parse(diario.empezado.replace(" ", "T")) : NaN;
    const minutos = Number.isFinite(empezado) ? Math.max(0, Math.round((ahoraMs - empezado) / 60_000)) : null;
    if (minutos !== null && minutos > 120) {
        return {
            texto: `el diario dice «publicando» desde hace ${minutos} min: el publicador parece muerto`,
            progreso: pasos.length ? Math.round((hechos / pasos.length) * 100) : undefined,
        };
    }
    const paso = actual
        ? `${actual.titulo}${actual.detalle ? ` · ${actual.detalle.split("\n")[0].slice(0, 80)}` : ""}`
        : "preparando";
    return {
        texto: `Publicando · paso ${Math.min(hechos + 1, pasos.length || 1)} de ${pasos.length || "?"}: ${paso}${
            minutos !== null ? ` · ${minutos} min` : ""
        }`,
        progreso: pasos.length ? Math.round((hechos / pasos.length) * 100) : undefined,
    };
}

/**
 * (2026-09-23) Alex: «no funciona el publicar desde el medidor». La publicación SÍ se lanzó,
 * paró en vitest con una prueba en rojo… y el medidor no lo decía: el giro desaparecía, los
 * commits seguían ahí y nada más. Esto dice POR QUÉ no salió la última, con la prueba o el
 * paso que falló, mientras siga habiendo algo sin publicar (24 h como mucho). PURA.
 */
export function falloDePublicacion(
    diario: DatosMedidores["publicacion"] | undefined,
    ahoraMs: number,
): string | undefined {
    if (!diario || diario.estado !== "fallo") return undefined;
    const fin = diario.terminado ? Date.parse(diario.terminado.replace(" ", "T")) : NaN;
    if (Number.isFinite(fin) && ahoraMs - fin > 24 * 3_600_000) return undefined;
    const paso = (diario.pasos ?? []).find((p) => p.estado === "falla");
    const limpio = (paso?.detalle ?? "").replace(/\u001b\[[0-9;]*m/g, "");
    const lineas = limpio.split("\n").map((l) => l.trim()).filter(Boolean);
    const clave =
        lineas.find((l) => /^FAIL\s/.test(l)) ??
        lineas.find((l) => /error TS\d+|Type error:|AssertionError|Error:/.test(l)) ??
        lineas.find((l) => /PARADA|no se publicó|quedan .* GB/.test(l));
    const hora = diario.terminado ? diario.terminado.slice(11, 16) : "";
    return `La última publicación${hora ? ` (${hora})` : ""} no salió: ${diario.resumen || "una puerta en rojo"}${
        paso ? ` · paso «${paso.titulo}»` : ""
    }${clave ? `: ${clave.slice(0, 220)}` : ""}.`;
}

/**
 * (2026-09-24) Título de un run de la nube en «Tareas en curso» y «Agentes». Alex: «cuando
 * terminan los agentes vuelven a entrar 4 más pero no dice que haya más listas para trabajar,
 * no sé de qué olas son». La fila decía «nube-20260924 · 3 tarea(s): CU3br, p318Jc, p318Jb»:
 * «nube-20260924» no es una ola, es la fecha del reparto. Ahora dice de qué OLA sale cada
 * tarea y, si la misma tarea ya se mandó a la nube 3 veces o más sin integrarse, lo marca:
 * esas tres llevaban 82-87 envíos en dos días. PURA.
 */
export function tituloDeRunNube(
    titulo: string,
    tareas: { id: string; ola?: string }[],
    envios: Record<string, number> = {},
): string {
    if (!tareas.length) return `${titulo} · cola ilegible`;
    const corta = (ola: string) => {
        const limpia = ola.replace(/\s+/g, " ").trim();
        if (/^\d+$/.test(limpia)) return `ola ${limpia}`;
        const [cabeza] = limpia.split(/[:·]/);
        return (cabeza || limpia).trim().slice(0, 48);
    };
    const grupos = new Map<string, string[]>();
    for (const t of tareas) {
        const clave = t.ola ? corta(t.ola) : "ola desconocida";
        grupos.set(clave, [...(grupos.get(clave) ?? []), t.id]);
    }
    const partes = [...grupos].map(([ola, ids]) => `${ids.join(", ")} (${ola})`);
    const repetidas = tareas
        .filter((t) => (envios[t.id] ?? 0) >= 3)
        .map((t) => `${t.id} ×${envios[t.id]}`);
    return `reparto a la nube · ${partes.join(" · ")}${
        repetidas.length ? ` · ⚠ reenviadas sin integrarse: ${repetidas.join(", ")}` : ""
    }`;
}

/**
 * (2026-09-23) Veredicto de UN agente para «Comprobar este agente»: ¿escribe, espera
 * pasarela o está callado, y qué pasará solo? Los umbrales son los del orquestador (corta a
 * los 5 min sin crecer) y del vigilante (30 min sin escribir nada). PURA.
 */
export function veredictoDeAgente(
    latido: DatosMedidores["latidos"][number] | undefined,
    proveedoresLibres: number,
): string {
    if (!latido) return "Ningún agente late por esa tarea ahora mismo: si figura en curso, es un estado rancio.";
    const quien = `${latido.proveedor ?? latido.modelo.split("/")[0]} · ${latido.modelo.split("/").slice(-1)[0]} en ${latido.donde}`;
    if (/esperando proveedor/i.test(latido.fase ?? "")) {
        return proveedoresLibres > 0
            ? `${quien} espera pasarela desde hace ${latido.minutos} min; hay ${proveedoresLibres} pasarela(s) disponible(s): el orquestador la reintenta sola en su siguiente vuelta.`
            : `${quien} espera pasarela desde hace ${latido.minutos} min y NO hay ninguna con cupo ahora: seguirá esperando hasta que una se libere.`;
    }
    const quieto = latido.quietoSegundos ?? 0;
    if (quieto > 180) {
        const min = Math.round(quieto / 60);
        return `${quien} lleva ${min} min sin escribir (fase ${latido.fase}). El orquestador corta a los 5 min sin crecer y la reasigna a otro modelo; el vigilante, a los 30.`;
    }
    return `${quien} trabaja con normalidad: fase ${latido.fase}, ${latido.minutos} min, ${bytesLegibles(latido.bytesLog) ?? "sin medida de bytes"}.`;
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
    // (2026-09-29) Un sueño con su informe tampoco se descarta ni se reintenta desde aquí: se
    // verifica o se rehace con `suenos.py` (panel «Sueños profundos»).
    if (!estado || TERMINALES.has(estado) || estado === "informe") return [];
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

/**
 * El cambio que se manda al pulsar «Reintentar con cambio automático» en una bloqueada.
 *
 * (2026-09-23) No se inventa nada: se lee la FICHA de la tarea —a quién espera y en qué
 * estado está cada una— y se escribe la instrucción que se deduce de ahí. Si todas las
 * dependencias siguen vivas, devuelve `null` y el botón NO aparece: reintentar algo que
 * solo espera da exactamente el mismo resultado, que es justo por lo que «Reintentar»
 * pide texto. El botón solo sale donde hay algo real que cambiar.
 */
export function cambioAutomatico(fila: Pick<FilaMedidor, "estado" | "ficha">): string | null {
    const ficha = fila.ficha ?? [];
    const esperas: { dep: string; estado: string }[] = [];
    for (let i = 0; i < ficha.length; i += 1) {
        if (ficha[i].etiqueta !== "Espera a") continue;
        const dep = String(ficha[i].valor).split("—")[0].trim();
        if (!dep || dep === "nada anotado") continue;
        const sig = ficha[i + 1];
        esperas.push({
            dep,
            estado: sig && sig.etiqueta === "↳ su estado" ? String(sig.valor) : "",
        });
    }
    if (esperas.length === 0) return null;
    const idas = esperas.filter((e) => /NO EXISTE|no se va a integrar sola/.test(e.estado));
    if (idas.length === 0) return null;
    const nombres = (xs: { dep: string }[]) => xs.map((x) => x.dep).join(", ");
    const muertas = nombres(idas);
    const vivas = nombres(esperas.filter((e) => !idas.includes(e)));
    if (idas.length === esperas.length) {
        return (
            `${muertas} no va a llegar: o no existe en ninguna ola, o está descartada, sustituida o rechazada. ` +
            `Rehaz esta tarea SIN esa dependencia: implementa dentro de tu alcance lo mínimo que necesites de ` +
            `${muertas}, o recorta el alcance a lo que se pueda terminar solo. Di en el commit qué recortaste.`
        );
    }
    return (
        `${muertas} no va a llegar (no existe o no se integra sola) y ${vivas} sigue viva. ` +
        `Quita la dependencia de ${muertas} —implementa lo mínimo que necesites de ella dentro de tu alcance— ` +
        `y deja que ${vivas} siga siendo la única espera.`
    );
}

/**
 * Las dependencias de la ficha que NO van a llegar: no existen en ninguna ola o no se
 * integran solas. Son las que el reintento automático quita de `depende`: sin eso, el
 * orquestador volvía a bloquear la tarea en su primera vuelta por la misma razón. PURA.
 *
 * (2026-10-05, BLQ1005B) «NO EXISTE» ya no basta para darla por muerta: una dependencia
 * que está en una cola viva (aunque aún no tenga entrada en progreso.json) VA a arrancar.
 * `vivaEnCola` decide ese caso; sin ella se mantiene la lectura histórica.
 */
export function dependenciasMuertas(
    fila: Pick<FilaMedidor, "ficha">,
    vivaEnCola?: (id: string) => boolean,
): string[] {
    const ficha = fila.ficha ?? [];
    const fuera: string[] = [];
    for (let i = 0; i < ficha.length; i += 1) {
        if (ficha[i].etiqueta !== "Espera a") continue;
        const dep = String(ficha[i].valor).split("—")[0].trim();
        const sig = ficha[i + 1];
        const estado = sig && sig.etiqueta === "↳ su estado" ? String(sig.valor) : "";
        if (!dep || dep === "nada anotado") continue;
        const muerta =
            /no se va a integrar sola/.test(estado) || (/NO EXISTE/.test(estado) && !vivaEnCola?.(dep));
        if (muerta) fuera.push(dep);
    }
    return fuera;
}

/**
 * Las acciones de una bloqueada (2026-10-05, BLQ1005B, contrato bloqueadas-reparacion §3):
 * Reparar ahora (el cambio sale del estado y la nota, BLQ1005A), Reparar con mi cambio
 * (lo escribe la persona), Escalar a director y Descartar (a dos clics, es la excepción).
 */
export function accionesDeBloqueada(fila: Pick<FilaMedidor, "estado" | "ficha">): AccionMedidor[] {
    if (!fila.estado || TERMINALES.has(fila.estado) || fila.estado === "informe") return [];
    return [
        { clase: "reintentar-auto", texto: "Reparar ahora", destructiva: false },
        {
            clase: "reintentar",
            texto: "Reparar con mi cambio",
            destructiva: false,
            pideTexto: "¿Qué hay que cambiar para que salga bien esta vez?",
        },
        { clase: "escalar", texto: "Escalar a director", destructiva: false },
        { clase: "descartar", texto: "Descartar", destructiva: true },
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
    via?: (id: string) => string | undefined,
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
                    ? `${est} — ya está${via?.(dep) ? ` (la integró ${via(dep)})` : ""}: esto puede desbloquearse`
                    : via?.(dep)
                      ? `${est} — la rehace ${via(dep)}: llega cuando ${via(dep)} se integre`
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

/** Un latido por tarea (el que avanzó más tarde). PURA. Ver `unLatidoPorTarea` en lector-local. */
function unaPorTarea<T extends { tarea: string; donde?: string; quietoSegundos?: number; minutos?: number }>(latidos: T[]): T[] {
    // Solo en la Mac una tarea = un agente. Un run de la nube lleva VARIOS agentes bajo el
    // mismo id (`nube/<run>`) y no se sabe qué tarea lleva cada uno: ahí cada latido cuenta.
    const porTarea = new Map<string, T>();
    latidos.forEach((l, i) => {
        const clave = (l.donde ?? "mac") === "mac" ? l.tarea : `${l.tarea}#${i}`;
        const previo = porTarea.get(clave);
        const q = (x: T) => x.quietoSegundos ?? Number.POSITIVE_INFINITY;
        if (!previo || q(l) < q(previo)) porTarea.set(clave, l);
    });
    return [...porTarea.values()];
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
 * quitando de Genesis.
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
        valor: dondeLegible(l.donde),
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
 * (2026-09-25) Dónde corre un agente, dicho para personas. Los externos (Claude en Cowork y
 * sus subagentes, Hermes) laten con `scripts/puente/latido_externo.py`.
 */
export function dondeLegible(donde: string | undefined): string {
    switch (donde) {
        case "mac":
        case undefined:
        case "":
            return "Mac de Alex (local)";
        case "cowork":
            return "Claude en Cowork (nube de Anthropic)";
        case "hermes":
            return "Hermes (servidor)";
        default:
            return donde;
    }
}

/**
 * (2026-09-24) Alex: «vuelven a entrar 4 más… no sé de qué olas son». La ola de una
 * tarea viva, en corto («Ola 318 · Director de verdad»): primero las olas que se
 * ejecutan ahora (su título ya viene resuelto), si no la ola que declara su cola.
 */
export function olaDeTarea(
    d: Pick<DatosMedidores, "olasActivas" | "ejecutables">,
    id: string,
): string | undefined {
    const corta = (t: string) => t.split(":")[0].trim();
    for (const o of d.olasActivas ?? []) {
        if (o.tareas.some((t) => t.id === id)) return corta(o.titulo);
    }
    const ola = (d.ejecutables ?? []).find((t) => t.id === id)?.ola;
    return ola ? corta(tituloDeOla(ola)) : undefined;
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
    ola?: string,
): DatoDeFicha[] {
    const ficha: DatoDeFicha[] = [];
    ficha.push({ etiqueta: "Estado", valor: entrada?.estado ?? "sin empezar" });
    if (ola) ficha.push({ etiqueta: "Ola", valor: ola });
    if (latido) {
        ficha.push({ etiqueta: "Fase", valor: latido.fase });
        ficha.push({ etiqueta: "La escribe", valor: latido.modelo });
        ficha.push({
            etiqueta: "Dónde",
            valor: dondeLegible(latido.donde),
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
/**
 * Un latido por TAREA, con cuántos agentes hay sobre ella. PURA.
 *
 * (2026-09-22) El medidor de tareas en curso pintaba una fila por latido, es decir por
 * AGENTE: una tarea con cuatro agentes salía cuatro veces y el número de tareas era, por
 * construcción, el número de agentes. Se queda el latido que más ha avanzado en la fase
 * (el que más minutos lleva), que es el que cuenta la historia de la tarea.
 */
export function agruparPorTarea<T extends { tarea: string; minutos: number }>(
    latidos: T[],
): { latido: T; agentes: number }[] {
    const porTarea = new Map<string, { latido: T; agentes: number }>();
    for (const l of latidos ?? []) {
        const previo = porTarea.get(l.tarea);
        if (!previo) {
            porTarea.set(l.tarea, { latido: l, agentes: 1 });
            continue;
        }
        previo.agentes += 1;
        if (l.minutos > previo.latido.minutos) previo.latido = l;
    }
    return [...porTarea.values()];
}

/** El estado con el que se marca una tarea que no se puede coger porque espera a otra. */
export const ESPERA_A_OTRA = "espera a otra tarea";

/**
 * Qué dependencias le faltan a una tarea para poder empezar. PURA.
 *
 * Vale [] cuando no depende de nada o cuando todas están integradas. (2026-10-08) La regla es
 * la del orquestador y la del vigilante, no una propia (`cadenas.ts`): una dependencia solo deja
 * de frenar cuando ELLA o una SUCESORA de su cadena está en main. Antes «sustituida»,
 * «descartada» y «rechazada» se daban por cumplidas (el caso JF1 del 2026-09-22) y Genesis
 * enseñaba «RM7 · se puede coger ya» con RM6 rehaciéndose en RM6b: el orquestador no la iba a
 * coger nunca. Una dependencia que no va a llegar no se esconde: frena, y «Bloqueadas» dice que
 * no tiene salida para repararla o borrarla. Una que no existe en el progreso también frena
 * (`p318Jb` esperando a un `p318I` que nunca se creó).
 */
export function dependenciasQueFaltan(
    depende: string[] | undefined,
    progreso: Record<string, { estado?: string } | undefined>,
    asuntosDeMain?: string | null,
    otrosIds: Iterable<string> = [],
): string[] {
    const ids = [...Object.keys(progreso), ...otrosIds];
    const enMain = (id: string) => typeof asuntosDeMain === "string" && idIntegradoEnAsuntos(id, asuntosDeMain);
    return (depende ?? []).filter((dep) => {
        const id = String(dep || "").trim();
        if (!id) return false;
        return !estadoDeDependencia(id, (k) => progreso[k]?.estado, ids, enMain).cumplida;
    });
}

/**
 * Las tareas que se pueden coger AHORA.
 *
 * (2026-09-22) Aquí faltaba lo más importante y por eso Genesis mentía en la cara:
 * enseñaba «LISTAS PARA TRABAJAR 7 · 7 se pueden coger ya · el enjambre las va cogiendo
 * por tandas» mientras RM5, RM6, RM7, RM8, JF2, p318Jb y p318Jc estaban TODAS esperando a
 * otra tarea (RM5 espera a RM3, que falló, y a RM4, que fue rechazada; p318Jb espera a un
 * p318I que no existe). Cero de las siete se podían coger. Con un agente trabajando y
 * siete «listas» en pantalla, lo que se ve es un enjambre averiado; lo que había era una
 * cadena rota y un medidor que no miraba las dependencias.
 *
 * Las bloqueadas salen igual, pero marcadas: esconderlas sería cambiar una mentira por
 * otra. Quien mira necesita ver que hay trabajo definido Y que no puede arrancar.
 */
export function ejecutablesDeColas(
    colas: { id: string; titulo?: string; ola?: string; cola?: string; dependencias?: string[] }[],
    progreso: Record<string, { estado?: string } | undefined>,
    asuntosDeMain: string,
): { id: string; titulo: string; ola?: string; esperaA?: string[] }[] {
    const vistos = new Set<string>();
    const salida: { id: string; titulo: string; ola?: string; esperaA?: string[] }[] = [];
    const idsDeColas = colas.map((t) => t.id).filter(Boolean);
    for (const t of colas) {
        if (!t.id || vistos.has(t.id)) continue;
        if ((t.cola ?? "").startsWith("auto-")) continue;
        // (2026-10-08) Las colas de SUEÑOS tampoco: el vigilante no las lee (`es_cola_de_codigo`),
        // así que aquí salían «7 se pueden coger ya» mientras «Buscar más capacidad» veía 0
        // listas para la Mac. Si la misma tarea vive también en una cola de código, cuenta esa.
        if ((t.cola ?? "").startsWith("suenos-")) continue;
        vistos.add(t.id);
        if (!ABIERTOS.has(progreso[t.id]?.estado ?? "")) continue;
        if (idIntegradoEnAsuntos(t.id, asuntosDeMain)) continue;
        const faltan = dependenciasQueFaltan(t.dependencias, progreso, asuntosDeMain, idsDeColas);
        salida.push({
            id: t.id,
            titulo: t.titulo ?? "",
            ola: t.ola,
            ...(faltan.length ? { esperaA: faltan } : {}),
        });
    }
    return salida;
}

/**
 * Una ola en marcha. (2026-09-23) Alex: «tampoco aparecen las olas activas en el medidor…
 * cada ola, gente y tarea debe mostrar un título y descripción clara con información de
 * archivos en proceso y cambios realizados y estado del progreso, verificación y etapa».
 * El medidor «Ola activa» era un rótulo sin filas que decía «ninguna» con cuatro agentes
 * trabajando en la nube: el campo que lo alimentaba no lo rellenaba nadie.
 */
export interface OlaActiva {
    /** Título legible: «Ola 363», «Ola Dream 2026-09-22 · …». */
    titulo: string;
    /** Archivo de cola, sin ruta. */
    cola: string;
    /** Dónde se ejecuta: «mac» o el medio de nube («nube-gh»). */
    medio: string;
    /** Agentes trabajando en ella ahora mismo (medidos, no supuestos). */
    agentes: number;
    minutos?: number;
    run?: string;
    enlace?: string;
    /** ¿Se sabe qué tarea lleva cada agente? En la nube no: el runner no deja leerse. */
    asignacionConocida: boolean;
    tareas: { id: string; titulo: string; descripcion?: string; archivos?: string[] }[];
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
        /** Título legible (solo lo traen los latidos externos de `latido_externo.py`). */
        titulo?: string;
        /** (2026-09-29) Qué hace un sueño profundo dentro de «analizando». */
        subfase?: string;
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
    /**
     * Tokens por segundo de Genesis. Lo escribe `tokens_por_segundo.py` leyendo
     * contadores que ya están en disco, sin preguntar a ninguna API.
     */
    tokens?: {
        generado?: string;
        intervalo_s?: number;
        ahora?: { fuentes: Record<string, number>; total: number; segundos: number } | null;
        un_minuto?: { fuentes: Record<string, number>; total: number; segundos: number } | null;
        diez_minutos?: { fuentes: Record<string, number>; total: number; segundos: number } | null;
        fuentes?: { id: string; nombre: string }[];
        sin_contador?: { id: string; nombre: string; porque: string; agentes?: number }[];
        resumen?: string;
    } | null;
    /** (2026-09-27) Lo que Alex declara de su crédito de Claude en la nube (claude.ai →
     *  Ajustes → Uso) en `~/.starseed/credito-claude-nube.json`. No hay API: se dice así. */
    creditoClaude?: ConfigCreditoClaude | null;
    /** (2026-10-04) Los LÍMITES DEL PLAN de Claude (sesión ~5 h, semanal y opcionalmente
     *  modelo concreto) leídos desde `~/.starseed/limites-claude.json`. No hay API: la
     *  dirección los toma manualmente desde claude.ai → Uso y los guarda con
     *  `scripts/puente/limites_claude.py declarar …`. */
    limitesClaude?: unknown;
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
    /** (2026-10-08) Los del repo de Astraura 1.58: la pastilla ya los sumaba y la lista no. */
    commitsSinPublicarAstraura?: { sha: string; asunto: string; fecha?: string }[];
    /** (2026-09-23) El diario de la publicación en curso o la última (`publicacion-estado.json`). */
    publicacion?: {
        estado: string;
        empezado?: string;
        terminado?: string | null;
        resumen?: string;
        pasos: { titulo: string; estado: string; detalle?: string }[];
    } | null;
    /** (2026-10-08) Estado de la AUTOPUBLICACIÓN (`~/.starseed/produccion/autopublicar-estado.json`). */
    autopublicacion?: {
        activa: boolean;
        fase?: string;
        detalle?: string;
        /** Última publicación hecha por la autopublicación (ms). */
        ultimaMs?: number;
    } | null;
    /** `esperaA`: las dependencias que le faltan. Si viene, la tarea NO se puede coger. */
    ejecutables: { id: string; titulo: string; ola?: string; esperaA?: string[] }[];
    /** Asuntos recientes de `main`; ausente si Git no pudo leerse. */
    asuntosDeMain?: string | null;
    proveedores: { id: string; estado: string; motivo?: string }[];
    olaActiva?: string;
    /** (2026-09-23) Las olas que se ejecutan AHORA, en cualquier medio, con sus tareas. */
    olasActivas?: OlaActiva[];
    /** El encargo de cada tarea, en una o dos frases (primer párrafo útil del prompt). */
    descripciones?: Record<string, string>;
    /** (2026-09-23) Las integradas, leídas de `main`: commits, archivos y dónde vive hoy lo
     *  que implementaron. Solo se calcula cuando se abre ese medidor (cuesta un `git show`). */
    integradas?: {
        total: number;
        lista: {
            id: string;
            titulo: string;
            ola?: string;
            fecha: string;
            commits: {
                sha: string;
                fecha: string;
                asunto: string;
                clase: "integración" | "trabajo del agente";
                archivos: ArchivoCambiado[];
            }[];
            ubicaciones: Ubicacion[];
        }[];
    } | null;
    /** ¿Hay orquestador vivo? ¿Está el enjambre en pausa? Sin esto, «13 listas y 0 agentes»
     *  no se puede explicar, y un número sin explicación parece una avería aunque no lo sea. */
    enjambreVivo?: boolean;
    enjambrePausado?: boolean;
    disco?: { libreGb: number; usadoPct: number };
    memoria?: { libreMb: number; swapMb: number };
    /** (2026-09-22) Lo que cada tarea viva está tocando AHORA en su worktree, y su
     *  historial de mensajes. Lo lee la ruta (toca disco) y aquí solo se pinta. */
    obras?: Record<string, { rama?: string; archivos?: string[]; ruta?: string }>;
    /** (2026-10-09) Procesos que ESCRIBEN ahora en esta Mac, por tarea (`opencode run` o
     *  `codex exec` sobre `starseed-wt/<id>`), leídos de `ps`. `null` = no se pudo leer:
     *  entonces no se acusa a nadie de fantasma. */
    escritores?: Record<string, { pid: number; minutos: number }> | null;
    /** (2026-10-09) Tareas cuyo latido decía «escribiendo» sin proceso: ya quitadas de `latidos`. */
    fantasmas?: string[];
    /** (2026-10-09) Decisiones del director aún sin aplicar (`progreso-correcciones.json`). */
    correcciones?: Record<string, { estado?: string; nota?: string; t?: string }>;
    historiales?: Record<string, SucesoDeFila[]>;
    /** Archivos que la cola DECLARÓ para cada tarea, para poder comparar con los tocados. */
    declarados?: Record<string, string[]>;
    /** Dueño del repo en GitHub, para poder enlazar ramas y commits. */
    repoGitHub?: string;
    /** Fila operativa opcional de tareas activas en colas. */
    fila?: FilaContable[];
    /** (2026-10-06) Medidores de crédito por terminal, MC1007F. */
    creditosPago?: DocCreditos | null;
}

const FASE_VERIFICANDO: Record<string, string> = {
    tsc: "pasando tsc ahora mismo",
    tests: "pasando las pruebas ahora mismo",
    revision: "en revisión ahora mismo",
    integrando: "puertas en verde: integrando en main",
    "esperando-memoria": "aún sin verificar: esperando memoria para compilar",
    escribiendo: "aún sin verificar: está escribiendo",
    analizando: "sueño profundo: leyendo y analizando (no escribe código)",
};

/**
 * En qué punto de la VERIFICACIÓN está una tarea, dicho en castellano. Sale del estado que
 * dejó el orquestador en progreso.json y, si la tarea está viva, de la fase de su latido.
 * `aviso` marca lo que merece mirarse (falló, la rechazaron, no llegará). PURA.
 */
export function verificacionDe(
    entrada: DatosMedidores["progreso"][string] | undefined,
    fase?: string,
): { texto: string; aviso: boolean } {
    const estado = (entrada?.estado ?? "").toLowerCase();
    const sha = entrada?.sha ? ` (${entrada.sha.slice(0, 8)})` : "";
    const motivo = entrada?.motivo_vb ? `: ${entrada.motivo_vb}` : "";
    if (TERMINALES.has(estado)) return { texto: `puertas en verde e integrada en main${sha}`, aviso: false };
    if (estado === "informe") return { texto: "sueño profundo: informe escrito, sin código que integrar (lo verifica un supervisor Claude)", aviso: false };
    if (estado === "rechazada") return { texto: `rechazada${motivo || " por la revisión"}`, aviso: true };
    if (estado === "bloqueante") return { texto: `la revisión puso una pega bloqueante${motivo}`, aviso: true };
    if (estado.startsWith("fallo")) {
        return { texto: `${estado.replace(/_/g, " ")}: no pasó sus puertas`, aviso: true };
    }
    if (estado === "pendiente_aprobacion" || estado === "esperando_aprobacion") {
        return {
            texto: `puertas en verde · esperando visto bueno${entrada?.revisor ? ` de ${entrada.revisor}` : ""}`,
            aviso: false,
        };
    }
    if (estado === "sustituida" || estado === "descartada") {
        return { texto: `${estado}: no se integrará`, aviso: true };
    }
    const f = (fase ?? "").toLowerCase();
    if (FASE_VERIFICANDO[f]) return { texto: FASE_VERIFICANDO[f], aviso: false };
    return { texto: "aún sin verificar", aviso: false };
}

/**
 * Las filas del medidor «Ola activa»: una por ola —qué es, dónde corre, quién la trabaja y
 * cuánto lleva— y detrás una por cada una de sus tareas, con su encargo, su alcance, los
 * archivos que tiene abiertos, los cambios que ya dejó, su verificación y su etapa. Nada se
 * rellena a ojo: lo que no se puede saber se dice que no se sabe. PURA.
 */
export function filasDeOlasActivas(d: DatosMedidores, repo?: string): FilaMedidor[] {
    const filas: FilaMedidor[] = [];
    for (const ola of d.olasActivas ?? []) {
        const hijas: FilaMedidor[] = [];
        let integradas = 0;
        let informes = 0;
        let enCurso = 0;
        let paradas = 0;
        for (const t of ola.tareas) {
            const e = d.progreso[t.id];
            const estado = e?.estado ?? "";
            const latido = d.latidos.find((l) => l.tarea === t.id);
            const verif = verificacionDe(e, latido?.fase);
            if (TERMINALES.has(estado)) integradas += 1;
            else if (estado === "informe") informes += 1;
            else if (verif.aviso) paradas += 1;
            else if (latido) enCurso += 1;

            let estadoFila: string;
            let etapa: string;
            let porcentaje: number | undefined;
            if (TERMINALES.has(estado)) {
                estadoFila = "integrada";
                etapa = "integrada";
                porcentaje = 100;
            } else if (estado === "informe") {
                // Sueño profundo terminado: su «entrega» es un informe, no un commit.
                estadoFila = "informe escrito";
                etapa = "informe";
                porcentaje = 100;
            } else if (latido) {
                const a = avanceDe(latido.fase, estado);
                estadoFila = "en curso";
                etapa = a.etapa ?? latido.fase;
                porcentaje = a.porcentaje;
            } else if (verif.aviso) {
                estadoFila = estado.replace(/_/g, " ");
                etapa = "parada";
            } else if (!ola.asignacionConocida) {
                estadoFila = "en el run de la nube";
                etapa = "sin dato en vivo";
            } else {
                estadoFila = "por empezar";
                etapa = "en cola";
                porcentaje = 0;
            }

            const descripcion = t.descripcion || d.descripciones?.[t.id] || "";
            const obra = d.obras?.[t.id];
            const alcance = t.archivos?.length ? t.archivos : d.declarados?.[t.id] ?? [];
            const enProceso = obra?.archivos ?? [];
            const rama = obra?.rama ?? e?.rama;
            const ficha: DatoDeFicha[] = [
                { etiqueta: "Ola", valor: ola.titulo },
                { etiqueta: "Encargo", valor: descripcion || "la cola no trae descripción" },
                { etiqueta: "Alcance declarado", valor: alcance.length ? alcance.join(", ") : "no declara archivos" },
                {
                    etiqueta: "Archivos en proceso",
                    valor: enProceso.length
                        ? enProceso.join(", ")
                        : !ola.asignacionConocida && !TERMINALES.has(estado)
                          ? "no se ven hasta que el run entrega: GitHub no deja leer un runner en marcha"
                          : latido
                            ? "ninguno tocado todavía en su árbol de trabajo"
                            : "ninguno abierto ahora",
                },
                {
                    etiqueta: "Cambios realizados",
                    valor: e?.sha
                        ? `commit ${e.sha.slice(0, 8)}${rama ? ` en ${rama}` : ""}`
                        : rama
                          ? `rama ${rama}, sin commit todavía`
                          : "ninguno todavía",
                    enlace: e?.sha && repo ? `https://github.com/${repo}/commit/${e.sha}` : undefined,
                },
                { etiqueta: "Verificación", valor: verif.texto, aviso: verif.aviso },
                { etiqueta: "Etapa", valor: etapa },
            ];
            const agente = latido?.modelo ?? e?.modelo;
            if (agente) {
                ficha.push({ etiqueta: "Agente", valor: `${agente}${latido?.donde ? ` · ${latido.donde}` : ""}` });
            }
            if (e?.intento && e.intento > 1) {
                ficha.push({
                    etiqueta: "Intento",
                    valor: `${e.intento}${e.modelos_fallidos?.length ? ` · antes probaron: ${e.modelos_fallidos.join(", ")}` : ""}`,
                });
            }
            hijas.push({
                id: t.id,
                titulo: `↳ ${t.id} · ${t.titulo || "sin título"}`,
                estado: estadoFila,
                etapa,
                porcentaje,
                porque: descripcion || verif.texto,
                quien: latido ? `${latido.modelo} · ${latido.donde}` : ola.asignacionConocida ? undefined : ola.medio,
                desde: latido ? `${latido.minutos} min` : undefined,
                ficha,
                historial: d.historiales?.[t.id]?.slice(0, 4),
                acciones: [],
                historica: false,
            });
        }
        const n = ola.tareas.length;
        const resto = n - integradas - informes - enCurso - paradas;
        filas.push({
            id: `ola:${ola.cola}`,
            titulo: ola.titulo,
            estado: "en marcha",
            etapa: ola.medio === "mac" ? "en la Mac" : `en ${ola.medio}`,
            porcentaje: n ? Math.round(((integradas + informes) / n) * 100) : 0,
            porque:
                `${n} tarea(s): ${integradas} integrada(s)${informes ? ` · ${informes} informe(s) de sueños` : ""} · ${enCurso} en curso · ${paradas} parada(s) · ` +
                `${resto} ${ola.asignacionConocida ? "por empezar" : "en el run, sin dato en vivo"}`,
            quien: `${ola.agentes} agente(s) · ${ola.medio}`,
            desde: ola.minutos !== undefined ? `${ola.minutos} min` : undefined,
            enlace: ola.enlace,
            ficha: [
                { etiqueta: "Cola", valor: ola.cola },
                { etiqueta: "Dónde corre", valor: ola.medio === "mac" ? "la Mac" : ola.medio },
                {
                    etiqueta: "Agentes",
                    valor: ola.asignacionConocida
                        ? `${ola.agentes} trabajando; cada tarea dice quién la lleva`
                        : `${ola.agentes} trabajando; qué tarea lleva cada uno no se sabe hasta que el run entrega`,
                },
                ...(ola.run ? [{ etiqueta: "Run", valor: ola.run, enlace: ola.enlace }] : []),
                { etiqueta: "Avance", valor: `${integradas} de ${n} integradas en main` },
            ],
            acciones: [],
            historica: false,
        });
        filas.push(...hijas);
    }
    return filas;
}

/** «363» → «Ola 363»; un título ya escrito se deja como está. PURA. */
export function tituloDeOla(ola: string | undefined): string {
    const limpio = (ola ?? "").trim();
    if (!limpio) return "ola sin nombre";
    return /^\d+$/.test(limpio) ? `Ola ${limpio}` : limpio;
}

/**
 * Las olas que la Mac ejecuta AHORA: las colas que laten sus agentes, con todas las tareas
 * de cada cola —también las que aún nadie ha cogido—. Una cola sin latidos no es una ola en
 * marcha aunque le queden tareas: eso es «Listas». PURA.
 */
export function olasDeLaMac(
    colas: { id: string; ola: string; titulo: string; cola?: string; archivos?: string[]; descripcion?: string }[],
    latidos: { tarea: string; cola?: string; minutos?: number }[],
): OlaActiva[] {
    const norm = (c: string) => c.replace(/^.*\//, "").replace(/^cola-/, "").replace(/\.json$/, "");
    const porCola = new Map<string, { agentes: number; minutos: number }>();
    for (const l of latidos) {
        const c = l.cola ? norm(l.cola) : colas.find((t) => t.id === l.tarea)?.cola;
        if (!c) continue;
        // Los agentes de fuera (Claude en Cowork, Hermes…) laten en `externo-*`: salen en
        // Agentes y Tareas, pero no son una ola de la Mac con tareas que integrar.
        if (c.startsWith("externo-")) continue;
        const previo = porCola.get(c) ?? { agentes: 0, minutos: 0 };
        porCola.set(c, { agentes: previo.agentes + 1, minutos: Math.max(previo.minutos, l.minutos ?? 0) });
    }
    return [...porCola.entries()].map(([c, v]) => {
        const tareas = colas.filter((t) => t.cola !== undefined && norm(t.cola) === c);
        return {
            titulo: tituloDeOla(tareas[0]?.ola ?? c),
            cola: c,
            medio: "mac",
            agentes: v.agentes,
            minutos: v.minutos,
            asignacionConocida: true,
            tareas: tareas.map((t) => ({ id: t.id, titulo: t.titulo, descripcion: t.descripcion, archivos: t.archivos })),
        };
    });
}

const vacios: DatosMedidores = {
    progreso: {},
    titulos: {},
    latidos: [],
    commitsSinPublicar: [],
    ejecutables: [],
    proveedores: [],
};

/** Cuenta por fase de los latidos vivos; ordena más → menos. Puro. */
export function resumenTokensConLatidos(latidos?: DatosMedidores["latidos"]): { texto: string; escribiendo: number; sinLatidos: boolean } {
    const vivos = latidos ?? [];
    const sinLatidos = vivos.length === 0;
    const porFase = new Map<string, number>();
    for (const l of vivos) {
        const fase = (l.fase ?? "").toLowerCase();
        if (!fase) continue;
        porFase.set(fase, (porFase.get(fase) ?? 0) + 1);
    }
    const orden = [...porFase.entries()].sort((a, b) => b[1] - a[1]);
    const partes = orden.map(([f, n]) => `${n} en ${f}`);
    const texto = partes.join(", ");
    const escribiendo = porFase.get("escribiendo") ?? 0;
    return { texto, escribiendo, sinLatidos };
}

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
            // (2026-10-05, BLQ1005B) Una dependencia que está en CUALQUIER cola viva aunque
            // aún no tenga entrada en progreso NO es un fantasma: va a arrancar. Se enseña
            // como «en cola» en vez de «NO EXISTE», que era el diagnóstico que mandaba
            // reparar bloqueos que se resuelven solos.
            const vivaEnCola = (id: string) =>
                Boolean(d.fila?.some((t) => t.id === id)) || d.ejecutables.some((t) => t.id === id);
            // (2026-10-08) El estado de una dependencia es el de su CADENA (`cadenas.ts`, la regla
            // del orquestador): «RM6 sustituida» con RM6b rehaciéndola es una espera viva, no una
            // muerta; y una sucesora ya integrada la cumple.
            const estadoPropio = (id: string) =>
                d.progreso[id]?.estado ?? (vivaEnCola(id) ? "en cola" : undefined);
            const idsConocidos = [
                ...Object.keys(d.progreso),
                ...(d.fila?.map((t) => t.id) ?? []),
                ...d.ejecutables.map((t) => t.id),
            ];
            const enCadena = (id: string) => estadoDeDependencia(id, estadoPropio, idsConocidos);
            const estadoDeBloqueadas = (id: string) => {
                const r = enCadena(id);
                return r.via ? r.estado : estadoPropio(id);
            };
            const viaDe = (id: string) => enCadena(id).via;
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
                                : fichaDeBloqueada(v.nota, estadoDeBloqueadas, titulo, v, viaDe);
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                            porque:
                                v.estado === "bloqueante"
                                    ? "agotó los reintentos gratuitos: necesita una persona"
                                    : (b?.veredicto ?? porqueBloqueada(v.nota, estadoDeBloqueadas)),
                            desde: v.t,
                            ficha: b?.ficha,
                            historial: d.historiales?.[id]?.slice(0, 4),
                            acciones: accionesDeBloqueada({
                            estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                            ficha: b?.ficha,
                        }),
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
                                    : `de ola cerrada · ${porqueBloqueada(v.nota, estadoDeBloqueadas)}`,
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
                            ? fichaDeBloqueada(`dependencia no integrada: ${pend.join(", ")}`, estadoDeBloqueadas, titulo, {
                                  estado: "bloqueada",
                              }, viaDe)
                            : null;
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado: b?.muerta ? "bloqueada sin salida" : "bloqueada",
                            porque: b?.veredicto ?? "bloqueada en cola activa, sin dependencia anotada",
                            ficha: b?.ficha,
                            historial: d.historiales?.[id]?.slice(0, 4),
                            acciones: accionesDeBloqueada({
                                estado: b?.muerta ? "bloqueada sin salida" : "bloqueada",
                                ficha: b?.ficha,
                            }),
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
                        v.estado === "bloqueante" ? null : fichaDeBloqueada(v.nota, estadoDeBloqueadas, titulo, v, viaDe);
                    filasOperativas.push({
                        id,
                        titulo: titulo(id),
                        estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                        porque:
                            v.estado === "bloqueante"
                                ? "agotó los reintentos gratuitos: necesita una persona"
                                : (b?.veredicto ?? porqueBloqueada(v.nota, estadoDeBloqueadas)),
                        desde: v.t,
                        ficha: b?.ficha,
                        historial: d.historiales?.[id]?.slice(0, 4),
                        acciones: accionesDeBloqueada({
                            estado: b?.muerta ? "bloqueada sin salida" : v.estado,
                            ficha: b?.ficha,
                        }),
                        historica: false,
                    });
                }
            }

            // (2026-10-08) Lo que «Listas» manda aquí («N más esperan a otra tarea: están en
            // Bloqueadas») tiene que ESTAR aquí. PRD1005U esperaba a PRD1005S (la rehace
            // PRD1005Sc) desde una cola que no es la activa: «Listas» decía 4 y «Bloqueadas» 3.
            const yaEnFilas = new Set([...filasOperativas, ...filasHistoricas].map((f) => f.id));
            for (const t of d.ejecutables) {
                if (!t.esperaA?.length || yaEnFilas.has(t.id)) continue;
                if (typeof d.asuntosDeMain === "string" && idIntegradoEnAsuntos(t.id, d.asuntosDeMain)) continue;
                yaEnFilas.add(t.id);
                const entrada = d.progreso[t.id];
                const b = fichaDeBloqueada(`dependencia no integrada: ${t.esperaA.join(", ")}`, estadoDeBloqueadas, titulo, {
                    ...(entrada ?? {}),
                    estado: entrada?.estado || "pendiente",
                }, viaDe);
                filasOperativas.push({
                    id: t.id,
                    titulo: t.titulo || titulo(t.id),
                    estado: b.muerta ? "bloqueada sin salida" : "bloqueada",
                    porque: b.veredicto,
                    desde: entrada?.t,
                    ficha: b.ficha,
                    historial: d.historiales?.[t.id]?.slice(0, 4),
                    acciones: accionesDeBloqueada({ estado: b.muerta ? "bloqueada sin salida" : "bloqueada", ficha: b.ficha }),
                    historica: false,
                });
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
            const filasOs: FilaMedidor[] = d.commitsSinPublicar.map((c) => ({
                id: c.sha.slice(0, 8),
                titulo: c.asunto,
                estado: "sin publicar",
                desde: c.fecha,
                // Un commit no se tira desde un panel: solo se publica o se deja.
                acciones: [],
            }));
            // (2026-10-08) Los de Astraura 1.58 también se cuentan en la pastilla: aquí se ven con
            // su repo. Se publican aparte (Commits pendientes → Astraura, con confirmación escrita): la
            // autopublicación y el botón de este medidor solo publican el OS (pestaña «Commits pendientes»).
            const filasAstraura: FilaMedidor[] = (d.commitsSinPublicarAstraura ?? []).map((c) => ({
                id: c.sha.slice(0, 8),
                titulo: `Astraura 1.58 · ${c.asunto}`,
                estado: "sin publicar · Astraura",
                desde: c.fecha,
                acciones: [],
            }));
            const filas: FilaMedidor[] = [...filasOs, ...filasAstraura];
            const carga = cargaDePublicacion(d.publicacion, Date.now());
            const publicando = Boolean(carga && !/parece muerto/.test(carga.texto));
            // (2026-10-08) Alex: «la autopublicación tampoco [funciona] ya que aún hay pendientes».
            // Funcionaba: lo que quedaba eran 11 de ASTRAURA (que la autopublicación no publica) y un
            // aviso de la publicación MANUAL fallida de las 13:56, ya superada por la automática.
            // Ahora el resumen dice quién publica cada cosa y el aviso viejo no se enseña.
            const auto = d.autopublicacion;
            const finManual = d.publicacion?.terminado ? Date.parse(d.publicacion.terminado.replace(" ", "T")) : NaN;
            const superada = Boolean(auto?.ultimaMs && Number.isFinite(finManual) && auto.ultimaMs > finManual);
            const fallo = filasOs.length && !publicando && !superada ? falloDePublicacion(d.publicacion, Date.now()) : undefined;
            const textoOs = !filasOs.length
                ? "el OS está publicado"
                : auto?.activa
                  ? `${filasOs.length} del OS: los publica sola la autopublicación (${(auto.detalle || auto.fase || "en marcha").replace(/\.$/, "")})`
                  : `${filasOs.length} del OS esperando (autopublicación apagada)`;
            const textoAstraura = filasAstraura.length
                ? ` · ${filasAstraura.length} de Astraura 1.58 esperan TU firma (la autopublicación no publica Astraura)`
                : "";
            return {
                clave,
                titulo: "Sin publicar",
                resumen: publicando
                    ? `publicando ${filasOs.length} commit(s)…`
                    : filas.length === 0
                      ? "todo publicado"
                      : `${textoOs}${textoAstraura}`,
                filas,
                cargando: carga,
                aviso: fallo,
                // Mientras publica no se ofrece otra vez: dos publicadores se pisarían el índice.
                acciones: [
                    ...(filasOs.length && !publicando
                        ? [
                              {
                                  clase: "publicar" as const,
                                  texto: fallo ? "Reintentar la publicación" : "Publicar en origin/main",
                                  destructiva: false,
                              },
                          ]
                        : []),
                    ...(filasAstraura.length ? [IR_A("Publicar Astraura 1.58 (Commits pendientes)", "commits#publicar-astraura")] : []),
                ],
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
            // (2026-10-09) Alex, con la captura delante: «basta de ilusiones». Esta ventana
            // enseñaba tres tarjetas «freellmapi · auto · callado · trabaja en CPA1007Kb» (latidos
            // de tres tandas), «3 en total» con cinco tarjetas debajo, «callado» para un agente
            // que en realidad pasaba tsc, y una «comprobación» que decía «0 en la Mac». Reglas:
            //   · una tarjeta = UNA TAREA viva, titulada por la tarea (no por el proveedor);
            //   · lo que dice cada tarjeta se contrasta con el proceso REAL (`ps`, `escritores`);
            //   · un latido que dice «escribiendo» sin proceso detrás es un fantasma: no cuenta
            //     como agente y se nombra aparte;
            //   · en tsc/pruebas/revisión no escribe ningún modelo: es el orquestador comprobando,
            //     y se dice así, no «callado».
            const escritores = d.escritores ?? null;
            const filasTodas = unaPorTarea(d.latidos).map((l) => {
                const proveedor = l.proveedor ?? l.modelo.split("/")[0];
                const modelo = l.modelo.split("/").slice(-1)[0];
                const sinModelo = !l.modelo || /^[-–\s]*$/.test(l.modelo);
                const modeloTexto = sinModelo ? "sin modelo asignado" : proveedor && modelo && proveedor !== modelo ? `${proveedor}/${modelo}` : l.modelo;
                const quieto = l.quietoSegundos ?? null;
                const fase = String(l.fase ?? "").toLowerCase();
                const sonando = fase === "analizando";
                const esperandoProveedor =
                    /esperando proveedor/i.test(fase) || (sonando && /esperando proveedor/i.test(String(l.subfase ?? "")));
                const externo = String(l.cola ?? "").startsWith("externo-");
                const enLaMac = (l.donde ?? "mac") === "mac";
                const proceso = escritores?.[l.tarea];
                const puerta = /^(tsc|tests?|testing|probando|revision|revisión|integrando|cableado|alcance|impacto|verificando)$/.test(fase);
                const etapa = avanceDe(l.fase, estadoDe(l.tarea));
                const nEtapa = etapa.etapa ? ETAPAS.indexOf(etapa.etapa as (typeof ETAPAS)[number]) + 1 : 0;
                const etapaTexto = etapa.etapa ? `etapa ${nEtapa} de ${ETAPAS.length} · ${etapa.etapa}` : "sin empezar";
                let estado: string;
                let porque: string;
                if (externo) {
                    estado = "trabajando fuera";
                    porque = `fase: ${l.fase ?? "sin fase"} · avisa al cambiar de fase (no escribe registro en la Mac)`;
                } else if (sonando) {
                    estado = "soñando";
                    porque = `sueño profundo · ${l.subfase || "analizando"} (lee, no escribe código)`;
                } else if (/esperando aprobaci|visto bueno/.test(fase)) {
                    // La rama está hecha y espera una decisión: no escribe nadie, y no es un fantasma.
                    estado = "esperando aprobación";
                    const revisor = (d.progreso[l.tarea] as { revisor?: string } | undefined)?.revisor;
                    porque =
                        revisor === "bloqueante"
                            ? "rama lista con revisión BLOQUEANTE: la reparación automática la rehace o la decide el director"
                            : "rama lista y en verde: espera tu visto bueno";
                } else if (esperandoProveedor) {
                    estado = "esperando modelo";
                    porque = `ningún modelo con cupo ahora mismo: espera su turno (lleva ${l.minutos} min)`;
                } else if (puerta) {
                    estado = proceso ? "corrigiendo" : "comprobando";
                    porque = proceso
                        ? `el modelo corrige lo que falló en ${fase} · proceso ${proceso.pid} vivo`
                        : `el orquestador pasa ${fase === "tsc" ? "los tipos (tsc)" : fase.startsWith("test") || fase === "probando" ? "las pruebas" : fase.startsWith("revis") ? "la revisión" : fase}: no escribe ningún modelo`;
                } else if (enLaMac && escritores && !proceso && (quieto === null || quieto > 90)) {
                    estado = "sin proceso";
                    porque = "el latido dice que escribe, pero no hay ningún proceso escribiendo esta tarea: es un latido viejo";
                } else if (quieto !== null && quieto > 180) {
                    estado = "sin escribir";
                    porque = `lleva ${Math.round(quieto / 60)} min sin escribir${proceso ? ` · el proceso ${proceso.pid} sigue vivo` : ""}`;
                } else {
                    estado = "escribiendo";
                    porque = `${bytesLegibles(l.bytesLog)}${proceso ? ` · proceso ${proceso.pid}` : ""}`;
                }
                const cola = String(l.cola ?? "").replace(/^cola-/, "");
                const fila: FilaMedidor = {
                    id: (l.donde ?? "mac") === "mac" ? l.tarea : `${l.tarea} · ${l.donde} · ${modelo || "agente"} · ${l.minutos} min`,
                    // El id ya va en la cabecera de la tarjeta: aquí, solo QUÉ es la tarea.
                    titulo: externo && l.titulo ? l.titulo : titulo(l.tarea) !== l.tarea ? titulo(l.tarea) : "sin título en su cola",
                    estado,
                    porcentaje: etapa.porcentaje,
                    etapa: etapaTexto,
                    quien: `${modeloTexto} · ${l.donde}${cola ? ` · tanda ${cola}` : ""}`,
                    desde: `${l.minutos} min`,
                    porque,
                    ficha: fichaDeAgente(l, d.progreso[l.tarea], d.obras?.[l.tarea], d.repoGitHub),
                    historial: d.historiales?.[l.tarea]?.slice(0, 6),
                    acciones: [],
                };
                return fila;
            });
            const fantasmas = [
                ...filasTodas.filter((f) => f.estado === "sin proceso"),
                ...(d.fantasmas ?? []).map((id) => ({ id })),
            ];
            const filas = filasTodas.filter((f) => f.estado !== "sin proceso");
            const cuenta = (e: string) => filas.filter((f) => f.estado === e).length;
            const partes = [
                [cuenta("escribiendo"), "escribiendo"],
                [cuenta("corrigiendo"), "corrigiendo"],
                [cuenta("sin escribir"), "sin escribir"],
                [cuenta("comprobando"), "comprobando"],
                [cuenta("esperando modelo"), "esperando modelo"],
                [cuenta("esperando aprobación"), "esperando aprobación"],
                [cuenta("soñando"), "soñando"],
                [cuenta("trabajando fuera"), "fuera"],
            ]
                .filter(([n]) => Number(n) > 0)
                .map(([n, t]) => `${n} ${t}`);
            return {
                clave,
                titulo: "Agentes",
                resumen:
                    filas.length === 0
                        ? `ningún agente trabajando${fantasmas.length ? ` · ${fantasmas.length} latido(s) viejo(s) descartado(s)` : ""}`
                        : `${filas.length} en total · ${partes.join(" · ")}${
                              fantasmas.length ? ` · ${fantasmas.length} latido(s) viejo(s) descartado(s): ${fantasmas.map((f) => f.id).join(", ")}` : ""
                          }`,
                filas,
                porcentajeMedio: mediaDeAvance(filas),
                acciones: [...ACCIONES_ASIGNAR, IR_A("Ver la ramificación", "procesos")],
                vacio: fantasmas.length
                    ? `Ningún agente trabajando. ${fantasmas.length} latido(s) decían lo contrario sin ningún proceso detrás: descartados.`
                    : "Ningún agente trabajando ahora mismo.",
            };
        }

        case "fallidas": {
            // (2026-10-09) Lo que falló en los últimos 3 días y sigue sin resolver: ni está en
            // main ni lo ha cumplido una sucesora de su cadena. Con quién lo retoma, para que
            // un fallo no sea un número rojo sin dueño.
            const FALLO = /^(fallo.*|sin_cambios|conflicto|interrumpida)$/;
            const limite = (ahora ?? Date.now()) - 3 * 24 * 3600 * 1000;
            const ids = Object.keys(d.progreso);
            const enMain = (id: string) => typeof d.asuntosDeMain === "string" && idIntegradoEnAsuntos(id, d.asuntosDeMain);
            const filas: FilaMedidor[] = [];
            for (const [id, v] of Object.entries(d.progreso)) {
                const est = String(v?.estado ?? "");
                if (!FALLO.test(est) || enMain(id)) continue;
                const t = Date.parse(String(v?.t ?? "").replace(" ", "T"));
                if (Number.isFinite(t) && t < limite) continue;
                const sucesoras = sucesorasDe(id, ids);
                if (sucesoras.some((k) => INTEGRADOS.has(d.progreso[k]?.estado ?? "") || enMain(k))) continue;
                // (2026-10-09) Lo que el director ya resolvió (la retiró por copia de algo integrado,
                // la rechazó) no es una fallida sin dueño aunque el vigilante aún no lo haya aplicado.
                const decidida = d.correcciones?.[id];
                if (decidida && /^(sustituida|rechazada|commit|hecho)$/.test(decidida.estado ?? "")) continue;
                const viva = sucesoras.find((k) => !MUERTOS_CADENA.has(d.progreso[k]?.estado ?? ""));
                const nota = decidida?.nota && decidida.estado !== est ? decidida.nota : String(v?.nota ?? "");
                const intento = /reintento gratuito (\d+)\/(\d+)/.exec(nota);
                const codex = /escalada a Codex[^·]*/.exec(nota);
                filas.push({
                    id,
                    titulo: titulo(id) !== id ? titulo(id) : "sin título en su cola",
                    estado: est.replace(/_/g, " "),
                    desde: v?.t,
                    porque: viva
                        ? `la rehace ${viva} (${d.progreso[viva]?.estado || "pendiente"})`
                        : intento
                          ? `la escalera del director la reintenta (intento ${intento[1]} de ${intento[2]}) · ${nota.slice(0, 120)}`
                          : codex
                            ? `la escalera del director la pasa a un modelo capaz: ${codex[0].trim()}`
                            : decidida?.estado === "bloqueante"
                              ? `necesita una persona: ${nota.replace(/^director:\s*/, "").slice(0, 140)}`
                              : nota.slice(0, 160) || "sin nota",
                    acciones: accionesDeBloqueada({ estado: est }),
                });
            }
            filas.sort((a, b) => String(b.desde ?? "").localeCompare(String(a.desde ?? "")));
            return {
                clave,
                titulo: "Fallidas sin resolver",
                resumen: filas.length
                    ? [
                          `${filas.length} sin resolver en 3 días`,
                          `${filas.filter((f) => /rehace|escalera/.test(f.porque ?? "")).length} ya con reparación en marcha`,
                          ...(() => {
                              const n = filas.filter((f) => /^necesita una persona/.test(f.porque ?? "")).length;
                              return n ? [`${n} ${n === 1 ? "necesita" : "necesitan"} a alguien`] : [];
                          })(),
                      ].join(" · ")
                    : "nada fallado sin resolver en los últimos 3 días",
                filas,
                acciones: [IR_A("Ver la ramificación", "procesos")],
                vacio: "Nada ha fallado sin resolverse en los últimos 3 días.",
            };
        }

        case "en-curso": {
            // (2026-09-22) Alex: «las tareas en curso y los agentes aún son los mismos
            // procesos cuando en realidad son conceptos diferentes». Y lo eran: esto hacía
            // `d.latidos.map(...)`, o sea UNA FILA POR AGENTE. Cuatro agentes sobre la misma
            // tarea salían como cuatro tareas, y los dos números no podían diferir nunca
            // —ayer los dos decían 8—. Son dos preguntas distintas:
            //   · Agentes        → cuántos TRABAJADORES hay vivos.
            //   · Tareas en curso → cuántas TAREAS DISTINTAS se están haciendo.
            // Así que aquí se agrupa por tarea y se dice cuántos agentes lleva cada una.
            const filas: FilaMedidor[] = agruparPorTarea(d.latidos).map(({ latido: l, agentes }) => {
                const avance = avanceDe(l.fase, estadoDe(l.tarea));
                const quienEs = `${l.proveedor ?? l.modelo.split("/")[0]} · ${l.modelo.split("/").slice(-1)[0]} en ${l.donde}`;
                const ola = olaDeTarea(d, l.tarea);
                const quien = agentes > 1 ? `${agentes} agentes · ${quienEs}` : quienEs;
                return {
                    id: l.tarea,
                    titulo: titulo(l.tarea),
                    estado: l.fase,
                    porcentaje: avance.porcentaje,
                    etapa: avance.etapa,
                    quien: ola ? `${ola} · ${quien}` : quien,
                    desde: `${l.minutos} min`,
                    porque: l.minutos > 45 ? "lleva mucho sin cambiar de fase" : undefined,
                    ficha: fichaDeTarea(
                        l.tarea,
                        d.progreso[l.tarea],
                        d.declarados?.[l.tarea],
                        d.obras?.[l.tarea],
                        d.repoGitHub,
                        l,
                        ola,
                    ),
                    historial: d.historiales?.[l.tarea]?.slice(0, 6),
                    acciones: [
                        { clase: "comprobar-agente", texto: "Comprobar", destructiva: false, objetivo: l.tarea },
                    ],
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
                    quien: olaDeTarea(d, id),
                    ficha: fichaDeTarea(
                        id,
                        v,
                        d.declarados?.[id],
                        d.obras?.[id],
                        d.repoGitHub,
                        undefined,
                        olaDeTarea(d, id),
                    ),
                    historial: d.historiales?.[id]?.slice(0, 6),
                    // Una rancia no ocupa a nadie: «Reasignar ya» la devuelve a pendiente y la
                    // pone la primera de la cola viva.
                    acciones: [
                        { clase: "asignar-tarea" as const, texto: "Reasignar ya", destructiva: false },
                        ...accionesDeTarea(v.estado),
                    ],
                }));
            const todas = [...rancias, ...filas];
            const medio = mediaDeAvance(todas);
            return {
                clave,
                titulo: "Tareas en curso",
                resumen:
                    filas.length === 0
                        ? "ninguna tarea en curso"
                        : `${filas.length} en marcha · ${d.latidos.length} agente(s) sobre ellas · ${medio} % de avance medio${
                              rancias.length ? ` · ${rancias.length} rancias` : ""
                          }`,
                filas: todas,
                porcentajeMedio: medio,
                acciones: [...ACCIONES_ASIGNAR, IR_A("Ver la ramificación", "procesos")],
                vacio: "Ninguna tarea en curso ahora mismo.",
            };
        }

        case "listas": {
            // Por qué NO las está cogiendo nadie, que es la pregunta de verdad cuando ves
            // «13 listas · 0 agentes». Son tres situaciones distintas y hasta ahora las tres
            // se veían igual: un número en rojo.
            // (2026-09-22) Decía «no hay orquestador vivo» con OCHO agentes escribiendo en la
            // nube: `enjambreVivo` mira el orquestador de la MAC, y con toda la tanda fuera
            // ese orquestador no tiene por qué estar. Un agente midiéndose a sí mismo es
            // mejor prueba de que el enjambre trabaja que cualquier proceso local.
            const agentesAhora = (d.latidos ?? []).length;
            const porQueNadieLasCoge = d.enjambrePausado
                ? "el enjambre está EN PAUSA: nadie las va a coger hasta que se reanude"
                : d.enjambreVivo
                  ? "el enjambre está vivo y las va cogiendo por tandas, según los trabajadores libres"
                  : agentesAhora > 0
                    ? `no hay orquestador en la Mac, pero ${agentesAhora} agente(s) están trabajando en otros medios`
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
            // Las que esperan a otra tarea NO se pueden coger, por mucho que estén
            // definidas: decir lo contrario es lo que hacía parecer averiado al enjambre.
            const libres = ejecutables.filter((t) => !t.esperaA?.length);
            const atadas = ejecutables.filter((t) => t.esperaA?.length);

            // (2026-09-22) LA VENTANA ENSEÑA LO QUE CUENTA LA PASTILLA, Y NADA MÁS.
            // Antes se listaban también las atadas, con su etiqueta «espera a otra tarea»:
            // la pastilla decía 1 y debajo había CINCO tarjetas. Peor aún, RM6, RM7 y RM8
            // salían a la vez aquí y en «Bloqueadas», que es donde de verdad viven. Una
            // tarea, un sitio. Las que esperan se nombran en una línea al pie, que dice
            // cuántas son y dónde mirarlas, sin fingir que son trabajo disponible.
            const filas: FilaMedidor[] = libres.map((t) => ({
                id: t.id,
                titulo: t.titulo,
                estado: "lista",
                // 0 % de seis etapas: definida y sin empezar. Con la barra al lado se ve
                // de un vistazo lo que queda por delante de cada una.
                porcentaje: 0,
                porque: t.ola ? `de la ola ${t.ola} · ${porQueNadieLasCoge}` : porQueNadieLasCoge,
                acciones: [
                    { clase: "asignar-tarea" as const, texto: "Asignar ya", destructiva: false },
                    { clase: "comprobar-asignacion" as const, texto: "¿Puede entrar?", destructiva: false },
                    ...accionesDeTarea("pendiente"),
                ],
            }));

            const colaDeAtadas = atadas.length
                ? ` · ${atadas.length} más espera${atadas.length === 1 ? "" : "n"} a otra tarea (${atadas
                      .map((t) => t.id)
                      .join(", ")}): están en «Bloqueadas»`
                : "";
            const resumen =
                libres.length === 0 && atadas.length === 0
                    ? "sin trabajo ejecutable"
                    : libres.length === 0
                      ? `ninguna se puede coger${colaDeAtadas}`
                      : `${libres.length} se pueden coger ya · ${porQueNadieLasCoge}${colaDeAtadas}`;

            return {
                clave,
                titulo: "Listas para trabajar",
                resumen: resumen + avisoGit,
                filas,
                porcentajeMedio: 0,
                acciones: [...ACCIONES_ASIGNAR, IR_A("Ver procesos", "procesos")],
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

        case "tokens": {
            // (2026-09-22) Alex: «un medidor de tokens por segundo en total sumando los de
            // todos los procesos de cada api de todo el puente, en tiempo real».
            //
            // Se midió primero quién publica tokens de verdad: solo Jev, que los saca del
            // `usage` que devuelve la API. Las pasarelas guardan llamadas, coste y
            // milisegundos; opencode y codex no devuelven `usage` en absoluto — por eso el
            // medidor de agentes mide bytes. Así que aquí se suma lo que TIENE contador y
            // lo que no lo tiene se nombra, una fila por proceso, con el porqué. Repartir
            // un tokens/s a ojo entre motores que no dicen sus tokens sería exactamente la
            // cifra inventada que llevamos toda la sesión quitando.
            const tk = d.tokens;
            const cifra = (v: number) => (v < 100 ? v.toFixed(1) : String(Math.round(v)));
            const nombreDe = (id: string) =>
                (tk?.fuentes ?? []).find((f) => f.id === id)?.nombre ?? id;

            const filas: FilaMedidor[] = [];
            for (const [id, v] of Object.entries(tk?.ahora?.fuentes ?? {})) {
                const unMin = tk?.un_minuto?.fuentes?.[id];
                filas.push({
                    id,
                    titulo: nombreDe(id),
                    estado: v > 0 ? "gastando" : "en reposo",
                    porcentaje: 0,
                    etapa: `${cifra(v)} tok/s`,
                    porque:
                        unMin === undefined
                            ? "medido entre las dos últimas muestras"
                            : `${cifra(unMin)} tok/s de media en el último minuto`,
                    acciones: [],
                });
            }
            for (const f of tk?.sin_contador ?? []) {
                // (2026-09-23) Un proceso que NO gasta y uno que gasta pero no lo publica
                // no son lo mismo, y aquí salían iguales. Los cuatro agentes de la nube
                // estaban escribiendo código mientras esta lista decía «no publica tokens»
                // en gris, junto a dos motores que ni siquiera estaban encendidos.
                const cuantos = f.agentes ?? 0;
                filas.push({
                    id: f.id,
                    titulo: f.nombre,
                    estado: cuantos > 0 ? "trabajando sin contador" : "no publica tokens",
                    porcentaje: 0,
                    etapa: cuantos > 0 ? `${cuantos} agente(s)` : "—",
                    porque: f.porque,
                    acciones: [],
                });
            }

            const total = tk?.ahora?.total;
            const media = tk?.un_minuto?.total;
            const sinContador = (tk?.sin_contador ?? []).length;
            // (2026-09-22) La cifra que manda es la MEDIA DEL ÚLTIMO MINUTO, no la de los
            // últimos 5 s. El gasto va a ráfagas —un agente calla un minuto y suelta miles
            // de tokens de golpe—, así que el instantáneo marca 0 casi siempre y parece
            // roto cuando no lo está. Un minuto es lo bastante corto para llamarse «ahora»
            // y lo bastante largo para que el número signifique algo. El instantáneo sigue
            // ahí, detrás, porque para ver un pico también hace falta.
            // (2026-09-23) La frase viene TAL CUAL del archivo cuando el archivo la trae.
            // Ayer esto se calculaba aquí otra vez y el archivo decía «0 tok/s ahora mismo»
            // mientras la pantalla decía «44,2 de media»: el mismo dato, dos cuentas. Una
            // cuenta, un sitio. Lo de abajo solo se usa si el archivo es viejo y no la trae.
            const resumen = !tk
                ? "el medidor de tokens no está escribiendo: ¿corre com.starseed.tokens?"
                : tk.resumen
                  ? tk.resumen
                  : media === 0
                  ? (() => {
                        const r = resumenTokensConLatidos(d.latidos);
                        if (r.sinLatidos) return "0 tok/s: no hay agentes trabajando";
                        if (r.escribiendo > 0) return `0 tok/s: ${r.escribiendo} escribiendo con motores sin contador (codex/pasarelas)`;
                        return `0 tok/s ahora: nadie está escribiendo — ${r.texto || "ninguno en fase conocida"}`;
                      })()
                  : media === undefined || media === null
                  ? total === undefined || total === null
                      ? "aún no hay dos muestras: una tasa necesita dos"
                      : `${cifra(total)} tok/s ahora · aún sin minuto entero${
                            sinContador ? ` · ${sinContador} proceso(s) no publican tokens` : ""
                        }`
                  : `${cifra(media)} tok/s de media en 1 min${
                        total !== undefined && total !== null ? ` · ${cifra(total)} tok/s en los últimos 5 s` : ""
                    }${sinContador ? ` · ${sinContador} proceso(s) no publican tokens` : ""}`;

            return {
                clave,
                titulo: "Tokens por segundo",
                resumen,
                filas,
                porcentajeMedio: 0,
                acciones: [],
                vacio: "Nadie está gastando tokens ahora mismo.",
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
                    : "sin medir todavía: pulsa «Buscar más capacidad en todos los medios»",
                filas,
                acciones: [...ACCIONES_ASIGNAR, IR_A("Ver la flota", "flota")],
                vacio: "Ningún contenedor medido aún. «Buscar más capacidad en todos los medios» sondea GitHub Actions, Hugging Face, Cloud Run y Colab.",
            };
        }

        case "credito-claude": {
            // (2026-10-04) Los LÍMITES DEL PLAN de Claude (sesión ~5 h, semanal y opcionalmente
            // modelo concreto) leídos desde ~/.starseed/limites-claude.json. No hay API: la
            // dirección los toma manualmente desde claude.ai → Uso y los guarda con
            // scripts/puente/limites_claude.py declarar …
            const cfg = d.limitesClaude;
            if (!cfg) {
                return {
                    clave,
                    titulo: "Claude · límites del plan",
                    resumen: "Sin lectura todavía: la dirección la toma de claude.ai → Uso en su próxima revisión.",
                    filas: [],
                    acciones: [],
                    vacio: "Sin lectura todavía: la dirección la toma de claude.ai → Uso en su próxima revisión.",
                };
            }
            const e = estadoLimitesClaude(cfg, Date.now());
            const filas: FilaMedidor[] = [];
            
            // Sesión
            if (e.sesion) {
                filas.push({
                    id: "sesion",
                    titulo: "Sesión (~5 h)",
                    estado: e.sesion.tono,
                    porque: `${e.sesion.pct} % · ${e.sesion.reinicio}, con proyección ${e.sesion.proyeccion !== null ? Math.round(e.sesion.proyeccion) + " %" : "sin coste"}`,
                    enlace: ENLACE_USO_CLAUDE,
                    acciones: [],
                    ficha: [
                        { etiqueta: "Usado", valor: `${e.sesion.pct} %` },
                        { etiqueta: "Queda", valor: `${e.sesion.queda} %` },
                        { etiqueta: "Reinicia", valor: e.sesion.reinicio },
                        { etiqueta: "Coste por revisión", valor: e.sesion.coste !== null ? `≤ ${e.sesion.coste} %` : "sin coste" },
                        { etiqueta: "Revisiones programadas antes del reinicio", valor: e.programadasEnSesion.toString() },
                        { etiqueta: "Leído", valor: e.lecturaHaceMin !== null ? `${e.lecturaHaceMin} min` : "desconocido" },
                    ],
                });
            }
            
            // Semana
            if (e.semana) {
                filas.push({
                    id: "semana",
                    titulo: "Semana",
                    estado: e.semana.tono,
                    porque: `${e.semana.pct} % · ${e.semana.reinicio}`, 
                    enlace: ENLACE_USO_CLAUDE,
                    acciones: [],
                    ficha: [
                        { etiqueta: "Usado", valor: `${e.semana.pct} %` },
                        { etiqueta: "Queda", valor: `${e.semana.queda} %` },
                        { etiqueta: "Reinicia", valor: e.semana.reinicio },
                        { etiqueta: "Coste por revisión", valor: e.semana.coste !== null ? `≤ ${e.semana.coste} %` : "sin coste" },
                        { etiqueta: "Revisiones programadas antes del reinicio", valor: e.programadasEnSemana.toString() },
                    ],
                });
            }
            
            // Semana · <modeloNombre> si hay modelo
            if (e.modelo && e.modeloNombre) {
                filas.push({
                    id: "modelo",
                    titulo: `Semana · ${e.modeloNombre}`,
                    estado: e.modelo.tono,
                    porque: `${e.modelo.pct} % · ${e.modelo.reinicio}`, 
                    enlace: ENLACE_USO_CLAUDE,
                    acciones: [],
                    ficha: [
                        { etiqueta: "Usado", valor: `${e.modelo.pct} %` },
                        { etiqueta: "Queda", valor: `${e.modelo.queda} %` },
                        { etiqueta: "Reinicia", valor: e.modelo.reinicio },
                        { etiqueta: "Coste por revisión", valor: e.modelo.coste !== null ? `≤ ${e.modelo.coste} %` : "sin coste" },
                    ],
                });
            }
            
            return {
                clave,
                titulo: "Claude · límites del plan",
                resumen: resumenLimitesClaude(e),
                filas,
                acciones: [],
                aviso: e.desactualizada || e.recomendacion ? (e.recomendacion || `Desactualizada: la lectura tiene más de 120 min`) : undefined,
                vacio: undefined,
            };
        }

        case "creditos": {
            const doc = d.creditosPago;
            if (!doc || !doc.medidores) {
                return {
                    clave,
                    titulo: "Créditos de pago",
                    resumen: "Sin lecturas todavía",
                    filas: [],
                    acciones: [],
                    vacio: "Sin lecturas todavía: el servicio com.starseed.medidores lee Claude y Codex por terminal cada 10 min.",
                };
            }
            const ahoraMs = ahora ?? Date.now();
            const estados = estadoCreditos(doc, ahoraMs);
            if (estados.length === 0) {
                return {
                    clave,
                    titulo: "Créditos de pago",
                    resumen: "Sin lecturas todavía",
                    filas: [],
                    acciones: [],
                    vacio: "Sin lecturas todavía: el servicio com.starseed.medidores lee Claude y Codex por terminal cada 10 min.",
                };
            }
            const peso = { peligro: 2, aviso: 1, ok: 0 } as const;
            const masUsada = (e: (typeof estados)[number]) =>
                e.ventanas.reduce((m, v) => Math.max(m, v.usado_pct), 0);
            const peor = estados.reduce((p, e) => {
                if (peso[e.tono] !== peso[p.tono]) return peso[e.tono] > peso[p.tono] ? e : p;
                return masUsada(e) > masUsada(p) ? e : p;
            }, estados[0]);
            const ventanaPeor = peor.ventanas.reduce((a, b) => (b.usado_pct > a.usado_pct ? b : a), peor.ventanas[0]);
            const resumen = ventanaPeor
                ? `${estados.length} créditos · peor: ${peor.nombre}, ${ventanaPeor.etiqueta} al ${ventanaPeor.usado_pct} %`
                : `${estados.length} créditos · peor: ${peor.nombre}`;
            const fchaReinicio = (iso: string) =>
                new Intl.DateTimeFormat("es", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
            const filas: FilaMedidor[] = estados.map(e => {
                const porque = [e.resumen, ...e.textoExtras].join(" · ");
                const ficha: DatoDeFicha[] = [];
                for (const v of e.ventanas) {
                    const partes = [`${v.usado_pct} % usado`, `queda ${v.queda} %`];
                    if (v.reiniciada) partes.push("se reinició");
                    else if (v.reinicia) partes.push(`reinicia ${fchaReinicio(v.reinicia)}`);
                    ficha.push({ etiqueta: v.etiqueta, valor: partes.join(" · ") });
                }
                if (e.saldo) {
                    const valor = new Intl.NumberFormat("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(e.saldo.valor);
                    ficha.push({ etiqueta: "Saldo", valor: `${valor} ${e.saldo.unidad}` });
                }
                ficha.push({ etiqueta: "Fuente", valor: doc.medidores[e.id]?.fuente ?? "—" });
                const hace = e.haceMin !== null ? `${e.haceMin} min` : "desconocido";
                ficha.push({ etiqueta: "Leído hace", valor: hace });
                return {
                    id: e.id,
                    titulo: e.nombre,
                    estado: e.tono,
                    porque,
                    enlace: doc.medidores[e.id]?.enlace,
                    acciones: [],
                    ficha,
                };
            });
            return {
                clave,
                titulo: "Créditos de pago",
                resumen,
                filas,
                acciones: [],
                vacio: "Sin lecturas todavía: el servicio com.starseed.medidores lee Claude y Codex por terminal cada 10 min.",
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

        case "integradas": {
            const ig = d.integradas;
            const repo = d.repoGitHub;
            const enMain = (ruta: string, linea?: number | null) =>
                repo ? `https://github.com/${repo}/blob/main/${ruta}${linea ? `#L${linea}` : ""}` : undefined;
            const enlaceCommit = (sha: string) => (repo ? `https://github.com/${repo}/commit/${sha}` : undefined);
            const cuando = (f: string) => f.slice(0, 16).replace("T", " ");
            const filas: FilaMedidor[] = (ig?.lista ?? []).map((t) => {
                const archivos = t.commits.flatMap((c) => c.archivos);
                const unicos = new Map<string, ArchivoCambiado>();
                for (const a of archivos) {
                    const p = unicos.get(a.ruta);
                    unicos.set(a.ruta, p ? { ruta: a.ruta, mas: p.mas + a.mas, menos: p.menos + a.menos } : { ...a });
                }
                const principal = t.commits.find((c) => c.clase === "integración") ?? t.commits[0];
                const desc = d.descripciones?.[t.id];
                const ficha: DatoDeFicha[] = [];
                if (t.ola) ficha.push({ etiqueta: "Ola", valor: tituloDeOla(t.ola) });
                if (desc) ficha.push({ etiqueta: "Encargo", valor: desc });
                ficha.push({
                    etiqueta: "Verificación",
                    valor: TERMINALES.has(d.progreso[t.id]?.estado ?? "")
                        ? "pasó sus puertas y está en main"
                        : "está en main (el orquestador no dejó constancia de sus puertas)",
                });
                for (const c of t.commits) {
                    ficha.push({
                        etiqueta: c.clase === "integración" ? "Commit de integración" : "Commit del agente",
                        valor: `${c.sha.slice(0, 8)} · ${cuando(c.fecha)} · ${resumenDeCambios(c.archivos)}`,
                        enlace: enlaceCommit(c.sha),
                    });
                }
                const lista = [...unicos.values()];
                for (const a of lista.slice(0, 12)) {
                    ficha.push({ etiqueta: "Archivo", valor: `${a.ruta} · +${a.mas} −${a.menos}`, enlace: enMain(a.ruta) });
                }
                if (lista.length > 12) ficha.push({ etiqueta: "Archivo", valor: `y ${lista.length - 12} más` });
                for (const u of t.ubicaciones.slice(0, 15)) {
                    ficha.push({
                        etiqueta: "Implementa",
                        valor: u.linea
                            ? `${u.tipo} ${u.nombre} · ${u.ruta}:${u.linea}`
                            : `${u.tipo} ${u.nombre} · ya no está en ${u.ruta} (se quitó o se renombró después)`,
                        enlace: u.linea ? enMain(u.ruta, u.linea) : undefined,
                        aviso: !u.linea,
                    });
                }
                if (!t.ubicaciones.length) {
                    ficha.push({ etiqueta: "Implementa", valor: "no define funciones ni tipos nuevos: cambia lo que ya había" });
                }
                return {
                    id: t.id,
                    titulo: `${t.id} · ${t.titulo || d.titulos[t.id] || "sin título"}`,
                    estado: "integrada",
                    etapa: resumenDeCambios(archivos),
                    porque: desc || principal?.asunto || "",
                    desde: cuando(t.fecha),
                    quien: d.progreso[t.id]?.modelo,
                    enlace: principal ? enlaceCommit(principal.sha) : undefined,
                    ficha,
                    acciones: [],
                    historica: false,
                };
            });
            return {
                clave,
                titulo: "Tareas integradas",
                resumen: ig
                    ? `${ig.total} tareas integradas en main · aquí las ${filas.length} más recientes, con sus cambios y dónde vive hoy lo que implementaron`
                    : "no se pudo leer main",
                filas,
                acciones: [IR_A("Ver olas e informes", "olas")],
                vacio: "Ninguna tarea del enjambre integrada en main.",
            };
        }

        case "ola-activa":
        default: {
            const filas = filasDeOlasActivas(d, d.repoGitHub);
            const olas = d.olasActivas ?? [];
            const agentes = olas.reduce((n, o) => n + o.agentes, 0);
            const tareas = olas.reduce((n, o) => n + o.tareas.length, 0);
            const integradas = filas.filter((f) => !f.id.startsWith("ola:") && f.estado === "integrada").length;
            return {
                clave: "ola-activa",
                titulo: olas.length > 1 ? "Olas activas" : "Ola activa",
                resumen: olas.length
                    ? `${olas.length} ola(s) en marcha: ${olas.map((o) => o.titulo).join(" · ")} — ` +
                      `${agentes} agente(s) · ${integradas} de ${tareas} tarea(s) integradas`
                    : d.olaActiva || "ninguna ola en marcha",
                filas,
                porcentajeMedio: tareas ? Math.round((integradas / tareas) * 100) : undefined,
                acciones: [IR_A("Ver olas e informes", "olas")],
                vacio: "Ninguna ola en marcha: ni la Mac ni la nube tienen agentes sobre una cola.",
            };
        }
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
    "credito-claude",
    "creditos",
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
