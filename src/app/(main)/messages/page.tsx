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
import { Search, Phone, Video, Send, PlusCircle, Sparkles, Library, Edit, Image as ImageIcon, File as FileIcon, Vote, MoreVertical, Pin, Menu, Folder, Check, X, Home, User, Bot, Users, Network, PenSquare, Info, Settings, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { UserNav } from "@/components/layout/user-nav";
import { NotificationCenter } from "@/components/layout/notification-center";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { CanvasEditor } from "@/components/canvas-editor";

const mainNavItems = [
    { href: "/dashboard", icon: <Home className="h-5 w-5" />, label: "Dashboard" },
    { href: "/profile/starseeduser", icon: <User className="h-5 w-5" />, label: "Perfil" },
    { href: "/agent", icon: <Bot className="h-5 w-5" />, label: "Agente de IA" },
    { href: "/hub", icon: <Users className="h-5 w-5" />, label: "Hub de Conexiones" },
    { href: "/network", icon: <Network className="h-5 w-5" />, label: "La Red" },
    { href: "/publish", icon: <PenSquare className="h-5 w-5" />, label: "Publicar" },
    { href: "/library", icon: <Library className="h-5 w-5" />, label: "Biblioteca" },
    { href: "/info", icon: <Info className="h-5 w-5" />, label: "Información" },
    { href: "/settings", icon: <Settings className="h-5 w-5" />, label: "Configuración" },
];


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

function ConversationList({ onConversationSelect, selectedConversationId, onShowMainMenu }: { onConversationSelect: (conv: ConversationFull) => void, selectedConversationId: string, onShowMainMenu: () => void }) {
    const pinnedConversations = conversations.filter(c => c.pinned);
    const recentConversations = conversations.filter(c => !c.pinned);

    return (
        <div className="flex flex-col h-full">
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
             <div className="p-4 border-t">
                <Button variant="outline" className="w-full" onClick={onShowMainMenu}>
                    <Menu className="mr-2 h-4 w-4" />
                    Menú Principal
                </Button>
            </div>
        </div>
    )
}

function MainMenu({ onShowConversations }: { onShowConversations: () => void }) {
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b">
                 <Button variant="ghost" onClick={onShowConversations} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a Mensajes
                </Button>
                <Link href="/" className="flex items-center gap-2 font-semibold">
                    <Logo />
                </Link>
            </div>
            <nav className="grid gap-2 p-4 text-lg font-medium">
                {mainNavItems.map(item => (
                     <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                    >
                        {item.icon}
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
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
    const [sheetView, setSheetView] = useState<'conversations' | 'main_menu'>('conversations');
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

    const handleOpenSheet = () => {
        setSheetView('conversations');
        setIsSheetOpen(true);
    }

    return (
        <Dialog>
             <div className="h-screen flex flex-col">
                {/* Canvas Editor Dialog */}
                <CanvasEditor
                    isOpen={isCanvasEditorOpen}
                    onOpenChange={setCanvasEditorOpen}
                    canvasType="main"
                    editorTitle="Editando Mensaje de Lienzo"
                />

                {/* Library Selector Dialog */}
                 <Dialog open={isLibrarySelectorOpen} onOpenChange={setLibrarySelectorOpen}>
                    <LibrarySelectorDialog onOpenChange={setLibrarySelectorOpen} />
                </Dialog>

                {/* Main Chat Area */}
                <div className="flex flex-col h-full bg-muted/20">
                    {/* Header */}
                    <header className="flex items-center justify-between p-3 border-b bg-background/80 backdrop-blur-xl shrink-0">
                        <div className="flex items-center gap-3">
                             <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={handleOpenSheet}>
                                        <Menu />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="p-0 w-full max-w-md">
                                     <SheetHeader className="sr-only">
                                        <SheetTitle>Menú</SheetTitle>
                                    </SheetHeader>
                                    {sheetView === 'conversations' ? (
                                        <ConversationList 
                                            onConversationSelect={handleSelectConversation} 
                                            selectedConversationId={selectedConversation.id}
                                            onShowMainMenu={() => setSheetView('main_menu')} 
                                        />
                                    ) : (
                                        <MainMenu onShowConversations={() => setSheetView('conversations')} />
                                    )}
                                </SheetContent>
                            </Sheet>
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={selectedConversation.avatar} data-ai-hint={selectedConversation.dataAiHint} />
                                <AvatarFallback>{selectedConversation.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h2 className="text-xl font-semibold">{selectedConversation.name}</h2>
                                <p className="text-xs text-muted-foreground">En línea</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon"><Phone /></Button>
                            <Button variant="ghost" size="icon"><Video /></Button>
                            <Separator orientation="vertical" className="h-6 mx-2"/>
                            <NotificationCenter />
                            <UserNav />
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
                    <footer className="p-4 border-t bg-background shrink-0">
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
                </div>
            </div>
        </Dialog>
    );
}
