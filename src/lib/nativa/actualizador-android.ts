export const SOLO_NATIVA = "Solo en la app nativa de StarSeed OS.";

export interface TauriAndroid {
  shell?: { open?: (url: string) => Promise<boolean> | boolean };
}

export interface ResultadoAbrir {
  ok: boolean;
  motivo?: string;
}

export interface ResultadoPermiso {
  ok: boolean;
  motivo?: string;
}

export function verificarPermisoAbrir(permissions: unknown[]): ResultadoPermiso {
  if (!Array.isArray(permissions)) {
    return { ok: false, motivo: "Permisos no declarados." };
  }
  const tiene = permissions.some(p => {
    if (typeof p === "string") return p === "shell:allow-open";
    if (typeof p === "object" && p !== null) {
      const obj = p as Record<string, unknown>;
      return obj.identifier === "shell:allow-open" || obj["shell:allow-open"];
    }
    return false;
  });
  if (tiene) return { ok: true };
  return { ok: false, motivo: "Falta permiso shell:allow-open en capabilities: el abridor del sistema no está declarado." };
}

export async function abrirInstaladorAndroid(url: string, tauri: TauriAndroid | null | undefined): Promise<ResultadoAbrir> {
  if (!tauri?.shell?.open) {
    return { ok: false, motivo: SOLO_NATIVA };
  }
  if (!url || typeof url !== "string") {
    return { ok: false, motivo: "URL del instalador inválida." };
  }
  try {
    const res = tauri.shell.open(url);
    const ok = typeof res?.then === "function" ? await res : Boolean(res);
    return ok ? { ok: true } : { ok: false, motivo: "El abridor del sistema rechazó la URL." };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Error al abrir instalador.";
    return { ok: false, motivo };
  }
}
