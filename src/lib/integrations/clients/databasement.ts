// ════════════════════════════════════════════════════════════════
// Databasement — RESPALDO de las bases de datos por endpoint (P4-7)
// ----------------------------------------------------------------
// ⚠️ HONESTIDAD PRIMERO — QUÉ ES **REALMENTE**:
// Databasement (David-Crty/databasement · PHP/Laravel · MIT) NO es «una base de
// datos para cada cuenta/cerebro/perfil». Es un **gestor de COPIAS DE SEGURIDAD
// de bases de datos, auto-hospedado, con panel web**: programa, ejecuta y
// restaura backups de MySQL, PostgreSQL, MariaDB, SQL Server, MongoDB, SQLite,
// Firebird y Redis hacia S3 / SFTP / FTP / disco local, con túnel SSH y agentes
// remotos para redes cerradas. (Leído en su README y en `routes/api.php`.)
//
// POR TANTO, en StarSeed encaja como el **servidor de respaldo** de los datos de
// una cuenta / un cerebro / un perfil: se declara como servidor del cerebro
// (rol «storage»/respaldo) y desde aquí se consultan sus servidores, sus
// instantáneas y se dispara una copia. Lo que NO haremos es fingir que provisiona
// bases de datos nuevas: no lo hace.
//
// API REAL (verificada en `routes/api.php` del repo, prefijo `/api/v1`,
// middleware `auth:sanctum` → cabecera `Authorization: Bearer <token>`):
//   · GET  /up                                       → salud de Laravel (200)
//   · GET  /api/v1/database-servers                  → servidores registrados
//   · GET  /api/v1/database-servers/{id}/test-connection
//   · POST /api/v1/database-servers/{id}/backup      → lanza una copia AHORA
//   · GET  /api/v1/snapshots                         → instantáneas
//   · GET  /api/v1/jobs                              → trabajos y su progreso
//   · GET  /api/v1/volumes                           → destinos (S3/SFTP/local)
//   · GET  /api/v1/backup-schedules                  → programaciones
//
// ⚠️ `POST …/backup` y cualquier RESTAURACIÓN tienen efectos reales sobre datos.
// El OS NO los dispara solo: siempre con acción explícita del usuario.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

const ID = "databasement";
const API = "/api/v1";

/** Salud: `GET /up` (endpoint de salud estándar de Laravel 11+). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: "/up",
    auth: "none",
    timeoutMs: 8_000,
  });
  if (res.ok) return { ok: true, data: { message: "Instancia de Databasement alcanzable." } };
  // Respaldo: si /up no existe en esa versión, prueba la API (revela si la clave vale).
  return servers(cfg);
}

/** Servidores de base de datos registrados en Databasement. */
export async function servers(cfg: IntegrationConfig): Promise<IntegrationResult> {
  if (!(cfg.apiKey || "").trim()) {
    return { ok: false, error: "Databasement necesita un token de API (Sanctum) para listar servidores." };
  }
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: `${API}/database-servers`,
    apiKey: cfg.apiKey,
    auth: "bearer",
    timeoutMs: 12_000,
  });
  if (!res.ok) return res;
  const arr = (res.data as any)?.data ?? res.data;
  const list = Array.isArray(arr) ? arr : [];
  return {
    ok: true,
    data: {
      servers: list.map((s: any) => ({
        id: String(s?.id ?? ""),
        name: String(s?.name ?? "Servidor"),
        driver: String(s?.driver ?? s?.type ?? "?"),
        host: String(s?.host ?? ""),
      })),
    },
  };
}

/** Instantáneas (copias ya hechas) — para ver que el respaldo está vivo. */
export async function snapshots(cfg: IntegrationConfig): Promise<IntegrationResult> {
  if (!(cfg.apiKey || "").trim()) return { ok: false, error: "Falta el token de API de Databasement." };
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "GET",
    path: `${API}/snapshots`,
    apiKey: cfg.apiKey,
    auth: "bearer",
    timeoutMs: 12_000,
  });
  if (!res.ok) return res;
  const arr = (res.data as any)?.data ?? res.data;
  const list = Array.isArray(arr) ? arr : [];
  return {
    ok: true,
    data: {
      snapshots: list.slice(0, 30).map((s: any) => ({
        id: String(s?.id ?? ""),
        server: String(s?.database_server?.name ?? s?.database_server_id ?? ""),
        size: s?.size ?? null,
        createdAt: String(s?.created_at ?? ""),
      })),
      total: list.length,
    },
  };
}

/**
 * Lanza una COPIA AHORA de un servidor concreto.
 * ⚠️ Acción con efectos: solo desde una pulsación explícita del usuario.
 */
export async function backupNow(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const serverId = String(input?.serverId ?? input?.id ?? "").trim();
  if (!serverId) return { ok: false, error: "Indica el id del servidor a respaldar." };
  if (!(cfg.apiKey || "").trim()) return { ok: false, error: "Falta el token de API de Databasement." };
  return proxyFetch({
    id: ID,
    endpoint: cfg.endpoint!,
    method: "POST",
    path: `${API}/database-servers/${encodeURIComponent(serverId)}/backup`,
    body: input?.volumeId ? { volume_id: input.volumeId } : {},
    apiKey: cfg.apiKey,
    auth: "bearer",
    timeoutMs: 20_000,
  });
}
