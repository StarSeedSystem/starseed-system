"use client";

/**
 * SYNC de memorias de un cerebro con Google Drive (Ola 374).
 * ============================================================================
 * Google Drive como MEDIO de cualquier cerebro/memoria: además del backend
 * genérico (`backends.ts`, kind `gdrive`) usado para réplica de archivos
 * sueltos, un cerebro con Drive activo sincroniza sus `brain_memory_files`
 * como `.md` dentro de `StarSeed/cerebros/<nombre del cerebro>/` (o la carpeta
 * que el usuario haya elegido con el Picker).
 *
 * DEDUPLICACIÓN: cada archivo se marca en Drive con `appProperties`
 * `{ brainId, memoryId }` — así, aunque el usuario mueva/renombre el archivo
 * en su Drive, se reencuentra por esas propiedades (no por nombre, que puede
 * cambiar) y nunca se duplica.
 *
 * REGLA DE CONFLICTO — "el más nuevo gana" (misma regla que
 * `memory-sync/connect.ts::importRootToBrain`): se compara la marca de tiempo
 * de cada lado; si Drive es MÁS NUEVO se baja (pull); si no, se sube (push).
 * Un empate exacto no mueve nada (evita escrituras sin motivo). NINGÚN borrado
 * se propaga automáticamente en ninguna dirección: borrar en Drive no borra la
 * memoria del cerebro, ni al revés — es una elección explícita del usuario,
 * nunca una consecuencia silenciosa del sync.
 *
 * Este módulo separa la lógica PURA (planificación: sin red, 100% testeable)
 * de la EJECUCIÓN (con red: llama a `gdrive-driver.ts` y a `memory-files.ts`).
 */

import {
  actualizarArchivo,
  asegurarCarpeta,
  buscarPorPropiedades,
  descargar,
  listarArchivosDeCarpeta,
  subirArchivo,
  type DriveFile,
} from "@/lib/storage/gdrive-driver";
import { tokenVigente } from "@/lib/storage/carpetas-remotas";
import {
  listMemoryFiles,
  saveMemoryFile,
  updateMemoryContent,
  setMemorySource,
  type MemoryFile,
} from "@/lib/cerebro/memory-files";

/* ══════════════════════════ Lógica PURA (sin red) ══════════════════════════ */

export interface RegistroLocal {
  id: string;
  name: string;
  content: string;
  /** epoch ms; null si no se pudo interpretar `updated_at`. */
  updatedAtMs: number | null;
  /** `server_config.fileId` ya vinculado, si lo hay. */
  driveFileId?: string;
}

export interface RegistroRemoto {
  fileId: string;
  name: string;
  /** epoch ms; null si Drive no dio `modifiedTime`. */
  modifiedTimeMs: number | null;
  /** `appProperties.memoryId`, si Drive lo trae (para emparejar sin depender del `fileId` local). */
  memoryId?: string;
}

export type AccionSync =
  | { tipo: "crear_en_drive"; local: RegistroLocal }
  | { tipo: "subir_actualizacion"; local: RegistroLocal; fileId: string }
  | { tipo: "bajar_actualizacion"; local: RegistroLocal; remoto: RegistroRemoto }
  | { tipo: "sin_cambios"; local: RegistroLocal; fileId?: string };

/**
 * Decide la acción para UN par (local, remoto emparejado o no). Pura: nada de
 * red ni de reloj — recibe los timestamps ya resueltos.
 *   · Sin remoto emparejado           → crear_en_drive.
 *   · Remoto MÁS NUEVO (estrictamente) → bajar_actualizacion (Drive gana).
 *   · Empate o local más nuevo/remoto sin fecha → subir_actualizacion (local gana o no hay nada que decidir).
 */
export function decidirAccionArchivo(local: RegistroLocal, remoto: RegistroRemoto | null): AccionSync {
  if (!remoto) return { tipo: "crear_en_drive", local };
  const localMs = local.updatedAtMs;
  const remotoMs = remoto.modifiedTimeMs;
  if (remotoMs != null && localMs != null && remotoMs > localMs) {
    return { tipo: "bajar_actualizacion", local, remoto };
  }
  if (remotoMs != null && localMs != null && remotoMs === localMs) {
    return { tipo: "sin_cambios", local, fileId: remoto.fileId };
  }
  // Local más nuevo, remoto sin fecha resoluble, o local sin fecha (recién
  // creado): se sube — nunca se pierde un cambio local por falta de reloj.
  return { tipo: "subir_actualizacion", local, fileId: remoto.fileId };
}

export interface PlanSync {
  /** Una acción por cada fichero local considerado. */
  acciones: AccionSync[];
  /**
   * Archivos que existen en Drive (con `appProperties.brainId` de este
   * cerebro) pero cuyo `memoryId` no corresponde a NINGÚN fichero local
   * conocido: el usuario los creó/pegó directamente en la carpeta de Drive.
   * Se listan para CREAR un fichero local nuevo (nunca se borran del lado
   * remoto ni se inventa una fusión).
   */
  nuevosDesdeDrive: RegistroRemoto[];
}

/**
 * Planifica el sync completo de un cerebro: empareja cada fichero local con
 * su remoto (por `driveFileId` si ya está vinculado, si no por
 * `remoto.memoryId === local.id`), decide la acción de cada par, y separa los
 * remotos huérfanos (nuevos desde Drive). Pura — no hace I/O.
 */
export function planificarSincronizacion(locales: RegistroLocal[], remotos: RegistroRemoto[]): PlanSync {
  const remotosPorFileId = new Map(remotos.map((r) => [r.fileId, r] as const));
  const remotosPorMemoryId = new Map(remotos.filter((r) => r.memoryId).map((r) => [r.memoryId as string, r] as const));
  const emparejados = new Set<string>(); // fileId de remotos ya usados

  const acciones: AccionSync[] = locales.map((local) => {
    const remoto =
      (local.driveFileId && remotosPorFileId.get(local.driveFileId)) ||
      remotosPorMemoryId.get(local.id) ||
      null;
    if (remoto) emparejados.add(remoto.fileId);
    return decidirAccionArchivo(local, remoto);
  });

  const nuevosDesdeDrive = remotos.filter((r) => !emparejados.has(r.fileId));

  return { acciones, nuevosDesdeDrive };
}

/** Convierte un `updated_at`/`meta.updated` de `MemoryFile` a epoch ms (o null). */
export function memoryFileUpdatedMs(f: Pick<MemoryFile, "updated_at">): number | null {
  if (!f.updated_at) return null;
  const ms = Date.parse(f.updated_at);
  return Number.isNaN(ms) ? null : ms;
}

/** Convierte un `DriveFile.modifiedTime` (RFC3339) a epoch ms (o null). */
export function driveModifiedMs(f: Pick<DriveFile, "modifiedTime">): number | null {
  if (!f.modifiedTime) return null;
  const ms = Date.parse(f.modifiedTime);
  return Number.isNaN(ms) ? null : ms;
}

/* ══════════════════════════ Ejecución (con red) ══════════════════════════ */

export interface ResultadoSyncDrive {
  ok: boolean;
  subidos: number;
  actualizadosEnDrive: number;
  bajados: number;
  nuevosDesdeDrive: number;
  errores: string[];
  /** Carpeta final usada (por si se creó automáticamente). */
  folderId?: string;
}

export interface BackendGdriveConfig {
  /** Id de carpeta ya elegida (Picker) o creada previamente. */
  folderId?: string;
  folderName?: string;
  cuenta?: string;
  modo?: "espejo" | "principal";
}

/**
 * Ejecuta el sync REAL de un cerebro contra su carpeta de Google Drive.
 * `config.folderId` ausente ⇒ se asegura (crea si falta)
 * `StarSeed/cerebros/<nombre del cerebro>` y se devuelve su id (el llamador
 * debe guardarlo en el backend para no recrearla cada vez).
 *
 * Nunca lanza: cualquier fallo por archivo se acumula en `errores` y el resto
 * de archivos se sigue procesando (best-effort, honesto).
 */
export async function sincronizarCerebroConDrive(
  brainId: string,
  brainName: string,
  config: BackendGdriveConfig,
): Promise<ResultadoSyncDrive> {
  const errores: string[] = [];
  const token = await tokenVigente("google-drive");
  if (!token) {
    return { ok: false, subidos: 0, actualizadosEnDrive: 0, bajados: 0, nuevosDesdeDrive: 0, errores: ["Google Drive no está conectado (o la sesión caducó): reconecta tu cuenta."] };
  }

  let folderId = config.folderId;
  if (!folderId) {
    const asegurada = await asegurarCarpeta(token, ["StarSeed", "cerebros", brainName || brainId]);
    if (!asegurada.ok || !asegurada.folderId) {
      return { ok: false, subidos: 0, actualizadosEnDrive: 0, bajados: 0, nuevosDesdeDrive: 0, errores: [asegurada.error || "No se pudo preparar la carpeta del cerebro en Google Drive."] };
    }
    folderId = asegurada.folderId;
  }

  const [archivosLocales, listado] = await Promise.all([
    listMemoryFiles(brainId),
    listarArchivosDeCarpeta(token, folderId),
  ]);
  if (!listado.ok) {
    return { ok: false, subidos: 0, actualizadosEnDrive: 0, bajados: 0, nuevosDesdeDrive: 0, errores: [listado.error || "No se pudo listar la carpeta de Drive."], folderId };
  }

  const locales: RegistroLocal[] = archivosLocales.map((f) => ({
    id: f.id,
    name: f.name,
    content: f.content,
    updatedAtMs: memoryFileUpdatedMs(f),
    driveFileId: typeof f.server_config?.fileId === "string" ? (f.server_config.fileId as string) : undefined,
  }));
  const remotos: RegistroRemoto[] = listado.archivos.map((a) => ({
    fileId: a.id,
    name: a.name,
    modifiedTimeMs: driveModifiedMs(a),
    memoryId: a.appProperties?.memoryId,
  }));

  const plan = planificarSincronizacion(locales, remotos);
  const porId = new Map(archivosLocales.map((f) => [f.id, f] as const));

  let subidos = 0;
  let actualizadosEnDrive = 0;
  let bajados = 0;

  for (const accion of plan.acciones) {
    const original = porId.get(accion.local.id);
    if (!original) continue;
    try {
      if (accion.tipo === "crear_en_drive") {
        const r = await subirArchivo(token, {
          carpetaId: folderId,
          nombre: accion.local.name,
          contenido: accion.local.content,
          appProperties: { brainId, memoryId: accion.local.id },
        });
        if (!r.ok || !r.fileId) { errores.push(`«${accion.local.name}»: ${r.error || "no se pudo subir."}`); continue; }
        await setMemorySource(original.id, "gdrive", { ...original.server_config, fileId: r.fileId, folderId }, true);
        subidos++;
      } else if (accion.tipo === "subir_actualizacion") {
        // Búsqueda de respaldo si el fileId vinculado quedó rancio (el usuario
        // borró/movió el archivo en Drive): se re-busca por appProperties antes
        // de asumir que hay que recrearlo.
        let fileId = accion.fileId;
        if (!fileId) {
          const encontrado = await buscarPorPropiedades(token, { brainId, memoryId: accion.local.id }, { carpetaId: folderId });
          fileId = encontrado.archivos[0]?.id;
        }
        if (!fileId) {
          const r = await subirArchivo(token, { carpetaId: folderId, nombre: accion.local.name, contenido: accion.local.content, appProperties: { brainId, memoryId: accion.local.id } });
          if (!r.ok || !r.fileId) { errores.push(`«${accion.local.name}»: ${r.error || "no se pudo subir."}`); continue; }
          fileId = r.fileId;
          subidos++;
        } else {
          const r = await actualizarArchivo(token, fileId, accion.local.content);
          if (!r.ok) { errores.push(`«${accion.local.name}»: ${r.error || "no se pudo actualizar en Drive."}`); continue; }
          actualizadosEnDrive++;
        }
        await setMemorySource(original.id, "gdrive", { ...original.server_config, fileId, folderId }, true);
      } else if (accion.tipo === "bajar_actualizacion") {
        const r = await descargar(token, accion.remoto.fileId);
        if (!r.ok || r.contenido === undefined) { errores.push(`«${accion.local.name}»: ${r.error || "no se pudo descargar de Drive."}`); continue; }
        await updateMemoryContent(original.id, r.contenido);
        await setMemorySource(original.id, "gdrive", { ...original.server_config, fileId: accion.remoto.fileId, folderId }, true);
        bajados++;
      }
      // "sin_cambios": nada que hacer, pero se asegura el vínculo por si faltaba.
      else if (accion.fileId && !original.server_config?.fileId) {
        await setMemorySource(original.id, "gdrive", { ...original.server_config, fileId: accion.fileId, folderId }, true);
      }
    } catch (e) {
      errores.push(`«${accion.local.name}»: ${(e as Error)?.message || "error inesperado."}`);
    }
  }

  // Archivos nuevos DESDE Drive (creados a mano por el usuario en su carpeta):
  // se crean como ficheros de memoria locales, nunca se borran del lado remoto.
  for (const nuevo of plan.nuevosDesdeDrive) {
    try {
      const r = await descargar(token, nuevo.fileId);
      if (!r.ok || r.contenido === undefined) { errores.push(`«${nuevo.name}» (nuevo en Drive): ${r.error || "no se pudo descargar."}`); continue; }
      await saveMemoryFile({
        brain_id: brainId,
        name: nuevo.name,
        content: r.contenido,
        source: "gdrive",
        server_config: { fileId: nuevo.fileId, folderId },
        meta: { origin: "gdrive-discovery" },
        sync: true,
      });
      bajados++;
    } catch (e) {
      errores.push(`«${nuevo.name}» (nuevo en Drive): ${(e as Error)?.message || "error inesperado."}`);
    }
  }

  return {
    ok: errores.length === 0,
    subidos,
    actualizadosEnDrive,
    bajados,
    nuevosDesdeDrive: plan.nuevosDesdeDrive.length,
    errores,
    folderId,
  };
}
