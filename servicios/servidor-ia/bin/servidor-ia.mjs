#!/usr/bin/env node
/**
 * Arranca el servidor propio de IA (Hono sobre Node). Variables:
 *   STARSEED_SERVIDOR_IA_PUERTO   (4480)
 *   STARSEED_SERVIDOR_IA_HOST     (127.0.0.1; otra dirección exige token)
 *   STARSEED_SERVIDOR_IA_TOKEN    (Bearer que piden /v1/* y /motores; nunca se imprime)
 *   STARSEED_SERVIDOR_IA_ORIGENES (orígenes web permitidos, separados por comas)
 */
import { serve } from "@hono/node-server";

import { crearApp } from "../src/app.mjs";

const puerto = Number(process.env.STARSEED_SERVIDOR_IA_PUERTO || 4480);
const host = process.env.STARSEED_SERVIDOR_IA_HOST || "127.0.0.1";
const token = process.env.STARSEED_SERVIDOR_IA_TOKEN || "";
const origenes = (process.env.STARSEED_SERVIDOR_IA_ORIGENES || "").split(",").map((s) => s.trim()).filter(Boolean);
const local = host === "127.0.0.1" || host === "::1" || host === "localhost";

if (!local && !token) {
    console.error("servidor-ia: para escuchar fuera de esta máquina hace falta STARSEED_SERVIDOR_IA_TOKEN.");
    process.exit(2);
}
serve({ fetch: crearApp({ token, origenes }).fetch, port: puerto, hostname: host }, (i) => {
    console.log(`servidor-ia escuchando en http://${host}:${i.port} (${token ? "con token" : "solo esta máquina"})`);
});
