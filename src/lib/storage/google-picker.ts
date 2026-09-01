"use client";

/**
 * SELECTOR DE CARPETAS DE GOOGLE (Adenda 196).
 * ----------------------------------------------------------------------------
 * Con el scope `drive.file` la app NO puede listar tu Drive — y eso es
 * exactamente lo que queremos: el usuario elige las carpetas en el **selector
 * oficial de Google** (Picker) y la app recibe acceso solo a esas. A cambio, el
 * scope deja de ser restringido y StarSeed puede publicarse para cualquiera sin
 * verificación ni auditoría anual.
 *
 * Necesita dos datos públicos del proyecto de Google, ambos creables por
 * terminal (a diferencia del cliente OAuth):
 *   · una clave de API  → NEXT_PUBLIC_GOOGLE_API_KEY
 *   · el número de proyecto (appId) → NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER
 * Si faltan, se dice exactamente cuál falta en vez de abrir un selector roto.
 */

export interface CarpetaElegida {
  id: string;
  nombre: string;
}

export type ResultadoPicker =
  | { ok: true; carpetas: CarpetaElegida[] }
  | { ok: false; motivo: "falta-config" | "cancelado" | "error"; detalle?: string };

const SCRIPT_ID = "starseed-google-api-js";

/** Carga `apis.google.com/js/api.js` una sola vez y prepara el módulo picker. */
async function cargarPicker(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { gapi?: { load: (m: string, cb: () => void) => void }; google?: { picker?: unknown } };
  if (w.google?.picker) return true;

  if (!w.gapi) {
    const ya = document.getElementById(SCRIPT_ID);
    if (!ya) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.src = "https://apis.google.com/js/api.js";
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error("no se pudo cargar el selector de Google"));
        document.head.appendChild(s);
      });
    } else {
      // Ya se estaba cargando: esperamos a que `gapi` aparezca.
      for (let i = 0; i < 40 && !(window as unknown as { gapi?: unknown }).gapi; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  const gapi = (window as unknown as { gapi?: { load: (m: string, cb: () => void) => void } }).gapi;
  if (!gapi) return false;
  await new Promise<void>((res) => gapi.load("picker", () => res()));
  return !!(window as unknown as { google?: { picker?: unknown } }).google?.picker;
}

/** ¿Están la clave de API y el número de proyecto configurados? */
export function configPickerCompleta(): { ok: boolean; falta: string[] } {
  const falta: string[] = [];
  const env = process.env as Record<string, string | undefined>;
  if (!env.NEXT_PUBLIC_GOOGLE_API_KEY) falta.push("NEXT_PUBLIC_GOOGLE_API_KEY");
  if (!env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER) falta.push("NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER");
  return { ok: falta.length === 0, falta };
}

/**
 * Abre el selector de Google en modo CARPETAS y devuelve las elegidas.
 * `token` es el access token OAuth ya obtenido con `drive.file`.
 */
export async function elegirCarpetasDrive(token: string): Promise<ResultadoPicker> {
  const env = process.env as Record<string, string | undefined>;
  const apiKey = env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const appId = env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER;
  if (!apiKey || !appId) {
    const { falta } = configPickerCompleta();
    return {
      ok: false, motivo: "falta-config",
      detalle: `Falta configurar ${falta.join(" y ")} en este despliegue. Son datos públicos del proyecto de Google (clave de API y número de proyecto) y se crean por terminal.`,
    };
  }

  const listo = await cargarPicker().catch(() => false);
  if (!listo) return { ok: false, motivo: "error", detalle: "No se pudo cargar el selector de Google (¿sin conexión?)." };

  const picker = (window as unknown as { google: { picker: any } }).google.picker; // eslint-disable-line @typescript-eslint/no-explicit-any

  return new Promise<ResultadoPicker>((resolve) => {
    try {
      const vista = new picker.DocsView(picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder");

      const p = new picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setTitle("Elige las carpetas que StarSeed podrá leer")
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .addView(vista)
        .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
          if (data.action === picker.Action.PICKED) {
            resolve({
              ok: true,
              carpetas: (data.docs || []).map((d) => ({ id: d.id, nombre: d.name })),
            });
          } else if (data.action === picker.Action.CANCEL) {
            resolve({ ok: false, motivo: "cancelado" });
          }
        })
        .build();
      p.setVisible(true);
    } catch (e) {
      resolve({ ok: false, motivo: "error", detalle: (e as Error)?.message });
    }
  });
}
