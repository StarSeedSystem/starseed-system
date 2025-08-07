// src/app/(main)/messages/page.tsx
'use client'
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { conversations, files as libraryFiles, type ConversationFull, type MessageFull } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Search, Phone, Video, Send, PlusCircle, Sparkles, Library, Edit, Image as ImageIcon, File as FileIcon, Vote, MoreVertical, Pin, Menu, Folder, Check, X } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

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
                    <div className="flex items-center gap-2">
                        {conversation.pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
                        {conversation.unreadCount > 0 && (
                            <Badge className="h-5 w-5 flex items-center justify-center p-0">{conversation.unreadCount}</Badge>
                        )}
                    </div>
                </div>
            </div>
        </button>
    )
}

function ConversationList({ onConversationSelect, selectedConversationId }: { onConversationSelect: (conv: ConversationFull) => void, selectedConversationId: string }) {
    const pinnedConversations = conversations.filter(c => c.pinned);
    const recentConversations = conversations.filter(c => !c.pinned);

    return (
        <aside className="flex flex-col border-r h-full bg-background/80 md:bg-transparent">
            <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold font-headline">Mensajes</h1>
                    <Button variant="ghost" size="icon">
                        <PlusCircle className="w-6 h-6" />
                    </Button>
                </div>
                <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar conversaciones..." className="pl-8" />
                </div>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {pinnedConversations.length > 0 && (
                        <div className="px-2 py-1">
                            <h2 className="text-xs font-semibold uppercase text-muted-foreground">Fijados</h2>
                            {pinnedConversations.map(convo => (
                                <ConversationListItem 
                                    key={convo.id} 
                                    conversation={convo}
                                    onSelect={() => onConversationSelect(convo)}
                                    isActive={selectedConversationId === convo.id}
                                />
                            ))}
                            <Separator className="my-2" />
                        </div>
                    )}
                    <div className="px-2 py-1">
                        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Recientes</h2>
                         {recentConversations.map(convo => (
                            <ConversationListItem 
                                key={convo.id} 
                                conversation={convo}
                                onSelect={() => onConversationSelect(convo)}
                                isActive={selectedConversationId === convo.id}
                            />
                        ))}
                    </div>
                </div>
            </ScrollArea>
        </aside>
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
                        <CardHeader className="p-4 pb-2">
                             <div className="flex items-center gap-2">
                                <Edit className="w-5 h-5 text-primary"/>
                                <CardTitle className="font-headline text-lg">{content.canvas!.title}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
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

function MessageCanvasEditor({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const { toast } = useToast();
    return (
        <DialogContent className="w-screen h-screen max-w-full max-h-full flex flex-col p-0 gap-0">
            <DialogHeader className="p-4 border-b flex-row items-center justify-between">
                <DialogTitle className="font-headline text-xl">Editando Mensaje de Lienzo</DialogTitle>
                <DialogClose asChild>
                    <Button onClick={() => onOpenChange(false)}>Guardar y Enviar</Button>
                </DialogClose>
            </DialogHeader>
            <div className="bg-muted/40 flex-1 flex flex-col items-center justify-center p-4 relative overflow-auto">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 p-2 rounded-lg border bg-background/80 backdrop-blur-xl">
                     <Button variant="ghost" className="flex items-center gap-2" onClick={() => toast({ title: "Funcionalidad Próximamente", description: "El asistente de IA se integrará aquí."})}><Sparkles /> Asistente IA</Button>
                     <Button variant="ghost" className="flex items-center gap-2" onClick={() => toast({ title: "Funcionalidad Próximamente", description: "Podrás arrastrar archivos desde la biblioteca."})}><Library /> Biblioteca</Button>
                </div>
                <div className="relative p-4 border-2 border-dashed rounded-lg bg-background shadow-lg w-full max-w-3xl h-full min-h-[calc(100vh-200px)]">
                    <Textarea 
                        placeholder="Crea tu mensaje enriquecido aquí..." 
                        className="min-h-full h-full bg-transparent border-0 focus-visible:ring-0 resize-none p-4"
                    />
                </div>
            </div>
        </DialogContent>
    );
}

function LibrarySelectorDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

    const handleSelectFile = (fileId: string) => {
        setSelectedFiles(prev => 
            prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
        );
    }
    
    return (
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
                <DialogTitle className="font-headline text-2xl">Seleccionar desde la Biblioteca</DialogTitle>
                <DialogDescription>Busca y selecciona archivos o carpetas para adjuntar a tu mensaje.</DialogDescription>
            </DialogHeader>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre, tipo o etiqueta..." className="pl-8" />
            </div>
            <ScrollArea className="flex-1 -mx-6 px-6">
                 <div className="space-y-2 py-4">
                    {libraryFiles.map(file => (
                        <div 
                            key={file.id} 
                            className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => handleSelectFile(String(file.id))}
                        >
                            <Checkbox checked={selectedFiles.includes(String(file.id))} />
                            {file.type === 'folder' ? <Folder className="w-6 h-6 text-muted-foreground" /> : <FileIcon className="w-6 h-6 text-muted-foreground" />}
                            <div className="flex-1">
                                <p className="font-semibold">{file.name}</p>
                                <p className="text-sm text-muted-foreground">{file.size}</p>
                            </div>
                            <Badge variant="outline">{file.type}</Badge>
                        </div>
                    ))}
                 </div>
            </ScrollArea>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                </DialogClose>
                <Button onClick={() => onOpenChange(false)}>Adjuntar {selectedFiles.length} Archivo(s)</Button>
            </DialogFooter>
        </DialogContent>
    )
}


export default function MessagesPage() {
    const [selectedConversation, setSelectedConversation] = useState(conversations.find(c => c.pinned) || conversations[0]);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isCanvasEditorOpen, setCanvasEditorOpen] = useState(false);
    const [isLibrarySelectorOpen, setLibrarySelectorOpen] = useState(false);

    
    const handleSelectConversation = (conv: ConversationFull) => {
        setSelectedConversation(conv);
        setIsSheetOpen(false); // Close sheet on selection
    }

    const attachmentOptions = [
        { name: "Lienzo Interactivo", icon: <Edit className="w-5 h-5" />, description: "Crea contenido enriquecido.", action: () => setCanvasEditorOpen(true) },
        { name: "Desde la Biblioteca", icon: <Library className="w-5 h-5" />, description: "Adjunta archivos existentes.", action: () => setLibrarySelectorOpen(true) },
        { name: "Imagen o Video", icon: <ImageIcon className="w-5 h-5" />, description: "Sube desde tu dispositivo.", action: () => {} },
        { name: "Crear Encuesta", icon: <Vote className="w-5 h-5" />, description: "Haz una pregunta rápida.", action: () => {} }
    ];

    return (
        <Dialog>
             <div className="grid md:grid-cols-[300px_1fr] lg:grid-cols-[350px_1fr] h-[calc(100vh-60px)]">
                {/* Canvas Editor Dialog */}
                <Dialog open={isCanvasEditorOpen} onOpenChange={setCanvasEditorOpen}>
                    <MessageCanvasEditor onOpenChange={setCanvasEditorOpen} />
                </Dialog>

                {/* Library Selector Dialog */}
                 <Dialog open={isLibrarySelectorOpen} onOpenChange={setLibrarySelectorOpen}>
                    <LibrarySelectorDialog onOpenChange={setLibrarySelectorOpen} />
                </Dialog>

                {/* Sidebar */}
                <div className="hidden md:flex">
                    <ConversationList onConversationSelect={handleSelectConversation} selectedConversationId={selectedConversation.id} />
                </div>
                
                {/* Main Chat Area */}
                <main className="flex flex-col h-full bg-muted/20">
                    {/* Header */}
                    <header className="flex items-center justify-between p-3 border-b bg-background/80 backdrop-blur-xl">
                        <div className="flex items-center gap-3">
                            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="md:hidden">
                                        <Menu />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="p-0 w-full sm:w-3/4">
                                     <SheetHeader className="p-4 border-b">
                                        <SheetTitle className="sr-only">Conversaciones</SheetTitle>
                                    </SheetHeader>
                                    <ConversationList onConversationSelect={handleSelectConversation} selectedConversationId={selectedConversation.id} />
                                </SheetContent>
                            </Sheet>
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
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8"><PlusCircle /></Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80" align="start">
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Contenido Avanzado</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Potencia tus mensajes con herramientas creativas.
                                                </p>
                                            </div>
                                            <div className="grid gap-2">
                                                {attachmentOptions.map(opt => (
                                                    <DialogTrigger asChild key={opt.name}>
                                                        <Button variant="ghost" className="justify-start h-auto p-2" onClick={opt.action}>
                                                            <div className="flex items-center gap-3">
                                                                {opt.icon}
                                                                <div>
                                                                    <p className="font-semibold text-sm">{opt.name}</p>
                                                                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                                                                </div>
                                                            </div>
                                                        </Button>
                                                    </DialogTrigger>
                                                ))}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"><Sparkles/></Button>
                                <Button size="icon" className="h-8 w-8"><Send/></Button>
                            </div>
                        </div>
                    </footer>
                </main>
            </div>
        </Dialog>
    );
}
