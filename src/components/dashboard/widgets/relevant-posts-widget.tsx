'use client';

import React, { useState } from 'react';
import { Layers, Zap, Hexagon, Feather, ChevronRight, Heart, MessageSquare, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Post {
    id: string;
    type: 'nexus' | 'ontocracy' | 'culture';
    tag: string;
    title: string;
    author: string;
    time: string;
    likes: number;
    comments: number;
}

const posts: Post[] = [
    { id: '1', type: 'nexus', tag: 'Update', title: 'Nueva versión del motor cuántico v4.2', author: 'Nexus Core', time: '2h', likes: 124, comments: 12 },
    { id: '2', type: 'ontocracy', tag: 'Proposal', title: 'Ajuste de parámetros éticos en la red', author: 'Consejo Alpha', time: '5h', likes: 89, comments: 45 },
    { id: '3', type: 'culture', tag: 'Art', title: 'Exhibición: Sueños del Silicio Transparente', author: 'Lyra', time: '12h', likes: 256, comments: 34 },
];

export function RelevantPostsWidget() {
    const [activeTab, setActiveTab] = useState<'all' | 'ontocracy' | 'nexus'>('all');

    const tabs = [
        { id: 'all', label: 'Global', icon: Layers },
        { id: 'ontocracy', label: 'Ontocracy', icon: Hexagon },
        { id: 'nexus', label: 'Nexus', icon: Zap },
    ] as const;

    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Header */}
            <header className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg border border-white/10">
                        <Feather size={14} className="text-primary-foreground" />
                    </div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[8px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Insight Stream</h2>
                        <h1 className="text-xs font-black text-foreground tracking-widest uppercase leading-none">Relevant Posts</h1>
                    </div>
                </div>
                <button className="text-[8px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-1 hover:gap-2 transition-all">
                    View Network <ChevronRight size={10} />
                </button>
            </header>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5 mb-3 relative z-10">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] uppercase tracking-widest font-black rounded-lg transition-all relative",
                                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeTabPost"
                                    className="absolute inset-0 bg-primary rounded-lg shadow-lg shadow-primary/20"
                                />
                            )}
                            <Icon size={10} className="relative z-10" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    )
                })}
            </div>

            {/* Posts List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <AnimatePresence mode="popLayout">
                    {posts.filter(p => activeTab === 'all' || p.type === activeTab).map((post, idx) => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ y: -2 }}
                            className="group/card bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/30 rounded-xl p-3 transition-all cursor-pointer relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={cn(
                                    "text-[7px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border font-black",
                                    post.type === 'nexus' ? "text-primary border-primary/20 bg-primary/10" :
                                        post.type === 'ontocracy' ? "text-amber-500 border-amber-500/20 bg-amber-500/10" :
                                            "text-accent border-accent/20 bg-accent/10"
                                )}>
                                    {post.tag}
                                </span>
                                <div className="flex items-center gap-1 text-[7px] text-muted-foreground/40 font-black uppercase">
                                    <Clock size={8} />
                                    {post.time}
                                </div>
                            </div>

                            <h3 className="text-[11px] font-black text-foreground group-hover/card:text-primary transition-colors leading-snug mb-2 uppercase tracking-tight line-clamp-2 italic">
                                "{post.title}"
                            </h3>

                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                    @{post.author.replace(' ', '_')}
                                </span>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 text-[8px] font-black text-muted-foreground/40">
                                        <Heart size={8} className="group-hover/card:text-red-500 transition-colors" />
                                        {post.likes}
                                    </div>
                                    <div className="flex items-center gap-1 text-[8px] font-black text-muted-foreground/40">
                                        <MessageSquare size={8} className="group-hover/card:text-primary transition-colors" />
                                        {post.comments}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
