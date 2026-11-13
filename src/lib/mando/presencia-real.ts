/**
 * (AST1113A · 2026-11-13) Las tres cifras de la tira de presencia de `/agent` («N procesos activos · M agentes
 * vivos · K aprobaciones pendientes»), leídas de los MISMOS medidores que el pulso de MetaGenesis.
 *
 * Alex, con la página delante: «hay 2 indicadores de agentes activos los cuales dicen informacion diferente».
 * Arriba, «2 agentes» era la longitud de una lista de demostración escrita a mano en la página (siempre 2); debajo,
 * «8 agentes vivos» era lo que el backend de Astraura 1.58 declaraba de su enjambre (`total_active_agents`),
 * sondeado cada 30 s. Ninguno de los dos era lo que mide MetaGenesis. Regla: «basta de ilusiones».
 *
 * De dónde sale cada cifra ahora (y ninguna se cuenta aquí otra vez):
 *   · procesos activos      = la pastilla «En curso» (`cifraDePastilla` de `GET /api/mando/medidores?clave=en-curso`):
 *                             tareas que alguien está haciendo ahora, con los procesos de la dirección (§8 de
 *                             `architecture/metagenesis-autonoma.md`);
 *   · agentes vivos         = la pastilla «Agentes» (`cifraDePastilla` de `?clave=agentes`): la que coteja
 *                             «Comprobar ahora»;
 *   · aprobaciones pendientes = las fichas de visto bueno (`GET /api/mando/aprobaciones`): tareas en
 *                             `esperando_aprobacion` en `progreso.json`.
 * Si una lectura no llega (web publicada sin esas rutas, cuenta sin acceso, sin red), esa cifra NO se pinta:
 * se dice qué falta y por qué. Una cifra que no es de ahora lleva su edad.
 *
 * PURO: lo importa el navegador y lo prueba `__tests__/presencia-real.test.ts`.
 */
import { cifraDePastilla, type DetalleMedidor } from "./medidores";

/** Una cifra se da por «en vivo» si sus datos tienen como mucho este tiempo y el servidor no la marcó obsoleta. */
export const EN_VIVO_MS = 60_000;
/** Cada cuánto relee la tira (igual que el sondeo que sustituye). */
export const SONDEO_PRESENCIA_MS = 30_000;
/** Sin acceso a ninguna de las tres (web publicada, sin sesión, sin permiso) se vuelve a probar cada 5 min. */
export const PAUSA_SIN_ACCESO_MS = 5 * 60_000;

/** Lo que devuelve `fetch` ya leído: el cuerpo si fue 2xx, o el código (null = ni siquiera hubo respuesta). */
export type Lectura<T> = { ok: true; cuerpo: T; leidoMs: number } | { ok: false; estado: number | null; leidoMs: number };

/** La parte de la respuesta de `/api/mando/medidores` que se usa aquí. */
export interface RespuestaMedidor {
    detalle?: Partial<Pick<DetalleMedidor, "cuenta" | "filas" | "aviso" | "resumen">> | null;
    datosDe?: string | null;
    obsoleto?: boolean;
    puerta?: { usada?: boolean; desde?: string | null; haceMin?: number | null } | null;
}

export interface RespuestaAprobaciones {
    aprobaciones?: unknown;
}

export type ClaveCifra = "procesos" | "agentes" | "aprobaciones";

/** Una cifra tal como se guarda entre sondeos. */
export interface CifraPresencia {
    valor: number | null;
    /** Cuándo se midió el dato (no cuándo llegó): `datosDe` del medidor o la hora de la lectura. */
    medidoMs: number | null;
    /** Por qué no hay cifra (o por qué la que hay es la anterior). */
    motivo: string | null;
    /** El mismo motivo en dos o tres palabras, para la línea visible en pantallas pequeñas. */
    motivoCorto: string | null;
    /** El servidor la marcó obsoleta (su reunión es vieja). */
    obsoleto: boolean;
    /** Aviso del propio medidor (p. ej. «Dirección: no se pudo medir…»). */
    aviso: string | null;
    /** Parte de los datos llegó de otra neurona por la puerta de datos. */
    desde: string | null;
}

export type EstadoPresencia = Record<ClaveCifra, CifraPresencia>;

export const CIFRA_VACIA: CifraPresencia = { valor: null, medidoMs: null, motivo: null, motivoCorto: null, obsoleto: false, aviso: null, desde: null };

/** PURA. Por qué no se pudo leer una cifra, en castellano y sin tecnicismos de más. */
export function motivoSinCifra(estado: number | null): { corto: string; largo: string; definitivo: boolean } {
    if (estado === null) {
        return { corto: "sin conexión", largo: "no hubo respuesta del servidor de Genesis (sin red o servidor parado)", definitivo: false };
    }
    if (estado === 404) {
        return {
            corto: "no disponible aquí",
            largo: "esta copia de StarSeed no sirve los medidores de MetaGenesis (la web publicada no los tiene): ábrela en la Mac o en una neurona con MetaGenesis",
            definitivo: true,
        };
    }
    if (estado === 401) return { corto: "sin sesión", largo: "hace falta iniciar sesión con una cuenta de MetaGenesis para leer los medidores", definitivo: true };
    if (estado === 403) return { corto: "sin acceso", largo: "esta cuenta no tiene acceso a los medidores de MetaGenesis", definitivo: true };
    if (estado === 429) return { corto: "demasiadas lecturas", largo: "el servidor frenó las lecturas por exceso de peticiones; se vuelve a intentar en 30 s", definitivo: false };
    if (estado === 503) return { corto: "acceso sin comprobar", largo: "no se pudo comprobar el acceso ahora (servicio de cuentas caído); se vuelve a intentar en 30 s", definitivo: false };
    return { corto: `error ${estado}`, largo: `el servidor de Genesis falló al medir (error ${estado}); se vuelve a intentar en 30 s`, definitivo: false };
}

function fechaMs(iso: string | null | undefined): number | null {
    if (typeof iso !== "string") return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t > 0 ? t : null;
}

/** PURA. La cifra de una pastilla de medidor (la MISMA función que usa el pulso de MetaGenesis). */
export function cifraDeMedidor(l: Lectura<RespuestaMedidor>, previa: CifraPresencia = CIFRA_VACIA): CifraPresencia {
    if (l.ok) {
        const d = l.cuerpo?.detalle;
        if (d && Array.isArray(d.filas)) {
            const puerta = l.cuerpo.puerta;
            return {
                valor: cifraDePastilla({ cuenta: d.cuenta, filas: d.filas }),
                medidoMs: fechaMs(l.cuerpo.datosDe) ?? l.leidoMs,
                motivo: null,
                motivoCorto: null,
                obsoleto: l.cuerpo.obsoleto === true,
                aviso: typeof d.aviso === "string" && d.aviso.trim() ? d.aviso.trim() : null,
                desde: puerta?.usada && typeof puerta.desde === "string" && puerta.desde ? puerta.desde : null,
            };
        }
        return conFallo(previa, { corto: "sin cifra", largo: "la respuesta del medidor no trae su cifra", definitivo: false });
    }
    return conFallo(previa, motivoSinCifra(l.estado));
}

/** PURA. Las aprobaciones pendientes: cuántas fichas de visto bueno hay (se leen en el momento). */
export function cifraDeAprobaciones(l: Lectura<RespuestaAprobaciones>, previa: CifraPresencia = CIFRA_VACIA): CifraPresencia {
    if (l.ok) {
        const lista = l.cuerpo?.aprobaciones;
        if (Array.isArray(lista)) return { ...CIFRA_VACIA, valor: lista.length, medidoMs: l.leidoMs };
        return conFallo(previa, { corto: "sin cifra", largo: "la respuesta de las aprobaciones no trae la lista", definitivo: false });
    }
    return conFallo(previa, motivoSinCifra(l.estado));
}

/**
 * Un fallo pasajero (sin red, 429, 5xx) conserva la última cifra buena CON su hora de medida (así se pinta con
 * su edad); un fallo definitivo (404, 401, 403) la borra: esa cifra ya no se puede afirmar.
 */
function conFallo(previa: CifraPresencia, m: { corto: string; largo: string; definitivo: boolean }): CifraPresencia {
    if (!m.definitivo && previa.valor !== null) return { ...previa, motivo: `última lectura fallida: ${m.largo}`, motivoCorto: m.corto };
    return { ...CIFRA_VACIA, motivo: m.largo, motivoCorto: m.corto };
}

/** PURA. «hace 3 min», «hace 2 h»… a partir de milisegundos. */
export function haceTexto(ms: number): string {
    const min = Math.max(0, Math.floor(ms / 60_000));
    if (min < 1) return "hace menos de 1 min";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export interface FiguraVista {
    clave: ClaveCifra;
    valor: number | null;
    /** null = en vivo; si no, «hace N min». */
    edad: string | null;
}

export interface VistaPresencia {
    /** cargando = aún no llegó la primera lectura; sin-cifras = ninguna se pudo leer; con-cifras = al menos una. */
    estado: "cargando" | "con-cifras" | "sin-cifras";
    figuras: Record<ClaveCifra, FiguraVista>;
    /** La edad de la cifra más vieja que se enseña, si alguna no es de ahora. */
    edad: string | null;
    /** Lo que falta, corto, para la línea visible («sin sesión», «no disponible aquí»…). */
    faltaCorto: string | null;
    /** Lo que falta y por qué, entero (título, lector de pantalla y el resumen accesible). */
    faltaLargo: string | null;
    /** Avisos de los medidores (p. ej. la dirección sin medir) y la neurona de origen. */
    avisos: string[];
    /** Una frase completa para lectores de pantalla y para el título. */
    resumen: string;
}

const NOMBRES: Record<ClaveCifra, [string, string]> = {
    procesos: ["proceso activo", "procesos activos"],
    agentes: ["agente vivo", "agentes vivos"],
    aprobaciones: ["aprobación pendiente", "aprobaciones pendientes"],
};

/** Qué se lee: «En curso», «Agentes» y las fichas de visto bueno. */
export const ORIGEN: Record<ClaveCifra, string> = {
    procesos: "«En curso» del pulso de MetaGenesis",
    agentes: "«Agentes» del pulso de MetaGenesis",
    aprobaciones: "las fichas de visto bueno de MetaGenesis",
};

/** PURA. Lo que pinta la tira (y el punto de la orbe) a la hora `ahora`. `null` = todavía no se leyó nada. */
export function vistaPresencia(e: EstadoPresencia | null, ahora: number): VistaPresencia {
    const claves: ClaveCifra[] = ["procesos", "agentes", "aprobaciones"];
    const figuras = {} as Record<ClaveCifra, FiguraVista>;
    if (!e) {
        for (const c of claves) figuras[c] = { clave: c, valor: null, edad: null };
        return { estado: "cargando", figuras, edad: null, faltaCorto: null, faltaLargo: null, avisos: [], resumen: "Midiendo con los medidores de MetaGenesis…" };
    }
    let peor = -1;
    for (const c of claves) {
        const x = e[c];
        const viejo = x.medidoMs === null ? 0 : Math.max(0, ahora - x.medidoMs);
        const enVivo = x.valor !== null && !x.obsoleto && !x.motivo && viejo <= EN_VIVO_MS;
        figuras[c] = { clave: c, valor: x.valor, edad: x.valor === null || enVivo ? null : haceTexto(viejo) };
        if (x.valor !== null && !enVivo) peor = Math.max(peor, viejo);
    }
    const faltan = claves.filter((c) => e[c].valor === null);
    const motivos = [...new Set(faltan.map((c) => e[c].motivo).filter((m): m is string => !!m))];
    const cortos = [...new Set(faltan.map((c) => e[c].motivoCorto ?? "sin leer"))];
    const avisos = [
        ...new Set(
            claves.flatMap((c) => [
                ...(e[c].aviso ? [e[c].aviso as string] : []),
                ...(e[c].desde ? [`parte de los datos llegan de ${e[c].desde} por la puerta de datos`] : []),
                ...(e[c].valor !== null && e[c].motivo ? [e[c].motivo as string] : []),
            ]),
        ),
    ];
    const edad = peor >= 0 ? haceTexto(peor) : null;
    const estado = faltan.length === claves.length ? "sin-cifras" : "con-cifras";
    const faltaLargo = faltan.length
        ? `${faltan.length === claves.length ? "Sin cifras reales" : `Sin ${faltan.map((c) => NOMBRES[c][1]).join(" ni ")}`}: ${motivos.join(" · ") || "no se pudieron leer"}.`
        : null;
    const partes = claves
        .filter((c) => e[c].valor !== null)
        .map((c) => `${e[c].valor} ${e[c].valor === 1 ? NOMBRES[c][0] : NOMBRES[c][1]} (${ORIGEN[c]})`);
    const resumen = [
        partes.length ? `${partes.join(" · ")}${edad ? `, medido ${edad}` : ", en vivo"}.` : "",
        faltaLargo ?? "",
        avisos.length ? `${avisos.join(". ")}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
    return { estado, figuras, edad, faltaCorto: cortos.length ? cortos.join(" · ") : null, faltaLargo, avisos, resumen };
}

/** PURA. Lo que dice el punto de la orbe: la suma de las tres cifras, o nada si falta alguna (una suma a medias mentiría). */
export function totalDePresencia(v: VistaPresencia): number | null {
    const claves = ["procesos", "agentes", "aprobaciones"] as const;
    if (claves.some((c) => v.figuras[c].valor === null)) return null;
    return claves.reduce((n, c) => n + (v.figuras[c].valor ?? 0), 0);
}
