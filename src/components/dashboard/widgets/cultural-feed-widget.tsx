'use client';

import React from 'react';
import { Sparkles, Radio, Heart, MessageCircle, PlayCircle, Eye, Share2, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const CULTURAL_POSTS = [
    {
        id: '1',
        type: 'VIDEO',
        title: 'Quantum Resonance Vol. 4',
        author: '@Kael_V',
        description: 'Audiovisual exploration of plasma light frequencies.',
        duration: '03:42',
        likes: '1.2k',
        comments: '84',
        color: 'from-primary via-primary/80 to-accent',
    },
    {
        id: '2',
        type: 'MANIFESTO',
        title: 'Open Source Biology',
        author: '@Lyra_Sys',
        description: 'Cultivating digital ecosystems where silicon and thought converge.',
        quote: "We don't build software, we cultivate digital life.",
        likes: '342',
        views: '4.1k',
        color: 'from-accent to-primary',
    },
    {
        id: '3',
        type: 'AUDIO',
        title: 'Solar Wind Harmonics',
        author: '@Sol_Tracker',
        description: 'Live data-driven soundscape from the Parker Probe.',
        duration: 'LIVE',
        likes: '890',
        comments: '12',
        color: 'from-orange-500 to-primary',
    }
];

export function CulturalFeedWidget() {
    return (
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-3 @sm:p-5 border border-border/40 shadow-2xl text-foreground font-display group/widget">
            {/* Ambient Background Narrative */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary-hsl),0.05),transparent_50%)] pointer-events-none" />

            {/* Header */}
            <header className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-hsl),0.3)] border border-white/10"
                    >
                        <Radio size={20} className="text-primary-foreground drop-shadow-md" />
                    </motion.div>
                    <div className="space-y-0 text-left">
                        <h2 className="text-[10px] uppercase tracking-[0.25em] text-primary/70 font-black leading-tight">Awareness Waves</h2>
                        <h1 className="text-sm font-black text-foreground tracking-widest uppercase leading-none">Cultural Feed</h1>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button className="h-7 px-3 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-[9px] font-black tracking-widest uppercase">
                        Trend
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="h-7 px-3 flex items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all text-[9px] font-black tracking-widest uppercase shadow-lg shadow-primary/20"
                    >
                        Live
                    </motion.button>
                </div>
            </header>

            {/* Scrollable Feed */}
            <main className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1 scrollbar-hide z-10 relative">
                <AnimatePresence initial={false}>
                    {CULTURAL_POSTS.map((post, idx) => (
                        <motion.article
                            key={post.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all group/post cursor-pointer relative overflow-hidden"
                        >
                            {post.type === 'VIDEO' && (
                                <>
                                    <div className="relative w-full h-28 rounded-xl overflow-hidden mb-3">
                                        <div className={cn("absolute inset-0 opacity-60 bg-gradient-to-br transition-transform duration-700 group-hover/post:scale-110", post.color)}></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <motion.div
                                                whileHover={{ scale: 1.2 }}
                                                className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-2xl"
                                            >
                                                <PlayCircle size={24} className="text-white" />
                                            </motion.div>
                                        </div>
                                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black text-white">{post.duration}</div>
                                    </div>
                                    <h3 className="text-sm font-black text-foreground leading-tight uppercase group-hover/post:text-primary transition-colors">{post.title}</h3>
                                </>
                            )}

                            {post.type === 'MANIFESTO' && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles className="w-3 h-3 text-primary" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-primary">Manifesto</span>
                                    </div>
                                    <h3 className="text-sm font-black text-foreground leading-tight uppercase group-hover/post:text-primary transition-colors">{post.title}</h3>
                                    <p className="text-[10px] text-muted-foreground italic border-l-2 border-primary/40 pl-3 py-1 bg-primary/5 rounded-r-lg">"{post.quote}"</p>
                                </div>
                            )}

                            {post.type === 'AUDIO' && (
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-primary flex items-center justify-center shadow-lg shrink-0">
                                        <Music className="text-white w-6 h-6 animate-bounce" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded uppercase pulse">Live</span>
                                            <h3 className="text-sm font-black text-foreground truncate uppercase">{post.title}</h3>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate">{post.description}</p>
                                    </div>
                                </div>
                            )}

                            {/* Author & Interactions */}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5 opacity-80 group-hover/post:opacity-100 transition-opacity">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-5 h-5 rounded-full bg-gradient-to-tr shadow-sm", post.color)}></div>
                                    <span className="text-[9px] font-black text-foreground tracking-tighter uppercase">{post.author}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1 text-[9px] font-bold"><Heart size={12} className="text-primary fill-primary/20" /> {post.likes}</span>
                                    <Share2 size={12} className="text-muted-foreground hover:text-primary" />
                                </div>
                            </div>
                        </motion.article>
                    ))}
                </AnimatePresence>
            </main>

            {/* Glass Overlays */}
            <div className="absolute inset-0 border border-border/5 rounded-xl pointer-events-none mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
        </div>
    );
}
