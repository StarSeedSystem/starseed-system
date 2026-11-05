/**
 * StarSeed OS — destino nativo de macOS (BAMA) · Ola 1104R.
 *
 * Contrato §4 de `architecture/repos-libreria-1104.md`: el generador de apps
 * ofrece el destino «Nativa · macOS (BAMA)». BAMA (21 habilidades de Swift 6.2
 * + SwiftUI + SwiftData) exige macOS 26 y Xcode 26 para construir; planificar
 * siempre se puede. Instalar Xcode es decisión de Alex.
 *
 * Módulo PURO: sin `node:*`, sin red, sin disco y sin procesos. Los comandos
 * del plugin se DEVUELVEN como datos, nunca se ejecutan aquí.
 */

// ───────────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────────

export interface EntradaRequisitosNativos {
  /** Sistema («macOS», «Linux», …). */
  so: string;
  /** Versión del sistema, p. ej. «26.3.1». */
  versionSo: string;
  /** Versión de Xcode; vacío = solo las Command Line Tools. */
  xcode: string;
  /** Versión de Swift detectada, p. ej. «6.0.2». */
  swift: string;
  /** Gigabytes libres (Xcode 26 ocupa más de 10 GB). */
  discoLibreGb: number;
}

export interface ResultadoRequisitosNativos {
  puedeConstruir: boolean;
  puedePlanificar: boolean;
  faltan: string[];
}

export interface AppBama {
  nombre: string;
  descripcion: string;
  pantallas: string[];
}

export interface HistoriaBama {
  titulo: string;
  criterios: string[];
}

export interface TokenTrinitySwiftUI {
  trinity: string;
  swiftui: string;
  hex: string;
}

export interface PlanBama {
  destino: string;
  comandos: string[];
  pantallasClonar: string[];
  historias: HistoriaBama[];
  kitDisenoTokens: TokenTrinitySwiftUI[];
  notas: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────────

export const DESTINO_NATIVO = "Nativa · macOS (BAMA)";

const MACOS_MINIMO = 26;
const XCODE_MINIMO = 26;
/** Xcode 26 ocupa más de 10 GB (§4 del contrato). */
const DISCO_XCODE_GB = 10;

export const COMANDOS_PLUGIN_BAMA: string[] = [
  "claude plugin marketplace add daveebbelaar/bama",
  "claude plugin install bama@bama",
];

/** Kit de diseño Trinity (identidades.md) con el nombre de extensión en SwiftUI. */
export const TOKENS_TRINITY: TokenTrinitySwiftUI[] = [
  { trinity: "palette.trinity.zenith.active", swiftui: "zenith", hex: "#007FFF" },
  { trinity: "horizonte.panel", swiftui: "horizonte", hex: "#10B981" },
  { trinity: "logica.active", swiftui: "logica", hex: "#FFBF00" },
  { trinity: "base.active", swiftui: "base", hex: "#DC143C" },
  { trinity: "neutro", swiftui: "neutro", hex: "#F8F9FA" },
];

function mayor(version: string): number {
  return Number.parseInt(version.trim().split(".")[0] || "0", 10) || 0;
}

export function requisitosNativos(entrada: EntradaRequisitosNativos): ResultadoRequisitosNativos {
  const faltan: string[] = [];
  const macSuficiente = entrada.so === "macOS" && mayor(entrada.versionSo) >= MACOS_MINIMO;
  const xcodeSuficiente = mayor(entrada.xcode) >= XCODE_MINIMO;
  if (!macSuficiente) faltan.push("macOS 26");
  if (!xcodeSuficiente) {
    faltan.push("Xcode 26");
    if (entrada.discoLibreGb < DISCO_XCODE_GB) {
      faltan.push("10 GB de disco libres (Xcode 26 ocupa más de 10 GB)");
    }
  }
  return { puedeConstruir: macSuficiente && xcodeSuficiente, puedePlanificar: true, faltan };
}

export function planBama(app: AppBama): PlanBama {
  const pantallasClonar = [...app.pantallas];
  const historias = pantallasClonar.map((pantalla) => ({
    titulo: `Implementar pantalla «${pantalla}»`,
    criterios: [
      `La pantalla «${pantalla}» replica la referencia con la identidad Trinity (tokens del kit).`,
      "Se llega desde el flujo principal en un toque o tecla estándar de macOS.",
      "Se verifica con captura de BAMA en móvil, escritorio y plegable sin cortes ni overflow.",
    ],
  }));
  const notas = [
    `App nativa «${app.nombre}»: ${app.descripcion}.`,
    "Requiere Swift 6.2 + SwiftUI + SwiftData; construir exige macOS 26 y Xcode 26.",
    "Instalar Xcode es decisión de Alex: sin Xcode, BAMA planifica y el paquete queda listo en la Librería.",
  ];
  return {
    destino: DESTINO_NATIVO,
    comandos: [...COMANDOS_PLUGIN_BAMA],
    pantallasClonar,
    historias,
    kitDisenoTokens: TOKENS_TRINITY.map((o) => ({ ...o })),
    notas,
  };
}
