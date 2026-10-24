"use client";

import type { EntityRef } from "@/lib/sync/entity-state";
import { saveItem } from "@/lib/library/entity-library";
import { listLibrary } from "@/lib/library/entity-library";
import { createFolder } from "@/lib/library/entity-library";
import { ensureMediaFolders } from "@/lib/library/media-library";
import { saveMediaToLibrary } from "@/lib/library/media-library";
import { uploadFile } from "@/lib/files/os-files";

export interface GuardarSetInput {
  ref: EntityRef;
  set: any;
  carpetaId?: string | null;
}

export interface GuardarSetResult {
  ok: boolean;
  error?: string;
  setId?: string;
  archivo?: string;
}

export async function guardarSet(input: GuardarSetInput): Promise<GuardarSetResult> {
  try {
    const { ref, set, carpetaId } = input;

    let targetFolderId: string | null = null;

    if (carpetaId) {
      targetFolderId = carpetaId;
    } else {
      const doc = await listLibrary(ref);
      let fondosFolder = doc.folders.find((f) => f.name === "Fondos" && f.parentId === null);
      if (!fondosFolder) {
        targetFolderId = await createFolder(ref, "Fondos", null);
      } else {
        targetFolderId = fondosFolder.id;
      }
    }

    const savedSetId = await saveItem(ref, {
      type: "file",
      title: set.nombre,
      note: "Fondo con shader guardado",
      tags: ["fondo", "shader"],
      folderId: targetFolderId,
      mime: "application/json",
      content: JSON.stringify(set),
    });

    if (set.vistaPrevia) {
      const previewBlob = new Blob([Buffer.from(set.vistaPrevia.replace(/^data:image\/png;base64,/, ''), 'base64')], { type: 'image/png' });
      const uploadRes = await uploadFile(previewBlob, {
        folder: "fondos-preview",
        isPublic: true,
        meta: { setId: savedSetId, setName: set.nombre },
      });
    }

    const slug = set.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return { ok: true, setId: savedSetId, archivo: `${slug || "fondo"}.starseed-fondo.json` };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Error al guardar el fondo" };
  }
}

export interface ListarSetsResult {
  ok: boolean;
  error?: string;
  sets?: any[];
}

export async function listarSets(ref: EntityRef): Promise<ListarSetsResult> {
  try {
    const doc = await listLibrary(ref);
    const sets: any[] = [];

    for (const item of doc.items) {
      if (item.type === "file" && item.title && (item.title.includes("fondo") || item.title.includes("Fondo"))) {
        try {
          const set = typeof item.content === "string" ? JSON.parse(item.content) : item.content;
          if (set && set.formato === "starseed-fondo") {
            sets.push(set);
          }
        } catch {
        }
      }
    }

    return { ok: true, sets };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Error al listar fondos" };
  }
}
