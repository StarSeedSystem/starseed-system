/**
 * Administrador de servidor de Astraura 1.58 (capa nube) — TIPOS PUROS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex pidió, en el Puente de Mando, ver y controlar la Mac como servidor de
 * la capa nube de Astraura 1.58 (hoy esta Mac; mañana Oracle u otro): un
 * interruptor para que no se duerma sola durante horas o días, un botón para
 * apagar solo la pantalla (ahorra batería sin cortar la sesión ni los
 * procesos), el estado del backend/BitNet/túnel, los servicios `com.starseed.*`
 * y un registro de servidores (esta Mac + Oracle, pendiente).
 *
 * Este archivo NO importa nada de `node:*`: lo carga también el componente de
 * cliente (`panel-servidor.tsx`) y las pruebas en jsdom. Todo lo que toca
 * procesos, disco o red vive en `servidor-astraura.ts` (solo servidor), que
 * reexporta estos tipos. `huellaCorta` (necesita `node:crypto`) vive allí, no
 * aquí.
 */

// ── Energía: reposo, batería, quién impide que la Mac se duerma ─────────────

/** De dónde saca corriente la Mac ahora mismo (`pmset -g batt`). */
export type Alimentacion = "ac" | "bateria" | "desconocida";

export interface Bateria {
    alimentacion: Alimentacion;
    /** 0–100, o `null` si no hay batería (Mac de sobremesa) o no se pudo leer. */
    porcentaje: number | null;
    /** `true` solo cuando el estado es «charging» (activamente cargando). */
    cargando: boolean;
    /** «H:MM» tal cual lo da `pmset`, o `null` si dice «(no estimate)» o no hay batería. */
    restante: string | null;
}

/** Una aserción de `pmset -g assertions` (quién pide que la Mac no se duerma). */
export interface Asercion {
    pid: number;
    proceso: string;
    tipo: string;
    nombre: string;
}

/** Los tipos de aserción que de verdad impiden el reposo del SISTEMA (no solo de la pantalla). */
const TIPOS_QUE_IMPIDEN_REPOSO = new Set([
    "PreventUserIdleSystemSleep",
    "NoIdleSleepAssertion",
    "PreventSystemSleep",
]);

/**
 * De la lista de aserciones, los nombres de proceso que impiden que el
 * SISTEMA se duerma — excluyendo la de `powerd` que solo dice que la
 * pantalla está encendida (esa no cuenta como «mantiene despierta la Mac»).
 * Deduplicado y en el orden en que aparecen.
 */
export function impideReposo(asserciones: Asercion[]): string[] {
    const vistos = new Set<string>();
    const resultado: string[] = [];
    for (const a of asserciones) {
        if (!TIPOS_QUE_IMPIDEN_REPOSO.has(a.tipo)) continue;
        if (a.proceso === "powerd" && a.nombre === "Prevent sleep while display is on") continue;
        if (vistos.has(a.proceso)) continue;
        vistos.add(a.proceso);
        resultado.push(a.proceso);
    }
    return resultado;
}

/** Lo que enseña la Mac sobre su propio reposo (`pmset -g`). */
export interface EstadoPmsetG {
    /** Minutos hasta el reposo del sistema, o `null` si `sleep 0` (nunca). */
    reposoSistemaMin: number | null;
    /** Minutos hasta que se apaga la pantalla, o `null` si nunca. */
    reposoPantallaMin: number | null;
    /** Procesos que `pmset` dice que están impidiendo el reposo AHORA («sleep 1 (…prevented by X, Y)»). */
    reposoImpedidoPor: string[];
    /** `true` si `sudo pmset -a disablesleep 1` está activo (SleepDisabled). */
    reposoDesactivado: boolean;
}

/**
 * Parsea la salida de `pmset -g` («System-wide power settings…» / «Currently
 * in use:»). Tolerante: una línea que no reconoce se ignora. Muestra real:
 *
 * ```
 * System-wide power settings:
 * Currently in use:
 *  standby              1
 *  disksleep            10
 *  sleep                1 (sleep prevented by powerd, Claude)
 *  hibernatemode        3
 *  displaysleep         90
 * ```
 */
export function parsearPmsetG(texto: string): EstadoPmsetG {
    let reposoSistemaMin: number | null = null;
    let reposoPantallaMin: number | null = null;
    let reposoImpedidoPor: string[] = [];
    let reposoDesactivado = false;

    for (const linea of String(texto ?? "").split("\n")) {
        const limpia = linea.trim();
        if (!limpia) continue;
        const partes = limpia.split(/\s+/);
        const clave = partes[0];
        // OJO: `disksleep` y `displaysleep` también contienen «sleep»; solo
        // cuenta cuando la clave es EXACTAMENTE «sleep».
        if (clave === "sleep") {
            const valor = Number.parseInt(partes[1] ?? "", 10);
            reposoSistemaMin = Number.isFinite(valor) && valor > 0 ? valor : null;
            const impedidoPor = limpia.match(/prevented by ([^)]+)\)/i);
            if (impedidoPor) {
                reposoImpedidoPor = impedidoPor[1]
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
        } else if (clave === "displaysleep") {
            const valor = Number.parseInt(partes[1] ?? "", 10);
            reposoPantallaMin = Number.isFinite(valor) && valor > 0 ? valor : null;
        } else if (clave === "SleepDisabled") {
            reposoDesactivado = partes[1] === "1";
        }
    }

    return { reposoSistemaMin, reposoPantallaMin, reposoImpedidoPor, reposoDesactivado };
}

/**
 * Parsea `pmset -g batt`. Muestra real:
 *
 * ```
 * Now drawing from 'AC Power'
 *  -InternalBattery-0 (id=22806627)	100%; charged; 0:00 remaining present: true
 * ```
 *
 * También entiende `'Battery Power'`, `discharging; 3:12 remaining`,
 * `(no estimate)` (sin tiempo → `restante: null`) y una Mac de sobremesa sin
 * línea de batería (`porcentaje/restante: null`, `cargando: false`).
 */
export function parsearBateria(texto: string): Bateria {
    const cuerpo = String(texto ?? "");
    let alimentacion: Alimentacion = "desconocida";
    if (/'AC Power'/.test(cuerpo)) alimentacion = "ac";
    else if (/'Battery Power'/.test(cuerpo)) alimentacion = "bateria";

    const pctMatch = cuerpo.match(/(\d{1,3})%/);
    const porcentaje = pctMatch ? Number.parseInt(pctMatch[1], 10) : null;

    // «discharging» contiene la subcadena «charging» pero NO como palabra
    // suelta (no hay límite de palabra entre «dis» y «charging»), así que
    // \bcharging\b solo casa con el estado «charging» de verdad.
    const cargando = /\bcharging\b/i.test(cuerpo);

    const tiempoMatch = cuerpo.match(/(\d+:\d{2}) remaining/);
    const restante = tiempoMatch ? tiempoMatch[1] : null;

    return { alimentacion, porcentaje, cargando, restante };
}

/**
 * Parsea `pmset -g assertions`, sección «Listed by owning process:». Muestra real:
 *
 * ```
 *    pid 30504(Claude): [0x0006a59100018a12] 23:22:37 NoIdleSleepAssertion named: "Electron"
 * ```
 */
export function parsearAsserciones(texto: string): Asercion[] {
    const cuerpo = String(texto ?? "");
    const marcador = "Listed by owning process:";
    const idx = cuerpo.indexOf(marcador);
    const seccion = idx === -1 ? cuerpo : cuerpo.slice(idx + marcador.length);

    const resultado: Asercion[] = [];
    const regex = /pid\s+(\d+)\(([^)]+)\):\s*\[[^\]]*\]\s*[\d:]+\s+(\S+)\s+named:\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(seccion)) !== null) {
        resultado.push({
            pid: Number.parseInt(m[1], 10),
            proceso: m[2],
            tipo: m[3],
            nombre: m[4],
        });
    }
    return resultado;
}

/** Etiqueta launchd del job «mantener despierta» y el plist que lo instala. */
export const ETIQUETA_DESPIERTO = "com.starseed.despierto";

/**
 * XML del plist de `com.starseed.despierto`: `caffeinate -i -m -s` — SIN
 * `-d` (la pantalla puede seguir apagándose para ahorrar batería), con
 * `RunAtLoad`/`KeepAlive` para que sobreviva a un reinicio de sesión, y
 * `ProcessType Interactive` (igual que el resto de demonios interactivos del
 * Mando: `Background` ahoga CPU/I/O, ver CLAUDE.md §Modo ligero).
 */
export function plistDespierto(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${ETIQUETA_DESPIERTO}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/caffeinate</string>
        <string>-i</string>
        <string>-m</string>
        <string>-s</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ProcessType</key><string>Interactive</string>
    <key>StandardOutPath</key><string>/dev/null</string>
    <key>StandardErrorPath</key><string>/dev/null</string>
</dict>
</plist>
`;
}

// ── Astraura 1.58 · capa nube ────────────────────────────────────────────────

export interface AstrauraBackendEstado {
    ok: boolean;
    ms: number | null;
}

/** Subconjunto de `GET /api/bitnet/estado` del backend (127.0.0.1:8000). */
export interface AstrauraBitnetEstado {
    dormido: boolean | null;
    ultimoUsoInteractivoHaceS: number | null;
    vivo: boolean | null;
}

export interface AstrauraLlamaEstado {
    /** `GET :8790/health` — 200. */
    ok: boolean;
}

/** Subconjunto de `cognition` de `GET /api/starseed/processes` (el «fondo»). */
export interface FondoEstado {
    ciclo: number | null;
    enCurso: boolean | null;
    descansaS: number | null;
    aplazadasPresupuesto: number | null;
    cedidasAlChat: number | null;
}

export interface AstrauraServidorEstado {
    backend: AstrauraBackendEstado;
    bitnet: AstrauraBitnetEstado | null;
    llama: AstrauraLlamaEstado;
    fondo: FondoEstado | null;
}

/** De dónde sale hoy la capa nube de Astraura para el resto del OS. */
export type DestinoNubeServidor = "esta-mac-tunel" | "despliegue-propio";

export interface NubeServidorEstado {
    /** Esta Mac tiene un túnel activo publicado (`active_tunnel.json`). */
    tunelActivo: boolean;
    proveedor: string | null;
    /** ISO de cuándo se publicó el túnel activo, o `null`. */
    actualizado: string | null;
    /** 12 primeros hex de sha256(url) del túnel ACTIVO de esta Mac, o `null`. */
    huella: string | null;
    /** El túnel que el resto del OS ve publicado (Supabase), solo su huella. */
    publicado: { huella: string | null };
    /** `huella === publicado.huella`, o `null` si falta alguno de los dos. */
    coincide: boolean | null;
    destino: DestinoNubeServidor;
}

// ── Servicios `com.starseed.*` del Mando ─────────────────────────────────────

export interface ServicioMando {
    /** Sin el prefijo `com.starseed.` (igual que `leerServicios()`). */
    etiqueta: string;
    pid: number | null;
    ultimaSalida: number | null;
    reiniciable: boolean;
}

/**
 * Lista blanca de lo reiniciable desde este panel. `mando` (el propio Puente,
 * el proceso que sirve esta misma petición) queda FUERA a propósito: reiniciarlo
 * mataría al servidor que está contestando.
 */
export const ETIQUETAS_REINICIABLES: readonly string[] = [
    "astraura",
    "astraura.tunnel",
    "mando.tunel",
    "reconstruir",
    "freellmapi",
    "astraura-voice",
    "despierto",
];

/** Nombre legible para cada etiqueta `com.starseed.*` (sin el prefijo). */
export const NOMBRES_SERVICIOS: Record<string, string> = {
    astraura: "Astraura 1.58 (backend)",
    "astraura.tunnel": "Túnel de Astraura",
    mando: "Puente de Mando",
    "mando.tunel": "Túnel del Mando",
    reconstruir: "Reconstructor del Mando",
    freellmapi: "freellmapi",
    "astraura-voice": "Voz de Astraura",
    despierto: "Mantener encendida",
};

export interface EnjambreEstado {
    orquestadorVivo: boolean;
    /** Tope de agentes del gobernador (`~/.starseed/gobernador.json`), o `null`. */
    topeGobernador: number | null;
}

export interface MaquinaEstado {
    hostname: string;
    uptimeS: number;
    loadavg: [number, number, number];
    memLibreMb: number;
    memTotalMb: number;
    plataforma: string;
}

// ── Registro de servidores de Astraura (esta Mac, Oracle…) ──────────────────

export type TipoServidor = "oracle" | "vps" | "otro";

export interface SondaServidor {
    ok: boolean;
    ms: number | null;
    /** ISO de cuándo se hizo la sonda. */
    t: string;
    detalle: string;
}

/** Entrada computada: siempre la primera, «Esta Mac». */
export interface ServidorEstaMac {
    id: "esta-mac";
    nombre: string;
    tipo: "esta-mac";
    activo: true;
}

/** Sugerencia fija cuando aún no hay ningún servidor Oracle en el registro. */
export interface ServidorPendiente {
    id: "oracle-pendiente";
    tipo: "oracle";
    pendiente: true;
}

/** Entrada guardada por Alex en `servidores-astraura.json`. */
export interface ServidorRegistrado {
    id: string;
    nombre: string;
    tipo: TipoServidor;
    /** La propia dirección del servidor de Alex: no es un secreto, se enseña tal cual. */
    url: string;
    creado: string;
    ultimaSonda?: SondaServidor;
}

export type EntradaServidor = ServidorEstaMac | ServidorPendiente | ServidorRegistrado;

export function esServidorPendiente(s: EntradaServidor): s is ServidorPendiente {
    return "pendiente" in s && s.pendiente === true;
}

export function esServidorRegistrado(s: EntradaServidor): s is ServidorRegistrado {
    return "url" in s;
}

// ── Estado completo ───────────────────────────────────────────────────────────

export interface EnergiaServidor {
    /** El launchd `com.starseed.despierto` está cargado con un pid vivo. */
    despierto: boolean;
    pidCaffeinate: number | null;
    /** epoch ms de cuándo se activó (`~/.starseed/despierto.json`), o `null`. */
    desde: number | null;
    bateria: Bateria;
    reposoSistemaMin: number | null;
    reposoPantallaMin: number | null;
    reposoDesactivado: boolean;
    reposoImpedidoPor: string[];
}

export interface EstadoServidorAstraura {
    /** ISO de la medición. */
    t: string;
    energia: EnergiaServidor;
    astraura: AstrauraServidorEstado;
    nube: NubeServidorEstado;
    servicios: ServicioMando[];
    enjambre: EnjambreEstado;
    maquina: MaquinaEstado;
    servidores: EntradaServidor[];
    avisos: string[];
}

// ── Validación del registro de servidores (sin tocar disco: PURA) ───────────

export type ResultadoValidarServidor =
    | { ok: true; servidor: { nombre: string; tipo: TipoServidor; url: string } }
    | { ok: false; error: string };

/** IPv4 privada (10.x, 192.168.x, 172.16–31.x). */
function esIpPrivada(host: string): boolean {
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
}

/**
 * Valida la entrada del formulario «Añadir servidor»: nombre (1–60), tipo
 * conocido, URL https (o http solo para IP de la LAN / `*.local`), sin
 * usuario:contraseña, sin `?query` ni `#fragmento`, sin ruta más allá de `/`,
 * y jamás algo que parezca una clave (`key=`, `token=`, `sk-`). Nunca lanza.
 */
export function validarServidor(entrada: unknown): ResultadoValidarServidor {
    const d = entrada && typeof entrada === "object" ? (entrada as Record<string, unknown>) : {};
    const nombre = typeof d.nombre === "string" ? d.nombre.trim() : "";
    const tipo = d.tipo;
    const urlCruda = typeof d.url === "string" ? d.url.trim() : "";

    if (nombre.length < 1 || nombre.length > 60) {
        return { ok: false, error: "El nombre debe tener entre 1 y 60 caracteres." };
    }
    if (tipo !== "oracle" && tipo !== "vps" && tipo !== "otro") {
        return { ok: false, error: "El tipo debe ser «oracle», «vps» u «otro»." };
    }
    if (!urlCruda) {
        return { ok: false, error: "Falta la URL del servidor." };
    }
    if (/key=|token=|sk-/i.test(urlCruda)) {
        return { ok: false, error: "Esa URL parece llevar una clave o un token: aquí solo va la dirección del servidor." };
    }

    let u: URL;
    try {
        u = new URL(urlCruda);
    } catch {
        return { ok: false, error: "Esa URL no es válida." };
    }

    if (u.protocol !== "https:" && u.protocol !== "http:") {
        return { ok: false, error: "La URL debe empezar por https:// (o http:// solo en la red local)." };
    }
    if (u.username || u.password) {
        return { ok: false, error: "La URL no puede llevar usuario ni contraseña." };
    }
    if (u.search || u.hash) {
        return { ok: false, error: "La URL no puede llevar parámetros (?) ni fragmento (#)." };
    }
    if (u.pathname !== "/" && u.pathname !== "") {
        return { ok: false, error: "La URL debe ser solo el dominio, sin ninguna ruta detrás." };
    }

    const host = u.hostname.toLowerCase();
    const esLocal = esIpPrivada(host) || host.endsWith(".local");
    if (u.protocol === "http:" && !esLocal) {
        return { ok: false, error: "http:// solo se acepta para una IP de la red local o un host «.local»; para todo lo demás hace falta https://." };
    }

    return { ok: true, servidor: { nombre, tipo, url: `${u.protocol}//${u.host}` } };
}

// ── Avisos honestos ───────────────────────────────────────────────────────────

/**
 * Avisos en español para la parte de arriba del panel. Pura: solo lee
 * `estado`, nunca mide nada por su cuenta.
 */
export function calcularAvisos(estado: EstadoServidorAstraura): string[] {
    const avisos: string[] = [];
    const bateria = estado.energia.bateria;
    const enBateria = bateria.alimentacion === "bateria";

    if (estado.energia.despierto && enBateria && bateria.porcentaje !== null) {
        avisos.push(
            `En batería al ${bateria.porcentaje} %: aguanta horas, no días. Conéctala a la corriente para dejarla de servidor.`,
        );
    }

    if (enBateria && !bateria.cargando && bateria.porcentaje !== null && bateria.porcentaje <= 15) {
        avisos.push(`Batería al ${bateria.porcentaje} % y sin cargar: se apagará pronto si no la conectas a la corriente.`);
    }

    if (
        estado.nube.tunelActivo &&
        estado.nube.huella &&
        estado.nube.publicado.huella &&
        estado.nube.huella !== estado.nube.publicado.huella
    ) {
        avisos.push(
            "La capa nube del OS apunta a un túnel viejo: esta Mac ya publicó uno nuevo, pero el OS todavía no lo ha recogido.",
        );
    }

    if (!estado.astraura.backend.ok) {
        avisos.push("El backend de Astraura 1.58 no responde: revisa que esté encendido en esta Mac.");
    }

    if (!estado.astraura.llama.ok) {
        avisos.push("El motor BitNet (llama-server) no responde.");
    }

    if (estado.energia.despierto && !estado.energia.reposoDesactivado) {
        avisos.push(
            "Con la tapa cerrada y sin pantalla externa, macOS se duerme igual: para aguantar días con la tapa cerrada hace falta desactivar el reposo (tienes el comando exacto más abajo).",
        );
    }

    if (!estado.enjambre.orquestadorVivo) {
        avisos.push("El orquestador del enjambre no está en marcha: ahora mismo nadie está lanzando tareas.");
    }

    return avisos;
}
