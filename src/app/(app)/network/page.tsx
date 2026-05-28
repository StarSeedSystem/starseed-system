"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { RichPostCard } from "@/components/network/feed/rich-post-card";
import { networkService, Post } from "@/services/network-simulation-service";
import { TiltCard } from "@/components/ui/tilt-card";
import { Button } from "@/components/ui/button";
import { Send, Image as ImageIcon, Link as LinkIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function NetworkPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      const data = await networkService.getFeed();
      setPosts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    const promise = networkService.createPost(newPostContent);
    toast.promise(promise, {
      loading: "Broadcasting to StarSeed Network...",
      success: "Signal transmitted successfully!",
      error: "Transmission failed"
    });

    const post = await promise;
    setPosts(prev => [post, ...prev]);
    setNewPostContent("");
  };

  return (
    <div className="w-full px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] space-y-[clamp(1.5rem,3vw,3rem)] animate-in fade-in duration-500 pb-24">
      {/* Acceso al Cerebro (visualización geométrica unificada) */}
      <section className="relative z-0">
        <Link
          href="/network/graph"
          className="block group rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/15 via-fuchsia-500/5 to-cyan-500/10 hover:border-purple-400/40 p-5 transition-all duration-300 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/15 ring-1 ring-inset ring-purple-400/40">
              <Sparkles className="w-6 h-6 text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold">Cerebro</h2>
              <p className="text-xs text-muted-foreground">
                Visualización geométrica única de la memoria unificada, agentes,
                sentidos, skills, tools, MCPs y proveedores. Crea conexiones nuevas
                entre cualquier nodo del sistema.
              </p>
            </div>
            <Send className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </section>

      {/* Feed Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-[clamp(1rem,2vw,2rem)] relative z-10">

        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-6">

          {/* Create Post Input */}
          <TiltCard intensity={5} className="w-full">
            <form onSubmit={handleCreatePost} className="p-4 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg group focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-0.5 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                  <div className="w-full h-full rounded-full bg-background flex items-center justify-center text-xs font-bold text-foreground">ME</div>
                </div>
                <div className="flex-1 space-y-3">
                  <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Broadcast a new concept or signal..."
                    className="w-full bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 text-lg resize-none min-h-[60px]"
                  />
                  <div className="flex items-center justify-between border-t border-border/10 pt-3">
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="icon" className="text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-full h-8 w-8 btn-pill">
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="text-pink-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full h-8 w-8 btn-pill">
                        <LinkIcon className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button type="submit" disabled={!newPostContent.trim()} className="btn-pill bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 backdrop-blur-md px-6 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]">
                      Broadcast <Send className="w-3 h-3 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </TiltCard>

          {/* Posts List */}
          <div className="space-y-6">
            {loading ? (
              // Skeleton Loader
              [1, 2].map(i => (
                <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse border border-border/10" />
              ))
            ) : (
              posts.map(post => (
                <RichPostCard key={post.id} post={post} />
              ))
            )}
          </div>
        </div>

        {/* Trending Panel (Right Side) */}
        <div className="hidden lg:block space-y-4">
          {/* Live Network Stats */}
          <TiltCard intensity={8}>
            <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
              <h3 className="section-label mb-4">Red en Vivo</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Nodos", value: "8,423", color: "text-cyan-500 dark:text-cyan-400", bg: "bg-cyan-500/10" },
                  { label: "Sinapsis", value: "47.2k", color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-500/10" },
                  { label: "Propuestas Activas", value: "12", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10" },
                  { label: "Seeds en Flujo", value: "1.2M", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-xl p-3 text-center ${stat.bg} border border-border/5`}>
                    <div className={`text-xl font-bold font-headline ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>

          {/* Trending Concepts */}
          <TiltCard intensity={6} className="sticky top-24">
            <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
              <h3 className="section-label mb-4">Conceptos en Tendencia</h3>
              <div className="space-y-3">
                {[
                  { tag: "#SoberaníaDeDatos", count: "3.1k", trend: "↑" },
                  { tag: "#HyperGlass", count: "2.8k", trend: "↑" },
                  { tag: "#Ontocracy", count: "2.4k", trend: "→" },
                  { tag: "#AI_Ethics", count: "1.9k", trend: "↑" },
                  { tag: "#SolarPunk", count: "1.7k", trend: "↑" },
                  { tag: "#EnergíaLibre", count: "1.2k", trend: "↑" },
                ].map(item => (
                  <div key={item.tag} className="flex items-center justify-between group cursor-pointer p-2 hover:bg-white/5 dark:hover:bg-white/5 rounded-lg transition-colors -mx-2">
                    <span className="text-foreground/80 group-hover:text-primary transition-colors text-sm font-medium">
                      {item.tag}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{item.count}</span>
                      <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold">{item.trend}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>

          {/* Suggested Connections */}
          <TiltCard intensity={6}>
            <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
              <h3 className="section-label mb-4">Conexiones Sugeridas</h3>
              <div className="space-y-4">
                {[
                  { name: "Dra. Evelyn Reed", handle: "@evelyn", affinity: 94, field: "Filosofía Cuántica" },
                  { name: "Proyecto Stardust", handle: "@stardust", affinity: 88, field: "Arte Generativo" },
                  { name: "Alex Duran", handle: "@alex.d", affinity: 82, field: "Gobernanza IA" },
                ].map(person => (
                  <div key={person.handle} className="flex items-center gap-3 group cursor-pointer p-2 hover:bg-white/5 dark:hover:bg-white/5 rounded-xl transition-colors -mx-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                      {person.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{person.name}</p>
                      <p className="text[11px] text-muted-foreground truncate">{person.field}</p>
                    </div>
                    <div className="text-right flex-shrink-0 bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
                      <div className="text-xs text-primary font-bold">{person.affinity}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>
        </div>

      </section>
    </div>
  );
}
