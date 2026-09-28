export type PreferenciaInicio =
  | { tipo: "dashboard"; dashboardId?: string }
  | { tipo: "inicio" }
  | { tipo: "escritorios" }
  | { tipo: "ruta"; ruta: string };

export type PreferenciasInicio = {
  v: 1;
  perfiles: Record<string, PreferenciaInicio>;
  neuronas: Record<string, PreferenciaInicio>;
};

export const CLAVE_PANTALLA_INICIAL = "starseed.inicio.pantalla.v1";
export const EVENTO_PANTALLA_INICIAL = "starseed:inicio";

const preferenciaDefecto: PreferenciaInicio = { tipo: "dashboard" };

function preferenciasVacias(): PreferenciasInicio {
  return { v: 1, perfiles: {}, neuronas: {} };
}

function esPreferencia(valor: unknown): valor is PreferenciaInicio {
  if (!valor || typeof valor !== "object") return false;
  const pref = valor as Record<string, unknown>;
  if (pref.tipo === "dashboard") {
    return pref.dashboardId === undefined || typeof pref.dashboardId === "string";
  }
  if (pref.tipo === "ruta") return typeof pref.ruta === "string";
  return pref.tipo === "inicio" || pref.tipo === "escritorios";
}

function normalizarRegistro(valor: unknown): Record<string, PreferenciaInicio> {
  if (!valor || typeof valor !== "object") return {};
  return Object.fromEntries(
    Object.entries(valor).filter((entrada): entrada is [string, PreferenciaInicio] =>
      esPreferencia(entrada[1]),
    ),
  );
}

function guardar(preferencias: PreferenciasInicio): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(CLAVE_PANTALLA_INICIAL, JSON.stringify(preferencias));
    window.dispatchEvent(new Event(EVENTO_PANTALLA_INICIAL));
    return true;
  } catch {
    return false;
  }
}

export function resolverPantallaInicial({
  perfil,
  neurona,
  rutaValida,
}: {
  perfil?: PreferenciaInicio | null;
  neurona?: PreferenciaInicio | null;
  rutaValida: (ruta: string) => boolean;
}): string {
  const pref = neurona ?? perfil ?? preferenciaDefecto;
  if (pref.tipo === "inicio") return "/inicio";
  if (pref.tipo === "escritorios") return "/escritorios";
  if (pref.tipo === "dashboard") {
    return pref.dashboardId
      ? `/dashboard?d=${encodeURIComponent(pref.dashboardId)}`
      : "/dashboard";
  }
  const rutaAcceso = pref.ruta.split(/[?#]/, 1)[0] === "/login";
  try {
    if (pref.ruta.startsWith("/") && !pref.ruta.startsWith("//") && !rutaAcceso
      && rutaValida(pref.ruta)) return pref.ruta;
  } catch {
    // Una validación defectuosa nunca deja a la persona sin pantalla inicial.
  }
  return "/dashboard";
}

export function leerPreferencias(): PreferenciasInicio {
  try {
    if (typeof window === "undefined") return preferenciasVacias();
    const raw = window.localStorage.getItem(CLAVE_PANTALLA_INICIAL);
    if (!raw) return preferenciasVacias();
    const valor: unknown = JSON.parse(raw);
    if (!valor || typeof valor !== "object") return preferenciasVacias();
    const almacen = valor as Record<string, unknown>;
    if (almacen.v !== 1) return preferenciasVacias();
    return {
      v: 1,
      perfiles: normalizarRegistro(almacen.perfiles),
      neuronas: normalizarRegistro(almacen.neuronas),
    };
  } catch {
    return preferenciasVacias();
  }
}

export function guardarPreferencia(
  ambito: "perfil" | "neurona", id: string, pref: PreferenciaInicio,
): void {
  try {
    if (!id) return;
    const preferencias = leerPreferencias();
    preferencias[ambito === "perfil" ? "perfiles" : "neuronas"][id] = pref;
    guardar(preferencias);
  } catch {
    // El almacenamiento local puede estar deshabilitado.
  }
}

export function borrarPreferencia(ambito: "perfil" | "neurona", id: string): void {
  try {
    if (!id) return;
    const preferencias = leerPreferencias();
    delete preferencias[ambito === "perfil" ? "perfiles" : "neuronas"][id];
    guardar(preferencias);
  } catch {
    // Borrar es seguro incluso si el almacenamiento no está disponible.
  }
}
