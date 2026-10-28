"use client";

/**
 * Ajustes del Mausbot (contrato `architecture/mausbot-astraura.md` §4): encendido y modo, un diseño
 * por personalidad con vista previa (`MausbotAvatar`), nivel para actuar y alcance del cambio
 * (cuenta › perfil › neurona, `fusionarResolucion`: lo de este perfil o neurona gana al de la cuenta).
 */
import { useEffect, useState } from "react";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { disenoParaPersonalidad, fusionarResolucion, guardarConfigMausbot, leerConfigMausbot, type AjustesMausbot, type ConfigMausbot, type ModoMausbot, type ParcheMausbot } from "@/lib/mausbot/config";
import { disenoPorId, listarDisenos } from "@/lib/mausbot/disenos";
import type { NivelBot } from "@/lib/astraura-bots/permisos";
import { ATOMOS_PROPIOS } from "@/lib/protomolecula/atomos";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import { MausbotAvatar } from "./mausbot-avatar";

/** El átomo «mausbot» de la Protomolécula (§6: sin él, no se pinta el botón de diseñar). */
export const ATOMO_MAUSBOT = "mausbot";
/** Dónde cae un cambio: toda la cuenta, solo este perfil o solo esta neurona. */
export type DestinoAjuste = "cuenta" | "perfil" | "neurona";
export interface MausbotAjustesProps { perfilId?: string; nombrePerfil?: string; neuronaId?: string; nombreNeurona?: string }

/** Etiquetas del nivel para actuar (`NivelBot`, contrato §5). */
export const ETIQUETAS_NIVEL: Record<NivelBot, string> = {
  nada: "Nada: solo mira", proponer: "Proponer (por defecto)",
  "aplicar-bajo": "Aplicar lo reversible", aplicar: "Aplicar todo",
};
export const ETIQUETAS_MODO: Record<ModoMausbot, string> = { cursor: "Es el cursor", acompanante: "Acompaña al cursor", ambos: "Ambos" };
const BLOQUE = "flex flex-col gap-2";
const ETIQUETA = "text-xs font-medium text-muted-foreground";

/** Fusiona lo que ya había en la capa con el cambio: un diseño nuevo no pisa a los demás. */
function capaFusionada(capa: AjustesMausbot | undefined, cambio: AjustesMausbot): AjustesMausbot {
  const fusion = { ...capa, ...cambio };
  if (cambio.porPersonalidad) fusion.porPersonalidad = { ...capa?.porPersonalidad, ...cambio.porPersonalidad };
  return fusion;
}
/** El parche que escribe `cambio` en el destino elegido, sin pisar el resto de la configuración. */
export function parcheAjusteMausbot(actual: ConfigMausbot, destino: DestinoAjuste, ids: { perfilId?: string; neuronaId?: string }, cambio: AjustesMausbot): ParcheMausbot {
  if (destino === "cuenta") return { ...cambio, porPersonalidad: cambio.porPersonalidad ? { ...actual.porPersonalidad, ...cambio.porPersonalidad } : undefined };
  if (destino === "perfil" && ids.perfilId) return { perfiles: { ...actual.perfiles, [ids.perfilId]: capaFusionada(actual.perfiles[ids.perfilId], cambio) } };
  if (destino === "neurona" && ids.neuronaId) return { neuronas: { ...actual.neuronas, [ids.neuronaId]: capaFusionada(actual.neuronas[ids.neuronaId], cambio) } };
  return {};
}
/** El botón de diseñar solo se pinta si el átomo «mausbot» existe (§6). */
export function hayAtomoMausbot(obtener: (id: string) => unknown = obtenerAtomo, propios: { herramientaId: string }[] = ATOMOS_PROPIOS): boolean {
  try {
    return propios.some((a) => a.herramientaId === ATOMO_MAUSBOT) || Boolean(obtener(ATOMO_MAUSBOT));
  } catch {
    return false;
  }
}

export function MausbotAjustes({ perfilId, nombrePerfil, neuronaId, nombreNeurona }: MausbotAjustesProps) {
  const [config, setConfig] = useState<ConfigMausbot | null>(null);
  const [destino, setDestino] = useState<DestinoAjuste>("cuenta");
  useEffect(() => { setConfig(leerConfigMausbot()); }, []);
  if (!config) return null;
  const perfiles = listPersonalityProfiles();
  const disenos = listarDisenos();
  const efectiva = fusionarResolucion(config, perfilId, neuronaId);
  const alCambiar = (cambio: AjustesMausbot) => {
    const cae = (destino === "perfil" && !perfilId) || (destino === "neurona" && !neuronaId) ? "cuenta" : destino;
    guardarConfigMausbot(parcheAjusteMausbot(config, cae, { perfilId, neuronaId }, cambio));
    setConfig(leerConfigMausbot());
  };
  const destinos: { id: DestinoAjuste; texto: string }[] = [
    { id: "cuenta", texto: "Toda la cuenta" },
    ...(perfilId ? [{ id: "perfil" as const, texto: nombrePerfil ? `Solo en este perfil (${nombrePerfil})` : "Solo en este perfil" }] : []),
    ...(neuronaId ? [{ id: "neurona" as const, texto: nombreNeurona ? `Solo en esta neurona (${nombreNeurona})` : "Solo en esta neurona" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="mausbot-ajustes">
      <section className={BLOQUE}>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="cursor-pointer" checked={efectiva.encendido} data-testid="mausbot-encendido" onChange={(e) => alCambiar({ encendido: e.target.checked })} /> Encender el Mausbot
        </label>
        <label className="flex items-center gap-2"><span className={ETIQUETA}>Modo</span>
          <select className="cursor-pointer rounded-md border bg-background px-2 py-1" data-testid="mausbot-modo" value={efectiva.modo} onChange={(e) => alCambiar({ modo: e.target.value as ModoMausbot })}>
            {(Object.keys(ETIQUETAS_MODO) as ModoMausbot[]).map((m) => <option key={m} value={m}>{ETIQUETAS_MODO[m]}</option>)}
          </select>
        </label>
      </section>
      <section className={BLOQUE}>
        <p className={ETIQUETA}>Diseño por personalidad</p>
        {perfiles.map((p) => (
          <div key={p.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="inline-block h-8 w-8 shrink-0"><MausbotAvatar diseno={disenoPorId(disenoParaPersonalidad(efectiva, p.id))} estado="idle" tamano={0.55} /></span>
            <select className="cursor-pointer rounded-md border bg-background px-2 py-1" data-testid={`mausbot-diseno-${p.id}`} value={disenoParaPersonalidad(efectiva, p.id)} onChange={(e) => alCambiar({ porPersonalidad: { [p.id]: e.target.value } })}>
              {disenos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        ))}
      </section>
      <section className={BLOQUE}>
        <p className={ETIQUETA}>Nivel para actuar en el OS</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(ETIQUETAS_NIVEL) as NivelBot[]).map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-1">
              <input type="radio" name="mausbot-nivel" className="cursor-pointer" checked={efectiva.actuar === n} onChange={() => alCambiar({ actuar: n })} data-testid={`mausbot-nivel-${n}`} /> {ETIQUETAS_NIVEL[n]}
            </label>
          ))}
        </div>
        {efectiva.actuar === "aplicar" && <p role="status" data-testid="mausbot-aviso-aplicar">Con «Aplicar todo» el Mausbot hará clics sin preguntar en lo reversible.</p>}
      </section>
      <section className={BLOQUE}>
        <p className={ETIQUETA}>Los cambios de aquí valen para</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {destinos.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-1">
              <input type="radio" name="mausbot-destino" className="cursor-pointer" checked={destino === d.id} onChange={() => setDestino(d.id)} data-testid={`mausbot-destino-${d.id}`} /> {d.texto}
            </label>
          ))}
        </div>
      </section>
      {hayAtomoMausbot() && <button className="cursor-pointer rounded-full border bg-background px-4 py-2 text-sm hover:bg-muted" data-testid="mausbot-protomolecula" onClick={() => window.location.assign("/protomolecula?atomo=mausbot")}>Diseñar en la Protomolécula</button>}
    </div>
  );
}
