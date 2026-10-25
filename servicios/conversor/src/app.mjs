// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversor por la malla, sobre Hono (2026-10-25)
// ----------------------------------------------------------------------------
// Alex (2026-10-23): Filee «para todo el OS y la Biblioteca, usado desde
// cualquier medio». El servicio vive en la neurona que TIENE Filee ( puerto
// 4481) y las demás neuronas de la cuenta lo llaman por la malla con token:
// `GET /salud`, `GET /formatos?de=`, `POST /convertir` (multipart archivo + a +
// calidad). Llama a la orden `filee` con execFile y lista de argumentos (nunca
// shell), en una carpeta temporal que se borra siempre; topes: 500 MB, 15 min,
// 2 a la vez. Mismo patrón que `servicios/servidor-ia`. Sin token solo escucha
// en 127.0.0.1 (lo decide bin/conversor.mjs). Contrato:
// `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════
import { execFile } from "node:child_process";
import { promises as fs, constants as fsc } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";

import { esFormatoValido, formatoDe, leerDestinos, leerListaFormatos, nombreDeSalida, nombreSeguro, ordenarDestinos, tipoDe } from "./formatos.mjs";
import { zipArchivos } from "./zip.mjs";

export const VERSION = "1.0.0";

/** 500 MB: lo que cabe holgado en la memoria de una neurona de 8 GB. */
export const MAX_BYTES_CONVERSION = 500 * 1024 * 1024;
/** Vídeo largo a AV1 puede tardar; más de 15 min es que algo se colgó. */
export const TIEMPO_CONVERSION_MS = 15 * 60 * 1000;
/** Conversiones a la vez (Filee ya paraleliza por dentro). */
export const MAX_SIMULTANEAS = 2;

export function _ponerEjecutor(e) {
export function crearApp(_ = {}) {
    return new Hono();
}
