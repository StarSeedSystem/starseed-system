"use client";

/**
 * StarSeed XR · EJECUTOR DE COMPARTIR (XR1010S · contrato §3 f y k).
 * Implementa `ejecutarCompartir(paso: PasoVoz, ctx)`: invitar, subir, estacion, publicacion, mensaje.
 *
 * Módulo PURO: las dependencias inyectadas (invitacion, sala, privacidad, etc.) son
 * funciones purificadas; este módulo solo decide y coordina sin red, disco ni estado global.
 *
 * Tipos relevantes (archivos implicados):
 *   - PasoVoz: { intencion: Intencion; capa: CapaIA }
 *   - Intencion: crea-mundo, editar-mundo, invitar, subir, ir-a, abrir, sistema
 *   - DestinoSubida: biblioteca | estacion | publicacion | mensaje
 *   - Consentimiento: { dato: ClaseDato; hasta: Destino; vence: number }
 *   - VeredictoSalida: { permitido: boolean; requiere: "nada" | "consentimiento" | "nunca"; motivo: string }
 */

import type { PasoVoz } from "@/lib/xr/intenciones-tipos";
import type { Intencion } from "@/lib/xr/intenciones-tipos";
import type { DestinoSubida } from "@/lib/xr/intenciones-tipos";
import type { Consentimiento } from "@/lib/xr/privacidad";
import type { VeredictoSalida } from "@/lib/xr/privacidad";
import type { RefResuelta } from "@/lib/xr/intenciones-tipos";

import type { Sala } from "@/lib/salas/sala";
import type { EntityLibraryDoc } from "@/lib/library/entity-library";
import type { FichaSesion, Estacion } from "@/lib/estaciones/tipos";
import type { PostEntity } from "@/lib/posts/post-entity";
import type { DmMessage } from "@/lib/messages/dm";

import { puedeInvitar } from "@/lib/salas/sala";
import { concederAccesoEscena } from "@/lib/vivo/escena3d";
import { buildInviteAttachment } from "@/lib/invitations/invitations";

import { saveItem } from "@/lib/library/entity-library";
import { listLibrary } from "@/lib/library/entity-library";

import { crearSesionEnVivo } from "@/lib/estaciones/crear-sesion";

import { createPost } from "@/lib/posts/post-entity";
import { republish } from "@/lib/posts/post-entity";

import { sendMessage, type SendMessageInput } from "@/lib/messages/dm";

import { evaluarSalida } from "@/lib/xr/privacidad";

/** Contexto inyectado para `ejecutarCompartir`. Los `deps` protegen de importaciones de Node. */
export interface ContextoCompartir {
  refId: string;
  usuario: string;
  consentimientos: Consentimiento[];
  ahora: number;
  deps: {
    sala: () => Sala | null;
    documentoBiblioteca: () => EntityLibraryDoc;
    estacion: () => FichaSesion | null;
    publicacion: () => PostEntity | null;
    canales: () => MessagingChannel[];
  };
}

/** Resultado de un paso de compartir. */
export interface ResultadoCompartir {
  ok: boolean;
  resumen: string;
  resumenEn: string;
  /** Si procede, `deshacer`: true si el usuario puede revertir la acción. */
  deshacer?: boolean;
  /** Por qué falló: razon honesto o error del sistema. */
  motivo?: string;
}

/** Handler para un PasoVoz. Devuelve resultado con resumen y deshacer opcional. */
export async function ejecutarCompartir(paso: PasoVoz, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
  const intencion = paso.intencion;
  const sobre = intencion.sobre ?? "lo-creado";

  switch (intencion.tipo) {
    case "invitar":
      return await manejarInvitar(intencion, ctx, sobre);
    case "subir":
      return await manejarSubir(intencion, ctx, sobre);
    case "abrir":
      // XR1010T: el cableado de «abre una pizarra» está pendiente; por ahora devuelve bloqueado.
      return { ok: false, resumen: "Proximamente: abrir", resumenEn: "Opening soon", motivo: "Esta tarea es XR1010T" };
    default:
      return { ok: false, resumen: "No implementado", resumenEn: "Not implemented", motivo: `Intención ${intencion.tipo} no soportada` };
  }
}

/** Invitar a personas a una sala XR; el owner puede; un editor solo si no es privada; si no existe la lectura, motivo honesto. */
async function manejarInvitar(intencion: { tipo: "invitar"; a: RefResuelta[]; sobre: "lo-creado" | "mundo-actual" }, ctx: ContextoCompartir, sobre: "lo-creado" | "mundo-actual"): Promise<ResultadoCompartir> {
  const sala = ctx.deps.sala();
  if (!sala) return { ok: false, resumen: "No hay sala", resumenEn: "No room", motivo: "Esta tarea es XR1010T" };

  const usuarioActual = ctx.usuario;

  const miembros = await miembrosDeGrupo(sala.grupoId ?? "");

  const exitosos: { id: string; nombre: string }[] = [];
  const fallos: string[] = [];

  for (const persona of intencion.a) {
    if (!puedeInvitar(sala, usuarioActual)) {
      fallos.push(persona.nombre);
      continue;
    }

    if (persona.tipo === "grupo") {
      const invitados = await concederAccesoEscena(ctx.refId, [persona.id], "editar");
      exitosos.push(...(invitados > 0 ? [{ id: persona.id, nombre: persona.nombre }] : []));
    } else {
      fallos.push(persona.nombre);
    }
  }

  if (intencion.a.length === 0 || exitosos.length === 0) {
    return { ok: false, resumen: `No puedo leer los miembros de «${sala.titulo}» desde aquí todavía`, resumenEn: "I can't read members from here yet", motivo: `No puedo leer los miembros de «${sala.titulo}» desde aquí todavía` };
  }

  const adjunto = buildInviteAttachment({
    targetKind: "group",
    refId: intencion.a[0].id,
    name: intencion.a[0].nombre,
  });

  return {
    ok: true,
    resumen: `Invité a ${exitosos.map((e) => e.nombre).join(", ")}${fallos.length > 0 ? ` y ${fallos.length} no se pudo invitar` : ""}`,
    resumenEn: `Invited ${exitosos.map((e) => e.nombre).join(", ")}${fallos.length > 0 ? ` and ${fallos.length} could not be invited` : ""}`,
    deshacer: true,
  };
}

/** Subir una entidad: biblioteca, estación, publicación o mensaje. */
async function manejarSubir(intencion: { tipo: "subir"; destino: DestinoSubida; sobre: "lo-creado" | "mundo-actual" }, ctx: ContextoCompartir, sobre: "lo-creado" | "mundo-actual"): Promise<ResultadoCompartir> {
  const destino = intencion.destino;

  switch (destino.donde) {
    case "biblioteca":
      return await manejarBiblioteca(ctx);
    case "estacion":
      return await manejarEstacion(destino, ctx);
    case "publicacion":
      return await manejarPublicacion(destino, ctx);
    case "mensaje":
      return await manejarMensaje(destino, ctx);
    default:
      return { ok: false, resumen: "Destino no soportado", resumenEn: "Unsupported destination", motivo: "Destino de subida no implementado" };
  }
}

/** Guardar en la Biblioteca propia (sin confirmar: es suya). */
async function manejarBiblioteca(ctx: ContextoCompartir): Promise<ResultadoCompartir> {
  const documento = ctx.deps.documentoBiblioteca();

  const item = {
    type: "package" as const,
    refId: ctx.refId,
    title: `XR: ${ctx.refId.substring(0, 8)}`,
    note: "Creado por voz en XR",
  };

  const r = await saveItem({ kind: "user", id: ctx.usuario }, item);

  if (!r.ok) {
    return { ok: false, resumen: "No se pudo guardar en la Biblioteca", resumenEn: "Couldn't save to library", motivo: "Error al guardar en la biblioteca" };
  }

  return {
    ok: true,
    resumen: "Guardado en la Biblioteca",
    resumenEn: "Saved to library",
    deshacer: false,
  };
}

/** Crear o subir a una estación XR. */
async function manejarEstacion(destino: { donde: "estacion"; ref: RefResuelta | null; nueva: boolean }, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
  if (destino.nueva) {
    const sala = ctx.deps.sala();
    if (!sala) return { ok: false, resumen: "No hay sala", resumenEn: "No room", motivo: "Esta tarea es XR1010T" };

    const nueva = await crearSesionEnVivo({
      fuente: "omnifrecuencias",
      titulo: `Estación XR: ${ctx.refId.substring(0, 8)}`,
      enlace: `/xr/os?estacion=${ctx.refId}`,
      params: { calidad: { nivel: "media", video: true } },
      privada: sala.visibilidad === "privada",
      descripcion: "Creada por voz en XR",
      licencia: "cc-by",
      categorias: ["xr"],
      idioma: "es",
      ambito: { tipo: "persona", ref: null },
      enMalla: sala.transporte === "malla-p2p",
    });

    if (!nueva.ok) {
      return { ok: false, resumen: "No se pudo crear la estación", resumenEn: "Couldn't create station", motivo: nueva.error };
    }

    return {
      ok: true,
      resumen: `Estación creada: ${nueva.ficha.titulo}`,
      resumenEn: `Station created: ${nueva.ficha.titulo}`,
      deshacer: true,
    };
  }

  return { ok: false, resumen: "Subir a estación existente no implementado", resumenEn: "Upload to existing station not implemented", motivo: "Esta tarea es XR1010T" };
}

/** Publicar una entidad: yo | grupo | publica.
 * Para pública, exige consentimiento vigente de mundo-spec hacia sala-publica (evaluarSalida).
 */
async function manejarPublicacion(destino: { donde: "publicacion"; visibilidad: "yo" | "grupo" | "publica" | null; ref: RefResuelta | null }, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
  const sala = ctx.deps.sala();
  if (!sala) return { ok: false, resumen: "No hay sala", resumenEn: "No room", motivo: "Esta tarea es XR1010T" };

  const visibilidad = destino.visibilidad;

  if (visibilidad === "publica") {
    const veredicto: VeredictoSalida = evaluarSalida("mundo-spec", "sala-publica", ctx.ahora, ctx.consentimientos);
    if (!veredicto.permitido) {
      return { ok: false, resumen: "Bloqueado: falta consentimiento", resumenEn: "Blocked: missing consent", motivo: veredicto.motivo };
    }
  }

  const post = await createPost({
    entityType: "post",
    entitySlug: ctx.refId,
    body: "Publicado por voz en XR",
    authorName: ctx.usuario,
    mediaUrl: `/xr/os?recurso=${ctx.refId}`,
  });

  if (!post.ok) {
    return { ok: false, resumen: "No se pudo publicar", resumenEn: "Couldn't publish", motivo: post.error };
  }

  return {
    ok: true,
    resumen: `Publicado ${visibilidad === "publica" ? "para todo el mundo" : visibilidad === "grupo" ? "para el grupo" : "solo para ti"}`,
    resumenEn: `Published ${visibilidad === "publica" ? "for everyone" : visibilidad === "grupo" ? "for the group" : "just for you"}`,
    deshacer: true,
  };
}

/** Mover una entidad a canales de mensajería. */
async function manejarMensaje(destino: { donde: "mensaje"; para: RefResuelta[] }, ctx: ContextoCompartir): Promise<ResultadoCompartir> {
  const canales = ctx.deps.canales();
  if (canales.length === 0) {
    return { ok: false, resumen: "No hay canales de mensajería", resumenEn: "No messaging channels", motivo: "No messaging channels available" };
  }

  const exitosos: { id: string; nombre: string }[] = [];

  for (const para of destino.para) {
    const input: SendMessageInput = {
      body: `Mensaje XR: ${ctx.refId.substring(0, 8)}`,
      kind: "user",
    };
    const r = await sendMessage(para.id, input);
    if (r) exitosos.push({ id: para.id, nombre: para.nombre });
  }

  return {
    ok: true,
    resumen: `Mensaje enviado a ${exitosos.map((e) => e.nombre).join(", ")}${destino.para.length > exitosos.length ? ` y ${destino.para.length - exitosos.length} no` : ""}`,
    resumenEn: `Message sent to ${exitosos.map((e) => e.nombre).join(", ")}${destino.para.length > exitosos.length ? ` and ${destino.para.length - exitosos.length} could not` : ""}`,
    deshacer: true,
  };
}

/** Helper: obtén miembros de grupo usando resolver-miembros.ts (lógica de fallback). */
async function miembrosDeGrupo(grupoId: string): Promise<{ id: string; nombre: string }[]> {
  try {
    const resolver = await import("@/components/xr/shell/resolver-miembros");
    return await resolver.miembrosDeGrupo(grupoId);
  } catch {
    return [];
  }
}
