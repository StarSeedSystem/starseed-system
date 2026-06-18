// src/app/(main)/messages/page.tsx
'use client'
import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { conversations, files as libraryFiles, type ConversationFull, type MessageFull } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
    Search, Phone, Video, Send, PlusCircle, Sparkles, Library, Edit,
    Image as ImageIcon, File as FileIcon, Vote, Pin, Menu,
    Folder, Check, X, Home, User, Bot, Users, Network, PenSquare, Info,
    Settings, ArrowLeft, MessageSquare, Globe, Building2, Users2
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { UserNav } from "@/components/layout/user-nav";
import { NotificationCenter } from "@/components/layout/notification-center";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { CanvasEditor } from "@/components/canvas-editor";

// ── Types ──────────────────────────────────────────────────────────────────

type ChannelType = 'dm' | 'group' | 'ef' | 'community';

interface LocalMessage extends MessageFull {
    _local?: boolean;
}

// Augmented conversation with local messages and channel type
interface AugmentedConversation extends ConversationFull {
    channelType: ChannelType;
    handle?: string;
    localMessages: LocalMessage[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function inferChannelType(conv: ConversationFull): ChannelType {
    const name = conv.name.toLowerCase();
    if (conv.type === 'dm') return 'dm';
    if (name.includes('e.f.') || name.includes('entidad')) return 'ef';
    if (name.includes('comunidad') || name.includes('sangha')) return 'community';
    return 'group';
}

function inferHandle(conv: ConversationFull): string | undefined {
    if (conv.type === 'dm') {
        return conv.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
    return undefined;
}

const CHANNEL_LABELS: Record<ChannelType, string> = {
    dm: 'Directo',
    group: 'Grupo',
    ef: 'E.F.',
    community: 'Comunidad',
};

const CHANNEL_COLORS: Record<ChannelType, string> = {
    dm: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    group: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    ef: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    community: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const CHANNEL_ICONS: Record<ChannelType, React.ReactNode> = {
    dm: <MessageSquare className="w-3 h-3" />,
    group: <Users2 className="w-3 h-3" />,
    ef: <Building2 className="w-3 h-3" />,
    community: <Globe className="w-3 h-3" />,
};

function augmentConversations(raw: ConversationFull[]): AugmentedConversation[] {
    return raw.map(c => ({
        ...c,
        channelType: inferChannelType(c),
        handle: inferHandle(c),
        localMessages: [...c.messages],
    }));
}

function relativeTime(raw: string): string {
    // Already in Spanish relative format from data — return as-is
    return raw;
}

function groupMessagesByDate(messages: LocalMessage[]): Array<{ label: string; messages: LocalMessage[] }> {
    // Since timestamps are relative strings (not real dates), just group everything under one "Hoy"
    return [{ label: 'Hoy', messages }];
}

// ── Nav ─────────────────────────────────────────────────────────────────────

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

// ── Channel chip ─────────────────────────────────────────────────────────────

function ChannelChip({ type }: { type: ChannelType }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
            CHANNEL_COLORS[type]
        )}>
            {CHANNEL_ICONS[type]}
            {CHANNEL_LABELS[type]}
        </span>
    );
}

// ── Conversation List Item ───────────────────────────────────────────────────

function ConversationListItem({
    conversation, onSelect, isActive
}: {
    conversation: AugmentedConversation;
    onSelect: () => void;
    isActive: boolean;
}) {
    return (
        <button
            onClick={onSelect}
            className={cn(
                "flex items-center gap-3 w-full p-2.5 rounded-xl text-left transition-all duration-150 group cursor-pointer",
                isActive
                    ? "bg-primary/10 border border-primary/20 shadow-sm"
                    : "hover:bg-muted/60 border border-transparent"
            )}
        >
            <div className="relative shrink-0">
                <Avatar className="h-11 w-11 ring-2 ring-offset-1 ring-offset-background ring-transparent group-hover:ring-primary/20 transition-all">
                    <AvatarImage src={conversation.avatar} data-ai-hint={conversation.dataAiHint} />
                    <AvatarFallback className="font-semibold text-sm">
                        {conversation.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                {/* Online dot for DMs */}
                {conversation.channelType === 'dm' && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <p className={cn("font-semibold truncate text-sm", isActive && "text-primary")}>
                            {conversation.name}
                        </p>
                        {conversation.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {relativeTime(conversation.lastMessageTimestamp)}
                    </p>
                </div>
                <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <ChannelChip type={conversation.channelType} />
                        <p className="text-xs text-muted-foreground truncate">{conversation.lastMessage}</p>
                    </div>
                    {conversation.unreadCount > 0 && (
                        <Badge className="h-4 min-w-4 px-1 flex items-center justify-center text-[10px] shrink-0 bg-primary">
                            {conversation.unreadCount}
                        </Badge>
                    )}
                </div>
            </div>
        </button>
    );
}

// ── Conversation List Panel ──────────────────────────────────────────────────

type FilterType = 'all' | ChannelType;

function ConversationList({
    conversations: convos,
    onConversationSelect,
    selectedConversationId,
    onShowMainMenu,
}: {
    conversations: AugmentedConversation[];
    onConversationSelect: (conv: AugmentedConversation) => void;
    selectedConversationId: string;
    onShowMainMenu: () => void;
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');

    const filtered = convos.filter(c => {
        const matchesSearch =
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.lastMessage.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filter === 'all' || c.channelType === filter;
        return matchesSearch && matchesFilter;
    });

    const pinned = filtered.filter(c => c.pinned);
    const recent = filtered.filter(c => !c.pinned);

    const totalUnread = convos.reduce((sum, c) => sum + c.unreadCount, 0);

    const filterOptions: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'Todos' },
        { key: 'dm', label: 'Directos' },
        { key: 'group', label: 'Grupos' },
        { key: 'ef', label: 'E.F.' },
        { key: 'community', label: 'Comunidad' },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b bg-background/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold font-headline">Mensajes</h1>
                        {totalUnread > 0 && (
                            <Badge className="h-5 px-1.5 text-xs bg-primary">{totalUnread}</Badge>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8">
                        <PlusCircle className="w-5 h-5" />
                    </Button>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Buscar conversaciones..."
                        className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-input"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setSearch('')}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filter chips */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {filterOptions.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setFilter(opt.key)}
                            className={cn(
                                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer border",
                                filter === opt.key
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5">
                    {pinned.length > 0 && (
                        <div className="mb-1">
                            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Fijados
                            </p>
                            <div className="space-y-0.5">
                                {pinned.map(convo => (
                                    <ConversationListItem
                                        key={convo.id}
                                        conversation={convo}
                                        onSelect={() => onConversationSelect(convo)}
                                        isActive={selectedConversationId === convo.id}
                                    />
                                ))}
                            </div>
                            {recent.length > 0 && <Separator className="my-2" />}
                        </div>
                    )}

                    {recent.length > 0 && (
                        <div>
                            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Recientes
                            </p>
                            <div className="space-y-0.5">
                                {recent.map(convo => (
                                    <ConversationListItem
                                        key={convo.id}
                                        conversation={convo}
                                        onSelect={() => onConversationSelect(convo)}
                                        isActive={selectedConversationId === convo.id}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                            <Search className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-sm">Sin resultados para "{search}"</p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="p-3 border-t shrink-0">
                <Button variant="outline" className="w-full cursor-pointer h-9 text-sm" onClick={onShowMainMenu}>
                    <Menu className="mr-2 h-4 w-4" />
                    Menú Principal
                </Button>
            </div>
        </div>
    );
}

// ── Main Menu ────────────────────────────────────────────────────────────────

function MainMenu({ onShowConversations }: { onShowConversations: () => void }) {
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b">
                <Button variant="ghost" onClick={onShowConversations} className="mb-4 cursor-pointer">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a Mensajes
                </Button>
                <Link href="/" className="flex items-center gap-2 font-semibold">
                    <Logo />
                </Link>
            </div>
            <nav className="grid gap-1 p-4 text-base font-medium">
                {mainNavItems.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-4 rounded-xl px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                        {item.icon}
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: LocalMessage }) {
    const isUser = message.author === 'Tú';
    const content = message.content;

    const renderContent = () => {
        switch (content.type) {
            case 'text':
                return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content.text}</p>;
            case 'image':
                return (
                    <Image
                        src={content.imageUrl!}
                        alt={content.imageHint!}
                        width={320} height={240}
                        className="rounded-xl object-cover"
                        data-ai-hint={content.imageHint}
                    />
                );
            case 'file':
                return (
                    <div className="flex items-center gap-3 p-3 rounded-xl border bg-background/40 backdrop-blur-sm min-w-48">
                        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                            <FileIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{content.file!.name}</p>
                            <p className="text-xs text-muted-foreground">{content.file!.size}</p>
                        </div>
                    </div>
                );
            case 'poll':
                return (
                    <Card className="bg-background/40 backdrop-blur-sm border-primary/20 min-w-64">
                        <CardContent className="p-4">
                            <p className="font-semibold text-sm mb-3">{content.poll!.question}</p>
                            <div className="space-y-1.5">
                                {content.poll!.options.map(opt => (
                                    <Button
                                        key={opt}
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start text-xs h-8 cursor-pointer hover:bg-primary/10 hover:border-primary/40"
                                    >
                                        {opt}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                );
            case 'canvas':
                return (
                    <Card className="bg-background/40 backdrop-blur-sm border-primary/30 min-w-64">
                        <CardHeader className="p-3 pb-1.5">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
                                    <Edit className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <CardTitle className="font-headline text-sm">{content.canvas!.title}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <p className="text-xs text-muted-foreground mb-3">{content.canvas!.content}</p>
                            <Button size="sm" className="w-full text-xs h-7 cursor-pointer">
                                Abrir Lienzo Interactivo
                            </Button>
                        </CardContent>
                    </Card>
                );
        }
    };

    return (
        <div className={cn("flex items-end gap-2.5 group", isUser ? "justify-end" : "justify-start")}>
            {!isUser && (
                <Avatar className="h-7 w-7 self-end shrink-0 mb-0.5">
                    <AvatarImage src={message.avatar} data-ai-hint={message.dataAiHint} />
                    <AvatarFallback className="text-xs">{message.author.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
            )}
            <div className={cn("max-w-sm", isUser ? "items-end" : "items-start", "flex flex-col gap-0.5")}>
                {!isUser && (
                    <p className="text-[11px] font-semibold text-muted-foreground px-1">{message.author}</p>
                )}
                <div className={cn(
                    "rounded-2xl px-3.5 py-2.5 shadow-sm",
                    isUser
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border/60 rounded-bl-sm"
                )}>
                    {renderContent()}
                    <p className={cn(
                        "text-[10px] mt-1.5 flex items-center gap-1",
                        isUser ? "text-primary-foreground/60 justify-end" : "text-muted-foreground"
                    )}>
                        {message.timestamp}
                        {isUser && <Check className="w-3 h-3" />}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[11px] font-medium text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded-full border border-border/40">
                {label}
            </span>
            <div className="flex-1 h-px bg-border/50" />
        </div>
    );
}

// ── Library Selector Dialog ──────────────────────────────────────────────────

function LibrarySelectorDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

    const handleSelectFile = (fileId: string) => {
        setSelectedFiles(prev =>
            prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
        );
    };

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
                            {file.type === 'folder'
                                ? <Folder className="w-6 h-6 text-muted-foreground" />
                                : <FileIcon className="w-6 h-6 text-muted-foreground" />
                            }
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
                    <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancelar</Button>
                </DialogClose>
                <Button className="cursor-pointer" onClick={() => onOpenChange(false)}>
                    Adjuntar {selectedFiles.length} Archivo(s)
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

// ── Thread View ──────────────────────────────────────────────────────────────

function ThreadView({
    conversation,
    onBack,
    onSendMessage,
    attachmentOptions,
    onOpenCanvasEditor,
    onOpenLibrarySelector,
}: {
    conversation: AugmentedConversation;
    onBack?: () => void;
    onSendMessage: (text: string) => void;
    attachmentOptions: { name: string; icon: React.ReactNode; description: string; action: () => void }[];
    onOpenCanvasEditor: () => void;
    onOpenLibrarySelector: () => void;
}) {
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [conversation.localMessages]);

    const handleSend = useCallback(() => {
        const text = inputValue.trim();
        if (!text) return;
        onSendMessage(text);
        setInputValue('');
        inputRef.current?.focus();
    }, [inputValue, onSendMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const groups = groupMessagesByDate(conversation.localMessages);

    return (
        <div className="flex flex-col h-full">
            {/* Thread Header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0">
                {onBack && (
                    <Button variant="ghost" size="icon" className="cursor-pointer shrink-0 h-8 w-8" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}
                <div className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={conversation.avatar} data-ai-hint={conversation.dataAiHint} />
                        <AvatarFallback className="text-xs font-semibold">
                            {conversation.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    {conversation.channelType === 'dm' && (
                        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 border-2 border-background" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {conversation.handle ? (
                            <Link
                                href={`/profile/${conversation.handle}`}
                                className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer truncate"
                            >
                                {conversation.name}
                            </Link>
                        ) : (
                            <p className="font-semibold text-sm truncate">{conversation.name}</p>
                        )}
                        <ChannelChip type={conversation.channelType} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {conversation.channelType === 'dm' ? 'En línea' : `${conversation.localMessages.length} mensajes`}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8">
                        <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8">
                        <Video className="h-4 w-4" />
                    </Button>
                    <Separator orientation="vertical" className="h-5 mx-1" />
                    <NotificationCenter />
                    <UserNav />
                </div>
            </header>

            {/* Messages scroll area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                style={{ scrollBehavior: 'smooth' }}
            >
                {groups.map(group => (
                    <div key={group.label}>
                        <DateSeparator label={group.label} />
                        <div className="space-y-3">
                            {group.messages.map(msg => (
                                <MessageBubble key={msg.id} message={msg} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Composer */}
            <footer className="px-4 py-3 border-t bg-background/90 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 bg-muted/50 rounded-2xl border border-border/60 px-3 py-2 focus-within:border-primary/40 focus-within:bg-background/70 transition-all">
                    {/* Attachment popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="cursor-pointer h-7 w-7 shrink-0 rounded-full hover:bg-primary/10 hover:text-primary text-muted-foreground"
                            >
                                <PlusCircle className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72" align="start" side="top">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                                    Contenido Avanzado
                                </p>
                                {attachmentOptions.map(opt => (
                                    <Button
                                        key={opt.name}
                                        variant="ghost"
                                        className="justify-start h-auto p-2 w-full cursor-pointer hover:bg-muted"
                                        onClick={opt.action}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                {opt.icon}
                                            </div>
                                            <div className="text-left">
                                                <p className="font-semibold text-sm">{opt.name}</p>
                                                <p className="text-xs text-muted-foreground">{opt.description}</p>
                                            </div>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Text input */}
                    <Input
                        ref={inputRef}
                        placeholder="Escribe un mensaje o usa la IA..."
                        className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-8 text-sm placeholder:text-muted-foreground/70"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    {/* AI button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="cursor-pointer h-7 w-7 shrink-0 rounded-full hover:bg-primary/10 hover:text-primary text-muted-foreground"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                    </Button>

                    {/* Send button */}
                    <Button
                        size="icon"
                        className={cn(
                            "cursor-pointer h-7 w-7 shrink-0 rounded-full transition-all",
                            inputValue.trim()
                                ? "bg-primary hover:bg-primary/90 shadow-sm"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                    >
                        <Send className="w-3.5 h-3.5" />
                    </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-1">
                    Presiona Enter para enviar · Shift+Enter para nueva línea
                </p>
            </footer>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
    const [augmented, setAugmented] = useState<AugmentedConversation[]>(() =>
        augmentConversations(conversations)
    );

    const [selectedId, setSelectedId] = useState<string>(
        augmented.find(c => c.pinned)?.id ?? augmented[0]?.id ?? ''
    );

    // Mobile: show list or thread
    const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetView, setSheetView] = useState<'conversations' | 'main_menu'>('conversations');
    const [isCanvasEditorOpen, setCanvasEditorOpen] = useState(false);
    const [isLibrarySelectorOpen, setLibrarySelectorOpen] = useState(false);

    const selectedConversation = augmented.find(c => c.id === selectedId) ?? augmented[0];

    const handleSelectConversation = (conv: AugmentedConversation) => {
        setSelectedId(conv.id);
        setIsSheetOpen(false);
        setMobileView('thread');
    };

    const handleSendMessage = useCallback((text: string) => {
        setAugmented(prev => prev.map(c => {
            if (c.id !== selectedId) return c;
            const newMsg: LocalMessage = {
                id: `local-${Date.now()}`,
                author: 'Tú',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'user avatar',
                timestamp: 'ahora',
                content: { type: 'text', text },
                _local: true,
            };
            return {
                ...c,
                localMessages: [...c.localMessages, newMsg],
                lastMessage: text,
                lastMessageTimestamp: 'ahora',
            };
        }));
    }, [selectedId]);

    const attachmentOptions = [
        {
            name: "Lienzo Interactivo",
            icon: <Edit className="w-4 h-4" />,
            description: "Crea contenido enriquecido.",
            action: () => setCanvasEditorOpen(true)
        },
        {
            name: "Desde la Biblioteca",
            icon: <Library className="w-4 h-4" />,
            description: "Adjunta archivos existentes.",
            action: () => setLibrarySelectorOpen(true)
        },
        {
            name: "Imagen o Video",
            icon: <ImageIcon className="w-4 h-4" />,
            description: "Sube desde tu dispositivo.",
            action: () => {}
        },
        {
            name: "Crear Encuesta",
            icon: <Vote className="w-4 h-4" />,
            description: "Haz una pregunta rápida.",
            action: () => {}
        },
    ];

    const handleOpenSheet = () => {
        setSheetView('conversations');
        setIsSheetOpen(true);
    };

    return (
        <Dialog>
            <div className="h-screen flex flex-col overflow-hidden">
                {/* Canvas Editor */}
                <CanvasEditor
                    isOpen={isCanvasEditorOpen}
                    onOpenChange={setCanvasEditorOpen}
                    area="message"
                    editorTitle="Editando Mensaje de Lienzo"
                />

                {/* Library Selector */}
                <Dialog open={isLibrarySelectorOpen} onOpenChange={setLibrarySelectorOpen}>
                    <LibrarySelectorDialog onOpenChange={setLibrarySelectorOpen} />
                </Dialog>

                {/* ── DESKTOP: two-pane layout ── */}
                <div className="hidden md:flex flex-1 overflow-hidden bg-muted/10">
                    {/* Left pane — conversation list */}
                    <div className="w-80 lg:w-96 shrink-0 flex flex-col border-r bg-background/60 backdrop-blur-sm overflow-hidden">
                        <ConversationList
                            conversations={augmented}
                            onConversationSelect={handleSelectConversation}
                            selectedConversationId={selectedId}
                            onShowMainMenu={() => {
                                setSheetView('main_menu');
                                setIsSheetOpen(true);
                            }}
                        />
                    </div>

                    {/* Right pane — thread */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedConversation ? (
                            <ThreadView
                                conversation={selectedConversation}
                                onSendMessage={handleSendMessage}
                                attachmentOptions={attachmentOptions}
                                onOpenCanvasEditor={() => setCanvasEditorOpen(true)}
                                onOpenLibrarySelector={() => setLibrarySelectorOpen(true)}
                            />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">Selecciona una conversación</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── MOBILE: single-pane with sheet ── */}
                <div className="flex md:hidden flex-1 flex-col overflow-hidden">
                    {mobileView === 'list' ? (
                        <div className="flex flex-col h-full">
                            {/* Mobile top bar */}
                            <header className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0">
                                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8" onClick={handleOpenSheet}>
                                            <Menu className="h-4 w-4" />
                                        </Button>
                                    </SheetTrigger>
                                    <SheetContent side="left" className="p-0 w-full max-w-md">
                                        <SheetHeader className="sr-only">
                                            <SheetTitle>Menú</SheetTitle>
                                        </SheetHeader>
                                        {sheetView === 'conversations' ? (
                                            <ConversationList
                                                conversations={augmented}
                                                onConversationSelect={handleSelectConversation}
                                                selectedConversationId={selectedId}
                                                onShowMainMenu={() => setSheetView('main_menu')}
                                            />
                                        ) : (
                                            <MainMenu onShowConversations={() => setSheetView('conversations')} />
                                        )}
                                    </SheetContent>
                                </Sheet>
                                <h1 className="text-base font-bold font-headline">Mensajes</h1>
                                <div className="flex items-center gap-1">
                                    <NotificationCenter />
                                    <UserNav />
                                </div>
                            </header>

                            {/* Mobile conversation list */}
                            <div className="flex-1 overflow-hidden">
                                <ConversationList
                                    conversations={augmented}
                                    onConversationSelect={conv => {
                                        handleSelectConversation(conv);
                                        setMobileView('thread');
                                    }}
                                    selectedConversationId={selectedId}
                                    onShowMainMenu={() => {
                                        setSheetView('main_menu');
                                        setIsSheetOpen(true);
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        /* Mobile thread view */
                        selectedConversation && (
                            <ThreadView
                                conversation={selectedConversation}
                                onBack={() => setMobileView('list')}
                                onSendMessage={handleSendMessage}
                                attachmentOptions={attachmentOptions}
                                onOpenCanvasEditor={() => setCanvasEditorOpen(true)}
                                onOpenLibrarySelector={() => setLibrarySelectorOpen(true)}
                            />
                        )
                    )}
                </div>

                {/* Desktop: main menu sheet (triggered from ConversationList footer) */}
                <Sheet open={isSheetOpen && sheetView === 'main_menu'} onOpenChange={open => { if (!open) setIsSheetOpen(false); }}>
                    <SheetContent side="left" className="p-0 w-80 lg:w-96 hidden md:flex flex-col">
                        <SheetHeader className="sr-only">
                            <SheetTitle>Menú Principal</SheetTitle>
                        </SheetHeader>
                        <MainMenu onShowConversations={() => setIsSheetOpen(false)} />
                    </SheetContent>
                </Sheet>
            </div>
        </Dialog>
    );
}
