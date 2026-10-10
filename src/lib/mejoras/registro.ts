/**
 * Registro de SISTEMAS mejorables por familia (contrato §1).
 * ═══════════════════════════════════════════════════════════
 * Lee `registro-sistemas.json` (la misma fuente que usa `scripts/puente/mejoras_neurona.py`),
 * lo sanea entrada a entrada —lo que venga mal se descarta y se dice por qué, no se adivina— y
 * completa los sistemas de la fuente `catalogo-capas` con la RAM, el disco y los medios del
 * catálogo firmado de Astraura (`config/capas-astraura.json`), sin copiarlos.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import crudoRegistro from "./registro-sistemas.json";
import crudoCapas from "../../../config/capas-astraura.json";
import {
  ACELERACIONES,
  FAMILIAS,
  MEDIOS_EJECUCION,
  type Aceleracion,
  type CanalMejora,
  type CapaMejora,
  type FamiliaSistema,
  type FuenteRequisitos,
  type MedioEjecucion,
  type RequisitosHardware,
  type RolGpu,
  type SistemaMejorable,
  type SistemaOperativo,
  type TipoFuente,
} from "./tipos";

const TIPOS_FUENTE: readonly TipoFuente[] = ["github-release", "github-commit", "huggingface", "pypi", "npm", "catalogo-capas"];
const CAPAS: readonly CapaMejora[] = ["modelos", "servicios", "nativa", "interfaz"];
const CANALES: readonly CanalMejora[] = ["por-neurona", "con-el-os"];
const ROLES_GPU: readonly RolGpu[] = ["no", "opcional", "recomendada", "requerida"];
const FUENTES_REQ: readonly FuenteRequisitos[] = ["upstream", "catalogo", "estimado"];
const SISTEMAS_OS: readonly SistemaOperativo[] = ["macos", "linux", "windows", "android", "ios", "ipados", "desconocido"];

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const texto = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const positivo = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);
const de = <T extends string>(lista: readonly T[], x: unknown): T | undefined => (lista.includes(x as T) ? (x as T) : undefined);
const listaDe = <T extends string>(lista: readonly T[], x: unknown): T[] =>
  Array.isArray(x) ? Array.from(new Set(x.filter((v): v is T => lista.includes(v as T)))) : [];

/** Fila del catálogo de capas de Astraura que el registro necesita. */
export interface CapaCatalogo {
  id: string;
  ramMinMb?: number;
  discoMb?: number;
  medios: MedioEjecucion[];
  sha256: string | null;
  fuenteOficial: string;
  version: string;
}

/** El catálogo usa «nativo»; el registro, «nativa». */
const MEDIO_CATALOGO: Record<string, MedioEjecucion> = { web: "web", pwa: "pwa", nativo: "nativa", nativa: "nativa", servidor: "servidor" };

/**
 * Sanea `config/capas-astraura.json`. El disco sale de `tamano_bytes` si existe (es lo que se
 * descarga de verdad: para VibeASR son 1,6 GB aunque `disco_mb` diga 500); si no, de `disco_mb`.
 * Un `sha256` que no sea de 64 hex («por-verificar») cuenta como ausente.
 */
export function leerCatalogoCapas(x: unknown): Map<string, CapaCatalogo> {
  const out = new Map<string, CapaCatalogo>();
  const capas = obj(x).capas;
  if (!Array.isArray(capas)) return out;
  for (const c of capas) {
    const f = obj(c);
    const id = texto(f.id);
    if (!id) continue;
    const bytes = positivo(f.tamano_bytes);
    const sha = texto(f.sha256).toLowerCase();
    const medios = Array.isArray(f.medios) ? f.medios.map((m) => MEDIO_CATALOGO[String(m)]).filter((m): m is MedioEjecucion => !!m) : [];
    out.set(id, {
      id,
      ramMinMb: positivo(f.ram_min_mb),
      discoMb: bytes ? Math.ceil(bytes / (1024 * 1024)) : positivo(f.disco_mb),
      medios: Array.from(new Set(medios)),
      sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null,
      fuenteOficial: texto(f.fuente_oficial),
      version: texto(f.version),
    });
  }
  return out;
}

function sanearRequisitos(x: unknown): RequisitosHardware {
  const r = obj(x);
  const req: RequisitosHardware = {};
  const ram = positivo(r.ramMinMb);
  if (ram) req.ramMinMb = ram;
  const disco = positivo(r.discoMb);
  if (disco) req.discoMb = disco;
  const nucleos = positivo(r.nucleosMin);
  if (nucleos) req.nucleosMin = Math.ceil(nucleos);
  const gpu = de(ROLES_GPU, r.gpu);
  if (gpu) req.gpu = gpu;
  const vram = positivo(r.vramMinMb);
  if (vram) req.vramMinMb = vram;
  const acel = listaDe<Aceleracion>(ACELERACIONES, r.aceleraciones);
  if (acel.length) req.aceleraciones = acel;
  const sist = listaDe(SISTEMAS_OS, r.sistemas);
  if (sist.length) req.sistemas = sist;
  return req;
}

export interface ResultadoRegistro {
  sistemas: SistemaMejorable[];
  /** Entradas descartadas y por qué (para el informe y las pruebas). */
  descartes: string[];
}

/** Sanea el registro crudo y completa las capas de Astraura con su catálogo. Nunca lanza. */
export function construirRegistro(crudo: unknown, catalogo: Map<string, CapaCatalogo> = new Map()): ResultadoRegistro {
  const sistemas: SistemaMejorable[] = [];
  const descartes: string[] = [];
  const vistos = new Set<string>();
  const lista = obj(crudo).sistemas;
  for (const e of Array.isArray(lista) ? lista : []) {
    const f = obj(e);
    const id = texto(f.id);
    const familia = de<FamiliaSistema>(FAMILIAS, f.familia);
    const capa = de(CAPAS, f.capa);
    const canal = de(CANALES, f.canal) ?? "por-neurona";
    const fuente = obj(f.fuente);
    const tipoFuente = de(TIPOS_FUENTE, fuente.tipo);
    const ref = texto(fuente.ref);
    if (!id || !familia || !capa || !tipoFuente || !ref) {
      descartes.push(`${id || "(sin id)"}: faltan familia, capa o fuente válidas`);
      continue;
    }
    if (vistos.has(id)) {
      descartes.push(`${id}: id repetido`);
      continue;
    }
    let requisitos = sanearRequisitos(f.requisitos);
    let medios = listaDe<MedioEjecucion>(MEDIOS_EJECUCION, f.medios);
    if (tipoFuente === "catalogo-capas") {
      const c = catalogo.get(ref);
      if (!c) {
        descartes.push(`${id}: la capa «${ref}» no está en config/capas-astraura.json`);
        continue;
      }
      requisitos = { ...requisitos, ...(c.ramMinMb ? { ramMinMb: c.ramMinMb } : {}), ...(c.discoMb ? { discoMb: c.discoMb } : {}) };
      if (!medios.length) medios = c.medios;
    }
    if (!medios.length) {
      descartes.push(`${id}: no dice en qué medios corre`);
      continue;
    }
    const comp = obj(f.comprobado);
    const sistema: SistemaMejorable = {
      id,
      familia,
      nombre: texto(f.nombre) || id,
      motor: texto(f.motor) || id,
      capa,
      canal,
      fuente: { tipo: tipoFuente, ref },
      requisitos,
      requisitosFuente: de(FUENTES_REQ, f.requisitosFuente) ?? "estimado",
      medios,
      licencia: texto(f.licencia) || "sin declarar",
      preferencia: Math.min(5, Math.max(1, Math.round(positivo(f.preferencia) ?? 1))),
    };
    const lp = texto(f.licenciaPesos);
    if (lp) sistema.licenciaPesos = lp;
    if (f.requiereAceptarLicencia === true) sistema.requiereAceptarLicencia = true;
    const nota = texto(f.nota);
    if (nota) sistema.nota = nota;
    if (texto(comp.fecha)) sistema.comprobado = { fecha: texto(comp.fecha), version: texto(comp.version) || null };
    vistos.add(id);
    sistemas.push(sistema);
  }
  return { sistemas, descartes };
}

/** El catálogo de capas leído una vez (lo usan la decisión: ¿tiene sha256 verificable?). */
export const CATALOGO_CAPAS: Map<string, CapaCatalogo> = leerCatalogoCapas(crudoCapas);

const CONSTRUIDO = construirRegistro(crudoRegistro, CATALOGO_CAPAS);

/** Los sistemas del OS, saneados. */
export const REGISTRO_SISTEMAS: readonly SistemaMejorable[] = CONSTRUIDO.sistemas;
export const DESCARTES_REGISTRO: readonly string[] = CONSTRUIDO.descartes;

export function sistemaPorId(id: string, registro: readonly SistemaMejorable[] = REGISTRO_SISTEMAS): SistemaMejorable | undefined {
  return registro.find((s) => s.id === id);
}

export function sistemasDeFamilia(familia: FamiliaSistema, registro: readonly SistemaMejorable[] = REGISTRO_SISTEMAS): SistemaMejorable[] {
  return registro.filter((s) => s.familia === familia);
}
