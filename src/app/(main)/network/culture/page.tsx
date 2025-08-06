// src/app/(main)/network/culture/page.tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageCircle, ThumbsUp, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { culturalPosts } from "@/lib/data";

function CulturalPostCard({ post }: { post: typeof culturalPosts[0] }) {
  return (
    <Card>
      <CardHeader>
        <Link href={post.author.href} className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={post.author.avatar} data-ai-hint="user avatar" />
            <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{post.author.name}</p>
            <p className="text-sm text-muted-foreground">{post.timestamp}</p>
          </div>
        </Link>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground whitespace-pre-wrap mb-4">{post.content}</p>
        {post.imageUrl && (
            <div className="relative aspect-video rounded-lg overflow-hidden mb-4 border">
                <Image src={post.imageUrl} alt={post.title} layout="fill" objectFit="cover" data-ai-hint={post.imageHint} />
            </div>
        )}
        <div className="flex justify-between items-center text-muted-foreground">
            <div className="flex gap-4">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4" /> {post.likes}
                </Button>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" /> {post.comments}
                </Button>
            </div>
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Compartir
            </Button>
        </div>
      </CardContent>
    </Card>
  )
}


export default function CulturePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-6">
        {culturalPosts.map(post => (
          <CulturalPostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
