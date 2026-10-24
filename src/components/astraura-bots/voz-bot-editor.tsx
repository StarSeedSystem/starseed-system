"use client";
/**
 * Editor pequeño de la VOZ de un bot (VZR1011E · astraura-voces-y-robots.md §3).
 * Origen del timbre (semilla sintética / del catálogo / la voz del dueño con consentimiento
 * registrado), motor preferido y mapa emoción → estilo (exageración de Chatterbox + estilo
 * de OpenVoice V2). Solo presenta y devuelve el perfil: la persistencia la hace el panel con
 * `guardarBots`, igual que el editor de BOT1011I1; el perfil viaja con la sincronía del bot
 * y, sin el motor en una neurona, su cadena usa el más parecido y lo dice (voz-bot.ts).
 */
import { useState } from "react";
import { EMOCIONES, type Emocion } from "@/lib/astraura-bots/tipos";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import {
  ESTILOS_OPENVOICE,
  MOTORES_VOZ,
  adaptarVozANeurona,
  estiloDe,
  huellaVoz,
  normalizarVozBot,
  timbreUsableDe,
  type EstiloOpenVoice,
  type MotorVoz,
  type VozBot,
} from "@/lib/astraura-bots/voz-bot";

const NOMBRE_EMOCION: Record<Emocion, string> = {
  calma: "Calma", alegria: "Alegría", curiosidad: "Curiosidad", concentracion: "Concentración",
  preocupacion: "Preocupación", ternura: "Ternura", asombro: "Asombro",
};

const ORIGENES = [
  { id: "semilla", nombre: "Semilla sintética", ayuda: "Una voz inventada solo para este bot: nunca es la de una persona." },
  { id: "catalogo", nombre: "Del catálogo", ayuda: "Una de las voces de Astraura (timbres.ts), elegida por su id." },
  { id: "propia", nombre: "La voz del dueño", ayuda: "Solo con su permiso EXPLÍCITO ya registrado en el daemon de voz (/voces)." },
] as const;

export interface EditorVozBotProps {
  /** Perfil a editar (el del bot; usa `vozBotDefecto(bot.id, Date.now())` si no lo tiene). */
  valor: VozBot;
  onCambiar: (v: VozBot) => void;
}

export function EditorVozBot({ valor, onCambiar }: EditorVozBotProps) {
  const [v, setV] = useState<VozBot>(valor);
  const aplicar = (c: Partial<VozBot>) => {
    const origen = c.origen === "propia" && c.clon?.consentimiento ? "propia"
      : c.origen === "catalogo" && c.timbreCatalogo ? "catalogo" : "semilla";
    const limpio = normalizarVozBot({ ...v, ...c, origen });
    if (limpio) { setV(limpio); onCambiar(limpio); }
  };
  const campo = "mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm";
  return (
    <div className="space-y-4 text-sm">
      <fieldset>
        <legend className="font-medium">De dónde sale su voz</legend>
        <div className="grid gap-1">
          {ORIGENES.map((o) => (
            <label key={o.id} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="voz-origen" aria-label={`origen ${o.nombre}`} className="mt-1 cursor-pointer"
                checked={v.origen === o.id} onChange={() => aplicar({ origen: o.id })} />
              <span>
                <span className="font-medium">{o.nombre}</span>
                <span className="block text-xs text-muted-foreground">{o.ayuda}</span>
              </span>
            </label>
          ))}
        </div>
        {v.origen === "catalogo" && (
          <input className={campo} aria-label="id del timbre del catálogo" placeholder="p. ej. fem-aurora"
            value={v.timbreCatalogo ?? ""}
            onChange={(e) => aplicar({ timbreCatalogo: e.target.value.trim().toLowerCase() })} />
        )}
        {v.origen === "propia" && (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="cursor-pointer" checked={v.clon?.consentimiento === true}
                onChange={(e) => aplicar({
                  clon: {
                    timbreId: v.clon?.timbreId ?? "", duenoCuentaId: v.clon?.duenoCuentaId ?? "",
                    consentimiento: e.target.checked,
                  },
                })} />
              <span>Su voz ya se clonó con su permiso registrado (la muestra se graba en /voces)</span>
            </label>
            <input className={campo} aria-label="id del timbre clonado" placeholder="id del timbre clonado (minúsculas y guiones)"
              value={v.clon?.timbreId ?? ""}
              onChange={(e) => aplicar({
                clon: {
                  timbreId: e.target.value.trim().toLowerCase(), duenoCuentaId: v.clon?.duenoCuentaId ?? "",
                  consentimiento: v.clon?.consentimiento === true,
                },
              })} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          La voz de una persona real solo se usa con su permiso registrado; nunca se imita a nadie sin él.
        </p>
      </fieldset>
      <label className="block font-medium">Motor preferido
        <select className={`${campo} cursor-pointer`} value={v.motorPreferido}
          onChange={(e) => aplicar({ motorPreferido: e.target.value as MotorVoz })}>
          {MOTORES_VOZ.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          Si una neurona no lo tiene, su cadena usa el más parecido y lo dice.
        </span>
      </label>
      <fieldset>
        <legend className="font-medium">Cómo habla en cada emoción</legend>
        <div className="grid gap-2">
          {EMOCIONES.map((e) => (
            <div key={e} className="grid grid-cols-[6rem_1fr_8rem] items-center gap-2">
              <span>{NOMBRE_EMOCION[e]}</span>
              <input type="range" min={0.25} max={0.9} step={0.05} aria-label={`exageración con ${NOMBRE_EMOCION[e]}`}
                title={`${NOMBRE_EMOCION[e]}: ${v.emociones[e].exageracion.toFixed(2).replace(".", ",")}`}
                className="w-full cursor-pointer" value={v.emociones[e].exageracion}
                onChange={(ev) => aplicar({ emociones: { ...v.emociones, [e]: { ...v.emociones[e], exageracion: Number(ev.target.value) } } })} />
              <select className="cursor-pointer rounded-md border border-border bg-background px-1 py-0.5 text-xs"
                aria-label={`estilo OpenVoice con ${NOMBRE_EMOCION[e]}`} value={v.emociones[e].estilo}
                onChange={(ev) => aplicar({ emociones: { ...v.emociones, [e]: { ...v.emociones[e], estilo: ev.target.value as EstiloOpenVoice } } })}>
                {ESTILOS_OPENVOICE.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">La exageración es el dial de Chatterbox; el estilo, el de OpenVoice V2.</p>
        <button type="button" onClick={() => aplicar({
          emociones: Object.fromEntries(EMOCIONES.map((c) => [c, estiloDe(c)])) as VozBot["emociones"],
        })} className="mt-2 cursor-pointer rounded-md border border-border px-2 py-1 text-xs">
          Volver a la voz de fábrica
        </button>
      </fieldset>
      <footer className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
        {(() => {
          const t = timbreUsableDe(v);
          const medidas = leerMedidas();
          const motoresNeurona = MOTORES_VOZ.filter((m) =>
            medidas.some((x) => x.tipo === "primer-sonido" && x.motor === m));
          const { motor, aviso } = adaptarVozANeurona(v, motoresNeurona);
          return (
            <>
              <p>
                Timbre de verdad: {t.origen === "propia" ? `su voz clonada (${t.timbreId})`
                  : t.origen === "catalogo" ? `del catálogo (${t.timbreId})` : `semilla ${t.semilla}`}.
              </p>
              <p>
                Esta neurona {motor ? `habla con ${motor}` : "no tiene ningún motor de voz: hablará con la voz del sistema"}.
                {aviso && <> <span className="text-amber-600">{aviso}</span></>}
              </p>
              <p>Huella de su voz: <span lang="zxx" className="font-mono">{huellaVoz(v)}</span> — la misma aquí y en todas las neuronas.</p>
            </>
          );
        })()}
      </footer>
    </div>
  );
}

export default EditorVozBot;
