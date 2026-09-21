"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { escuchar, fijarChatActual, leerChatActual, leerModeloActual } from "@/lib/mando/asistente-cliente";
import { resolverEntregaRespuesta } from "@/lib/mando/agente-puente";

export interface MensajePuente { id: string; rol: "user" | "assistant"; texto: string; modelo?: string; fecha?: string; }
export interface ChatAgentePuenteProps { modo?: "panel" | "flotante"; onCerrar?: () => void; }

export function ChatAgentePuente({ modo = "panel", onCerrar }: ChatAgentePuenteProps) {
  const [mensajes, setMensajes] = useState<MensajePuente[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [chatId, setChatId] = useState<string | null>(null);
  const [modelo, setModelo] = useState(leerModeloActual());
  const [fechaCtx, setFechaCtx] = useState("");
  const [errorCandidatos, setErrorCandidatos] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChatId(leerChatActual());
    setFechaCtx(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
    return escuchar((a) => { if (a.chatId !== undefined) setChatId(a.chatId); if (a.modelo) setModelo(a.modelo); });
  }, []);

  useEffect(() => {
    if (!cargando) { setSegundos(0); return; }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [cargando]);

  useEffect(() => {
    if (typeof finRef.current?.scrollIntoView === "function") {
      finRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [mensajes, cargando]);

  const enviar = async () => {
    const texto = input;
    if (!texto.trim() || cargando) return;
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setMensajes((m) => [...m, { id: Date.now().toString(), rol: "user", texto, fecha: hora }]);
    setInput(""); setCargando(true); setErrorCandidatos(null);

    try {
      const res = await fetch("/api/mando/agente-puente", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto, chatId, modelo }),
      });
      const data = (await res.json()) as { ok?: boolean; chatId?: string; respuesta?: string; modelo?: string; error?: string };
      const entrega = resolverEntregaRespuesta(data, res.status);
      const respuesta = entrega.respuesta;
      if (res.ok && respuesta) {
        if (data.chatId) { setChatId(data.chatId); fijarChatActual(data.chatId); }
        setFechaCtx(hora);
        setMensajes((m) => [...m, { id: Date.now().toString(), rol: "assistant", texto: respuesta, modelo: data.modelo || modelo, fecha: hora }]);
        if (entrega.error) setErrorCandidatos(entrega.error);
      } else {
        const err = entrega.error || `Error ${res.status}. Fallaron candidatos de ${modelo}`;
        setErrorCandidatos(err);
        setMensajes((m) => [...m, { id: Date.now().toString(), rol: "assistant", texto: `⚠️ ${err}`, fecha: hora }]);
      }
    } catch {
      const err = `Red/Servidor no disponible. Modelo ${modelo} no respondió.`;
      setErrorCandidatos(err);
      setMensajes((m) => [...m, { id: Date.now().toString(), rol: "assistant", texto: `⚠️ ${err}`, fecha: hora }]);
    } finally { setCargando(false); }
  };

  return (
    <div data-testid="chat-agente-puente" className={`flex flex-col bg-zinc-950 text-zinc-100 rounded-xl border border-violet-500/20 ${modo === "flotante" ? "h-[450px] w-full" : "h-full min-h-[400px]"}`}>
      <div className="flex items-center justify-between border-b border-violet-500/20 p-3 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-semibold text-violet-200">Agente Puente</span>
          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">Ctx: {fechaCtx || "Vigente"}</span>
        </div>
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="cursor-pointer text-zinc-400 hover:text-white p-1" title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {mensajes.length === 0 && <div className="text-center text-zinc-500 py-6">Escribe una consulta para el Agente Puente del Mando.</div>}
        {mensajes.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.rol === "user" ? "items-end" : "items-start"}`}>
            <div className={`p-2.5 rounded-lg max-w-[85%] ${m.rol === "user" ? "bg-violet-600/30 text-violet-100 border border-violet-500/30" : "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50"}`}>
              {m.texto}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1 px-1">
              {m.modelo && <span className="text-violet-400">Modelo: {m.modelo}</span>}
              <span>{m.fecha}</span>
            </div>
          </div>
        ))}
        {cargando && (
          <div className="text-violet-300 text-xs flex items-center gap-2 opacity-80 transition-opacity">
            <div className="h-2 w-2 rounded-full bg-violet-400 animate-ping" />
            <span>{segundos > 20 ? `Esperando respuesta de ${modelo} (más de 20 s: ${segundos}s)...` : `Pensando con ${modelo} (${segundos}s)...`}</span>
          </div>
        )}
        {errorCandidatos && (
          <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-rose-200 text-[11px]">
            <strong>Fallo de pasarela:</strong> {errorCandidatos}
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} className="p-2 border-t border-violet-500/20 flex gap-2 bg-zinc-900/40">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mensaje al Agente Puente..." className="flex-1 bg-zinc-900 border border-violet-500/30 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-400" />
        <button type="submit" disabled={cargando || !input.trim()} className="cursor-pointer bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white p-2 rounded-lg transition-colors">
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
