/**
 * puerta/puente-local — une el gestor de túneles (malla) con el servidor local de Node (PTA1108A · 2026-11-08).
 * El lado de Node es `native/servidor-local/puerta.cjs` (tuberías de bytes por HTTP local, siempre POST y tras la
 * guarda del pase). Aquí:
 *   · `crearAbrirTcpLocal`  — esta neurona ES la puerta: abre TCP de salida por Node y lo ofrece como `SocketSalida`.
 *   · `atenderEntradas`     — esta neurona PIDE salida: por cada tubería de entrada (proxy CONNECT del navegador o
 *                             `fetch`) abre un túnel por la malla y copia bytes en los dos sentidos.
 *   · `respaldoFetchLocal`  — `RespaldoFetch` que manda una petición a `/__starseed/puerta/fetch` (TLS en Node).
 * Sin DOM: el `post` (fetch local) se inyecta.
 */

import type { GestorPuerta, SocketSalida } from "@/lib/malla/puerta/tunel";
import type { RespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";
import type { Concesion } from "@/lib/malla/puerta/capas"; // PTA1108C

export type PostLocal = (accion: string, cuerpo?: BodyInit | null, cabeceras?: Record<string, string>, senal?: AbortSignal) => Promise<Response>;

export const RUTA_LOCAL_PUERTA = "/__starseed/puerta/";

/** `post` por defecto: el servidor local de la propia ventana (mismo origen, lleva la cookie del pase). */
export function postLocalPorDefecto(base = ""): PostLocal {
  return (accion, cuerpo, cabeceras, senal) =>
    fetch(base + RUTA_LOCAL_PUERTA + accion, { method: "POST", body: cuerpo ?? null, headers: cabeceras, credentials: "same-origin", cache: "no-store", signal: senal });
}

const ESPERA_REINTENTO_MS = 1500;
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** ¿Hay lado de Node con puerta? (404 = paquete sin ella, 403 = sin pase, error = web normal). */
export async function puertaLocalDisponible(post: PostLocal): Promise<boolean> {
  try {
    const r = await post("estado", "{}");
    return r.ok;
  } catch {
    return false;
  }
}

/** PTA1108C · Subredes privadas de las interfaces de esta máquina (las conoce Node). Vacío si no hay lado de Node. */
export async function leerSubredesLocales(post: PostLocal): Promise<string[]> {
  try {
    const r = await post("estado", "{}");
    if (!r.ok) return [];
    const j = (await r.json()) as { subredes?: unknown };
    return Array.isArray(j.subredes) ? j.subredes.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

/** PTA1110A · Puertos de IA (de la lista fija de Node) que escuchan ahora en el bucle local de esta máquina. */
export async function leerIaLocal(post: PostLocal): Promise<number[]> {
  try {
    const r = await post("estado", "{}");
    if (!r.ok) return [];
    const j = (await r.json()) as { ia?: unknown };
    return Array.isArray(j.ia) ? j.ia.filter((x): x is number => Number.isInteger(x) && x > 0 && x < 65536).slice(0, 4) : [];
  } catch {
    return [];
  }
}

/** PTA1110A · ¿Hay salida PROPIA? La mide Node con un TCP directo. `null` = Node no contestó. */
export async function sondaPropiaNode(post: PostLocal, host: string, port: number): Promise<{ ok: boolean; ms: number | null } | null> {
  try {
    const r = await post("sonda", JSON.stringify({ host, port }), { "content-type": "application/json" });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; ms?: number | null };
    return { ok: j.ok === true, ms: typeof j.ms === "number" ? j.ms : null };
  } catch {
    return null;
  }
}

export async function activarModoLocal(post: PostLocal, activo: boolean, proxy = true): Promise<{ activo: boolean; proxy: number | null } | null> {
  try {
    const r = await post("modo", JSON.stringify({ activo, proxy }), { "content-type": "application/json" });
    return r.ok ? ((await r.json()) as { activo: boolean; proxy: number | null }) : null;
  } catch {
    return null;
  }
}

/** Esta neurona como puerta: abre el TCP de salida en Node (que valida el DNS y rechaza lo privado). */
export function crearAbrirTcpLocal(post: PostLocal) {
  return async function abrirTcp(host: string, port: number, o: { permitirPrivadas: boolean; concedido?: Concesion | null }): Promise<SocketSalida> {
    // PTA1108C: Node solo abre lo privado que venga en `concedido` (la política de esta neurona); `permitirPrivadas` ya no se envía.
    const r = await post("tcp", JSON.stringify({ host, port, ...(o.concedido ? { concedido: o.concedido } : {}) }), { "content-type": "application/json" });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!j.id) throw new Error(j.error && /^[a-z-]{3,30}$/.test(j.error) ? j.error : "no-conecta");
    const id = j.id;
    const ref: { datos: ((b: Uint8Array) => Promise<void> | void) | null; cierre: ((e?: string) => void) | null } = { datos: null, cierre: null };
    let cerrado = false;
    const terminar = (motivo?: string): void => {
      if (cerrado) return;
      cerrado = true;
      ref.cierre?.(motivo);
    };
    // Bucle de lectura con espera larga; no pide más hasta que la malla aceptó lo anterior (contrapresión).
    void (async () => {
      while (!cerrado) {
        try {
          const rr = await post(`leer?id=${encodeURIComponent(id)}`);
          if (!rr.ok && rr.status !== 204) return terminar("lectura");
          const b = new Uint8Array(await rr.arrayBuffer());
          if (b.length && ref.datos) await ref.datos(b);
          const cierre = rr.headers.get("x-puerta-cierre");
          if (cierre !== null) return terminar(decodeURIComponent(cierre) === "fin" ? undefined : decodeURIComponent(cierre));
        } catch {
          return terminar("lectura");
        }
      }
    })();
    return {
      async escribir(b) {
        const w = await post(`escribir?id=${encodeURIComponent(id)}`, b as unknown as BodyInit);
        if (!w.ok) throw new Error("escritura");
      },
      alDatos(cb) {
        ref.datos = cb;
      },
      alCerrar(cb) {
        ref.cierre = cb;
        if (cerrado) cb();
      },
      cerrar() {
        if (cerrado) return;
        cerrado = true;
        void post(`cerrar?id=${encodeURIComponent(id)}`).catch(() => undefined);
      },
    };
  };
}

export interface HandleAtencion {
  detener(): void;
}

/**
 * Esta neurona pide salida. Atiende las tuberías de ENTRADA que crea Node (proxy y `fetch`): abre el túnel por la malla,
 * avisa a Node (`abierto`) y copia bytes. Si no hay puerta, Node responde 502 al navegador (el túnel avisa el motivo).
 */
export function atenderEntradas(post: PostLocal, gestor: Pick<GestorPuerta, "abrirTunel">, alAbrir?: (info: { puerta: string; enlace: string; saltos: number; host: string }) => void): HandleAtencion {
  let vivo = true;

  async function servir(t: { id: string; host: string; port: number }): Promise<void> {
    const id = encodeURIComponent(t.id);
    const tunel = await gestor.abrirTunel(t.host, t.port);
    if ("error" in tunel) {
      await post(`abierto?id=${id}`, JSON.stringify({ ok: false, m: tunel.error }), { "content-type": "application/json" }).catch(() => undefined);
      return;
    }
    await post(`abierto?id=${id}`, JSON.stringify({ ok: true }), { "content-type": "application/json" }).catch(() => undefined);
    alAbrir?.({ puerta: tunel.puerta, enlace: tunel.enlace, saltos: tunel.saltos, host: t.host });
    let fin = false;
    const cerrarTodo = (): void => {
      if (fin) return;
      fin = true;
      tunel.cerrar();
      void post(`cerrar?id=${id}`).catch(() => undefined);
    };
    tunel.alCerrar(() => {
      if (!fin) {
        fin = true;
        void post(`cerrar?id=${id}`).catch(() => undefined);
      }
    });
    // malla → Node (navegador/TLS)
    tunel.alDatos(async (b) => {
      if (fin) return;
      const w = await post(`escribir?id=${id}`, b as unknown as BodyInit);
      if (!w.ok) cerrarTodo();
    });
    // Node → malla
    while (vivo && !fin) {
      let r: Response;
      try {
        r = await post(`leer?id=${id}`);
      } catch {
        break;
      }
      if (!r.ok && r.status !== 204) break;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length && !(await tunel.escribir(b))) break;
      if (r.headers.get("x-puerta-cierre") !== null) break;
    }
    cerrarTodo();
  }

  void (async () => {
    while (vivo) {
      try {
        const r = await post("pendientes");
        if (!r.ok) {
          await dormir(ESPERA_REINTENTO_MS * 4);
          continue;
        }
        const j = (await r.json()) as { tuberias?: Array<{ id: string; host: string; port: number }> };
        for (const t of j.tuberias ?? []) void servir(t).catch(() => undefined);
      } catch {
        await dormir(ESPERA_REINTENTO_MS);
      }
    }
  })();

  return {
    detener() {
      vivo = false;
    },
  };
}

/** `RespaldoFetch` por el `fetch` TLS de Node. `estado` dice si hay salida propia, puertas y si el ajuste está activo. */
export function respaldoFetchLocal(post: PostLocal, estado: { activo: () => boolean; hayPuertas: () => boolean; sinSalida: () => boolean; requiereCapa?: (url: string) => boolean }): RespaldoFetch {
  return {
    ...estado,
    async pedir(url, init) {
      const cabeceras: Array<[string, string]> = [];
      new Headers(init.headers).forEach((v, k) => cabeceras.push([k, v]));
      const peticion = encodeURIComponent(JSON.stringify({ url, metodo: init.method ?? "GET", cabeceras, ...(estado.requiereCapa?.(url) ? { capa: true } : {}) /* PTA1108C */ }));
      const r = await post("fetch", init.cuerpo ?? null, { "x-puerta-peticion": peticion }, init.signal ?? undefined);
      const meta = r.headers.get("x-puerta-respuesta");
      if (!r.ok || !meta) throw new TypeError("puerta: " + r.status);
      const m = JSON.parse(decodeURIComponent(meta)) as { status: number; statusText: string; cabeceras: Array<[string, string]> };
      const h = new Headers();
      for (const [k, v] of m.cabeceras) {
        try {
          h.append(k, v);
        } catch {
          /* cabecera que el navegador no admite */
        }
      }
      const sinCuerpo = m.status === 204 || m.status === 205 || m.status === 304 || (m.status >= 100 && m.status < 200);
      return new Response(sinCuerpo ? null : r.body, { status: m.status, statusText: m.statusText, headers: h });
    },
  };
}
