"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CapsulaAjustes } from "@/components/memorias/capsula-ajustes";
import type { TipoSujeto } from "@/lib/memorias/capsulas";

type PerfilSujeto = { tipo: "perfil"; id: string };

export function PerfilAjustesCapsula({ perfilId }: { perfilId: string }) {
  const sujeto = useMemo<PerfilSujeto>(
    () => ({ tipo: "perfil", id: perfilId }),
    [perfilId]
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