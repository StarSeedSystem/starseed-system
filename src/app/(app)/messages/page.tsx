"use client";
import { useState, useRef, useEffect } from "react";
import { conversations, ConversationFull } from "@/lib/data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, Video, MoreVertical, Paperclip, Send, Mic, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserContext } from "@/context/user-context";

export default function MessagesPage() {
    const [activeConvoId, setActiveConvoId] = useState<string>(conversations[0].id);
    const [localConversations, setLocalConversations] = useState(conversations);
    const [inputText, setInputText] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const { addMemory } = useUserContext();

    const activeConvo = localConversations.find(c => c.id === activeConvoId);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeConvo?.messages]);

    const handleSendMessage = () => {
        if (!inputText.trim()) return;

        const newMessage = {
            id: `msg-local-${Date.now()}`,
            author: "Tú",
            avatar: "https://placehold.co/100x100.png", // User avatar placeholder
            dataAiHint: "user avatar",
            timestamp: "Ahora",
            content: { type: 'text' as const, text: inputText }
        };

        setLocalConversations(prev => prev.map(c => {
            if (c.id === activeConvoId) {
                return {
                    ...c,
                    messages: [...c.messages, newMessage],
                    lastMessage: inputText,
                    lastMessageTimestamp: "Ahora"
                };
            }
            return c;
        }));

        // AI Memory Hook
        addMemory("interaction", `Mensaje enviado a ${activeConvo?.name}: "${inputText}"`, 0.2);

        setInputText("");
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-card border rounded-xl overflow-hidden shadow-sm">
            {/* Sidebar: Conversation List */}
            <div className="w-80 border-r flex flex-col bg-muted/10">
                <div className="p-4 border-b">
                    <h2 className="font-bold text-lg font-headline mb-4">Mensajes</h2>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar conversaciones..." className="pl-9 bg-background/50" />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="flex flex-col">
                        {localConversations.map(convo => (
                            <button
                                key={convo.id}
                                onClick={() => setActiveConvoId(convo.id)}
                                className={cn(
                                    "flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors border-b last:border-0",
                                    activeConvoId === convo.id && "bg-muted/50 border-l-4 border-l-primary"
                                )}
                            >
                                <div className="relative">
                                    <Avatar>
                                        <AvatarImage src={convo.avatar} />
                                        <AvatarFallback>{convo.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    {convo.unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] w-5 h-5 flex items-center justify-center rounded-full">
                                            {convo.unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold truncate text-sm">{convo.name}</span>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{convo.lastMessageTimestamp}</span>
                                    </div>
                                    <p className={cn(
                                        "text-xs truncate",
                                        convo.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                                    )}>
                                        {convo.lastMessage}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main: Chat Window */}
            {activeConvo ? (
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Chat Header */}
                    <div className="p-4 border-b flex justify-between items-center bg-background/50 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={activeConvo.avatar} />
                                <AvatarFallback>{activeConvo.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="font-bold text-sm">{activeConvo.name}</h3>
                                <p className="text-xs text-muted-foreground">
                                    {activeConvo.type === 'group' ? 'Grupo • 12 miembros' : 'En línea hace 5m'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon"><Phone className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon"><Video className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <ScrollArea className="flex-1 p-4 bg-muted/5" ref={scrollRef}>
                        <div className="flex flex-col gap-6 max-w-3xl mx-auto">
                            {activeConvo.messages.map((msg) => {
                                const isMe = msg.author === 'Tú';
                                return (
                                    <div key={msg.id} className={cn("flex gap-3 max-w-[80%]", isMe ? "ml-auto flex-row-reverse" : "")}>
                                        <Avatar className="h-8 w-8 mt-1">
                                            <AvatarImage src={msg.avatar} />
                                            <AvatarFallback>{msg.author.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className={cn("flex items-baseline gap-2 mb-1", isMe ? "flex-row-reverse" : "")}>
                                                <span className="text-xs font-semibold">{msg.author}</span>
                                                <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                                            </div>
                                            <div className={cn(
                                                "p-3 rounded-2xl shadow-sm text-sm break-words",
                                                isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border rounded-tl-none"
                                            )}>
                                                {msg.content.type === 'text' && <p>{msg.content.text}</p>}
                                                {msg.content.type === 'image' && (
                                                    <div className="space-y-2">
                                                        <img src={msg.content.imageUrl} alt="Shared" className="rounded-lg max-h-60 object-cover" />
                                                        {msg.content.imageHint && <p className="text-[10px] opacity-70 italic">{msg.content.imageHint}</p>}
                                                    </div>
                                                )}
                                                {msg.content.type === 'file' && (
                                                    <div className="flex items-center gap-3 p-2 bg-background/20 rounded-md">
                                                        <FileIcon className="h-8 w-8 opacity-70" />
                                                        <div>
                                                            <p className="font-medium">{msg.content.file?.name}</p>
                                                            <p className="text-xs opacity-70">{msg.content.file?.size}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {msg.content.type === 'poll' && (
                                                    <div className="space-y-2 min-w-[200px]">
                                                        <p className="font-bold">{msg.content.poll?.question}</p>
                                                        <div className="space-y-1">
                                                            {msg.content.poll?.options.map(opt => (
                                                                <Button key={opt} variant="secondary" size="sm" className="w-full justify-start h-8 text-xs">
                                                                    {opt}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
                        <div className="flex gap-2 max-w-3xl mx-auto items-end">
                            <div className="flex gap-1 mb-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Paperclip className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><ImageIcon className="h-4 w-4" /></Button>
                            </div>
                            <Input
                                placeholder="Escribe un mensaje..."
                                className="flex-1 min-h-[40px] bg-background/50"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            />
                            <div className="flex gap-1 mb-1">
                                {inputText ? (
                                    <Button size="icon" className="h-8 w-8" onClick={handleSendMessage}><Send className="h-4 w-4" /></Button>
                                ) : (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Mic className="h-4 w-4" /></Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <p>Selecciona una conversación para comenzar.</p>
                </div>
            )}
        </div>
    );
}
