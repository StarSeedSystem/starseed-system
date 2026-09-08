"use client";

// ══════════════════════════════════════════════════════════════
// Panel reutilizable «Externos» — Ola 281 · E3 (2026-09-07)
// Lista los vínculos de acceso externo de un ámbito, permite crearlos
// (con el token mostrado UNA sola vez), revocarlos y ver ejemplos de uso
// (curl + URL de la API v1). Se sondea al montar y tras cada cambio.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Clock,
  KeyRound,
} from "lucide-react";
import type { Vinculo } from "@/lib/externos/vinculos";
import {
  listarVinculos,
  revocarVinculo,
  resumenPermisos,
  urlApiV1,
  type AmbitoExterno,
} from "@/lib/externos/cliente";
import { formatRelativeTime } from "@/lib/social-posts";
import { NuevoVinculo } from "@/components/externos/nuevo-vinculo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Propiedades del panel: ámbito sobre el que se listan/crean los vínculos. */
export interface PanelExternosProps {
  ambito: AmbitoExterno;
  compacto?: boolean;
}

/** Formatea la caducidad relativa ("caduca en 6 d") o "sin caducidad". */
function caducidadLabel(expira: string | null): string {
  if (!expira) return "sin caducidad";
  const ms = new Date(expira).getTime() - Date.now();
  if (ms <= 0) return "caducado";
  const d = Math.round(ms / 86_400_000);
  if (d <= 0) return "caduca en <1 d";
  if (d === 1) return "caduca en 1 d";
  if (d < 30) return `caduca en ${d} d`;
  return `caduca en ${Math.round(d / 30)} mes`;
}

export function PanelExternos({ ambito, compacto = false }: PanelExternosProps) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [revocando, setRevocando] = useState<string | null>(null);

  // Sondeo al montar y tras cada cambio (alta/revocación): recarga la lista.
  const recargar = useCallback(async () => {
    setCargando(true);
    const r = await listarVinculos(ambito);
    setVinculos(r.vinculos);
    setCargando(false);
  }, [ambito.tipo, ambito.id]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const onCreado = useCallback(() => {
    setAbierto(false);
    void recargar();
  }, [recargar]);

  const onRevocar = useCallback(
    async (id: string) => {
      // Confirmación aparte (botón con doble clic): aquí solo ejecuta la baja.
      setRevocando(id);
      await revocarVinculo(id);
      setRevocando(null);
      void recargar();
    },
    [recargar],
  );

  const nombreAmbito = ambito.nombre ?? "este ámbito";
  const activos = vinculos.filter((v) => !v.revocado_en);

  return (
    <Card data-testid="panel-externos" className={compacto ? "text-sm" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Externos · {nombreAmbito}
            </CardTitle>
            <CardDescription>
              {activos.length} {activos.length === 1 ? "vínculo activo" : "vínculos activos"} ·{" "}
              <code className="text-xs">{urlApiV1()}</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void recargar()}
              aria-label="Recargar vínculos"
            >
              <RefreshCw className={cargando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button size="sm" onClick={() => setAbierto(true)}>
              <Plus className="h-4 w-4" />
              Nuevo vínculo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando vínculos…</p>
        ) : activos.length === 0 ? (
          <EstadoVacio onCrear={() => setAbierto(true)} />
        ) : (
          <ul className="space-y-2">
            {activos.map((v) => (
              <VinculoFila
                key={v.id}
                vinculo={v}
                revocando={revocando === v.id}
                onRevocar={() => void onRevocar(v.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <NuevoVinculo ambito={ambito} abierto={abierto} onAbierto={setAbierto} onCreado={onCreado} />
    </Card>
  );
}

/** Fila de un vínculo activo: prefijo, permisos, caducidad, uso y revocar. */
function VinculoFila({
  vinculo,
  revocando,
  onRevocar,
}: {
  vinculo: Vinculo;
  revocando: boolean;
  onRevocar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const permisos = resumenPermisos(vinculo.permisos);
  const ultimoUso = vinculo.ultimo_uso
    ? `último uso ${formatRelativeTime(vinculo.ultimo_uso)}`
    : "sin usar todavía";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <code className="truncate font-mono text-xs">{`ssk_${vinculo.prefijo}…`}</code>
          {vinculo.nombre ? <span className="text-xs text-muted-foreground">{vinculo.nombre}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {permisos.map((p) => (
            <Badge key={p} variant="secondary">{p}</Badge>
          ))}
          <Badge variant="outline">
            <Clock className="mr-1 h-3 w-3" />
            {caducidadLabel(vinculo.expira_en)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {ultimoUso} · {vinculo.usos} {vinculo.usos === 1 ? "uso" : "usos"}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {confirmando ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={revocando} onClick={onRevocar}>
              Confirmar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={revocando}
            onClick={() => setConfirmando(true)}
            aria-label={`Revocar ${vinculo.nombre || vinculo.prefijo}`}
          >
            <Trash2 className="h-4 w-4" />
            Revocar
          </Button>
        )}
      </div>
    </li>
  );
}

/** Estado vacío: explica para qué sirve (Hermes, scripts, Telegram, apps). */
function EstadoVacio({ onCrear }: { onCrear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
      <KeyRound className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">Sin vínculos externos todavía</p>
        <p className="text-sm text-muted-foreground">
          Conecta Hermes, scripts, Telegram u otras apps a este ámbito mediante un
          token de acceso `ssk_…` con permisos y caducidad. Sin token, nada entra.
        </p>
      </div>
      <Button size="sm" onClick={onCrear}>
        <Plus className="h-4 w-4" />
        Crear el primero
      </Button>
    </div>
  );
}