// HTTPS de la puerta sin tocar los archivos de OPO1011.
//
// El Caddy del A1 (contenedor `starseed-caddy`, red del anfitrión) lo prepara
// `deploy/oracle/nodo/preparar-a1.sh` con su propio Caddyfile, y cada `caddy reload` de ese guion
// deja la configuración como dice ese archivo. Para no pisarlo, la puerta añade SU sitio por la
// API de administración de Caddy (que solo escucha en localhost:2019) con un `@id` propio, y lo
// RECONCILIA cada 10 min: si el sitio no está (Caddy recargado o reiniciado), lo vuelve a poner.
// Caddy pide solo el certificado de Let's Encrypt para el nombre nuevo (sslip.io).

import { request } from "node:http";

export const ID_RUTA = "starseed-puerta-datos";

/**
 * Petición a la API de administración con `node:http` y no con `fetch`: el `fetch` de Node manda
 * `Sec-Fetch-Mode: cors` y Caddy lo trata como un navegador sin origen («client is not allowed to
 * access from origin ''», 403, medido en el A1 el 2026-10-10). Misma forma que una Response.
 */
export function pedirAdmin(url, init = {}) {
  return new Promise((resolver, rechazar) => {
    const u = new URL(url);
    const cuerpo = init.body ?? null;
    const req = request(
      {
        host: u.hostname,
        port: u.port || 80,
        path: `${u.pathname}${u.search}`,
        method: init.method || "GET",
        headers: { accept: "application/json", ...(init.headers || {}), ...(cuerpo ? { "content-length": Buffer.byteLength(cuerpo) } : {}) },
        timeout: 5_000,
      },
      (res) => {
        const trozos = [];
        res.on("data", (t) => trozos.push(t));
        res.on("end", () => {
          const texto = Buffer.concat(trozos).toString("utf8");
          resolver({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => JSON.parse(texto || "null"),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("TimeoutError")));
    req.on("error", rechazar);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

export function rutaCaddy(host, puerto) {
  return {
    "@id": ID_RUTA,
    match: [{ host: [host] }],
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [
              { handler: "encode", encodings: { gzip: {} }, prefer: ["gzip"] },
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: `127.0.0.1:${puerto}` }],
                flush_interval: -1,
                headers: { request: { delete: ["Cookie"] } },
              },
            ],
          },
        ],
      },
    ],
    terminal: true,
  };
}

/**
 * @returns {Promise<{ok: boolean, accion: "ya-estaba"|"anadida"|"sin-host"|"error", detalle?: string}>}
 */
export async function asegurarRutaCaddy({ admin, host, puerto, fetch: pedir = pedirAdmin }) {
  if (!host) return { ok: false, accion: "sin-host", detalle: "sin nombre público (falta /etc/starseed/host)" };
  const opts = (extra = {}) => ({ ...extra });
  try {
    const r = await pedir(`${admin}/id/${ID_RUTA}`, opts());
    if (r.ok) {
      const actual = await r.json().catch(() => null);
      const hostBien = actual?.match?.[0]?.host?.includes?.(host);
      const dialBien = JSON.stringify(actual ?? {}).includes(`127.0.0.1:${puerto}`);
      if (hostBien && dialBien) return { ok: true, accion: "ya-estaba" };
      const p = await pedir(`${admin}/id/${ID_RUTA}`, opts({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rutaCaddy(host, puerto)),
      }));
      return p.ok ? { ok: true, accion: "anadida" } : { ok: false, accion: "error", detalle: `PATCH ${p.status}` };
    }
    const s = await pedir(`${admin}/config/apps/http/servers`, opts());
    if (!s.ok) return { ok: false, accion: "error", detalle: `servidores ${s.status}` };
    const servidores = (await s.json().catch(() => null)) ?? {};
    const nombre = Object.keys(servidores).find((k) => (servidores[k]?.listen ?? []).some((l) => /:443$/.test(String(l))));
    if (!nombre) return { ok: false, accion: "error", detalle: "Caddy sin servidor en :443" };
    const a = await pedir(`${admin}/config/apps/http/servers/${encodeURIComponent(nombre)}/routes`, opts({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rutaCaddy(host, puerto)),
    }));
    return a.ok ? { ok: true, accion: "anadida" } : { ok: false, accion: "error", detalle: `POST ${a.status}` };
  } catch (e) {
    return { ok: false, accion: "error", detalle: e instanceof Error ? e.name : "red" };
  }
}
