"use client";

/*
 * transferencias-archivo-panel — UI de la transferencia de archivos por la
 * malla P2P (Ola 369): botón «Enviar archivo» por dispositivo, lista de
 * transferencias con progreso/velocidad/cancelar/reintentar, y las tarjetas
 * de ofertas entrantes que esperan Aceptar/Rechazar (política "preguntar").
 *
 * Mobile-first, iconos lucide, cursor-pointer, sin emojis — mismo estilo que
 * `malla-neuronas-panel.tsx`. Solo lectura del motor compartido
 * (`archivos-malla.ts`); no arranca ningún transporte por su cuenta (eso lo
 * hace `iniciarMotorArchivosPorMalla()`, montado por `MallaNeuronasMount`).
 */

import { useState } from "react";
import { CheckCircle2, Download, FileText, FolderPlus, Loader2, RotateCw, Send, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { getSharedMesh } from "@/lib/network/lan-sync";
import {
  canalDesdeMesh,
  motorArchivosCompartido,
  registrarArchivoLocalEnBiblioteca,
  useOfertasPendientesArchivo,
  useTransferenciasArchivo,
  type EstadoTransferencia,
} from "@/lib/network/archivos-malla";

function tamanoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function velocidadLegible(estado: EstadoTransferencia): string {
  const elapsedS = Math.max(0.4, (estado.actualizadoMs - estado.inicioMs) / 1000);
  const bytesHechos = estado.trozos > 0 ? estado.tamano * (estado.progreso / estado.trozos) : 0;
  return `${tamanoLegible(bytesHechos / elapsedS)}/s`;
}

async function refDeCuentaActual(): Promise<{ kind: "user"; id: string } | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ? { kind: "user", id: data.user.id } : null;
  } catch {
    return null;
  }
}

/* ─────────────────────────── Botón «Enviar archivo» ─────────────────────────── */

export function EnviarArchivoBoton({ deviceId, etiqueta }: { deviceId: string; etiqueta: string }) {
  const [enviando, setEnviando] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const mesh = getSharedMesh();
    if (!mesh) return;
    setEnviando(true);
    try {
      const canal = canalDesdeMesh(mesh, deviceId);
      const motor = motorArchivosCompartido();
      for (const file of Array.from(files)) {
        await motor.enviarArchivo(canal, file, file.name, { tipo: "dispositivo", id: deviceId });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <label
      className={cn(
        "ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition-colors duration-200",
        enviando
          ? "cursor-wait border-foreground/10 text-foreground/40"
          : "border-foreground/15 bg-foreground/[0.03] text-foreground/70 hover:border-sky-400/40 hover:text-sky-200",
      )}
      title={`Enviar archivo a ${etiqueta}`}
    >
      {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      Enviar archivo
      <input
        type="file"
        multiple
        className="hidden"
        disabled={enviando}
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* ─────────────────────────── Lista de transferencias ─────────────────────────── */

function BarraProgreso({ progreso, trozos }: { progreso: number; trozos: number }) {
  const pct = trozos > 0 ? Math.min(100, Math.round((progreso / trozos) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
      <div className="h-full rounded-full bg-sky-400/70 transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TransferenciaRow({ estado }: { estado: EstadoTransferencia }) {
  const motor = motorArchivosCompartido();
  const [ocupado, setOcupado] = useState(false);
  const enCurso = estado.fase === "esperando-aceptacion" || estado.fase === "transfiriendo" || estado.fase === "verificando";
  const conError = estado.fase === "error" || estado.fase === "rechazada";
  const puedeReintentar = conError && estado.rol === "enviar" && !!motor.archivoDeEnvio(estado.id) && estado.destino?.tipo === "dispositivo" && !!estado.destino.id;

  const blob = estado.rol === "recibir" && estado.fase === "completada" ? motor.blobRecibido(estado.id) : undefined;

  const abrir = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const guardar = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = estado.nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const anadirABiblioteca = async () => {
    if (!blob) return;
    setOcupado(true);
    try {
      const ref = await refDeCuentaActual();
      if (!ref) return;
      await registrarArchivoLocalEnBiblioteca(ref, estado);
    } finally {
      setOcupado(false);
    }
  };
  const reintentar = () => {
    const archivo = motor.archivoDeEnvio(estado.id);
    const mesh = getSharedMesh();
    if (!archivo || !mesh || !estado.destino?.id) return;
    const canal = canalDesdeMesh(mesh, estado.destino.id);
    void motor.enviarArchivo(canal, archivo, estado.nombre, estado.destino, { idTransferencia: estado.id });
  };

  return (
    <div className="space-y-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{estado.nombre}</span>
        <Badge variant="outline" className="shrink-0 text-[9px] text-foreground/50">
          {estado.rol === "enviar" ? "enviando" : "recibiendo"}
        </Badge>
        {enCurso && (
          <button
            type="button"
            onClick={() => motor.cancelar(estado.id)}
            title="Cancelar"
            className="shrink-0 cursor-pointer text-foreground/40 hover:text-red-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {enCurso && (
        <>
          <BarraProgreso progreso={estado.progreso} trozos={estado.trozos} />
          <div className="flex justify-between text-[9px] text-foreground/45">
            <span>
              {estado.trozos > 0 ? Math.round((estado.progreso / estado.trozos) * 100) : 0}% · {tamanoLegible(estado.tamano)}
            </span>
            <span>{velocidadLegible(estado)}</span>
          </div>
        </>
      )}

      {estado.fase === "completada" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
          <Badge variant="outline" className="gap-1 border-emerald-400/40 text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> completada · {tamanoLegible(estado.tamano)}
          </Badge>
          {estado.rol === "recibir" && blob && (
            <>
              <button
                type="button"
                onClick={abrir}
                className="cursor-pointer rounded-full border border-foreground/15 px-2 py-0.5 text-foreground/65 hover:border-sky-400/40"
              >
                Abrir
              </button>
              <button
                type="button"
                onClick={guardar}
                className="flex items-center gap-1 cursor-pointer rounded-full border border-foreground/15 px-2 py-0.5 text-foreground/65 hover:border-sky-400/40"
              >
                <Download className="h-3 w-3" /> Guardar
              </button>
              <button
                type="button"
                onClick={() => void anadirABiblioteca()}
                disabled={ocupado}
                className="flex items-center gap-1 cursor-pointer rounded-full border border-foreground/15 px-2 py-0.5 text-foreground/65 hover:border-sky-400/40 disabled:cursor-wait disabled:opacity-50"
              >
                <FolderPlus className="h-3 w-3" /> Añadir a la Biblioteca
              </button>
            </>
          )}
        </div>
      )}

      {conError && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[9px]">
          <Badge variant="outline" className="gap-1 border-red-400/40 text-red-300" title={estado.motivo}>
            <XCircle className="h-3 w-3" /> {estado.fase === "rechazada" ? "rechazada" : "error"}
            {estado.motivo ? ` · ${estado.motivo}` : ""}
          </Badge>
          {puedeReintentar && (
            <button
              type="button"
              onClick={reintentar}
              className="flex items-center gap-1 cursor-pointer rounded-full border border-foreground/15 px-2 py-0.5 text-foreground/65 hover:border-sky-400/40"
            >
              <RotateCw className="h-3 w-3" /> Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista completa de transferencias (activas + terminadas), para incrustar en el panel de la malla. */
export function TransferenciasArchivoLista() {
  const transferencias = useTransferenciasArchivo();
  const visibles = transferencias.filter((e) => e.fase !== "pendiente-aceptar");
  if (visibles.length === 0) {
    return (
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
        Sin transferencias de archivo por ahora.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {visibles
        .slice()
        .sort((a, b) => b.actualizadoMs - a.actualizadoMs)
        .map((e) => (
          <TransferenciaRow key={e.id} estado={e} />
        ))}
    </div>
  );
}

/* ─────────────────────────── Tarjeta de oferta entrante (toast global) ─────────────────────────── */

function OfertaEntranteCard({ oferta }: { oferta: EstadoTransferencia }) {
  const motor = motorArchivosCompartido();
  return (
    <div className="pointer-events-auto w-full max-w-[360px] space-y-2 rounded-2xl border border-sky-400/30 bg-background/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-foreground">{oferta.nombre}</p>
          <p className="truncate text-[10px] text-foreground/50">
            {oferta.origen ? `De ${oferta.origen} · ` : ""}
            {tamanoLegible(oferta.tamano)}
          </p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => motor.aceptarOferta(oferta.id)}
          className="flex-1 cursor-pointer rounded-full bg-sky-500/20 px-2.5 py-1 text-[11px] font-medium text-sky-100 transition-colors duration-200 hover:bg-sky-500/30"
        >
          Aceptar
        </button>
        <button
          type="button"
          onClick={() => motor.rechazarOferta(oferta.id)}
          className="flex-1 cursor-pointer rounded-full border border-foreground/15 px-2.5 py-1 text-[11px] text-foreground/60 transition-colors duration-200 hover:border-red-400/40 hover:text-red-300"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}

/**
 * TransferenciasArchivoToast — tarjetas flotantes de ofertas entrantes que
 * esperan confirmación (política "preguntar": siempre para otras cuentas, o
 * misma cuenta si el usuario desactivó el auto-aceptar). Montado GLOBALMENTE
 * por `MallaNeuronasMount` para que llegue aunque el panel esté cerrado.
 */
export function TransferenciasArchivoToast() {
  const ofertas = useOfertasPendientesArchivo();
  if (ofertas.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
      {ofertas.map((o) => (
        <OfertaEntranteCard key={o.id} oferta={o} />
      ))}
    </div>
  );
}
