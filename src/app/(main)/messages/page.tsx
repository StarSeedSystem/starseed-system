// src/app/(main)/messages/page.tsx
'use client'
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { conversations, type ConversationFull, type MessageFull } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Search, Phone, Video, Send, PlusCircle, Sparkles, Library, Edit, Image as ImageIcon, File as FileIcon, Vote, MoreVertical } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

function ConversationListItem({ conversation, onSelect, isActive }: { conversation: ConversationFull, onSelect: () => void, isActive: boolean }) {
    return (
        <button 
            onClick={onSelect} 
            className={cn(
                "flex items-center gap-3 w-full p-2 rounded-lg text-left transition-colors",
                isActive ? "bg-muted" : "hover:bg-muted/50"
            )}
        >
            <Avatar className="h-12 w-12">
                <AvatarImage src={conversation.avatar} data-ai-hint={conversation.dataAiHint} />
                <AvatarFallback>{conversation.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
                <div className="flex justify-between items-center">
                    <p className="font-semibold">{conversation.name}</p>
                    <p className="text-xs text-muted-foreground">{conversation.lastMessageTimestamp}</p>
                </div>
                <div className="flex justify-between items-start">
                    <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
                    {conversation.unreadCount > 0 && (
                        <Badge className="h-5 w-5 flex items-center justify-center p-0">{conversation.unreadCount}</Badge>
                    )}
                </div>
            </div>
        </button>
    )
}

function MessageBubble({ message }: { message: MessageFull }) {
    const isUser = message.author === 'Tú';
    const content = message.content;

    const renderContent = () => {
        switch(content.type) {
            case 'text':
                return <p>{content.text}</p>;
            case 'image':
                return (
                    <Image 
                        src={content.imageUrl!} 
                        alt={content.imageHint!}
                        width={400} height={300}
                        className="rounded-lg object-cover"
                        data-ai-hint={content.imageHint}
                    />
                );
            case 'file':
                return (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-background/50">
                        <FileIcon className="w-8 h-8 text-primary"/>
                        <div>
                            <p className="font-semibold">{content.file!.name}</p>
                            <p className="text-sm text-muted-foreground">{content.file!.size}</p>
                        </div>
                    </div>
                );
            case 'poll':
                return (
                     <Card className="bg-background/50">
                        <CardContent className="p-4">
                            <p className="font-semibold mb-3">{content.poll!.question}</p>
                            <div className="space-y-2">
                                {content.poll!.options.map(opt => (
                                    <Button key={opt} variant="outline" className="w-full justify-start">{opt}</Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                );
            case 'canvas':
                return (
                    <Card className="bg-background/50 border-primary/50 border-2">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Edit className="w-5 h-5 text-primary"/>
                                <h4 className="font-bold font-headline">{content.canvas!.title}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">{content.canvas!.content}</p>
                            <Button className="mt-4 w-full">Abrir Lienzo Interactivo</Button>
                        </CardContent>
                    </Card>
                )
        }
    }

    return (
        <div className={cn("flex items-end gap-3", isUser ? "justify-end" : "justify-start")}>
            {!isUser && (
                <Avatar className="h-8 w-8 self-start">
                    <AvatarImage src={message.avatar} data-ai-hint={message.dataAiHint} />
                    <AvatarFallback>{message.author.slice(0, 2)}</AvatarFallback>
                </Avatar>
            )}
            <div className={cn(
                "max-w-md rounded-2xl p-3",
                isUser ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none"
            )}>
                {!isUser && <p className="font-semibold text-xs mb-1">{message.author}</p>}
                {renderContent()}
                <p className={cn("text-xs mt-1.5", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>{message.timestamp}</p>
            </div>
        </div>
    )
}

export default function MessagesPage() {
    const [selectedConversation, setSelectedConversation] = useState(conversations[0]);
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[350px_1fr] h-[calc(100vh-60px)]">
            {/* Sidebar */}
            <aside className="flex flex-col border-r h-full">
                <div className="p-4 border-b">
                    <h1 className="text-2xl font-bold font-headline">Mensajes</h1>
                    <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar conversaciones..." className="pl-8" />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {conversations.map(convo => (
                            <ConversationListItem 
                                key={convo.id} 
                                conversation={convo}
                                onSelect={() => setSelectedConversation(convo)}
                                isActive={selectedConversation.id === convo.id}
                            />
                        ))}
                    </div>
                </ScrollArea>
            </aside>
            
            {/* Main Chat Area */}
            <main className="flex flex-col h-full bg-muted/20">
                {/* Header */}
                <header className="flex items-center justify-between p-3 border-b bg-background/80 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                         <Avatar className="h-10 w-10">
                            <AvatarImage src={selectedConversation.avatar} data-ai-hint={selectedConversation.dataAiHint} />
                            <AvatarFallback>{selectedConversation.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <h2 className="text-xl font-semibold">{selectedConversation.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon"><Phone /></Button>
                        <Button variant="ghost" size="icon"><Video /></Button>
                        <Button variant="ghost" size="icon"><MoreVertical /></Button>
                    </div>
                </header>
                
                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        {selectedConversation.messages.map(msg => (
                           <MessageBubble key={msg.id} message={msg}/>
                        ))}
                    </div>
                </ScrollArea>
                
                {/* Composer */}
                <footer className="p-4 border-t bg-background">
                    <div className="relative">
                        <Input placeholder="Escribe un mensaje o usa la IA..." className="pr-24 pl-10" />
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><PlusCircle /></Button>
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"><Sparkles/></Button>
                             <Button size="icon" className="h-8 w-8"><Send/></Button>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
}
