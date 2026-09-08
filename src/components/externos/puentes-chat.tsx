"use client";

// ══════════════════════════════════════════════════════════════
// Puentes de chat a servidores externos — Ola 281 · E4 (2026-09-07)
// Muestra los puentes disponibles (Hermes, terminal, Telegram, WhatsApp,
// SMS, webhook) del canal `external` del usuario, permite activar/desactivar
// cada uno, editar su configuración (con los secretos enmascarados), probar
// la conexión y vincular el chat activo. Los secretos nunca salen completos
// del servidor: la UI trabaja con `enmascarar(config)`.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import {
  Plug,
  Power,
  Play,
  Pencil,
  Save,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROVEEDORES_PUENTE,
  enmascarar,
  loadChannels,
  saveChannel,
  type CampoPuente,
  type ExternalProvider,
  type MessagingChannel,
  type ProveedorPuente,
} from "@/lib/messaging/messaging-channels";

/** Propiedades del panel de puentes: el chat sobre el que se vincula. */
export interface PuentesChatProps {
  /** Id del chat activo (para «Vincular este chat»); opcional. */
  chatId?: string;
  /** Nombre legible del chat activo (para la confirmación). */
  chatNombre?: string;
}

export function PuentesChat({ chatId, chatNombre }: PuentesChatProps) {
  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<ExternalProvider | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);

  const canalExternal = channels.find((c) => c.scope === "external");

  const recargar = useCallback(async () => {
    setCargando(true);
    const lista = await loadChannels();
    setChannels(lista);
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const activar = useCallback(
    async (proveedor: ProveedorPuente, activo: boolean) => {
      setProcesando(proveedor.id);
      setAviso(null);
      const base = channels.find((c) => c.scope === "external");
      const canal: MessagingChannel = {
        ...(base ?? {
          scope: "external" as const,
          provider: "none",
          enabled: false,
          config: {},
          memory_enabled: true,
          context: {},
        }),
        provider: proveedor.id,
        enabled: activo,
      };
      const guardado = await saveChannel(canal);
      setChannels((prev) => prev.map((c) => (c.scope === "external" ? guardado : c)));
      setProcesando(null);
      setAviso({ ok: true, msg: activo ? "Puente activado." : "Puente desactivado." });
    },
    [channels],
  );

  return (
    <div data-testid="puentes-chat" className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <Plug className="h-3 w-3 text-cyan-400" />
        <span className="flex-1 font-semibold text-cyan-100">Puentes a servidores externos</span>
        <button
          onClick={() => void recargar()}
          className="cursor-pointer rounded p-1 text-cyan-300/60 transition-colors duration-150 hover:bg-white/10 hover:text-cyan-100"
          title="Recargar puentes"
        >
          <RefreshCw className={cn("h-3 w-3", cargando && "animate-spin")} />
        </button>
      </div>

      {cargando ? (
        <p className="px-2 py-2 text-[11px] text-cyan-100/40">Cargando puentes…</p>
      ) : (
        <ul className="space-y-1">
          {PROVEEDORES_PUENTE.map((p) => (
            <PuenteFila
              key={p.id}
              proveedor={p}
              canal={canalExternal}
              editando={editando === p.id}
              procesando={procesando === p.id}
              chatId={chatId}
              chatNombre={chatNombre}
              onToggle={(activo) => void activar(p, activo)}
              onEditar={() => setEditando((e) => (e === p.id ? null : p.id))}
              onGuardado={(c) => {
                setEditando(null);
                setChannels((prev) => prev.map((x) => (x.scope === "external" ? c : x)));
                setAviso({ ok: true, msg: "Puente guardado." });
              }}
              onAviso={setAviso}
            />
          ))}
        </ul>
      )}

      {aviso ? (
        <p
          className={cn(
            "rounded px-2 py-1 text-[10px]",
            aviso.ok ? "text-emerald-300" : "text-rose-300",
          )}
        >
          {aviso.msg}
        </p>
      ) : null}
    </div>
  );
}

/** Fila de un puente: estado, interruptor, editar, probar y vincular chat. */
function PuenteFila({
  proveedor,
  canal,
  editando,
  procesando,
  chatId,
  chatNombre,
  onToggle,
  onEditar,
  onGuardado,
  onAviso,
}: {
  proveedor: ProveedorPuente;
  canal: MessagingChannel | undefined;
  editando: boolean;
  procesando: boolean;
  chatId?: string;
  chatNombre?: string;
  onToggle: (activo: boolean) => void;
  onEditar: () => void;
  onGuardado: (canal: MessagingChannel) => void;
  onAviso: (aviso: { ok: boolean; msg: string }) => void;
}) {
  const activo = canal?.provider === proveedor.id && canal?.enabled === true;
  const ultimo = canal?.context && typeof canal.context.ultimo === "string"
    ? canal.context.ultimo
    : null;

  const probar = async () => {
    onAviso({ ok: true, msg: "Comprobando conexión…" });
    if (proveedor.id === "telegram") {
      try {
        const res = await fetch("/api/telegram/test", { method: "POST" });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        onAviso(
          data.ok === true
            ? { ok: true, msg: "El bot responde correctamente." }
            : { ok: false, msg: data.error ?? "El bot no respondió." },
        );
      } catch {
        onAviso({ ok: false, msg: "Error de red al probar el bot." });
      }
      return;
    }
    // Para el resto aún no hay sonda remota real: respuesta honesta.
    onAviso({ ok: true, msg: "Prueba no disponible aún para este puente." });
  };

  const vincular = () => {
    if (!chatId) {
      onAviso({ ok: false, msg: "Abre un chat primero para vincularlo." });
      return;
    }
    if (!canal) return;
    const lista = Array.isArray(canal.context.chats) ? (canal.context.chats as string[]) : [];
    if (lista.includes(chatId)) {
      onAviso({ ok: true, msg: "Este chat ya está vinculado." });
      return;
    }
    void saveChannel({
      ...canal,
      context: { ...canal.context, chats: [...lista, chatId] },
    }).then((c) => {
      onGuardado(c);
      onAviso({ ok: true, msg: `Chat «${chatNombre ?? chatId}» vinculado.` });
    });
  };

  return (
    <li className="rounded-lg border border-cyan-500/10 p-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-medium text-cyan-100">
            <span className="truncate">{proveedor.nombre}</span>
            <span
              className={cn(
                "rounded px-1 text-[9px] font-semibold",
                activo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-cyan-100/50",
              )}
            >
              {activo ? "activo" : "inactivo"}
            </span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-[10px] text-cyan-100/50">{proveedor.descripcion}</p>
          {ultimo ? <p className="text-[9px] text-cyan-100/35">último uso {ultimo}</p> : null}
        </div>
        <button
          onClick={() => onToggle(!activo)}
          disabled={procesando}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors duration-150",
            activo
              ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
              : "bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25",
          )}
          title={activo ? "Desactivar puente" : "Activar puente"}
        >
          <Power className="h-3 w-3" />
          {procesando ? "…" : activo ? "Desactivar" : "Activar"}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          onClick={onEditar}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-cyan-200/70 hover:bg-white/5 hover:text-cyan-100"
          title={`Configurar ${proveedor.nombre}`}
        >
          <Pencil className="mr-1 inline h-3 w-3" />Editar
        </button>
        <button
          onClick={() => void probar()}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-cyan-200/70 hover:bg-white/5 hover:text-cyan-100"
          title="Probar conexión"
        >
          <Play className="mr-1 inline h-3 w-3" />Probar
        </button>
        <button
          onClick={vincular}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-cyan-200/70 hover:bg-white/5 hover:text-cyan-100"
          title="Vincular este chat al puente"
        >
          <Link2 className="mr-1 inline h-3 w-3" />Vincular este chat
        </button>
        <a
          href={proveedor.docs}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-cyan-200/70 hover:bg-white/5 hover:text-cyan-100"
          title="Documentación"
        >
          <ExternalLink className="mr-1 inline h-3 w-3" />Docs
        </a>
      </div>

      {editando ? (
        <FormularioPuente
          proveedor={proveedor}
          canal={canal}
          onGuardado={onGuardado}
          onAviso={onAviso}
        />
      ) : null}
    </li>
  );
}

/** Formulario de configuración de un puente, generado desde el catálogo. */
function FormularioPuente({
  proveedor,
  canal,
  onGuardado,
  onAviso,
}: {
  proveedor: ProveedorPuente;
  canal: MessagingChannel | undefined;
  onGuardado: (canal: MessagingChannel) => void;
  onAviso: (aviso: { ok: boolean; msg: string }) => void;
}) {
  // Inicializamos el draft con los valores enmascarados: los secretos se ven
  // como `••••1234` y, si el usuario no los toca, se conservan tal cual.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    enmascarar(canal?.config ?? {}),
  );
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const previo = canal?.config ?? {};
    const config: Record<string, unknown> = { ...previo };
    for (const campo of proveedor.campos) {
      const valor = (draft[campo.clave] ?? "").trim();
      if (campo.tipo === "secreto") {
        // Si dejó la máscara (o vacío), conservamos el secreto guardado.
        if (!valor || valor.includes("••••")) continue;
        config[campo.clave] = valor;
      } else {
        config[campo.clave] = campo.tipo === "numero" ? (valor ? Number(valor) : "") : valor;
      }
    }
    const base: MessagingChannel = {
      ...(canal ?? {
        scope: "external" as const,
        provider: "none",
        enabled: false,
        config: {},
        memory_enabled: true,
        context: {},
      }),
      provider: proveedor.id,
      config,
    };
    const guardado = await saveChannel(base);
    setGuardando(false);
    onGuardado(guardado);
  };

  return (
    <div className="mt-2 space-y-1.5 rounded border border-cyan-500/15 bg-black/20 p-2">
      {proveedor.campos.map((campo) => (
        <CampoInput
          key={campo.clave}
          campo={campo}
          valor={draft[campo.clave] ?? ""}
          onChange={(v) => setDraft((d) => ({ ...d, [campo.clave]: v }))}
        />
      ))}
      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="flex cursor-pointer items-center gap-1 rounded bg-cyan-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar
        </button>
        <button
          onClick={() => onAviso({ ok: true, msg: "Cambios descartados." })}
          className="cursor-pointer rounded px-2 py-1 text-[10px] text-cyan-200/70 hover:bg-white/5 hover:text-cyan-100"
        >
          <X className="mr-1 inline h-3 w-3" />Cancelar
        </button>
      </div>
    </div>
  );
}

/** Un campo del formulario, con su tipo (máscara para secretos). */
function CampoInput({
  campo,
  valor,
  onChange,
}: {
  campo: CampoPuente;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-cyan-100/70">{campo.etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        type={campo.tipo === "secreto" ? "password" : campo.tipo === "numero" ? "number" : campo.tipo === "url" ? "url" : "text"}
        placeholder={campo.tipo === "secreto" && valor ? "…" : undefined}
        className="w-full rounded bg-black/40 px-2 py-1 text-[11px] text-cyan-50 outline-none ring-1 ring-cyan-500/20 focus:ring-cyan-400/40"
      />
      {campo.ayuda ? <span className="mt-0.5 block text-[9px] text-cyan-100/40">{campo.ayuda}</span> : null}
    </label>
  );
}