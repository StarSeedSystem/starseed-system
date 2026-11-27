"use client";

/**
 * SeccionPermisos — ficha de neurona › Permisos (NEU1126B): reúne en un sitio los permisos que hoy viven
 * repartidos (control remoto y terminal, archivos, sincronía, aceptar sin preguntar…). Nada se enciende solo:
 * cada interruptor muestra el valor guardado y solo cambia cuando la persona lo toca.
 * Usa las mismas funciones de `lib/neurons` (`setPermission`, `setNeuronSettings`): no cambia ningún ajuste guardado.
 */

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  permissionsFor,
  setNeuronSettings,
  setPermission,
  settingsFor,
  type Neuron,
  type NeuronPermissions,
  type NeuronSettings,
} from "@/lib/neurons/neurons";

export interface OpcionPermiso {
  id: string;
  texto: string;
  ayuda: string;
  origen: "permiso" | "ajuste";
  clave: keyof NeuronPermissions | keyof NeuronSettings;
  /** Valor cuando no hay nada guardado (los ajustes ausentes cuentan como activos, salvo `syncExternal`). */
  porDefecto: boolean;
}

export const OPCIONES_PERMISO: readonly OpcionPermiso[] = [
  { id: "agent", texto: "Control remoto y terminal entre neuronas", ayuda: "Aceptar órdenes de agentes y de otras neuronas de tu cuenta.", origen: "permiso", clave: "agent", porDefecto: true },
  { id: "fileRequests", texto: "Archivos", ayuda: "Aceptar «Solicitar archivo a esta neurona».", origen: "ajuste", clave: "fileRequests", porDefecto: true },
  { id: "sync", texto: "Sincronía automática", ayuda: "Contexto, memorias y ajustes en vivo.", origen: "permiso", clave: "sync", porDefecto: true },
  { id: "syncBrains", texto: "Sincronizar memorias de los cerebros", ayuda: "Con esta neurona.", origen: "ajuste", clave: "syncBrains", porDefecto: true },
  { id: "syncLibrary", texto: "Sincronizar la biblioteca", ayuda: "Datos de la biblioteca de la cuenta.", origen: "ajuste", clave: "syncLibrary", porDefecto: true },
  { id: "syncNeurons", texto: "Sincronizar con las neuronas de la cuenta", ayuda: "Las demás neuronas de tu cuenta.", origen: "ajuste", clave: "syncNeurons", porDefecto: true },
  { id: "syncExternal", texto: "Sincronizar con neuronas de otras cuentas", ayuda: "Solo si tú lo enciendes.", origen: "ajuste", clave: "syncExternal", porDefecto: false },
  { id: "senses", texto: "Compartir sentidos", ayuda: "Micrófono, cámara y pantalla con Aurora, si los pide.", origen: "permiso", clave: "senses", porDefecto: true },
  { id: "screenVoice", texto: "Control de pantalla por voz", ayuda: "Herramientas de control de pantalla de Aurora.", origen: "ajuste", clave: "screenVoice", porDefecto: true },
  { id: "auroraListening", texto: "Escucha de fondo de Aurora", ayuda: "Solo efectiva con la app instalada.", origen: "ajuste", clave: "auroraListening", porDefecto: true },
  { id: "wake", texto: "Recibir avisos de otras neuronas", ayuda: "Notificaciones y despertares.", origen: "permiso", clave: "wake", porDefecto: true },
  { id: "compute", texto: "Servir cómputo", ayuda: "IA local (Ollama, WebLLM) para las demás neuronas.", origen: "permiso", clave: "compute", porDefecto: true },
  { id: "storage", texto: "Servir almacenamiento", ayuda: "Archivos y memorias que se replican aquí.", origen: "permiso", clave: "storage", porDefecto: true },
];

/** Valor actual de una opción, con el mismo criterio de «ausente» que el resto del OS. Pura. */
export function valorPermiso(
  o: OpcionPermiso,
  permisos: NeuronPermissions,
  ajustes: NeuronSettings,
): boolean {
  if (o.origen === "permiso") return permisos[o.clave as keyof NeuronPermissions] !== false;
  const v = ajustes[o.clave as keyof NeuronSettings];
  return typeof v === "boolean" ? v : o.porDefecto;
}

/** Cuántas opciones están encendidas, para el resumen de la cabecera. Pura. */
export function resumenPermisos(permisos: NeuronPermissions, ajustes: NeuronSettings): string {
  const on = OPCIONES_PERMISO.filter((o) => valorPermiso(o, permisos, ajustes)).length;
  return `${on} de ${OPCIONES_PERMISO.length} encendidos`;
}

interface Props {
  neurona: Neuron;
  alCambiar?: () => void;
}

export function SeccionPermisos({ neurona, alCambiar }: Props) {
  const [version, setVersion] = useState(0);
  void version;
  const permisos = permissionsFor(neurona.id);
  const ajustes = settingsFor(neurona.id);

  const cambiar = (o: OpcionPermiso, v: boolean) => {
    try {
      if (o.origen === "permiso") setPermission(neurona.id, o.clave as keyof NeuronPermissions, v);
      else setNeuronSettings(neurona.id, { [o.clave]: v } as Partial<NeuronSettings>);
    } catch { /* defensivo: no rompe la ficha */ }
    setVersion((n) => n + 1);
    alCambiar?.();
  };

  return (
    <div className="space-y-2" data-testid="seccion-permisos">
      <p className="text-xs text-muted-foreground">
        {resumenPermisos(permisos, ajustes)}. Nada se enciende solo: cada interruptor lo mueve la persona dueña.
      </p>
      <ul className="space-y-1">
        {OPCIONES_PERMISO.map((o) => {
          const activo = valorPermiso(o, permisos, ajustes);
          const idEtiqueta = `permiso-${neurona.id}-${o.id}`;
          return (
            <li key={o.id} className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border/40 p-2">
              <div className="min-w-0">
                <label id={idEtiqueta} className="block break-words text-sm">{o.texto}</label>
                <p className="break-words text-[11px] text-muted-foreground">{o.ayuda}</p>
              </div>
              <Switch checked={activo} aria-labelledby={idEtiqueta} onCheckedChange={(v) => cambiar(o, v)} className="shrink-0 cursor-pointer" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
