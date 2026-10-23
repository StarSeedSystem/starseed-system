#!/usr/bin/env node
/**
 * Arranca el conversor por la malla (Hono sobre Node). Variables:
 *   STARSEED_CONVERSOR_PUERTO  (4481)
 *   STARSEED_CONVERSOR_TOKEN     (Bearer; sin token solo 127.0.0.1)
 *   STARSEED_CONVERSOR_ORIGENES (orígenes web permitidos, separados por comas)
 */
import { serve } from "@hono/node-server";
import { crearApp } from "../src/app.mjs";

const puerto = Number(process.env.STARSEED_CONVERSOR_PUERTO || 4481);
const host = process.env.STARSEED_CONVERSOR_HOST || "127.0.0.1";
const token = process.env.STARSEED_CONVERSOR_TOKEN || "";
const origenes = (process.env.STARSEED_CONVERSOR_ORIGENES || "").split(",").map((s) => s.trim()).filter(Boolean);
const local = host === "127.0.0.1" || host === "::1" || host === "localhost";

if (!local && !token) {
  console.error("conversor: para escuchar fuera de esta máquina hace falta STARSEED_CONVERSOR_TOKEN.");
  process.exit(2);
}
serve({ fetch: crearApp({ token, origenes }).fetch, port: puerto, hostname: host }, (i) => {
  console.log(`conversor escuchando en http://${host}:${i.port} (${token ? "con token" : "solo esta máquina"})`);
});
