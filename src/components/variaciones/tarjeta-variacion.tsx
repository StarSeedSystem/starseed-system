"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TarjetaVariacionProps {
  variacion: {
    id: string;
    titulo: string;
    descripcion: string;
    version: string;
    familia: string;
    licencia: string;
    etiquetas: string[];
    valoracionMedia: number;
    valoracionCount: number;
  };
  clave: string;
}

export function TarjetaVariacion({ variacion, clave }: TarjetaVariacionProps) {
  const [aplicada, setAplicada] = useState(false);

  const probar = () => {
    setAplicada(true);
    setTimeout(() => setAplicada(false), 2000);
  };

  const aplicar = () => {
    setAplicada(true);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-6 backdrop-blur-xl">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{variacion.titulo}</h3>
        <p className="text-sm text-muted-foreground">{variacion.descripcion}</p>

        <div className="flex items-center gap-2">
          <Star className="size-4" aria-hidden />
          <span className="text-xs text-muted-foreground">{variacion.valoracionMedia.toFixed(1)} ({variacion.valoracionCount})</span>
        </div>

        <p className="text-[10px] text-muted-foreground">{variacion.licencia}</p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={probar}
          >
            Probar
          </Button>
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={aplicar}
          >
            Aplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
          >
            Ver origen
          </Button>
        </div>

        {variacion.etiquetas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variacion.etiquetas.map((e) => (
              <span key={e} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {e}
              </span>
            ))}
          </div>
        )}

        {variacion.version && (
          <p className="text-sm font-mono text-muted-foreground">v{variacion.version}</p>
        )}
      </div>
    </div>
  );
}