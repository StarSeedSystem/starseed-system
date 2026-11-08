/**
 * (IDN1108A) Servicio de identidad de cuenta de ESTA neurona: une la clave maestra (`master-identity.ts`),
 * el certificado propio, las anclas y las revocaciones. Lo usan la UI de Ajustes y los ganchos de saludo.
 *
 * Reglas duras:
 *  · La clave maestra privada NUNCA sale de aquí hacia un servidor; solo se exporta CIFRADA con passphrase.
 *  · La clave maestra se queda como hasta ahora en `master-identity.ts` (safe-storage) porque tiene que poder
 *    exportarse; aquí (IndexedDB) se anota QUÉ NEURONA LA TIENE y se guardan certificado, anclas y revocaciones.
 *  · Sin WebCrypto o sin maestra todo devuelve null/false: nunca lanza.
 */

import type { MasterBlob } from "@/ai/astraura/mesh/master-identity";
import { almacenIdentidad, type AlmacenKV } from "./almacen";
import { crearAnclas, type Anclas } from "./anclas";
import { emitirCertificadoNeurona, firmanteDeClave, type CertificadoNeurona, type Firmante } from "./certificado-neurona";
import { confirmarEnrolamiento, crearSolicitud, decodificarMensaje, prepararEnrolamiento, procesarRespuesta, type EnrolamientoPendiente, type SolicitudEnrolamiento } from "./enrolar";
import { crearRevocaciones, firmarListaRevocacion, type Revocaciones } from "./revocaciones";
import { aB64url, bytesDe, deB64url, pubLimpia } from "./util";

const K_TENENCIA = "tenencia.v1";
const K_CERT = "certificado.propio.v1";
/** Se renueva el certificado propio cuando le quedan menos de 30 días. */
const RENOVAR_ANTES_MS = 30 * 24 * 60 * 60_000;

export interface Tenencia {
  neuronaId: string;
  nombre: string;
  desde: number;
  mfp: string;
}

/** Lo que el servicio necesita de la clave maestra local (por defecto, `master-identity.ts`). */
export interface MaestraLocal {
  tiene(): boolean;
  obtener(): Promise<{ pub: JsonWebKey; privKey: CryptoKey; fp: string } | null>;
  exportar(pass: string): Promise<MasterBlob | null>;
  importar(blob: MasterBlob, pass: string): Promise<{ fp: string } | null>;
}

export interface DepsServicio {
  almacen: AlmacenKV;
  anclas: Anclas;
  revocaciones: Revocaciones;
  maestra: MaestraLocal;
  neuronaId(): string;
  nombreNeurona(): string;
  cuenta(): Promise<string | null>;
  /** Clave pública ECDSA del aparato (mesh-identity). */
  aparato(): Promise<{ pub: JsonWebKey } | null>;
  ahora(): number;
}

async function maestraReal(): Promise<MaestraLocal> {
  const m = await import("@/ai/astraura/mesh/master-identity");
  return { tiene: m.hasMasterKey, obtener: m.getOrCreateMasterKey, exportar: m.exportMasterKeyEncrypted, importar: m.importMasterKeyEncrypted };
}

export async function depsReales(): Promise<DepsServicio> {
  const almacen = almacenIdentidad();
  const [maestra, { identidadDispositivo }, { getIdentity }] = await Promise.all([
    maestraReal(),
    import("@/lib/network/identidad-dispositivo"),
    import("@/ai/astraura/mesh/mesh-identity"),
  ]);
  return {
    almacen,
    anclas: crearAnclas(almacen),
    revocaciones: crearRevocaciones(almacen),
    maestra,
    neuronaId: () => identidadDispositivo().neuronDeviceId,
    nombreNeurona: () => {
      try {
        const n = typeof navigator !== "undefined" ? navigator.userAgent : "";
        return /iPhone|Android/i.test(n) ? "Esta neurona (móvil)" : "Esta neurona";
      } catch {
        return "Esta neurona";
      }
    },
    cuenta: async () => {
      try {
        return await (await import("@/lib/consumo/usuario")).uidActual();
      } catch {
        return null;
      }
    },
    aparato: async () => {
      const i = await getIdentity();
      return i ? { pub: i.pub } : null;
    },
    ahora: () => Date.now(),
  };
}

/* ───────── texto portátil de la maestra cifrada (QR / archivo) ───────── */

export const PREFIJO_MAESTRA = "ssm1:";
export function blobATexto(b: MasterBlob): string {
  return PREFIJO_MAESTRA + aB64url(bytesDe(JSON.stringify(b)));
}
export function textoABlob(t: string): MasterBlob | null {
  try {
    const s = t.trim();
    const json = s.startsWith(PREFIJO_MAESTRA) ? new TextDecoder().decode(deB64url(s.slice(PREFIJO_MAESTRA.length))) : s;
    const b = JSON.parse(json) as MasterBlob;
    return b && b.v === 2 && b.ct && b.salt && b.iv && b.mpub ? b : null;
  } catch {
    return null;
  }
}

export function crearServicio(deps: DepsServicio) {
  const { almacen, anclas, revocaciones, maestra } = deps;

  async function firmante(): Promise<Firmante | null> {
    if (!maestra.tiene()) return null;
    const m = await maestra.obtener();
    return m ? firmanteDeClave(m.pub, m.privKey) : null;
  }

  async function tenencia(): Promise<Tenencia | null> {
    return (await almacen.leer<Tenencia>(K_TENENCIA)) ?? null;
  }

  async function certificadoPropio(): Promise<CertificadoNeurona | null> {
    return (await almacen.leer<CertificadoNeurona>(K_CERT)) ?? null;
  }
  async function guardarCertificadoPropio(c: CertificadoNeurona): Promise<void> {
    await almacen.escribir(K_CERT, c);
  }

  /** La titular se certifica a sí misma (así su saludo lleva certificado) y renueva cuando toca. */
  async function autoCertificar(): Promise<CertificadoNeurona | null> {
    const f = await firmante();
    const ap = await deps.aparato();
    const cuenta = (await deps.cuenta()) ?? (await anclas.propia())?.cuenta ?? "";
    if (!f || !ap || !cuenta) return null;
    const previo = await certificadoPropio();
    if (previo && previo.mpub.x === f.mpub.x && previo.caduca - deps.ahora() > RENOVAR_ANTES_MS && previo.clavePublicaAparato.x === ap.pub.x) return previo;
    const c = await emitirCertificadoNeurona(f, { cuenta, neuronaId: deps.neuronaId(), clavePublicaAparato: ap.pub, permisos: [...(previo?.permisos ?? ["sincronizar", "mensajes", "archivos", "llamadas"])], emitido: deps.ahora() });
    if (c) await guardarCertificadoPropio(c);
    return c;
  }

  async function tras(fp: string): Promise<void> {
    const cuenta = (await deps.cuenta()) ?? undefined;
    await anclas.fijarPropia(fp, cuenta, "Mi cuenta");
    await almacen.escribir(K_TENENCIA, { neuronaId: deps.neuronaId(), nombre: deps.nombreNeurona(), desde: deps.ahora(), mfp: fp } satisfies Tenencia);
    await autoCertificar();
  }

  return {
    firmante,
    tenencia,
    certificadoPropio,
    guardarCertificadoPropio,
    autoCertificar,
    anclas,
    revocaciones,

    async estado() {
      const tiene = maestra.tiene();
      const m = tiene ? await maestra.obtener() : null;
      return {
        tiene,
        mfp: m?.fp ?? null,
        tenencia: await tenencia(),
        certificado: await certificadoPropio(),
        neuronaId: deps.neuronaId(),
      };
    },

    /** Crea la maestra solo si no hay ninguna (nunca pisa una existente). */
    async crearMaestra(): Promise<{ ok: true; mfp: string } | { ok: false; motivo: string }> {
      if (maestra.tiene()) return { ok: false, motivo: "Esta neurona ya tiene una clave maestra." };
      const m = await maestra.obtener();
      if (!m) return { ok: false, motivo: "Este aparato no permite crear la clave (falta WebCrypto)." };
      await tras(m.fp);
      return { ok: true, mfp: m.fp };
    },

    /** Exporta cifrada. Devuelve el texto portátil (para QR y archivo). */
    async exportar(pass: string): Promise<{ ok: true; texto: string; nombreArchivo: string } | { ok: false; motivo: string }> {
      if (!maestra.tiene()) return { ok: false, motivo: "Esta neurona no tiene clave maestra." };
      if (pass.length < 12) return { ok: false, motivo: "La contraseña debe tener al menos 12 caracteres." };
      const b = await maestra.exportar(pass);
      return b ? { ok: true, texto: blobATexto(b), nombreArchivo: `starseed-clave-maestra-${b.mfp.slice(5, 13)}.ssm` } : { ok: false, motivo: "No se pudo cifrar la clave." };
    },

    async importar(texto: string, pass: string): Promise<{ ok: true; mfp: string } | { ok: false; motivo: string }> {
      const blob = textoABlob(texto);
      if (!blob) return { ok: false, motivo: "Eso no parece una clave maestra exportada." };
      if (pass.length < 12) return { ok: false, motivo: "La contraseña debe tener al menos 12 caracteres." };
      const r = await maestra.importar(blob, pass);
      if (!r) return { ok: false, motivo: "Contraseña incorrecta o archivo dañado." };
      await tras(r.fp);
      return { ok: true, mfp: r.fp };
    },

    /** (Neurona nueva) Prepara la solicitud con la clave pública de este aparato. */
    async nuevaSolicitud(): Promise<SolicitudEnrolamiento | null> {
      const ap = await deps.aparato();
      const pub = pubLimpia(ap?.pub);
      return pub ? crearSolicitud({ neuronaId: deps.neuronaId(), nombre: deps.nombreNeurona(), clavePublicaAparato: pub }, deps.ahora()) : null;
    },

    /** (Titular) Lee la solicitud de una neurona nueva (texto del QR) y prepara el código de 6 cifras. */
    async prepararEnrolamientoDe(texto: string) {
      const f = await firmante();
      const cuenta = (await deps.cuenta()) ?? (await anclas.propia())?.cuenta ?? "";
      if (!f) return { ok: false as const, motivo: "Esta neurona no tiene la clave maestra." };
      if (!cuenta) return { ok: false as const, motivo: "No se conoce la cuenta de esta neurona." };
      return prepararEnrolamiento(decodificarMensaje(texto), f, cuenta, { ahora: deps.ahora() });
    },
    /** (Neurona nueva) Lee la respuesta (texto del QR) y calcula el código de 6 cifras, sin guardar nada aún. */
    async leerRespuesta(solicitud: SolicitudEnrolamiento, texto: string) {
      return procesarRespuesta(solicitud, decodificarMensaje(texto), { ahora: deps.ahora() });
    },
    /** (Neurona nueva) La persona escribió el código que ve en la otra pantalla: si coincide, se guarda todo. */
    async confirmarEnrolamiento(p: EnrolamientoPendiente, codigo: string): Promise<boolean> {
      return confirmarEnrolamiento(p, codigo, { guardarCertificado: guardarCertificadoPropio, fijarAnclaPropia: (mfp, cuenta) => anclas.fijarPropia(mfp, cuenta, "Mi cuenta") });
    },

    /** (Titular) Revoca neuronas: firma la lista siguiente, la acepta y la devuelve para difundirla. */
    async revocar(nuevas: ReadonlyArray<{ neuronaId: string; huella?: string; motivo?: string }>) {
      const f = await firmante();
      if (!f) return null;
      const m = await maestra.obtener();
      if (!m) return null;
      await revocaciones.cargar();
      const lista = await firmarListaRevocacion(f, await revocaciones.lista(m.fp), nuevas, deps.ahora());
      if (!lista) return null;
      await revocaciones.aceptar(lista, await anclas.listar());
      return lista;
    },
  };
}
export type ServicioIdentidad = ReturnType<typeof crearServicio>;

let unico: Promise<ServicioIdentidad> | null = null;
/** Servicio real (uno por pestaña). */
export function servicioIdentidad(): Promise<ServicioIdentidad> {
  return (unico ??= depsReales().then(crearServicio));
}
