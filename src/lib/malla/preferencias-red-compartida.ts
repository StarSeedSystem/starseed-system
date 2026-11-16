export type NivelCompartir = "nadie" | "amigos" | "publico";

export interface PreferenciasRedCompartida {
  interruptor: boolean;
  maximoCon: NivelCompartir;
  soloWifi: boolean;
  kbpsSubidaMax: number;
  reservaBateriaPct: number;
  automatico: boolean;
  compartirMedidas: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasRedCompartida = {
  interruptor: false,
  maximoCon: "nadie",
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

const CLAVE_STORAGE = "starseed.preferencias.red.compartida";

const NIVELES: NivelCompartir[] = ["nadie", "amigos", "publico"];

function indiceNivel(nivel: NivelCompartir): number {
  return NIVELES.indexOf(nivel);
}

function acotarNumero(valor: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof valor === "number" && Number.isFinite(valor) ? Math.floor(valor) : NaN;
  return Number.isNaN(n) ? porDefecto : Math.max(min, Math.min(max, n));
}

export function sanearPreferenciasRed(crudo: unknown): PreferenciasRedCompartida {
  const obj = crudo as Record<string, unknown> | null;

  const interruptor = typeof obj?.interruptor === "boolean" ? obj.interruptor : false;

  const maximoConRaw = obj?.maximoCon;
  const maximoCon: NivelCompartir = typeof maximoConRaw === "string" && NIVELES.includes(maximoConRaw as NivelCompartir)
    ? (maximoConRaw as NivelCompartir)
    : "nadie";

  const soloWifi = typeof obj?.soloWifi === "boolean" ? obj.soloWifi : true;

  const kbpsSubidaMax = acotarNumero(obj?.kbpsSubidaMax, 64, 10000, 1024);
  const reservaBateriaPct = acotarNumero(obj?.reservaBateriaPct, 5, 90, 30);

  const automatico = typeof obj?.automatico === "boolean" ? obj.automatico : false;
  const compartirMedidas = typeof obj?.compartirMedidas === "boolean" ? obj.compartirMedidas : false;

  return {
    interruptor,
    maximoCon,
    soloWifi,
    kbpsSubidaMax,
    reservaBateriaPct,
    automatico,
    compartirMedidas,
  };
}

export function leerPreferenciasRed(): PreferenciasRedCompartida {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (!guardado) return PREFERENCIAS_POR_DEFECTO;
    const parseado = JSON.parse(guardado);
    return sanearPreferenciasRed(parseado);
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

export function guardarPreferenciasRed(prefs: PreferenciasRedCompartida): { aviso?: boolean } {
  const actuales = leerPreferenciasRed();
  let aviso = false;

  if (indiceNivel(prefs.maximoCon) > indiceNivel(actuales.maximoCon)) {
    aviso = true;
  }

  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(prefs));
  } catch {
    // Ignorar errores de escritura (cuota, modo privado, etc.)
  }

  return aviso ? { aviso: true } : {};
}