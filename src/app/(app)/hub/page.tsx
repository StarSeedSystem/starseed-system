// src/app/(app)/hub/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
    Search, Briefcase, Vote, Users, BookOpen, CalendarDays,
    Globe, Clock, Zap, CheckCircle2,
    AlertTriangle, Star, ChevronRight, Plus, Filter,
    Activity, Award, Shield, Flame, MessageSquare, Cpu,
    Sparkles, Send, TrendingUp, BarChart3, Library, Terminal,
    Users2, AlertCircle, ChevronDown, Check, PlusCircle, Calendar,
    Scale, HelpCircle, ArrowUpRight, Play, CheckSquare
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { studyGroups, politicalParties, userBadges } from "@/lib/data";
import { slugify } from "@/lib/entity-links";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { useCalendar, LAYER_META, CalendarLayer, CalendarVisibility } from "@/contexts/calendar-context";
import { StoriesStrip } from "@/components/stories/stories-strip";

// ── TYPES & MOCK DATA FOR CONTRIBUTIONS ──
interface Volunteer {
    name: string;
    role: string;
    avatar: string;
    contributionType: 'code' | 'design' | 'writing' | 'organization' | 'other';
}

interface ContributionRecommendation {
    id: string;
    title: string;
    source: string;
    urgency: 'Crítico' | 'Alto' | 'Medio' | 'Bajo';
    urgencyVal: number; // 4 = Critico, 1 = Bajo
    relevance: number; // Percentage
    date: string; // ISO format
    description: string;
    potentialBadge: string;
    members: Volunteer[];
    tags: string[];
    aiAppGenerated: boolean;
    aiAppName?: string;
    messagingGroupCreated: boolean;
    goalsAchieved: boolean;
    calendarItemId?: string; // Reference to calendar event if created
}

const initialRecommendations: ContributionRecommendation[] = [
    {
        id: "rec-1",
        title: "Optimización de Código en Bóvedas de Datos Personales",
        source: "Ley de Soberanía de Datos (Democrática)",
        urgency: "Crítico",
        urgencyVal: 4,
        relevance: 98,
        date: "2026-05-29",
        description: "Se necesita un auditor de contratos inteligentes y criptógrafo para optimizar la latencia en las transferencias de semillas (Seeds) y resguardo de claves.",
        potentialBadge: "Criptógrafo de la Red",
        members: [
            { name: "Carlos M.", role: "Desarrollador Blockchain", avatar: "https://placehold.co/40x40.png", contributionType: 'code' },
            { name: "Elena R.", role: "Auditora de Seguridad", avatar: "https://placehold.co/40x40.png", contributionType: 'organization' }
        ],
        tags: ["Criptografía", "Contratos", "Seguridad"],
        aiAppGenerated: false,
        messagingGroupCreated: true,
        goalsAchieved: false
    },
    {
        id: "rec-2",
        title: "Diseño 3D de Domo de Permacultura Central",
        source: "Comunidad de Permacultura",
        urgency: "Alto",
        urgencyVal: 3,
        relevance: 85,
        date: "2026-05-27",
        description: "Requerimos diseñadores 3D o arquitectos para modelar el nuevo domo geodésico regenerativo. Se integrará como Asset 3D en la biblioteca.",
        potentialBadge: "Arquitecto Bio-Digital",
        members: [
            { name: "Sofia T.", role: "Diseñadora 3D", avatar: "https://placehold.co/40x40.png", contributionType: 'design' }
        ],
        tags: ["Modelado 3D", "Arquitectura", "Permacultura"],
        aiAppGenerated: true,
        aiAppName: "Generador Solar de Domo",
        messagingGroupCreated: false,
        goalsAchieved: false
    },
    {
        id: "rec-3",
        title: "Creación de Contenidos para el Currículo de IA",
        source: "Consejo Global (Educación)",
        urgency: "Medio",
        urgencyVal: 2,
        relevance: 72,
        date: "2026-05-28",
        description: "Redacción de guías prácticas y lecciones interactivas para el nivel de iniciación en Ética de Inteligencia Artificial.",
        potentialBadge: "Educador de la Red",
        members: [],
        tags: ["Educación", "IA", "Ética"],
        aiAppGenerated: false,
        messagingGroupCreated: false,
        goalsAchieved: false
    }
];

const initialParticipations = [
    { id: "part-1", type: "Propuesta Activa", title: "Ley de Soberanía de Datos Personales", status: "60% completado", href: "/network/politics", icon: <Vote className="w-5 h-5 text-primary" />, urgency: "alta", progress: 60, potentialBadge: "Guardián de Datos" },
    { id: "part-2", type: "Proyecto Activo", title: "Sistema de Riego Comunitario Inteligente", status: "75% completado", href: "#", icon: <Briefcase className="w-5 h-5 text-emerald-400" />, urgency: "normal", progress: 75, potentialBadge: "Eco-Líder" },
    { id: "part-3", type: "Caso Judicial", title: "Disputa de Límites - Huerto A vs B", status: "40% completado", href: "/network/politics", icon: <Shield className="w-5 h-5 text-amber-400" />, urgency: "normal", progress: 40, potentialBadge: "Mediador StarSeed" },
    { id: "part-4", type: "Curso en Curso", title: "Ética en la Inteligencia Artificial", status: "85% completado", href: "#", icon: <BookOpen className="w-5 h-5 text-cyan-400" />, urgency: "normal", progress: 85, potentialBadge: "Sabio de la Red" },
];

const initialGoals = [
    { id: "goal-1", title: "Defensa de Datos", progress: 80, badge: "Insignia Guardián", detail: "800/1000 horas", description: "Auditoría de seguridad y soberanía de datos en redes descentralizadas.", tag: "Seguridad" },
    { id: "goal-2", title: "Comunidades Verdes", progress: 45, badge: "Insignia Eco-Líder", detail: "5/10 domos", description: "Apoya el diseño 3D y permacultura regenerativa local.", tag: "Permacultura" },
    { id: "goal-3", title: "Educación de IA", progress: 90, badge: "Insignia Sabio Digital", detail: "9/10 lecciones", description: "Crea guías prácticas de ética y alineación de agentes autónomos.", tag: "Educación" }
];


const myPages = [
    { name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png", members: 2847, href: "/entidad/ef-valle-central", activity: "Alta" },
    { name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png", members: 128, href: "/profile/comunidad-permacultura", activity: "Media" },
    { name: "Partido: Coalición Verde", type: "Partido Político", avatar: "https://placehold.co/40x40.png", members: 2890, href: "/partido/coalicion-verde", activity: "Alta" },
    { name: "Asamblea Local Oikos Norte", type: "Asamblea", avatar: "https://placehold.co/40x40.png", members: 312, href: "/grupo/asamblea-local-oikos-norte", activity: "Alta" },
    { name: "Sangha Norte", type: "Comunidad", avatar: "https://placehold.co/40x40.png", members: 128, href: "/pagina/sangha-norte", activity: "Media" },
];

const voteManagement = [
    { proposal: "Ley de Soberanía de Datos Personales", ef: "E.F. Valle Central", deadline: "3 días", voted: false, urgency: "Urgente" },
    { proposal: "Protocolo de Energía Renovable Comunitaria", ef: "E.F. Norte Verde", deadline: "12 días", voted: true, urgency: "Alta" },
    { proposal: "Currículo Abierto de Educación Universal", ef: "Consejo Global", deadline: "21 días", voted: false, urgency: "Media" },
];

const urgencyColors: Record<string, string> = {
    "alta": "text-red-400 bg-red-400/10 border-red-400/20",
    "Urgente": "text-red-400 bg-red-400/10 border-red-400/20",
    "Alta": "text-amber-400 bg-amber-400/10 border-amber-400/20",
    "Media": "text-blue-400 bg-blue-400/10 border-blue-400/20",
    "normal": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

export default function HubPage() {
    const { addItem } = useCalendar();

    const [partyStates, setPartyStates] = useState(
        politicalParties.reduce((acc, p) => ({ ...acc, [p.id]: p.replicationActive }), {} as Record<string, boolean>)
    );

    // ── CONTROLLED TABS & DYNAMIC USER DATA ──
    const [activeTab, setActiveTab] = useState("contributions");
    const [userReputation, setUserReputation] = useState(1842);
    const [completedContributionsCount, setCompletedContributionsCount] = useState(347);
    const [userSeeds, setUserSeeds] = useState(9240);
    const [userKarma, setUserKarma] = useState(2.4);

    // ── CONTRIBUTIONS & PARTICIPATIONS STATES ──
    const [recommendations, setRecommendations] = useState<ContributionRecommendation[]>(initialRecommendations);
    const [participations, setParticipations] = useState(initialParticipations);
    const [sortBy, setSortBy] = useState<'urgency' | 'relevance' | 'date'>('urgency');
    const [showPublishForm, setShowPublishForm] = useState(false);
    const [myBadges, setMyBadges] = useState(userBadges.slice(0, 5));

    // ── INTERACTIVE GOALS & FILTERS ──
    const [goals, setGoals] = useState(initialGoals);
    const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
    const [goalFilter, setGoalFilter] = useState<string | null>(null);
    const [expandedParticipation, setExpandedParticipation] = useState<string | null>(null);

    // Interactive messaging group chat state per recommendation
    const [chats, setChats] = useState<Record<string, { sender: string; text: string; time: string; avatar: string }[]>>({
        "rec-1": [
            { sender: "Carlos M.", text: "¡Hola! ¿Cómo vamos con la auditoría de seguridad?", time: "12:15", avatar: "https://placehold.co/40x40.png" },
            { sender: "Elena R.", text: "Ya optimicé el 40% del contrato de Seeds. ¿Quién revisa las claves?", time: "12:20", avatar: "https://placehold.co/40x40.png" }
        ],
        "rec-2": [
            { sender: "Sofia T.", text: "Terminé el modelo geodésico base en .cif. ¿Les parece bien la altura de 15m?", time: "10:30", avatar: "https://placehold.co/40x40.png" }
        ],
        "rec-3": [
            { sender: "Brenda S.", text: "He preparado el esquema de la Lección 1. ¿Desean que genere las preguntas de validación?", time: "09:00", avatar: "https://placehold.co/40x40.png" }
        ]
    });
    const [chatInputs, setChatInputs] = useState<Record<string, string>>({});

    // Dynamic AI app simulation states
    const [aiAuditSeeds, setAiAuditSeeds] = useState("5000");
    const [aiAuditStatus, setAiAuditStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [aiAuditLogs, setAiAuditLogs] = useState<string[]>([]);

    const [aiDomeRadius, setAiDomeRadius] = useState(25);
    const [aiDomeFaces, setAiDomeFaces] = useState(32);
    const [aiDomeColor, setAiDomeColor] = useState('#22d3ee');

    const [aiLessonTopic, setAiLessonTopic] = useState("Sesgos en Modelos de Lenguaje");
    const [aiLessonStatus, setAiLessonStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [aiLessonContent, setAiLessonContent] = useState<any>(null);

    // Premium Stat Click Breakdown State
    const [selectedStat, setSelectedStat] = useState<'reputation' | 'contributions' | 'seeds' | 'karma' | null>(null);

    // Dynamic premium notifications (toast)
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Auto-clear toast
    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    // Form inputs
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formUrgency, setFormUrgency] = useState<'Crítico' | 'Alto' | 'Medio' | 'Bajo'>('Medio');
    const [formType, setFormType] = useState<'Ayuda' | 'Aportación' | 'Voluntarios'>('Ayuda');
    const [formTarget, setFormTarget] = useState<'democratica' | 'pagina' | 'perfil'>('pagina');
    const [formBadge, setFormBadge] = useState('');
    const [formTags, setFormTags] = useState('');

    // Dynamic Interaction States
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [joinName, setJoinName] = useState('Alex Duran');
    const [joinRole, setJoinRole] = useState('Auditor de Datos');
    const [joinType, setJoinType] = useState<'code' | 'design' | 'writing' | 'organization' | 'other'>('code');

    // Manual calendar settings state
    const [addingManualId, setAddingManualId] = useState<string | null>(null);
    const [manualDate, setManualDate] = useState('');
    const [manualTime, setManualTime] = useState('10:00');
    const [manualDuration, setManualDuration] = useState(60);
    const [manualVisibility, setManualVisibility] = useState<CalendarVisibility>('privado');
    const [manualLayer, setManualLayer] = useState<CalendarLayer>('educacion');

    const [activeChartTab, setActiveChartTab] = useState<'reputation' | 'contributions' | 'seeds' | 'karma'>('reputation');

    // Sync chart tab with selected stat tab for cohesion
    useEffect(() => {
        if (selectedStat) {
            setActiveChartTab(selectedStat);
        }
    }, [selectedStat]);

    const handleAbandonParticipation = (id: string) => {
        setParticipations(prev => prev.filter(p => p.id !== id));
        setToastMessage("Participación pausada/archivada limpiamente.");
    };

    const handleCompleteParticipation = (item: any) => {
        setParticipations(prev => prev.filter(p => p.id !== item.id));
        setCompletedContributionsCount(prev => prev + 1);
        setUserReputation(prev => prev + 250);
        setUserSeeds(prev => prev + 300);
        
        // Add new badge
        const newBadge = {
            id: `badge-${Date.now()}`,
            name: item.potentialBadge || "Aportante StarSeed",
            description: `Completado con éxito: ${item.title}`,
            icon: "🏆",
            color: "gold"
        };
        setMyBadges(prev => [...prev, newBadge]);
        setToastMessage(`¡Felicitaciones! Aportación "${item.title}" completada. Reclamaste la insignia: "${item.potentialBadge}"`);
    };

    // Handle publishing a new request
    const handlePublish = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle || !formDescription) return;

        const newRec: ContributionRecommendation = {
            id: `rec-${Date.now()}`,
            title: formTitle,
            source: formTarget === 'democratica' ? 'Publicación Democrática' : formTarget === 'pagina' ? 'Página de la Red' : 'Perfil del Usuario',
            urgency: formUrgency,
            urgencyVal: formUrgency === 'Crítico' ? 4 : formUrgency === 'Alto' ? 3 : formUrgency === 'Medio' ? 2 : 1,
            relevance: Math.floor(Math.random() * 40) + 60, // 60-100
            date: new Date().toISOString().slice(0, 10),
            description: formDescription,
            potentialBadge: formBadge || "Aportante StarSeed",
            members: [],
            tags: formTags ? formTags.split(',').map(t => t.trim()) : ["Comunidad"],
            aiAppGenerated: false,
            messagingGroupCreated: false,
            goalsAchieved: false
        };

        setRecommendations([newRec, ...recommendations]);
        setShowPublishForm(false);
        setToastMessage(`¡Nueva solicitud publicada con éxito en ${newRec.source}!`);

        // Initialize chat mock for new recommendation
        setChats(prev => ({
            ...prev,
            [newRec.id]: [{ sender: "Exocórtex (IA)", text: `Bienvenido al canal coordinado para "${newRec.title}". ¡Postúlate o inicia un test dinámico!`, time: "12:00", avatar: "https://placehold.co/40x40.png" }]
        }));

        // Reset form
        setFormTitle('');
        setFormDescription('');
        setFormUrgency('Medio');
        setFormBadge('');
        setFormTags('');
    };

    // Join contribution recommendation (Volunteer)
    const handleJoin = (id: string) => {
        const targetRec = recommendations.find(r => r.id === id);
        if (!targetRec) return;

        // Prevent duplicate join
        if (targetRec.members.some(m => m.name === joinName)) {
            setToastMessage("Ya estás postulado en esta aportación.");
            setJoiningId(null);
            return;
        }

        let calendarAddedText = "";
        let calendarId = undefined;

        // AUTOMATIC CALENDAR ADDITION IF DATE IS CONFIGURED
        if (targetRec.date) {
            let chosenLayer: CalendarLayer = 'educacion';
            if (targetRec.tags.some(t => t.toLowerCase().includes('cripto') || t.toLowerCase().includes('segur') || t.toLowerCase().includes('contrat') || t.toLowerCase().includes('ley'))) {
                chosenLayer = 'politica';
            } else if (targetRec.tags.some(t => t.toLowerCase().includes('permacult') || t.toLowerCase().includes('eco') || t.toLowerCase().includes('riego'))) {
                chosenLayer = 'cultura';
            }

            const newCalItem = addItem({
                title: `[Aportación] ${targetRec.title}`,
                description: `Colaboración voluntaria como ${joinRole}.\n\nDescripción original: ${targetRec.description}`,
                date: targetRec.date,
                time: "12:00",
                durationMin: 120,
                layer: chosenLayer,
                visibility: "privado",
                tags: [...targetRec.tags, "Aportación", "Voluntario"],
                urgent: targetRec.urgencyVal >= 3,
                aiHighlight: true
            });

            calendarId = newCalItem.id;
            calendarAddedText = " ¡Añadido automáticamente a tu Calendario!";
        }

        setRecommendations(prev => prev.map(rec => {
            if (rec.id === id) {
                return {
                    ...rec,
                    members: [...rec.members, { name: joinName, role: joinRole, avatar: "https://placehold.co/40x40.png", contributionType: joinType }],
                    calendarItemId: calendarId
                };
            }
            return rec;
        }));

        // Append to active participations list
        setParticipations([
            {
                type: "Aportación Voluntaria",
                title: targetRec.title,
                status: `Colaborando como ${joinRole}`,
                href: "#",
                icon: <Briefcase className="w-5 h-5 text-cyan-400" />,
                urgency: targetRec.urgency === 'Crítico' || targetRec.urgency === 'Alto' ? 'alta' : 'normal'
            },
            ...participations
        ]);

        setToastMessage(`¡Te has registrado como voluntario con éxito!${calendarAddedText}`);
        setJoiningId(null);
    };

    // Manual calendar addition
    const handleAddManual = (rec: ContributionRecommendation) => {
        const chosenDate = manualDate || rec.date || new Date().toISOString().slice(0, 10);
        
        const newCalItem = addItem({
            title: `[Aportación] ${rec.title}`,
            description: `Aportación planificada manualmente.\n\nDescripción: ${rec.description}`,
            date: chosenDate,
            time: manualTime,
            durationMin: Number(manualDuration),
            layer: manualLayer,
            visibility: manualVisibility,
            tags: [...rec.tags, "Aportación", "Manual"],
            urgent: rec.urgencyVal >= 3
        });

        setRecommendations(prev => prev.map(r => {
            if (r.id === rec.id) {
                return { ...r, calendarItemId: newCalItem.id };
            }
            return r;
        }));

        // Append to active participations
        setParticipations([
            {
                type: "Planificado Manualmente",
                title: rec.title,
                status: `Agendado para el ${chosenDate} a las ${manualTime}`,
                href: "#",
                icon: <Calendar className="w-5 h-5 text-purple-400" />,
                urgency: rec.urgency === 'Crítico' || rec.urgency === 'Alto' ? 'alta' : 'normal'
            },
            ...participations
        ]);

        setToastMessage(`¡Agendado manualmente! Compartible en la red (${manualVisibility}).`);
        setAddingManualId(null);
    };

    // Toggle AI App Generation simulation
    const generateAiApp = (id: string) => {
        setRecommendations(prev => prev.map(rec => {
            if (rec.id === id) {
                return {
                    ...rec,
                    aiAppGenerated: true,
                    aiAppName: `App de Gestión - ${rec.title.slice(0, 15)}`
                };
            }
            return rec;
        }));
        setToastMessage("¡Exocórtex generó un Widget Dinámico para coordinar esta aportación!");
    };

    // Toggle Messaging Group creation
    const createMessagingGroup = (id: string) => {
        setRecommendations(prev => prev.map(rec => {
            if (rec.id === id) {
                return {
                    ...rec,
                    messagingGroupCreated: true
                };
            }
            return rec;
        }));
        setToastMessage("¡Grupo de mensajería instantánea encriptado creado para los participantes!");
    };

    // Send Message inside Interactive Chat Widget
    const handleSendMessage = (recId: string) => {
        const text = chatInputs[recId];
        if (!text) return;

        const newMsg = {
            sender: "Tú (Alex Duran)",
            text: text,
            time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            avatar: "https://placehold.co/40x40.png"
        };

        setChats(prev => ({
            ...prev,
            [recId]: [...(prev[recId] || []), newMsg]
        }));

        setChatInputs(prev => ({
            ...prev,
            [recId]: ''
        }));

        // Mock Exocortex instant follow-up reply in 1.5s
        setTimeout(() => {
            const followUp = {
                sender: "Exocórtex (IA)",
                text: `He recibido tu anotación. El nodo local ha sido notificado sobre la contribución de tipo "${text.slice(0, 20)}...".`,
                time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                avatar: "https://placehold.co/40x40.png"
            };
            setChats(prev => ({
                ...prev,
                [recId]: [...(prev[recId] || []), followUp]
            }));
        }, 1500);
    };

    // Run Security Audit dynamic widget simulation
    const runSecurityAudit = () => {
        setAiAuditStatus('running');
        setAiAuditLogs(["[SYSTEM] Iniciando auditoría automatizada...", "[SEC] Analizando dependencias de código libre..."]);
        
        setTimeout(() => {
            setAiAuditLogs(prev => [...prev, "[SEC] Verificando firmas criptográficas de Seeds...", "[SYSTEM] Compilando contrato inteligente v2.4..."]);
        }, 800);

        setTimeout(() => {
            setAiAuditLogs(prev => [...prev, "[OK] Análisis completo. 0 vulnerabilidades críticas encontradas.", `[DONE] Latencia optimizada de 45ms a 8ms para resguardo de ${aiAuditSeeds} Seeds.`]);
            setAiAuditStatus('done');
            setToastMessage("¡Auditoría de seguridad completada con éxito!");
        }, 2000);
    };

    // Generate ethics lesson dynamically
    const runGenerateLesson = () => {
        setAiLessonStatus('running');
        setTimeout(() => {
            setAiLessonContent({
                title: `Plan de Lección: ${aiLessonTopic}`,
                intro: "Un currículo diseñado proceduralmente para equilibrar transhumanismo e inteligencia distribuida.",
                bullets: [
                    "Alineamiento ontocrático de agentes artificiales.",
                    "Mitigación de sesgos algorítmicos en redes descentralizadas.",
                    "Evaluación práctica y validación por pares certificados."
                ]
            });
            setAiLessonStatus('done');
            setToastMessage("¡Lección de ética educativa generada por IA!");
        }, 1500);
    };

    // Toggle Goal achieved / Badge earned simulation and dynamically add badge to top row
    const completeGoal = (id: string) => {
        const targetRec = recommendations.find(r => r.id === id);
        if (!targetRec) return;

        setRecommendations(prev => prev.map(rec => {
            if (rec.id === id) {
                return {
                    ...rec,
                    goalsAchieved: true
                };
            }
            return rec;
        }));

        // ADD NEW EXPLICIT BADGE DYNAMICALLY TO THE STATE
        const newBadge = {
            id: `badge-${Date.now()}`,
            name: targetRec.potentialBadge,
            description: "Recompensa por aportación comunitaria",
            icon: "🏆",
            color: "gold"
        };
        setMyBadges(prev => [...prev, newBadge]);

        setToastMessage(`¡Felicitaciones! Objetivo cumplido. Reclamaste la insignia: "${targetRec.potentialBadge}"`);
    };

    // Filter recommendations by goal tag if active
    const filteredRecommendations = [...recommendations]
        .filter(rec => {
            if (!goalFilter) return true;
            return rec.tags.some(t => t.toLowerCase() === goalFilter.toLowerCase() || t.toLowerCase().includes(goalFilter.toLowerCase()));
        })
        .sort((a, b) => {
            if (sortBy === 'urgency') return b.urgencyVal - a.urgencyVal;
            if (sortBy === 'relevance') return b.relevance - a.relevance;
            return b.date.localeCompare(a.date);
        });

    return (
        <div className="flex flex-col w-full gap-[clamp(1.5rem,2.5vw,2.5rem)] pb-24 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] mx-auto relative">
            
            {/* ── ALERTA DE TOAST PREMIUM (NOTIFICACIONES EN TIEMPO REAL) ── */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-[999] animate-in fade-in-50 slide-in-from-bottom-5 duration-300 max-w-sm">
                    <Card className="bg-gradient-to-r from-purple-950/80 to-cyan-950/80 border border-cyan-500/30 backdrop-blur-xl text-white shadow-[0_0_25px_rgba(6,182,212,0.3)] rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5 animate-pulse" />
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-black uppercase tracking-widest text-cyan-300">Sincronización SOSD</h4>
                                <p className="text-xs font-semibold leading-relaxed text-slate-200">{toastMessage}</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* ── HISTORIAS TEMPORALES (Strip estética arriba de las publicaciones) ── */}
            <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-purple-500/[0.04] via-transparent to-cyan-500/[0.04] backdrop-blur p-3 -mt-1">
                <StoriesStrip
                    ownerKind="hub"
                    ownerId="hub-conexiones"
                    ownerLabel="Hub"
                    variant="hub"
                />
            </div>

            {/* ── HEADER CON TÍTULO Y BÚSQUEDA ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-[clamp(1rem,2vw,2rem)] w-full text-center md:text-left">
                <div className="flex-1 flex flex-col md:items-start items-center">
                    {/* Degradado tokenizado: respira con el tema activo (Aurora, Café…) */}
                    <h1 className="page-title font-headline text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary drop-shadow-[0_0_15px_hsl(var(--primary-hsl)/0.3)] w-full">
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

            {/* ── MENÚ TABS REORGANIZADO A LA PARTE SUPERIOR (CONSOLIDADOS) ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col mt-2">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 max-w-full lg:max-w-6xl mx-auto h-auto min-h-[50px] gap-2 bg-black/25 p-2 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-md">
                    <TabsTrigger value="contributions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <Briefcase className="w-4 h-4 mr-2 text-cyan-400" />Aportaciones
                    </TabsTrigger>
                    <TabsTrigger value="my-pages" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <Globe className="w-4 h-4 mr-2" />Mis Páginas
                    </TabsTrigger>
                    <TabsTrigger value="groups" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <Users className="w-4 h-4 mr-2" />Grupos
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <CalendarDays className="w-4 h-4 mr-2" />Calendario
                    </TabsTrigger>
                    <TabsTrigger value="parties" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <Flame className="w-4 h-4 mr-2" />Partidos
                    </TabsTrigger>
                    <TabsTrigger value="vote-management" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 rounded-xl font-bold tracking-wider text-xs md:text-sm">
                        <Vote className="w-4 h-4 mr-2" />Votos
                    </TabsTrigger>
                </TabsList>

                {/* ── SECCIÓN DE APORTACIONES COMPLETA ── */}
                <TabsContent value="contributions" className="mt-6 animate-in fade-in-50 duration-500 space-y-8">
                    
                    {/* Stats de Aportaciones e Impacto — BOTONES CENTRADOS, DILIGENTES Y DINÁMICOS */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[clamp(1rem,2vw,2rem)] w-full">
                        {[
                            { id: "reputation", label: "Reputación de Ayuda", value: userReputation.toLocaleString(), icon: <Star className="w-6 h-6 text-amber-500" />, trend: "+24 esta semana", bg: "bg-amber-500/10" },
                            { id: "contributions", label: "Aportaciones Realizadas", value: completedContributionsCount.toLocaleString(), icon: <Activity className="w-6 h-6 text-emerald-500" />, trend: "+12 este mes", bg: "bg-emerald-500/10" },
                            { id: "seeds", label: "Seeds de Recompensas", value: userSeeds.toLocaleString(), icon: <Zap className="w-6 h-6 text-cyan-500" />, trend: "Canjeables por Assets/Servicios", bg: "bg-cyan-500/10" },
                            { id: "karma", label: "Karma Acumulado", value: `×${userKarma.toFixed(1)}`, icon: <Flame className="w-6 h-6 text-orange-500" />, trend: "Multiplicador de Gobernanza", bg: "bg-orange-500/10" },
                        ].map((stat) => (
                            <button
                                key={stat.id}
                                className={cn(
                                    "select-none outline-none focus:outline-none transition-all duration-300 w-full group",
                                    selectedStat === stat.id ? "scale-[0.98]" : "hover:scale-[1.02]"
                                )}
                                onClick={() => setSelectedStat(selectedStat === stat.id ? null : stat.id as any)}
                            >
                                <Card className={cn(
                                    "liquid-glass-panel border-white/5 shadow-lg p-5 transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center text-center",
                                    selectedStat === stat.id ? "border-primary/50 ring-2 ring-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]" : "hover:border-white/10"
                                )}>
                                    <div className="flex flex-col items-center justify-center mb-3">
                                        <div className={cn("p-3 rounded-2xl ring-1 ring-inset ring-white/5 mb-2 transition-all group-hover:scale-110", stat.bg)}>
                                            {stat.icon}
                                        </div>
                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">{stat.label}</span>
                                    </div>
                                    <div className="text-3xl font-black font-headline text-foreground">{stat.value}</div>
                                    <div className="text-[11px] text-muted-foreground mt-3 font-medium flex items-center justify-center gap-1.5 w-full">
                                        <span>{stat.trend}</span>
                                        <span className="text-[9px] font-black text-primary uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Ver Detalles</span>
                                    </div>
                                </Card>
                            </button>
                        ))}
                    </div>

                    {/* PANEL DE DESGLOSE / CÁLCULO DE NÚMEROS INTEGRADO Y DINÁMICO — TOTALMENTE CENTRADO */}
                    {selectedStat && (
                        <Card className="liquid-glass-panel border-primary/20 shadow-2xl p-6 animate-in slide-in-from-top-4 duration-300 relative overflow-hidden text-center flex flex-col items-center">
                            <div className="absolute top-0 right-0 p-4">
                                <Button size="sm" variant="ghost" className="h-7 text-xs rounded-full font-bold uppercase border border-white/5" onClick={() => setSelectedStat(null)}>
                                    Cerrar Detalles
                                </Button>
                            </div>

                            {selectedStat === 'reputation' && (
                                <div className="space-y-4 w-full flex flex-col items-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500"><Star className="w-6 h-6 animate-pulse" /></div>
                                        <div>
                                            <h4 className="text-lg font-headline font-bold text-foreground">Desglose de Reputación de Ayuda</h4>
                                            <p className="text-xs text-muted-foreground max-w-xl mx-auto">Calculado mediante contribuciones verificadas y valoradas democráticamente por asambleas en cada E.F.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 w-full">
                                        {[
                                            { detail: "Verificación de Identidad Oficial", points: "+500 pts", category: "Gobernanza", date: "Sincronizado" },
                                            { detail: "Auditoría de Código Bóvedas de Datos", points: "+800 pts", category: "Desarrollo", date: "hace 2 días" },
                                            { detail: "Modelado Geodésico Huerto Norte", points: "+300 pts", category: "Diseño 3D", date: "hace 5 días" },
                                            { detail: "Facilitación del caso Huerto A vs B", points: "+242 pts", category: "Resolución", date: "hace 1 semana" },
                                        ].map((item, i) => (
                                            <div key={i} className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex flex-col justify-between items-center text-center shadow-inner hover:border-amber-500/20 transition-all duration-300">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/5 px-2 py-0.5 rounded-full border border-amber-400/10">{item.category}</span>
                                                    <p className="text-xs font-bold text-foreground mt-2.5 leading-relaxed">{item.detail}</p>
                                                </div>
                                                <div className="flex flex-col items-center gap-1 mt-4 pt-2 border-t border-white/5 w-full">
                                                    <span className="text-[10px] text-muted-foreground font-semibold">{item.date}</span>
                                                    <span className="text-sm text-amber-300 font-black">{item.points}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedStat === 'contributions' && (
                                <div className="space-y-4 w-full flex flex-col items-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"><Activity className="w-6 h-6 animate-pulse" /></div>
                                        <div>
                                            <h4 className="text-lg font-headline font-bold text-foreground">Aportaciones Realizadas por Especialidad</h4>
                                            <p className="text-xs text-muted-foreground max-w-xl mx-auto">Tareas completadas con éxito en el SOSD, categorizadas por tu especialidad técnica.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 w-full">
                                        {[
                                            { category: "Desarrollo (Código)", value: "120 tareas", progress: 85, color: "from-cyan-400 to-blue-500" },
                                            { category: "Diseño y Arte 3D", value: "85 assets", progress: 65, color: "from-purple-400 to-pink-500" },
                                            { category: "Redacción y Educación", value: "92 lecciones", progress: 95, color: "from-emerald-400 to-teal-500" },
                                            { category: "Organización y Soporte", value: "50 debates", progress: 40, color: "from-amber-400 to-orange-500" },
                                        ].map((item, i) => (
                                            <div key={i} className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-4 flex flex-col justify-between text-center hover:border-emerald-500/20 transition-all duration-300">
                                                <div className="space-y-1">
                                                    <span className="text-xs font-bold text-slate-300 block">{item.category}</span>
                                                    <div className="text-xl font-black text-emerald-400">{item.value}</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[9px] text-muted-foreground font-semibold">
                                                        <span>Eficiencia</span>
                                                        <span>{item.progress}%</span>
                                                    </div>
                                                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                                        <div className={cn("bg-gradient-to-r h-full rounded-full", item.color)} style={{ width: `${item.progress}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedStat === 'seeds' && (
                                <div className="space-y-4 w-full flex flex-col items-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500"><Zap className="w-6 h-6 animate-pulse" /></div>
                                        <div>
                                            <h4 className="text-lg font-headline font-bold text-foreground">Bóveda de Recursos de la Red</h4>
                                            <p className="text-xs text-muted-foreground max-w-xl mx-auto">Saldo en Semillas (Seeds) acumulado por méritos técnicos y gobernanza colectiva.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 w-full">
                                        {[
                                            { source: "Recompensas por Gobernanza Activa", amount: "5,000 SC", detail: "Votos validados en EF Valle Central", border: "border-cyan-500/20" },
                                            { source: "Aportes Técnicos y Código Libre", amount: "2,500 SC", detail: "Recompensa del Exocórtex por bóvedas de datos", border: "border-purple-500/20" },
                                            { source: "Intercambio en la Biblioteca / Store", amount: "1,740 SC", detail: "Descargas de tus Assets 3D y Blueprints", border: "border-emerald-500/20" },
                                        ].map((item, i) => (
                                            <div key={i} className={cn("bg-white/[0.02] border p-5 rounded-2xl flex flex-col justify-between items-center text-center shadow-lg hover:scale-[1.01] transition-transform", item.border)}>
                                                <div className="space-y-2">
                                                    <p className="text-xs font-bold text-slate-100">{item.source}</p>
                                                    <p className="text-[10px] text-muted-foreground leading-normal max-w-xs">{item.detail}</p>
                                                </div>
                                                <div className="text-xl font-black text-cyan-300 pt-4 w-full text-center border-t border-white/5 mt-3">{item.amount}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedStat === 'karma' && (
                                <div className="space-y-4 w-full flex flex-col items-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500"><Flame className="w-6 h-6 animate-pulse" /></div>
                                        <div>
                                            <h4 className="text-lg font-headline font-bold text-foreground">Multiplicador de Karma Activo</h4>
                                            <p className="text-xs text-muted-foreground max-w-xl mx-auto">Incrementa proporcionalmente la ponderación de tu opinión y tus Seeds de recompensa.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 w-full">
                                        {[
                                            { factor: "Multiplicador Base de Ciudadano", multiplier: "×1.5", detail: "Otorgado al verificar y autenticar tu cuenta oficial." },
                                            { factor: "Racha Activa de Ayuda Comunitaria", multiplier: "+0.5", detail: "Completaste al menos 3 aportaciones por semana en los últimos 30 días." },
                                            { factor: "Participación Democrática Consecuente", multiplier: "+0.4", detail: "Emitiste tu voto a tiempo en el 100% de las asambleas de tu EF local." },
                                        ].map((item, i) => (
                                            <div key={i} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-between items-center text-center shadow-lg hover:border-orange-500/20 transition-all duration-300">
                                                <div className="space-y-2">
                                                    <span className="text-xs font-bold text-foreground block">{item.factor}</span>
                                                    <p className="text-[10px] text-muted-foreground leading-normal max-w-xs">{item.detail}</p>
                                                </div>
                                                <div className="text-xl font-black text-orange-400 pt-4 w-full text-center border-t border-white/5 mt-3">{item.multiplier}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Insignias Obtenidas — TOTALMENTE CENTRADA */}
                    <div className="flex flex-wrap gap-3 items-center justify-center w-full bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
                        <span className="text-sm font-semibold text-muted-foreground mr-2 tracking-wider uppercase">Tus insignias obtenidas:</span>
                        <div className="flex flex-wrap gap-2 justify-center items-center">
                            {myBadges.map((badge) => (
                                <Badge key={badge.id} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border backdrop-blur-sm cursor-default transition-transform hover:scale-105", {
                                    "bg-blue-500/10 border-blue-500/30 text-blue-300": badge.color === 'blue',
                                    "bg-purple-500/10 border-purple-500/30 text-purple-300": badge.color === 'purple',
                                    "bg-amber-500/10 border-amber-500/30 text-amber-300": badge.color === 'gold',
                                    "bg-emerald-500/10 border-emerald-500/30 text-emerald-300": badge.color === 'green',
                                })} title={badge.description}>
                                    <span>{badge.icon}</span> {badge.name}
                                </Badge>
                            ))}
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full md:ml-auto uppercase tracking-wider font-bold border border-white/5 bg-white/5">
                            <Award className="w-4 h-4 mr-1.5" /> Ver todas las insignias
                        </Button>
                    </div>

                    {/* Fila superior: Historial + Objetivos + Participaciones (Estables, Fluidas y Balanceadas) */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 w-full items-stretch">
                        
                        {/* 1. Historial de Impacto (Col Span 2) */}
                        <div className="lg:col-span-2">
                          <Card className="liquid-glass-panel border-white/10 overflow-hidden flex flex-col justify-between h-full">
                              <CardHeader className="pb-2 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left gap-3">
                                    <div className="flex flex-col items-center sm:items-start">
                                        <CardTitle className="text-lg font-headline flex items-center gap-2">
                                            <BarChart3 className="w-5 h-5 text-cyan-400" /> Historial de Impacto
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Evolución temporal de tu reputación de ayuda comunitaria
                                        </CardDescription>
                                    </div>
                                    <div className="flex bg-black/30 p-1 rounded-xl border border-white/5 text-[11px] font-bold">
                                        <button 
                                            className={cn("px-3 py-1.5 rounded-lg transition-all", activeChartTab === 'reputation' ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/20" : "text-muted-foreground")}
                                            onClick={() => setActiveChartTab('reputation')}
                                        >
                                            Reputación
                                        </button>
                                        <button 
                                            className={cn("px-3 py-1.5 rounded-lg transition-all", activeChartTab === 'contributions' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20" : "text-muted-foreground")}
                                            onClick={() => setActiveChartTab('contributions')}
                                        >
                                            Aportes
                                        </button>
                                        <button 
                                            className={cn("px-3 py-1.5 rounded-lg transition-all", activeChartTab === 'seeds' ? "bg-orange-500/20 text-orange-300 border border-orange-500/20" : "text-muted-foreground")}
                                            onClick={() => setActiveChartTab('seeds')}
                                        >
                                            Seeds
                                        </button>
                                    </div>
                              </CardHeader>
                              <CardContent className="pt-4 h-64 flex flex-col justify-end text-center items-center">
                                <div className="relative w-full h-full">
                                    <svg className="w-full h-full overflow-visible" viewBox="0 0 600 200" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="chart-grad-cyan" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                                            </linearGradient>
                                            <linearGradient id="chart-grad-emerald" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
                                                <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
                                            </linearGradient>
                                            <linearGradient id="chart-grad-orange" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.4" />
                                                <stop offset="100%" stopColor="#fb923c" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>

                                        <line x1="0" y1="50" x2="600" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                                        <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                                        <line x1="0" y1="150" x2="600" y2="150" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                                        {activeChartTab === 'reputation' && (
                                            <>
                                                <path d="M 0 170 Q 100 130, 200 140 T 400 60 T 600 40 L 600 200 L 0 200 Z" fill="url(#chart-grad-cyan)" />
                                                <path d="M 0 170 Q 100 130, 200 140 T 400 60 T 600 40" fill="none" stroke="#22d3ee" strokeWidth="3" filter="drop-shadow(0px 0px 8px rgba(34,211,238,0.5))" />
                                                <circle cx="200" cy="140" r="4" fill="#22d3ee" stroke="white" strokeWidth="2" />
                                                <circle cx="400" cy="60" r="4" fill="#22d3ee" stroke="white" strokeWidth="2" />
                                                <circle cx="600" cy="40" r="4" fill="#22d3ee" stroke="white" strokeWidth="2" />
                                            </>
                                        )}

                                        {activeChartTab === 'contributions' && (
                                            <>
                                                <path d="M 0 190 Q 120 160, 240 120 T 480 90 T 600 20 L 600 200 L 0 200 Z" fill="url(#chart-grad-emerald)" />
                                                <path d="M 0 190 Q 120 160, 240 120 T 480 90 T 600 20" fill="none" stroke="#34d399" strokeWidth="3" filter="drop-shadow(0px 0px 8px rgba(52,211,153,0.5))" />
                                                <circle cx="240" cy="120" r="4" fill="#34d399" stroke="white" strokeWidth="2" />
                                                <circle cx="480" cy="90" r="4" fill="#34d399" stroke="white" strokeWidth="2" />
                                                <circle cx="600" cy="20" r="4" fill="#34d399" stroke="white" strokeWidth="2" />
                                            </>
                                        )}

                                        {activeChartTab === 'seeds' && (
                                            <>
                                                <path d="M 0 150 Q 100 150, 200 80 T 400 110 T 600 50 L 600 200 L 0 200 Z" fill="url(#chart-grad-orange)" />
                                                <path d="M 0 150 Q 100 150, 200 80 T 400 110 T 600 50" fill="none" stroke="#fb923c" strokeWidth="3" filter="drop-shadow(0px 0px 8px rgba(251,146,60,0.5))" />
                                                <circle cx="200" cy="80" r="4" fill="#fb923c" stroke="white" strokeWidth="2" />
                                                <circle cx="400" cy="110" r="4" fill="#fb923c" stroke="white" strokeWidth="2" />
                                                <circle cx="600" cy="50" r="4" fill="#fb923c" stroke="white" strokeWidth="2" />
                                            </>
                                        )}

                                        {activeChartTab === 'karma' && (
                                            <>
                                                <path d="M 0 180 Q 150 120, 300 150 T 600 30 L 600 200 L 0 200 Z" fill="url(#chart-grad-orange)" />
                                                <path d="M 0 180 Q 150 120, 300 150 T 600 30" fill="none" stroke="#fb923c" strokeWidth="3" filter="drop-shadow(0px 0px 8px rgba(251,146,60,0.5))" />
                                                <circle cx="300" cy="150" r="4" fill="#fb923c" stroke="white" strokeWidth="2" />
                                                <circle cx="600" cy="30" r="4" fill="#fb923c" stroke="white" strokeWidth="2" />
                                            </>
                                        )}
                                    </svg>
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground mt-4 font-bold tracking-widest w-full">
                                    <span>ENERO</span>
                                    <span>MARZO</span>
                                    <span>MAYO (HOY)</span>
                                </div>
                              </CardContent>
                          </Card>
                        </div>
 
                        {/* 2. Objetivos de Aportación (Col Span 1) */}
                        <div className="lg:col-span-1">
                          <Card className="liquid-glass-panel border-white/10 overflow-hidden flex flex-col justify-between h-full text-center items-center">
                              <CardHeader className="pb-2 w-full flex flex-col items-center">
                                <CardTitle className="text-lg font-headline flex items-center gap-2">
                                    <Award className="w-5 h-5 text-amber-400" /> Objetivos de Aportación
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Completa metas grupales para reclamar insignias únicas
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pt-2 space-y-3 flex-grow flex flex-col justify-start w-full">
                                {goals.map((goal) => {
                                    const isSelected = selectedGoal === goal.id;
                                    return (
                                        <div key={goal.id} className="w-full flex flex-col items-center">
                                            <button 
                                                type="button"
                                                className={cn(
                                                    "w-full text-left space-y-1 bg-white/[0.02] border p-3 rounded-xl flex flex-col justify-center text-center items-center shadow-inner transition-all duration-300", 
                                                    isSelected ? "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20" : "border-white/5 hover:border-white/15"
                                                )}
                                                onClick={() => setSelectedGoal(isSelected ? null : goal.id)}
                                            >
                                                <div className="flex justify-between items-center text-xs w-full font-bold">
                                                    <span className="text-slate-200">{goal.title}</span>
                                                    <span className="text-primary">{goal.progress}%</span>
                                                </div>
                                                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1.5">
                                                    <div 
                                                        className="bg-gradient-to-r from-cyan-400 to-purple-400 h-full rounded-full transition-all duration-500" 
                                                        style={{ width: `${goal.progress}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between items-center text-[9px] text-muted-foreground font-semibold pt-1 w-full mt-0.5">
                                                    <span>{goal.detail}</span>
                                                    <span className="text-amber-300 font-bold">{goal.badge}</span>
                                                </div>
                                            </button>
                                            {isSelected && (
                                                <div className="w-full bg-black/40 border border-amber-500/10 p-3 rounded-xl mt-2 text-center flex flex-col items-center space-y-2 animate-in slide-in-from-top duration-200">
                                                    <p className="text-[10px] text-slate-300 font-semibold leading-relaxed">{goal.description}</p>
                                                    <div className="flex gap-1.5 pt-1 w-full justify-center">
                                                        <Button 
                                                            size="sm" 
                                                            className="h-7 text-[9px] btn-pill bg-amber-600 hover:bg-amber-500 text-white font-bold w-full uppercase tracking-wider"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setGoalFilter(goal.tag);
                                                                setToastMessage(`Filtrando feed por etiquetas de "${goal.title}"`);
                                                            }}
                                                        >
                                                            <Filter className="w-2.5 h-2.5 mr-1" /> Filtrar Aportes
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 text-[9px] btn-pill border border-white/10 text-muted-foreground hover:text-white uppercase tracking-wider w-full"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedGoal(null);
                                                            }}
                                                        >
                                                            Cerrar
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                              </CardContent>
                          </Card>
                        </div>
 
                        {/* 3. Participaciones Activas (Col Span 1 — MOVIDA AQUÍ PARA CUBRIR EL ESPACIO EN BLANCO) */}
                        <div className="lg:col-span-1">
                          <Card className="liquid-glass-panel border-white/10 overflow-hidden flex flex-col justify-between h-full text-center items-center">
                              <CardHeader className="pb-2 w-full flex flex-col items-center">
                                <div className="flex items-center justify-between w-full">
                                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Participaciones Activas
                                    </CardTitle>
                                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                                        {participations.length} Activas
                                    </Badge>
                                </div>
                                <CardDescription className="text-xs mt-1 w-full text-center">
                                    Tus proyectos y auditorías en curso (haz clic para gestionar)
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pt-2 space-y-3 flex-grow overflow-y-auto max-h-[340px] custom-scrollbar w-full flex flex-col justify-start">
                                {participations.length === 0 && (
                                    <p className="text-xs text-muted-foreground py-3 text-center">No estás participando en ningún proyecto aún.</p>
                                )}
                                {participations.map((item) => {
                                    const isExpanded = expandedParticipation === item.id;
                                    return (
                                        <div key={item.id} className="w-full flex flex-col">
                                            <button 
                                                type="button"
                                                className={cn(
                                                    "group flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border transition-all duration-300 text-left w-full",
                                                    isExpanded ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/5 hover:border-primary/30"
                                                )}
                                                onClick={() => setExpandedParticipation(isExpanded ? null : item.id)}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 shrink-0">
                                                        {item.icon}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors leading-tight">{item.title}</p>
                                                        <p className="text-[9px] text-muted-foreground font-semibold truncate mt-0.5">{item.status}</p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 ml-1 flex items-center gap-1">
                                                    <span className="text-[10px] font-black text-cyan-400">{item.progress}%</span>
                                                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="bg-black/40 border border-emerald-500/10 p-3 rounded-2xl mt-2.5 space-y-3 text-center flex flex-col items-center animate-in slide-in-from-top duration-200">
                                                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Progreso de la Participación</div>
                                                    <div className="flex items-center gap-3 w-full justify-center">
                                                        <div className="text-sm font-black text-cyan-400">{item.progress}%</div>
                                                        <div className="flex gap-1.5">
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                className="h-6 px-2 rounded-full border-white/10 hover:bg-white/5 text-[9px] font-bold"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setParticipations(prev => prev.map(p => {
                                                                        if (p.id === item.id) {
                                                                            const newProg = Math.max(0, p.progress - 10);
                                                                            return { ...p, progress: newProg, status: newProg === 100 ? "Completado" : `${newProg}% completado` };
                                                                        }
                                                                        return p;
                                                                    }));
                                                                }}
                                                            >
                                                                -10%
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                className="h-6 px-2 rounded-full border-white/10 hover:bg-white/5 text-[9px] font-bold"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setParticipations(prev => prev.map(p => {
                                                                        if (p.id === item.id) {
                                                                            const newProg = Math.min(100, p.progress + 10);
                                                                            return { ...p, progress: newProg, status: newProg === 100 ? "Completado" : `${newProg}% completado` };
                                                                        }
                                                                        return p;
                                                                    }));
                                                                }}
                                                            >
                                                                +10%
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                                        <div className="bg-gradient-to-r from-cyan-400 to-purple-400 h-full rounded-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                                                    </div>

                                                    <div className="flex flex-col gap-1.5 w-full justify-center pt-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-[9px] btn-pill border-white/10 hover:bg-white/5 w-full font-bold uppercase tracking-wider"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveTab("calendar");
                                                                setToastMessage("Abriendo Calendario para ubicar participaciones...");
                                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                                            }}
                                                        >
                                                            <Calendar className="w-3.5 h-3.5 mr-1" /> Ver en Calendario
                                                        </Button>

                                                        {item.progress === 100 ? (
                                                            <Button
                                                                size="sm"
                                                                className="h-7 text-[9px] btn-pill bg-emerald-600 hover:bg-emerald-500 text-white w-full font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleCompleteParticipation(item);
                                                                }}
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Reclamar Insignia
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 text-[9px] btn-pill text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full font-bold uppercase tracking-wider border border-transparent hover:border-red-500/20"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAbandonParticipation(item.id);
                                                                }}
                                                            >
                                                <AlertCircle className="w-3.5 h-3.5 mr-1" /> Pausar Aportación
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
              </CardContent>
          </Card>
        </div>
    </div>

    {/* ── FEED DE RECOMENDACIONES DE APORTACIONES A 100% ANCHO COMPLETO ── */}
    <div className="space-y-4">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Aportaciones Recomendadas:</span>
                <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300 bg-cyan-500/10 font-bold px-2 py-0.5">
                    {filteredRecommendations.length} Disponibles
                </Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
                <Button 
                    size="sm" 
                    className="h-8 text-xs btn-pill bg-cyan-600 hover:bg-cyan-50 text-white font-bold shadow-lg shadow-cyan-500/20"
                    onClick={() => setShowPublishForm(!showPublishForm)}
                >
                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Publicar Solicitud
                </Button>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-semibold">Ordenar por:</span>
                    <div className="flex bg-black/20 p-0.5 rounded-xl border border-white/5 text-[11px] font-bold">
                        <button 
                            className={cn("px-3 py-1.5 rounded-lg transition-all", sortBy === 'urgency' ? "bg-primary/20 text-primary border border-primary/20" : "text-muted-foreground")}
                            onClick={() => setSortBy('urgency')}
                        >
                            Urgencia
                        </button>
                        <button 
                            className={cn("px-3 py-1.5 rounded-lg transition-all", sortBy === 'relevance' ? "bg-primary/20 text-primary border border-primary/20" : "text-muted-foreground")}
                            onClick={() => setSortBy('relevance')}
                        >
                            Relevancia (IA)
                        </button>
                        <button 
                            className={cn("px-3 py-1.5 rounded-lg transition-all", sortBy === 'date' ? "bg-primary/20 text-primary border border-primary/20" : "text-muted-foreground")}
                            onClick={() => setSortBy('date')}
                        >
                            Fecha
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Banner de filtro activo */}
        {goalFilter && (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/20 p-3 rounded-2xl animate-in fade-in-50 duration-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Filter className="w-4 h-4" />
                    <span>Filtro de Objetivo Activo: <strong className="uppercase tracking-widest text-slate-100 px-2 py-0.5 bg-primary/20 rounded-md border border-primary/30">{goalFilter}</strong></span>
                </div>
                <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-[10px] rounded-full uppercase font-bold border border-primary/10 hover:bg-primary/20 text-primary"
                    onClick={() => setGoalFilter(null)}
                >
                    Limpiar Filtro
                </Button>
            </div>
        )}

        {/* Formulario de Publicación Centrado */}
        {showPublishForm && (
            <Card className="liquid-glass-panel border-cyan-500/30 shadow-2xl p-6 animate-in slide-in-from-top duration-300 max-w-2xl mx-auto w-full text-center flex flex-col items-center">
                <div className="flex justify-between items-center w-full border-b border-white/5 pb-2">
                    <span className="text-sm font-bold uppercase tracking-widest text-cyan-300 flex items-center gap-1.5 mx-auto sm:mx-0">
                        <PlusCircle className="w-4 h-4 text-cyan-400 shrink-0" /> Publicar Nueva Solicitud de Ayuda / Voluntarios
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs rounded-full font-bold uppercase border border-white/5" onClick={() => setShowPublishForm(false)}>
                        Cancelar
                    </Button>
                </div>
                <form onSubmit={handlePublish} className="space-y-4 w-full pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 flex flex-col items-center">
                            <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Título de la Solicitud</label>
                            <Input 
                                placeholder="Ej. Diseño 3D de Domo de Permacultura" 
                                value={formTitle}
                                onChange={e => setFormTitle(e.target.value)}
                                className="h-10 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-cyan-500/50 w-full"
                                required
                            />
                        </div>
                        <div className="space-y-1.5 flex flex-col items-center">
                            <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Insignia a Reclamar (Badge)</label>
                            <Input 
                                placeholder="Ej. Diseñador Regenerativo" 
                                value={formBadge}
                                onChange={e => setFormBadge(e.target.value)}
                                className="h-10 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-cyan-500/50 w-full"
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-1.5 flex flex-col items-center">
                        <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Descripción del Aporte Requerido</label>
                        <textarea 
                            placeholder="Describe en detalle las habilidades que se necesitan, las metas del proyecto y la urgencia de la comunidad..." 
                            value={formDescription}
                            onChange={e => setFormDescription(e.target.value)}
                            className="min-h-[90px] bg-black/40 border border-white/10 rounded-xl text-xs p-3 text-slate-200 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/50 w-full text-center"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5 flex flex-col items-center">
                            <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Nivel de Urgencia</label>
                            <select 
                                value={formUrgency} 
                                onChange={e => setFormUrgency(e.target.value as any)} 
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-xl text-xs px-2 outline-none text-foreground text-center"
                            >
                                <option value="Crítico">Crítico (Urgente)</option>
                                <option value="Alto">Alto</option>
                                <option value="Medio">Medio</option>
                                <option value="Bajo">Bajo</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 flex flex-col items-center">
                            <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Tipo de Publicación</label>
                            <select 
                                value={formType} 
                                onChange={e => setFormType(e.target.value as any)} 
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-xl text-xs px-2 outline-none text-foreground text-center"
                            >
                                <option value="Ayuda">Ayuda Comunitaria</option>
                                <option value="Aportación">Aportación Técnica</option>
                                <option value="Voluntarios">Convocatoria de Voluntarios</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 flex flex-col items-center">
                            <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Destino en la Red</label>
                            <select 
                                value={formTarget} 
                                onChange={e => setFormTarget(e.target.value as any)} 
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-xl text-xs px-2 outline-none text-foreground text-center"
                            >
                                <option value="pagina">Página Comunitaria</option>
                                <option value="democratica">Propuesta Democrática</option>
                                <option value="perfil">Perfil Personal</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5 flex flex-col items-center">
                        <label className="text-xs font-black text-slate-200 uppercase tracking-wider">Etiquetas (Separadas por comas)</label>
                        <Input 
                            placeholder="Ej. Criptografía, Permacultura, Educación" 
                            value={formTags}
                            onChange={e => setFormTags(e.target.value)}
                            className="h-10 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-cyan-500/50 w-full"
                        />
                    </div>

                    <Button 
                        type="submit" 
                        className="btn-pill h-10 w-full bg-cyan-600 hover:bg-cyan-50 text-white font-bold shadow-lg shadow-cyan-500/20"
                    >
                        Confirmar y Publicar en la Red
                    </Button>
                </form>
            </Card>
        )}

        <div className="space-y-4">
            {filteredRecommendations.length === 0 ? (
                <Card className="liquid-glass-panel border-white/10 p-12 text-center flex flex-col items-center justify-center">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mb-4 animate-pulse" />
                    <p className="text-sm font-semibold text-slate-300">No se encontraron aportaciones recomendadas con el filtro seleccionado.</p>
                    <Button variant="outline" size="sm" className="btn-pill mt-4 border-white/10" onClick={() => setGoalFilter(null)}>
                        Mostrar todas
                    </Button>
                </Card>
            ) : (
                filteredRecommendations.map((rec) => (
                    <Card key={rec.id} className="liquid-glass-panel border-white/10 group shadow-xl hover:border-primary/30 transition-all duration-300 overflow-hidden relative">
                        
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", 
                            rec.urgency === 'Crítico' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' :
                            rec.urgency === 'Alto' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]' :
                            rec.urgency === 'Medio' ? 'bg-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.8)]' :
                            'bg-emerald-500'
                        )} />

                        <CardContent className="p-6 pl-8 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                <div className="space-y-1.5 text-center md:text-left flex-1">
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-white/5 border border-white/5 px-2.5 py-1 rounded-full">
                                            {rec.source}
                                        </span>
                                        <Badge variant="outline" className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full",
                                            rec.urgency === 'Crítico' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                            rec.urgency === 'Alto' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                                            'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
                                        )}>
                                            Urgencia: {rec.urgency}
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-bold px-2.5 py-0.5 rounded-full">
                                            Relevancia: {rec.relevance}%
                                        </Badge>
                                    </div>
                                    <h3 className="text-xl font-headline font-bold text-foreground leading-snug group-hover:text-cyan-300 transition-colors pt-1">
                                        {rec.title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground font-medium max-w-4xl mx-auto md:mx-0">
                                        {rec.description}
                                    </p>
                                </div>

                                <div className="bg-gradient-to-br from-amber-500/10 to-purple-500/10 border border-white/10 p-3 rounded-2xl flex flex-col items-center justify-center text-center self-center md:self-start min-w-[150px] shadow-lg shrink-0">
                                    <Award className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] mb-1 animate-pulse" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Insignia Ofrecida</span>
                                    <span className="text-xs font-bold text-amber-300 mt-1">{rec.potentialBadge}</span>
                                </div>
                            </div>

                            {/* Voluntarios por especialidad — Centrados y balanceados */}
                            <div className="bg-black/20 border border-white/5 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center md:justify-start gap-1.5">
                                    <Users2 className="w-4 h-4 text-cyan-400" /> Voluntarios Inscritos ({rec.members.length})
                                </h4>
                                {rec.members.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic text-center md:text-left">Aún no hay voluntarios postulados. ¡Sé el primero!</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {['code', 'design', 'writing', 'organization'].map((type) => {
                                            const group = rec.members.filter(m => m.contributionType === type);
                                            if (group.length === 0) return null;
                                            return (
                                                <div key={type} className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex flex-col items-center text-center">
                                                    <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300 mb-2.5 border-b border-white/5 pb-1 w-full">
                                                        {type === 'code' ? 'Desarrollo' : type === 'design' ? 'Diseño' : type === 'writing' ? 'Contenido' : 'Organización'}
                                                    </div>
                                                    <div className="space-y-2 w-full flex flex-col items-center">
                                                        {group.map((m, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs justify-center w-full">
                                                                <Avatar className="h-6 w-6">
                                                                    <AvatarImage src={m.avatar} />
                                                                    <AvatarFallback>{m.name[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0 text-left">
                                                                    <div className="font-semibold text-foreground leading-tight truncate">{m.name}</div>
                                                                    <div className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">{m.role}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Acciones e Interconexiones en Grilla Balanceada y Centrada */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 w-full pt-3 border-t border-white/5">
                                <Button 
                                    size="sm" 
                                    className="btn-pill shadow-lg shadow-primary/20 text-xs font-bold w-full justify-center"
                                    onClick={() => setJoiningId(joiningId === rec.id ? null : rec.id)}
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 shrink-0" /> Postularme
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn("btn-pill text-xs font-bold border-white/10 hover:bg-white/5 w-full justify-center",
                                        rec.calendarItemId && "border-purple-500/30 text-purple-400 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                                    )}
                                    onClick={() => {
                                        setAddingManualId(addingManualId === rec.id ? null : rec.id);
                                        setManualDate(rec.date);
                                    }}
                                >
                                    <Calendar className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    {rec.calendarItemId ? "Agendado" : "Calendario"}
                                </Button>

                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className={cn("btn-pill text-xs font-bold border-white/10 hover:bg-white/5 w-full justify-center", 
                                        rec.messagingGroupCreated && "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                    )}
                                    onClick={() => createMessagingGroup(rec.id)}
                                    disabled={rec.messagingGroupCreated}
                                >
                                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 shrink-0" /> 
                                    {rec.messagingGroupCreated ? "Chat Activo" : "Crear Chat"}
                                </Button>

                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className={cn("btn-pill text-xs font-bold border-white/10 hover:bg-white/5 w-full justify-center",
                                        rec.aiAppGenerated && "border-purple-500/30 text-purple-400 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                                    )}
                                    onClick={() => generateAiApp(rec.id)}
                                    disabled={rec.aiAppGenerated}
                                >
                                    <Cpu className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    {rec.aiAppGenerated ? "Widget Activo" : "Widget IA"}
                                </Button>

                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className={cn("btn-pill text-xs font-bold w-full justify-center col-span-2 md:col-span-1", 
                                        rec.goalsAchieved ? "text-emerald-400" : "text-muted-foreground hover:text-white"
                                    )}
                                    onClick={() => completeGoal(rec.id)}
                                    disabled={rec.goalsAchieved}
                                >
                                    <Award className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                    {rec.goalsAchieved ? "Completado" : "Cumplido"}
                                </Button>
                            </div>

                            {/* Formulario de Postulación de Voluntario */}
                            {joiningId === rec.id && (
                                <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-5 mt-4 space-y-4 animate-in fade-in-50 duration-200 max-w-xl mx-auto w-full text-center flex flex-col items-center">
                                    <div className="text-sm font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" /> Formulario de Postulación de Voluntario
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center max-w-md">Completa tus datos para confirmar tu participación y agendar automáticamente el evento en tu calendario de la red.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Tu Nombre</label>
                                            <Input 
                                                value={joinName} 
                                                onChange={e => setJoinName(e.target.value)} 
                                                className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-cyan-500/50" 
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Rol Propuesto</label>
                                            <Input 
                                                value={joinRole} 
                                                onChange={e => setJoinRole(e.target.value)} 
                                                className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-cyan-500/50" 
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Especialidad</label>
                                            <select 
                                                value={joinType} 
                                                onChange={e => setJoinType(e.target.value as any)} 
                                                className="w-full h-9 bg-black/40 border border-white/10 rounded-xl text-xs px-2 outline-none text-foreground text-center"
                                            >
                                                <option value="code">Desarrollo (Código)</option>
                                                <option value="design">Diseño (Estructura)</option>
                                                <option value="writing">Contenido (Redacción)</option>
                                                <option value="organization">Organización</option>
                                                <option value="other">Otro</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-center w-full pt-2">
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="text-xs font-bold btn-pill border border-white/10"
                                            onClick={() => setJoiningId(null)}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            className="text-xs font-bold btn-pill bg-cyan-600 hover:bg-cyan-50 text-white shadow-lg shadow-cyan-500/20"
                                            onClick={() => handleJoin(rec.id)}
                                        >
                                            Confirmar y Agendar
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Añadir manual form */}
                            {addingManualId === rec.id && (
                                <div className="bg-black/40 border border-purple-500/30 rounded-2xl p-5 mt-4 space-y-4 animate-in fade-in-50 duration-200 max-w-xl mx-auto w-full text-center flex flex-col items-center">
                                    <div className="text-sm font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4 text-purple-400 shrink-0" /> Configuración Manual de Evento
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center max-w-md">Planifica tu aportación manualmente. Al guardarlo se indexará en tus participaciones y se unificará en tu agenda.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Fecha</label>
                                            <Input 
                                                type="date"
                                                value={manualDate} 
                                                onChange={e => setManualDate(e.target.value)} 
                                                className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-purple-500/50" 
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Hora de Inicio</label>
                                            <Input 
                                                type="time"
                                                value={manualTime} 
                                                onChange={e => setManualTime(e.target.value)} 
                                                className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-purple-500/50" 
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Duración (Minutos)</label>
                                            <Input 
                                                type="number"
                                                value={manualDuration} 
                                                onChange={e => setManualDuration(Number(e.target.value))} 
                                                className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-purple-500/50" 
                                            />
                                        </div>
                                        <div className="space-y-1.5 flex flex-col items-center">
                                            <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Capa del Calendario</label>
                                            <select 
                                                value={manualLayer} 
                                                onChange={e => setManualLayer(e.target.value as CalendarLayer)} 
                                                className="w-full h-9 bg-black/40 border border-white/10 rounded-xl text-xs px-2 outline-none text-foreground text-center"
                                            >
                                                <option value="educacion">Educación (Taller)</option>
                                                <option value="cultura">Cultura (Arte/Diseño)</option>
                                                <option value="politica">Gobernanza / Política</option>
                                                <option value="personal">Agenda Personal</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2 w-full border-t border-white/5">
                                        <div className="flex items-center gap-3 justify-center mx-auto sm:mx-0">
                                            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">Visibilidad de Red:</span>
                                            <div className="flex bg-black/40 p-0.5 rounded-xl border border-white/10 text-[10px] font-bold">
                                                <button
                                                    type="button"
                                                    className={cn("px-3 py-1.5 rounded-lg transition-all", manualVisibility === 'privado' ? "bg-purple-500/20 text-purple-300" : "text-muted-foreground")}
                                                    onClick={() => setManualVisibility('privado')}
                                                >
                                                    Privado
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn("px-3 py-1.5 rounded-lg transition-all", manualVisibility === 'publico' ? "bg-purple-500/20 text-purple-300" : "text-muted-foreground")}
                                                    onClick={() => setManualVisibility('publico')}
                                                >
                                                    Público
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn("px-3 py-1.5 rounded-lg transition-all", manualVisibility === 'red' ? "bg-purple-500/20 text-purple-300" : "text-muted-foreground")}
                                                    onClick={() => setManualVisibility('red')}
                                                >
                                                    Red
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-center mx-auto sm:mx-0">
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                className="text-xs font-bold btn-pill border border-white/10"
                                                onClick={() => setAddingManualId(null)}
                                            >
                                                Cancelar
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                className="text-xs font-bold btn-pill bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20"
                                                onClick={() => handleAddManual(rec)}
                                            >
                                                Confirmar y Guardar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Chat coordinado (Canal encriptado) */}
                            {rec.messagingGroupCreated && (
                                <div className="bg-black/40 border border-emerald-500/20 rounded-2xl p-5 mt-4 space-y-4 animate-in fade-in-50 duration-200 max-w-xl mx-auto w-full text-center flex flex-col items-center">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2 w-full">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                                            <MessageSquare className="w-3.5 h-3.5 animate-pulse" /> Canal de Coordinación Encriptado (#aportacion-{rec.id.slice(4)})
                                        </span>
                                        <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[9px] font-bold">P2P Seguro</Badge>
                                    </div>
                                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar text-left w-full flex flex-col">
                                        {(chats[rec.id] || []).map((msg, idx) => {
                                            const isUser = msg.sender.startsWith("Tú");
                                            return (
                                                <div key={idx} className={cn("flex gap-2.5 text-xs p-3 rounded-2xl max-w-[85%] transition-all", 
                                                    isUser 
                                                        ? "bg-cyan-950/40 border border-cyan-500/20 self-end flex-row-reverse text-right" 
                                                        : "bg-white/[0.02] border border-white/5 self-start"
                                                )}>
                                                    <Avatar className="h-6 w-6 ring-1 ring-white/10 shrink-0">
                                                        <AvatarFallback className={isUser ? "bg-cyan-500/20 text-cyan-300" : "bg-white/10 text-white"}>
                                                            {msg.sender[0]}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="space-y-1 min-w-0">
                                                        <div className={cn("flex items-center gap-2", isUser ? "justify-end" : "justify-start")}>
                                                            <span className={cn("font-bold", isUser ? "text-cyan-300" : "text-slate-200")}>{msg.sender}</span>
                                                            <span className="text-[8px] text-muted-foreground font-medium">{msg.time}</span>
                                                        </div>
                                                        <p className="text-slate-300 font-medium leading-relaxed mt-0.5 whitespace-pre-wrap">{msg.text}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-white/5 w-full">
                                        <Input 
                                            placeholder="Escribe un mensaje al grupo..."
                                            value={chatInputs[rec.id] || ''}
                                            onChange={e => setChatInputs({ ...chatInputs, [rec.id]: e.target.value })}
                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage(rec.id)}
                                            className="bg-black/40 border-white/10 rounded-xl h-10 text-xs focus-visible:ring-emerald-500/50"
                                        />
                                        <Button size="sm" className="btn-pill h-10 px-4 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" onClick={() => handleSendMessage(rec.id)}>
                                            <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Widgets Interactivos de IA */}
                            {rec.aiAppGenerated && (
                                <div className="bg-gradient-to-r from-purple-950/20 to-indigo-950/20 border border-purple-500/30 rounded-2xl p-5 mt-4 space-y-4 animate-in slide-in-from-bottom duration-300 max-w-xl mx-auto w-full text-center flex flex-col items-center">
                                    <div className="flex justify-between items-center w-full border-b border-white/5 pb-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 flex items-center gap-1.5 mx-auto sm:mx-0">
                                            <Terminal className="w-3.5 h-3.5 animate-pulse" /> {rec.aiAppName} (Exocórtex)
                                        </span>
                                        <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] uppercase font-black hidden sm:inline-flex">
                                            Widget Activo
                                        </Badge>
                                    </div>

                                    {/* WIDGET 1: Auditoría de Seeds */}
                                    {rec.id === 'rec-1' && (
                                        <div className="bg-black/40 border border-purple-500/10 rounded-xl p-4 flex flex-col items-center gap-3 w-full">
                                            <div className="text-xs text-muted-foreground max-w-md text-center">Validador de contratos de Semillas. Inserta monto para iniciar escaneo criptográfico en la red.</div>
                                            <div className="flex gap-2 w-full max-w-xs justify-center items-center">
                                                <Input 
                                                    type="number"
                                                    value={aiAuditSeeds} 
                                                    onChange={e => setAiAuditSeeds(e.target.value)} 
                                                    className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center focus-visible:ring-purple-500/50" 
                                                    placeholder="Monto de Seeds"
                                                />
                                                <Button 
                                                    size="sm" 
                                                    className="h-9 text-[11px] btn-pill bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/20 shrink-0 px-4"
                                                    onClick={runSecurityAudit}
                                                    disabled={aiAuditStatus === 'running'}
                                                >
                                                    {aiAuditStatus === 'running' ? "Escaneando..." : "Iniciar Escaneo IA"}
                                                </Button>
                                            </div>
                                            {aiAuditLogs.length > 0 && (
                                                <div className="w-full bg-black/60 rounded-xl p-3.5 text-left font-mono text-[10px] text-cyan-300 space-y-1.5 mt-2 border border-purple-500/10 max-h-[140px] overflow-y-auto custom-scrollbar">
                                                    {aiAuditLogs.map((log, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <span className="text-purple-400 font-bold shrink-0">&gt;</span>
                                                            <span>{log}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* WIDGET 2: Modeler Geodésico SVG interactivo */}
                                    {rec.id === 'rec-2' && (
                                        <div className="bg-black/40 border border-purple-500/10 rounded-xl p-4 flex flex-col items-center gap-4 w-full">
                                            <div className="text-xs text-muted-foreground max-w-md text-center">Generador procedural 3D de cúpulas. Modifica los parámetros para alterar el render SVG.</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-1">
                                                <div className="space-y-1.5 flex flex-col items-center">
                                                    <label className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">Radio ({aiDomeRadius}m)</label>
                                                    <input type="range" min="10" max="60" value={aiDomeRadius} onChange={e => setAiDomeRadius(Number(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                                </div>
                                                <div className="space-y-1.5 flex flex-col items-center">
                                                    <label className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">Caras ({aiDomeFaces})</label>
                                                    <input type="range" min="8" max="48" value={aiDomeFaces} onChange={e => setAiDomeFaces(Number(e.target.value))} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                                </div>
                                                <div className="space-y-1.5 flex flex-col items-center">
                                                    <label className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">Color Estructural</label>
                                                    <select value={aiDomeColor} onChange={e => setAiDomeColor(e.target.value)} className="w-full h-8 bg-black text-[10px] rounded-lg border border-white/10 text-foreground outline-none px-2 text-center">
                                                        <option value="#22d3ee">Cian Eléctrico</option>
                                                        <option value="#10B981">Esmeralda Aurora</option>
                                                        <option value="#fb923c">Solar Ámbar</option>
                                                        <option value="#a855f7">Cosmic Purple</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="w-40 h-40 bg-black/60 rounded-full flex items-center justify-center p-3 border border-purple-500/10 relative overflow-hidden shadow-inner mx-auto mt-2">
                                                <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100">
                                                    <circle cx="50" cy="50" r={aiDomeRadius / 1.5} fill="none" stroke={aiDomeColor} strokeWidth="1" strokeDasharray="3 3" opacity="0.3" className="animate-spin-slow" />
                                                    {Array.from({ length: aiDomeFaces }).map((_, idx) => {
                                                        const angle = (idx * 2 * Math.PI) / aiDomeFaces;
                                                        const r = aiDomeRadius / 1.5;
                                                        const x = 50 + r * Math.cos(angle);
                                                        const y = 50 + r * Math.sin(angle);
                                                        return (
                                                            <line key={idx} x1="50" y1="50" x2={x} y2={y} stroke={aiDomeColor} strokeWidth="0.8" opacity="0.6" />
                                                        );
                                                    })}
                                                    <circle cx="50" cy="50" r="3" fill="#a855f7" className="animate-pulse" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}

                                    {/* WIDGET 3: Currículo Creador */}
                                    {rec.id === 'rec-3' && (
                                        <div className="bg-black/40 border border-purple-500/10 rounded-xl p-4 flex flex-col items-center gap-3 w-full">
                                            <div className="text-xs text-muted-foreground max-w-md text-center">Generador de currículos educativos del Exocórtex. Escribe el tema para estructurar la lección.</div>
                                            <div className="flex gap-2 w-full max-w-xs justify-center items-center">
                                                <Input 
                                                    value={aiLessonTopic} 
                                                    onChange={e => setAiLessonTopic(e.target.value)} 
                                                    className="h-9 bg-black/40 border-white/10 rounded-xl text-xs text-center font-bold focus-visible:ring-purple-500/50" 
                                                />
                                                <Button 
                                                    size="sm" 
                                                    className="h-9 text-[11px] btn-pill bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/20 shrink-0 px-4"
                                                    onClick={runGenerateLesson}
                                                    disabled={aiLessonStatus === 'running'}
                                                >
                                                    {aiLessonStatus === 'running' ? "Generando..." : "Generar Plan"}
                                                </Button>
                                            </div>
                                            {aiLessonContent && (
                                                <div className="w-full bg-black/60 rounded-xl p-4 text-left font-sans text-xs text-slate-200 border border-purple-500/10 space-y-2.5 max-h-[160px] overflow-y-auto custom-scrollbar animate-in fade-in-50 mt-2">
                                                    <div className="font-black text-cyan-300 border-b border-white/5 pb-1 flex items-center justify-between">
                                                        <span>{aiLessonContent.title}</span>
                                                        <Badge className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold">Currículo IA</Badge>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground italic leading-relaxed">{aiLessonContent.intro}</p>
                                                    <div className="space-y-1.5 pt-1 font-semibold">
                                                        {aiLessonContent.bullets.map((b: string, i: number) => (
                                                            <div key={i} className="flex gap-2 items-start">
                                                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> 
                                                                <span className="text-slate-300">{b}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    </div>
                                )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
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

                {/* ── CALENDARIO UNIFICADO ── */}
                <TabsContent value="calendar" className="mt-6 animate-in fade-in-50 duration-500">
                    <HubCalendarPanel />
                </TabsContent>

                {/* ── PARTIDOS POLÍTICOS ── */}
                <TabsContent value="parties" className="mt-6 animate-in fade-in-50 duration-500">
                    <p className="text-sm font-medium text-muted-foreground mb-6 max-w-2xl px-1 text-center sm:text-left">
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
                                        <div className="flex-1 min-w-0 text-center md:text-left">
                                            <Link href={`/partido/${party.id}`} className="cursor-pointer">
                                                <p className="font-semibold text-foreground text-lg mb-0.5 hover:text-primary transition-colors">{party.name}</p>
                                            </Link>
                                            <p className="text-sm font-medium text-muted-foreground mb-2">{party.ideology}</p>
                                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
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
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1",
                                    item.urgency === 'Alta' ? 'bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                        item.urgency === 'Media' ? 'bg-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                            'bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                )} />
                                <CardContent className="p-4 pl-6 flex flex-col md:flex-row md:items-center gap-4">
                                    <div className={cn("inline-flex self-start md:self-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm", urgencyColors[item.urgency])}>
                                        {item.urgency}
                                    </div>
                                    <div className="flex-1 min-w-0 text-center md:text-left">
                                        <p className="font-semibold text-foreground text-lg mb-1 leading-snug">{item.proposal}</p>
                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm font-medium text-muted-foreground">
                                            <Link href={`/entidad/${slugify(item.ef)}`} className="bg-white/5 px-2 py-0.5 rounded border border-white/5 cursor-pointer hover:text-primary hover:border-primary/30 transition-colors">{item.ef}</Link>
                                            <span className="opacity-50">•</span>
                                            <span>Fecha límite: <span className="text-foreground/80">{item.deadline}</span></span>
                                        </div>
                                    </div>
                                    <div className="mt-2 md:mt-0 flex justify-end w-full md:w-auto">
                                        {item.voted ? (
                                            <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 w-full md:w-auto">
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
        </div>
    );
}

function HubCalendarPanel() {
    const { items, shareItem } = useCalendar();
    const todayISO = new Date().toISOString().slice(0, 10);

    const upcomingPublic = items
        .filter((it) => it.date >= todayISO && it.visibility === 'red')
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
        .slice(0, 5);

    const pendingConfirmation = items
        .filter((it) => it.date >= todayISO && it.visibility === 'publico')
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
        .slice(0, 5);

    return (
        <div className="flex flex-col gap-6">
            <UnifiedCalendar
                title="Calendario del Hub"
                subtitle="Un único calendario coherente con la Agenda de la Red. Filtra capas, abre un día para añadir/editar/eliminar entradas y comparte públicamente lo que quieras federar."
            />

            <div className="grid md:grid-cols-2 gap-4">
                <Card className="liquid-glass-panel border-white/10">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-headline flex items-center gap-2">
                                <Globe className="w-4 h-4 text-cyan-300" /> Próximos en la Red
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                                {upcomingPublic.length}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Eventos públicos ya federados a tus comunidades.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 space-y-2">
                        {upcomingPublic.length === 0 && (
                            <p className="text-xs text-muted-foreground py-3">
                                Aún no has publicado eventos en la Red.
                            </p>
                        )}
                        {upcomingPublic.map((it) => {
                            const meta = LAYER_META[it.layer];
                            return (
                                <div key={it.id} className={cn("flex items-center gap-3 p-2 rounded-xl border bg-white/[0.02]", meta.border)}>
                                    <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{it.title}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {it.date}{it.time ? ` · ${it.time}` : ''} · {meta.label}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                <Card className="liquid-glass-panel border-white/10">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-headline flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-300" /> Por confirmar
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300 bg-emerald-500/10">
                                {pendingConfirmation.length}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Eventos públicos pendientes de federar. Confirma para compartirlos en la Red.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 space-y-2">
                        {pendingConfirmation.length === 0 && (
                            <p className="text-xs text-muted-foreground py-3">
                                Nada por confirmar ahora mismo.
                            </p>
                        )}
                        {pendingConfirmation.map((it) => {
                            const meta = LAYER_META[it.layer];
                            return (
                                <div key={it.id} className={cn("flex items-center gap-3 p-2 rounded-xl border bg-white/[0.02]", meta.border)}>
                                    <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{it.title}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {it.date}{it.time ? ` · ${it.time}` : ''} · {meta.label}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="btn-pill h-7 text-[11px] border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                        onClick={() => shareItem(it.id)}
                                    >
                                        Confirmar
                                    </Button>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
