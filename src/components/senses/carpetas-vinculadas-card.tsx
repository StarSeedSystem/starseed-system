"use client";

/**
 * FilaCarpetas (Adenda 193) — el permiso de archivos, convertido en gestión
 * REAL de carpetas: varias del dispositivo + almacenamientos externos.
 * Lo que se elija aquí lo hereda solo el paso de Cerebros (se vincula al
 * cerebro principal) y la pestaña de Agentes (permisos de lectura por agente).
 */

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Cloud, Plus, X, RefreshCw, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listarCarpetas, suscribirCarpetas, agregarCarpetaDispositivo, agregarCarpetaServicio,
  quitarCarpeta, soportaCarpetasDispositivo, SERVICIOS,
  type CarpetaVinculada, type ServicioAlmacenamiento,
} from "@/lib/storage/carpetas-vinculadas";
import type { PermisoUI } from "@/components/senses/permisos-dispositivo";
// (Adenda 194) Conexión REAL a la cuenta del servicio (OAuth PKCE).
import {
  conectarAlmacenamiento, cuentaDe, guardarClientId, redirectUri,
  OAUTH_ALMACENAMIENTO, type CuentaConectada,
} from "@/lib/storage/oauth-almacenamiento";

export function FilaCarpetas({ p }: { p: PermisoUI }) {
  const [carpetas, setCarpetas] = useState<CarpetaVinculada[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [verServicios, setVerServicios] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  // Conexión real: cuentas ya autorizadas y alta de ID de cliente si falta.
  const [cuentas, setCuentas] = useState<Record<string, CuentaConectada>>({});
  const [pidiendoId, setPidiendoId] = useState<{ servicio: ServicioAlmacenamiento; consola?: string; detalle?: string } | null>(null);
  const [clientId, setClientId] = useState("");
  const soportado = soportaCarpetasDispositivo();

  useEffect(() => {
    setCarpetas(listarCarpetas());
    return suscribirCarpetas(setCarpetas);
  }, []);

  const agregar = useCallback(async () => {
    setOcupado(true); setNota(null);
    try {
      const c = await agregarCarpetaDispositivo();
      if (!c) setNota("No se añadió ninguna carpeta (cancelaste el selector).");
    } finally { setOcupado(false); }
  }, []);

  /**
   * (Adenda 194) Conecta la CUENTA de verdad: abre el consentimiento del
   * proveedor y pide los permisos de carpetas. Si el servicio aún no tiene
   * conexión directa, queda declarado como antes (y se dice tal cual).
   */
  const agregarServicio = useCallback(async (id: ServicioAlmacenamiento) => {
    setVerServicios(false);
    setNota(null);
    if (!OAUTH_ALMACENAMIENTO[id]) {
      agregarCarpetaServicio(id);
      setNota("Este servicio aún no tiene conexión directa: queda declarado y se conecta desde Ajustes → Integraciones.");
      return;
    }
    setOcupado(true);
    try {
      const r = await conectarAlmacenamiento(id);
      if (r.ok) {
        agregarCarpetaServicio(id, r.cuenta.cuenta);
        setCuentas((c) => ({ ...c, [id]: r.cuenta }));
        setNota(`${OAUTH_ALMACENAMIENTO[id]!.label} conectado${r.cuenta.cuenta ? ` como ${r.cuenta.cuenta}` : ""} ✓ Sus carpetas ya se pueden vincular a tus cerebros.`);
      } else if (r.motivo === "sin-client-id") {
        setPidiendoId({ servicio: id, consola: r.consola, detalle: r.detalle });
      } else if (r.motivo === "cancelado") {
        setNota("Conexión cancelada: no se autorizó nada.");
      } else {
        setNota(r.detalle || "No se pudo conectar con el servicio.");
      }
    } finally {
      setOcupado(false);
    }
  }, []);

  useEffect(() => {
    const m: Record<string, CuentaConectada> = {};
    for (const s of SERVICIOS) { const c = cuentaDe(s.id); if (c) m[s.id] = c; }
    setCuentas(m);
  }, []);

  const { Icon } = p;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
          <Icon className="h-4 w-4 text-cyan-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{p.label}</span>
          <span className="block text-xs text-muted-foreground">
            {p.desc}{" "}
            {carpetas.length > 0 && (
              <span className="text-emerald-300">{carpetas.length} vinculada{carpetas.length === 1 ? "" : "s"} ✓</span>
            )}
          </span>
        </span>
      </div>

      {carpetas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {carpetas.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs">
              {c.tipo === "dispositivo"
                ? <HardDrive className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
                : <Cloud className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">
                {c.nombre}
                {c.tipo === "servicio" && c.servicio && cuentas[c.servicio]?.cuenta && (
                  <span className="ml-1 text-[10px] text-emerald-300">· {cuentas[c.servicio]!.cuenta}</span>
                )}
                {c.tipo === "servicio" && c.servicio && OAUTH_ALMACENAMIENTO[c.servicio] && !cuentas[c.servicio] && (
                  <button
                    type="button"
                    onClick={() => void agregarServicio(c.servicio!)}
                    className="ml-1 text-[10px] text-amber-300 underline-offset-2 hover:underline"
                  >
                    conectar cuenta
                  </button>
                )}
              </span>
              {c.tipo === "dispositivo" && !c.vivo && (
                <button
                  type="button" onClick={() => void agregar()}
                  className="inline-flex shrink-0 items-center gap-1 text-[10px] text-amber-300 transition-colors hover:text-amber-200"
                  title="El navegador no conserva el acceso entre sesiones: un clic lo devuelve."
                >
                  <RefreshCw className="h-3 w-3" aria-hidden /> reconectar
                </button>
              )}
              <button
                type="button" onClick={() => quitarCarpeta(c.id)}
                aria-label={`Quitar ${c.nombre}`}
                className="shrink-0 rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void agregar()} disabled={ocupado || !soportado}>
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          {ocupado ? "Abriendo…" : carpetas.some((c) => c.tipo === "dispositivo") ? "Añadir otra carpeta" : "Añadir carpeta del equipo"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setVerServicios((v) => !v)}>
          <Cloud className="h-3.5 w-3.5" aria-hidden /> Almacenamiento externo
        </Button>
      </div>

      {verServicios && (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {SERVICIOS.map((s) => (
            <button
              key={s.id} type="button" onClick={() => agregarServicio(s.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs",
                "transition-colors hover:border-fuchsia-400/40 hover:bg-fuchsia-500/[0.08]",
              )}
            >
              <Plus className="h-3 w-3 shrink-0 text-fuchsia-300" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate">{s.label}</span>
                <span className="block truncate text-[9px] text-white/40">
                  {OAUTH_ALMACENAMIENTO[s.id] ? (cuentas[s.id] ? "cuenta conectada ✓" : "conectar cuenta y permisos") : "se conecta en Integraciones"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!soportado && (
        <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-snug text-white/60">
          Este navegador no puede abrir carpetas del equipo (File System Access): usa Chrome o Edge, o vincula un
          almacenamiento externo — y para acceso completo al disco, la app de escritorio o el backend de tu neurona.
        </p>
      )}
      {pidiendoId && (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-2.5">
          <p className="text-[11px] leading-snug text-amber-100/90">{pidiendoId.detalle}</p>
          <p className="text-[10px] leading-snug text-white/55">
            URI de redirección a declarar: <code className="rounded bg-black/30 px-1">{redirectUri()}</code>
          </p>
          <div className="flex gap-2">
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ID de cliente del proveedor"
              className="h-8 text-xs"
            />
            <Button
              size="sm" variant="outline" className="h-8 shrink-0 text-xs"
              onClick={() => {
                if (!clientId.trim()) return;
                guardarClientId(pidiendoId.servicio, clientId.trim());
                const srv = pidiendoId.servicio;
                setPidiendoId(null); setClientId("");
                void agregarServicio(srv);
              }}
            >
              Guardar y conectar
            </Button>
          </div>
          {pidiendoId.consola && (
            <p className="text-[10px] text-white/45">Consola del proveedor: {pidiendoId.consola}</p>
          )}
        </div>
      )}
      {nota && <p className="mt-2 text-[11px] leading-snug text-cyan-200/80">{nota}</p>}
      <p className="mt-2 text-[10px] leading-snug text-white/45">
        Todo lo que vincules aquí se enlaza solo con tu cerebro principal en el siguiente paso, y podrás dar o quitar
        acceso a cada agente.
      </p>
    </div>
  );
}

export default FilaCarpetas;
