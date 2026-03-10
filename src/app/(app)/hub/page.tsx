// src/app/(app)/hub/page.tsx
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
    Search, Briefcase, Vote, Users, BookOpen, Calendar,
    Globe, MapPin, PartyPopper, Clock, Zap, CheckCircle2,
    AlertTriangle, Star, ChevronRight, Plus, Filter,
    Activity, Award, Shield, Flame
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { studyGroups, communityEvents, politicalParties, userBadges } from "@/lib/data";

const participations = [
    { type: "Propuesta Activa", title: "Ley de Soberanía de Datos Personales", status: "Votación cierra en 3 días", href: "/network/politics", icon: <Vote className="w-5 h-5 text-primary" />, urgency: "alta" },
    { type: "Proyecto Activo", title: "Sistema de Riego Comunitario Inteligente", status: "75% completado", href: "#", icon: <Briefcase className="w-5 h-5 text-emerald-400" />, urgency: "normal" },
    { type: "Caso Judicial", title: "Disputa de Límites - Huerto A vs B", status: "En Mediación", href: "/network/politics", icon: <Shield className="w-5 h-5 text-amber-400" />, urgency: "normal" },
    { type: "Curso en Curso", title: "Ética en la Inteligencia Artificial", status: "85% completado", href: "#", icon: <BookOpen className="w-5 h-5 text-cyan-400" />, urgency: "normal" },
];

const myPages = [
    { name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png", members: 2847, href: "/profile/ef-valle-central", activity: "Alta" },
    { name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png", members: 128, href: "/profile/comunidad-permacultura", activity: "Media" },
    { name: "Partido: Coalición Verde", type: "Partido Político", avatar: "https://placehold.co/40x40.png", members: 2890, href: "#", activity: "Alta" },
    { name: "Huerto Comunitario Norte", type: "Comunidad", avatar: "https://placehold.co/40x40.png", members: 45, href: "#", activity: "Baja" },
];

const voteManagement = [
    { proposal: "Ley de Soberanía de Datos Personales", ef: "E.F. Valle Central", deadline: "3 días", voted: false, urgency: "Urgente" },
    { proposal: "Protocolo de Energía Renovable Comunitaria", ef: "E.F. Norte Verde", deadline: "12 días", voted: true, urgency: "Alta" },
    { proposal: "Currículo Abierto de Educación Universal", ef: "Consejo Global", deadline: "21 días", voted: false, urgency: "Media" },
];

const alliances = [
    { name: "Red de Permacultura del Sur", members: ["Comunidad de Permacultura", "Huerto Comunitario del Este"], href: "#", status: "Activa" },
    { name: "Bloque Digital por la Privacidad", members: ["E.F. Nexus Digital", "Frente de Soberanía Digital"], href: "#", status: "Activa" },
];

const urgencyColors: Record<string, string> = {
    "alta": "text-red-400 bg-red-400/10 border-red-400/20",
    "Urgente": "text-red-400 bg-red-400/10 border-red-400/20",
    "Alta": "text-amber-400 bg-amber-400/10 border-amber-400/20",
    "Media": "text-blue-400 bg-blue-400/10 border-blue-400/20",
    "normal": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

const eventColors: Record<string, string> = {
    blue: "from-blue-500/30 to-blue-600/10 border-blue-500/30 text-blue-300",
    purple: "from-purple-500/30 to-purple-600/10 border-purple-500/30 text-purple-300",
    green: "from-emerald-500/30 to-emerald-600/10 border-emerald-500/30 text-emerald-300",
    cyan: "from-cyan-500/30 to-cyan-600/10 border-cyan-500/30 text-cyan-300",
};

export default function HubPage() {
    const [partyStates, setPartyStates] = useState(
        politicalParties.reduce((acc, p) => ({ ...acc, [p.id]: p.replicationActive }), {} as Record<string, boolean>)
    );

    return (
        <div className="flex flex-col w-full gap-[clamp(1.5rem,2.5vw,2.5rem)] pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-[clamp(1rem,2vw,2rem)] w-full text-center md:text-left">
                <div className="flex-1 flex flex-col md:items-start items-center">
                    <h1 className="page-title font-headline text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.3)] w-full">
                        Hub de Conexiones
                    </h1>
                    <p className="text-[clamp(0.9rem,1.2vw,1.1rem)] text-muted-foreground mt-2 max-w-2xl text-balance">
                        Centro de mando para toda tu actividad social, política y colaborativa en la red.
                    </p>
                </div>
                <div className="relative w-full md:w-[clamp(14rem,24vw,24rem)] group">
                    <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-xl pointer-events-none" />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                    <Input
                        placeholder="Buscar en el Hub..."
                        className="pl-12 h-12 bg-background/40 backdrop-blur-md border-primary/20 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl w-full text-base transition-all shadow-inner"
                    />
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-[clamp(1rem,2vw,2rem)] w-full">
                {[
                    { label: "Reputación", value: "1,842", icon: <Star className="w-5 h-5 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />, trend: "+24 esta semana", bg: "bg-amber-500/10" },
                    { label: "Contribuciones", value: "347", icon: <Activity className="w-5 h-5 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />, trend: "+12 este mes", bg: "bg-emerald-500/10" },
                    { label: "Seeds (SC)", value: "9,240", icon: <Zap className="w-5 h-5 text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />, trend: "Economía abierta", bg: "bg-cyan-500/10" },
                    { label: "Karma", value: "×2.4", icon: <Flame className="w-5 h-5 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" />, trend: "Multiplicador activo", bg: "bg-orange-500/10" },
                ].map((stat) => (
                    <Card key={stat.label} className="liquid-glass-panel border-white/5 shadow-lg group hover:border-white/10 transition-all p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-xl ${stat.bg} ring-1 ring-inset ring-white/5`}>
                                {stat.icon}
                            </div>
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{stat.label}</span>
                        </div>
                        <div className="text-3xl font-bold font-headline text-foreground">{stat.value}</div>
                        <div className="text-[11px] text-muted-foreground mt-2 font-medium">{stat.trend}</div>
                    </Card>
                ))}
            </div>

            {/* Badges Row */}
            < div className="flex flex-wrap gap-3 items-center justify-center md:justify-start w-full bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner" >
                <span className="text-sm font-semibold text-muted-foreground mr-2 tracking-wider uppercase">Tus insignias:</span>
                {
                    userBadges.slice(0, 5).map((badge) => (
                        <Badge key={badge.id} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border backdrop-blur-sm cursor-default transition-transform hover:scale-105", {
                            "bg-blue-500/10 border-blue-500/30 text-blue-300": badge.color === 'blue',
                            "bg-purple-500/10 border-purple-500/30 text-purple-300": badge.color === 'purple',
                            "bg-amber-500/10 border-amber-500/30 text-amber-300": badge.color === 'gold',
                            "bg-emerald-500/10 border-emerald-500/30 text-emerald-300": badge.color === 'green',
                        })} title={badge.description}>
                            <span>{badge.icon}</span> {badge.name}
                        </Badge>
                    ))
                }
                <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full ml-auto uppercase tracking-wider font-bold">
                    <Award className="w-4 h-4 mr-1.5" /> Ver todas
                </Button>
            </div >

            <Tabs defaultValue="participations" className="w-full flex-1 flex flex-col mt-4">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 max-w-full lg:max-w-5xl mx-auto h-auto min-h-[50px] gap-2 bg-black/20 p-2 rounded-2xl border border-white/5">
                    <TabsTrigger value="participations" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><CheckCircle2 className="w-4 h-4 mr-2" />Participaciones</TabsTrigger>
                    <TabsTrigger value="my-pages" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><Globe className="w-4 h-4 mr-2" />Mis Páginas</TabsTrigger>
                    <TabsTrigger value="groups" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><Users className="w-4 h-4 mr-2" />Grupos</TabsTrigger>
                    <TabsTrigger value="events" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><Calendar className="w-4 h-4 mr-2" />Eventos</TabsTrigger>
                    <TabsTrigger value="parties" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><Flame className="w-4 h-4 mr-2" />Partidos</TabsTrigger>
                    <TabsTrigger value="vote-management" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm"><Vote className="w-4 h-4 mr-2" />Votos</TabsTrigger>
                </TabsList>

                {/* ── PARTICIPACIONES ── */}
                <TabsContent value="participations" className="mt-6 animate-in fade-in-50 duration-500">
                    <div className="space-y-3">
                        {participations.map((item, i) => (
                            <Card key={i} className="group liquid-glass-panel p-2 shadow-lg hover:border-primary/40 transition-all duration-300">
                                <CardContent className="p-3 flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-white/5 dark:bg-white/5 border border-white/10">{item.icon}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.type}</span>
                                            {item.urgency === 'alta' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                                        </div>
                                        <p className="font-semibold text-foreground truncate">{item.title}</p>
                                        <p className="text-sm text-muted-foreground">{item.status}</p>
                                    </div>
                                    <Link href={item.href}>
                                        <Button size="icon" variant="ghost" className="rounded-full bg-primary/10 hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-all shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)] btn-pill">
                                            <ChevronRight className="w-5 h-5" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── MIS PÁGINAS ── */}
                <TabsContent value="my-pages" className="mt-6 animate-in fade-in-50 duration-500">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <span className="section-label">{myPages.length} PÁGINAS ACTIVAS</span>
                        <Button size="sm" className="btn-pill shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                            <Plus className="w-4 h-4 mr-1.5" /> Nueva Página
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myPages.map((page, i) => (
                            <Link key={i} href={page.href}>
                                <Card className="group liquid-glass-panel shadow-lg hover:border-primary/40 transition-all duration-300 h-full p-2">
                                    <CardContent className="p-4 flex items-center gap-4">
                                        <Avatar className="h-12 w-12 ring-2 ring-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]">
                                            <AvatarImage src={page.avatar} />
                                            <AvatarFallback className="bg-primary/20 text-primary font-bold">{page.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{page.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs font-medium text-muted-foreground">{page.type}</span>
                                                <span className="text-muted-foreground/30">•</span>
                                                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span className="text-xs font-medium text-muted-foreground">{page.members.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={cn("text-xs px-2.5 py-0.5", {
                                            "border-emerald-500/30 text-emerald-500 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]": page.activity === "Alta",
                                            "border-amber-500/30 text-amber-500 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]": page.activity === "Media",
                                            "border-muted-foreground/30 text-muted-foreground bg-muted/10": page.activity === "Baja",
                                        })}>{page.activity}</Badge>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </TabsContent>

                {/* ── GRUPOS ── */}
                <TabsContent value="groups" className="mt-6 animate-in fade-in-50 duration-500">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="btn-pill border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                                <Filter className="w-3.5 h-3.5 mr-1" /> Estudio
                            </Button>
                            <Button variant="ghost" size="sm" className="btn-pill">Cultural</Button>
                        </div>
                        <Button size="sm" className="btn-pill shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                            <Plus className="w-4 h-4 mr-1.5" /> Crear Grupo
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {studyGroups.map((group) => (
                            <Card key={group.id} className="group liquid-glass-panel shadow-lg hover:border-primary/40 transition-all duration-300 h-full p-2">
                                <CardContent className="p-4 flex flex-col h-full">
                                    <div className="flex items-start gap-4 mb-4">
                                        <Avatar className="h-12 w-12 ring-2 ring-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]">
                                            <AvatarImage src={group.avatar} />
                                            <AvatarFallback className="bg-primary/20 text-primary font-bold">{group.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{group.name}</p>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <Badge variant="outline" className="text-[10px] px-2 py-0 border-white/10 uppercase tracking-wider">{group.type}</Badge>
                                                <Badge variant="outline" className="text-[10px] px-2 py-0 border-white/10 uppercase tracking-wider">{group.level}</Badge>
                                            </div>
                                        </div>
                                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 bg-white/5 py-1 px-2 rounded-full">
                                            <Users className="w-3.5 h-3.5" /> {group.members}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 rounded-2xl p-3 mb-4 flex-grow border border-white/5">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Próxima sesión:</p>
                                        <p className="text-sm font-semibold text-foreground leading-snug">{group.topic}</p>
                                        <p className="text-xs font-medium text-primary mt-1.5 flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" /> {group.nextSession}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-auto">
                                        {group.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-medium text-muted-foreground bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">{tag}</span>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── EVENTOS ── */}
                <TabsContent value="events" className="mt-6 animate-in fade-in-50 duration-500">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <span className="section-label">{communityEvents.length} EVENTOS PRÓXIMOS</span>
                        <Button size="sm" className="btn-pill shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                            <Plus className="w-4 h-4 mr-1.5" /> Crear Evento
                        </Button>
                    </div>
                    <div className="space-y-4">
                        {communityEvents.map((event) => (
                            <Card key={event.id} className={cn(
                                "group liquid-glass-panel shadow-lg hover:scale-[1.01] transition-all duration-300 p-2 overflow-hidden relative",
                            )}>
                                <div className={cn("absolute inset-0 bg-gradient-to-r opacity-20 pointer-events-none", eventColors[event.color] ?? "from-white/5 to-white/0")} />
                                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10">
                                    <div className="text-center min-w-[4rem] px-2">
                                        <div className="text-3xl font-black text-foreground drop-shadow-sm">{event.date.split('-')[2]}</div>
                                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(event.date.split('-')[1]) - 1]}</div>
                                    </div>
                                    <div className="hidden sm:block w-px h-12 bg-white/10" />
                                    <div className="flex-1 min-w-0 w-full">
                                        <div className="flex items-center gap-2 mb-1">
                                            {event.urgent && <AlertTriangle className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{event.type}</span>
                                        </div>
                                        <p className="font-semibold text-foreground text-lg mb-1.5">{event.title}</p>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                <MapPin className="w-3.5 h-3.5 text-primary/70" /> {event.location}
                                            </span>
                                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-primary/70" /> {event.time}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center sm:flex-col sm:items-end w-full sm:w-auto mt-4 sm:mt-0 gap-4 sm:gap-2">
                                        <div className="flex-1 sm:text-right min-w-[5rem]">
                                            <div className="text-sm font-bold text-foreground">
                                                {event.attendees} <span className="text-muted-foreground font-medium">/ {event.capacity}</span>
                                            </div>
                                            <Progress value={(event.attendees / event.capacity) * 100} className="h-1.5 mt-1.5 w-full sm:w-20" />
                                        </div>
                                        <Button size="sm" variant="outline" className="btn-pill w-full sm:w-auto h-8 px-4 border-white/20 hover:bg-white/10 text-xs">
                                            Asistir
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── PARTIDOS POLÍTICOS ── */}
                <TabsContent value="parties" className="mt-6 animate-in fade-in-50 duration-500">
                    <p className="text-sm font-medium text-muted-foreground mb-6 max-w-2xl px-1">
                        Los partidos políticos te permiten replicar tu voto automáticamente y unificar la acción colectiva en las Entidades Federativas.
                    </p>
                    <div className="space-y-4">
                        {politicalParties.map((party) => (
                            <Card key={party.id} className="liquid-glass-panel group shadow-lg hover:border-primary/40 transition-all duration-300 p-2">
                                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div
                                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-[inset_0_2px_10px_rgba(255,255,255,0.2)]"
                                            style={{ backgroundColor: party.color + '44', border: `1px solid ${party.color}66`, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                                        >
                                            {party.name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground text-lg mb-0.5">{party.name}</p>
                                            <p className="text-sm font-medium text-muted-foreground mb-2">{party.ideology}</p>
                                            <div className="flex flex-wrap items-center gap-4">
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 bg-white/5 py-1 px-2.5 rounded-full border border-white/5">
                                                    <Users className="w-3.5 h-3.5 text-primary/80" /> {party.members.toLocaleString()} miembros
                                                </span>
                                                <span className="text-xs font-semibold text-muted-foreground bg-white/5 py-1 px-2.5 rounded-full border border-white/5">
                                                    {party.votes_history} votos históricos
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between md:flex-col md:items-end gap-3 mt-4 md:mt-0 bg-white/5 md:bg-transparent p-3 md:p-0 rounded-xl">
                                        {party.isFollowing && (
                                            <div className="flex items-center justify-between w-full md:w-auto gap-3">
                                                <span className="text-xs font-medium text-white/80">Replicar votos</span>
                                                <Switch
                                                    checked={partyStates[party.id]}
                                                    onCheckedChange={(v) => setPartyStates(prev => ({ ...prev, [party.id]: v }))}
                                                    className="data-[state=checked]:bg-primary"
                                                />
                                            </div>
                                        )}
                                        <Button
                                            size="sm"
                                            variant={party.isFollowing ? "outline" : "default"}
                                            className={cn("btn-pill w-full md:w-auto md:min-w-[120px] shadow-lg shadow-black/20", party.isFollowing ? "border-primary/50 text-primary hover:bg-primary/10" : "bg-primary text-primary-foreground hover:bg-primary/90")}
                                        >
                                            {party.isFollowing ? "Siguiendo" : "Seguir"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── GESTIÓN DE VOTOS ── */}
                <TabsContent value="vote-management" className="mt-6 animate-in fade-in-50 duration-500">
                    <div className="space-y-4">
                        {voteManagement.map((item, i) => (
                            <Card key={i} className="liquid-glass-panel group shadow-lg hover:border-primary/40 transition-all duration-300 p-2 relative overflow-hidden">
                                {/* Indicator line based on urgency */}
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1",
                                    item.urgency === 'Alta' ? 'bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                        item.urgency === 'Media' ? 'bg-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                            'bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                )} />
                                <CardContent className="p-4 pl-6 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className={cn("inline-flex self-start md:self-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm", urgencyColors[item.urgency])}>
                                        {item.urgency}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-foreground text-lg mb-1 leading-snug">{item.proposal}</p>
                                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
                                            <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{item.ef}</span>
                                            <span className="opacity-50">•</span>
                                            <span>Fecha límite: <span className="text-foreground/80">{item.deadline}</span></span>
                                        </div>
                                    </div>
                                    <div className="mt-2 md:mt-0 flex justify-end">
                                        {item.voted ? (
                                            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
                                                <CheckCircle2 className="w-5 h-5 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> Votado
                                            </div>
                                        ) : (
                                            <Link href="/network/politics" className="w-full md:w-auto">
                                                <Button size="sm" className="btn-pill w-full shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)] min-w-[120px]">
                                                    <Vote className="w-4 h-4 mr-1.5" /> Votar
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div >
    );
}
