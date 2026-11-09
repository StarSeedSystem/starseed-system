"use client";

/**
 * PaginaLlamadas (LLA1108G) — la página de llamadas: empezar una llamada de voz, vídeo o pantalla con un contacto o
 * grupo (sus chats) y el historial de las que hubo, con el medio, la duración y la grabación, y «Volver a llamar».
 * Cada acción funciona o dice por qué no. El historial vive solo en este aparato.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MonitorUp, Phone, PhoneCall, PhoneIncoming, PhoneMissed, Video } from "lucide-react";
import { empezarLlamada, hayLlamadaEnCurso } from "@/lib/llamadas/acciones";
import { describirDuracion } from "@/lib/llamadas/formato";
import { soportaLlamadas, soportaPantalla } from "@/lib/llamadas/medios";
import { leerHistorial, puedeRellamar, resumenFila, type FilaHistorial } from "@/lib/llamadas/superficie/historial-llamadas";
import type { TipoLlamada } from "@/lib/llamadas/tipos";
import { invitablesDeChats } from "./superficie/deps-motor";
import type { Invitable } from "@/lib/llamadas/superficie/grupo-invitar";

const btn = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-400/15 px-3 py-1.5 text-[13px] text-violet-50 transition-colors duration-200 hover:bg-violet-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40";

interface ChatLlamable extends Invitable {
  miembrosIds: string[];
}

function almacen(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

async function chatsLlamables(): Promise<ChatLlamable[]> {
  try {
    const dm = await import("@/lib/messages/dm");
    const hilos = await dm.listThreads();
    return hilos.map((h) => ({
      id: h.id,
      nombre: h.title || (h.kind === "group" ? "Grupo" : "Chat"),
      clase: h.kind === "group" ? ("grupo" as const) : ("usuario" as const),
      miembros: h.memberIds.length,
      miembrosIds: h.memberIds,
    }));
  } catch {
    return [];
  }
}

export function PaginaLlamadas() {
  const [chats, setChats] = useState<ChatLlamable[]>([]);
  const [historial, setHistorial] = useState<FilaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const pantallaOk = soportaPantalla();

  useEffect(() => {
    let vivo = true;
    setHistorial(leerHistorial(almacen()));
    void chatsLlamables().then((l) => {
      if (!vivo) return;
      setChats(l);
      setCargando(false);
    });
    void invitablesDeChats();
    return () => {
      vivo = false;
    };
  }, []);

  const llamar = useCallback(async (o: { hiloId: string; titulo: string; miembros: string[]; tipo: TipoLlamada; tipoChat: "dm" | "grupo"; aviso?: string }) => {
    if (!soportaLlamadas()) {
      toast.error("Este navegador no permite llamadas: hace falta una conexión segura y un navegador actual.");
      return;
    }
    if (hayLlamadaEnCurso()) {
      toast.message("Ya estás en una llamada: cuelga antes de empezar otra.");
      return;
    }
    const ok = await empezarLlamada({ hiloId: o.hiloId, tipo: o.tipo, titulo: o.titulo, miembros: o.miembros, tipoChat: o.tipoChat });
    if (ok && o.aviso) toast.message(o.aviso);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-white">
      <header>
        <h1 className="text-xl font-semibold">Llamadas</h1>
        <p className="text-[13px] text-white/65">Voz, vídeo o pantalla con un contacto o grupo. Todo funciona o te dice por qué no.</p>
      </header>

      <section aria-labelledby="titulo-llamar" className="space-y-2">
        <h2 id="titulo-llamar" className="text-[15px] font-medium">Llamar</h2>
        {cargando ? <p className="text-[13px] text-white/60">Buscando tus chats…</p> : chats.length === 0 ? <p className="text-[13px] text-white/60">Aún no hay chats con quien llamar. Escribe a alguien desde Mensajes y vuelve.</p> : null}
        <ul className="space-y-1.5">
          {chats.map((c) => {
            const tipoChat = c.clase === "grupo" ? "grupo" : "dm";
            const base = { hiloId: c.id, titulo: c.nombre, miembros: c.miembrosIds, tipoChat } as const;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px]">{c.nombre}<span className="ml-2 text-[11px] text-white/50">{c.clase === "grupo" ? `${c.miembros} personas` : "contacto"}</span></span>
                <button type="button" className={btn} onClick={() => void llamar({ ...base, tipo: "audio" })} aria-label={`Llamada de voz con ${c.nombre}`}><Phone className="h-3.5 w-3.5" /> Voz</button>
                <button type="button" className={btn} onClick={() => void llamar({ ...base, tipo: "video" })} aria-label={`Videollamada con ${c.nombre}`}><Video className="h-3.5 w-3.5" /> Vídeo</button>
                <button
                  type="button"
                  className={btn}
                  disabled={!pantallaOk}
                  title={pantallaOk ? "Empieza una llamada de voz; luego pulsa S o «Compartir pantalla»" : "Este aparato no puede compartir la pantalla (Android y algunos motores web no lo ofrecen)."}
                  onClick={() => void llamar({ ...base, tipo: "audio", aviso: "Llamada de voz iniciada: pulsa «Compartir pantalla» (S) cuando contesten." })}
                  aria-label={`Compartir pantalla con ${c.nombre}`}
                >
                  <MonitorUp className="h-3.5 w-3.5" /> Pantalla
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="titulo-historial" className="space-y-2">
        <h2 id="titulo-historial" className="text-[15px] font-medium">Historial</h2>
        {historial.length === 0 && <p className="text-[13px] text-white/60">Todavía no hay llamadas en este aparato.</p>}
        <ul className="space-y-1.5">
          {historial.map((f) => {
            const re = puedeRellamar(f);
            const Icono = !f.contestada ? PhoneMissed : f.saliente ? PhoneCall : PhoneIncoming;
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <Icono className={`h-4 w-4 ${f.contestada ? "text-emerald-300" : "text-rose-300"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{f.titulo}</p>
                  <p className="truncate text-[12px] text-white/60">
                    {resumenFila(f, describirDuracion)} · {new Date(f.fin).toLocaleString("es")}
                  </p>
                  {f.grabacion && <p className="truncate text-[11px] text-rose-200">Grabación: {f.grabacion}</p>}
                </div>
                <button
                  type="button"
                  className={btn}
                  disabled={!re.ok}
                  title={re.ok ? undefined : re.motivo}
                  aria-label={`Volver a llamar a ${f.titulo}`}
                  onClick={() => void llamar({ hiloId: f.hiloId as string, titulo: f.titulo, miembros: f.miembros, tipo: f.tipo === "video" ? "video" : "audio", tipoChat: f.tipoHilo ?? "dm" })}
                >
                  <Phone className="h-3.5 w-3.5" /> Volver a llamar
                </button>
                {!re.ok && <span className="basis-full text-[11px] text-white/50">{re.motivo}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
