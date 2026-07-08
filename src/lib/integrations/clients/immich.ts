// ════════════════════════════════════════════════════════════════
// Immich — servidor self-host de fotos/vídeos con ML (álbumes/assets)
// ----------------------------------------------------------------
// Conector de SOLO LECTURA v1:
//   GET  {endpoint}/api/albums          → álbumes del usuario
//   POST {endpoint}/api/search/metadata → assets recientes (orden desc)
// Auth: cabecera `x-api-key` (clave de API personal — Immich → Ajustes de
// cuenta → API Keys).
//
// NOTA HONESTA: las versiones actuales de Immich retiraron el clásico
// `GET /api/assets` de listado; "recientes" se obtiene con
// `POST /api/search/metadata` (campo `size` = «take», `order` por defecto
// "desc" = más recientes primero). Verificado vía código fuente de
// immich-app/immich (server/src/controllers/{album,search}.controller.ts +
// server/src/dtos/search.dto.ts, jul-2026) — no fingimos un endpoint que ya
// no existe en la API real.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

interface ImmichAlbum {
  id?: string;
  albumName?: string;
  assetCount?: number;
  updatedAt?: string;
}

interface ImmichAsset {
  id?: string;
  originalFileName?: string;
  type?: string;
  fileCreatedAt?: string;
}

function slimAlbum(a: ImmichAlbum) {
  return { id: a?.id, nombre: a?.albumName, elementos: a?.assetCount, actualizado: a?.updatedAt };
}

function slimAsset(a: ImmichAsset) {
  return { id: a?.id, nombre: a?.originalFileName, tipo: a?.type, fecha: a?.fileCreatedAt };
}

/** Normaliza cuántos assets recientes pedir (por defecto 20, tope 100). */
function takeOf(input: any): number {
  const raw = input && typeof input === "object" ? Number(input.take ?? input.size ?? input.limit) : Number(input);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.min(Math.max(Math.trunc(raw), 1), 100);
}

/** Acción "albums": lista los álbumes del usuario (solo lectura). */
export async function albums(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: "immich",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "GET",
    path: "/api/albums",
  });
  if (!res.ok) return res;
  const rows: ImmichAlbum[] = Array.isArray(res.data) ? res.data : [];
  return { ok: true, data: { albums: rows.map(slimAlbum), total: rows.length } };
}

/** Acción "assets": assets más recientes (solo lectura). Entrada opcional: { take }. */
export async function assets(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: "immich",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "POST",
    path: "/api/search/metadata",
    body: { size: takeOf(input), order: "desc" },
  });
  if (!res.ok) return res;
  const rows: ImmichAsset[] = Array.isArray(res.data?.assets?.items) ? res.data.assets.items : [];
  return { ok: true, data: { assets: rows.map(slimAsset), total: res.data?.assets?.total ?? rows.length } };
}

/** Salud: lista de álbumes (ligera; confirma endpoint + clave). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "immich",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "GET",
    path: "/api/albums",
    timeoutMs: 10_000,
  });
}
