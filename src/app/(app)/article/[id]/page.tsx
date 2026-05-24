// src/app/(app)/article/[id]/page.tsx
'use client';
import { articles } from "@/lib/data";
import { notFound, useParams } from "next/navigation";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Star, Clock, UserCircle, Tag, MessageCircle, ThumbsUp, Bookmark } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CommentSystem } from "@/components/comment-system";
import { Button } from "@/components/ui/button";

export default function ArticlePage() {
  const params = useParams();
  const articleId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  // In a real app, you'd fetch this from a an API:
  // const article = await fetchArticle(articleId);
  const article = articles.find(a => a.href.endsWith(articleId));

  if (!article) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <article>
            <header className="mb-8">
                <p className="text-primary font-semibold mb-2">Publicado en la Red de Conocimiento</p>
                <h1 className="text-4xl lg:text-5xl font-bold font-headline leading-tight mb-4">{article.title}</h1>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={article.authorAvatar} data-ai-hint="author avatar" />
                            <AvatarFallback>{article.author.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span>{article.author}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>Publicado el 1 de Julio, 2024</span>
                    </div>
                     <div className="flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span>{article.rating.toFixed(1)} Rating</span>
                    </div>
                </div>
                 <div className="flex items-center gap-2 mt-4">
                    {article.tags.map(tag => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                </div>
            </header>

            {article.image && (
                <div className="relative aspect-video w-full rounded-lg overflow-hidden mb-8 border">
                    <Image 
                        src={article.image}
                        alt={article.title}
                        layout="fill"
                        objectFit="cover"
                        data-ai-hint={article.imageHint || ''}
                    />
                </div>
            )}

            <div className="prose prose-invert prose-lg max-w-none text-foreground/90" dangerouslySetInnerHTML={{ __html: article.content }}>
            </div>
        </article>
        
        <Separator />

        <div className="flex justify-between items-center">
             <div className="flex gap-2">
                <Button variant="outline" size="lg">
                    <ThumbsUp className="mr-2 h-5 w-5"/> {article.likes}
                </Button>
                 <Button variant="outline" size="lg">
                    <MessageCircle className="mr-2 h-5 w-5"/> {article.comments.length} Comentarios
                </Button>
             </div>
             <Button variant="outline" size="lg">
                <Bookmark className="mr-2 h-5 w-5"/> Guardar en Biblioteca
            </Button>
        </div>

        <Separator />

        <section>
            <h2 className="text-2xl font-bold font-headline mb-6">Discusión y Aportes</h2>
            <CommentSystem comments={article.comments} />
        </section>

    </div>
  );
}
