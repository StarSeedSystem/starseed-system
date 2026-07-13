"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — RED DESCENTRALIZADA DE SERVIDORES Y ALMACENAMIENTO (Adenda 66 §13)
 * ---------------------------------------------------------------------------
 * Panel para registrar backends de almacenamiento/hosting y elegir, por TIPO DE
 * RECURSO (cuenta/perfil/página/folder/archivo/biblioteca/cerebro/publicación),
 * cuál es el PRIMARIO y cuáles son RÉPLICAS. El servidor oficial StarSeed
 * (Supabase del OS) aparece siempre, activo por defecto y como primario inicial.
 *
 * HONESTIDAD RADICAL (se declara en la propia UI):
 *   · REAL hoy: registro de backends, selección de primario/réplicas por recurso,
 *     el backend oficial StarSeed (Supabase del OS) y —desde la Adenda 66 §13.1—
 *     **Google Cloud Storage**, que ya sube/lee/borra de verdad vía URLs firmadas
 *     V4 (`/api/storage/gcs/sign`), con la credencial SOLO en el servidor y cada
 *     cuenta aislada en su prefijo «<uid>/».
 *   · ANDAMIAJE: los DRIVERS de lectura/escritura del resto de externos
 *     (Supabase propio, Cloud Run, Vercel Blob, S3, CasaOS/neurona, WebDAV,
 *     IPFS…) siguen sin I/O real: se registran y seleccionan, pero no escriben.
 *     Esta capa NO reescribe el acceso a datos: lo complementa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Network,
  Server,
  Star,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Info,
  Check,
  ShieldCheck,
  Boxes,
  Plug,
  CircleCheck,
  CircleAlert,
  Cloud,
} from "lucide-react";
import {
  STORAGE_KINDS,
  RESOURCE_TYPES,
  kindById,
  listBackends,
  addBackend,
  deleteBackend,
  setEnabled,
  ensureDefaults,
  setPrimary,
  setResourcePrimary,
  toggleResourceReplica,
  getResourceRouting,
  isRealBackend,
  testBackend,
  type BackendTestResult,
  type StorageBackend,
  type ResourceType,
} from "@/lib/storage/backends";

/** Orden sugerido: primero los backends de la red descentralizada nueva. */
const KIND_ORDER = [
  "starseed", "supabase", "gcs", "cloudrun", "vercel-blob", "casaos", "ipfs",
  "s3", "github", "webdav", "gdrive", "local",
];

function kindRank(id: string): number {
  const i = KIND_ORDER.indexOf(id);
  return i === -1 ? 999 : i;
}

function sortedKinds() {
  return [...STORAGE_KINDS].sort((a, b) => kindRank(a.id) - kindRank(b.id));
}

export default function BackendsNetworkPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [loading, setLoading] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState("supabase");
  const [newName, setNewName] = useState("");
  const [newFields, setNewFields] = useState<Record<string, string>>({});

  /** Estado REAL por backend (resultado de «Probar conexión»). */
  const [status, setStatus] = useState<Record<string, BackendTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await ensureDefaults(uid);
        setBackends(await listBackends());
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enabled = backends.filter((b) => b.enabled !== false);

  async function add() {
    if (!newName.trim()) {
      toast.error("Ponle un nombre al backend");
      return;
    }
    const saved = await addBackend({
      kind: newKind,
      name: newName.trim(),
      scope: "account",
      scope_ref: null,
      config: { ...newFields },
      priority: (backends.length || 0) + 1,
    });
    if (saved) {
      toast.success("Backend registrado");
      setAdding(false);
      setNewName("");
      setNewFields({});
      setNewKind("supabase");
      await load();
    } else {
      toast.error("No se pudo registrar el backend");
    }
  }

  async function makePrimary(b: StorageBackend) {
    const ok = await setPrimary(b.id);
    if (ok) {
      setBackends((prev) => prev.map((x) => ({ ...x, is_primary: x.id === b.id })));
      toast.success(`«${b.name}» es ahora el primario de la cuenta`);
    } else {
      toast.error("No se pudo fijar el primario");
    }
  }

  async function toggle(b: StorageBackend) {
    await setEnabled(b.id, !b.enabled);
    setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, enabled: !b.enabled } : x)));
  }

  async function remove(b: StorageBackend) {
    if (b.kind === "starseed") {
      toast.message("El servidor oficial StarSeed no se elimina (es el hogar por defecto).");
      return;
    }
    if (!confirm(`¿Quitar el backend «${b.name}»? No borra datos; deja de usarse para enrutar.`)) return;
    await deleteBackend(b.id);
    setBackends((prev) => prev.filter((x) => x.id !== b.id));
    toast.success("Backend quitado");
  }

  async function chooseResourcePrimary(resource: ResourceType, id: string) {
    const ok = await setResourcePrimary(resource, id || null);
    if (ok) await load();
    else toast.error("No se pudo asignar el primario del recurso");
  }

  /**
   * PRUEBA REAL de conexión. Para GCS pide al servidor una URL firmada de sonda:
   * si sale bien, subir/leer/borrar funciona de verdad (misma credencial y bucket).
   * Nunca maquilla el resultado — el motivo del fallo se muestra tal cual.
   */
  async function probe(b: StorageBackend) {
    setTesting(b.id);
    try {
      const res = await testBackend(b);
      setStatus((prev) => ({ ...prev, [b.id]: res }));
      if (res.ok) toast.success(`«${b.name}» conectado`);
      else if (res.real) toast.error(res.detail);
      else toast.message(res.detail);
    } catch (e) {
      toast.error((e as Error)?.message ?? "No se pudo probar la conexión");
    }
    setTesting(null);
  }

  async function flipReplica(resource: ResourceType, b: StorageBackend, on: boolean) {
    const ok = await toggleResourceReplica(resource, b.id, on);
    if (ok) await load();
    else toast.error("No se pudo cambiar la réplica");
  }

  if (!userId && !loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Inicia sesión para gestionar la red de servidores y almacenamiento de tus recursos.
      </div>
    );
  }

  const newKindDef = kindById(newKind);

  return (
    <div className="space-y-6">
      {/* Header + honestidad */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-600">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">Red de servidores y almacenamiento</span>
            <span className="text-[11px] text-cyan-300/70">
              Cualquier recurso puede vivir en uno o varios backends. El servidor oficial StarSeed es el primario por
              defecto y automático; añade externos y elige primario y réplicas por tipo de recurso.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-2 border-cyan-500/30 text-cyan-100"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span>
            <b className="text-amber-200">Qué es real hoy:</b> registro de backends, selección de primario/réplicas por
            recurso, el backend oficial StarSeed (Supabase del OS) y <b className="text-amber-200">Google Cloud
            Storage</b>, que ya sube, lee y borra de verdad.{" "}
            <b className="text-amber-200">Andamiaje:</b> el resto de externos (Supabase propio, Cloud Run, Vercel Blob,
            S3, CasaOS, WebDAV, IPFS…) se registran y seleccionan, pero todavía no escriben nada.
          </span>
        </div>

        {/* Aviso honesto de plataforma para GCS: qué hace falta en cada host. */}
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2 text-[11px] leading-relaxed text-sky-100/85">
          <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>
            <b className="text-sky-200">Google Cloud Storage:</b> el navegador nunca ve la credencial de Google — sube y
            lee con <b>URLs firmadas V4</b> de 10 minutos que emite el servidor, y cada cuenta queda aislada en su
            prefijo <code className="rounded bg-black/30 px-1">&lt;uid&gt;/</code>.{" "}
            <b className="text-sky-200">En Cloud Run</b> (espejo soberano) funciona automáticamente con la identidad del
            servicio (ADC; la service account necesita <code className="rounded bg-black/30 px-1">serviceAccountTokenCreator</code>
            {" "}sobre sí misma para firmar).{" "}
            <b className="text-sky-200">En Vercel</b> (primario) hace falta la variable de entorno{" "}
            <code className="rounded bg-black/30 px-1">GCP_SA_KEY_JSON</code>; sin ella, «Probar conexión» lo dirá y las
            réplicas fallarán con aviso (nunca en silencio).
          </span>
        </div>
      </div>

      {/* Lista de backends */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-cyan-300/60">Backends ({backends.length})</span>
          <Button
            size="sm"
            className="ml-auto gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="h-4 w-4" /> Registrar backend
          </Button>
        </div>

        {adding && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sortedKinds().map((k) => (
                <button
                  key={k.id}
                  onClick={() => {
                    setNewKind(k.id);
                    setNewName((n) => n || k.label);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left text-xs",
                    newKind === k.id
                      ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-50"
                      : "border-white/10 text-white/60 hover:text-white/90",
                  )}
                >
                  <span className="mr-1">{k.icon}</span>
                  {k.label}
                  {k.oss && (
                    <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-semibold text-emerald-300">
                      OSS
                    </span>
                  )}
                </button>
              ))}
            </div>
            {newKindDef && <p className="text-[11px] text-white/50">{newKindDef.blurb}</p>}
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del backend"
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
            {(newKindDef?.fields ?? []).map((f) => (
              <Input
                key={f.key}
                type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                value={newFields[f.key] ?? ""}
                onChange={(e) => setNewFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + (f.placeholder ? ` (${f.placeholder})` : "")}
                className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              />
            ))}
            <div className="flex gap-2">
              <Button size="sm" className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500" onClick={add}>
                <Save className="h-4 w-4" /> Guardar
              </Button>
              <Button size="sm" variant="ghost" className="text-white/60" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {backends.map((b) => {
          const k = kindById(b.kind);
          const official = b.kind === "starseed";
          const real = isRealBackend(b.kind);
          const st = status[b.id];
          return (
            <div
              key={b.id}
              className={cn(
                "rounded-xl border p-3",
                b.is_primary ? "border-emerald-500/40 bg-emerald-950/10" : "border-white/10 bg-white/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{k?.icon ?? "📦"}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{b.name}</span>
                    <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                      {k?.label ?? b.kind}
                    </Badge>
                    {official && (
                      <Badge variant="outline" className="border-cyan-400/40 text-[9px] text-cyan-200">
                        <ShieldCheck className="mr-1 h-2.5 w-2.5" /> Oficial
                      </Badge>
                    )}
                    {b.is_primary && (
                      <Badge variant="outline" className="border-emerald-400/40 text-[9px] text-emerald-200">
                        <Star className="mr-1 h-2.5 w-2.5" /> Primario
                      </Badge>
                    )}
                    {/* Honestidad: driver REAL (escribe de verdad) vs andamiaje. */}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        real ? "border-violet-400/40 text-violet-200" : "border-amber-400/30 text-amber-200/80",
                      )}
                    >
                      {real ? "Driver real" : "Andamiaje"}
                    </Badge>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-cyan-300 hover:bg-cyan-500/10"
                    onClick={() => probe(b)}
                    disabled={testing === b.id}
                  >
                    <Plug className={cn("h-3.5 w-3.5", testing === b.id && "animate-pulse")} /> Probar conexión
                  </Button>
                  {!b.is_primary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-emerald-300 hover:bg-emerald-500/10"
                      onClick={() => makePrimary(b)}
                    >
                      <Star className="h-3.5 w-3.5" /> Hacer primario
                    </Button>
                  )}
                  <Switch checked={b.enabled} onCheckedChange={() => toggle(b)} className="ml-1" />
                  {!official && (
                    <button onClick={() => remove(b)} className="text-white/30 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Resultado REAL de la última prueba (bucket, credencial o motivo del fallo). */}
              {st && (
                <div
                  className={cn(
                    "mt-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed",
                    st.ok
                      ? "border-emerald-500/25 bg-emerald-950/15 text-emerald-100/90"
                      : st.real
                        ? "border-red-500/25 bg-red-950/15 text-red-100/90"
                        : "border-amber-500/20 bg-amber-950/10 text-amber-100/80",
                  )}
                >
                  {st.ok ? (
                    <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="break-words">
                    {st.detail}
                    {st.bucket && (
                      <span className="ml-1 text-white/40">
                        · bucket <code className="rounded bg-black/30 px-1">{st.bucket}</code>
                        {st.credentials && st.credentials !== "none" && (
                          <> · credencial {st.credentials === "adc" ? "ADC (Cloud Run)" : "GCP_SA_KEY_JSON"}</>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Matriz de enrutado por recurso */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <Boxes className="h-3.5 w-3.5" /> Primario y réplicas por tipo de recurso
        </div>
        <div className="space-y-2.5">
          {RESOURCE_TYPES.map((rt) => {
            const primaryBackend = enabled.find((b) => getResourceRouting(b).primaryFor.includes(rt.id));
            const primaryValue = primaryBackend?.id ?? "";
            return (
              <div key={rt.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{rt.icon}</span>
                  <span className="min-w-[92px] text-xs font-medium text-white/80">{rt.label}</span>
                  <span className="text-[10px] text-white/40">Primario:</span>
                  <select
                    value={primaryValue}
                    onChange={(e) => chooseResourcePrimary(rt.id, e.target.value)}
                    className="h-7 rounded-md border border-white/15 bg-black/40 px-2 text-[11px] text-white"
                  >
                    <option value="">Por defecto (StarSeed / cuenta)</option>
                    {enabled.map((b) => (
                      <option key={b.id} value={b.id}>
                        {kindById(b.kind)?.label ?? b.kind} · {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Réplicas */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-white/40">Réplicas:</span>
                  {enabled
                    .filter((b) => b.id !== primaryBackend?.id)
                    .map((b) => {
                      const isReplica = getResourceRouting(b).replicaFor.includes(rt.id);
                      return (
                        <button
                          key={b.id}
                          onClick={() => flipReplica(rt.id, b, !isReplica)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                            isReplica
                              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                              : "border-white/10 text-white/50 hover:text-white/80",
                          )}
                        >
                          {isReplica && <Check className="h-2.5 w-2.5" />}
                          {b.name}
                        </button>
                      );
                    })}
                  {enabled.length <= 1 && (
                    <span className="text-[10px] text-white/30">Registra más backends para poder replicar.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-cyan-500/15 bg-cyan-950/10 px-3 py-2 text-[11px] leading-relaxed text-cyan-200/80">
          <Server className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sin asignación explícita, cada recurso usa el primario de la cuenta (por defecto, el servidor oficial
          StarSeed). <b className="text-cyan-100">Réplica REAL:</b> si marcas Google Cloud Storage como réplica del
          recurso «Archivo», cada archivo que subas se copia también al bucket soberano (la subida primaria sigue siendo
          el servidor StarSeed; si la réplica falla, se te avisa y la subida no se rompe). Las réplicas del resto de
          backends aún son andamiaje: no copian nada todavía.
        </p>
      </div>
    </div>
  );
}
