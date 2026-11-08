"use client";

/**
 * AjusteCifradoRedLocal — Ajustes › Neuronas › Medios: «Exigir cifrado en la red local» (CIF1108A · 2026-11-08).
 * Las apps con cifrado de punta a punta lo usan SIEMPRE entre ellas; este ajuste decide qué pasa con una
 * neurona de una app anterior que no cifra: apagado (por defecto, hasta el siguiente lanzamiento oficial) se
 * habla en claro y se marca «sin cifrar»; encendido no se le manda ni se le acepta nada por la red local ni
 * el Bluetooth directo. Contrato: architecture/datos-por-la-malla.md §6.7. Solo en la app nativa.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { esAppNativa } from "@/lib/nativa/puente";
import { exigirCifradoRedLocal, fijarExigirCifradoRedLocal } from "@/lib/malla/red-local-nativa-motor";

export function AjusteCifradoRedLocal() {
  const [activo, setActivo] = useState<boolean>(() => exigirCifradoRedLocal());
  if (!esAppNativa()) return null;
  return (
    <Card className="bg-background/40 backdrop-blur-sm" data-testid="ajuste-cifrado-red-local">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-[#39FF14]" aria-hidden /> Medios · Cifrado de la red local
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Entre apps actuales, la red local, el Wi-Fi directo y el Bluetooth van cifrados de punta a punta, sin que hagas nada. Una neurona con una app anterior no
          cifra: se le habla en claro y se marca «sin cifrar».
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Exigir cifrado en la red local</span>
            <span className="block text-xs text-muted-foreground">
              No mandar ni aceptar nada de neuronas que no cifran. Actívalo cuando todas tus neuronas tengan la última versión.
            </span>
          </span>
          <Switch
            checked={activo}
            aria-label="Exigir cifrado en la red local"
            onCheckedChange={(v) => {
              setActivo(v);
              fijarExigirCifradoRedLocal(v);
            }}
          />
        </label>
      </CardContent>
    </Card>
  );
}
