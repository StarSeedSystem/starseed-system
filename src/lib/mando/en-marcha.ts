/**
 * (2026-11-11, MED1111E) «Qué corre ahora y qué acaba de terminar», en un solo lugar y en orden:
 * el carril del director de Claude, la puerta de integración y la publicación.
 *
 * `EnMarcha` es lo que lee la ruta de medidores y lo que viaja a las otras neuronas: solo ids, títulos,
 * estados, cuentas y tiempos (ver `carril-claude.ts` y `puerta-integracion.ts`); nunca el prompt de una
 * tarea ni una ruta del disco. `vistaEnMarcha` lo convierte en lo que se pinta, calculando las edades
 * con la hora del que mira. Módulo puro: lo importa código de cliente.
 */
import { agentesDeCarrilClaude, duracionCorta, leerRegistroCarril, limpiarTexto, vistaCarril, type LecturaCarril, type TareaCarril, type VistaCarril } from "./carril-claude";
import { parsearEstadoPuerta, textoPruebas, vistaPuerta, type EstadoPuerta, type VistaPuerta } from "./puerta-integracion";
import { sanearPrueba, type PruebaParaEnviar } from "./pruebas-vivas"; // PRB1111V
import { sanearRonda, vistaRondaEnviada, type RondaParaEnviar } from "./ronda-aparatos"; // RON1112C
import { leerEstadoDireccion, vistaDireccion, type LecturaDireccion, type VistaDireccion } from "./procesos-direccion"; // MED1113A

export interface EnMarcha {
    /** Cuándo se leyó (ms de época). */
    generadoMs: number;
    carril: LecturaCarril | null;
    puerta: EstadoPuerta | null;
    /** La autopublicación, ya en la lista blanca de `publicacionParaEnviar`. */
    publicacion?: AutopublicacionVista | null;
    /** (PRB1111V) La versión de prueba en marcha o fallida sin sustituir; null/ausente = no consta ninguna. */
    pruebas?: PruebaParaEnviar | null;
    /** (RON1112C) La ronda de aparatos en vigor (nada pesado empieza en la Mac mientras dura); ausente = no hay. */
    ronda?: RondaParaEnviar | null;
    /** (MED1113A) Los procesos de la dirección medidos por `procesos_direccion.py`; null = no se pudo medir. */
    direccion?: LecturaDireccion | null;
}

/** Lo que Genesis ya sabe de la autopublicación (`DatosMedidores["autopublicacion"]`), más cuándo se anotó. */
export interface AutopublicacionVista {
    activa: boolean;
    fase?: string;
    detalle?: string;
    ultimaMs?: number;
    actualizadoMs?: number;
}

/** PURA. De lo que lee la ruta (`leerAutopublicacion`) a lo que viaja: fase como palabra corta, detalle sin rutas. */
export function publicacionParaEnviar(a: unknown): AutopublicacionVista | null {
    if (!a || typeof a !== "object") return null;
    const x = a as Record<string, unknown>;
    const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
    const fase = typeof x.fase === "string" && /^[a-z_]{1,20}$/.test(x.fase) ? x.fase : undefined;
    const detalle = limpiarTexto(x.detalle, 200);
    return {
        activa: x.activa === true,
        ...(fase ? { fase } : {}),
        ...(detalle ? { detalle } : {}),
        ...(ms(x.ultimaMs) ? { ultimaMs: ms(x.ultimaMs) } : {}),
        ...(ms(x.actualizadoMs) ? { actualizadoMs: ms(x.actualizadoMs) } : {}),
    };
}

export interface VistaPublicacion {
    estado: "publicando" | "en-reposo" | "bloqueada" | "apagada" | "sin-senal" | "sin-datos";
    texto: string;
    ultimaHaceMin: number | null;
}

/** Más de esto sin anotar nada y una autopublicación «en CI» se da por sin señal. */
export const TOPE_PUBLICACION_SIN_SENAL_MIN = 90;

export function vistaPublicacion(a: AutopublicacionVista | null | undefined, ahora: number = Date.now()): VistaPublicacion {
    if (!a) return { estado: "sin-datos", texto: "sin datos de la autopublicación en esta neurona", ultimaHaceMin: null };
    const ultimaHaceMin = a.ultimaMs ? Math.max(0, Math.floor((ahora - a.ultimaMs) / 60_000)) : null;
    const ultima = ultimaHaceMin === null ? "" : ` · última publicación hace ${duracionCorta(ultimaHaceMin)}`;
    const detalle = limpiarTexto(a.detalle, 200);
    if (!a.activa) return { estado: "apagada", texto: `autopublicación apagada${ultima}`, ultimaHaceMin };
    const fase = String(a.fase ?? "");
    if (fase === "ci" || fase === "verificando") {
        const hace = a.actualizadoMs ? Math.max(0, Math.floor((ahora - a.actualizadoMs) / 60_000)) : null;
        if (hace !== null && hace > TOPE_PUBLICACION_SIN_SENAL_MIN) {
            return { estado: "sin-senal", texto: `«${fase}» sin novedad desde hace ${duracionCorta(hace)}${ultima}`, ultimaHaceMin };
        }
        return { estado: "publicando", texto: `${detalle || (fase === "ci" ? "esperando el CI de GitHub" : "verificando la publicación")}${ultima}`, ultimaHaceMin };
    }
    if (fase === "bloqueado") return { estado: "bloqueada", texto: `bloqueada: ${detalle || "sin motivo anotado"}${ultima}`, ultimaHaceMin };
    return { estado: "en-reposo", texto: `${detalle || "en reposo, sin nada que publicar"}${ultima}`, ultimaHaceMin };
}

export interface UltimoTerminado {
    quien: "puerta" | "publicacion" | "carril" | "direccion";
    texto: string;
    cuandoMs: number;
}

export interface VistaEnMarcha {
    /** (MED1113A) Los agentes de la dirección: activos, en silencio y recién terminados. */
    direccion: VistaDireccion;
    carril: VistaCarril;
    puerta: VistaPuerta;
    publicacion: VistaPublicacion;
    /** (PRB1111V) El build de prueba, solo si hay rastro de uno en marcha o fallido. */
    prueba: VistaPrueba | null;
    /** (RON1112C) La ronda de aparatos, sólo si está en vigor a esta hora. NO es un proceso: no cuenta como «corre». */
    ronda: { activa: true; quedaS: number; texto: string } | null;
    /** Hay algo corriendo de verdad (agentes vivos, puerta en marcha o publicación en curso). */
    algoCorre: boolean;
    /** Cuántos procesos vivos hay en total (agentes de la dirección + agentes del carril + puerta + publicación + prueba). */
    vivos: number;
    ultimo: UltimoTerminado | null;
    /** Una frase: lo que corre, o «nada corre ahora; lo último fue…». */
    frase: string;
}

export interface VistaPrueba {
    estado: "esperando-main" | "en-cola" | "compilando" | "publicando" | "fallo";
    etiqueta: string;
    texto: string;
    plataformas: { titulo: string; estado: string; detalle: string }[];
}

/** (PRB1111V) Una línea por plataforma: dónde va y cuánto lleva frente a lo que suele tardar. PURA. */
export function vistaPrueba(p: PruebaParaEnviar | null | undefined, ahora: number): VistaPrueba | null {
    if (!p) return null;
    const plataformas = p.plataformas.map((x) => {
        const lleva = x.desdeMs ? Math.max(0, Math.round((ahora - x.desdeMs) / 60_000)) : null;
        const partes: string[] = [];
        if (x.estado === "compilando") {
            if (lleva !== null) partes.push(`lleva ${duracionCorta(lleva)}`);
            if (x.pasoActual) partes.push(`paso «${x.pasoActual}»${x.pasosHechos !== null && x.pasosTotal ? ` (${x.pasosHechos} de ${x.pasosTotal})` : ""}`);
            if (x.tipicoMin !== null && lleva !== null) partes.push(x.tipicoMin - lleva > 0 ? `suele tardar ${x.tipicoMin} min · faltan unos ${x.tipicoMin - lleva}` : `suele tardar ${x.tipicoMin} min · ya pasó`);
            else partes.push("aún no se sabe cuánto suele tardar");
        }
        return { titulo: x.titulo, estado: x.estado, detalle: partes.join(" · ") };
    });
    const nombres = (e: string) => plataformas.filter((x) => x.estado === e).map((x) => x.titulo).join(", ");
    const texto =
        p.fase === "esperando-main" ? `espera ${p.esperaA ?? "a que main tenga el commit"}`
        : p.fase === "compilando" ? `compilando ${nombres("compilando")}${nombres("en-cola") ? ` · en cola ${nombres("en-cola")}` : ""}${p.falloEn.length ? ` · falló ${p.falloEn.join(", ")}` : ""}`
        : p.fase === "publicando" ? "compilada; publicando latest-prueba.json y limpieza"
        : p.fase === "en-cola" ? `en cola en GitHub (${nombres("en-cola") || "sin plataforma"})`
        : `falló ${p.falloEn.join(", ") || "una plataforma"}; sigue así hasta que una prueba nueva la sustituya`;
    return { estado: p.fase as VistaPrueba["estado"], etiqueta: p.etiqueta, texto, plataformas };
}

/** PURA. Lo que se pinta, con las edades calculadas a la hora de `ahora`. */
export function vistaEnMarcha(e: EnMarcha | null | undefined, ahora: number = Date.now()): VistaEnMarcha {
    const publicacion = e?.publicacion ?? null;
    const carril = vistaCarril(e?.carril, ahora);
    const direccion = vistaDireccion(e?.direccion, ahora); // MED1113A
    const puerta = vistaPuerta(e?.puerta, ahora);
    const pub = vistaPublicacion(publicacion, ahora);
    const prueba = vistaPrueba(e?.pruebas, ahora); // PRB1111V
    const ronda = vistaRondaEnviada(e?.ronda, ahora); // RON1112C
    const vivosCarril = carril.estado === "vivo" ? carril.agentes.length : 0;
    const puertaViva = puerta.estado === "corriendo" ? 1 : 0;
    const pubViva = pub.estado === "publicando" ? 1 : 0;
    // PRB1111V: una prueba esperando a main es una espera real, pero no un proceso vivo; compilando, en cola o publicando sí.
    const pruebaViva = prueba && ["compilando", "publicando", "en-cola"].includes(prueba.estado) ? 1 : 0;
    // MED1113A: los agentes de la dirección con señal medida reciente; los «en silencio» no cuentan.
    const vivosDireccion = direccion.activos.length;
    const vivos = vivosDireccion + vivosCarril + puertaViva + pubViva + pruebaViva;

    const candidatos: UltimoTerminado[] = [];
    if (puerta.estado === "verde" || puerta.estado === "rojo") {
        const ramas = puerta.ramas.map((r) => r.replace(/^opus1106\//, "")).join(", ") || "la puerta";
        candidatos.push({
            quien: "puerta",
            cuandoMs: puerta.finMs ?? 0,
            texto: puerta.estado === "verde" ? `la puerta integró ${ramas} en verde${puerta.pruebas ? ` (${textoPruebas(puerta.pruebas)})` : ""}` : `la puerta dejó ${ramas} en rojo${puerta.fallo ? ` (${puerta.fallo})` : ""}`,
        });
    }
    if (publicacion?.ultimaMs) candidatos.push({ quien: "publicacion", cuandoMs: publicacion.ultimaMs, texto: "se publicó el OS" });
    const cerrada = carril.ultimaCerrada;
    if (cerrada?.cerradaMs) candidatos.push({ quien: "carril", cuandoMs: cerrada.cerradaMs, texto: `el carril de Claude cerró ${cerrada.id}` });
    const terminado = direccion.terminados[0];
    if (terminado?.cerradoMs) candidatos.push({ quien: "direccion", cuandoMs: terminado.cerradoMs, texto: `terminó ${terminado.id} (${terminado.porque || "cerrado"})` });
    const ultimo = candidatos.filter((c) => c.cuandoMs > 0).sort((a, b) => b.cuandoMs - a.cuandoMs)[0] ?? null;

    let frase: string;
    if (vivos > 0) {
        const partes = [
            vivosDireccion ? `${vivosDireccion} ${vivosDireccion === 1 ? "agente" : "agentes"} de la dirección` : "",
            vivosCarril ? `${vivosCarril} ${vivosCarril === 1 ? "agente" : "agentes"} de Claude` : "",
            puertaViva ? "la puerta de integración" : "",
            pubViva ? "la publicación" : "",
            pruebaViva && prueba ? `la ${prueba.etiqueta}` : "",
        ].filter(Boolean);
        const silencio = direccion.enSilencio.length ? ` Ojo: ${direccion.enSilencio.length} de la dirección en silencio (${direccion.enSilencio.map((p) => p.id).join(", ")}).` : "";
        frase = `Corre ahora: ${partes.join(", ")}.${silencio}`;
    } else {
        const cuando = ultimo ? ` Lo último que terminó: ${ultimo.texto}, hace ${duracionCorta(Math.max(0, Math.floor((ahora - ultimo.cuandoMs) / 60_000)))}.` : " No consta cuándo terminó lo último.";
        const avisos = [
            direccion.enSilencio.length ? `${direccion.enSilencio.length} de la dirección en silencio (${direccion.enSilencio.map((p) => p.id).join(", ")})` : "",
            // null = la ruta intentó medir y el script no contestó; ausente = lectura antigua u otra neurona sin el campo.
            e?.direccion === null ? "no se pudo medir los procesos de la dirección" : "",
            carril.estado === "sin-latido" ? "el carril de Claude tiene tareas abiertas pero sin latido" : "", puerta.estado === "sin-senal" ? "la puerta no da señal" : "", pub.estado === "sin-senal" ? "la publicación no da señal" : ""].filter(Boolean);
        const pruebaAviso = prueba ? ` Prueba: ${prueba.etiqueta} ${prueba.texto}.` : "";
        frase = `No corre nada ahora.${cuando}${pruebaAviso}${avisos.length ? ` Ojo: ${avisos.join("; ")}.` : ""}`;
    }
    if (ronda) frase = `${ronda.texto} ${frase}`; // RON1112C: lo primero que hay que saber de la Mac
    return { direccion, carril, puerta, publicacion: pub, prueba, ronda, algoCorre: vivos > 0, vivos, ultimo, frase };
}

/**
 * PURA. Lo que llega de otra neurona (la foto del líder) pasado por la lista blanca: la misma que sale de
 * `leerRegistroCarril` / `parsearEstadoPuerta`, de modo que un dato mal formado o con rutas no entra.
 */
export function sanearEnMarcha(crudo: unknown): EnMarcha | null {
    if (!crudo || typeof crudo !== "object") return null;
    const x = crudo as { generadoMs?: unknown; carril?: unknown; puerta?: unknown; publicacion?: unknown };
    const generadoMs = Number(x.generadoMs);
    const c = x.carril && typeof x.carril === "object" ? (x.carril as { latidoMs?: unknown; tareas?: unknown }) : null;
    // El carril viaja ya sin prompt; se vuelve a pasar por el lector para que la forma sea la de siempre.
    const carril = c
        ? leerRegistroCarril({
              latido: c.latidoMs,
              tareas: (Array.isArray(c.tareas) ? c.tareas : []).map((t: TareaCarril) => ({
                  id: t?.id, titulo: t?.titulo, estado: t?.estado, ola: t?.ola, desde: t?.desdeMs, cerrada: t?.cerradaMs,
              })),
          })
        : null;
    const p = x.puerta && typeof x.puerta === "object" ? (x.puerta as EstadoPuerta) : null;
    const puerta = p
        ? parsearEstadoPuerta({
              nombre: p.nombre, ramas: p.ramas, base: p.base, paso: p.paso, inicio: p.inicioMs, actualizado: p.actualizadoMs,
              fin: p.finMs, resultado: p.resultado, pruebas: p.pruebas, fallo: p.fallo,
          })
        : null;
    const publicacion = publicacionParaEnviar(x.publicacion);
    const pruebas = sanearPrueba((x as { pruebas?: unknown }).pruebas); // PRB1111V
    const ronda = sanearRonda((x as { ronda?: unknown }).ronda); // RON1112C
    const direccion = leerEstadoDireccion((x as { direccion?: unknown }).direccion); // MED1113A
    if (!carril && !puerta && !publicacion && !pruebas && !ronda && !direccion) return null;
    const origen = p?.origen === "log" ? "log" : "estado";
    return { generadoMs: Number.isFinite(generadoMs) ? generadoMs : 0, carril, puerta: puerta ? { ...puerta, origen } : null, publicacion, ...(pruebas ? { pruebas } : {}), ...(ronda ? { ronda } : {}), ...(direccion ? { direccion } : {}) };
}

export { agentesDeCarrilClaude };
