"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThumbsUp, MessageCircle, Share2, Bookmark } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { CommentSystem } from "@/components/comment-system";
// Assuming feedItems type structure or importing it if it's a shared type
// For now, defining loose or looking for shared import.
// Using 'any' briefly to decouple, but ideally should import type.

export function FeedPostCard({ item }: { item: any }) {
    const [showComments, setShowComments] = useState(false);

    return (
        <Card className="hover:border-primary/20 transition-all">
            <CardHeader>
                <Link href={item.href || '#'} className="flex items-center gap-3 group">
                    <Avatar className="ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                        <AvatarImage src={item.avatar} data-ai-hint={item.dataAiHint} />
                        <AvatarFallback>{item.author.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-semibold group-hover:text-primary transition-colors">{item.author}</p>
                        <p className="text-sm text-muted-foreground">{item.handle} · {item.timestamp}</p>
                    </div>
                </Link>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{item.content}</p>
                {item.imageUrl && (
                    <div className="relative aspect-video rounded-lg overflow-hidden mt-4 border border-border/50">
                        <Image src={item.imageUrl} alt="Post image" layout="fill" objectFit="cover" data-ai-hint={item.imageHint} />
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex-col items-stretch">
                <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-primary/10 hover:text-primary">
                            <ThumbsUp className="w-4 w-4" /> {item.likes}
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-primary/10 hover:text-primary" onClick={() => setShowComments(!showComments)}>
                            <MessageCircle className="w-4 w-4" /> {item.comments.length}
                        </Button>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <Share2 className="w-4 w-4" /> Compartir
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <Bookmark className="w-4 h-4" /> Guardar
                        </Button>
                    </div>
                </div>
                {showComments && (
                    <div className='mt-4 w-full'>
                        <CommentSystem comments={item.comments} />
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}
