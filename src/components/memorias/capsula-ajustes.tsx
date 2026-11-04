"use client";

import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Lock } from "lucide-react";
import { capsulaEncendida, encenderCapsula } from "@/lib/memorias/capsulas-ajustes";
import type { TipoSujeto } from "@/lib/memorias/capsulas";

export function formateaBytes(b: number): string {
  if (!b) return "0 B";
  const u = ["B","KB","MB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

type Sujeto = { tipo: TipoSujeto; id: string };

export function CapsulaAjustes({ sujeto }: { sujeto: Sujeto }) {
  const clave = useMemo(() => `${sujeto.tipo}:${sujeto.id}`, [sujeto.tipo, sujeto.id]);
  const [encendido, setEncendido] = useState<boolean>(() => capsulaEncendida(clave));
  const [estado, setEstado] = useState<{ fotogramas: number; bytes: number; topeBytes: number; quedaBytes: number } | null>(null);
  const [linea, setLinea] = useState<string[]>([]);
  const [sinServidor, setSinServidor] = useState(false);

  useEffect(() => {
    setEncendido(capsulaEncendida(clave));
  }, [clave]);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const res = await fetch(`/api/memorias/capsulas?sujeto=${encodeURIComponent(clave)}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 503) setSinServidor(true);
          return;
        }
        const json = await res.json();
        if (!vivo) return;
        const e = json?.estado;
        if (e) setEstado({ fotogramas: e.fotogramas ?? 0, bytes: e.bytes ?? 0, topeBytes: e.topeBytes ?? 0, quedaBytes: e.quedaBytes ?? 0 });
        setSinServidor(false);
      } catch {
        setSinServidor(true);
      }
    }
    cargar();
    return () => { vivo = false; };
  }, [clave, encendido]);

  const cifrada = sujeto.tipo === "perfil" || sujeto.tipo === "personalidad";

  const toggle = async (v: boolean) => {
    const ok = encenderCapsula(clave, v);
    if (ok) setEncendido(v);
  };

  if (sinServidor) {
    return <Card className="border-white/10"><CardContent className="p-4 text-sm text-white/60">El servidor de cápsulas no está en esta neurona</CardContent></Card>;
  }

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Memoria en cápsula</span>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
            <Switch checked={encendido} onCheckedChange={toggle} />
            {encendido ? "Activa" : "Inactiva"}
          </label>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-white/60">Tamaño</span>
          <span className="text-white/90">{estado ? formateaBytes(estado.bytes) : "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/60">Queda</span>
          <span className="text-white/90">{estado ? formateaBytes(estado.quedaBytes) : "—"}</span>
        </div>
        {cifrada && <Badge variant="secondary" className="cursor-pointer"><Lock className="h-3 w-3 mr-1"/>Cifrada</Badge>}
        <div className="pt-2">
          <p className="text-xs text-white/50 mb-1">Línea del tiempo (últimos 20)</p>
          <div className="max-h-28 overflow-auto text-xs text-white/70">
            {linea.length ? linea.map((l,i)=><div key={i} className="truncate">{l}</div>) : <div className="text-white/40">—</div>}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" className="cursor-pointer" disabled={!encendido}><Download className="h-3 w-3 mr-1"/>Exportar</Button>
          <Button size="sm" variant="outline" className="cursor-pointer" disabled={!encendido}><Upload className="h-3 w-3 mr-1"/>Importar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
