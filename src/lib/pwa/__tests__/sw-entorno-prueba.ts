/**
 * Entorno de service worker de mentira para probar `public/sw-v8.js` sin navegador (SW1107A).
 * Cache Storage en memoria (con ignoreSearch y orden de creación), `fetch` contra un servidor de mentira
 * con interruptor de red, `self.clients`, `navigator.connection/storage/onLine` y `importScripts` que
 * carga `public/sw-logica.js`. El código del SW corre tal cual, sin tocar ni una línea.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ORIGEN = "https://starseed-os.vercel.app";

interface Guardada {
  url: string;
  cuerpo: ArrayBuffer;
  estado: number;
  texto: string;
  cabeceras: [string, string][];
}

function urlDe(x: RequestInfo | URL): string {
  if (typeof x === "string") return new URL(x, ORIGEN).href;
  if (x instanceof URL) return x.href;
  return new URL((x as Request).url, ORIGEN).href;
}

function sinConsulta(u: string): string {
  const x = new URL(u);
  return x.origin + x.pathname;
}

export class CacheFalsa {
  entradas: Guardada[] = [];
  constructor(private readonly buscar: (r: RequestInfo | URL) => Promise<Response>) {}

  private encontrar(req: RequestInfo | URL, op?: CacheQueryOptions): Guardada | undefined {
    const u = urlDe(req);
    return this.entradas.find((e) => (op?.ignoreSearch ? sinConsulta(e.url) === sinConsulta(u) : e.url === u));
  }

  async match(req: RequestInfo | URL, op?: CacheQueryOptions): Promise<Response | undefined> {
    const e = this.encontrar(req, op);
    if (!e) return undefined;
    return new Response(e.cuerpo.slice(0), { status: e.estado, statusText: e.texto, headers: e.cabeceras });
  }

  async put(req: RequestInfo | URL, res: Response): Promise<void> {
    const u = urlDe(req);
    const cuerpo = await res.arrayBuffer();
    this.entradas = this.entradas.filter((e) => e.url !== u);
    this.entradas.push({ url: u, cuerpo, estado: res.status, texto: res.statusText, cabeceras: [...res.headers.entries()] });
  }

  async add(req: RequestInfo | URL): Promise<void> {
    const res = await this.buscar(req);
    if (!res.ok) throw new TypeError("add: respuesta no válida");
    await this.put(req, res);
  }

  async keys(): Promise<Request[]> {
    return this.entradas.map((e) => new Request(e.url));
  }

  async delete(req: RequestInfo | URL): Promise<boolean> {
    const u = urlDe(req);
    const antes = this.entradas.length;
    this.entradas = this.entradas.filter((e) => e.url !== u);
    return this.entradas.length !== antes;
  }

  urls(): string[] {
    return this.entradas.map((e) => e.url.replace(ORIGEN, ""));
  }
}

export class CachesFalsas {
  mapa = new Map<string, CacheFalsa>();
  constructor(private readonly buscar: (r: RequestInfo | URL) => Promise<Response>) {}
  async open(n: string): Promise<CacheFalsa> {
    if (!this.mapa.has(n)) this.mapa.set(n, new CacheFalsa(this.buscar));
    return this.mapa.get(n) as CacheFalsa;
  }
  async keys(): Promise<string[]> {
    return [...this.mapa.keys()];
  }
  async delete(n: string): Promise<boolean> {
    return this.mapa.delete(n);
  }
  async has(n: string): Promise<boolean> {
    return this.mapa.has(n);
  }
  async match(req: RequestInfo | URL, op?: CacheQueryOptions): Promise<Response | undefined> {
    for (const c of this.mapa.values()) {
      const r = await c.match(req, op);
      if (r) return r;
    }
    return undefined;
  }
}

export interface Llamada {
  url: string;
  ruta: string;
  cabeceras: Headers;
  init: RequestInit;
}

/** Respuesta de redirección «manual» (opaqueredirect) como la da el navegador. */
export function redireccionOpaca(): Response {
  return { status: 0, ok: false, type: "opaqueredirect", redirected: false, headers: new Headers(), statusText: "" } as unknown as Response;
}

export type Servidor = (ruta: string, c: Llamada) => Response | Promise<Response> | "colgar";

interface EventoFalso {
  respuesta?: Promise<Response>;
  pendientes: Promise<unknown>[];
}

/** Monta el SW. `servidor` contesta por ruta (sin consulta) o con 404; `red: false` = sin conexión. */
export function montarSW(op: { servidor: Servidor; host?: string; conexion?: Record<string, unknown>; libres?: number | null }) {
  const raiz = process.cwd();
  const codigoSW = readFileSync(join(raiz, "public", "sw-v8.js"), "utf-8");
  const codigoLogica = readFileSync(join(raiz, "public", "sw-logica.js"), "utf-8");
  const origen = op.host ? `https://${op.host}` : ORIGEN;
  const estado = { red: true, llamadas: [] as Llamada[], mensajes: [] as unknown[], enfocada: 0, abiertas: [] as string[] };

  const fetchFalso = async (entrada: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof entrada === "string" ? new URL(entrada, origen).href : urlDe(entrada);
    const cabeceras = new Headers(entrada instanceof Request ? entrada.headers : undefined);
    new Headers(init.headers).forEach((v, k) => cabeceras.set(k, v));
    const llamada: Llamada = { url, ruta: new URL(url).pathname, cabeceras, init };
    estado.llamadas.push(llamada);
    if (!estado.red) throw new TypeError("Failed to fetch");
    const r = await op.servidor(llamada.ruta, llamada);
    if (r === "colgar") return new Promise<Response>(() => {});
    return r;
  };
  const caches = new CachesFalsas((r) => fetchFalso(r));

  const oyentes = new Map<string, ((e: unknown) => void)[]>();
  // (NOT1108A) La ventana de la app: su dirección y `focus()` (pulsar una notificación la enfoca).
  const cliente = {
    url: `${origen}/escritorios`,
    postMessage: (m: unknown) => estado.mensajes.push(m),
    focus: async () => {
      estado.enfocada += 1;
      return cliente;
    },
  };
  const clientes: Array<typeof cliente> = [cliente];
  const navegador = {
    onLine: true,
    connection: op.conexion ?? { type: "wifi", effectiveType: "4g", saveData: false },
    storage: { estimate: async () => (op.libres === null ? {} : { quota: (op.libres ?? 10e9) + 1e6, usage: 1e6 }) },
  };
  const self: Record<string, unknown> = {
    location: new URL(`${origen}/sw-v8.js`),
    navigator: navegador,
    addEventListener: (t: string, f: (e: unknown) => void) => oyentes.set(t, [...(oyentes.get(t) ?? []), f]),
    skipWaiting: async () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => [...clientes],
      openWindow: async (u: string) => {
        estado.abiertas.push(u);
        return null;
      },
    },
  };
  // Relojes «rápidos»: el tope de 10 s de la navegación salta en 5 ms (la lógica no cambia).
  const relojRapido = (f: () => void) => setTimeout(f, 5);
  const importScripts = () => {
    new Function("self", "module", codigoLogica)(self, undefined);
  };
  // En un SW, `new Request("/x")` se resuelve contra la ubicación del SW; en Node no hay base.
  class RequestDelSW extends Request {
    constructor(entrada: RequestInfo | URL, init?: RequestInit) {
      super(typeof entrada === "string" ? new URL(entrada, origen).href : entrada, init);
    }
  }
  new Function(
    "self", "caches", "fetch", "importScripts", "setTimeout", "clearTimeout", "Request",
    codigoSW,
  )(self, caches, fetchFalso, importScripts, relojRapido, clearTimeout, RequestDelSW);

  async function despachar(tipo: string, extra: Record<string, unknown>): Promise<EventoFalso> {
    const ev: EventoFalso & Record<string, unknown> = {
      pendientes: [],
      ...extra,
      respondWith(p: Promise<Response>) { ev.respuesta = Promise.resolve(p); },
      waitUntil(p: Promise<unknown>) { ev.pendientes.push(Promise.resolve(p)); },
    };
    for (const f of oyentes.get(tipo) ?? []) f(ev);
    return ev;
  }

  // Espera lo que el SW deja pendiente (waitUntil). Una red «colgada» nunca termina: como el navegador,
  // se deja de esperar (aquí a los 300 ms) en vez de colgar la prueba.
  async function terminar(ev: EventoFalso) {
    if (ev.respuesta) await ev.respuesta.catch(() => undefined);
    const limite = new Promise((r) => setTimeout(r, 300));
    while (ev.pendientes.length) {
      const fin = await Promise.race([Promise.allSettled(ev.pendientes.splice(0)).then(() => "ok"), limite.then(() => "tope")]);
      if (fin === "tope") break;
    }
  }

  return {
    estado,
    caches,
    navegador,
    logica: self.StarSeedSW as Record<string, unknown>,
    async ciclo(tipo: "install" | "activate") {
      await terminar(await despachar(tipo, {}));
    },
    /** Una petición como la haría la página. Devuelve la respuesta o `null` si el SW no la tocó. */
    async pedir(ruta: string, init: { modo?: RequestMode; cabeceras?: Record<string, string>; metodo?: string } = {}) {
      const request = new Request(new URL(ruta, origen).href, { method: init.metodo ?? "GET", headers: init.cabeceras });
      Object.defineProperty(request, "mode", { value: init.modo ?? "cors" });
      const ev = await despachar("fetch", { request });
      const res = ev.respuesta ? await ev.respuesta : null;
      await terminar(ev);
      return res;
    },
    async mensaje(data: unknown) {
      const ev = await despachar("message", { data, ports: [], source: cliente });
      await terminar(ev);
    },
    /** (NOT1108A) Pulsar una notificación con `data`. Devuelve si el SW la cerró. */
    async notificacion(data: unknown, op: { sinVentanas?: boolean } = {}) {
      clientes.length = 0;
      if (!op.sinVentanas) clientes.push(cliente);
      let cerrada = false;
      const ev = await despachar("notificationclick", { notification: { data, close: () => (cerrada = true) } });
      await terminar(ev);
      return cerrada;
    },
  };
}
