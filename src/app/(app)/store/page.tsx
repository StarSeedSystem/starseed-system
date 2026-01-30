"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Star, Zap, Filter, Share2, Globe, Heart } from "lucide-react";
import Image from "next/image";

// Data Model: Resources (Gift Economy)
const resources = [
    {
        id: "1",
        title: "Pack de Shaders Cuánticos",
        creator: "NeoGraphics Collective",
        rating: 4.8,
        reviews: 124,
        type: "ASSET_3D",
        image: "https://placehold.co/400x300/4c1d95/e0e7ff.png?text=Quantum+Shaders",
        description: "Colección de 20 shaders procedurables optimizados para WebGL. Código abierto para todos los creadores.",
        license: "MIT"
    },
    {
        id: "2",
        title: "Blueprint: Domo Geodésico",
        creator: "Arquitectura Viva",
        rating: 5.0,
        reviews: 45,
        type: "BLUEPRINT",
        image: "https://placehold.co/400x300/065f46/d1fae5.png?text=Geo+Dome+Blueprint",
        description: "Planos completos para construcción de domo V4. Compartido libremente para fomentar eco-aldeas.",
        license: "CC BY-SA"
    },
    {
        id: "3",
        title: "Avatar Rig: Cyber-Monje",
        creator: "Digital Soul",
        rating: 4.9,
        reviews: 12,
        type: "AVATAR",
        image: "https://placehold.co/400x300/9f1239/ffe4e6.png?text=Cyber+Monk",
        description: "Avatar riggeado de alta fidelidad. Disponible para replicación inmediata en tu perfil.",
        license: "StarSeed Public"
    },
    {
        id: "4",
        title: "Dataset: Patrones Climáticos",
        creator: "Observatorio Valle Central",
        rating: 4.5,
        reviews: 89,
        type: "DATASET",
        image: "https://placehold.co/400x300/0c4a6e/e0f2fe.png?text=Climate+Data",
        description: "Datos históricos de temperatura y humedad. Bien Común Universal para investigación.",
        license: "Public Domain"
    },
    {
        id: "5",
        title: "Kit de IA Ética",
        creator: "Consejo de Sabios",
        rating: 5.0,
        reviews: 8,
        type: "KNOWLEDGE",
        image: "https://placehold.co/400x300/78350f/fef3c7.png?text=AI+Ethics",
        description: "Frameworks y guías para alinear agentes autónomos con los principios de la vida.",
        license: "Open Source"
    },
];

export default function ResourceInterchangePage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [replicatedItems, setReplicatedItems] = useState<string[]>([]);

    const handleReplication = (id: string, title: string) => {
        // Simulate instant replication
        if (!replicatedItems.includes(id)) {
            setReplicatedItems([...replicatedItems, id]);
            // In a real app, this would trigger a download or add to user library
            // For now, we rely on the button state change for feedback
            console.log(`Replicated: ${title}`);
        }
    };

    return (
        <div className="flex flex-col gap-8 min-h-screen pb-20">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 animate-in fade-in slide-in-from-left-4 duration-700">
                    Intercambio de Recursos
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                    Economía del Regalo. Todo es libre. Replica, mejora y comparte activos digitales para la expansión de la consciencia.
                </p>
            </div>

            {/* Featured Banner - Collaborative Project */}
            <GlassCard className="p-8 relative overflow-hidden bg-gradient-to-r from-emerald-900/50 to-teal-900/50 border-emerald-500/20">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 space-y-4">
                        <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 animate-pulse">Proyecto Colaborativo</Badge>
                        <h2 className="text-3xl font-bold">Pack de Terraformación V2</h2>
                        <p className="text-lg text-muted-foreground">Herramientas comunitarias para la regeneración de ecosistemas virtuales y físicos. Contribuye tus propios assets.</p>
                        <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0">
                            Explorar Recursos <Globe className="ml-2 w-4 h-4" />
                        </Button>
                    </div>
                    <div className="w-full md:w-1/3 aspect-video relative rounded-lg overflow-hidden shadow-2xl shadow-emerald-500/20">
                        <Image src="https://placehold.co/600x400/064e3b/d1fae5.png?text=Open+Source+World" alt="Featured" fill className="object-cover" />
                    </div>
                </div>
                {/* Background decoration */}
                <div className="absolute -right-20 -bottom-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
            </GlassCard>

            {/* Search and Filter */}
            <div className="flex gap-4 items-center bg-background/5 p-2 rounded-xl border border-white/5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar recursos abiertos, planos o conocimiento..."
                        className="pl-10 bg-transparent border-0 focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button variant="ghost" size="icon"><Filter className="w-4 h-4" /></Button>
            </div>

            {/* Resource Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {resources.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase())).map(resource => (
                    <GlassCard key={resource.id} variant="hover" className="flex flex-col h-full group">
                        <div className="aspect-[4/3] relative overflow-hidden bg-black/20">
                            <Image
                                src={resource.image}
                                alt={resource.title}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            <div className="absolute top-2 right-2 flex gap-1">
                                {/* Badges removed as per request - redundancy check */}
                            </div>
                        </div>
                        <div className="p-4 flex flex-col flex-1 gap-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <Badge variant="outline" className="text-[10px] mb-1 opacity-70 border-white/20">{resource.type}</Badge>
                                    <h3 className="font-bold leading-tight group-hover:text-primary transition-colors">{resource.title}</h3>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{resource.description}</p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                                <span>{resource.license}</span>
                                <span>•</span>
                                <span>{resource.creator}</span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                                    <Heart className="w-3 h-3 fill-emerald-400" /> {resource.rating}
                                </div>
                                <Button
                                    size="sm"
                                    variant={replicatedItems.includes(resource.id) ? "secondary" : "default"}
                                    onClick={() => handleReplication(resource.id, resource.title)}
                                    disabled={replicatedItems.includes(resource.id)}
                                >
                                    {replicatedItems.includes(resource.id) ? (
                                        <>
                                            <Share2 className="w-4 h-4 mr-1" /> Replicado
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4 mr-1" /> Replicar
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    );
}
