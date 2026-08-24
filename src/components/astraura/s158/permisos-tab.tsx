"use client";

/**
 * STUDIO 1.58 · Permisos — la sala de GOBIERNO de permisos y accesos del
 * sistema 1.58 dentro del OS (Ola 5 · Adenda 157; SOP
 * `architecture/astraura-158-ola5-orquestacion.md` §4): panorama accionable,
 * solicitudes pendientes de aprobación (con el embargo del orquestador),
 * permisos por tipo de proceso, por agente de la bóveda y por personalidad,
 * accesos del dispositivo (universal, air-gap, sensores) y permisos por
 * neurona sobre cada cerebro.
 * ----------------------------------------------------------------------------
 * Nada se simula: cada control llama al endpoint real y recarga. Honestidad
 * ante todo — si el backend no expone permisos para una entidad (agente,
 * personalidad) esta pestaña lo dice explícitamente; y como no hay endpoint
 * de LECTURA para los permisos por neurona de un cerebro (solo escritura),
 * el editor de «Cerebros» lo declara en vez de fingir un estado guardado.
 * Refresco cada 20 s (`useS158Load`); acciones con `runS158` + `useBusy`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot, Brain, Check, CheckCheck, ExternalLink, Inbox, KeyRound, MonitorSmartphone, Play, RefreshCw, Save, Settings2,
  Shield, ShieldAlert, ShieldCheck, ShieldOff, Unlock, Users, Waypoints, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { openAstraura158Window } from "@/components/astraura/window/astraura-158-window-bus";
import {
  applyAllAstraura158Proposals, astraura158Endpoint, autoLinkAstraura158Synapses, fetchAstraura158AgentApiStatus,
  fetchAstraura158AuthOrchestrator, fetchAstraura158ImaginationStatus, fetchAstraura158Manifest, fetchAstraura158PersonalityApiStatus,
  fetchAstraura158Privacy, fetchAstraura158ProcessTypes, fetchAstraura158UniversalDeviceAccess, fetchAstraura158VaultAgents,
  grantAllAstraura158Requests, grantAstraura158Request, grantAstraura158UniversalDeviceAccess, imaginationAstraura158Action,
  setAstraura158AuthOrchestratorAuto, toggleAstraura158AirGap, updateAstraura158AgentPermissions, updateAstraura158BrainNeuronPermissions,
  updateAstraura158PersonalityPermissions, updateAstraura158Privacy, updateAstraura158ProcessConfig, updateAstraura158ProcessPolicy,
  type Astraura158Agent, type Astraura158Branch, type Astraura158Brain, type Astraura158Personality, type Astraura158PermissionPolicy,
  type Astraura158PrivacySettings, type Astraura158ProcessType, type Astraura158Response, type Astraura158Target,
  type Astraura158VaultAgentImagination,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, LABEL, MONO, PERMISSION_LABEL, PERMISSION_LEVEL_IDS, SELECT, SUB,
  SectionTitle, Stat, fmtAgo, fmtTs, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

const REFRESH_MS = 20_000;

/** Heurística de gobierno (no una categoría del backend): ¿algún permiso ACTIVO de este mapa suena a control elevado por el NOMBRE de su clave? Se declara así en la UI — nunca se presenta como un dato del backend. */
const ELEVATED_PERMISSION_RE = /admin|root|sudo|superuser|full[_-]?access|unrestricted|elevated|override|bypass|system[_-]?control|deploy|danger/i;

/** Mismas 12 banderas que gobierna `sentidos-tab.tsx` (Ola 4) — se repiten aquí porque esta sala es la de GOBIERNO de accesos, no la del sensorium en vivo; ese archivo no exporta la lista. */
const DEVICE_PRIVACY_FLAGS: { key: keyof Astraura158PrivacySettings & string; label: string }[] = [
  { key: "allow_gps_location", label: "ubicación GPS" },
  { key: "allow_weather_sync", label: "clima" },
  { key: "allow_microphone_stream", label: "micrófono" },
  { key: "allow_camera_access", label: "cámara" },
  { key: "allow_compass_orientation", label: "brújula" },
  { key: "allow_gyroscope_motion", label: "giroscopio" },
  { key: "allow_hardware_telemetry", label: "telemetría del hardware" },
  { key: "allow_external_web_search", label: "búsqueda web externa" },
  { key: "allow_cloud_sync", label: "sincronización en la nube" },
  { key: "allow_sensory_imagination", label: "imaginación sensorial" },
  { key: "allow_persistent_logging", label: "registro persistente" },
  { key: "anonymize_network_ips", label: "anonimizar IPs" },
];

/* ── Tipos locales ─────────────────────────────────────────────────────────── */

type PermissionMap = Record<string, boolean | string | number>;
type WrapFn = (label: string, fn: () => Promise<unknown>) => Promise<void>;
type AfterFn = () => Promise<void>;

interface AgentPermRow {
  agent: Astraura158Agent & Astraura158VaultAgentImagination;
  permissions: PermissionMap;
  source: "api_status" | "fallback" | "none";
}

interface PersonaPermRow {
  persona: Astraura158Personality;
  permissions: PermissionMap;
  source: "api_status" | "fallback" | "none";
}

/* ── Utilidades puras ──────────────────────────────────────────────────────── */

/** Extrae `.permissions` de un objeto arbitrario del backend como mapa clave→valor primitivo. Nunca lanza; `{}` si no hay nada usable. */
function readPermissionsRecord(source: unknown): PermissionMap {
  if (!source || typeof source !== "object") return {};
  const raw = (source as Record<string, unknown>).permissions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PermissionMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

/** Etiqueta legible a partir de una clave real del backend (formatea; no traduce ni inventa). */
function labelFromKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function hasElevatedPermission(perm: PermissionMap | null | undefined): boolean {
  if (!perm) return false;
  return Object.entries(perm).some(([k, v]) => v === true && ELEVATED_PERMISSION_RE.test(k));
}

/** Pendiente = requiere tu aprobación y aún no se resolvió, O el backend la marcó ya en cola de aprobación. */
function isPendingApproval(b: Astraura158Branch): boolean {
  const status = String(b.status ?? "").toLowerCase();
  if (status === "pending_approval") return true;
  if (!b.requires_user_approval) return false;
  return !/applied|discarded|rejected|done/i.test(status);
}

function branchGeneratedBy(b: Astraura158Branch): "llm" | "template" | undefined {
  const v = (b as unknown as Record<string, unknown>).generated_by;
  return v === "llm" ? "llm" : v === "template" ? "template" : undefined;
}

/** Valor honesto de una tarjeta de Panorama: número si ya cargó, «…» cargando, «—» sin conexión. */
function fmtStat(loaded: boolean, loading: boolean, value: number): string | number {
  if (loaded) return value;
  return loading ? "…" : "—";
}

/* ── Cargadores compuestos (para `useS158Load`) ───────────────────────────── */

async function loadProcessTypesList(target: Astraura158Target): Promise<Astraura158Response<Astraura158ProcessType[]>> {
  const r = await fetchAstraura158ProcessTypes(target);
  if (!r.ok) return r;
  return { ok: true, data: r.data.process_types ?? [], target: r.target, endpoint: r.endpoint };
}

/** Bóveda + estado de API por agente (en paralelo). Si un agente no expone `permissions` en su api_status, cae a su propio campo `permissions` (si lo trae); si tampoco, queda honestamente vacío. */
async function loadAgentPermissionRows(target: Astraura158Target): Promise<Astraura158Response<AgentPermRow[]>> {
  const list = await fetchAstraura158VaultAgents(target);
  if (!list.ok) return list;
  const agents = list.data.agents ?? [];
  const statuses = await Promise.all(agents.map((a) => fetchAstraura158AgentApiStatus(target, a.id)));
  const rows: AgentPermRow[] = agents.map((a, i) => {
    const st = statuses[i];
    const fromStatus = st.ok ? readPermissionsRecord(st.data.detail) : {};
    if (Object.keys(fromStatus).length > 0) return { agent: a, permissions: fromStatus, source: "api_status" };
    const fromAgent = readPermissionsRecord(a);
    if (Object.keys(fromAgent).length > 0) return { agent: a, permissions: fromAgent, source: "fallback" };
    return { agent: a, permissions: {}, source: "none" };
  });
  return { ok: true, data: rows, target: list.target, endpoint: list.endpoint };
}

export function PermisosTab({ target, manifest, refresh }: S158TabProps) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();

  const { data: imagData, error: imagError, loading: imagLoading, reload: imagReload } = useS158Load(fetchAstraura158ImaginationStatus, target, REFRESH_MS);
  const { data: authData, error: authError, loading: authLoading, reload: authReload } = useS158Load(fetchAstraura158AuthOrchestrator, target, REFRESH_MS);
  const { data: procTypes, error: procTypesError, loading: procTypesLoading, reload: procTypesReload } = useS158Load(loadProcessTypesList, target, REFRESH_MS);
  const { data: manifestData, error: manifestFetchError, loading: manifestFetchLoading, reload: manifestReload } = useS158Load(fetchAstraura158Manifest, target, REFRESH_MS);
  const { data: agentRows, error: agentError, loading: agentLoading, reload: agentReload } = useS158Load(loadAgentPermissionRows, target, REFRESH_MS);
  const { data: privacyData, error: privacyError, loading: privacyLoading, reload: privacyReload } = useS158Load(fetchAstraura158Privacy, target, REFRESH_MS);
  const { data: udaData, error: udaError, loading: udaLoading, reload: udaReload } = useS158Load(fetchAstraura158UniversalDeviceAccess, target, REFRESH_MS);

  // Prioriza el manifiesto PROPIO de esta pestaña (fresco cada 20 s) y cae al de
  // props solo mientras el propio aún no respondió — evita el parpadeo inicial.
  const effectiveManifest = manifestData ?? manifest ?? null;

  const effectiveManifestRef = useRef(effectiveManifest);
  useEffect(() => { effectiveManifestRef.current = effectiveManifest; }, [effectiveManifest]);

  const loadPersonaPermissionRows = useCallback(async (t: Astraura158Target): Promise<Astraura158Response<PersonaPermRow[]>> => {
    const personas = effectiveManifestRef.current?.personalities ?? [];
    const statuses = await Promise.all(personas.map((p) => fetchAstraura158PersonalityApiStatus(t, p.id)));
    const rows: PersonaPermRow[] = personas.map((p, i) => {
      const st = statuses[i];
      const fromStatus = st.ok ? readPermissionsRecord(st.data.detail) : {};
      if (Object.keys(fromStatus).length > 0) return { persona: p, permissions: fromStatus, source: "api_status" };
      const fromPersona = readPermissionsRecord(p);
      if (Object.keys(fromPersona).length > 0) return { persona: p, permissions: fromPersona, source: "fallback" };
      return { persona: p, permissions: {}, source: "none" };
    });
    return { ok: true, data: rows, target: t, endpoint: astraura158Endpoint(t) };
  }, []);

  const { data: personaRows, error: personaError, loading: personaLoading, reload: personaReload } = useS158Load(loadPersonaPermissionRows, target, REFRESH_MS);

  // Cuando el manifiesto (propio o de props) trae una lista nueva de personas, re-deriva sus permisos sin esperar al próximo ciclo de 20 s.
  useEffect(() => { if (effectiveManifest) void personaReload(true); }, [effectiveManifest, personaReload]);

  const pendingBranches = useMemo(() => (imagData?.branches ?? []).filter(isPendingApproval), [imagData]);
  const alwaysAskCount = useMemo(
    () => (procTypes ?? []).filter((p) => (p.permission_policy?.level ?? p.default_permission_level) === "always_ask").length,
    [procTypes],
  );
  const elevatedAgentsCount = useMemo(() => (agentRows ?? []).filter((r) => hasElevatedPermission(r.permissions)).length, [agentRows]);
  const airGapActive = !!(privacyData?.air_gap_active ?? privacyData?.settings?.strict_air_gap_mode);

  const pendingRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const goPending = useCallback(() => { pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); pendingRef.current?.focus({ preventScroll: true }); }, []);
  const goProcess = useCallback(() => { processRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); processRef.current?.focus({ preventScroll: true }); }, []);
  const goAgents = useCallback(() => { agentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); agentRef.current?.focus({ preventScroll: true }); }, []);
  const goDevice = useCallback(() => { deviceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); deviceRef.current?.focus({ preventScroll: true }); }, []);

  // Reacciones tras una acción: las «grandes» (afectan badges del OS) también llaman a `refresh()`; las de detalle solo recargan su propia sección.
  const afterPending = useCallback(async () => { await imagReload(true); await refresh(); }, [imagReload, refresh]);
  const afterAuth = useCallback(async () => { await authReload(true); }, [authReload]);
  const afterProcTypes = useCallback(async () => { await procTypesReload(true); }, [procTypesReload]);
  const afterAgents = useCallback(async () => { await agentReload(true); }, [agentReload]);
  const afterPersonas = useCallback(async () => { await personaReload(true); }, [personaReload]);
  const afterPrivacy = useCallback(async () => { await privacyReload(true); }, [privacyReload]);
  const afterUda = useCallback(async () => { await udaReload(true); await refresh(); }, [udaReload, refresh]);

  return (
    <div className="space-y-3">
      {/* 1 · Panorama */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={ShieldCheck} title="Panorama de permisos y accesos" tone="text-amber-300"
          hint="Gobierno del sistema 1.58: qué espera tu aprobación, qué procesos preguntan siempre, qué agentes tienen permisos elevados y si el air-gap corta la red." />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PanoramaLink onClick={goPending} ariaLabel="Ir a solicitudes pendientes">
            <Stat label="Solicitudes pendientes" value={fmtStat(!!imagData, imagLoading, pendingBranches.length)}
              hint={imagData ? `${imagData.total_proposals_count ?? (imagData.branches ?? []).length} propuestas en total` : (imagError || "sin conexión")} />
          </PanoramaLink>
          <PanoramaLink onClick={goProcess} ariaLabel="Ir a permisos por proceso">
            <Stat label="«Preguntar siempre»" value={fmtStat(!!procTypes, procTypesLoading, alwaysAskCount)}
              hint={procTypes ? `de ${procTypes.length} tipos de proceso` : (procTypesError || "sin conexión")} />
          </PanoramaLink>
          <PanoramaLink onClick={goAgents} ariaLabel="Ir a permisos por agente">
            <Stat label="Agentes con permisos elevados" value={fmtStat(!!agentRows, agentLoading, elevatedAgentsCount)}
              hint={agentRows ? `de ${agentRows.length} agentes · heurística por nombre de clave` : (agentError || "sin conexión")} />
          </PanoramaLink>
          <PanoramaLink onClick={goDevice} ariaLabel="Ir a accesos del dispositivo">
            <Stat label="Air-gap" value={privacyData ? (airGapActive ? "ACTIVO" : "inactivo") : (privacyLoading ? "…" : "—")}
              hint={privacyData ? undefined : (privacyError || "sin conexión")} />
          </PanoramaLink>
        </div>
      </div>

      {/* 2 · Solicitudes pendientes */}
      <div ref={pendingRef} tabIndex={-1} className={cn(CARD, "scroll-mt-4 p-3 outline-none")}>
        <SectionTitle icon={Inbox} title={`Solicitudes pendientes (${pendingBranches.length})`} tone="text-violet-300"
          hint="Ramas que requieren tu aprobación o están en cola de aprobación. Lo más accionable de esta sala."
          right={<>
            <button type="button" className={BTN} disabled={busy !== "" || pendingBranches.length === 0} aria-label="Conceder todas las solicitudes pendientes"
              onClick={() => { void wrap("grant_all", () => runS158("Solicitudes concedidas", () => grantAllAstraura158Requests(target), { description: (d) => `${d.granted_count ?? 0} concedida(s)`, after: afterPending })); }}>
              <BusyIcon busy={busy === "grant_all"} icon={ShieldCheck} /> Conceder todas
            </button>
            <button type="button" className={BTN} disabled={busy !== "" || pendingBranches.length === 0} aria-label="Aplicar todas las propuestas seguras"
              onClick={() => { void wrap("apply_all", () => runS158("Propuestas aplicadas", () => applyAllAstraura158Proposals(target), { description: (d) => `${d.applied_count ?? 0} aplicada(s)`, after: afterPending })); }}>
              <BusyIcon busy={busy === "apply_all"} icon={CheckCheck} /> Aplicar todas las seguras
            </button>
            <button type="button" className={BTN} onClick={() => { void imagReload(); }} aria-label="Recargar solicitudes pendientes">
              <RefreshCw className={cn("h-3 w-3", imagLoading && "animate-spin")} aria-hidden="true" />
            </button>
          </>} />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/75">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            Orquestador de autorizaciones{authData?.agent_name ? ` · ${authData.agent_name}` : ""}
            {authData?.requests_embargoed && <Badge tone="border-rose-400/40 bg-rose-500/15 text-rose-100">solicitudes embargadas</Badge>}
            {authData?.draining_mode && <Badge tone="border-amber-400/40 bg-amber-500/15 text-amber-100">drenando cola</Badge>}
            {!authData && <Empty loading={authLoading} error={authError} text="Sin orquestador de autorizaciones." />}
          </div>
          {authData && (
            <label className="flex items-center gap-2 text-[11px] text-white/80">
              modo automático
              <Switch checked={!!authData.auto_mode} disabled={busy !== ""} aria-label="Modo automático del orquestador de autorizaciones"
                onCheckedChange={(v) => { void wrap("auth_auto", () => runS158(v ? "Orquestador en automático" : "Orquestador manual", () => setAstraura158AuthOrchestratorAuto(target, v), { after: afterAuth })); }} />
            </label>
          )}
        </div>

        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {!imagData && <Empty loading={imagLoading} error={imagError} text="El backend no expone la imaginación." />}
          {imagData && pendingBranches.length === 0 && <Empty text="No hay solicitudes pendientes de aprobación." />}
          {pendingBranches.map((b) => <PendingBranchCard key={b.id} b={b} target={target} busy={busy} wrap={wrap} after={afterPending} />)}
        </div>
      </div>

      {/* 3 · Permisos por proceso */}
      <div ref={processRef} tabIndex={-1} className={cn(CARD, "scroll-mt-4 p-3 outline-none")}>
        <SectionTitle icon={Settings2} title={`Permisos por proceso (${procTypes?.length ?? 0})`} tone="text-sky-300"
          hint="Nivel de permiso, avisos y sincronización de agentes por tipo de proceso; reanuda el que quedó pausado por límite."
          right={<button type="button" className={BTN} onClick={() => { void procTypesReload(); }} aria-label="Recargar tipos de proceso"><RefreshCw className={cn("h-3 w-3", procTypesLoading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {!procTypes && <Empty loading={procTypesLoading} error={procTypesError} text="Sin catálogo de procesos." />}
          {procTypes && procTypes.length === 0 && <Empty text="El backend no expone tipos de proceso." />}
          {(procTypes ?? []).map((p) => <ProcessPolicyCard key={p.id} p={p} target={target} busy={busy} wrap={wrap} after={afterProcTypes} />)}
        </div>
      </div>

      {/* 4 · Permisos por agente */}
      <div ref={agentRef} tabIndex={-1} className={cn(CARD, "scroll-mt-4 p-3 outline-none")}>
        <SectionTitle icon={Bot} title={`Permisos por agente (${agentRows?.length ?? 0})`} tone="text-cyan-300"
          hint="Permisos granulares reales de cada agente de la bóveda; si su estado de API no trae permisos, se usan los del propio agente."
          right={<button type="button" className={BTN} onClick={() => { void agentReload(); }} aria-label="Recargar agentes"><RefreshCw className={cn("h-3 w-3", agentLoading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {!agentRows && <Empty loading={agentLoading} error={agentError} text="Sin agentes de la bóveda." />}
          {agentRows && agentRows.length === 0 && <Empty text="La bóveda no tiene agentes." />}
          {(agentRows ?? []).map((r) => <AgentPermCard key={r.agent.id} row={r} target={target} busy={busy} wrap={wrap} after={afterAgents} />)}
        </div>
      </div>

      {/* 5 · Permisos por personalidad */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Users} title={`Permisos por personalidad (${personaRows?.length ?? 0})`} tone="text-fuchsia-300"
          hint="Lo mismo que por agente, para las personalidades del manifiesto."
          right={<button type="button" className={BTN} onClick={() => { void manifestReload(); }} aria-label="Recargar personalidades">
            <RefreshCw className={cn("h-3 w-3", (manifestFetchLoading || personaLoading) && "animate-spin")} aria-hidden="true" />
          </button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {!effectiveManifest && <Empty loading={manifestFetchLoading} error={manifestFetchError} text="Esperando el manifiesto del sistema 1.58." />}
          {effectiveManifest && (effectiveManifest.personalities ?? []).length === 0 && <Empty text="El manifiesto no expone personalidades." />}
          {effectiveManifest && (effectiveManifest.personalities ?? []).length > 0 && !personaRows && <Empty loading={personaLoading} error={personaError} text="Cargando permisos de personalidades." />}
          {(personaRows ?? []).map((r) => <PersonaPermCard key={r.persona.id} row={r} target={target} busy={busy} wrap={wrap} after={afterPersonas} />)}
        </div>
      </div>

      {/* 6 · Accesos del dispositivo */}
      <div ref={deviceRef} tabIndex={-1} className={cn(CARD, "scroll-mt-4 p-3 outline-none")}>
        <SectionTitle icon={MonitorSmartphone} title="Accesos del dispositivo" tone={airGapActive ? "text-rose-300" : "text-emerald-300"}
          hint="Acceso universal al dispositivo, air-gap y los sensores/privacidad que la imaginación puede usar." />

        <div className={cn(SUB, "mt-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2")}>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/85"><KeyRound className="h-3.5 w-3.5 text-white/50" aria-hidden="true" /> Acceso universal al dispositivo</p>
            {!udaData && <Empty loading={udaLoading} error={udaError} text="Sin estado de acceso universal." />}
            {udaData && (
              <p className="mt-0.5 text-[10px] text-white/55">
                {(udaData.granted || udaData.enabled) ? "concedido" : "no concedido"}
                {udaData.scope ? ` · alcance ${udaData.scope}` : ""}
                {udaData.granted_at ? ` · ${fmtTs(udaData.granted_at)}` : ""}
              </p>
            )}
            {udaData?.message && <p className="mt-0.5 text-[10px] text-white/45">{udaData.message}</p>}
          </div>
          <button type="button" className={(udaData?.granted || udaData?.enabled) ? BTN : BTN_PRIMARY} disabled={busy !== ""}
            aria-label={(udaData?.granted || udaData?.enabled) ? "Renovar acceso universal al dispositivo" : "Conceder acceso universal al dispositivo"}
            onClick={() => {
              void wrap("uda", async () => {
                const ok = await confirm({
                  title: "¿Conceder acceso universal al dispositivo?",
                  description: "El backend soberano podrá leer y operar sobre los recursos del dispositivo según el alcance que él mismo determine. Puedes revisarlo después desde el Explorador del Dispositivo.",
                  confirmText: "Conceder acceso", cancelText: "Cancelar",
                });
                if (!ok) return;
                await runS158("Acceso universal concedido", () => grantAstraura158UniversalDeviceAccess(target), { description: (d) => d.message, after: afterUda });
              });
            }}>
            <BusyIcon busy={busy === "uda"} icon={Unlock} /> {(udaData?.granted || udaData?.enabled) ? "Renovar acceso" : "Conceder acceso universal"}
          </button>
        </div>

        <div className={cn(SUB, "mt-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2", airGapActive && "border-rose-400/30")}>
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-white/85">
            {airGapActive ? <ShieldOff className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" /> : <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />}
            Air-gap {airGapActive ? "ACTIVO" : "inactivo"}
            <span className="text-[10px] font-normal text-white/50">— corta web, nube y sensores externos: solo modelo y memoria locales.</span>
          </p>
          <button type="button" className={airGapActive ? BTN : BTN_PRIMARY} disabled={busy !== "" || !privacyData} aria-label={airGapActive ? "Desactivar air-gap" : "Activar air-gap"}
            onClick={() => { void wrap("airgap", () => runS158(airGapActive ? "Air-gap desactivado" : "Air-gap activado", () => toggleAstraura158AirGap(target, !airGapActive), { after: afterPrivacy })); }}>
            <BusyIcon busy={busy === "airgap"} icon={airGapActive ? ShieldOff : Shield} /> {airGapActive ? "Desactivar" : "Activar air-gap"}
          </button>
        </div>

        <div className="mt-2">
          <p className={cn(LABEL, "mb-1.5")}>Sensores y privacidad</p>
          {!privacyData && <Empty loading={privacyLoading} error={privacyError} text="Sin ajustes de privacidad." />}
          {privacyData && (
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {DEVICE_PRIVACY_FLAGS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-[11px] text-white/80">
                  <Switch checked={!!privacyData.settings?.[f.key]} disabled={busy !== "" || airGapActive} aria-label={`Permitir ${f.label}`}
                    onCheckedChange={(v) => { void wrap(`priv:${f.key}`, () => runS158(`Privacidad: ${f.label} ${v ? "permitido" : "bloqueado"}`, () => updateAstraura158Privacy(target, { ...(privacyData.settings ?? {}), [f.key]: v }), { after: afterPrivacy })); }} />
                  {f.label}
                </label>
              ))}
            </div>
          )}
          {privacyData && <p className={cn(MONO, "mt-1.5")}>{privacyData.protected_sensors_count ?? 0} sensores protegidos</p>}
        </div>
      </div>

      {/* 7 · Cerebros */}
      <CerebrosCard target={target} brains={effectiveManifest?.brains ?? []} busy={busy} wrap={wrap} />
    </div>
  );
}

export default PermisosTab;

/* ── Subcomponentes ────────────────────────────────────────────────────────── */

function PanoramaLink({ onClick, ariaLabel, children }: { onClick: () => void; ariaLabel: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel}
      className="w-full cursor-pointer rounded-lg text-left outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-cyan-400/50">
      {children}
    </button>
  );
}

function PendingBranchCard({ b, target, busy, wrap, after }: { b: Astraura158Branch; target: Astraura158Target; busy: string; wrap: WrapFn; after: AfterFn }) {
  const gen = branchGeneratedBy(b);
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={b.theme}>{b.theme ?? b.id}</p>
        {b.process_name && <Badge tone="border-white/10 text-white/60">{b.process_name}</Badge>}
        {b.importance_level && <Badge tone={levelTone(b.importance_level)}>{b.importance_level}</Badge>}
        {gen && <Badge tone={gen === "llm" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>{gen === "llm" ? "modelo real" : "plantilla"}</Badge>}
      </div>
      {b.hypothesis && <p className="text-[10px] leading-snug text-white/70"><span className="text-white/40">Hipótesis · </span>{b.hypothesis}</p>}
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className={MONO}>{b.formatted_time ?? fmtAgo(b.timestamp)}</p>
        <div className="flex gap-1">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Conceder y aplicar ${b.theme ?? b.id}`}
            onClick={() => { void wrap(`grant:${b.id}`, () => runS158("Solicitud concedida y aplicada", () => grantAstraura158Request(target, b.id), { after })); }}>
            <BusyIcon busy={busy === `grant:${b.id}`} icon={Check} /> Conceder y aplicar
          </button>
          <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Descartar ${b.theme ?? b.id}`}
            onClick={() => { void wrap(`discard:${b.id}`, () => runS158("Solicitud descartada", () => imaginationAstraura158Action(target, b.id, "branch", "discard"), { after })); }}>
            <BusyIcon busy={busy === `discard:${b.id}`} icon={X} /> Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessPolicyCard({ p, target, busy, wrap, after }: { p: Astraura158ProcessType; target: Astraura158Target; busy: string; wrap: WrapFn; after: AfterFn }) {
  const level = p.permission_policy?.level ?? p.default_permission_level ?? "always_ask";
  const policy = p.permission_policy ?? {};
  const setPolicy = (patch: Partial<Astraura158PermissionPolicy>, label: string) => {
    const key = Object.keys(patch)[0] ?? "policy";
    void wrap(`pol:${p.id}:${key}`, () => runS158(label, () => updateAstraura158ProcessPolicy(target, p.id, { ...policy, ...patch }), { after }));
  };
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "#a855f7", boxShadow: `0 0 8px ${p.color ?? "#a855f7"}` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{p.icon ? `${p.icon} ` : ""}{p.name}</p>
        {p.is_auto_paused_by_limit && <Badge tone="border-amber-400/30 text-amber-200">pausado por límite</Badge>}
      </div>
      {p.description && <p className="line-clamp-2 text-[10px] leading-snug text-white/55">{p.description}</p>}
      <label className="flex items-center gap-1 text-[10px] text-white/60">
        <ShieldCheck className="h-3 w-3 text-white/40" aria-hidden="true" /> permisos
        <select className={cn(SELECT, "py-0.5")} value={PERMISSION_LEVEL_IDS.includes(level as (typeof PERMISSION_LEVEL_IDS)[number]) ? level : "always_ask"}
          disabled={busy !== ""} aria-label={`Nivel de permisos de ${p.name}`}
          onChange={(e) => setPolicy({ level: e.target.value }, `${p.name}: política ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`)}>
          {PERMISSION_LEVEL_IDS.map((id) => <option key={id} value={id}>{PERMISSION_LABEL[id] ?? id}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-1.5 text-[10px] text-white/70">
          <Switch checked={!!policy.notify_on_important} disabled={busy !== ""} aria-label={`Avisar si ${p.name} genera algo importante`}
            onCheckedChange={(v) => setPolicy({ notify_on_important: v }, v ? "Avisos importantes activados" : "Avisos importantes desactivados")} />
          avisar si es importante
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-white/70">
          <Switch checked={!!policy.notify_on_security} disabled={busy !== ""} aria-label={`Avisar si ${p.name} genera algo de seguridad`}
            onCheckedChange={(v) => setPolicy({ notify_on_security: v }, v ? "Avisos de seguridad activados" : "Avisos de seguridad desactivados")} />
          avisar si es de seguridad
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-white/70">
          <Switch checked={!!policy.auto_sync_agents} disabled={busy !== ""} aria-label={`Sincronizar agentes automáticamente para ${p.name}`}
            onCheckedChange={(v) => setPolicy({ auto_sync_agents: v }, v ? "Sincronización automática activada" : "Sincronización automática desactivada")} />
          sincronizar agentes
        </label>
      </div>
      {p.is_auto_paused_by_limit && (
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Reanudar ${p.name} (pausado por límite)`}
          onClick={() => { void wrap(`resume:${p.id}`, () => runS158(`${p.name}: reanudado`, () => updateAstraura158ProcessConfig(target, p.id, { status: "active" }), { after })); }}>
          <BusyIcon busy={busy === `resume:${p.id}`} icon={Play} /> Reanudar
        </button>
      )}
    </div>
  );
}

function PermissionSwitchGrid({ permissions, disabled, entityLabel, onToggle }: { permissions: PermissionMap; disabled: boolean; entityLabel: string; onToggle: (key: string, value: boolean) => void }) {
  const entries = Object.entries(permissions).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {entries.map(([k, v]) =>
        typeof v === "boolean" ? (
          <label key={k} className="flex items-center gap-1.5 text-[10px] text-white/70">
            <Switch checked={v} disabled={disabled} aria-label={`${entityLabel}: ${labelFromKey(k)} ${v ? "activo" : "inactivo"}`} onCheckedChange={(nv) => onToggle(k, nv)} />
            {labelFromKey(k)}
          </label>
        ) : (
          <Badge key={k} tone="border-white/10 text-white/55">{labelFromKey(k)}: {String(v)}</Badge>
        ),
      )}
    </div>
  );
}

function AgentPermCard({ row, target, busy, wrap, after }: { row: AgentPermRow; target: Astraura158Target; busy: string; wrap: WrapFn; after: AfterFn }) {
  const { agent, permissions, source } = row;
  const hasPerms = Object.keys(permissions).length > 0;
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: agent.color ?? "#22d3ee", boxShadow: `0 0 8px ${agent.color ?? "#22d3ee"}` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{agent.name}</p>
        {agent.status && <Badge tone={levelTone(agent.status)}>{agent.status}</Badge>}
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Ver agente ${agent.name}`}
          onClick={() => openAstraura158Window({ kind: "agente", id: agent.id, target })}>
          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Ver agente
        </button>
      </div>
      {agent.role && <p className="text-[10px] text-white/55">{agent.role}</p>}
      {!hasPerms && <p className="text-[10px] text-amber-200/85">El backend no expone permisos para este agente (ni en su estado de API ni en su propio registro).</p>}
      {hasPerms && (
        <>
          <PermissionSwitchGrid permissions={permissions} disabled={busy !== ""} entityLabel={agent.name}
            onToggle={(key, v) => { void wrap(`agp:${agent.id}:${key}`, () => runS158(`${agent.name}: ${labelFromKey(key)} ${v ? "activado" : "desactivado"}`, () => updateAstraura158AgentPermissions(target, agent.id, { ...permissions, [key]: v }), { after })); }} />
          <p className={MONO}>fuente: {source === "api_status" ? "estado de API del agente" : "campo propio del agente"}</p>
        </>
      )}
    </div>
  );
}

function PersonaPermCard({ row, target, busy, wrap, after }: { row: PersonaPermRow; target: Astraura158Target; busy: string; wrap: WrapFn; after: AfterFn }) {
  const { persona, permissions, source } = row;
  const hasPerms = Object.keys(permissions).length > 0;
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: persona.color ?? "#e879f9", boxShadow: `0 0 8px ${persona.color ?? "#e879f9"}` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{persona.name}</p>
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Ver personalidad ${persona.name}`}
          onClick={() => openAstraura158Window({ kind: "personalidad", id: persona.id, target })}>
          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Ver
        </button>
      </div>
      {persona.title && <p className="text-[10px] text-white/55">{persona.title}</p>}
      {!hasPerms && <p className="text-[10px] text-amber-200/85">El backend no expone permisos para esta personalidad (ni en su estado de API ni en su propio registro).</p>}
      {hasPerms && (
        <>
          <PermissionSwitchGrid permissions={permissions} disabled={busy !== ""} entityLabel={persona.name}
            onToggle={(key, v) => { void wrap(`pp:${persona.id}:${key}`, () => runS158(`${persona.name}: ${labelFromKey(key)} ${v ? "activado" : "desactivado"}`, () => updateAstraura158PersonalityPermissions(target, persona.id, { ...permissions, [key]: v }), { after })); }} />
          <p className={MONO}>fuente: {source === "api_status" ? "estado de API de la personalidad" : "campo propio de la personalidad"}</p>
        </>
      )}
    </div>
  );
}

function CerebrosCard({ target, brains, busy, wrap }: { target: Astraura158Target; brains: Astraura158Brain[]; busy: string; wrap: WrapFn }) {
  const [brainId, setBrainId] = useState("");
  const [neuronId, setNeuronId] = useState("");
  const [perm, setPerm] = useState({ read: false, write: false, sync: false });
  const brain = brains.find((b) => b.id === brainId);
  const neurons = brain?.memory_neurons ?? [];
  const saveKey = `neuron:${brainId}:${neuronId || "all"}`;
  const linkKey = `autolink:${brainId || "all"}`;

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle icon={Brain} title="Cerebros — permisos por neurona" tone="text-violet-300"
        hint="El backend no expone lectura de estos permisos: los interruptores de abajo solo controlan lo que vas a ENVIAR, no reflejan un estado guardado." />
      {brains.length === 0 && <Empty text="El manifiesto no expone cerebros." />}
      {brains.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="Cerebro">
              <select className={SELECT} value={brainId} disabled={busy !== ""} aria-label="Cerebro"
                onChange={(e) => { setBrainId(e.target.value); setNeuronId(""); }}>
                <option value="">selecciona…</option>
                {brains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Neurona (opcional)">
              <select className={SELECT} value={neuronId} disabled={busy !== "" || !brainId} aria-label="Neurona"
                onChange={(e) => setNeuronId(e.target.value)}>
                <option value="">todo el cerebro</option>
                {neurons.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] text-white/70">
              <Switch checked={perm.read} disabled={busy !== ""} aria-label="Permiso de lectura a enviar" onCheckedChange={(v) => setPerm((s) => ({ ...s, read: v }))} /> lectura
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-white/70">
              <Switch checked={perm.write} disabled={busy !== ""} aria-label="Permiso de escritura a enviar" onCheckedChange={(v) => setPerm((s) => ({ ...s, write: v }))} /> escritura
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-white/70">
              <Switch checked={perm.sync} disabled={busy !== ""} aria-label="Permiso de sincronización a enviar" onCheckedChange={(v) => setPerm((s) => ({ ...s, sync: v }))} /> sincronización
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={BTN} disabled={busy !== "" || !brainId} aria-label="Guardar permisos de neurona"
              onClick={() => { void wrap(saveKey, () => runS158("Permisos de neurona enviados", () => updateAstraura158BrainNeuronPermissions(target, { brain_id: brainId, neuron_id: neuronId || undefined, permissions: perm }))); }}>
              <BusyIcon busy={busy === saveKey} icon={Save} /> Guardar permisos
            </button>
            <button type="button" className={BTN} disabled={busy !== ""} aria-label={brain ? `Auto-enlazar sinapsis de ${brain.name}` : "Auto-enlazar sinapsis de todos los cerebros"}
              onClick={() => { void wrap(linkKey, () => runS158("Auto-enlace ejecutado", () => autoLinkAstraura158Synapses(target, brainId || undefined), { description: (d) => `${d.linked ?? 0} enlace(s) creado(s)` })); }}>
              <BusyIcon busy={busy === linkKey} icon={Waypoints} /> Auto-enlazar sinapsis{brain ? ` de ${brain.name}` : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
