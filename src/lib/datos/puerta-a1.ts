/**
 * Adaptador del OS para la puerta de datos del A1 (PDA1010, architecture/puerta-datos-a1.md §5).
 *
 * ELECCIÓN AUTOMÁTICA con respaldo: si la puerta responde (salud medida como mucho cada 30 s; tras
 * un fallo, espera creciente de 1 a 10 min) la operación va por ella; si no responde, da 5xx o tarda
 * más de 4 s, la MISMA operación se hace en Supabase con la función de respaldo que pasa quien
 * llama (que sale por el cliente singleton y, por tanto, por el guardián de consumo). Un «no» de la
 * puerta (401/403/400…) no se repite en Supabase. Las escrituras que no entran en ningún sitio van a
 * una cola local que se vacía sola: nunca se pierde una escritura.
 *
 * Por neurona: `auto` (por defecto) o `apagada` (todo a Supabase, como antes), en este aparato.
 * Sin URL configurada (`NEXT_PUBLIC_PUERTA_DATOS_URL` o la fila `os_puerta_datos`), `auto` es
 * Supabase. Sin `node:*`: lo usan componentes de cliente.
 */

import {
    SALUD_INICIAL,
    TIMEOUT_MS,
    anotarSalud,
    destinoDeRespuesta,
    elegir,
    encolar,
    grupoDeRuta,
    guardarCola,
    guardarConfigPuerta,
    guardarUrl,
    leerCola,
    leerConfigPuerta,
    leerContadores,
    leerUrlGuardada,
    sumarContador,
    urlPuertaValida,
    type AlmacenPuerta,
    type ContadoresPuerta,
    type ModoPuerta,
    type SaludPuerta,
} from "./puerta-a1-tipos";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Via = "puerta" | "supabase" | "cola" | "rechazo";

export interface Resultado<T> {
    via: Via;
    datos: T | null;
    /** Código de la puerta cuando dijo que no (o 429). */
    estado?: number;
    error?: string;
}

export interface OpcionesPuerta {
    fetch?: FetchLike;
    almacen?: AlmacenPuerta | null;
    ahora?: () => number;
    /** URL fija (pruebas, o la variable pública). Si falta, se usa `leerUrl`. */
    url?: string | null;
    /** Lee la URL publicada (fila `os_puerta_datos`); se guarda 6 h en el aparato. */
    leerUrl?: () => Promise<string | null>;
    /** La sesión de la cuenta (JWT) para las rutas que la piden; null = sin sesión. */
    sesion?: () => Promise<string | null>;
    timeoutMs?: number;
}

export interface EventoBus {
    quien: string;
    tipo: string;
    texto?: string;
    tarea?: string | null;
    datos?: unknown;
}

export interface FiltroBus {
    desde?: number;
    tipos?: string[];
    excluir?: string[];
    limite?: number;
    horas?: number;
    esperar?: number;
}

export interface NeuronaViva {
    neurona: string;
    medio: string | null;
    visto: string;
    en_linea: boolean;
    senales: unknown;
}

export interface PuertaA1 {
    configurada(): Promise<boolean>;
    modo(): ModoPuerta;
    fijarModo(m: ModoPuerta): void;
    salud(forzar?: boolean): Promise<SaludPuerta>;
    /** La operación genérica: GET/POST/PUT por la puerta, con respaldo y cola. */
    operar<T>(op: {
        metodo: "GET" | "POST" | "PUT";
        ruta: string;
        cuerpo?: unknown;
        conSesion?: boolean;
        respaldo?: () => Promise<T>;
        timeoutMs?: number;
    }): Promise<Resultado<T>>;
    publicarEvento(ev: EventoBus, respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    leerEventos(f: FiltroBus, respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    latirNeurona(n: { neurona: string; medio?: string; senales?: unknown }, respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    neuronas(respaldo?: () => Promise<{ neuronas: NeuronaViva[] }>): Promise<Resultado<{ neuronas: NeuronaViva[] }>>;
    marcarPresencia(visible?: boolean, respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    presencia(cuentas: string[], respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    freno(respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    cache(recurso: "estaciones" | "versiones", respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    arriendo(respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    ordenMetagenesis(o: { accion: string; args?: Record<string, string | number | boolean>; para?: string }, respaldo?: () => Promise<unknown>): Promise<Resultado<unknown>>;
    vaciarCola(): Promise<number>;
    contadores(): ContadoresPuerta;
    suscribir(fn: () => void): () => void;
}

export function crearPuertaA1(op: OpcionesPuerta = {}): PuertaA1 {
    const pedir: FetchLike = op.fetch ?? ((i, init) => fetch(i, init));
    const almacen = op.almacen ?? null;
    const ahora = op.ahora ?? (() => Date.now());
    const timeoutBase = op.timeoutMs ?? TIMEOUT_MS;
    let salud: SaludPuerta = SALUD_INICIAL;
    let saludEnVuelo: Promise<SaludPuerta> | null = null;
    let urlFija = op.url === undefined ? undefined : urlPuertaValida(op.url);
    let urlEnVuelo: Promise<string | null> | null = null;
    let vaciando: Promise<number> | null = null;
    const oyentes = new Set<() => void>();
    const avisar = () => {
        for (const o of oyentes) {
            try {
                o();
            } catch {
                /* un oyente roto no para a los demás */
            }
        }
    };

    async function url(): Promise<string | null> {
        if (urlFija !== undefined) return urlFija;
        const g = leerUrlGuardada(almacen, ahora());
        if (g) return g.url;
        if (!op.leerUrl) return null;
        if (!urlEnVuelo) {
            urlEnVuelo = (async () => {
                try {
                    const u = urlPuertaValida(await op.leerUrl!());
                    guardarUrl(almacen, u, ahora());
                    return u;
                } catch {
                    guardarUrl(almacen, null, ahora());
                    return null;
                } finally {
                    urlEnVuelo = null;
                }
            })();
        }
        return urlEnVuelo;
    }

    async function conTiempo(input: string, init: RequestInit, ms: number): Promise<Response | null> {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
            return await pedir(input, { ...init, signal: ctrl.signal, cache: "no-store", credentials: "omit" });
        } catch {
            return null;
        } finally {
            clearTimeout(t);
        }
    }

    async function medirSalud(base: string): Promise<SaludPuerta> {
        if (saludEnVuelo) return saludEnVuelo;
        saludEnVuelo = (async () => {
            const t0 = ahora();
            const r = await conTiempo(`${base}/salud`, { method: "GET" }, timeoutBase);
            let ok = false;
            if (r?.ok) {
                try {
                    ok = ((await r.json()) as { ok?: unknown })?.ok === true;
                } catch {
                    ok = false;
                }
            }
            salud = anotarSalud(salud, ok, ahora(), r ? ahora() - t0 : null);
            avisar();
            return salud;
        })().finally(() => {
            saludEnVuelo = null;
        });
        return saludEnVuelo;
    }

    /** ¿Va por la puerta? Devuelve la base o null (= Supabase). */
    async function base(): Promise<string | null> {
        const u = await url();
        const e = elegir(leerConfigPuerta(almacen), u, salud, ahora());
        if (e === "supabase" || !u) return null;
        if (e === "puerta") return u;
        return (await medirSalud(u)).ok ? u : null;
    }

    async function cabeceras(conSesion: boolean, cuerpo: boolean): Promise<Record<string, string> | null> {
        const h: Record<string, string> = { accept: "application/json" };
        if (cuerpo) h["content-type"] = "application/json";
        if (conSesion) {
            const jwt = op.sesion ? await op.sesion().catch(() => null) : null;
            if (!jwt) return null;
            h.authorization = `Bearer ${jwt}`;
        }
        return h;
    }

    async function porRespaldo<T>(respaldo: (() => Promise<T>) | undefined, escritura: boolean, metodo: "GET" | "POST" | "PUT", ruta: string, cuerpo: unknown): Promise<Resultado<T>> {
        if (respaldo) {
            try {
                const datos = await respaldo();
                sumarContador(almacen, "porSupabase", ahora(), 1, grupoDeRuta(ruta));
                avisar();
                return { via: "supabase", datos };
            } catch (e) {
                if (!escritura) return { via: "supabase", datos: null, error: e instanceof Error ? e.message : "fallo" };
            }
        }
        if (escritura && metodo !== "GET") {
            encolar(almacen, { metodo, ruta, cuerpo, t: ahora() });
            sumarContador(almacen, "enCola", ahora());
            avisar();
            return { via: "cola", datos: null };
        }
        return { via: "supabase", datos: null, error: "sin puerta ni respaldo" };
    }

    async function operar<T>(o: {
        metodo: "GET" | "POST" | "PUT";
        ruta: string;
        cuerpo?: unknown;
        conSesion?: boolean;
        respaldo?: () => Promise<T>;
        timeoutMs?: number;
    }): Promise<Resultado<T>> {
        const escritura = o.metodo !== "GET";
        const b = await base();
        if (!b) return porRespaldo(o.respaldo, escritura, o.metodo, o.ruta, o.cuerpo);
        const h = await cabeceras(Boolean(o.conSesion), o.cuerpo !== undefined);
        if (!h) return porRespaldo(o.respaldo, escritura, o.metodo, o.ruta, o.cuerpo); // sin sesión: como antes
        const r = await conTiempo(
            `${b}${o.ruta}`,
            { method: o.metodo, headers: h, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) },
            o.timeoutMs ?? timeoutBase,
        );
        const estado = r ? r.status : null;
        const destino = destinoDeRespuesta(estado, escritura);
        if (destino === "ok" && r) {
            let datos: T | null = null;
            try {
                datos = (await r.json()) as T;
            } catch {
                datos = null;
            }
            sumarContador(almacen, "porPuerta", ahora(), 1, grupoDeRuta(o.ruta));
            avisar();
            if (escritura && leerCola(almacen).length) void vaciarCola();
            return { via: "puerta", datos };
        }
        if (destino === "respaldo") {
            salud = anotarSalud(salud, false, ahora());
            avisar();
            return porRespaldo(o.respaldo, escritura, o.metodo, o.ruta, o.cuerpo);
        }
        if (destino === "cola") {
            encolar(almacen, { metodo: o.metodo as "POST" | "PUT", ruta: o.ruta, cuerpo: o.cuerpo, t: ahora() });
            sumarContador(almacen, "enCola", ahora());
            avisar();
            return { via: "cola", datos: null, estado: estado ?? undefined };
        }
        let error = `HTTP ${estado}`;
        try {
            error = ((await r!.json()) as { error?: string })?.error ?? error;
        } catch {
            /* sin cuerpo */
        }
        sumarContador(almacen, "rechazos", ahora());
        avisar();
        return { via: "rechazo", datos: null, estado: estado ?? undefined, error };
    }

    async function vaciarCola(): Promise<number> {
        if (vaciando) return vaciando;
        vaciando = (async () => {
            const cola = leerCola(almacen);
            if (!cola.length) return 0;
            const b = await base();
            if (!b) return 0;
            let hechas = 0;
            const quedan = [...cola];
            while (quedan.length) {
                const e = quedan[0];
                const conSesion = e.ruta.startsWith("/v1/neuronas") || e.ruta.startsWith("/v1/presencia") || e.ruta.startsWith("/v1/metagenesis/ordenes");
                const h = await cabeceras(conSesion, true);
                if (!h) break;
                const r = await conTiempo(`${b}${e.ruta}`, { method: e.metodo, headers: h, body: JSON.stringify(e.cuerpo) }, timeoutBase);
                const d = destinoDeRespuesta(r ? r.status : null, true);
                if (d === "respaldo" || d === "cola") break;
                quedan.shift(); // entró, o la puerta dice que nunca entrará: no se reintenta en bucle
                if (d === "ok") hechas += 1;
            }
            guardarCola(almacen, quedan);
            avisar();
            return hechas;
        })().finally(() => {
            vaciando = null;
        });
        return vaciando;
    }

    const q = (f: FiltroBus) => {
        const p = new URLSearchParams();
        if (f.desde) p.set("desde", String(f.desde));
        if (f.tipos?.length) p.set("tipos", f.tipos.join(","));
        if (f.excluir?.length) p.set("excluir", f.excluir.join(","));
        if (f.limite) p.set("limite", String(f.limite));
        if (f.horas) p.set("horas", String(f.horas));
        if (f.esperar) p.set("esperar", String(Math.min(25, f.esperar)));
        const s = p.toString();
        return s ? `?${s}` : "";
    };

    return {
        configurada: async () => Boolean(await url()),
        modo: () => leerConfigPuerta(almacen).modo,
        fijarModo(m) {
            guardarConfigPuerta(almacen, { modo: m });
            salud = SALUD_INICIAL;
            avisar();
        },
        async salud(forzar = false) {
            const u = await url();
            if (!u) return salud;
            if (forzar) return medirSalud(u);
            // Dentro de la vigencia (sana) o de la espera tras un fallo, se dice lo que se sabe sin preguntar.
            return elegir({ modo: "auto" }, u, salud, ahora()) === "probar" ? medirSalud(u) : salud;
        },
        operar,
        publicarEvento: (ev, respaldo) => operar({ metodo: "POST", ruta: "/v1/bus/eventos", cuerpo: ev, conSesion: true, respaldo }),
        leerEventos: (f, respaldo) =>
            operar({ metodo: "GET", ruta: `/v1/bus/eventos${q(f)}`, conSesion: true, respaldo, timeoutMs: timeoutBase + Math.min(25, f.esperar ?? 0) * 1000 }),
        latirNeurona: (n, respaldo) => operar({ metodo: "POST", ruta: "/v1/neuronas/latido", cuerpo: n, conSesion: true, respaldo }),
        neuronas: (respaldo) => operar({ metodo: "GET", ruta: "/v1/neuronas", conSesion: true, respaldo }),
        marcarPresencia: (visible, respaldo) =>
            operar({ metodo: "POST", ruta: "/v1/presencia", cuerpo: visible === undefined ? {} : { visible }, conSesion: true, respaldo }),
        presencia: (cuentas, respaldo) =>
            operar({ metodo: "GET", ruta: `/v1/presencia?cuentas=${encodeURIComponent(cuentas.slice(0, 50).join(","))}`, conSesion: true, respaldo }),
        freno: (respaldo) => operar({ metodo: "GET", ruta: "/v1/freno", respaldo }),
        cache: (recurso, respaldo) => operar({ metodo: "GET", ruta: `/v1/cache/${recurso}`, conSesion: recurso === "versiones", respaldo }),
        arriendo: (respaldo) => operar({ metodo: "GET", ruta: "/v1/metagenesis/arriendo", conSesion: true, respaldo }),
        ordenMetagenesis: (o, respaldo) => operar({ metodo: "POST", ruta: "/v1/metagenesis/ordenes", cuerpo: o, conSesion: true, respaldo }),
        vaciarCola,
        contadores: () => leerContadores(almacen, ahora()),
        suscribir(fn) {
            oyentes.add(fn);
            return () => oyentes.delete(fn);
        },
    };
}

// ── la puerta de esta pestaña (navegador) ──────────────────────────────────────────────────────

let unica: PuertaA1 | null = null;

function almacenNavegador(): AlmacenPuerta | null {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

/**
 * La puerta compartida de esta pestaña. La sesión y la URL salen del cliente ÚNICO de Supabase
 * (`utils/supabase/client.ts`), cargado a demanda para no meterlo en el grafo de quien solo lee los
 * contadores. `getSession()` lee la sesión guardada: no es una petición a Auth.
 */
export function puertaA1(): PuertaA1 {
    if (unica) return unica;
    const env = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PUERTA_DATOS_URL : undefined;
    const cliente = async () => (await import("@/utils/supabase/client")).createClient();
    unica = crearPuertaA1({
        almacen: almacenNavegador(),
        url: env ? env : undefined,
        sesion: async () => {
            try {
                const { data } = await (await cliente()).auth.getSession();
                return data.session?.access_token ?? null;
            } catch {
                return null;
            }
        },
        leerUrl: async () => {
            const sb = await cliente();
            const { data: s } = await sb.auth.getSession();
            if (!s.session) return null;
            const { data, error } = await sb.from("os_puerta_datos").select("url, activa").eq("id", 1).maybeSingle();
            if (error || !data || !data.activa) return null;
            return (data.url as string | null) ?? null;
        },
    });
    return unica;
}

/** Solo pruebas. */
export function _reiniciarPuertaA1(): void {
    unica = null;
}
