"use client";
/**
 * Panel «Mis bots» (BOT1011I1 · contrato architecture/astraura-bots.md §3.3, §13).
 * Lista los bots personales del perfil con su orbe, origen y estado; permite
 * crear (plantilla del predeterminado), abrir/cerrar su orbe, editar, pausar,
 * duplicar y borrar. Borrar exporta antes una copia JSON descargable y pide
 * confirmación; el bot predeterminado no se borra, solo se pausa.
 */
import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, ListChecks, Pencil, Pause, Play, Plus, Trash2 } from "lucide-react";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { leerBots, guardarBots } from "@/lib/astraura-bots/adaptadores/almacen-bots";
import type { Bot } from "@/lib/astraura-bots/tipos";
import { NIVEL_POR_DEFECTO, type NivelBot } from "@/lib/astraura-bots/permisos";
import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";
import { EditorBot } from "./editor-bot";
import { TareasBotPanel } from "./tareas-bot-panel";

const CLAVE_NIVELES = "starseed.astraura.niveles-bots";
const CLAVE_ABIERTOS = "starseed.astraura.orbes-abiertos";

function leerMapa<T extends string>(clave: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(clave) ?? "{}");
    return bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? (bruto as Record<string, T>) : {};
  } catch { return {}; }
}
function escribirMapa(clave: string, mapa: Record<string, string>): void {
  try { window.localStorage.setItem(clave, JSON.stringify(mapa)); } catch { /* sin espacio */ }
}

const nuevoId = () =>
  `bot:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

/** Copia descargable del bot (regla de Alex: nada se borra sin copia). */
export function descargarCopia(bot: Bot): void {
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bot, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bot.nombre.replace(/\s+/g, "-").toLowerCase()}.bot.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* entornos sin descarga: el diálogo sigue mostrando la copia */ }
}

const etiquetaOrigen = (b: Bot) =>
  b.origen === "astraura" ? "Astraura local" : b.origen === "ag-ui" ? "Invitado (AG-UI)" : "Externo";

const btnIcono =
  "cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground";

export function PanelBots({ perfilId, cuentaId }: { perfilId: string; cuentaId: string }) {
  const [bots, setBots] = useState<Bot[]>(() => leerBots(perfilId, cuentaId));
  const [niveles, setNiveles] = useState<Record<string, NivelBot>>(() => leerMapa(CLAVE_NIVELES));
  const [abiertos, setAbiertos] = useState<Record<string, string>>(() => leerMapa(CLAVE_ABIERTOS));
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Bot | null>(null);
  const [tareasDe, setTareasDe] = useState<string | null>(null);

  useEffect(() => { guardarBots(bots, Date.now()); }, [bots]);
  useEffect(() => { escribirMapa(CLAVE_NIVELES, niveles); }, [niveles]);
  useEffect(() => { escribirMapa(CLAVE_ABIERTOS, abiertos); }, [abiertos]);

  const idPred = `astraura:${perfilId}`;
  const alternarOrbe = (id: string) => {
    const abierto = !abiertos[id];
    setAbiertos((m) => ({ ...m, [id]: abierto ? "1" : "" }));
    window.dispatchEvent(new CustomEvent("starseed:orbe-bot", { detail: { id, abierto } }));
  };
  const crear = () => {
    const plantilla = botPredeterminado(perfilId, cuentaId);
    const nuevo: Bot = { ...plantilla, id: nuevoId(), nombre: `Bot ${bots.length + 1}`, activo: true };
    setBots((bs) => [...bs, nuevo]);
  };
  const duplicar = (b: Bot) =>
    setBots((bs) => [...bs, { ...b, id: nuevoId(), nombre: `${b.nombre} (copia)` }]);
  const pausar = (id: string) =>
    setBots((bs) => bs.map((b) => (b.id === id ? { ...b, activo: !b.activo } : b)));
  const confirmarBorrar = () => {
    if (!borrando) return;
    if (borrando.id === idPred) pausar(borrando.id);
    else setBots((bs) => bs.filter((b) => b.id !== borrando.id));
    setBorrando(null);
  };
  const guardarEdicion = (bot: Bot, nivel: NivelBot) => {
    setBots((bs) => bs.map((b) => (b.id === bot.id ? bot : b)));
    setNiveles((m) => ({ ...m, [bot.id]: nivel }));
    setEditando(null);
  };

  return (
    <section aria-label="Mis bots" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mis bots</h2>
        <button type="button" onClick={crear}
          className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-200 hover:opacity-90">
          <Plus size={16} /> Nuevo bot
        </button>
      </header>
      <ul className="space-y-2">
        {bots.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <QuantumOrbAvatar personaId={b.id} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.nombre}</p>
              <p className="text-xs text-muted-foreground">{etiquetaOrigen(b)} · {b.activo ? "activo" : "en pausa"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={btnIcono} onClick={() => alternarOrbe(b.id)}
                aria-label={abiertos[b.id] ? `Cerrar orbe de ${b.nombre}` : `Abrir orbe de ${b.nombre}`}>
                {abiertos[b.id] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" className={btnIcono} onClick={() => setEditando(b.id)} aria-label={`Editar ${b.nombre}`}>
                <Pencil size={16} />
              </button>
              <button type="button" className={btnIcono} onClick={() => setTareasDe((id) => (id === b.id ? null : b.id))}
                aria-label={`Tareas de ${b.nombre}`}>
                <ListChecks size={16} />
              </button>
              <button type="button" className={btnIcono} onClick={() => pausar(b.id)}
                aria-label={b.activo ? `Pausar ${b.nombre}` : `Reanudar ${b.nombre}`}>
                {b.activo ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button type="button" className={btnIcono} onClick={() => duplicar(b)} aria-label={`Duplicar ${b.nombre}`}>
                <Copy size={16} />
              </button>
              {b.id !== idPred && (
                <button type="button" className={btnIcono} aria-label={`Borrar ${b.nombre}`}
                  onClick={() => { descargarCopia(b); setBorrando(b); }}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {tareasDe && bots.some((b) => b.id === tareasDe) && (
        <TareasBotPanel bot={bots.find((b) => b.id === tareasDe)!}
          nivel={niveles[tareasDe] ?? NIVEL_POR_DEFECTO} cuentaId={cuentaId} />
      )}
      {editando && (
        <div role="dialog" aria-label="Editor de bot" className="rounded-lg border border-border p-4">
          <EditorBot bot={bots.find((b) => b.id === editando)!} nivel={niveles[editando] ?? NIVEL_POR_DEFECTO}
            onGuardar={guardarEdicion} onCerrar={() => setEditando(null)} />
        </div>
      )}
      {borrando && (
        <div role="alertdialog" aria-label="Confirmar borrado" className="rounded-lg border border-destructive p-4 text-sm">
          <p>Se descargó una copia en JSON de «{borrando.nombre}». ¿Borrar el bot?</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setBorrando(null)}
              className="cursor-pointer rounded-md border border-border px-3 py-1.5 transition-colors duration-200 hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={confirmarBorrar}
              className="cursor-pointer rounded-md bg-destructive px-3 py-1.5 text-destructive-foreground transition-colors duration-200 hover:opacity-90">
              Borrar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
