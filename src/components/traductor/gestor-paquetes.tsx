"use client";

/**
 * TU1116-APP-F1 · Gestor de paquetes de traducción sin internet
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista de pares con modelo (TU2) con tamaño estimado, estado y botón
 * «Descargar»/«Quitar»; filas `verificado:false` con etiqueta «Sin verificar» y
 * confirmación; barra de progreso y «Cancelar»; resumen «Usado X de Y»; aviso
 * «Se perderá al cerrar» si el almacén no es persistente; aviso de conexión
 * medida con el tamaño. Todo inyectado.
 */

import { useState, type ReactNode } from "react";
import { Download, Trash2, AlertTriangle, X, Check, Loader2, WifiOff, Info, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import type { PaqueteModelo } from "@/lib/traductor/tipos";
import type { DependenciasDescarga } from "@/lib/traductor/descargar";

export interface GestorPaquetesProps {
  paquetes: readonly PaqueteModelo[];
  instalados: readonly string[];
  topeBytes: number;
  persistente: boolean;
  conexionMedida: boolean;
  onDescargar: (id: string, deps: DependenciasDescarga) => Promise<void>;
  onQuitar: (id: string) => void;
  onConfirmarMedida: (bytes: number) => Promise<boolean>;
  onConfirmarNoVerificado?: () => Promise<boolean>;
  depsDescarga: DependenciasDescarga;
}

type EstadoPar = "sin-internet" | "descarga" | "solo-internet";

const ETIQUETAS_ESTADO: Record<EstadoPar, string> = {
  "sin-internet": "Sin conexión",
  descarga: "Descargando…",
  "solo-internet": "Solo internet",
};

const NOMBRES_IDIOMAS: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  fr: "Francés",
  de: "Alemán",
  pt: "Portugués",
  it: "Italiano",
  nl: "Neerlandés",
  ca: "Catalán",
  gl: "Gallego",
  eu: "Euskera",
  ru: "Ruso",
  uk: "Ucraniano",
  pl: "Polaco",
  tr: "Turco",
  ar: "Árabe",
  he: "Hebreo",
  fa: "Persa",
  ur: "Urdu",
  hi: "Hindi",
  bn: "Bengalí",
  zh: "Chino",
  ja: "Japonés",
  ko: "Coreano",
  th: "Tailandés",
  vi: "Vietnamita",
  id: "Indonesio",
  sw: "Suajili",
  el: "Griego",
  sv: "Sueco",
  cs: "Checo",
  ro: "Rumano",
  hu: "Húngaro",
  fi: "Finés",
  da: "Danés",
  nb: "Noruego",
};

function formatearBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function nombreIdioma(codigo: string): string {
  return NOMBRES_IDIOMAS[codigo.toLowerCase()] ?? codigo.toUpperCase();
}

function estadoDePaquete(paquete: PaqueteModelo, instalados: readonly string[]): EstadoPar {
  return instalados.includes(paquete.repo) ? "sin-internet" : "descarga";
}

interface FilaPaqueteProps {
  paquete: PaqueteModelo;
  estado: EstadoPar;
  estaDescargando: boolean;
  progreso: number;
  alDescargar: () => void;
  alCancelar: () => void;
  alQuitar: () => void;
  verificado: boolean;
  confirmarNoVerificado: () => Promise<boolean>;
  confirmarMedida: (bytes: number) => Promise<boolean>;
  conexionMedida: boolean;
}

function FilaPaquete({
  paquete,
  estado,
  estaDescargando,
  progreso,
  alDescargar,
  alCancelar,
  alQuitar,
  verificado,
  confirmarNoVerificado,
  confirmarMedida,
  conexionMedida,
}: FilaPaqueteProps) {
  const [mostrarConfirmacionDescarga, setMostrarConfirmacionDescarga] = useState(false);
  const [mostrarConfirmacionQuitar, setMostrarConfirmacionQuitar] = useState(false);
  const [mostrarConfirmacionMedida, setMostrarConfirmacionMedida] = useState(false);

  const manejarDescargar = async () => {
    if (!verificado) {
      setMostrarConfirmacionDescarga(true);
      return;
    }
    if (conexionMedida) {
      setMostrarConfirmacionMedida(true);
      return;
    }
    alDescargar();
  };

  const manejarConfirmarDescarga = async () => {
    const confirmado = await confirmarNoVerificado?.();
    if (confirmado) {
      setMostrarConfirmacionDescarga(false);
      alDescargar();
    }
  };

  const manejarConfirmarMedida = async () => {
    const confirmado = await confirmarMedida(paquete.bytes);
    if (confirmado) {
      setMostrarConfirmacionMedida(false);
      alDescargar();
    }
  };

  const manejarQuitar = () => {
    setMostrarConfirmacionQuitar(true);
  };

  const manejarConfirmarQuitar = () => {
    setMostrarConfirmacionQuitar(false);
    alQuitar();
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-white/20">
      <div className="flex min-w-0 items-center gap-3 flex-1">
        <div className="min-w-0">
          <p className="truncate text-sm text-white/90">
            {nombreIdioma(paquete.par.origen)} → {nombreIdioma(paquete.par.destino)}
          </p>
          <p className="truncate text-[11px] text-white/40">
            {paquete.repo} · {formatearBytes(paquete.bytes)}
          </p>
        </div>
        {!verificado && (
          <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
            <AlertTriangle className="h-2.5 w-2.5 inline-block mr-1" /> Sin verificar
          </span>
        )}
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
            estado === "sin-internet"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-sky-400/30 bg-sky-500/10 text-sky-300",
          )}
        >
          {ETIQUETAS_ESTADO[estado]}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {estaDescargando ? (
          <div className="flex items-center gap-2 min-w-[200px]">
            <Progress value={progreso} className="h-2 flex-1 max-w-[150px]" />
            <span className="text-[11px] text-white/60 w-14 text-right">
              {Math.round(progreso)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={alCancelar}
              className="cursor-pointer h-7 w-7 text-white/60 hover:text-rose-300"
              aria-label="Cancelar descarga"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : estado === "sin-internet" ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={manejarQuitar}
            className="cursor-pointer h-7 w-7 text-white/60 hover:text-rose-300"
            aria-label={`Quitar ${nombreIdioma(paquete.par.origen)} → ${nombreIdioma(paquete.par.destino)}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={manejarDescargar}
            disabled={estaDescargando}
            className="cursor-pointer gap-1.5 bg-emerald-600 transition-colors duration-200 hover:bg-emerald-500"
            aria-label={`Descargar ${nombreIdioma(paquete.par.origen)} → ${nombreIdioma(paquete.par.destino)}`}
          >
            <Download className="h-3.5 w-3.5" /> Descargar
          </Button>
        )}

        {/* Diálogos de confirmación */}
        <Dialog open={mostrarConfirmacionDescarga} onOpenChange={setMostrarConfirmacionDescarga}>
          <DialogContent className="max-w-md bg-black/95 border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <AlertTriangle className="h-5 w-5 text-amber-400" /> Confirmar descarga
              </DialogTitle>
              <DialogDescription>
                El modelo <strong>{paquete.repo}</strong> no ha sido verificado. Puede contener
                errores o no funcionar correctamente. ¿Deseas continuar?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMostrarConfirmacionDescarga(false)}>
                Cancelar
              </Button>
              <Button onClick={manejarConfirmarDescarga}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={mostrarConfirmacionMedida} onOpenChange={setMostrarConfirmacionMedida}>
          <DialogContent className="max-w-md bg-black/95 border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <WifiOff className="h-5 w-5 text-amber-400" /> Conexión medida
              </DialogTitle>
              <DialogDescription>
                Estás en una conexión medida. La descarga de <strong>{formatearBytes(paquete.bytes)}</strong>
                consumirá datos de tu plan. ¿Deseas continuar?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMostrarConfirmacionMedida(false)}>
                Cancelar
              </Button>
              <Button onClick={manejarConfirmarMedida}>Continuar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={mostrarConfirmacionQuitar} onOpenChange={setMostrarConfirmacionQuitar}>
          <DialogContent className="max-w-md bg-black/95 border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Trash2 className="h-5 w-5 text-rose-400" /> Quitar modelo
              </DialogTitle>
              <DialogDescription>
                Se eliminará el modelo <strong>{paquete.repo}</strong> ({formatearBytes(paquete.bytes)}).
                Necesitarás conexión a internet para volver a usarlo. ¿Confirmas?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMostrarConfirmacionQuitar(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={manejarConfirmarQuitar}>
                Quitar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function GestorPaquetes({
  paquetes,
  instalados,
  topeBytes,
  persistente,
  conexionMedida,
  onDescargar,
  onQuitar,
  onConfirmarMedida,
  onConfirmarNoVerificado,
  depsDescarga,
}: GestorPaquetesProps) {
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [progresoDescarga, setProgresoDescarga] = useState(0);

  const usados = instalados
    .map((repo) => paquetes.find((p) => p.repo === repo))
    .filter((p): p is PaqueteModelo => p !== undefined)
    .reduce((acc, p) => acc + p.bytes, 0);

  const manejarDescargar = async (id: string) => {
    setDescargandoId(id);
    setProgresoDescarga(0);
    try {
      await onDescargar(id, {
        ...depsDescarga,
        alProgreso: (hecho, total) => {
          setProgresoDescarga(total > 0 ? Math.round((hecho / total) * 100) : 0);
          depsDescarga.alProgreso?.(hecho, total);
        },
      });
    } finally {
      setDescargandoId(null);
      setProgresoDescarga(0);
    }
  };

  const manejarCancelar = () => {
    setDescargandoId(null);
    setProgresoDescarga(0);
  };

  const manejarQuitar = (id: string) => {
    onQuitar(id);
  };

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4 text-emerald-300" /> Modelos de traducción sin conexión
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!persistente && (
            <div data-testid="persistencia-aviso" className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="whitespace-normal">El almacén no es persistente: los modelos se perderán al cerrar el navegador.</span>
            </div>
          )}
          <div className="space-y-2">
            {paquetes.map((paquete) => {
              const estado = estadoDePaquete(paquete, instalados);
              const estaDescargando = descargandoId === paquete.id;
              return (
                <FilaPaquete
                  key={paquete.id}
                  paquete={paquete}
                  estado={estado}
                  estaDescargando={estaDescargando}
                  progreso={progresoDescarga}
                  alDescargar={() => manejarDescargar(paquete.id)}
                  alCancelar={manejarCancelar}
                  alQuitar={() => manejarQuitar(paquete.id)}
                  verificado={paquete.verificado}
                  confirmarNoVerificado={onConfirmarNoVerificado ?? (async () => true)}
                  confirmarMedida={onConfirmarMedida}
                  conexionMedida={conexionMedida}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-2 text-sm text-white/60">
            <span>Usado {formatearBytes(usados)} de {formatearBytes(topeBytes)}</span>
            <Progress value={topeBytes > 0 ? Math.round((usados / topeBytes) * 100) : 0} className="h-1.5 w-48" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default GestorPaquetes;