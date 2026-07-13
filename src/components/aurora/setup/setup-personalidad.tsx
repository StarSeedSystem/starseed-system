"use client";

/**
 * Pestaña PERSONALIDAD del Centro de Configuración (Adenda 67 · P1-1).
 * ============================================================================
 * Lo que YA existía se reutiliza tal cual (no se duplica): `PersonalitiesPanel`
 * trae presets, el editor completo de niveladores (emociones, ego, filosofía,
 * sentidos, capacidades, actitud, cultura, respuesta), import/export JSON,
 * instalar desde la Biblioteca y asignación por contexto.
 *
 * Lo que se AÑADE aquí (era lo que faltaba):
 *   · PERFIL por personalidad: nombre visible, handle y AVATAR generable
 *     automáticamente — procedural (SVG determinista, offline, siempre funciona)
 *     o generado con IA gratis y sin clave (Pollinations). Nunca se finge: si el
 *     servicio externo falla, se dice y queda el procedural.
 *   · PERMISOS: qué puede hacer Aurora con esa personalidad y su perfil, y si
 *     APRENDE de su experiencia. Estos permisos entran DE VERDAD en el system
 *     prompt de cada petición (`personaPermissionsPromptBlock`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PersonalitiesPanel } from "@/components/aurora/personalities-panel";
import {
  listPersonalityProfiles,
  resolvePersonalityForContext,
  PERSONALITY_CHANGED_EVENT,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import {
  getPersonaProfile,
  savePersonaProfile,
  DEFAULT_PERSONA_PERMISSIONS,
  type PersonaPermissions,
  type PersonaProfile,
} from "@/lib/aurora/setup-config";
import {
  avatarPromptFor,
  generatedAvatarUrl,
  proceduralAvatarDataUrl,
} from "@/lib/aurora/persona-avatar";
import { Block, Note, Toggle, btnCls, btnPrimaryCls, inputCls, labelCls, selectCls } from "./setup-ui";

const PERMISOS: Array<{ key: keyof PersonaPermissions; label: string; hint: string }> = [
  {
    key: "controlarPerfil",
    label: "Editar el perfil de esta personalidad",
    hint: "Cambiar su nombre, bio y avatar, y organizar su biblioteca.",
  },
  {
    key: "publicar",
    label: "Publicar en la red con este perfil",
    hint: "Desactivado por defecto: nadie habla en público por ti sin que lo pidas.",
  },
  {
    key: "responder",
    label: "Responder mensajes y comentarios",
    hint: "Desactivado por defecto. Aurora te propondrá el borrador en su lugar.",
  },
  {
    key: "gestionarBiblioteca",
    label: "Guardar e instalar en su Biblioteca",
    hint: "Permite que Aurora guarde lo que creáis y traiga paquetes que necesite.",
  },
  {
    key: "operarPantalla",
    label: "Operar la pantalla del OS",
    hint: "Navegar, abrir secciones y rellenar por ti. Confirma antes de acciones destructivas.",
  },
  {
    key: "aprender",
    label: "Aprender de su experiencia",
    hint: "Guarda como memoria lo relevante de vuestras conversaciones bajo esta personalidad.",
  },
];

export function SetupPersonalidad() {
  const [profiles, setProfiles] = useState<PersonalityProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [persona, setPersona] = useState<PersonaProfile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [imgError, setImgError] = useState(false);

  const refresh = useCallback(() => {
    const list = listPersonalityProfiles();
    setProfiles(list);
    setSelectedId((prev) => {
      if (prev && list.some((p) => p.id === prev)) return prev;
      const active = resolvePersonalityForContext({});
      return active?.id ?? list[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    const h = () => refresh();
    window.addEventListener(PERSONALITY_CHANGED_EVENT, h);
    return () => window.removeEventListener(PERSONALITY_CHANGED_EVENT, h);
  }, [refresh]);

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setPersona(null);
      return;
    }
    const pp = getPersonaProfile(selected.id, selected.name);
    setPersona(pp);
    setPrompt(avatarPromptFor(selected));
    setImgError(false);
  }, [selected]);

  const save = useCallback(
    (patch: Partial<PersonaProfile>) => {
      if (!persona) return;
      const next = savePersonaProfile({ ...persona, ...patch });
      setPersona(next);
    },
    [persona],
  );

  const savePermiso = useCallback(
    (key: keyof PersonaPermissions, value: boolean) => {
      if (!persona) return;
      const next = savePersonaProfile({
        ...persona,
        permisos: { ...persona.permisos, [key]: value },
      });
      setPersona(next);
    },
    [persona],
  );

  const generarProcedural = useCallback(() => {
    if (!selected) return;
    const url = proceduralAvatarDataUrl(selected);
    save({ avatar: url, avatarKind: "procedural" });
    toast.success("Avatar generado a partir de los rasgos de esta personalidad.");
  }, [selected, save]);

  const generarIA = useCallback(() => {
    if (!selected) return;
    setGenerating(true);
    setImgError(false);
    const url = generatedAvatarUrl(selected, { prompt });
    save({ avatar: url, avatarKind: "generada" });
    // La imagen se resuelve al cargarse el <img>: el estado se cierra en onLoad/onError.
  }, [selected, prompt, save]);

  const avatarSrc = persona?.avatar || (selected ? proceduralAvatarDataUrl(selected) : "");

  return (
    <div className="space-y-3">
      <Note kind="info">
        Elige una personalidad, edítala al detalle y dale su propio <strong>perfil</strong> (avatar +
        permisos). Puedes <strong>instalar archivos de personalidad ya configurados</strong> desde un JSON o
        desde tu Biblioteca — el panel de abajo lo hace.
      </Note>

      {/* ── Perfil + avatar + permisos (lo nuevo) ── */}
      <Block
        title="Perfil de la personalidad"
        icon="UserRound"
        hint="Cada personalidad puede tener su propio perfil, con imagen y permisos propios."
      >
        {profiles.length === 0 ? (
          <p className="text-[11px] text-white/45">Aún no hay personalidades. Crea una en el panel de abajo.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="persona-select">
                Personalidad
              </label>
              <select
                id="persona-select"
                className={selectCls}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.personaje ? ` · ${p.personaje}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selected && persona && (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Avatar */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/12 bg-black/40">
                      {avatarSrc && !imgError ? (
                        // `<img>` a propósito (como el resto del OS): la fuente puede ser un
                        // data:URL de SVG o una URL externa (Pollinations), y ninguna de las dos
                        // pasa por el optimizador de Next ni está en `images.remotePatterns`.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarSrc}
                          alt={`Avatar de ${selected.name}`}
                          className="h-full w-full object-cover"
                          onLoad={() => setGenerating(false)}
                          onError={() => {
                            setGenerating(false);
                            setImgError(true);
                          }}
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-[10px] text-white/35">
                          sin imagen
                        </span>
                      )}
                      {generating && (
                        <span className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] text-white/70">
                          generando…
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-white/40">
                      {persona.avatarKind === "generada"
                        ? "Generada con IA"
                        : persona.avatarKind === "procedural"
                          ? "Procedural"
                          : persona.avatarKind === "url"
                            ? "Externa"
                            : "Por defecto"}
                    </span>
                  </div>

                  {/* Datos + acciones */}
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={labelCls} htmlFor="persona-name">
                          Nombre visible
                        </label>
                        <input
                          id="persona-name"
                          type="text"
                          className={inputCls}
                          value={persona.displayName}
                          maxLength={80}
                          placeholder={selected.name}
                          onChange={(e) => save({ displayName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="persona-handle">
                          Handle sugerido
                        </label>
                        <input
                          id="persona-handle"
                          type="text"
                          className={inputCls}
                          value={persona.handle}
                          maxLength={40}
                          placeholder="@mentora"
                          onChange={(e) => save({ handle: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btnCls} onClick={generarProcedural}>
                        <Sparkles className="h-3 w-3" /> Generar del carácter
                      </button>
                      <button type="button" className={btnCls} onClick={generarIA} disabled={generating}>
                        <Wand2 className={cn("h-3 w-3", generating && "animate-pulse")} /> Generar con IA
                        (gratis)
                      </button>
                      {persona.avatar && (
                        <a
                          className={btnCls}
                          href={persona.avatar}
                          download={`avatar-${selected.name}.svg`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="h-3 w-3" /> Abrir
                        </a>
                      )}
                      <button
                        type="button"
                        className={btnCls}
                        onClick={() => {
                          save({ avatar: "", avatarKind: "ninguno" });
                          setImgError(false);
                        }}
                      >
                        <RefreshCw className="h-3 w-3" /> Quitar
                      </button>
                    </div>

                    <div>
                      <label className={labelCls} htmlFor="persona-prompt">
                        Descripción de la imagen (editable)
                      </label>
                      <input
                        id="persona-prompt"
                        type="text"
                        className={inputCls}
                        value={prompt}
                        maxLength={600}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {imgError && (
                  <Note kind="warn">
                    No pude cargar la imagen generada (el servicio externo no respondió). El avatar
                    procedural sí funciona siempre, también sin conexión: pulsa «Generar del carácter».
                  </Note>
                )}
                <Note kind="info">
                  «Generar del carácter» dibuja un SVG único a partir de los niveladores de esta personalidad
                  (offline, sin depender de nadie). «Generar con IA» usa Pollinations: gratis y sin clave,
                  pero es un servicio externo y puede fallar.
                </Note>

                {/* Permisos */}
                <div className="space-y-1.5">
                  <span className={labelCls}>
                    ¿Qué puede hacer Aurora con esta personalidad y su perfil?
                  </span>
                  {PERMISOS.map((p) => (
                    <Toggle
                      key={p.key}
                      checked={persona.permisos[p.key]}
                      onChange={(v) => savePermiso(p.key, v)}
                      label={p.label}
                      hint={p.hint}
                      tone={p.key === "publicar" || p.key === "responder" ? "azure" : "lime"}
                    />
                  ))}
                  <Note kind="ok">
                    Estos permisos no son decorativos: se inyectan en las instrucciones de Aurora en cada
                    petición bajo esta personalidad. Por defecto, publicar y responder están{" "}
                    <strong>desactivados</strong> (soberanía primero).
                  </Note>
                </div>

                <div>
                  <label className={labelCls} htmlFor="persona-notas">
                    Notas para Aurora sobre este perfil
                  </label>
                  <input
                    id="persona-notas"
                    type="text"
                    className={inputCls}
                    value={persona.notas}
                    maxLength={400}
                    placeholder="p. ej. este perfil solo actúa en la asamblea de mi barrio"
                    onChange={(e) => save({ notas: e.target.value })}
                  />
                </div>

                <button
                  type="button"
                  className={btnPrimaryCls}
                  onClick={() => {
                    savePersonaProfile({
                      ...persona,
                      permisos: { ...DEFAULT_PERSONA_PERMISSIONS },
                    });
                    setPersona(getPersonaProfile(selected.id, selected.name));
                    toast.success("Permisos restaurados a los valores soberanos por defecto.");
                  }}
                >
                  Restaurar permisos por defecto
                </button>
              </>
            )}
          </div>
        )}
      </Block>

      {/* ── Panel completo ya existente: presets, editor, import/export, Biblioteca ── */}
      <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-2.5")}>
        <PersonalitiesPanel />
      </div>
    </div>
  );
}

export default SetupPersonalidad;
