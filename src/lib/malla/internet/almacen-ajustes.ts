export type AjustesInternet = {
  version: "v1";
  compartirConOtros: boolean;
  bancoInactivo: { modo: "diario" | "programado"; limiteMb: number };
  audiencias: { mesh: boolean; invitado: boolean; familiar: boolean };
  declaraLimitada: string | null;
  compartirMedidas: boolean;
};

export const AJUSTES_APAGADOS: AjustesInternet = {
  version: "v1",
  compartirConOtros: false,
  bancoInactivo: { modo: "diario", limiteMb: 0 },
  audiencias: { mesh: false, invitado: false, familiar: false },
  declaraLimitada: null,
  compartirMedidas: false,
};

type Almacen = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const CLAVE = "starseed.malla.internet.v1";

export function leerAjustes(almacen: Almacen, defectos: AjustesInternet): AjustesInternet {
  try {
    const raw = almacen.getItem(CLAVE);
    if (!raw) return defectos;
    const json = JSON.parse(raw);
    if (!json || json.version !== "v1") return defectos;

    const compartirConOtros = typeof json.compartirConOtros === "boolean" 
      ? json.compartirConOtros 
      : defectos.compartirConOtros;

    const compartirMedidas = typeof json.compartirMedidas === "boolean"
      ? json.compartirMedidas
      : defectos.compartirMedidas;

    const declaraLimitada = typeof json.declaraLimitada === "string" || json.declaraLimitada === null
      ? json.declaraLimitada
      : defectos.declaraLimitada;

    const modoValido = json.bancoInactivo?.modo === "diario" || json.bancoInactivo?.modo === "programado"
      ? json.bancoInactivo.modo
      : defectos.bancoInactivo.modo;

    const limiteMbValido = typeof json.bancoInactivo?.limiteMb === "number" && json.bancoInactivo.limiteMb >= 0 && Number.isFinite(json.bancoInactivo.limiteMb)
      ? json.bancoInactivo.limiteMb
      : defectos.bancoInactivo.limiteMb;

    const audienciasValidas = {
      mesh: typeof json.audiencias?.mesh === "boolean" ? json.audiencias.mesh : defectos.audiencias.mesh,
      invitado: typeof json.audiencias?.invitado === "boolean" ? json.audiencias.invitado : defectos.audiencias.invitado,
      familiar: typeof json.audiencias?.familiar === "boolean" ? json.audiencias.familiar : defectos.audiencias.familiar,
    };

    return {
      version: "v1",
      compartirConOtros,
      bancoInactivo: { modo: modoValido, limiteMb: limiteMbValido },
      audiencias: audienciasValidas,
      declaraLimitada,
      compartirMedidas,
    };
  } catch {
    return defectos;
  }
}

export function guardarAjustes(almacen: Almacen, ajustes: AjustesInternet): boolean {
  try {
    almacen.setItem(CLAVE, JSON.stringify(ajustes));
    return true;
  } catch {
    return false;
  }
}
