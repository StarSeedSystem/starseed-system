"use client";

import { useState, useEffect } from "react";
import { Radio } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyHint } from "./shared";
import { listarEstaciones } from "@/lib/estaciones/datos";
import { TarjetaEstacion } from "@/components/estaciones/tarjeta-estacion";
import type { Estacion } from "@/lib/estaciones/tipos";
import { NuevaEstacion } from "@/components/estaciones/nueva-estacion";

export interface EstacionesEntidadProps {
  slug: string;
  nombre?: string;
  puedePublicar: boolean;
  accent?: string;
}

const HEX_ACCENT = "#E9C46A";

function hex(accent: string | undefined, alpha = ""): string {
  return `${accent || HEX_ACCENT}${alpha}`;
}

export function EstacionesEntidad({ slug, nombre, puedePublicar, accent }: EstacionesEntidadProps) {
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);

  const ac = accent ?? HEX_ACCENT;

  const cargar = async () => {
    setCargando(true);
    try {
      const lista = await listarEstaciones({ ambito: slug, limite: 20 });
      setEstaciones(lista);
    } catch {
      setEstaciones([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [slug]);

  const abrirNueva = () => setNuevaAbierta(true);
  const cerrarNueva = () => setNuevaAbierta(false);

  const alGuardar = async (e: Estacion) => {
    cerrarNueva();
    await cargar();
  };

  return (
    <GlassCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: hex(ac, "44"), background: hex(ac, "14"), color: ac }}
          >
            <Radio className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 className="font-headline text-base font-semibold leading-tight">Estaciones</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Transmisiones en directo de {nombre ?? slug}
            </p>
          </div>
        </div>
        {puedePublicar && (
          <Button
            variant="outline"
            size="sm"
            onClick={abrirNueva}
            className="cursor-pointer shrink-0 gap-1.5"
            style={{ borderColor: hex(ac, "55"), color: ac }}
          >
            <Radio className="h-3.5 w-3.5" />
            Abrir una estación del grupo
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <EmptyHint>Prueba</EmptyHint>
      </div>

      <NuevaEstacion
        abierto={nuevaAbierta}
        onCerrar={cerrarNueva}
        ambitos={[{ tipo: "entidad", ref: slug, nombre: nombre ?? slug }]}
        onGuardada={alGuardar}
      />
    </GlassCard>
  );
}
