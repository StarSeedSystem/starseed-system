// Fuente ÚNICA de verdad de la versión del OS. Módulo PURO: sin React,
// sin node:* y sin process.cwd(), porque lo importan componentes de cliente.
// Cualquier medio que muestre la versión debe leer de aquí y jamás escribir
// su propia fecha (ver el test medios-version-coherentes y el checkpoint).

export const OS_VERSION = "2026.09.24";

export const OS_FECHA = "2026-09-24";

export type CanalRelease = "alpha" | "beta" | "estable";

export const OS_CANAL: CanalRelease = "alpha";

export const OS_NOTAS =
  "Apps nativas 0.2.0 para macOS, Windows, Linux y Android con actualización automática inteligente (reinstalación completa dentro de la propia app); en iPhone/iPad, como app web instalable. El fondo animado ahora ajusta su calidad solo según el dispositivo. Nueva ventana de ajustes del chat de Astraura. El panel de Olas es honesto: solo marca «en curso» cuando hay agentes trabajando de verdad. La nube deja de repetir trabajo ya hecho.";

/**
 * Versión del PAQUETE NATIVO (Tauri 2, proyecto `native/`): el shell de
 * escritorio/móvil, no el contenido web (eso es OS_VERSION). Cámbiala junto a
 * `native/src-tauri/tauri.conf.json`, `native/src-tauri/Cargo.toml` y
 * `package.json` en cada release nativa — los cuatro sitios deben coincidir
 * (ver native/README.md §11 «Cómo publicar una release»).
 */
export const NATIVE_VERSION = "0.2.0";

/** Etiqueta de tag/Release de GitHub para el paquete nativo (`v<NATIVE_VERSION>`). */
export const NATIVE_TAG = `v${NATIVE_VERSION}`;

export const MEDIOS_DE_VERSION: readonly string[] = [
  "src/app/(app)/library/page.tsx",
  "src/components/library/os-download-card.tsx",
  "src/components/library/install-official-section.tsx",
  "src/components/library/franja-descarga-os.tsx",
  "src/data/starseed-apps-listings.ts",
  "src/lib/onboarding/neuron-recommend.ts",
  "src/lib/notifications/update-notifications.ts",
  "src/app/instalar/page.tsx",
  "src/components/pwa/actualizacion-nativa.tsx",
  "package.json",
  "native/src-tauri/tauri.conf.json",
  "native/src-tauri/Cargo.toml",
];

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parsearFecha(v: string): Date | null {
  if (typeof v !== "string") return null;
  const partes = v.trim().split(/[.\-/]/).map((p) => Number(p));
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes;
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return null;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const ok =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  return ok ? fecha : null;
}

export function formatearFechaBuild(v: string): string {
  const fecha = parsearFecha(v);
  if (!fecha) return v;
  return `${fecha.getUTCDate()} de ${MESES_ES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
}

export function versionMasReciente<T extends { version: string; date: string }>(
  lista: T[],
): T | undefined {
  if (!Array.isArray(lista) || lista.length === 0) return undefined;
  const conFecha = lista.map((item) => ({ item, ts: parsearFecha(item.date)?.getTime() ?? null }));
  const validos = conFecha
    .filter((c): c is { item: T; ts: number } => c.ts !== null)
    .sort((a, b) => b.ts - a.ts);
  if (validos.length === 0) return undefined;
  return validos[0].item;
}

export function etiquetaBuild(): string {
  return `StarSeed OS · build ${OS_VERSION} · ${OS_CANAL}`;
}

/* ═══════════════════ Instaladores nativos (paquete `native/`) ═══════════════════
 * Helper PURO (sin navigator/window) que calcula las URLs directas de descarga
 * de los instaladores nativos de StarSeed OS, siguiendo EXACTAMENTE lo que
 * `.github/workflows/native-build.yml` produce y sube al Release de la
 * etiqueta `NATIVE_TAG` (tauri-action + softprops/action-gh-release):
 *
 *   · macOS   → UN SOLO job con `--target universal-apple-darwin`: un único
 *               .dmg universal (Apple Silicon + Intel) — NO hay dos artefactos
 *               separados por arquitectura, a diferencia del proyecto retirado
 *               `src-tauri/` (ver desktop-release.yml).
 *   · Windows → un solo job (host x64): NSIS `.exe` + WiX `.msi`.
 *   · Linux   → un solo job `ubuntu-22.04` (x64/amd64): `.AppImage` + `.deb` +
 *               `.rpm`. NO hay job de Linux ARM64 en native-build.yml (a
 *               diferencia del proyecto retirado, que sí tenía
 *               `ubuntu-22.04-arm`): por eso no se ofrece ese asset aquí.
 *   · Android → job `build-android`, nombre de archivo
 *               `StarSeed-<sistema>-<version>.apk` (ver native-build.yml línea
 *               ~236); para el sistema OS: `StarSeed-os-<version>.apk`.
 *   · iOS     → job `build-ios`, `.ipa` SIN FIRMAR, best-effort: hoy NO produce una app
 *               válida (sin ejecutable), así que no se ofrece; en iPhone/iPad, la PWA.
 *
 * Solo cubre el sistema OS (identifier `app.starseed.os`): es el único que
 * declara updater (ver capabilities/desktop.json) y el único enlazado desde
 * la Biblioteca/instalar del propio OS.
 */

export type NativeAssetOS = "macos" | "windows" | "linux" | "android" | "ios";

export interface NativeInstallerAsset {
  /** Id estable para <key> de listas y para elegir programáticamente. */
  id: string;
  os: NativeAssetOS;
  /** Etiqueta legible en español para mostrar al usuario. */
  label: string;
  /** Nombre EXACTO del archivo subido al Release (tal cual lo produce el CI). */
  filename: string;
  /** URL de descarga directa (GitHub Releases, asset fijo por nombre). */
  href: string;
}

const NATIVE_RELEASES_DOWNLOAD_BASE =
  "https://github.com/StarSeedSystem/starseed-system/releases/download";

/**
 * Todos los instaladores nativos REALES del sistema OS para una versión/tag
 * dados (por defecto, `NATIVE_VERSION`/`NATIVE_TAG`, la release vigente).
 * Función pura: no toca `navigator` ni `window` — el filtrado por SO del
 * visitante vive en `src/lib/install/` (que sí puede tocar el navegador).
 */
export function nativeInstallerAssets(
  version: string = NATIVE_VERSION,
  tag: string = NATIVE_TAG,
): NativeInstallerAsset[] {
  const base = `${NATIVE_RELEASES_DOWNLOAD_BASE}/${tag}`;
  const asset = (
    id: string,
    os: NativeAssetOS,
    label: string,
    filename: string,
  ): NativeInstallerAsset => ({ id, os, label, filename, href: `${base}/${filename}` });

  return [
    asset(
      "macos-universal",
      "macos",
      "macOS (Apple Silicon e Intel) — imagen de disco .dmg",
      `StarSeed.OS_${version}_universal.dmg`,
    ),
    asset(
      "windows-x64-exe",
      "windows",
      "Windows x64 — instalador .exe",
      `StarSeed.OS_${version}_x64-setup.exe`,
    ),
    asset(
      "windows-x64-msi",
      "windows",
      "Windows x64 — paquete .msi",
      `StarSeed.OS_${version}_x64_en-US.msi`,
    ),
    asset(
      "linux-x64-appimage",
      "linux",
      "Linux x64 — .AppImage",
      `StarSeed.OS_${version}_amd64.AppImage`,
    ),
    asset(
      "linux-x64-deb",
      "linux",
      "Linux x64 — paquete .deb",
      `StarSeed.OS_${version}_amd64.deb`,
    ),
    asset(
      "linux-x64-rpm",
      "linux",
      "Linux x64 — paquete .rpm",
      `StarSeed.OS-${version}-1.x86_64.rpm`,
    ),
    asset("android-apk", "android", "Android — .apk", `StarSeed-os-${version}.apk`),
    // (2026-09-25) Sin iOS: la compilación sin firma de CI sale vacía (un .ipa de 348 bytes
    // sin ejecutable) y ese archivo ya no se sube. En iPhone/iPad, la web instalable (PWA).
  ];
}

/** Los instaladores nativos de un único SO (subconjunto de {@link nativeInstallerAssets}). */
export function nativeInstallerAssetsFor(
  os: NativeAssetOS,
  version: string = NATIVE_VERSION,
  tag: string = NATIVE_TAG,
): NativeInstallerAsset[] {
  return nativeInstallerAssets(version, tag).filter((a) => a.os === os);
}

/* ═══════════════════════════ Comparador de versiones ═══════════════════════════
 * Semver MUY tolerante (no valida pre-release/build, solo major.minor.patch…):
 * suficiente para comparar tags de Release ("v0.2.0" vs "0.2.1") sin añadir una
 * dependencia. Partes no numéricas cuentan como 0 (nunca lanza).
 */

/** Compara dos versiones tipo "1.2.3" (con o sin prefijo "v"). */
export function compararVersiones(a: string, b: string): number {
  const partes = (v: string): number[] =>
    String(v ?? "")
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = partes(a);
  const pb = partes(b);
  const largo = Math.max(pa.length, pb.length);
  for (let i = 0; i < largo; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** ¿`candidata` es una versión más nueva que `actual`? Nunca lanza. */
export function esVersionMasNueva(candidata: string, actual: string): boolean {
  return compararVersiones(candidata, actual) > 0;
}