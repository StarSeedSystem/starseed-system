"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGenerar3D } from "@/lib/avatares/adaptadores/use-generar-3d";
import { Checkbox } from "@/components/ui/checkbox";

export function Generar3DDialog({ destino, abierto, onCerrar }: { destino: string; abierto: boolean; onCerrar?: () => void }) {
  const [fuente, setFuente] = useState<"biblioteca" | "aparato">("biblioteca");
  const { plan, permisoEspacio, setPermisoEspacio, contienePersonas, setContienePersonas } = useGenerar3D({ destino: destino as any, partida: "imagen" });

  if (!abierto) return null;

  const soloEspacio = plan?.pasos.some(p => p.motor?.id.includes("espacio") && p.motor);

  return (
    <div className="rounded-2xl border p-4 bg-black/40">
      <h3 className="text-lg font-semibold">Crear en 3D desde imagen</h3>
      <p className="text-sm text-white/60">Destino: {destino}</p>
      <div className="mt-3 flex gap-2">
        <Button variant={fuente==="biblioteca"?"default":"outline"} onClick={()=>setFuente("biblioteca")} className="cursor-pointer">Biblioteca</Button>
        <Button variant={fuente==="aparato"?"default":"outline"} onClick={()=>setFuente("aparato")} className="cursor-pointer">Aparato</Button>
      </div>
      {plan && (
        <ul className="mt-3 text-sm space-y-1">
          {plan.pasos.map(p=>(
            <li key={p.etapa} className="flex justify-between">
              <span>{p.etapa}</span>
              <span>{p.motor?.nombre ?? p.motivo}</span>
            </li>
          ))}
        </ul>
      )}
      {soloEspacio && (
        <div className="mt-3 rounded-xl border border-amber-500/30 p-3 text-sm">
          <p>Se usaría el Space remoto de Hugging Face. La imagen sale de tu aparato.</p>
          <label className="flex items-center gap-2 mt-2">
            <Checkbox checked={permisoEspacio} onCheckedChange={(v:any)=>setPermisoEspacio(!!v)} />
            Entiendo y permito el envío
          </label>
          <label className="flex items-center gap-2 mt-1">
            <Checkbox checked={contienePersonas} onCheckedChange={(v:any)=>setContienePersonas(!!v)} />
            La imagen contiene personas (requiere consentimiento)
          </label>
        </div>
      )}
      <Button onClick={onCerrar} className="mt-3 cursor-pointer">Cerrar</Button>
    </div>
  );
}

export function BotonGenerar3D({ destino }: { destino: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button onClick={() => setAbierto(true)} className="cursor-pointer">Crear en 3D</Button>
      <Generar3DDialog destino={destino} abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}
