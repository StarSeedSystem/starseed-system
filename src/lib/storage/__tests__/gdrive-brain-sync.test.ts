/**
 * Lógica PURA de sync de memorias↔Google Drive (Ola 374): "el más nuevo gana"
 * en ambas direcciones, conflictos, y que un borrado en un lado NUNCA se
 * propaga automáticamente al otro (solo se decide crear/actualizar).
 */
import { describe, expect, it } from "vitest";
import {
  decidirAccionArchivo,
  driveModifiedMs,
  memoryFileUpdatedMs,
  planificarSincronizacion,
  type RegistroLocal,
  type RegistroRemoto,
} from "../gdrive-brain-sync";

function local(over: Partial<RegistroLocal> = {}): RegistroLocal {
  return { id: "m1", name: "memory.md", content: "local", updatedAtMs: 1000, ...over };
}
function remoto(over: Partial<RegistroRemoto> = {}): RegistroRemoto {
  return { fileId: "f1", name: "memory.md", modifiedTimeMs: 1000, ...over };
}

describe("decidirAccionArchivo", () => {
  it("sin remoto emparejado → crear en Drive", () => {
    expect(decidirAccionArchivo(local(), null)).toEqual({ tipo: "crear_en_drive", local: local() });
  });

  it("remoto MÁS NUEVO (estrictamente) → Drive gana, se baja", () => {
    const l = local({ updatedAtMs: 1000 });
    const r = remoto({ modifiedTimeMs: 2000 });
    expect(decidirAccionArchivo(l, r)).toEqual({ tipo: "bajar_actualizacion", local: l, remoto: r });
  });

  it("local MÁS NUEVO → se sube (push)", () => {
    const l = local({ updatedAtMs: 2000 });
    const r = remoto({ modifiedTimeMs: 1000 });
    expect(decidirAccionArchivo(l, r)).toEqual({ tipo: "subir_actualizacion", local: l, fileId: "f1" });
  });

  it("EMPATE exacto → sin cambios (no escribe en ningún lado sin motivo)", () => {
    const l = local({ updatedAtMs: 1500 });
    const r = remoto({ modifiedTimeMs: 1500 });
    expect(decidirAccionArchivo(l, r)).toEqual({ tipo: "sin_cambios", local: l, fileId: "f1" });
  });

  it("local sin fecha resoluble (recién creado) y remoto con fecha → se sube igualmente (nunca se pierde un cambio local)", () => {
    const l = local({ updatedAtMs: null });
    const r = remoto({ modifiedTimeMs: 1000 });
    expect(decidirAccionArchivo(l, r).tipo).toBe("subir_actualizacion");
  });

  it("remoto sin fecha (Drive no dio modifiedTime) → se sube (local es lo único fiable)", () => {
    const l = local({ updatedAtMs: 1000 });
    const r = remoto({ modifiedTimeMs: null });
    expect(decidirAccionArchivo(l, r).tipo).toBe("subir_actualizacion");
  });
});

describe("planificarSincronizacion — emparejado y descubrimiento", () => {
  it("empareja por driveFileId cuando el local ya está vinculado", () => {
    const l = local({ driveFileId: "f1", updatedAtMs: 500 });
    const r = remoto({ fileId: "f1", modifiedTimeMs: 2000 });
    const plan = planificarSincronizacion([l], [r]);
    expect(plan.acciones).toEqual([{ tipo: "bajar_actualizacion", local: l, remoto: r }]);
    expect(plan.nuevosDesdeDrive).toEqual([]);
  });

  it("empareja por memoryId (appProperties) cuando el local AÚN no tiene fileId vinculado", () => {
    const l = local({ id: "m-nueva", driveFileId: undefined, updatedAtMs: 500 });
    const r = remoto({ fileId: "f-nuevo", memoryId: "m-nueva", modifiedTimeMs: 2000 });
    const plan = planificarSincronizacion([l], [r]);
    expect(plan.acciones[0].tipo).toBe("bajar_actualizacion");
    expect(plan.nuevosDesdeDrive).toEqual([]);
  });

  it("un remoto SIN contraparte local (creado a mano en Drive) va a `nuevosDesdeDrive`, nunca se borra ni se inventa una fusión", () => {
    const l = local({ id: "m1" });
    const rHuerfano = remoto({ fileId: "f-huerfano", name: "pegado-en-drive.md", memoryId: undefined });
    const plan = planificarSincronizacion([l], [remoto({ fileId: "f1", memoryId: "m1" }), rHuerfano]);
    expect(plan.nuevosDesdeDrive).toEqual([rHuerfano]);
    // El local m1 se procesó normalmente (emparejado con f1), el huérfano no contamina su acción.
    expect(plan.acciones).toHaveLength(1);
  });

  it("un local SIN remoto (borrado en Drive por el usuario, o nunca subido) se planea crear — el borrado en Drive NO se propaga como borrado local", () => {
    const l = local({ id: "m-borrada-en-drive", driveFileId: "f-que-ya-no-existe" });
    const plan = planificarSincronizacion([l], []); // Drive no devolvió ese fileId: se asume ausente
    expect(plan.acciones).toEqual([{ tipo: "crear_en_drive", local: l }]);
  });

  it("varios locales y remotos se emparejan independientemente (sin cruces)", () => {
    const l1 = local({ id: "m1", driveFileId: "f1", updatedAtMs: 3000 });
    const l2 = local({ id: "m2", driveFileId: "f2", updatedAtMs: 100 });
    const r1 = remoto({ fileId: "f1", modifiedTimeMs: 100 });
    const r2 = remoto({ fileId: "f2", modifiedTimeMs: 3000 });
    const plan = planificarSincronizacion([l1, l2], [r1, r2]);
    expect(plan.acciones[0].tipo).toBe("subir_actualizacion"); // l1 más nuevo que r1
    expect(plan.acciones[1].tipo).toBe("bajar_actualizacion"); // r2 más nuevo que l2
    expect(plan.nuevosDesdeDrive).toEqual([]);
  });
});

describe("conversión de timestamps (nunca lanza ante fechas inválidas)", () => {
  it("memoryFileUpdatedMs", () => {
    expect(memoryFileUpdatedMs({ updated_at: "2026-09-27T00:00:00Z" })).toBe(Date.parse("2026-09-27T00:00:00Z"));
    expect(memoryFileUpdatedMs({ updated_at: undefined })).toBeNull();
    expect(memoryFileUpdatedMs({ updated_at: "no-es-una-fecha" })).toBeNull();
  });

  it("driveModifiedMs", () => {
    expect(driveModifiedMs({ modifiedTime: "2026-09-27T00:00:00Z" })).toBe(Date.parse("2026-09-27T00:00:00Z"));
    expect(driveModifiedMs({ modifiedTime: undefined })).toBeNull();
    expect(driveModifiedMs({ modifiedTime: "basura" })).toBeNull();
  });
});
