/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — MEJOR DESCARGA PARA EL DISPOSITIVO (detector inteligente)
 * ---------------------------------------------------------------------------
 * Módulo PURO y SSR-safe: NO toca `navigator` ni `window`. Recibe el sistema
 * operativo ya detectado (por `detectOS()` de `device-install.ts`) e indica,
 * con honestidad radical, QUÉ ofrecer primero al usuario para instalar el OS:
 *
 *   · ¿Ya está instalado como app? → se dice la verdad y no se ofrece nada.
 *   · ¿Hay binario nativo (`status "release"`) para ese SO? → ese, con su
 *     formato real y su URL.
 *   · ¿No hay binario pero la PWA es instalable? → «Instalar como app».
 *   · ¿No hay nada real? → se ofrece la opción "soon"/"link" más cercana con
 *     disponible:false y un motivo HONESTO. Nunca se promete un binario que
 *     no existe.
 *
 * Regla de oro: un `soon` JAMÁS sale como `disponible:true`. Este módulo no
 * duplica nada de `device-install.ts`: reutiliza sus tipos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { OsId, NativeOption, NativeStatus } from "./device-install";

/** Qué se recomienda descargar en este dispositivo. */
export interface Recomendacion {
  /** Título legible ("Descarga para macOS", "Instalar como app"…). */
  titulo: string;
  /** Formato real (.dmg, .exe, .apk, PWA…). */
  formato: string;
  /** Detalle honesto en español. */
  detalle: string;
  /** true si se puede descargar/instalar de inmediato. */
  disponible: boolean;
  /** Enlace de descarga cuando disponible (o página de releases). */
  url?: string;
  /** Motivo honesto cuando no hay binario real. */
  motivo?: string;
}

/**
 * Mapa de formatos que corresponden a cada sistema. `unknown` recibe única-
 * mente la web porque no hay binario que ofrecer hasta saber qué sistema es.
 */
const FORMATOS: Record<OsId, string[]> = {
  android: ["APK (.apk)", "App Bundle (.aab)"],
  ios: ["Web app (PWA)", "TestFlight"],
  macos: ["Imagen de disco (.dmg)", "Paquete (.pkg)"],
  windows: ["Ejecutable (.exe)", "Instalador (.msi)"],
  linux: ["AppImage (.AppImage)", "Paquete Debian (.deb)", "Paquete RPM (.rpm)"],
  unknown: ["Web (PWA)"],
};

/** Formato real de un binario "release" según el SO, para anunciarlo con verdad. */
const FORMATO_RELEASE: Record<OsId, string> = {
  android: "APK (.apk)",
  ios: "Web app (PWA)",
  macos: "Imagen de disco (.dmg)",
  windows: "Instalador (.exe / .msi)",
  linux: "AppImage / .deb / .rpm",
  unknown: "Web (PWA)",
};

/** Etiqueta corta de cada sistema (coincide con `OS_LABEL` de device-install). */
const ETIQUETA: Record<OsId, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS / iPadOS",
  unknown: "tu sistema",
};

const CERCANA: readonly NativeStatus[] = ["soon", "link"];

/**
 * Decide QUÉ ofrecer primero para instalar StarSeed en este dispositivo.
 * Estricto y honesto: si ya está instalada, no ofrece nada; si hay binario
 * nativo real, lo ofrece con su formato y URL; si no, la PWA instalable;
 * y si no hay nada real, la opción "soon"/"link" más cercana marcada como no
 * disponible. Un "soon" NUNCA sale disponible.
 */
export function mejorDescargaPara(
  os: OsId,
  opciones: NativeOption[],
  puedeInstalarPwa: boolean,
  yaInstalada: boolean,
): Recomendacion {
  const etiqueta = ETIQUETA[os] ?? ETIQUETA.unknown;

  // 1) Ya instalada como app → no insistimos.
  if (yaInstalada) {
    return {
      titulo: "StarSeed OS ya está en este dispositivo",
      formato: "App instalada",
      detalle: "Ya tienes StarSeed OS instalada como aplicación en este dispositivo.",
      disponible: false,
      motivo: "Ya la tienes instalada en este dispositivo.",
    };
  }

  // 2) Binario nativo real ("release") → lo ofrecemos con su formato y URL.
  const release = opciones.find((o) => o.status === "release");
  if (release?.href) {
    return {
      titulo: `Descarga para ${etiqueta}`,
      formato: FORMATO_RELEASE[os] ?? "Paquete nativo",
      detalle: release.note,
      disponible: true,
      url: release.href,
    };
  }

  // 3) Sin binario, pero la PWA es instalable → vía real inmediata.
  if (puedeInstalarPwa) {
    const pwa = opciones.find((o) => o.status === "pwa");
    return {
      titulo: "Instalar como app",
      formato: "Web app (PWA)",
      detalle:
        pwa?.note ??
        "Instala StarSeed OS como aplicación (pantalla completa y offline) desde este mismo navegador.",
      disponible: true,
      url: pwa?.href,
    };
  }

  // 4) Ni binario ni PWA → la opción "soon"/"link" más cercana, honesta y NO disponible.
  const cercana = opciones.find((o) => CERCANA.includes(o.status));
  const formato = FORMATOS[os]?.[0] ?? "Web (PWA)";
  return {
    titulo: `StarSeed para ${etiqueta}`,
    formato,
    detalle:
      cercana?.note ??
      "Aún no hay un instalador nativo preparado para este sistema.",
    disponible: false,
    url: cercana?.href,
    motivo:
      "Aún no hay binario firmado para este sistema; la app web instalable ya funciona.",
  };
}

/**
 * Devuelve el mapa de formatos que corresponden a cada SO (reutilizable por la
 * UI para mostrar qué esperar de cada plataforma, incluidas las futuras).
 */
export function formatosPorSistema(): Record<OsId, string[]> {
  return Object.fromEntries(Object.entries(FORMATOS).map(([k, v]) => [k, [...v]])) as Record<OsId, string[]>;
}