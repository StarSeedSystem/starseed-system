/**
 * archivo-seguro-real — lo del mundo real que necesita el archivo sellado: capacidades del par y claves (MPT1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   · Capacidades de cada neurona: del saludo de sincronización (vínculos), de su fila en `neuron_devices.capabilities`
 *     (`archivo`, `epub`) o de lo que anuncie un enlace vivo. Si no se sabe, se trata como par antiguo (sin cifrado de archivo).
 *   · Claves de cifrado: `claves-destinatario.ts` con las cuatro fuentes (vivo → instantánea de la cuenta → certificado →
 *     servidor). La instantánea guarda SOLO claves públicas de neuronas de la cuenta recordada en el almacén de la identidad.
 * Todo import pesado es perezoso; nada lanza.
 */

import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import type { DestinatarioArchivo } from "@/lib/malla/cifrado-archivo";
import { parCifraArchivo } from "@/lib/malla/cifrado-archivo";
import { CAPACIDADES_ARCHIVO, parAnuncia as parEntiendeAnuncio } from "@/lib/malla/archivo-seguro";
import {
  recordarClaveCertificada,
  recordarClaveViva,
  esClaveCifrado,
  fuenteCertificado,
  fuenteInstantanea,
  fuenteServidor,
  fuenteVivo,
  recordarEnInstantanea,
  resolverClaves,
  type AlmacenClavesCuenta,
  type FuenteClave,
  type ResultadoClaves,
} from "@/lib/malla/claves-destinatario";

interface FichaPar {
  caps: string[];
  uid?: string;
}
const fichas = new Map<string, FichaPar>();
const clavesRegistro = new Map<string, JsonWebKey>();

/** Anota lo que se sabe de una neurona (fila de `neuron_devices`, saludo…). Solo etiquetas y claves públicas. */
export function registrarFichaPar(neurona: string, caps?: unknown, epub?: unknown, uid?: string): void {
  if (!neurona) return;
  const previa = fichas.get(neurona);
  const lista = Array.isArray(caps) ? caps.filter((c): c is string => typeof c === "string").slice(0, 32) : previa?.caps ?? [];
  fichas.set(neurona, { caps: lista, ...(uid ?? previa?.uid ? { uid: uid ?? previa?.uid } : {}) });
  if (esClaveCifrado(epub)) clavesRegistro.set(neurona, { kty: "EC", crv: "P-256", x: epub.x, y: epub.y });
  while (fichas.size > 512) fichas.delete(fichas.keys().next().value as string);
}

export function _reiniciarFichasPar(): void {
  fichas.clear();
  clavesRegistro.clear();
}

export function neuronasDeUid(uid: string): string[] {
  return Array.from(fichas.entries())
    .filter(([, f]) => f.uid === uid)
    .map(([n]) => n);
}

/** Capacidades conocidas de una neurona; null = no se sabe. */
export async function capacidadesDeNeurona(neurona: string): Promise<string[] | null> {
  const f = fichas.get(neurona);
  if (f?.caps.length) return f.caps;
  try {
    const m = await import("@/lib/malla/sincronizacion-neuronas-motor");
    const v = m.vinculosDeNeuronas().find((x) => x.neurona === neurona);
    if (v?.capacidades?.length) return v.capacidades;
  } catch {
    /* sin motor de sincronización */
  }
  return null;
}

/** La neurona a la que llega un enlace (por su alcance; si solo hay id de sincronización, por la malla de la cuenta). */
export async function neuronaDeEnlace(e: EnlaceDisponible): Promise<string | null> {
  if (e.alcanza.neuronDeviceId) return e.alcanza.neuronDeviceId;
  if (e.alcanza.syncDeviceId) {
    try {
      const { snapshotMallaNeuronas } = await import("@/lib/network/malla-neuronas");
      return snapshotMallaNeuronas().misDispositivos.find((f) => f.syncDeviceId === e.alcanza.syncDeviceId)?.neuronId ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** ¿Todas las neuronas por las que se va a enviar anuncian `archivo.e2e.v1`? Una desconocida cuenta como antigua. */
export async function parCifraPorEnlaces(enlaces: readonly EnlaceDisponible[], extra: readonly string[] = []): Promise<{ cifra: boolean; neuronas: string[]; anuncia: boolean }> {
  const neuronas: string[] = [];
  let todas = enlaces.length > 0;
  let anuncia = enlaces.length > 0; // ARC1110A: todas las neuronas destinatarias entienden `archivo.anuncio.v1`
  for (const e of enlaces) {
    const n = await neuronaDeEnlace(e);
    if (!n) {
      todas = false;
      anuncia = false;
      continue;
    }
    if (!neuronas.includes(n)) neuronas.push(n);
    const caps = await capacidadesDeNeurona(n);
    if (!parCifraArchivo(caps)) todas = false;
    if (!parEntiendeAnuncio(caps)) anuncia = false;
  }
  for (const n of extra) {
    if (!n || neuronas.includes(n)) continue;
    neuronas.push(n);
    if (!parEntiendeAnuncio(await capacidadesDeNeurona(n))) anuncia = false;
  }
  return { cifra: todas, neuronas, anuncia };
}

/* ── Fuentes de claves ── */

const K_CLAVES = "claves-cifrado.cuenta.v1:";

async function almacenClaves(uid: string): Promise<AlmacenClavesCuenta | null> {
  try {
    const { almacenIdentidad } = await import("@/lib/identidad/almacen");
    const a = almacenIdentidad();
    return {
      leer: async (n) => {
        const mapa = await a.leer<Record<string, JsonWebKey>>(K_CLAVES + uid);
        return mapa?.[n] ?? null;
      },
      escribir: async (n, k) => {
        const mapa = (await a.leer<Record<string, JsonWebKey>>(K_CLAVES + uid)) ?? {};
        mapa[n] = k;
        const claves = Object.keys(mapa);
        for (const x of claves.slice(0, Math.max(0, claves.length - 64))) delete mapa[x];
        await a.escribir(K_CLAVES + uid, mapa);
      },
    };
  } catch {
    return null;
  }
}

export interface ContextoClaves {
  uid: string | null;
  hayInternet: boolean;
  /** Ids de neuronas de la cuenta recordada (instantánea OFF1108A). */
  neuronasDeLaCuenta: readonly string[];
}

async function contextoReal(): Promise<ContextoClaves> {
  let uid: string | null = null;
  let neuronas: string[] = [];
  try {
    const h = await import("@/lib/sin-internet/huellas-cuenta-vivas");
    await h.cargarEspejo();
    uid = h.cuentaDelEspejo();
    neuronas = h.idsNeuronasCuentaCacheados();
  } catch {
    /* sin espejo */
  }
  return { uid, hayInternet: typeof navigator === "undefined" ? false : navigator.onLine !== false, neuronasDeLaCuenta: neuronas };
}

/** Resuelve las claves de `neuronas` por vivo → instantánea → certificado → servidor y anota lo nuevo en la instantánea. */
export async function resolverClavesReales(neuronas: readonly string[], ctx?: ContextoClaves): Promise<ResultadoClaves> {
  const c = ctx ?? (await contextoReal());
  const propias = new Set(c.neuronasDeLaCuenta);
  const esDeLaCuenta = (n: string): boolean => propias.has(n);
  const almacen = c.uid ? await almacenClaves(c.uid) : null;
  const fuentes: FuenteClave[] = [fuenteVivo, fuenteCertificado];
  if (almacen) fuentes.push(fuenteInstantanea(almacen, esDeLaCuenta));
  fuentes.push(
    fuenteServidor(
      () => c.hayInternet,
      async (n) => {
        const fila = clavesRegistro.get(n);
        if (fila) return fila;
        try {
          const { encryptionKeyFor } = await import("@/ai/astraura/mesh/server-relay");
          return encryptionKeyFor(n);
        } catch {
          return null;
        }
      },
    ),
  );
  const r = await resolverClaves(neuronas, fuentes);
  if (almacen) {
    const claves = new Map<string, JsonWebKey>();
    for (const d of r.destinatarios) if (d.rfp) claves.set(d.rfp, d.pub);
    void recordarEnInstantanea(almacen, esDeLaCuenta, r, neuronas, (n) => claves.get(n) ?? null).catch(() => undefined);
  }
  return r;
}

/** Destinatarios para sellar la oferta: una copia por neurona con clave. */
export async function destinatariosReales(neuronas: readonly string[]): Promise<DestinatarioArchivo[]> {
  return (await resolverClavesReales(neuronas)).destinatarios;
}

/* ── Saludos: lo que se anuncia y lo que se aprende ── */

/** Capacidades de archivo y pública de cifrado de ESTA neurona, para el saludo (`nl.hola`). Nunca lanza. */
let holaCache: { ar: string[]; ep?: JsonWebKey } | null = null;

/** Lo mismo SIN esperar: devuelve lo ya calculado (o solo las capacidades) y calienta la clave para el siguiente saludo. */
export function datosHolaArchivoYa(): { ar: string[]; ep?: JsonWebKey } {
  if (!holaCache) void datosHolaArchivo().catch(() => undefined);
  return holaCache ?? { ar: [...CAPACIDADES_ARCHIVO] };
}

export async function datosHolaArchivo(): Promise<{ ar: string[]; ep?: JsonWebKey }> {
  if (holaCache) return holaCache;
  const ar = [...CAPACIDADES_ARCHIVO];
  try {
    const { myEncryptionPublicKey } = await import("@/ai/astraura/mesh/recipient-crypto");
    const k = await myEncryptionPublicKey();
    if (esClaveCifrado(k)) return (holaCache = { ar, ep: { kty: "EC", crv: "P-256", x: k.x, y: k.y } });
  } catch {
    /* sin WebCrypto: solo las capacidades */
  }
  return { ar };
}

/** Un saludo FIRMADO y ya aceptado trajo capacidades y clave de cifrado: se anotan (la clave como «viva»). */
export function registrarHolaArchivo(neurona: string, ar?: unknown, ep?: unknown, cert?: { certificado: unknown; huella: string | undefined }): void {
  try {
    registrarFichaPar(neurona, ar, ep);
    if (ep) recordarClaveViva(neurona, ep);
    // PTA1108C: el mismo saludo, si trae certificado verificable, deja la clave también como «certificada» (funciona sin red).
    if (ep && cert?.certificado) void registrarClaveDeHolaCertificada(neurona, ep, cert.certificado, cert.huella).catch(() => undefined);
  } catch {
    /* informativo */
  }
}

/** Verificador inyectable de certificados de saludo (el real es `verificarHolaConCertificado` de IDN1108A). */
export type VerificarCertHola = (h: { certificado: unknown; neurona: string; huella: string }) => Promise<{ ok: boolean; estado: string }>;

/**
 * PTA1108C · Si el saludo trae un certificado cuenta→neurona que VERIFICA contra una ancla conocida (`estado: "valido"`:
 * firma, caducidad, revocación y portador = neurona + huella del aparato que firmó el sobre), la clave de cifrado del
 * saludo se guarda como «certificada». Certificado malo, sin ancla, sin huella probada o clave inválida: no se guarda nada.
 */
export async function registrarClaveDeHolaCertificada(neurona: string, ep: unknown, certificado: unknown, huella: string | undefined, verificar?: VerificarCertHola): Promise<boolean> {
  if (!neurona || !huella || !esClaveCifrado(ep) || !certificado) return false;
  try {
    const v = verificar ?? (await import("@/lib/identidad/enlace")).verificarHolaConCertificado;
    const r = await v({ certificado, neurona, huella });
    if (!r.ok || r.estado !== "valido") return false;
    return recordarClaveCertificada(neurona, ep);
  } catch {
    return false;
  }
}
