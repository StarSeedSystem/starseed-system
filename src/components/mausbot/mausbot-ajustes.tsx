"use client";

/**
 * Ajustes del Mausbot (encendido, modo, diseño por personalidad, nivel y alcance cuenta ·
 * perfil · neurona). Contrato: `architecture/mausbot-astraura.md` §3–§4.
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausBotCustomize.tsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Atom, MousePointer2 } from "lucide-react";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { listarDisenos } from "@/lib/mausbot/disenos";
import {
  CONFIG_MAUSBOT_DEFECTO, EVENTO_MAUSBOT, disenoParaPersonalidad, fusionarResolucion, guardarConfigMausbot,
  leerConfigMausbot, type AjustesMausbot, type ConfigEfectivaMausbot, type ModoMausbot,
} from "@/lib/mausbot/config";
import type { NivelBot } from "@/lib/astraura-bots/permisos";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import { Switch } from "@/components/ui/switch";
import { MausbotAvatar } from "./mausbot-avatar";
type Ambito = "cuenta" | "perfil" | "neurona";
const MODOS: Record<ModoMausbot, string> = { cursor: "Es el cursor", acompanante: "Acompaña al cursor", ambos: "Ambos" };
const NIVELES: Record<NivelBot, [string, string]> = {
  nada: ["No actuar", "Solo acompaña al cursor."], proponer: ["Proponer", "Señala y pide confirmación antes de tocar nada."],
  "aplicar-bajo": ["Aplicar lo reversible", "Abre, navega y escribe borradores; el resto lo propone."],
  aplicar: ["Aplicar", "Hará clics sin preguntar en lo reversible; lo irreversible sigue pidiendo permiso."],
};
const S = "mt-1 w-full cursor-pointer rounded-lg border border-border/60 bg-background/70 px-2 py-1.5 text-xs";
const B = "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export interface MausbotAjustesProps { perfilId?: string; neuronaId?: string; className?: string }
function guardarEnAmbito(ambito: Ambito, perfilId: string | undefined, neuronaId: string | undefined, parche: AjustesMausbot): boolean {
  if (ambito === "cuenta") return guardarConfigMausbot(parche);
  const id = ambito === "perfil" ? perfilId : neuronaId;
  if (!id) return false;
  const actual = leerConfigMausbot();
  const registro = ambito === "perfil" ? actual.perfiles : actual.neuronas;
  const previo = registro[id] ?? {};
  const capa = { ...previo, ...parche, porPersonalidad: { ...(previo.porPersonalidad ?? {}), ...(parche.porPersonalidad ?? {}) } };
  return guardarConfigMausbot(ambito === "perfil" ? { perfiles: { ...registro, [id]: capa } } : { neuronas: { ...registro, [id]: capa } });
}

export function MausbotAjustes({ perfilId, neuronaId, className }: MausbotAjustesProps) {
  const [ambito, setAmbito] = useState<Ambito>("cuenta");
  const [cfg, setCfg] = useState<ConfigEfectivaMausbot>(() => fusionarResolucion(CONFIG_MAUSBOT_DEFECTO));
  const personas = useMemo(() => listPersonalityProfiles(), []);
  const disenos = useMemo(() => listarDisenos(), []);
  const refrescar = useCallback(() => {
    setCfg(fusionarResolucion(leerConfigMausbot(),
      ambito === "cuenta" ? undefined : perfilId, ambito === "neurona" ? neuronaId : undefined));
  }, [ambito, perfilId, neuronaId]);
  useEffect(() => {
    refrescar();
    window.addEventListener(EVENTO_MAUSBOT, refrescar);
    window.addEventListener("storage", refrescar);
    return () => { window.removeEventListener(EVENTO_MAUSBOT, refrescar); window.removeEventListener("storage", refrescar); };
  }, [refrescar]);

  const guardar = (parche: AjustesMausbot) => { guardarEnAmbito(ambito, perfilId, neuronaId, parche); refrescar(); };
  const ambitos: { id: Ambito; nombre: string; disponible: boolean }[] = [
    { id: "cuenta", nombre: "Cuenta", disponible: true },
    { id: "perfil", nombre: "Solo en este perfil", disponible: Boolean(perfilId) },
    { id: "neurona", nombre: "Solo en esta neurona", disponible: Boolean(neuronaId) },
  ];

  return (
    <section className={className}>
      <header className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <MousePointer2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold">Mausbot</h2>
            <p className="text-sm text-muted-foreground">El cursor con cara que acompaña, señala y actúa solo si se lo permites.</p>
          </div>
        </div>
        <Switch checked={cfg.encendido} onCheckedChange={(encendido) => guardar({ encendido })} aria-label="Encender el Mausbot" className="mt-1" />
      </header>
      <div role="group" aria-label="Alcance de los ajustes" className="mt-4 flex flex-wrap gap-2">
        {ambitos.map((a) => (
          <button key={a.id} type="button" disabled={!a.disponible} aria-pressed={ambito === a.id} onClick={() => setAmbito(a.id)}
            className={`${B} ${ambito === a.id ? "border-primary bg-primary/15 text-primary" : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"}`}>{a.nombre}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">La neurona manda sobre el perfil, y el perfil sobre la cuenta.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted-foreground">Modo</span>
          <select className={S} value={cfg.modo} onChange={(e) => guardar({ modo: e.target.value as ModoMausbot })}>
            {(Object.keys(MODOS) as ModoMausbot[]).map((id) => <option key={id} value={id}>{MODOS[id]}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted-foreground">Nivel para actuar</span>
          <select className={S} value={cfg.actuar} onChange={(e) => guardar({ actuar: e.target.value as NivelBot })}>
            {(Object.keys(NIVELES) as NivelBot[]).map((id) => <option key={id} value={id}>{NIVELES[id][0]}</option>)}</select>
          <span className="mt-1 block text-xs text-muted-foreground">{NIVELES[cfg.actuar][1]}</span></label>
      </div>
      <h3 className="mt-6 text-sm font-medium">Diseño por personalidad</h3>
      <p className="text-xs text-muted-foreground">Cada personalidad puede llevar su propio cuerpo y degradado.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {personas.map((persona) => {
          const disenoId = disenoParaPersonalidad(cfg, persona.id);
          return (
            <div key={persona.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-2">
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-primary/10 p-1"><MausbotAvatar diseno={disenoId} estado="idle" /></span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate">{persona.name}</span>
                <select aria-label={`Diseño para ${persona.name}`} value={disenoId} className={S} onChange={(e) => guardar({ porPersonalidad: { [persona.id]: e.target.value } })}>
                  {disenos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
              </span>
            </div>
          );
        })}
      </div>
      {obtenerAtomo("mausbot") ? (
        <a href="/protomolecula?atomo=mausbot" className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"><Atom className="h-4 w-4" aria-hidden /> Diseñar en la Protomolécula</a>
      ) : null}
    </section>
  );
}

export default MausbotAjustes;
