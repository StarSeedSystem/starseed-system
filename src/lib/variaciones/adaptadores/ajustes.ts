// Familia «ajuste» de las variaciones públicas (contrato: architecture/variaciones-publicas.md §5).
// Clave `ajuste:<id>`; el payload es un PARCHE de claves permitidas de SYNCED_KEYS/SYNCED_PREFIXES
// (src/lib/settings-sync.ts) que NO sean de cuenta, ni claves (secretos), ni privacidad. Módulo PURO:
// la cuenta (pushPreferences) y el almacenamiento van inyectados; nada se ejecuta sin validar.
import { validarVariacion } from "../validar";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { isNeverSyncedKey, SYNCED_KEYS, SYNCED_PREFIXES, SYNCED_PREFIX_EXCLUDE, type SyncResult } from "@/lib/settings-sync";
import { normalizarConfigMausbot, type ConfigMausbot } from "@/lib/mausbot/config";

/** Almacenamiento de preferencias inyectable (window.localStorage cumple este interfaz). */
export interface AlmacenPreferencias { getItem(clave: string): string | null; setItem(clave: string, valor: string): void; removeItem(clave: string): void; }

/** Opciones del adaptador: el guardado en la cuenta StarSeed y el almacen local, inyectados. */
export interface OpcionesAjustes { pushPreferences: () => Promise<SyncResult>; almacen?: AlmacenPreferencias; }

/** Parche: id de ajuste → valor nuevo de su clave sincronizada. */
export type ParcheAjustes = Record<string, unknown>;

const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sanea un parche del Mausbot: fuera perfiles y neuronas; `actuar` nunca sube de «proponer». */
export function sanearParcheMausbot(payload: unknown): unknown {
  if (!esObjetoPlano(payload)) return payload;
  const resto: Record<string, unknown> = { ...payload };
  delete resto.perfiles; // lo de cada perfil lo decide cada persona, nunca una variación pública
  delete resto.neuronas; // lo de cada neurona, igual
  if (resto.actuar === "aplicar" || resto.actuar === "aplicar-bajo") resto.actuar = "proponer";
  return resto;
}

/** Config resultante: conserva `v`, los perfiles y las neuronas locales (jamás los de la variación). */
export function fusionarConfigMausbot(previo: unknown, parche: unknown): ConfigMausbot {
  const actual = normalizarConfigMausbot(previo);
  const limpio = sanearParcheMausbot(parche);
  return normalizarConfigMausbot({
    ...actual, ...(esObjetoPlano(limpio) ? limpio : {}), v: 1,
    perfiles: actual.perfiles, neuronas: actual.neuronas,
  });
}

function leerJson(bruto: string | null): unknown {
  if (bruto === null) return null;
  try { return JSON.parse(bruto) as unknown; } catch { return null; }
}

// Exclusiones duras (contrato §5): secretos con isNeverSyncedKey; privacidad (telemetría, fantasma, malla y conectividad); cuenta (memoria del Exocórtex, perfil activo, avisos vistos, siembra).
const PREFIJOS_DE_PRIVACIDAD = ["starseed.privacy.", "starseed.mesh.", "starseed.connectivity."] as const;
const CLAVES_DE_CUENTA = new Set(["starseed_user_memory", "starseed.profile.active.v1", "starseed.sync.profiles.v1", "starseed.avisos.vistos.v1", "starseed_defaults_version"]);

/** ¿Es una clave sincronizada permitida para un ajuste público? */
export function esClaveAjustePermitida(clave: string): boolean {
  const enSynced = (SYNCED_KEYS as readonly string[]).includes(clave)
    || ((SYNCED_PREFIXES as readonly string[]).some((p) => clave.startsWith(p)) && !(SYNCED_PREFIX_EXCLUDE as readonly string[]).some((p) => clave.startsWith(p)));
  if (!enSynced) return false;
  if (isNeverSyncedKey(clave)) return false; // claves y secretos del dispositivo: nunca viajan
  if (PREFIJOS_DE_PRIVACIDAD.some((p) => clave.startsWith(p))) return false;
  return !CLAVES_DE_CUENTA.has(clave); // identidad de la cuenta: nunca en una variación
}

// Mapa curado id de ajuste → clave sincronizada permitida: un parche nunca toca cuenta, claves ni privacidad.
export const RUTA_AJUSTES: Record<string, string> = {
  accesibilidad: "starseed.a11y.settings",
  rendimiento: "starseed.perf.v1",
  "voz-modo": "starseed.voz.modo.v1",
  "voz-timbre": "starseed.voz.timbre.v1",
  "pantalla-inicial": "starseed.inicio.pantalla.v1",
  cursor: "starseed.cursorfx.v1",
  mausbot: "starseed.mausbot.v1",
  "mausbot-disenos": "starseed.mausbot.disenos.v1",
  "orbe-estilo": "starseed.protomolecula.orbe.estilo.v1",
  visualizador: "starseed.audiomorphic.presets.v1",
};

/** Resuelve `ajuste:<id>`: devuelve el id si está en el mapa y su clave es permitida, nulo si no. */
export function idDeAjuste(clave: string): string | null {
  const [familia, id] = clave.split(":");
  const ruta = RUTA_AJUSTES[id];
  if (familia !== "ajuste" || !id || !ruta || !esClaveAjustePermitida(ruta)) return null;
  return id;
}

/** Resultado de validar un parche de ajustes. */
export type ResultadoParche = { ok: true; parche: ParcheAjustes } | { ok: false; motivos: string[] };

/** Valida el parche: objeto no vacío, entradas del mapa con clave permitida y valores JSON planos. */
export function validarParcheAjustes(payload: unknown): ResultadoParche {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { ok: false, motivos: ["Ajuste: el payload debe ser un objeto con entradas de ajuste"] };
  const parche = payload as ParcheAjustes;
  if (Object.keys(parche).length === 0) return { ok: false, motivos: ["Ajuste: el parche está vacío"] };
  const motivos: string[] = [];
  const limpio: ParcheAjustes = {};
  for (const id of Object.keys(parche)) {
    const ruta = RUTA_AJUSTES[id];
    if (!ruta) { motivos.push(`Ajuste: «${id}» no es un ajuste de la familia`); continue; }
    if (!esClaveAjustePermitida(ruta)) { motivos.push(`Ajuste: la clave de «${id}» no es permitida`); continue; }
    const valor = id === "mausbot" ? sanearParcheMausbot(parche[id]) : parche[id];
    const resultado = validarVariacion(valor);
    if (!resultado.ok) { motivos.push(`Ajuste: el valor de «${id}» — ${resultado.motivos.join(" · ")}`); continue; }
    if (resultado.requiereAislamiento) motivos.push(`Ajuste: «${id}» parece llevar código; un ajuste no es código`);
    limpio[id] = valor;
  }
  return motivos.length === 0 ? { ok: true, parche: limpio } : { ok: false, motivos };
}

/** window.localStorage como almacen inyectable por defecto (solo existe en navegador). */
function almacenDelNavegador(): AlmacenPreferencias {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("Ajuste: sin almacenamiento de preferencias disponible");
  return window.localStorage;
}

// Si el parche no valida, lanza: nada se ejecuta sin validar. Aplicar recuerda el valor previo de cada
// clave, escribe el parche, guarda en la cuenta y devuelve `deshacer` (restaura el previo o quita la
// clave si no existía, y vuelve a guardar).
export function crearAdaptadorAjustes(opciones: OpcionesAjustes): AdaptadorFamilia<ParcheAjustes> {
  return {
    familia: "ajuste",
    nombre: "Ajustes sincronizados",
    capturar: (clave) => {
      const id = idDeAjuste(clave); if (!id) return null;
      try {
        const bruto = (opciones.almacen ?? almacenDelNavegador()).getItem(RUTA_AJUSTES[id]);
        if (bruto === null) return null;
        const valor = JSON.parse(bruto) as unknown;
        return { [id]: id === "mausbot" ? sanearParcheMausbot(normalizarConfigMausbot(valor)) : valor };
      } catch { return null; } // sin almacenamiento o valor sin JSON: nada que capturar
    },
    validar: (payload) => {
      const r = validarParcheAjustes(payload);
      return r.ok ? { ok: true, payload: r.parche } : { ok: false, motivos: r.motivos };
    },
    aplicar: (_clave, payload) => {
      const validado = validarParcheAjustes(payload);
      if (!validado.ok) throw new Error(`Variación de ajustes rechazada: ${validado.motivos.join(" · ")}`);
      const almacen = opciones.almacen ?? almacenDelNavegador();
      const previos = new Map<string, string | null>();
      for (const id of Object.keys(validado.parche)) {
        const ruta = RUTA_AJUSTES[id]; if (!ruta) continue;
        const previo = almacen.getItem(ruta);
        previos.set(ruta, previo);
        const valor = validado.parche[id];
        // El Mausbot se FUSIONA con su config local: una variación nunca pisa perfiles ni neuronas.
        const escrito = id === "mausbot" ? fusionarConfigMausbot(leerJson(previo), valor) : valor;
        almacen.setItem(ruta, typeof escrito === "string" ? escrito : JSON.stringify(escrito));
      }
      const guardar = () => void opciones.pushPreferences().catch(() => undefined);
      guardar(); // best-effort: el parche queda también en la cuenta StarSeed
      return {
        deshacer: () => {
          for (const [ruta, previo] of previos) { if (previo === null) almacen.removeItem(ruta); else almacen.setItem(ruta, previo); }
          guardar();
        },
      };
    },
  };
}

/** Registra el adaptador de ajustes en el registro de familias del clic derecho. */
export function registrarAdaptadorAjustes(opciones: OpcionesAjustes): void { registrarFamilia(crearAdaptadorAjustes(opciones)); }
