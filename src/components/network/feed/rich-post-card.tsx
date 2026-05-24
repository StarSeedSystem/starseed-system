"use client";

import React, { useState } from "react";
import { Post, networkService } from "@/services/network-simulation-service";
import { TiltCard } from "@/components/ui/tilt-card";
import { CommentSection } from "./comment-section";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious
} from "@/components/ui/carousel";
import { Heart, MessageCircle, Share2, MoreHorizontal, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichPostCardProps {
    post: Post;
}

export function RichPostCard({ post }: RichPostCardProps) {
    const [isLiked, setIsLiked] = useState(post.likedByMe);
    const [likesCount, setLikesCount] = useState(post.likes);
    const [showComments, setShowComments] = useState(false);

    const handleLike = async () => {
        // Optimistic update
        const newLikedState = !isLiked;
        setIsLiked(newLikedState);
        setLikesCount(prev => newLikedState ? prev + 1 : prev - 1);

        // Network call
        await networkService.likePost(post.id);
    };

    return (
        <TiltCard
            intensity={5} // Subtle tilt for feed items
            className="w-full mb-6"
        >
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0a]/60 backdrop-blur-xl shadow-md transition-all">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="relative group cursor-pointer">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full opacity-75 blur group-hover:opacity-100 transition duration-200"></div>
                            <img src={post.author.avatar} alt="Avatar" className="relative w-10 h-10 rounded-full object-cover border border-black" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1">
                                <h3 className="font-bold text-sm text-white">{post.author.name}</h3>
                                {post.author.verified && <span className="text-blue-400 text-[10px]">✓</span>}
                            </div>
                            <p className="text-xs text-white/40">{post.author.handle} • {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                    <button className="text-white/30 hover:text-white transition-colors">
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-light">
                        {post.content}
                    </p>

                    {/* Media Carousel */}
                    {post.media.length > 0 && (
                        <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-inner bg-black/50">
                            <Carousel className="w-full">
                                <CarouselContent>
                                    {post.media.map((url, idx) => (
                                        <CarouselItem key={idx}>
                                            <div className="relative aspect-video w-full overflow-hidden">
                                                <img src={url} alt="Post content" className="object-cover w-full h-full hover:scale-105 transition-transform duration-700" />
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                {post.media.length > 1 && (
                                    <>
                                        <CarouselPrevious className="left-2 bg-black/50 border-white/10 text-white hover:bg-black/70" />
                                        <CarouselNext className="right-2 bg-black/50 border-white/10 text-white hover:bg-black/70" />
                                    </>
                                )}
                            </Carousel>
                        </div>
                    )}

                    {/* Tags / Metadata */}
                    {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {post.tags.map(tag => (
                                <span key={tag} className="text-xs font-semibold text-primary/80 bg-primary/10 px-2 py-1 rounded-full border border-primary/20 shadow-[0_0_10px_rgba(var(--primary-hsl),0.2)]">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-t border-white/5">
                    <div className="flex gap-6">
                        <button
                            onClick={handleLike}
                            className={cn("flex items-center gap-2 text-sm transition-colors group", isLiked ? "text-pink-500" : "text-white/60 hover:text-pink-400")}
                        >
                            <Heart className={cn("w-5 h-5 transition-transform group-active:scale-75", isLiked && "fill-current")} />
                            <span>{likesCount}</span>
                        </button>

                        <button
                            onClick={() => setShowComments(!showComments)}
                            className="flex items-center gap-2 text-sm text-white/60 hover:text-blue-400 transition-colors"
                        >
                            <MessageCircle className="w-5 h-5" />
                            <span>{post.commentsCount}</span>
                        </button>

                        <button className="flex items-center gap-2 text-sm text-white/60 hover:text-green-400 transition-colors">
                            <Share2 className="w-5 h-5" />
                            <span>{post.shares}</span>
                        </button>
                    </div>

                    <button className="text-white/40 hover:text-white transition-colors" title="Link Concept">
                        <LinkIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Comments Section (Collapsible) */}
                {showComments && (
                    <div className="border-t border-white/5 bg-black/20 p-4 animate-in slide-in-from-top-2 fade-in duration-200">
                        <CommentSection postId={post.id} />
                    </div>
                )}
            </div>
        </TiltCard>
    );
}
