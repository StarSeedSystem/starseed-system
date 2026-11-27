"use client";

import { Image, Pencil, Palette, Camera, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { colorValido, colorPorDefecto, PALETA_COLOR_PUBLICO, normalizarColor } from "@/lib/neurons/color-publico";
import { iconoElegido } from "@/lib/neurons/neurons";
import { useState, useCallback, useEffect } from "react";

export interface FilaIdentidad {
  etiqueta: string;
  valor: string;
}

export interface DatosIdentidad {
  nombreNeurona: string;
  nombreAparato: string;
  icono: string | null;
  colorPublico: string | null;
  foto: string | null;
}

const KIND_LABELS: Record<string, string> = {
  desktop: "Escritorio",
  laptop: "Portátil",
  mobile: "Móvil",
  tablet: "Tableta",
  server: "Servidor",
  other: "Dispositivo",
};

export function normalizarNombreNeurona(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function normalizarNombreAparato(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function filasIdentidad(datos: DatosIdentidad): FilaIdentidad[] {
  const filas: FilaIdentidad[] = [];
  if (datos.nombreNeurona) filas.push({ etiqueta: "Nombre de la neurona", valor: datos.nombreNeurona });
  if (datos.nombreAparato) filas.push({ etiqueta: "Nombre de este aparato", valor: datos.nombreAparato });
  if (datos.icono) filas.push({ etiqueta: "Tipo / Icono", valor: KIND_LABELS[datos.icono] ?? datos.icono });
  if (datos.colorPublico && colorValido(datos.colorPublico)) {
    filas.push({ etiqueta: "Color público", valor: datos.colorPublico });
  }
  if (datos.foto) filas.push({ etiqueta: "Foto", valor: "Definida" });
  return filas;
}

interface SeccionIdentidadProps {
  neurona: {
    id: string;
    name: string;
    kind: string;
    capabilities: {
      aparato?: { nombre?: string };
      aparatos?: Record<string, { n?: string }>;
    };
    isThisDevice: boolean;
  };
  settings: {
    icono?: string;
    colorPublico?: string;
    foto?: string;
  };
  onChangeNombreNeurona: (nombre: string) => void;
  onChangeNombreAparato: (nombre: string) => void;
  onChangeIcono: (icono: string) => void;
  onChangeColor: (color: string) => void;
  onChangeFoto: (foto: string) => void;
  busqueda: string;
  estaAbierta: boolean;
  onToggle: () => void;
}

const ICONOS_NEURONA = [
  { id: "desktop", label: "Escritorio" },
  { id: "laptop", label: "Portátil" },
  { id: "mobile", label: "Móvil" },
  { id: "tablet", label: "Tableta" },
  { id: "server", label: "Servidor" },
  { id: "other", label: "Otro" },
] as const;

export function SeccionIdentidad({
  neurona,
  settings,
  onChangeNombreNeurona,
  onChangeNombreAparato,
  onChangeIcono,
  onChangeColor,
  onChangeFoto,
  busqueda,
  estaAbierta,
  onToggle,
}: SeccionIdentidadProps) {
  const [editandoNombreNeurona, setEditandoNombreNeurona] = useState(false);
  const [editandoNombreAparato, setEditandoNombreAparato] = useState(false);
  const [draftNombreNeurona, setDraftNombreNeurona] = useState(neurona.name);
  const [draftNombreAparato, setDraftNombreAparato] = useState(
    neurona.capabilities.aparato?.nombre ??
    Object.values(neurona.capabilities.aparatos ?? {})[0]?.n ??
    ""
  );
  const [selectorColorAbierto, setSelectorColorAbierto] = useState(false);
  const [selectorIconoAbierto, setSelectorIconoAbierto] = useState(false);

  const colorActual = settings.colorPublico && colorValido(settings.colorPublico)
    ? settings.colorPublico
    : colorPorDefecto(neurona.id);

  const iconoActual = iconoElegido(settings.icono) ?? (neurona.kind as any);

  const coincideBusqueda = (texto: string) =>
    texto.toLowerCase().includes(busqueda.toLowerCase());

  const filas = filasIdentidad({
    nombreNeurona: neurona.name,
    nombreAparato: draftNombreAparato || (neurona.capabilities.aparato?.nombre ?? ""),
    icono: iconoActual,
    colorPublico: settings.colorPublico,
    foto: settings.foto,
  }).filter((f) => coincideBusqueda(f.etiqueta) || coincideBusqueda(f.valor));

  if (!estaAbierta && filas.length === 0 && busqueda) return null;

  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden" open={estaAbierta}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80"
      >
        <Image className="h-4 w-4 text-emerald-300" aria-hidden />
        Identidad
        <span className="ml-auto text-[10px] font-normal text-white/40 group-open:hidden">ver</span>
        <ChevronDown className={cn("w-4 h-4 ml-auto text-white/40 transition-transform", estaAbierta && "rotate-180")} />
      </summary>
      {estaAbierta && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
          {busqueda && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                placeholder="Buscar en Identidad…"
                value={busqueda}
                onChange={() => {}}
                className="pl-8 h-8 text-sm bg-black/30 border-white/10"
                readOnly
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-white/50 shrink-0 min-w-[140px]">Nombre de la neurona</label>
              {editandoNombreNeurona ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                  <Input
                    value={draftNombreNeurona}
                    onChange={(e) => setDraftNombreNeurona(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onChangeNombreNeurona(normalizarNombreNeurona(draftNombreNeurona));
                        setEditandoNombreNeurona(false);
                      }
                      if (e.key === "Escape") {
                        setDraftNombreNeurona(neurona.name);
                        setEditandoNombreNeurona(false);
                      }
                    }}
                    onBlur={() => {
                      onChangeNombreNeurona(normalizarNombreNeurona(draftNombreNeurona));
                      setEditandoNombreNeurona(false);
                    }}
                    className="h-8 bg-background/60 border-white/10 text-sm"
                    autoFocus
                    maxLength={60}
                  />
                  <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={() => { onChangeNombreNeurona(normalizarNombreNeurona(draftNombreNeurona)); setEditandoNombreNeurona(false); }}>
                    <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="sr-only">Guardar</span>
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-semibold text-white/90 truncate max-w-[240px] flex-1">{neurona.name}</span>
                  <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => setEditandoNombreNeurona(true)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="sr-only">Renombrar neurona</span>
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-white/50 shrink-0 min-w-[140px]">Nombre de este aparato</label>
              {editandoNombreAparato ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                  <Input
                    value={draftNombreAparato}
                    onChange={(e) => setDraftNombreAparato(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onChangeNombreAparato(normalizarNombreAparato(draftNombreAparato));
                        setEditandoNombreAparato(false);
                      }
                      if (e.key === "Escape") {
                        setDraftNombreAparato(neurona.capabilities.aparato?.nombre ?? "");
                        setEditandoNombreAparato(false);
                      }
                    }}
                    onBlur={() => {
                      onChangeNombreAparato(normalizarNombreAparato(draftNombreAparato));
                      setEditandoNombreAparato(false);
                    }}
                    className="h-8 bg-background/60 border-white/10 text-sm"
                    autoFocus
                    maxLength={60}
                  />
                  <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={() => { onChangeNombreAparato(normalizarNombreAparato(draftNombreAparato)); setEditandoNombreAparato(false); }}>
                    <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="sr-only">Guardar</span>
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-semibold text-white/90 truncate max-w-[240px] flex-1">
                    {draftNombreAparato || neurona.capabilities.aparato?.nombre || "Sin nombre"}
                  </span>
                  <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => setEditandoNombreAparato(true)}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="sr-only">Renombrar aparato</span>
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-white/50 shrink-0 min-w-[140px]">Tipo / Icono</label>
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden flex-1">
                {ICONOS_NEURONA.map((o) => (
                  <button
                    key={o.id}
                    title={o.label}
                    onClick={() => {
                      onChangeIcono(o.id);
                      setSelectorIconoAbierto(false);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-normal flex items-center gap-1.5",
                      iconoActual === o.id
                        ? "bg-emerald-500/20 text-emerald-100"
                        : "text-white/55 hover:bg-white/5",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-white/50 shrink-0 min-w-[140px]">Color público</label>
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <button
                  onClick={() => setSelectorColorAbierto(!selectorColorAbierto)}
                  className="cursor-pointer w-8 h-8 rounded-lg border border-white/10 flex-shrink-0"
                  style={{ backgroundColor: colorActual }}
                  aria-label={`Color actual: ${colorActual}`}
                >
                  {selectorColorAbierto && <span className="w-full h-full flex items-center justify-center"><Camera className="w-4 h-4 text-white" /></span>}
                </button>
                <span className="text-xs font-mono text-white/70">{colorActual}</span>
                {selectorColorAbierto && (
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    {PALETA_COLOR_PUBLICO.map((c) => (
                      <button
                        key={c.color}
                        onClick={() => {
                          onChangeColor(c.color);
                          setSelectorColorAbierto(false);
                        }}
                        className="cursor-pointer w-7 h-7 rounded-lg border-2 transition-colors"
                        style={{ backgroundColor: c.color, borderColor: colorActual === c.color ? "#fff" : "transparent" }}
                        title={c.nombre}
                        aria-label={c.nombre}
                      />
                    ))}
                    <Input
                      placeholder="#rrggbb"
                      value=""
                      onChange={(e) => {
                        const norm = normalizarColor(e.target.value);
                        if (norm) {
                          onChangeColor(norm);
                          setSelectorColorAbierto(false);
                        }
                      }}
                      className="h-7 w-20 text-xs bg-black/30 border-white/10"
                      maxLength={7}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-white/50 shrink-0 min-w-[140px]">Foto</label>
              <div className="flex items-center gap-2 flex-1">
                {settings.foto ? (
                  <>
                    <img src={settings.foto} alt="Foto de la neurona" className="w-8 h-8 rounded-full object-cover border border-white/10" />
                    <span className="text-xs text-white/60">Definida</span>
                    <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => onChangeFoto("")}>
                      <Pencil className="w-3.5 h-3.5" /> Cambiar
                    </Button>
                    <Button variant="ghost" size="sm" className="cursor-pointer text-red-400/80 hover:text-red-300" onClick={() => onChangeFoto("")}>
                      <Camera className="w-3.5 h-3.5" />
                      <span className="sr-only">Quitar foto</span>
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => onChangeFoto("data:image/png;base64,placeholder")}>
                    <Camera className="w-3.5 h-3.5" /> Subir foto
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </details>
  );
}

export default SeccionIdentidad;