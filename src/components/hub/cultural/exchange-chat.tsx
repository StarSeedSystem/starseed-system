"use client";

/*
 * ExchangeChat — mini-chat de Astraura INLINE con un system prompt dado.
 * Usado por el intercambio de idiomas y el puente cultural para "practicar"
 * con el facilitador cultural. Streaming real vía `astrauraChat` (router gratis).
 * Honesto: si el router no puede responder, muestra el error, no UI muerta.
 */

import { useRef, useState } from "react";
import { Send, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";

interface Props {
    systemPrompt: string;
    partnerName?: string;
    /** Primer mensaje sugerido para el usuario. */
    starter?: string;
    onClose?: () => void;
    className?: string;
}

interface Msg {
    role: "user" | "assistant";
    content: string;
    error?: boolean;
}

export function ExchangeChat({ systemPrompt, partnerName, starter, onClose, className }: Props) {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState(starter ?? "");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const scrollToEnd = () => {
        requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    };

    const send = async () => {
        const text = input.trim();
        if (!text || busy) return;
        const history: Msg[] = [...messages, { role: "user", content: text }];
        setMessages([...history, { role: "assistant", content: "" }]);
        setInput("");
        setBusy(true);
        scrollToEnd();

        const chatMessages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        ];

        try {
            let acc = "";
            const res = await astrauraChat({
                messages: chatMessages,
                temperature: 0.6,
                maxTokens: 700,
                taskHint: "fast",
                onChunk: (delta) => {
                    acc += delta;
                    setMessages((prev) => {
                        const next = prev.slice();
                        next[next.length - 1] = { role: "assistant", content: acc };
                        return next;
                    });
                    scrollToEnd();
                },
            });
            const finalText = (res?.text ?? acc).trim();
            setMessages((prev) => {
                const next = prev.slice();
                next[next.length - 1] = finalText
                    ? { role: "assistant", content: finalText }
                    : { role: "assistant", content: "No obtuve respuesta ahora mismo. Inténtalo de nuevo en un momento.", error: true };
                return next;
            });
        } catch (e) {
            setMessages((prev) => {
                const next = prev.slice();
                next[next.length - 1] = {
                    role: "assistant",
                    content: (e as Error)?.message || "El facilitador no está disponible ahora mismo.",
                    error: true,
                };
                return next;
            });
        } finally {
            setBusy(false);
            scrollToEnd();
        }
    };

    return (
        <div className={cn("flex flex-col rounded-2xl border border-primary/20 bg-background/40 backdrop-blur", className)}>
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
                    <Sparkles className="size-3.5" /> Facilitador cultural{partnerName ? ` · ${partnerName}` : ""}
                </p>
                {onClose && (
                    <button type="button" onClick={onClose} className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-white" aria-label="Cerrar">
                        <X className="size-3.5" />
                    </button>
                )}
            </div>

            <div ref={scrollRef} className="max-h-64 min-h-[3rem] space-y-2 overflow-y-auto px-3 py-2 custom-scrollbar">
                {messages.length === 0 && (
                    <p className="py-2 text-center text-[11px] text-muted-foreground">
                        Astraura te guía en el intercambio. Escribe un saludo o pulsa enviar con la frase sugerida.
                    </p>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                        <div
                            className={cn(
                                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                                m.role === "user"
                                    ? "bg-primary/20 text-foreground"
                                    : m.error
                                        ? "border border-red-500/25 bg-red-500/10 text-red-300"
                                        : "border border-white/10 bg-white/[0.04] text-foreground/90",
                            )}
                        >
                            {m.content || (busy && i === messages.length - 1 ? <Loader2 className="size-3.5 animate-spin" /> : "")}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 border-t border-white/10 p-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void send();
                        }
                    }}
                    placeholder="Escribe tu mensaje…"
                    className="min-h-[40px] flex-1 rounded-full border border-white/12 bg-background/50 px-3 py-2 text-xs text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                    type="button"
                    onClick={send}
                    disabled={busy || !input.trim()}
                    className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-colors hover:bg-primary disabled:opacity-50"
                    aria-label="Enviar"
                >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
            </div>
        </div>
    );
}

export default ExchangeChat;
