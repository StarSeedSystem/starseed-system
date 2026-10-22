// StarSeed · Comandos procedimentales ejecutables por una decisión aprobada.
// Catálogo + ejecutor tolerante. El cliente supabase se pasa por contexto.

import type { CommandSpec } from "./types";
import {
  clienteVikunja,
  descripcionTarea,
  tituloProyecto,
  type DecisionAprobada,
  type Entidad,
  type TipoEntidad,
} from "@/lib/conectores-propios/vikunja";
import { connectorCredentials } from "@/lib/connectors/connector-credentials";

export type CommandField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
};

export type CommandTypeDef = {
  id: string;
  label: string;
  blurb: string;
  fields: CommandField[];
};

// Catálogo de tipos de comando disponibles para las propuestas.
export const COMMAND_TYPES: CommandTypeDef[] = [
  {
    id: "none",
    label: "Sin comando",
    blurb: "Decisión consultiva: registra el resultado sin ejecutar nada automáticamente.",
    fields: [],
  },
  {
    id: "publish",
    label: "Publicar",
    blurb: "Crea una publicación en el lienzo universal con el contenido decidido.",
    fields: [
      { key: "postType", label: "Tipo de post", type: "text", placeholder: "text", optional: true },
      { key: "content", label: "Contenido", type: "textarea", placeholder: "Texto de la publicación…" },
      {
        key: "visibility",
        label: "Visibilidad",
        type: "select",
        optional: true,
        options: [
          { value: "public", label: "Pública" },
          { value: "members", label: "Miembros" },
          { value: "private", label: "Privada" },
        ],
      },
    ],
  },
  {
    id: "update_publication",
    label: "Actualizar publicación",
    blurb: "Modifica el contenido de una publicación existente.",
    fields: [
      { key: "postId", label: "ID de la publicación", type: "text", placeholder: "uuid del post" },
      { key: "content", label: "Nuevo contenido", type: "textarea", placeholder: "Texto actualizado…" },
    ],
  },
  {
    id: "set_governance",
    label: "Definir gobernanza",
    blurb: "Cambia el modo (democrático/jerárquico) y parámetros de un contexto.",
    fields: [
      { key: "scope", label: "Ámbito", type: "text", placeholder: "page / community / group…" },
      { key: "scope_ref", label: "Referencia", type: "text", placeholder: "ID del contexto", optional: true },
      {
        key: "mode",
        label: "Modo",
        type: "select",
        optional: true,
        options: [
          { value: "democratic", label: "Democrático" },
          { value: "hierarchical", label: "Jerárquico" },
        ],
      },
    ],
  },
  {
    id: "set_config",
    label: "Ajustar configuración",
    blurb: "Define un parámetro de configuración de un grupo/página/comunidad.",
    fields: [
      { key: "scope", label: "Ámbito", type: "text", placeholder: "page / community / group…" },
      { key: "scope_ref", label: "Referencia", type: "text", placeholder: "ID del contexto", optional: true },
      { key: "key", label: "Clave", type: "text", placeholder: "p.ej. tema, idioma…" },
      { key: "value", label: "Valor", type: "text", placeholder: "valor a aplicar" },
    ],
  },
  {
    id: "set_permission",
    label: "Definir permiso",
    blurb: "Establece un permiso del contexto (sujeto al modo de gobernanza).",
    fields: [
      { key: "scope", label: "Ámbito", type: "text", placeholder: "page / community / group…" },
      { key: "scope_ref", label: "Referencia", type: "text", placeholder: "ID del contexto", optional: true },
      { key: "permission", label: "Permiso", type: "text", placeholder: "p.ej. publicar, invitar…" },
      { key: "value", label: "Valor", type: "text", placeholder: "true / false / rol…" },
    ],
  },
  {
    id: "create_page",
    label: "Crear página",
    blurb: "Crea una nueva página o comunidad.",
    fields: [
      { key: "type", label: "Tipo", type: "text", placeholder: "page / community" },
      { key: "title", label: "Título", type: "text", placeholder: "Nombre de la página" },
    ],
  },
  {
    id: "add_member",
    label: "Añadir miembro",
    blurb: "Incorpora un perfil a un grupo, página o comunidad.",
    fields: [
      { key: "scope", label: "Ámbito", type: "text", placeholder: "page / community / group" },
      { key: "scope_ref", label: "Referencia", type: "text", placeholder: "ID del contexto" },
      { key: "profileId", label: "ID del perfil", type: "text", placeholder: "uuid del perfil" },
      { key: "role", label: "Rol", type: "text", placeholder: "member", optional: true },
    ],
  },
  {
    id: "create_memory",
    label: "Crear memoria",
    blurb: "Materializa una memoria con el contenido decidido.",
    fields: [
      { key: "name", label: "Nombre", type: "text", placeholder: "Nombre de la memoria" },
      { key: "content", label: "Contenido", type: "textarea", placeholder: "Contenido…" },
      { key: "kinds", label: "Tipos (coma)", type: "text", placeholder: "memory, config", optional: true },
    ],
  },
  {
    id: "update_memory",
    label: "Actualizar memoria",
    blurb: "Reemplaza el contenido de una memoria existente.",
    fields: [
      { key: "id", label: "ID de la memoria", type: "text", placeholder: "uuid de la memoria" },
      { key: "content", label: "Nuevo contenido", type: "textarea", placeholder: "Contenido…" },
    ],
  },
  {
    id: "deploy",
    label: "Desplegar / conectar infraestructura",
    blurb: "Conecta un servidor o datastore compartido (requiere aprobación).",
    fields: [
      {
        key: "target",
        label: "Tipo",
        type: "select",
        options: [
          { value: "server", label: "server" },
          { value: "datastore", label: "datastore" },
        ],
      },
      { key: "kind", label: "Clase (p.ej. hostinger, local, postgres, qdrant, minio…)", type: "text" },
      { key: "name", label: "Nombre", type: "text" },
      { key: "endpoint", label: "Endpoint/URL (opcional)", type: "text", optional: true },
      { key: "keyRef", label: "Clave en bóveda (opcional)", type: "text", optional: true },
      { key: "brainId", label: "Cerebro a enlazar (opcional, para target=server)", type: "text", optional: true },
      { key: "scope", label: "Ámbito (group/page/community/account)", type: "text", optional: true },
      { key: "scopeRef", label: "Ref del ámbito (opcional)", type: "text", optional: true },
      { key: "role", label: "Rol del enlace (primary/replica/compute/storage/sync, opcional)", type: "text", optional: true },
    ],
  },
  {
    id: "vikunja",
    label: "Crear tarea en Vikunja",
    blurb:
      "Ejecuta la propuesta ya aprobada como tarea en el proyecto de su entidad (Vikunja no decide: solo ejecuta).",
    fields: [
      {
        key: "entidadTipo",
        label: "Tipo de entidad",
        type: "select",
        optional: true,
        options: [
          { value: "red", label: "Red" },
          { value: "grupo", label: "Grupo" },
          { value: "comunidad", label: "Comunidad" },
          { value: "pagina", label: "Página" },
          { value: "publicacion", label: "Publicación" },
          { value: "cerebro", label: "Cerebro" },
          { value: "personal", label: "Personal" },
        ],
      },
      { key: "entidadId", label: "ID de la entidad", type: "text", placeholder: "id o slug del ámbito", optional: true },
      { key: "entidadNombre", label: "Nombre de la entidad", type: "text", placeholder: "nombre visible", optional: true },
      { key: "sector", label: "Sector (opcional)", type: "text", placeholder: "p.ej. alimentación", optional: true },
    ],
  },
  {
    id: "custom",
    label: "Personalizado",
    blurb: "Registra un comando libre para revisión (Astraura o manual pueden ejecutarlo).",
    fields: [
      { key: "label", label: "Etiqueta", type: "text", placeholder: "Qué debe ocurrir" },
      { key: "spec", label: "Especificación", type: "textarea", placeholder: "Detalle del comando…" },
    ],
  },
];

export function commandTypeById(id: string): CommandTypeDef | undefined {
  return COMMAND_TYPES.find((c) => c.id === id);
}

// Contexto de ejecución: cliente supabase + identidad del actor.
export type ExecCtx = {
  supabase: any;
  userId: string | null;
  proposalId?: string;
  scope?: string;
  scopeRef?: string | null;
};

export type ExecResult = { ok: boolean; detail: string };

// ── Vikunja · ejecutar lo aprobado (nunca votar allí) ───────────────────
const TIPO_VIKUNJA_POR_SCOPE: Record<string, TipoEntidad> = {
  group: "grupo",
  page: "pagina",
  community: "comunidad",
  account: "personal",
  global: "red",
  message: "publicacion",
};

function tipoVikunja(valor: unknown, scope: unknown): TipoEntidad {
  const candidatos = [valor, TIPO_VIKUNJA_POR_SCOPE[String(scope ?? "")]];
  const validos: TipoEntidad[] = ["red", "grupo", "comunidad", "pagina", "publicacion", "cerebro", "personal"];
  return validos.find((t) => t === candidatos[0] || t === candidatos[1]) ?? "personal";
}

function entidadVikunja(p: Record<string, unknown>, ctx: ExecCtx): Entidad {
  const id = String(p.entidadId || ctx.scopeRef || ctx.userId || "personal").trim();
  const nombre = String(p.entidadNombre || p.name || ctx.scopeRef || "Mi espacio").trim();
  return { tipo: tipoVikunja(p.entidadTipo, p.scope || ctx.scope), id, nombre };
}

function decisionVikunja(p: Record<string, unknown>, ctx: ExecCtx): DecisionAprobada {
  const sector = typeof p.sector === "string" && p.sector.trim() ? p.sector.trim() : undefined;
  return {
    propuestaId: String(ctx.proposalId || p.propuestaId || "").trim(),
    titulo: String(p.titulo || p.label || "Mandato aprobado").trim(),
    aprobadaEn: String(p.aprobadaEn || new Date().toISOString()).trim(),
    ...(sector ? { sector } : {}),
  };
}

function credencialesVikunja(): { ok: true; base: string; token: string } | { ok: false; motivo: string } {
  const guardadas = connectorCredentials("vikunja-selfhost");
  const base =
    (guardadas?.fields.base || guardadas?.fields.endpoint || guardadas?.fields.url || "").trim() ||
    "http://localhost:3456/api/v1";
  const token = (guardadas?.fields.token || guardadas?.fields.apiKey || "").trim();
  if (!guardadas?.enabled) {
    return { ok: false, motivo: "Conecta Vikunja en el Hub de Conectores (dirección y token) antes de ejecutar la tarea." };
  }
  if (!token) return { ok: false, motivo: "Falta el token de Vikunja en el Hub de Conectores." };
  return { ok: true, base, token };
}

// Lee un valor de gobernanza existente y mezcla cambios (helper interno).
async function mergeGovParams(
  supabase: any,
  scope: string,
  scope_ref: string | null,
  mutate: (params: Record<string, unknown>) => Record<string, unknown>,
  extra?: { mode?: string; owner?: string | null },
): Promise<ExecResult> {
  try {
    const { data: existing } = await supabase
      .from("governance_configs")
      .select("id, mode, params")
      .eq("scope", scope)
      .eq("scope_ref", scope_ref ?? null)
      .maybeSingle();

    const baseParams = (existing?.params as Record<string, unknown>) ?? {};
    const nextParams = mutate({ ...baseParams });
    const row: Record<string, unknown> = {
      scope,
      scope_ref: scope_ref ?? null,
      mode: extra?.mode ?? existing?.mode ?? "democratic",
      params: nextParams,
      updated_at: new Date().toISOString(),
    };
    if (extra?.owner !== undefined) row.owner = extra.owner;

    const { error } = await supabase
      .from("governance_configs")
      .upsert(row, { onConflict: "scope,scope_ref" });
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "configuración aplicada" };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "error al aplicar configuración" };
  }
}

// Detecta si un error de PostgREST/Supabase indica que la función RPC todavía
// NO existe en este entorno (p.ej. la migración 20260801170000 aún no se ha
// aplicado). Defensivo: sólo reconoce señales positivas de "función ausente"
// (código PGRST202, o mensaje con "could not find the function" / "does not
// exist" / "schema cache", comparación insensible a mayúsculas); cualquier otro
// error (p.ej. propuesta no aprobada) NO cuenta como "ausente" — así nunca se
// confunde un error real de la RPC con un entorno pre-migración.
function isMissingRpcError(error: any): boolean {
  const haystack = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    haystack.includes("pgrst202") ||
    haystack.includes("could not find the function") ||
    haystack.includes("does not exist") ||
    haystack.includes("schema cache")
  );
}

// Ruta democrática (Adenda 127 · RLS de propiedad de governance_configs): si el
// comando viene de una propuesta APROBADA (ctx.proposalId presente), se intenta
// PRIMERO la función SECURITY DEFINER `gov_apply_approved_config`, que bypassea
// la nueva RLS de propiedad derivando el cambio del COMANDO YA ALMACENADO en la
// propuesta (fuente de verdad server-side), no de argumentos del cliente.
//   · Sin error de la RPC          → aplicado por la vía democrática.
//   · Error de "función ausente"   → entorno pre-migración: cae al camino
//     directo `mergeGovParams` (mismo comportamiento que hoy).
//   · Cualquier OTRO error de la RPC (p.ej. propuesta no aprobada, falta clave)
//     → se devuelve tal cual (fail-closed); NO se reintenta el camino directo,
//     porque la RLS de propiedad lo denegaría igual para un no-dueño.
//   · Sin ctx.proposalId (invocación directa fuera del flujo de propuestas) →
//     se mantiene el camino directo de siempre, sin tocar la RPC.
async function applyGovConfigViaRpcOrDirect(
  ctx: ExecCtx,
  directFn: () => Promise<ExecResult>,
): Promise<ExecResult> {
  if (!ctx.proposalId) return directFn();

  const { data, error } = await ctx.supabase.rpc("gov_apply_approved_config", {
    p_proposal_id: ctx.proposalId,
  });

  if (!error) {
    const mode = (data as any)?.mode;
    return {
      ok: true,
      detail: mode
        ? `configuración aplicada (democrática) · modo: ${mode}`
        : "configuración aplicada (democrática)",
    };
  }

  if (isMissingRpcError(error)) return directFn();

  return { ok: false, detail: error?.message ?? "error al aplicar configuración" };
}

// Ejecutor principal. Cada handler es tolerante (try/catch); tipo desconocido → no soportado.
export async function executeCommand(spec: CommandSpec | null, ctx: ExecCtx): Promise<ExecResult> {
  if (!spec || !spec.type || spec.type === "none") {
    return { ok: true, detail: "sin comando: decisión registrada" };
  }
  const supabase = ctx.supabase;
  const p = (spec.payload ?? {}) as Record<string, any>;

  try {
    switch (spec.type) {
      case "publish": {
        const content = p.content;
        const { error } = await supabase.from("posts").insert({
          author_id: ctx.userId,
          type: p.postType || "text",
          content: typeof content === "string" ? { text: content } : content ?? {},
          visibility: p.visibility || "public",
        });
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: "publicación creada" };
      }

      case "update_publication": {
        if (!p.postId) return { ok: false, detail: "falta postId" };
        const content = p.content;
        const { error } = await supabase
          .from("posts")
          .update({ content: typeof content === "string" ? { text: content } : content ?? {} })
          .eq("id", p.postId);
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: "publicación actualizada" };
      }

      case "set_governance": {
        const scope = p.scope || ctx.scope;
        const scope_ref = p.scope_ref ?? ctx.scopeRef ?? null;
        if (!scope) return { ok: false, detail: "falta ámbito" };
        const res = await applyGovConfigViaRpcOrDirect(ctx, () =>
          mergeGovParams(
            supabase,
            scope,
            scope_ref,
            (params) => ({ ...params, ...(p.params || {}) }),
            { mode: p.mode, owner: ctx.userId },
          ),
        );
        // Para páginas/comunidades, reflejar en pages.governance (best-effort).
        if ((scope === "page" || scope === "community") && scope_ref) {
          try {
            await supabase
              .from("pages")
              .update({ governance: { mode: p.mode ?? "democratic", params: p.params ?? {} } })
              .eq("id", scope_ref);
          } catch {
            /* best-effort */
          }
        }
        return res;
      }

      case "set_config": {
        const scope = p.scope || ctx.scope;
        const scope_ref = p.scope_ref ?? ctx.scopeRef ?? null;
        if (!scope || !p.key) return { ok: false, detail: "faltan ámbito o clave" };
        return await applyGovConfigViaRpcOrDirect(ctx, () =>
          mergeGovParams(supabase, scope, scope_ref, (params) => {
            const config = { ...((params.config as Record<string, unknown>) ?? {}) };
            config[p.key] = p.value;
            return { ...params, config };
          }),
        );
      }

      case "set_permission": {
        const scope = p.scope || ctx.scope;
        const scope_ref = p.scope_ref ?? ctx.scopeRef ?? null;
        if (!scope || !p.permission) return { ok: false, detail: "faltan ámbito o permiso" };
        return await applyGovConfigViaRpcOrDirect(ctx, () =>
          mergeGovParams(supabase, scope, scope_ref, (params) => {
            const permissions = { ...((params.permissions as Record<string, unknown>) ?? {}) };
            permissions[p.permission] = p.value;
            return { ...params, permissions };
          }),
        );
      }

      case "create_page": {
        const { error } = await supabase
          .from("pages")
          .insert({ type: p.type || "page", title: p.title || "Nueva página" });
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: "página creada" };
      }

      case "add_member": {
        const scope = p.scope || ctx.scope;
        const scope_ref = p.scope_ref ?? ctx.scopeRef ?? null;
        if (!scope_ref || !p.profileId) return { ok: false, detail: "faltan referencia o perfil" };
        if (scope === "group") {
          const { error } = await supabase
            .from("group_members")
            .insert({ group_id: scope_ref, member: p.profileId, role: p.role || "member" });
          if (error) return { ok: false, detail: error.message };
        } else {
          const { error } = await supabase
            .from("page_members")
            .insert({ page_id: scope_ref, profile_id: p.profileId, role: p.role || "member" });
          if (error) return { ok: false, detail: error.message };
        }
        return { ok: true, detail: "miembro añadido" };
      }

      case "create_memory": {
        if (!ctx.userId) return { ok: false, detail: "se requiere sesión" };
        const kinds =
          typeof p.kinds === "string"
            ? p.kinds.split(",").map((s: string) => s.trim()).filter(Boolean)
            : Array.isArray(p.kinds)
              ? p.kinds
              : ["memory"];
        const { error } = await supabase.from("memories").insert({
          owner: ctx.userId,
          name: p.name || "Memoria",
          content: typeof p.content === "string" ? p.content : JSON.stringify(p.content ?? {}),
          kinds,
          format: "text",
        });
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: "memoria creada" };
      }

      case "update_memory": {
        if (!p.id) return { ok: false, detail: "falta id de memoria" };
        const { error } = await supabase
          .from("memories")
          .update({ content: typeof p.content === "string" ? p.content : JSON.stringify(p.content ?? {}) })
          .eq("id", p.id);
        if (error) return { ok: false, detail: error.message };
        return { ok: true, detail: "memoria actualizada" };
      }

      case "deploy": {
        const target = p.target;
        if (target === "server") {
          const { data, error } = await supabase
            .from("brain_servers")
            .insert({
              owner: ctx.userId,
              name: p.name,
              kind: p.kind,
              endpoint: p.endpoint,
              key_ref: p.keyRef,
              config: { deployedBy: "governance", scope: p.scope, scope_ref: p.scopeRef },
              shared: true,
            })
            .select("id")
            .single();
          if (error) return { ok: false, detail: error.message };
          if (p.brainId && data?.id) {
            const { error: linkError } = await supabase
              .from("brain_server_links")
              .insert({
                brain_id: p.brainId,
                server_id: data.id,
                owner: ctx.userId,
                role: p.role || "primary",
              });
            if (linkError) return { ok: false, detail: linkError.message };
          }
          return { ok: true, detail: "Servidor conectado: " + p.name };
        }
        if (target === "datastore") {
          const { error } = await supabase.from("storage_backends").insert({
            owner: ctx.userId,
            name: p.name,
            kind: p.kind,
            scope: p.scope || "account",
            scope_ref: p.scopeRef || null,
            config: { endpoint: p.endpoint, keyRef: p.keyRef, deployedBy: "governance" },
            enabled: true,
          });
          if (error) return { ok: false, detail: error.message };
          return { ok: true, detail: "Datastore conectado: " + p.name };
        }
        return { ok: false, detail: "target inválido (server/datastore)" };
      }

      case "vikunja": {
        const cred = credencialesVikunja();
        if (!cred.ok) return { ok: false, detail: cred.motivo };
        let tituloPropuesta = String(p.titulo || p.label || "").trim();
        if (!tituloPropuesta && ctx.proposalId) {
          const { data: propuesta } = await supabase
            .from("proposals")
            .select("title")
            .eq("id", ctx.proposalId)
            .maybeSingle();
          tituloPropuesta = String(propuesta?.title ?? "").trim();
        }
        const entidad = entidadVikunja(p, ctx);
        const decision = decisionVikunja({ ...p, titulo: tituloPropuesta || p.titulo }, ctx);
        const vikunja = clienteVikunja((url, init) => fetch(url, init));
        const proyecto = await vikunja.asegurarProyecto(cred.base, cred.token, entidad);
        if (!proyecto.ok) return { ok: false, detail: proyecto.motivo };
        const tarea = await vikunja.tareaDesdeDecision(cred.base, cred.token, proyecto.id, decision);
        if (!tarea.ok) return { ok: false, detail: tarea.motivo };
        const titulo = tituloProyecto(entidad);
        const resumen = descripcionTarea(decision).split("\n")[0];
        return {
          ok: true,
          detail: `Tarea ${tarea.id} creada en «${titulo}»${proyecto.creado ? " (proyecto nuevo)" : ""}. ${resumen}`,
        };
      }

      case "custom": {
        return { ok: true, detail: "registrado para revisión" };
      }

      default:
        return { ok: false, detail: "comando no soportado" };
    }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "error al ejecutar el comando" };
  }
}
