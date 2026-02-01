"use client";

import React, { useEffect, useState } from "react";
import { HolographicGraph } from "@/components/network/holographic-graph";
import { RichPostCard } from "@/components/network/feed/rich-post-card";
import { networkService, Post } from "@/services/network-simulation-service";
import { TiltCard } from "@/components/ui/tilt-card";
import { Button } from "@/components/ui/button";
import { Send, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
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
    <div className="container py-8 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header Section */}
      <div className="space-y-2 relative z-10">
        <h1 className="text-4xl font-black font-headline tracking-tight text-white drop-shadow-md">
          StarSeed <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Network</span>
        </h1>
        <p className="text-white/60 text-lg max-w-2xl">
          Connect with the living ontology. Share concepts, visualize data, and replicate knowledge.
        </p>
      </div>

      {/* Hero Graph */}
      <section className="relative z-0">
        <HolographicGraph />
      </section>

      {/* Feed Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">

        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-6">

          {/* Create Post Input */}
          <TiltCard intensity={5} className="w-full">
            <form onSubmit={handleCreatePost} className="p-4 rounded-2xl bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/5 shadow-lg group focus-within:ring-1 focus-within:ring-white/20 transition-all">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-0.5">
                  <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-xs font-bold">ME</div>
                </div>
                <div className="flex-1 space-y-3">
                  <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Broadcast a new concept or signal..."
                    className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-white/30 text-lg resize-none min-h-[60px]"
                  />
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="icon" className="text-cyan-400 hover:bg-cyan-400/10 rounded-full h-8 w-8">
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="text-pink-400 hover:bg-pink-400/10 rounded-full h-8 w-8">
                        <LinkIcon className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button type="submit" disabled={!newPostContent.trim()} className="rounded-full bg-white/10 hover:bg-white/20 text-white px-6">
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
                <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
              ))
            ) : (
              posts.map(post => (
                <RichPostCard key={post.id} post={post} />
              ))
            )}
          </div>
        </div>

        {/* Trending Panel (Right Side) */}
        <div className="hidden lg:block space-y-6">
          <TiltCard intensity={8} className="sticky top-24">
            <div className="p-6 rounded-2xl bg-[#0a0a0a]/40 backdrop-blur-xl border border-white/5 shadow-lg">
              <h3 className="text-lg font-bold text-white mb-4">Trending Concepts</h3>
              <div className="space-y-3">
                {["#HyperGlass", "#Ontocracy", "#AI_Ethics", "#SolarPunk"].map(tag => (
                  <div key={tag} className="flex items-center justify-between group cursor-pointer">
                    <span className="text-white/60 group-hover:text-cyan-400 transition-colors">
                      {tag}
                    </span>
                    <span className="text-xs text-white/20">2.4k signals</span>
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
