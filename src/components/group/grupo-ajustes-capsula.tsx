"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CapsulaAjustes } from "@/components/memorias/capsula-ajustes";
import type { TipoSujeto } from "@/lib/memorias/capsulas";

type GrupoSujeto = { tipo: "grupo" | "comunidad"; id: string };

export function GrupoAjustesCapsula({ grupoId, tipo = "grupo" }: { grupoId: string; tipo?: "grupo" | "comunidad" }) {
  const sujeto = useMemo<GrupoSujeto>(
    () => ({ tipo, id: grupoId }),
    [grupoId, tipo]
  );

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Memoria en cápsula
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CapsulaAjustes sujeto={sujeto} />
      </CardContent>
    </Card>
  );
}