/**
 * «Pruebas» en el pulso de Genesis · lógica PURA (PRB1111V)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin `node:*`: la importan la pantalla (cliente), las rutas y `en-marcha.ts`.
 * Aquí viven: la lectura defensiva de los archivos del director y del banco de pruebas (formatos de PRB1111W),
 * los tiempos típicos por plataforma, la cadena de entrega, el tono del medidor, la validación de lo que pide
 * la pantalla y el saneado de los registros de GitHub antes de enseñarlos.
 */

import type {
    BuildPlataforma,
    Comprobacion,
    PlataformaPrueba,
    VersionPrueba,
} from "./lanzamientos-pruebas-tipos";
import { estaEnMarcha, minutos, numeroDePrueba, resumenComprobaciones, TITULO_PLATAFORMA, type JobGh, type RunGh } from "./lanzamientos-pruebas";
import { esRunDePruebas, plataformaDeJob } from "./lanzamientos-pruebas";
import type { EnMarcha } from "./en-marcha";
import type {
    AccesosPrueba,
    AccionControl,
    AparatoBanco,
    ArchivoPrerelease,
    BancoLeido,
    ColaLocal,
    DirectorLeido,
    Eslabon,
    EnCursoDirector,
    EstadoPeticion,
    LadoLlamada,
    LlamadaBanco,
    RangoFps,
    PeticionControl,
    PeticionVista,
    SinEvidencia,
    SugerenciaBanco,
    Tipicos,
    VistaDirector,
} from "./pruebas-vivas-tipos";

const texto = (v: unknown, max = 400): string => (typeof v === "string" ? v.slice(0, max) : "");
const textoONulo = (v: unknown, max = 400): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const objeto = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const booleano = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const fechaIso = (v: unknown): string | null => {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? (v as string).slice(0, 40) : null;
};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const SHA40 = /^[0-9a-f]{40}$/;

// ── Director de pruebas ────────────────────────────────────────────────────────────────────────────

const ESTADOS_PETICION: EstadoPeticion[] = ["escrita", "pendiente", "hecha", "rechazada"];

/** Una petición (de un archivo o de la lista del director) → lo que se pinta. Pura. */
export function leerPeticion(crudo: unknown, estadoPorDefecto: EstadoPeticion = "pendiente"): PeticionVista | null {
    const o = objeto(crudo);
    const id = texto(o.id, 40);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return null;
    const accion = texto(o.accion, 30);
    if (!accion) return null;
    const estado = ESTADOS_PETICION.includes(o.estado as EstadoPeticion) ? (o.estado as EstadoPeticion) : estadoPorDefecto;
    return {
        id,
        accion,
        quien: texto(o.quien, 40),
        t: fechaIso(o.t),
        estado,
        resultado: textoONulo(o.resultado, 300),
        tFin: fechaIso(o.t_fin),
        numero: entero(o.numero),
        prueba: entero(o.prueba),
        comprobacion: textoONulo(o.comprobacion, 20),
        plataforma: textoONulo(o.plataforma, 20),
        sha: typeof o.sha === "string" && SHA40.test(o.sha) ? o.sha : null,
    };
}

function enCurso(crudo: unknown): EnCursoDirector | null {
    const o = objeto(crudo);
    if (!Object.keys(o).length) return null;
    const m = objeto(o.manifiestos);
    const f = objeto(o.fallo);
    return {
        numero: entero(o.numero),
        version: textoONulo(o.version, 80),
        sha: typeof o.sha === "string" && SHA40.test(o.sha) ? o.sha : null,
        estado: texto(o.estado, 30) || "desconocido",
        desde: fechaIso(o.desde),
        origen: textoONulo(o.origen, 20),
        pedidaPor: textoONulo(o.pedida_por, 40),
        plataformas: lista(o.plataformas).map((p) => {
            const x = objeto(p);
            return { id: texto(x.id, 20), estado: texto(x.estado, 30), detalle: textoONulo(x.detalle, 200) };
        }).filter((p) => p.id),
        manifiestos: { escritorio: textoONulo(m.escritorio, 80), android: textoONulo(m.android, 80) },
        avisado: o.avisado === true,
        fallo: Object.keys(f).length ? { job: textoONulo(f.job, 200), paso: textoONulo(f.paso, 200) } : null,
    };
}

/** `pruebas-director-estado.json` → DirectorLeido, o null si no tiene la forma de un estado. Pura. */
export function leerDirector(crudo: unknown): DirectorLeido | null {
    const o = objeto(crudo);
    if (!Object.keys(o).length) return null;
    const e = objeto(o.esperando);
    return {
        t: fechaIso(o.t),
        cadaS: numero(o.cada_s) && (o.cada_s as number) > 0 ? (o.cada_s as number) : null,
        pasada: entero(o.pasada),
        pausado: o.pausado === true,
        pausaMotivo: textoONulo(o.pausa_motivo, 200),
        pidOk: booleano(o.pid_ok),
        enCurso: enCurso(o.en_curso),
        esperando: Object.keys(e).length
            ? {
                  sha: typeof e.sha === "string" && SHA40.test(e.sha) ? e.sha : null,
                  peticion: textoONulo(e.peticion_id, 40),
                  quien: textoONulo(e.quien, 40),
                  desde: fechaIso(e.desde),
                  hasta: fechaIso(e.hasta),
                  motivo: textoONulo(e.motivo, 200),
              }
            : null,
        ultimas: lista(o.ultimas).slice(0, 8).map((u) => {
            const x = objeto(u);
            return {
                numero: entero(x.numero),
                runId: entero(x.run_id),
                version: textoONulo(x.version, 80),
                estado: texto(x.estado, 30),
                fin: fechaIso(x.fin),
                sha: typeof x.sha === "string" && SHA40.test(x.sha) ? x.sha : null,
            };
        }),
        peticiones: lista(o.peticiones).map((p) => leerPeticion(p)).filter((p): p is PeticionVista => p !== null).slice(0, 12),
        avisos: lista(o.avisos).filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200)).slice(0, 10),
    };
}

/** El director está «parado» si pasó hace más de 3 veces su cadencia (60 s por defecto). Pura. */
export const VECES_CADENCIA_PARADO = 3;

export function vistaDirector(d: DirectorLeido | "ilegible" | null | undefined, ahora: number): VistaDirector {
    if (d === undefined || d === null) {
        return { estado: "sin-archivo", leePeticiones: false, haceS: null, texto: "El director de pruebas no ha escrito su estado: no corre, así que nadie leería una petición." };
    }
    if (d === "ilegible") {
        return { estado: "ilegible", leePeticiones: false, haceS: null, texto: "No pude leer el estado del director de pruebas: no acepto peticiones que nadie leería." };
    }
    const t = d.t ? Date.parse(d.t) : NaN;
    if (!Number.isFinite(t)) {
        return { estado: "parado", leePeticiones: false, haceS: null, texto: "El director de pruebas nunca ha pasado: no corre, así que nadie leería una petición." };
    }
    const haceS = Math.max(0, Math.round((ahora - t) / 1000));
    const cada = d.cadaS ?? 60;
    if (haceS > VECES_CADENCIA_PARADO * cada) {
        return { estado: "parado", leePeticiones: false, haceS, texto: `El director de pruebas no pasa desde hace ${duracionS(haceS)} (debería cada ${duracionS(cada)}): no corre, así que nadie leería una petición.` };
    }
    if (d.pidOk === false) {
        return { estado: "parado", leePeticiones: false, haceS, texto: "El director de pruebas dejó su estado hace poco pero su proceso ya no está: nadie leería una petición." };
    }
    if (d.pausado) {
        return { estado: "pausado", leePeticiones: false, haceS, texto: `El director de pruebas está en pausa${d.pausaMotivo ? `: ${d.pausaMotivo}` : ""}. En pausa solo lee; no lanzaría nada.` };
    }
    return { estado: "corriendo", leePeticiones: true, haceS, texto: `El director de pruebas pasó hace ${duracionS(haceS)}.` };
}

export function duracionS(s: number): string {
    if (s < 90) return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 90) return `${m} min`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ── Banco de pruebas ───────────────────────────────────────────────────────────────────────────────

function aparato(crudo: unknown): AparatoBanco | null {
    const o = objeto(crudo);
    const id = texto(o.id, 30);
    if (!id) return null;
    return {
        id,
        nombre: texto(o.nombre, 80) || id,
        esta: o.esta === true,
        version: textoONulo(o.version, 80),
        versionDe: textoONulo(o.version_de, 30),
        appAbierta: booleano(o.app_abierta),
        ultimoArranque: fechaIso(o.ultimo_arranque),
        errores: lista(o.errores_arranque).slice(0, 8).map((e) => {
            const x = objeto(e);
            return { t: fechaIso(x.t), texto: texto(x.texto, 300) };
        }).filter((e) => e.texto),
        visto: fechaIso(o.visto),
        versionDesde: fechaIso(o.version_desde),
        versionDesdeFuente: textoONulo(o.version_desde_fuente, 40),
    };
}

function rangoFps(v: unknown): RangoFps | null {
    const o = objeto(v);
    return Object.keys(o).length ? { min: numero(o.min), med: numero(o.med), max: numero(o.max) } : null;
}

function lado(id: string, crudo: unknown): LadoLlamada | null {
    const o = objeto(crudo);
    if (!Object.keys(o).length) return null;
    const voz = objeto(o.voz);
    const video = objeto(o.video);
    const cam = objeto(o.camara);
    return {
        aparato: id,
        tieneVoz: Object.keys(voz).length > 0,
        tieneVideo: Object.keys(video).length > 0,
        vozNivel: [numero(voz.nivel_min), numero(voz.nivel_max)],
        vozPerdidaPctMax: numero(voz.perdida_pct_max),
        vozTardePctMax: numero(voz.tarde_pct_max),
        jitterMsMax: numero(voz.jitter_ms_max),
        esperaVozMsMax: numero(voz.espera_voz_ms_max),
        mudoS: numero(voz.mudo_s),
        fpsActivo: rangoFps(video.fps_activo),
        fpsRecibidosMed: numero(video.fps_recibidos_med),
        enviados: numero(video.enviados),
        descartados: numero(video.descartados),
        negros: numero(video.negros),
        pintados: numero(video.pintados),
        erroresRx: numero(video.errores_rx),
        pausas: lista(video.pausas).map((p) => {
            const x = objeto(p);
            return { motivo: texto(x.motivo, 40), durS: numero(x.dur_s) };
        }).slice(0, 10),
        camara: Object.keys(cam).length ? { intentos: numero(cam.intentos), ok: booleano(cam.ok), abierta: textoONulo(cam.abierta, 80), error: textoONulo(cam.error, 200) } : null,
        lineas: lista(o.lineas).filter((l): l is string => typeof l === "string").map((l) => limpiarLineaDeRegistro(l).slice(0, 400)).slice(0, 6),
    };
}

function llamada(crudo: unknown): LlamadaBanco | null {
    const o = objeto(crudo);
    const id = texto(o.id, 60);
    if (!id) return null;
    const kb = objeto(o.kbps_rapido);
    return {
        id,
        desde: fechaIso(o.desde),
        hasta: fechaIso(o.hasta),
        duracionS: numero(o.duracion_s),
        con: textoONulo(o.con, 30),
        terminada: booleano(o.terminada),
        medios: lista(o.medios).filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 40)).slice(0, 8),
        kbps: Object.keys(kb).length ? { min: numero(kb.min), max: numero(kb.max), muestras: numero(kb.muestras) } : null,
        versionRelacion: o.version_relacion === "esta" || o.version_relacion === "otra" || o.version_relacion === "desconocida" ? o.version_relacion : null,
        versionMac: textoONulo(o.version_mac, 80),
        lados: Object.entries(objeto(o.lados)).map(([k, v]) => lado(k.slice(0, 30), v)).filter((l): l is LadoLlamada => l !== null).slice(0, 4),
    };
}

/** `pruebas-banco.json` → BancoLeido, o null si no tiene forma. Pura. */
export function leerBanco(crudo: unknown): BancoLeido | null {
    const o = objeto(crudo);
    if (!Object.keys(o).length) return null;
    const fuente = objeto(o.fuente);
    const enlaces = Object.keys(objeto(fuente.enlaces_log)).length ? objeto(fuente.enlaces_log) : fuente;
    return {
        t: fechaIso(o.t),
        cadaS: numero(o.cada_s) && (o.cada_s as number) > 0 ? (o.cada_s as number) : null,
        aparatos: lista(o.aparatos).map(aparato).filter((a): a is AparatoBanco => a !== null).slice(0, 8),
        llamadas: lista(o.llamadas).map(llamada).filter((l): l is LlamadaBanco => l !== null).slice(0, 10),
        sugerencias: lista(o.sugerencias).map((s) => {
            const x = objeto(s);
            const prueba = entero(x.prueba);
            const comprobacion = texto(x.comprobacion, 20);
            if (prueba === null || !comprobacion || (x.veredicto !== "bien" && x.veredicto !== "falla")) return null;
            return { prueba, comprobacion, senal: texto(x.senal, 40), veredicto: x.veredicto, motivo: texto(x.motivo, 300), llamada: textoONulo(x.llamada, 60) } as SugerenciaBanco;
        }).filter((s): s is SugerenciaBanco => s !== null).slice(0, 60),
        sugerenciasNota: textoONulo(o.sugerencias_nota, 300),
        sinEvidencia: lista(o.sin_evidencia).map((s) => {
            const x = objeto(s);
            const prueba = entero(x.prueba);
            const comprobacion = texto(x.comprobacion, 20);
            if (prueba === null || !comprobacion) return null;
            return { prueba, comprobacion, senal: texto(x.senal, 40), razon: texto(x.razon, 300), produciria: texto(x.produciria, 300) };
        }).filter((s): s is SinEvidencia => s !== null).slice(0, 80),
        lineasLeidas: entero(enlaces.lineas),
    };
}

/** Pasados 3 veces su cadencia sin actualizarse, el banco es viejo: se dice. Pura. */
export function edadDelBanco(b: BancoLeido, ahora: number): { haceS: number | null; viejo: boolean } {
    const t = b.t ? Date.parse(b.t) : NaN;
    if (!Number.isFinite(t)) return { haceS: null, viejo: true };
    const haceS = Math.max(0, Math.round((ahora - t) / 1000));
    return { haceS, viejo: haceS > VECES_CADENCIA_PARADO * (b.cadaS ?? 60) };
}

export type EstadoAparato = "al-dia" | "falta-actualizar" | "mas-nueva" | "desconocida";

/** La versión que registra un aparato frente a la de la prueba que se mira. Pura. */
export function estadoDeAparato(a: AparatoBanco, versionObjetivo: string | null): EstadoAparato {
    if (!a.version) return "desconocida";
    if (!versionObjetivo) return "desconocida";
    const nv = numeroDePrueba(a.version);
    const no = numeroDePrueba(versionObjetivo);
    if (a.version === versionObjetivo) return "al-dia";
    if (nv !== null && no !== null) return nv > no ? "mas-nueva" : nv === no ? "al-dia" : "falta-actualizar";
    // Una oficial (0.5.0) o cualquier otra que no es esta prueba: hay que instalar la prueba.
    return "falta-actualizar";
}

// ── Tiempos típicos ────────────────────────────────────────────────────────────────────────────────

const PLATAFORMAS: PlataformaPrueba[] = ["macos", "windows", "linux", "android"];

function mediana(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Duración típica de cada plataforma: mediana de las últimas 5 pruebas cuyo job salió bien. Pura. */
export function tiemposTipicos(runs: { run: RunGh; jobs: JobGh[] | null }[]): Tipicos {
    const por: Record<PlataformaPrueba, number[]> = { macos: [], windows: [], linux: [], android: [] };
    const ordenados = [...runs].filter((r) => esRunDePruebas(r.run, r.jobs) && r.jobs).sort((a, b) => b.run.number - a.run.number);
    for (const { jobs } of ordenados) {
        for (const j of jobs ?? []) {
            const p = plataformaDeJob(j.name);
            if (!p || j.conclusion !== "success" || !j.startedAt || !j.completedAt) continue;
            const min = (Date.parse(j.completedAt) - Date.parse(j.startedAt)) / 60_000;
            if (Number.isFinite(min) && min > 0.5 && por[p].length < 5) por[p].push(min);
        }
    }
    const fuera = {} as Tipicos;
    for (const p of PLATAFORMAS) fuera[p] = por[p].length ? { minutos: Math.round(mediana(por[p])), muestras: por[p].length } : { minutos: null, muestras: 0 };
    return fuera;
}

export interface TiempoPlataforma {
    transcurrido: string;
    /** «suele tardar 17 min» o «aún no se sabe cuánto suele tardar». */
    habitual: string;
    /** «faltan unos 5 min», «ya pasó lo habitual (17 min)» o «aún no se sabe». */
    faltan: string;
}

/** El tiempo de una plataforma en marcha frente a lo que suele tardar. Pura. */
export function tiempoDePlataforma(b: BuildPlataforma, tipico: { minutos: number | null } | undefined, ahora: number): TiempoPlataforma {
    const transc = b.desde ? minutos(b.desde, ahora) : "";
    const t = tipico?.minutos ?? null;
    if (t === null) return { transcurrido: transc || "sin hora de inicio", habitual: "aún no se sabe cuánto suele tardar (sin pruebas anteriores)", faltan: "aún no se sabe" };
    const desde = b.desde ? Date.parse(b.desde) : NaN;
    if (!Number.isFinite(desde)) return { transcurrido: "sin hora de inicio", habitual: `suele tardar ${t} min`, faltan: "aún no se sabe" };
    const llevaMin = Math.max(0, Math.round((ahora - desde) / 60_000));
    const falta = t - llevaMin;
    return {
        transcurrido: transc,
        habitual: `suele tardar ${t} min`,
        faltan: falta > 0 ? `faltan unos ${falta} min` : `ya pasó lo habitual (${t} min)${falta < -Math.max(10, t / 2) ? ": tarda mucho más de lo normal" : ""}`,
    };
}

// ── Registro de un paso que falló ──────────────────────────────────────────────────────────────────

const PATRONES_SECRETO: RegExp[] = [
    /gh[pousr]_[A-Za-z0-9]{20,}/g,
    /github_pat_[A-Za-z0-9_]{20,}/g,
    /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
    /(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
    /(authorization|x-access-token|password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{8,}/gi,
    /https?:\/\/[^\s/@]+:[^\s/@]+@/g,
];

/** Quita de una línea lo que parezca una clave, un token o una ruta del disco de una persona. Pura. */
export function limpiarLineaDeRegistro(l: string): string {
    let s = String(l ?? "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
    s = s.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, "");
    for (const p of PATRONES_SECRETO) s = s.replace(p, (m) => (/^(authorization|x-access-token|password|passwd|secret|token|api[_-]?key)/i.test(m) ? m.split(/[:=]/)[0] + "=«oculto»" : m.startsWith("http") ? "https://«oculto»@" : "«oculto»"));
    s = s.replace(/\/Users\/[^\s/]+/g, "~").replace(/\/home\/[^\s/]+/g, "~");
    // Un valor largo y opaco (40+ caracteres de base64/hex seguidos) también se oculta.
    s = s.replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, (m) => (/^[0-9a-f]{40}$/.test(m) ? m : "«oculto»"));
    return s;
}

/**
 * De la salida de `gh run view --log-failed`, las últimas líneas del paso que falló: cada línea de gh es
 * `job<TAB>paso<TAB>marca de tiempo texto`. Pura. Parte las líneas muy largas para que se lean enteras.
 */
export function ultimasLineasDelRegistro(crudo: string, maximo = 40, ancho = 140): { paso: string | null; lineas: string[]; recortado: boolean } {
    const filas = String(crudo ?? "").split("\n").filter((l) => l.trim());
    const conPaso = filas.map((l) => {
        const p = l.split("\t");
        return p.length >= 3 ? { paso: p[1].trim(), t: p.slice(2).join("\t") } : { paso: null as string | null, t: l };
    });
    const ultimoPaso = [...conPaso].reverse().find((f) => f.paso)?.paso ?? null;
    const delPaso = ultimoPaso ? conPaso.filter((f) => f.paso === ultimoPaso) : conPaso;
    const limpias = delPaso.map((f) => limpiarLineaDeRegistro(f.t)).filter((l) => l.trim());
    const cola = limpias.slice(-maximo);
    const lineas: string[] = [];
    for (const l of cola) {
        for (let i = 0; i < l.length; i += ancho) lineas.push(l.slice(i, i + ancho));
    }
    return { paso: ultimoPaso, lineas, recortado: limpias.length > maximo };
}

// ── Accesos (instalar) ─────────────────────────────────────────────────────────────────────────────

export const URL_DESCARGA_PRUEBAS = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/";
export const URL_PAGINA_PRUEBAS = "https://github.com/StarSeedSystem/starseed-system/releases/tag/canal-pruebas";

/** Plataforma de un archivo del prerelease por su extensión; null si no es un instalable. Pura. */
export function plataformaDeArchivo(nombre: string): PlataformaPrueba | null {
    const n = nombre.toLowerCase();
    if (n.endsWith(".apk")) return "android";
    if (n.endsWith(".dmg")) return "macos";
    if (n.endsWith(".msi") || n.endsWith("-setup.exe") || n.endsWith("_setup.exe")) return "windows";
    if (n.endsWith(".appimage") || n.endsWith(".deb")) return "linux";
    return null;
}

/** Los instalables de UNA versión de prueba entre los archivos del prerelease. Pura. */
export function accesosDeVersion(version: string, rol: AccesosPrueba["rol"], archivos: ArchivoPrerelease[], plataformasPedidas: PlataformaPrueba[]): AccesosPrueba {
    const numeroV = numeroDePrueba(version);
    const enlaces: AccesosPrueba["enlaces"] = [];
    for (const a of archivos) {
        const p = plataformaDeArchivo(a.nombre);
        if (!p || !/^[A-Za-z0-9._+-]+$/.test(a.nombre)) continue;
        // El nombre del archivo lleva la versión («…_0.5.1-prueba.39_…»): se compara entera, no por prefijo.
        const contiene = a.nombre.includes(version) && !new RegExp(`${version.replace(/\./g, "\\.")}\\d`).test(a.nombre);
        if (!contiene) continue;
        enlaces.push({ plataforma: p, titulo: TITULO_PLATAFORMA[p], nombre: a.nombre, url: `${URL_DESCARGA_PRUEBAS}${encodeURIComponent(a.nombre)}`, bytes: a.bytes });
    }
    const con = new Set(enlaces.map((e) => e.plataforma));
    return {
        numero: numeroV ?? 0,
        version,
        rol,
        enlaces: enlaces.sort((a, b) => PLATAFORMAS.indexOf(a.plataforma) - PLATAFORMAS.indexOf(b.plataforma) || a.nombre.localeCompare(b.nombre)),
        sinArchivo: plataformasPedidas.filter((p) => !con.has(p)),
    };
}

// ── La cadena de entrega ───────────────────────────────────────────────────────────────────────────

export interface EntradaCadena {
    ahora: number;
    /** La prueba que se mira: la que está en marcha o, si no, la última. */
    v: VersionPrueba | null;
    enMarcha: EnMarcha | null;
    cola: ColaLocal;
    banco: BancoLeido | "ilegible" | null;
    director: DirectorLeido | "ilegible" | null;
}

const masAntiguo = (xs: (string | null | undefined)[]): string | null => {
    const ts = xs.map((x) => (x ? Date.parse(x) : NaN)).filter(Number.isFinite);
    return ts.length ? new Date(Math.min(...ts)).toISOString() : null;
};
const masReciente = (xs: (string | null | undefined)[]): string | null => {
    const ts = xs.map((x) => (x ? Date.parse(x) : NaN)).filter(Number.isFinite);
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
};

/**
 * tarea → puerta → publicación → compilación → publicada → instalada → comprobada → aprobada, para el commit de la
 * prueba que se mira. Cada eslabón lleva su estado y desde cuándo SOLO si el dato existe; lo que no se sabe lo dice. Pura.
 */
export function cadenaDeEntrega(e: EntradaCadena): Eslabon[] {
    const v = e.v;
    const sinPrueba = !v;
    const eslabones: Eslabon[] = [];
    const desc = (id: Eslabon["id"], titulo: string, textoDesc: string): Eslabon => ({ id, titulo, estado: "desconocido", texto: textoDesc, desde: null });

    // 1 · tarea: lo que trae el commit
    if (v?.contenido) {
        const tareas = v.contenido.grupos.filter((g) => g.tarea).map((g) => g.tarea as string);
        eslabones.push({
            id: "tarea", titulo: "Tarea", estado: "hecho", desde: null,
            texto: tareas.length ? `${tareas.length} ${tareas.length === 1 ? "tarea" : "tareas"} en lo que trae (${tareas.slice(0, 4).join(", ")}${tareas.length > 4 ? "…" : ""}); no consta cuándo se integró cada una` : `${v.contenido.total} commits sin id de tarea; no consta cuándo se integraron`,
        });
    } else eslabones.push(desc("tarea", "Tarea", sinPrueba ? "no hay ninguna prueba que mirar" : "no sé qué tareas trae (no pude leer git)"));

    // 2 · puerta de integración (la última conocida; no consta si es la de este commit)
    const pu = e.enMarcha?.puerta ?? null;
    if (!pu) eslabones.push(desc("puerta", "Puerta", "sin datos de la puerta de integración en esta neurona"));
    else {
        const fin = pu.finMs ? new Date(pu.finMs).toISOString() : null;
        const ini = pu.inicioMs ? new Date(pu.inicioMs).toISOString() : null;
        const ramas = (pu.ramas ?? []).map((r) => r.replace(/^opus1106\//, "")).join(", ") || "una rama";
        if (pu.resultado === "verde") eslabones.push({ id: "puerta", titulo: "Puerta", estado: "hecho", desde: fin, texto: `la última integración (${ramas}) salió en verde; no consta que sea la de este commit` });
        else if (pu.resultado === "rojo") eslabones.push({ id: "puerta", titulo: "Puerta", estado: "fallo", desde: fin, texto: `la última integración (${ramas}) quedó en rojo` });
        else eslabones.push({ id: "puerta", titulo: "Puerta", estado: "en-curso", desde: ini, texto: `integrando ${ramas}${pu.paso ? ` (${pu.paso})` : ""}` });
    }

    // 3 · publicación (cola local y CI)
    const pub = e.enMarcha?.publicacion ?? null;
    const alguno = v?.plataformas.some((p) => p.estado !== "esperando-main") ?? false;
    if (v && alguno) {
        eslabones.push({ id: "publicacion", titulo: "Publicación", estado: "hecho", desde: v.fecha, texto: "el commit ya está en origin/main (GitHub arrancó su compilación)" });
    } else if (v?.plataformas.some((p) => p.estado === "esperando-main")) {
        const n = e.cola.sinPublicar;
        const cola = n === null ? "no pude contar cuánto hay en cola" : n === 0 ? "la cola local está vacía" : `${n} commits en cola local`;
        eslabones.push({ id: "publicacion", titulo: "Publicación", estado: "en-curso", desde: v.fecha, texto: `el lanzador espera a que origin/main tenga el commit · ${cola}${pub?.fase === "ci" ? " · el CI de la publicación corre" : ""}` });
    } else if (pub && (pub.fase === "ci" || pub.fase === "verificando")) {
        eslabones.push({ id: "publicacion", titulo: "Publicación", estado: "en-curso", desde: pub.actualizadoMs ? new Date(pub.actualizadoMs).toISOString() : null, texto: pub.detalle || "la publicación está en CI" });
    } else eslabones.push(desc("publicacion", "Publicación", e.cola.sinPublicar === null ? "no sé cuántos commits esperan publicarse" : `${e.cola.sinPublicar} commits sin publicar en la cola local`));

    // 4 · compilación
    if (!v || !v.plataformas.length) eslabones.push(desc("compilacion", "Compilación", "aún no hay plataformas leídas de GitHub"));
    else {
        const ps = v.plataformas;
        const fallos = ps.filter((p) => p.estado === "fallo");
        const compilando = ps.filter((p) => ["compilando", "en-cola", "publicando"].includes(p.estado));
        const esperando = ps.every((p) => p.estado === "esperando-main");
        const desde = masAntiguo(ps.map((p) => p.desde));
        if (fallos.length) eslabones.push({ id: "compilacion", titulo: "Compilación", estado: "fallo", desde: masReciente(fallos.map((p) => p.hasta)) ?? desde, texto: `falló en ${fallos.map((p) => p.titulo).join(", ")}` });
        else if (esperando) eslabones.push({ id: "compilacion", titulo: "Compilación", estado: "pendiente", desde: null, texto: "aún no empezó: espera a main" });
        else if (compilando.length) eslabones.push({ id: "compilacion", titulo: "Compilación", estado: "en-curso", desde, texto: `${compilando.map((p) => `${p.titulo} (${p.estado})`).join(", ")}` });
        else eslabones.push({ id: "compilacion", titulo: "Compilación", estado: "hecho", desde: masReciente(ps.map((p) => p.hasta)), texto: "compilada en todas las plataformas" });
    }

    // 5 · publicada
    if (!v || !v.plataformas.length) eslabones.push(desc("publicada", "Publicada", "sin plataformas leídas"));
    else {
        const ok = v.plataformas.filter((p) => p.estado === "publicada");
        const todas = v.publicadaEnTodas;
        eslabones.push({
            id: "publicada", titulo: "Publicada",
            estado: todas ? "hecho" : v.plataformas.some((p) => p.estado === "fallo") ? "fallo" : ok.length ? "en-curso" : "pendiente",
            desde: todas ? masReciente(ok.map((p) => p.hasta)) : null,
            texto: todas ? `en ${ok.map((p) => p.titulo).join(", ")}${v.vigente.escritorio || v.vigente.android ? " · el canal ya la sirve" : ""}` : `${ok.length} de ${v.plataformas.length} plataformas${ok.length ? ` (${ok.map((p) => p.titulo).join(", ")})` : ""}`,
        });
    }

    // 6 · instalada en los aparatos
    if (e.banco === null || e.banco === "ilegible") eslabones.push(desc("instalada", "Instalada", e.banco === "ilegible" ? "no pude leer el archivo de evidencia de los aparatos" : "no hay archivo de evidencia de los aparatos"));
    else {
        const objetivo = v?.version ?? null;
        const conVersion = e.banco.aparatos.filter((a) => a.version);
        const estados = e.banco.aparatos.map((a) => ({ a, s: estadoDeAparato(a, objetivo) }));
        const alDia = estados.filter((x) => x.s === "al-dia" || x.s === "mas-nueva");
        if (!objetivo) eslabones.push(desc("instalada", "Instalada", "no sé qué versión debería haber"));
        else if (!e.banco.aparatos.length) eslabones.push(desc("instalada", "Instalada", "el banco no lista ningún aparato"));
        else {
            const faltan = estados.filter((x) => x.s === "falta-actualizar").map((x) => x.a.nombre);
            const sin = estados.filter((x) => x.s === "desconocida").map((x) => x.a.nombre);
            eslabones.push({
                id: "instalada", titulo: "Instalada",
                estado: alDia.length === estados.length ? "hecho" : alDia.length ? "en-curso" : faltan.length ? "pendiente" : "desconocido",
                desde: masReciente(alDia.map((x) => x.a.visto)),
                texto: `${alDia.length} de ${estados.length} aparatos con ${objetivo}${faltan.length ? ` · falta actualizar: ${faltan.join(", ")}` : ""}${sin.length ? ` · versión desconocida: ${sin.join(", ")}` : ""}${conVersion.length === 0 ? "" : ""}`,
            });
        }
    }

    // 7 · comprobada
    if (!v) eslabones.push(desc("comprobada", "Comprobada", "no hay prueba que mirar"));
    else {
        const r = resumenComprobaciones(v.comprobaciones);
        if (!r.total) eslabones.push(desc("comprobada", "Comprobada", "no hay comprobaciones registradas"));
        else eslabones.push({
            id: "comprobada", titulo: "Comprobada",
            estado: r.falla ? "fallo" : r.pendiente ? (r.bien ? "en-curso" : "pendiente") : "hecho",
            desde: masReciente(v.comprobaciones.filter((c) => c.estado !== "pendiente").map((c) => c.t)),
            texto: `${r.bien} bien · ${r.falla} falla · ${r.pendiente} pendiente de ${r.total}`,
        });
    }

    // 8 · aprobada
    if (!v) eslabones.push(desc("aprobada", "Aprobada", "no hay prueba que mirar"));
    else if (v.aprobacion) eslabones.push({ id: "aprobada", titulo: "Aprobada", estado: "hecho", desde: v.aprobacion.t, texto: `aprobada${v.director ? ` · el director: ${v.director.estado}` : ""}` });
    else eslabones.push({ id: "aprobada", titulo: "Aprobada", estado: "pendiente", desde: null, texto: v.publicadaEnTodas ? "se puede aprobar; nadie la ha aprobado" : "aún no se puede aprobar: falta publicarla" });
    return eslabones;
}

// ── El tono del medidor ────────────────────────────────────────────────────────────────────────────

export type TonoPruebas = "normal" | "aviso" | "peligro" | "ok";

/** Tono de la pastilla «Pruebas» según la verdad: fallo → peligro; en marcha o con pendientes → aviso; todo bien → ok. Pura. */
export function tonoDePruebas(v: VersionPrueba | null, d: VistaDirector | null): TonoPruebas {
    if (!v) return "normal";
    const fallo = v.plataformas.some((p) => p.estado === "fallo") || v.comprobaciones.some((c) => c.estado === "falla");
    if (fallo) return "peligro";
    if (estaEnMarcha(v)) return "aviso";
    if (v.publicadaEnTodas) {
        const r = resumenComprobaciones(v.comprobaciones);
        if (v.aprobacion) return "ok";
        if (r.total === 0 || r.pendiente > 0) return "aviso";
        return "ok";
    }
    if (d && d.estado === "parado" && v.plataformas.some((p) => p.estado === "esperando-main")) return "aviso";
    return "normal";
}

// ── Peticiones que escribe la pantalla ─────────────────────────────────────────────────────────────

const PLATAFORMAS_PETICION = ["mac", "windows", "linux", "android", "tablet", "telefono"];

/** Plataforma de la pantalla → la de las peticiones del director. Pura. */
export function plataformaParaPeticion(p: string | null | undefined): string | null {
    const x = String(p ?? "").toLowerCase();
    if (x === "macos") return "mac";
    return PLATAFORMAS_PETICION.includes(x) ? x : null;
}

/** Valida lo que manda la pantalla. Devuelve la petición normalizada o el motivo del rechazo. Pura. */
export function validarControl(body: unknown): PeticionControl | { error: string } {
    const o = objeto(body);
    const accion = o.accion as AccionControl;
    if (!["compilar", "cancelar", "reintentar", "republicar", "pedir-arreglo", "app-abrir"].includes(accion)) return { error: "Acción no válida." };
    const nota = typeof o.nota === "string" && o.nota.trim() ? o.nota.trim() : null;
    if (nota !== null && nota.length > 500) return { error: "La nota es demasiado larga (500 caracteres como mucho)." };
    const base: PeticionControl = { accion, sha: null, numero: null, prueba: null, comprobacion: null, plataforma: null, nota };
    if (accion === "app-abrir") return { ...base, nota: null }; // PRB1111X: sin más campos
    if (accion === "compilar") {
        if (o.sha === null || o.sha === undefined) return base;
        if (typeof o.sha !== "string" || !SHA40.test(o.sha.toLowerCase())) return { error: "Commit no válido (hacen falta los 40 caracteres)." };
        return { ...base, sha: o.sha.toLowerCase() };
    }
    if (accion === "pedir-arreglo") {
        const prueba = typeof o.prueba === "number" ? entero(o.prueba) : numeroDePrueba(o.prueba);
        if (prueba === null || prueba < 1 || prueba > 99999) return { error: "Falta la prueba." };
        const comprobacion = typeof o.comprobacion === "string" && o.comprobacion ? o.comprobacion : null;
        if (comprobacion !== null && !/^c\d{1,4}$/.test(comprobacion)) return { error: "Comprobación no válida." };
        const plataforma = o.plataforma === null || o.plataforma === undefined ? null : plataformaParaPeticion(String(o.plataforma));
        if (o.plataforma && plataforma === null) return { error: "Plataforma no válida." };
        if (!comprobacion && !plataforma) return { error: "Hace falta una comprobación o una plataforma." };
        return { ...base, prueba, comprobacion, plataforma };
    }
    // cancelar, reintentar, republicar: la ejecución concreta o null = la en marcha / la última
    if (o.numero !== null && o.numero !== undefined) {
        const n = typeof o.numero === "number" ? entero(o.numero) : numeroDePrueba(o.numero);
        if (n === null || n < 1 || n > 99999) return { error: "Número de prueba no válido." };
        return { ...base, numero: n };
    }
    return base;
}

/** El archivo de petición que lee el director (`formatos.md` §a). Pura. */
export function cuerpoDePeticion(p: PeticionControl, id: string, t: string, quien = "alex"): Record<string, unknown> {
    return {
        formato: 1, id, accion: p.accion, quien, t,
        sha: p.accion === "compilar" ? p.sha : null,
        numero: ["cancelar", "reintentar", "republicar"].includes(p.accion) ? p.numero : null,
        prueba: p.accion === "pedir-arreglo" ? p.prueba : null,
        comprobacion: p.accion === "pedir-arreglo" ? p.comprobacion : null,
        plataforma: p.accion === "pedir-arreglo" ? p.plataforma : null,
        nota: p.nota,
    };
}

/** `pet-<epoch s>-<4 hex>`. Pura (recibe el azar). */
export function idDePeticion(ahoraMs: number, cuatroHex: string): string {
    return `pet-${Math.floor(ahoraMs / 1000)}-${cuatroHex.toLowerCase().replace(/[^0-9a-f]/g, "0").padEnd(4, "0").slice(0, 4)}`;
}

/** Lo que dice cada acción en la confirmación. Pura. */
export interface TextoConfirmacion {
    titulo: string;
    efectos: string[];
    boton: string;
}

export function textoDeConfirmacion(
    p: { accion: Exclude<AccionControl, "pedir-arreglo" | "app-abrir"> },
    ctx: { cola: ColaLocal; enCurso: { numero: number | null; version: string | null } | null; objetivo: { numero: number | null; version: string | null } | null; ultimaPublicada: string | null },
): TextoConfirmacion {
    const nombre = (x: { numero: number | null; version: string | null } | null) => x?.version ?? (x?.numero ? `prueba.${x.numero}` : "la que consta en el director");
    if (p.accion === "compilar") {
        const n = ctx.cola.sinPublicar;
        const efectos = [
            "Pide al director de pruebas que lance la compilación de una versión de prueba (macOS, Windows, Linux y Android) con la cabeza de origin/main de AHORA" + (ctx.cola.origen ? ` (${ctx.cola.origen.slice(0, 10)})` : "") + ".",
            ctx.enCurso ? `Ya hay una en marcha (${nombre(ctx.enCurso)}): GitHub las pone en fila, esta empezaría cuando acabe la otra.` : "No hay ninguna en marcha.",
        ];
        if (n && n > 0) efectos.push(`Tu main local tiene ${n} commit${n === 1 ? "" : "s"} que aún no están publicados: esta pulsación NO los incluye.`);
        return { titulo: "Compilar prueba ahora", efectos, boton: "Compilar con lo publicado" };
    }
    if (p.accion === "cancelar") {
        return {
            titulo: `Cancelar ${nombre(ctx.enCurso)}`,
            efectos: [`Pide al director que cancele la ejecución de GitHub de ${nombre(ctx.enCurso)}.`, "Lo ya compilado se pierde; para tener esa prueba habrá que compilar otra desde cero.", "No toca nada de lo ya publicado en el canal de pruebas."],
            boton: "Cancelar la compilación",
        };
    }
    if (p.accion === "reintentar") {
        return {
            titulo: `Reintentar lo que falló de ${nombre(ctx.objetivo)}`,
            efectos: [`Pide al director que vuelva a lanzar solo los jobs que fallaron de ${nombre(ctx.objetivo)} (no toda la compilación).`, "Gasta minutos de GitHub Actions otra vez en esas plataformas.", "Si falló por el código y no por el entorno, volverá a fallar: mira antes el registro."],
            boton: "Reintentar lo que falló",
        };
    }
    return {
        titulo: "Volver a publicar el manifiesto",
        efectos: [
            `Pide al director que vuelva a generar y subir latest-prueba.json y latest-prueba-android.json de la última prueba publicada${ctx.ultimaPublicada ? ` (${ctx.ultimaPublicada})` : ""}.`,
            "Las apps de pruebas instaladas la verán como actualización.",
            "No compila nada: solo reescribe los manifiestos del canal de pruebas.",
        ],
        boton: "Volver a publicar el manifiesto",
    };
}

/** Si ya hay una petición de esa acción sin atender, no se escribe otra. Pura. */
export function peticionPendienteDe(accion: string, peticiones: PeticionVista[]): PeticionVista | null {
    return peticiones.find((p) => p.accion === accion && (p.estado === "pendiente" || p.estado === "escrita")) ?? null;
}

// ── Para «Qué corre ahora» ─────────────────────────────────────────────────────────────────────────

/** Lo único que viaja a las otras neuronas de la prueba en marcha: ids, estados, cuentas y tiempos. */
export interface PruebaParaEnviar {
    numero: number;
    etiqueta: string;
    /** esperando-main | en-cola | compilando | publicando | fallo */
    fase: string;
    esperaA: string | null;
    plataformas: { id: string; titulo: string; estado: string; desdeMs: number | null; pasoActual: string | null; pasosHechos: number | null; pasosTotal: number | null; tipicoMin: number | null }[];
    falloEn: string[];
    desdeMs: number | null;
    generadoMs: number;
}

/** De la lista de pruebas, la que importa para «Qué corre ahora» (en marcha o fallida sin sustituir) o null. Pura. */
export function pruebaParaEnviar(versiones: VersionPrueba[], tipicos: Tipicos, ahora: number): PruebaParaEnviar | null {
    const ordenadas = [...versiones].sort((a, b) => b.numero - a.numero);
    const v = ordenadas.find(estaEnMarcha) ?? ordenadas.find((x) => x.plataformas.some((p) => p.estado === "fallo") && !ordenadas.some((y) => y.numero > x.numero && y.publicadaEnTodas));
    if (!v || !v.plataformas.length) return null;
    const rango = ["esperando-main", "en-cola", "compilando", "publicando", "fallo"];
    const fase = v.plataformas.some((p) => p.estado === "esperando-main") ? "esperando-main" : v.plataformas.some((p) => p.estado === "compilando") ? "compilando" : v.plataformas.some((p) => p.estado === "publicando") ? "publicando" : v.plataformas.some((p) => p.estado === "en-cola") ? "en-cola" : "fallo";
    void rango;
    const ms = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null);
    return {
        numero: v.numero,
        etiqueta: v.etiqueta,
        fase,
        esperaA: fase === "esperando-main" ? (v.sha ? `que origin/main tenga ${v.sha.slice(0, 10)}` : "que origin/main tenga el commit de la prueba") : null,
        plataformas: v.plataformas.map((p) => ({
            id: p.plataforma, titulo: p.titulo, estado: p.estado, desdeMs: ms(p.desde),
            pasoActual: p.pasos?.actual ?? null, pasosHechos: p.pasos?.hechos ?? null, pasosTotal: p.pasos?.total ?? null,
            tipicoMin: tipicos[p.plataforma]?.minutos ?? null,
        })),
        falloEn: v.plataformas.filter((p) => p.estado === "fallo").map((p) => `${p.titulo}${p.job ? ` (${p.job})` : ""}`),
        desdeMs: ms(v.fecha),
        generadoMs: ahora,
    };
}

/** Lo que llega de otra neurona, por la lista blanca. Pura. */
export function sanearPrueba(crudo: unknown): PruebaParaEnviar | null {
    const o = objeto(crudo);
    const n = entero(o.numero);
    if (n === null || n < 1) return null;
    const fases = ["esperando-main", "en-cola", "compilando", "publicando", "fallo"];
    const fase = fases.includes(o.fase as string) ? (o.fase as string) : null;
    if (!fase) return null;
    const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
    return {
        numero: n,
        etiqueta: `prueba.${n}`,
        fase,
        esperaA: textoONulo(o.esperaA, 120),
        plataformas: lista(o.plataformas).slice(0, 6).map((p) => {
            const x = objeto(p);
            return { id: texto(x.id, 20), titulo: texto(x.titulo, 20), estado: texto(x.estado, 20), desdeMs: ms(x.desdeMs), pasoActual: textoONulo(x.pasoActual, 80), pasosHechos: entero(x.pasosHechos), pasosTotal: entero(x.pasosTotal), tipicoMin: numero(x.tipicoMin) };
        }).filter((p) => p.id),
        falloEn: lista(o.falloEn).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120)).slice(0, 6),
        desdeMs: ms(o.desdeMs),
        generadoMs: ms(o.generadoMs) ?? 0,
    };
}

export type { Comprobacion };

/** La prueba que el panel pone en primer plano: la que está en marcha; si no, la más nueva con algo fallido; si no, la más nueva. Pura. */
export function versionEnFoco(versiones: VersionPrueba[]): VersionPrueba | null {
    const orden = [...versiones].sort((a, b) => b.numero - a.numero);
    // Una prueba fallida importa hasta que otra más nueva la sustituye: la más nueva manda (PRB1111X).
    return orden.find(estaEnMarcha) ?? orden[0] ?? null;
}

/** La última prueba publicada en todas sus plataformas (para «Volver a publicar el manifiesto» y los accesos). Pura. */
export function ultimaPublicada(versiones: VersionPrueba[]): VersionPrueba | null {
    return [...versiones].sort((a, b) => b.numero - a.numero).find((v) => v.publicadaEnTodas) ?? null;
}

/** Una línea para la pastilla «Pruebas» del pulso: el resumen, o lo que falta decir si el director no corre. Pura. */
export function detalleDePastilla(v: VersionPrueba | null, d: VistaDirector | null): string {
    if (!v) return d && d.estado !== "corriendo" ? "sin versiones de prueba · el director de pruebas no corre" : "sin versiones de prueba que Genesis vea";
    const fallo = v.plataformas.filter((p) => p.estado === "fallo");
    if (fallo.length) return `falló ${fallo.map((p) => p.titulo).join(", ")} · ábrelo para ver el job y pedir arreglo`;
    if (estaEnMarcha(v)) return "en marcha · ábrelo para ver dónde va cada plataforma";
    const r = resumenComprobaciones(v.comprobaciones);
    if (v.publicadaEnTodas && !v.aprobacion) return r.pendiente || !r.total ? "publicada · faltan comprobaciones en los aparatos" : "publicada y comprobada · se puede aprobar";
    if (v.aprobacion) return "aprobada";
    return "nada en marcha";
}
