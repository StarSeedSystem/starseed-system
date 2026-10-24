"use client";
/**
 * Editor de un bot personal (BOT1011I1 · contrato architecture/astraura-bots.md §13).
 * Nombre, cuerpo (FORMAS_CUERPO; las 3D como «próximamente»), rasgos con vista
 * previa de `instruccionesDeTono`, sentidos (los íntimos avisan del permiso
 * individual), el nivel de acción con su explicación y LA VOZ (VZR1011E:
 * <EditorVozBot />). Solo presenta; la persistencia la hace el panel con
 * `guardarBots` — el perfil de voz se guarda CON el bot y viaja con su sincronía.
 */
import { useState } from "react";
import {
  FORMAS_CUERPO,
  RASGOS,
  SENTIDOS,
  SENTIDOS_INTIMOS,
  type Bot,
  type FormaCuerpo,
  type Sentido,
} from "@/lib/astraura-bots/tipos";
import { instruccionesDeTono } from "@/lib/astraura-bots/personalidad-adaptable";
import type { NivelBot } from "@/lib/astraura-bots/permisos";
import { normalizarVozBot, vozBotDefecto, type VozBot } from "@/lib/astraura-bots/voz-bot";
import { EditorVozBot } from "./voz-bot-editor";

/** Formas que aún no tienen renderizador: se anuncian y no se ofrecen elegir. */
const FORMAS_PROXIMAS: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];

const NIVELES: readonly { id: NivelBot; nombre: string; ayuda: string }[] = [
  { id: "nada", nombre: "Nada", ayuda: "No actúa ni propone; solo observa con lo permitido." },
  { id: "proponer", nombre: "Proponer", ayuda: "Propone cada acción y espera tu confirmación." },
  { id: "aplicar-bajo", nombre: "Aplicar (solo riesgo bajo)", ayuda: "Aplica solo lo de riesgo bajo (navegar, abrir apps, capas de pantalla, notas) y propone el resto. Nivel por defecto." },
  { id: "aplicar", nombre: "Aplicar", ayuda: "Aplica lo de riesgo bajo y propone el resto; todo con deshacer y registro." },
];

export interface EditorBotProps {
  bot: Bot;
  nivel: NivelBot;
  onGuardar: (bot: Bot, nivel: NivelBot) => void;
  onCerrar: () => void;
}

export function EditorBot({ bot, nivel: nivelInicial, onGuardar, onCerrar }: EditorBotProps) {
  const [nombre, setNombre] = useState(bot.nombre);
  const [cuerpo, setCuerpo] = useState({ ...bot.cuerpo });
  const [personalidad, setPersonalidad] = useState({ ...bot.personalidad });
  const [sentidos, setSentidos] = useState<Sentido[]>([...bot.sentidosHabilitados]);
  const [nivel, setNivel] = useState<NivelBot>(nivelInicial);
  const [voz, setVoz] = useState<VozBot>(
    () => normalizarVozBot(bot.voz) ?? vozBotDefecto(bot.id, Date.now()),
  );

  const proxima = FORMAS_PROXIMAS.includes(cuerpo.forma);
  const alternarSentido = (s: Sentido) =>
    setSentidos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const guardar = () => {
    const limpio = nombre.trim() || bot.nombre;
    onGuardar(
      { ...bot, nombre: limpio, cuerpo, personalidad, sentidosHabilitados: sentidos, voz },
      nivel,
    );
  };

  const campo = "mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm";
  return (
    <div className="space-y-4 text-sm">
      <label className="block font-medium">Nombre
        <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block font-medium">Cuerpo
          <select className={`${campo} cursor-pointer`} value={cuerpo.forma}
            onChange={(e) => setCuerpo({ ...cuerpo, forma: e.target.value as FormaCuerpo })}>
            {FORMAS_CUERPO.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {proxima && (
            <p className="mt-1 text-xs text-muted-foreground">
              próximamente: llega con StarSeed XR
            </p>
          )}
        </label>
        <label className="block font-medium">Tono (0–360)
          <input type="number" min={0} max={360} className={campo} value={cuerpo.tono}
            onChange={(e) => setCuerpo({ ...cuerpo, tono: Number(e.target.value) })} />
        </label>
        <label className="block font-medium">Escala
          <input type="number" min={0.5} max={2} step={0.1} className={campo} value={cuerpo.escala}
            onChange={(e) => setCuerpo({ ...cuerpo, escala: Number(e.target.value) })} />
        </label>
      </div>
      <fieldset>
        <legend className="font-medium">Personalidad</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {RASGOS.map((r) => (
            <label key={r} className="block capitalize">
              {r} · {personalidad[r].toFixed(2)}
              <input type="range" min={0} max={1} step={0.05} aria-label={`rasgo ${r}`}
                className="w-full cursor-pointer" value={personalidad[r]}
                onChange={(e) => setPersonalidad({ ...personalidad, [r]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs italic text-muted-foreground">
          Vista previa: {instruccionesDeTono(personalidad).join(" ")}
        </p>
      </fieldset>
      <fieldset>
        <legend className="font-medium">Sentidos habilitados</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {SENTIDOS.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="cursor-pointer" checked={sentidos.includes(s)}
                onChange={() => alternarSentido(s)} />
              <span>{s}</span>
              {SENTIDOS_INTIMOS.includes(s) && (
                <span className="text-xs text-amber-600">cada persona dará su permiso aparte</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-medium">Voz</legend>
        <EditorVozBot valor={voz} onCambiar={setVoz} />
      </fieldset>
      <label className="block font-medium">Nivel de acción
        <select className={`${campo} cursor-pointer`} value={nivel}
          onChange={(e) => setNivel(e.target.value as NivelBot)}>
          {NIVELES.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          {NIVELES.find((n) => n.id === nivel)?.ayuda}
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar}
          className="cursor-pointer rounded-md border border-border px-3 py-1.5 transition-colors duration-200 hover:bg-muted">
          Cancelar
        </button>
        <button type="button" onClick={guardar}
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-colors duration-200 hover:opacity-90">
          Guardar
        </button>
      </div>
    </div>
  );
}
