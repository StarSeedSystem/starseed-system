"use client";

/**
 * Aplica un vínculo de Telepatía de verdad (§5).
 *
 * · Otro cerebro tuyo: copia lo más nuevo y NUNCA borra en el otro lado.
 * · Grupo, comunidad o página: registra el permiso con `upsertGrant`.
 * · Cuenta externa: crea el vínculo con su token, que se enseña una sola vez.
 *
 * No es un módulo puro: toca Supabase y el almacenamiento del aparato. Los
 * planes se calculan con `telepatia.ts`, que sí es puro y está probado.
 */

import { listMemoryFiles, saveMemoryFile } from "@/lib/cerebro/memory-files";
import { saveBrain, type Brain } from "@/lib/brains/brains";
import { upsertGrant } from "@/lib/sharing/access";
import { pushPreferences } from "@/lib/settings-sync";
import {
  ambitoExterno,
  clavesDeAlcance,
  conVinculo,
  esConfiguracionDelCerebro,
  estaCaducado,
  planSincronizacion,
  type VinculoTelepatico,
} from "@/lib/cerebros/telepatia";

export interface EntidadVinculo {
  id: string;
  tipo: string;
  nombre: string;
  slug?: string;
}

export interface ResultadoTelepatia {
  ok: boolean;
  operaciones: number;
  errores: string[];
  avisos: string[];
  token?: string;
}

export interface OpcionesAplicar {
  cerebros: Brain[];
  entidades: EntidadVinculo[];
}


function vacio(): ResultadoTelepatia {
  return { ok: true, operaciones: 0, errores: [], avisos: [] };
}

function clavePref(brainId: string, clave: string): string {
  return `starseed.brain.${brainId}.${clave}`;
}

function leerPref(brainId: string, clave: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(clavePref(brainId, clave));
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function escribirPref(brainId: string, clave: string, valor: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(clavePref(brainId, clave), JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee las configuraciones de un cerebro: las del CEREBRO (base de datos) y las
 * de este aparato (preferencias `starseed.brain.<id>.<clave>`).
 * Lo que no está guardado no se inventa: no aparece.
 */
function leerConfiguraciones(cerebro: Brain, claves: string[]): Record<string, unknown> {
  const valores: Record<string, unknown> = {};
  for (const clave of claves) {
    if (esConfiguracionDelCerebro(clave)) {
      const lista = cerebro.includes?.personalities;
      if (Array.isArray(lista) && lista.length > 0) valores[clave] = lista;
      continue;
    }
    const valor = leerPref(cerebro.id, clave);
    if (valor !== undefined) valores[clave] = valor;
  }
  return valores;
}

/** Escribe una configuración en el destino y dice si se pudo. */
async function escribirConfiguracion(clave: string, valor: unknown, destino: Brain): Promise<boolean> {
  if (esConfiguracionDelCerebro(clave)) {
    const lista = Array.isArray(valor) ? valor.map((v) => String(v)) : [];
    const guardado = await saveBrain({ ...destino, includes: { ...destino.includes, personalities: lista } });
    return Boolean(guardado);
  }
  return escribirPref(destino.id, clave, valor);
}


async function guardarUltimaSync(cerebro: Brain, vinculo: VinculoTelepatico): Promise<string | null> {
  const config = conVinculo(cerebro.config, { ...vinculo, ultimaSync: new Date().toISOString() });
  const guardado = await saveBrain({ ...cerebro, config });
  return guardado ? null : "Se sincronizó, pero no se pudo guardar la hora de la última sincronización.";
}

async function sincronizarCerebros(
  vinculo: VinculoTelepatico,
  cerebro: Brain,
  otro: Brain,
): Promise<ResultadoTelepatia> {
  const r = vacio();
  if (vinculo.destino.tipo !== "cerebro") return r;
  if (vinculo.destino.id === cerebro.id) {
    r.ok = false;
    r.errores.push("Un cerebro no puede vincularse consigo mismo.");
    return r;
  }

  const archivosCerebro = await listMemoryFiles(cerebro.id);
  const archivosOtro = await listMemoryFiles(otro.id);
  const claves = clavesDeAlcance(vinculo);
  const prefsCerebro = leerConfiguraciones(cerebro, claves);
  const prefsOtro = leerConfiguraciones(otro, claves);

  const plan = planSincronizacion(
    vinculo,
    {
      archivos: archivosCerebro.map((a) => ({ name: a.name, content: a.content, updated_at: a.updated_at ?? null })),
      prefs: prefsCerebro,
    },
    {
      archivos: archivosOtro.map((a) => ({ name: a.name, content: a.content, updated_at: a.updated_at ?? null })),
      prefs: prefsOtro,
    },
  );

  const mapaCerebro = new Map(archivosCerebro.map((a) => [a.name, a]));
  const mapaOtro = new Map(archivosOtro.map((a) => [a.name, a]));
  let cambiosEnEsteAparato = false;

  for (const op of plan) {
    if (op.tipo === "carpeta") {
      r.avisos.push(`La carpeta «${op.nombre}» se sincroniza desde su conector; aquí solo queda registrado el vínculo.`);
      continue;
    }
    if (op.tipo === "config") {
      const desde = op.de === "origen" ? cerebro : otro;
      const hacia = op.a === "destino" ? otro : cerebro;
      const valor = op.de === "origen" ? prefsCerebro[op.nombre] : prefsOtro[op.nombre];
      if (valor === undefined) {
        r.avisos.push(`La configuración «${op.nombre}» no está guardada en «${desde.name}»; no se copió.`);
      } else if (await escribirConfiguracion(op.nombre, valor, hacia)) {
        r.operaciones += 1;
        if (!esConfiguracionDelCerebro(op.nombre)) cambiosEnEsteAparato = true;
      } else {
        r.errores.push(`No se pudo guardar la configuración «${op.nombre}» en «${hacia.name}».`);
      }
      continue;
    }
    const desdeMapa = op.de === "origen" ? mapaCerebro : mapaOtro;
    const haciaId = op.a === "destino" ? otro.id : cerebro.id;
    const haciaMapa = op.a === "destino" ? mapaOtro : mapaCerebro;
    const origenArchivo = desdeMapa.get(op.nombre);
    if (!origenArchivo) continue;
    const existente = haciaMapa.get(op.nombre);
    const guardado = await saveMemoryFile({
      ...(existente ? { id: existente.id } : {}),
      brain_id: haciaId,
      name: origenArchivo.name,
      content: origenArchivo.content,
      source: origenArchivo.source,
      server_config: origenArchivo.server_config,
      meta: { ...origenArchivo.meta, telepatia: vinculo.id },
      sync: origenArchivo.sync,
    });
    if (guardado) r.operaciones += 1;
    else r.errores.push(`No se pudo copiar la memoria «${op.nombre}».`);
  }

  if (cambiosEnEsteAparato) {
    // Las preferencias del cerebro viajan a la cuenta: sin esto, el otro aparato no las ve.
    const subida = await pushPreferences();
    if (!subida.ok) {
      r.avisos.push("Se copió en este aparato, pero no se pudo subir a tu cuenta: la otra neurona aún no lo ve.");
    }
  }

  if (r.errores.length === 0) {
    const aviso = await guardarUltimaSync(cerebro, vinculo);
    if (aviso) r.errores.push(aviso);
  }
  r.ok = r.errores.length === 0;
  return r;
}

async function registrarPermiso(
  vinculo: VinculoTelepatico,
  cerebro: Brain,
  entidad: EntidadVinculo,
): Promise<ResultadoTelepatia> {
  const r = vacio();
  if (vinculo.destino.tipo === "cerebro" || vinculo.destino.tipo === "cuenta") return r;
  if (!entidad.slug) {
    r.ok = false;
    r.errores.push(`La entidad «${entidad.nombre}» no tiene slug; no se pudo registrar el permiso.`);
    return r;
  }

  const secciones = vinculo.alcance.completo
    ? undefined
    : [...vinculo.alcance.memorias, ...vinculo.alcance.carpetas, ...vinculo.alcance.configuraciones];
  try {
    await upsertGrant(
      { type: "brain", id: cerebro.id, ownerId: cerebro.owner, title: cerebro.name },
      {
        granteeKind: vinculo.destino.tipo === "pagina" ? "page" : "group",
        granteeId: entidad.slug,
        role: vinculo.acceso === "escribir" ? "edit" : "view",
        label: entidad.nombre,
        ...(secciones && secciones.length ? { sections: secciones } : {}),
      },
    );
    r.operaciones = 1;
    const aviso = await guardarUltimaSync(cerebro, vinculo);
    if (aviso) r.errores.push(aviso);
  } catch (e) {
    r.errores.push(e instanceof Error ? e.message : "No se pudo registrar el permiso.");
  }
  r.ok = r.errores.length === 0;
  return r;
}


async function crearCuentaExterna(
  vinculo: VinculoTelepatico,
  cerebro: Brain,
): Promise<ResultadoTelepatia> {
  const r = vacio();
  const dias = vinculo.expiraEn
    ? Math.max(1, Math.ceil((Date.parse(vinculo.expiraEn) - Date.now()) / 86_400_000))
    : null;
  const ambito = ambitoExterno(vinculo, cerebro.id);
  const incluyeMemorias = vinculo.alcance.completo || vinculo.alcance.memorias.length > 0;
  try {
    const respuesta = await fetch("/api/externos/vinculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "crear",
        ambitoTipo: ambito.ambitoTipo,
        ambitoId: ambito.ambitoId,
        nombre: vinculo.destino.id,
        permisos: {
          leer: true,
          escribir: vinculo.acceso === "escribir",
          memoria: incluyeMemorias,
          hablar: false,
          herramientas: false,
        },
        ...(dias ? { caducaEn: dias } : {}),
      }),
    });
    const cuerpo = (await respuesta.json()) as { token?: string; error?: string };
    if (!respuesta.ok || !cuerpo.token) {
      r.ok = false;
      r.errores.push(cuerpo.error ?? "No se pudo crear el vínculo externo.");
      return r;
    }
    r.token = cuerpo.token;
    r.operaciones = 1;
    const aviso = await guardarUltimaSync(cerebro, vinculo);
    if (aviso) r.errores.push(aviso);
  } catch (e) {
    r.errores.push(e instanceof Error ? e.message : "No se pudo crear el vínculo externo.");
  }
  r.ok = r.errores.length === 0;
  return r;
}


/**
 * Aplica un vínculo según su destino. Devuelve el token solo para cuentas externas.
 *
 * Con una cuenta externa, el token se entrega UNA vez (al crear el vínculo). Por eso,
 * un vínculo que ya se entregó no crea otro: avisa de que el token no se puede volver a leer.
 */
export async function aplicarVinculoTelepatia(
  vinculo: VinculoTelepatico,
  cerebro: Brain,
  opciones: OpcionesAplicar,
): Promise<ResultadoTelepatia> {
  if (vinculo.estado !== "activo") {
    return { ...vacio(), ok: false, errores: ["El vínculo está pausado o pendiente; reanúdalo antes de sincronizar."] };
  }
  if (estaCaducado(vinculo, Date.now())) {
    return { ...vacio(), ok: false, errores: ["El vínculo caducó; crea uno nuevo para seguir compartiendo."] };
  }
  if (vinculo.destino.tipo === "cerebro") {
    const otro = opciones.cerebros.find((c) => c.id === vinculo.destino.id);
    if (!otro) return { ...vacio(), ok: false, errores: ["No se encontró el cerebro de destino."] };
    return sincronizarCerebros(vinculo, cerebro, otro);
  }
  if (vinculo.destino.tipo === "cuenta") {
    if (vinculo.ultimaSync) {
      return {
        ...vacio(),
        avisos: [
          "El token de la cuenta externa ya se entregó y no se vuelve a mostrar. Para compartir otra cosa, crea otro vínculo.",
        ],
      };
    }
    return crearCuentaExterna(vinculo, cerebro);
  }
  const entidad = opciones.entidades.find((e) => e.id === vinculo.destino.id && e.tipo === vinculo.destino.tipo);
  if (!entidad) return { ...vacio(), ok: false, errores: ["No se encontró el grupo, la comunidad o la página de destino."] };
  return registrarPermiso(vinculo, cerebro, entidad);
}
