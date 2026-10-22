"use client";

/** Ajustes de «Versiones públicas» (ESP1011B). Permiso por cuenta en las preferencias ya
 * sincronizadas; token opcional SOLO en este aparato (`safe-storage`), que solo viaja a
 * Hugging Face. Nada se cuenta en nuestros servidores. Ver architecture/astraura-avatares-3d.md
 * §11.2 y architecture/astraura-imagenes.md §3. */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { borrarTokenHf, guardarTokenHf, leerTokenHf } from "@/lib/espacios/cliente-espacios";
import { guardarPreferenciaEspacios, resolverPermisoEspaciosGuardado, type PermisoEspaciosResuelto } from "@/lib/espacios/permiso-espacios";

const ENLACE_TOKENS = "https://huggingface.co/settings/tokens";
export interface AjustesEspaciosProps { esCuentaDeAdministracion?: boolean }
export function AjustesEspacios({ esCuentaDeAdministracion }: AjustesEspaciosProps) {
  const [permiso, setPermiso] = useState<PermisoEspaciosResuelto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [entrada, setEntrada] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      let admin = esCuentaDeAdministracion === true;
      if (esCuentaDeAdministracion === undefined) {
        try { admin = (await miAccesoMetaGenesis())?.dueno === true; } catch { admin = false; }
      }
      if (!vivo) return;
      setPermiso(resolverPermisoEspaciosGuardado(admin));
      setToken(leerTokenHf());
    })();
    return () => { vivo = false; };
  }, [esCuentaDeAdministracion]);

  function decidir(permitido: boolean) {
    const ok = guardarPreferenciaEspacios({ permitido });
    setPermiso(resolverPermisoEspaciosGuardado(false));
    if (!ok) toast.error("Este aparato no dejó guardar el permiso; vuelve a intentarlo.");
    else toast.success(permitido ? "Versiones públicas encendidas" : "Versiones públicas apagadas");
  }
  function guardar() {
    const error = guardarTokenHf(entrada);
    if (error) return setAviso(error);
    setToken(leerTokenHf()); setEntrada(""); setAviso(null);
    toast.success("Token guardado solo en este aparato");
  }
  function quitar() {
    borrarTokenHf(); setToken(null); setAviso(null);
    toast.success("Token borrado de este aparato");
  }

  if (!permiso) {
    return (
      <Card className="bg-background/40 backdrop-blur-sm"><CardContent className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo tu permiso de este aparato…
      </CardContent></Card>
    );
  }
  const pista = token ? `••••${token.slice(-4)}` : null;

  return (
    <Card className="bg-background/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Versiones públicas (Spaces de Hugging Face)
          <Badge className="border-cyan-400/30 bg-cyan-500/20 text-[9px] text-cyan-200">{permiso.permitido ? "Encendidas" : "Apagadas"}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">Generación 3D e imágenes con GPUs gratis, sin instalar nada. Los Spaces se llaman desde TU navegador: cada persona gasta su propia cuota de Hugging Face.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {permiso.preguntarAhora && (
          <div role="alertdialog" aria-label="Permiso para versiones públicas" className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
            <p className="text-sm font-semibold">¿Quieres usar los Spaces públicos?</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="cursor-pointer" onClick={() => decidir(true)}>Sí, usarlos</Button>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => decidir(false)}>Ahora no</Button>
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Usar versiones públicas (Spaces de Hugging Face)</p>
            <p className="text-[11px] text-muted-foreground">{permiso.permitido ? "Encendido: entra como opción, después de tus neuronas." : "Apagado: nada sale de tu aparato."}</p>
          </div>
          <Switch checked={permiso.permitido} onCheckedChange={decidir} aria-label="Usar versiones públicas (Spaces de Hugging Face)" />
        </div>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li><strong>Qué sale:</strong> el texto que pides y, si adjuntas una imagen de referencia y lo autorizas, esa imagen. Sale de tu navegador directamente al Space, nunca por los servidores de StarSeed.</li>
          <li><strong>A quién:</strong> a Hugging Face y a quien publica el Space (Tencent ARC, Microsoft, Black Forest Labs o Qwen), con sus condiciones.</li>
          <li><strong>Cuota gratis:</strong> ZeroGPU da 2 min de GPU al día sin cuenta, 5 con cuenta gratis y 40 con PRO. Es tuya y se comparte entre Spaces; el OS no la cuenta en ningún servidor.</li>
          <li><strong>Fotos de personas:</strong> piden además tu consentimiento por cada imagen. Si un Space está dormido, lleno o cambió su API, se dice y se pasa a la siguiente opción del plan.</li>
        </ul>
        <div className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Token de Hugging Face (opcional)</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Es una llave de solo lectura de tu cuenta: con ella usas tu cuota y accedes a Spaces con términos aceptados. No hace falta para empezar.{" "}
            <a href={ENLACE_TOKENS} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-cyan-300 underline underline-offset-2">Crear o ver mi token <ExternalLink className="h-3 w-3" /></a>
          </p>
          {pista ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-emerald-300/90">Guardado en este aparato ({pista})</span>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={quitar}>Quitar</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input type="password" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="hf_…" aria-label="Token de Hugging Face" autoComplete="off" />
              <Button size="sm" className="cursor-pointer" onClick={guardar} disabled={!entrada.trim()}>Guardar</Button>
            </div>
          )}
          {aviso && <p className="text-[11px] text-amber-200">{aviso}</p>}
          <p className="text-[11px] text-muted-foreground">Se guarda solo en este aparato y solo viaja a Hugging Face; nunca a nuestros servidores ni a registros.</p>
        </div>
      </CardContent>
    </Card>
  );
}
