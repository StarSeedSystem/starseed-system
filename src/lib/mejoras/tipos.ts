/**
 * Mejoras instalables por neurona — tipos del contrato (architecture/mejoras-por-neurona.md).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Solo tipos y constantes: sin React, sin red, sin `node:*`. Lo usan el registro, el detector,
 * la decisión, la calidad, el informe y el panel de Genesis.
 */

import type { CapaActualizacion } from "@/lib/actualizaciones/manifiesto";

/** Las cinco familias de sistemas que la petición de Alex nombra. */
export type FamiliaSistema = "voz-tts" | "voz-asr" | "sonido" | "audiovisual" | "codigo";

export const FAMILIAS: readonly FamiliaSistema[] = ["voz-tts", "voz-asr", "sonido", "audiovisual", "codigo"];

export const NOMBRE_FAMILIA: Record<FamiliaSistema, string> = {
  "voz-tts": "Voz (hablar)",
  "voz-asr": "Voz (oír)",
  sonido: "Sonido y música",
  audiovisual: "Imagen y vídeo",
  codigo: "Código y lenguaje",
};

/**
 * Dónde corre un sistema dentro de un aparato, en orden de capacidad:
 *  · servidor — servicio local de la máquina (launchd/systemd, localhost);
 *  · nativa   — la app instalada de Tauri (Mac, Windows, Linux, Android);
 *  · pwa      — la app web instalada;
 *  · web      — una pestaña del navegador.
 */
export type MedioEjecucion = "servidor" | "nativa" | "pwa" | "web";

export const MEDIOS_EJECUCION: readonly MedioEjecucion[] = ["servidor", "nativa", "pwa", "web"];

export const NOMBRE_MEDIO: Record<MedioEjecucion, string> = {
  servidor: "servicio local",
  nativa: "app nativa",
  pwa: "app instalada",
  web: "navegador",
};

/** Aceleraciones de cómputo. `cpu`/`wasm` no cuentan como GPU. */
export type Aceleracion = "cpu" | "wasm" | "webgpu" | "metal" | "cuda" | "rocm" | "vulkan" | "nnapi" | "coreml";

export const ACELERACIONES: readonly Aceleracion[] = ["cpu", "wasm", "webgpu", "metal", "cuda", "rocm", "vulkan", "nnapi", "coreml"];

export const ACELERACIONES_GPU: ReadonlySet<Aceleracion> = new Set(["webgpu", "metal", "cuda", "rocm", "vulkan", "nnapi", "coreml"]);

/** Lo que cada medio puede usar como máximo (el hardware decide cuáles hay de verdad). */
export const ACELERACIONES_DEL_MEDIO: Record<MedioEjecucion, ReadonlySet<Aceleracion>> = {
  web: new Set(["wasm", "webgpu"]),
  pwa: new Set(["wasm", "webgpu"]),
  nativa: new Set(["cpu", "wasm", "webgpu", "metal", "cuda", "rocm", "vulkan", "nnapi", "coreml"]),
  servidor: new Set(["cpu", "metal", "cuda", "rocm", "vulkan"]),
};

export type SistemaOperativo = "macos" | "linux" | "windows" | "android" | "ios" | "ipados" | "desconocido";

export type TipoFuente = "github-release" | "github-commit" | "huggingface" | "pypi" | "npm" | "catalogo-capas";

export interface FuenteVersion {
  tipo: TipoFuente;
  /** `dueño/repo` (GitHub, Hugging Face), nombre del paquete (PyPI, npm) o id de capa. */
  ref: string;
}

export type RolGpu = "no" | "opcional" | "recomendada" | "requerida";

export interface RequisitosHardware {
  ramMinMb?: number;
  discoMb?: number;
  nucleosMin?: number;
  gpu?: RolGpu;
  vramMinMb?: number;
  /** Basta UNA de estas en el medio elegido. Vacío = cualquiera. */
  aceleraciones?: Aceleracion[];
  /** Sistemas admitidos. Vacío = todos. */
  sistemas?: SistemaOperativo[];
}

/** De dónde salen los requisitos: lo dice el proyecto, el catálogo firmado o es una estimación. */
export type FuenteRequisitos = "upstream" | "catalogo" | "estimado";

export type CanalMejora = "por-neurona" | "con-el-os";

/** Capas de actualización que puede tocar una mejora (las de `src/lib/actualizaciones`). */
export type CapaMejora = Extract<CapaActualizacion, "modelos" | "servicios" | "nativa" | "interfaz">;

export interface SistemaMejorable {
  id: string;
  familia: FamiliaSistema;
  nombre: string;
  /** Id del motor en el OS (engine-registry de voz, oss-services, capas de Astraura…). */
  motor: string;
  capa: CapaMejora;
  canal: CanalMejora;
  fuente: FuenteVersion;
  requisitos: RequisitosHardware;
  requisitosFuente: FuenteRequisitos;
  /** Medios donde corre, en orden de preferencia. */
  medios: MedioEjecucion[];
  licencia: string;
  /** Licencia de los pesos si difiere de la del código (p. ej. CC-BY-NC-4.0). */
  licenciaPesos?: string;
  /** Acceso condicionado (hay que aceptar términos en la web del modelo): nunca se instala solo. */
  requiereAceptarLicencia?: boolean;
  /** 1-5, orden curado dentro de la familia. Propone; la prueba de calidad decide. */
  preferencia: number;
  nota?: string;
  /** Versión vista en la fuente el día indicado (null = la fuente no publica versiones). */
  comprobado?: { fecha: string; version: string | null };
}

/** Huella de un aparato para decidir qué cabe (contrato §2). */
export interface HuellaAparato {
  neuronaId: string;
  nombre?: string;
  sistema: SistemaOperativo;
  /** RAM en MB, o null si nadie la midió. */
  ramMb: number | null;
  /** true si la RAM viene de `navigator.deviceMemory` (cota inferior redondeada, máx. 8 GB). */
  ramEsCota: boolean;
  /** Disco libre de la máquina (solo lo mide el sondeo o la app nativa). */
  discoLibreMb: number | null;
  /** Cuota libre del origen web (Storage API): el límite real de lo que guarda una pestaña o PWA. */
  cuotaWebLibreMb: number | null;
  nucleos: number | null;
  gpu: { familia: string; modelo?: string; vramMb: number | null };
  aceleraciones: Aceleracion[];
  /** true si las aceleraciones se dedujeron del navegador (sin confirmar por el sondeo). */
  aceleracionesInferidas: boolean;
  medios: MedioEjecucion[];
  enLinea?: boolean;
  /** Cómo se midió: navegador, sondeo de la máquina o ambos fusionados. */
  medida: "navegador" | "sondeo" | "ambos";
}

export interface VersionInstalada {
  version: string;
  medio?: MedioEjecucion;
  sha256?: string;
  desde?: string;
}

export interface VersionRemota {
  version: string | null;
  fecha: string | null;
  /** sha256 del artefacto si la fuente lo da (HF `lfs.oid`, `digest` de GitHub). */
  sha256?: string | null;
  /** La fuente da huellas de sus archivos (LFS sha256, `digest` de GitHub, PyPI, npm). */
  verificable?: boolean;
  error?: string | null;
}
