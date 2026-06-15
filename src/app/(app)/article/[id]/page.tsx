// src/app/(app)/article/[id]/page.tsx
'use client';
import { useState } from "react";
import { articles } from "@/lib/data";
import { notFound, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Star, Clock, UserCircle, Tag, MessageCircle, ThumbsUp, Bookmark, ArrowUpRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CommentSystem } from "@/components/comment-system";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/entity-links";

export default function ArticlePage() {
  const params = useParams();
  const articleId = String(Array.isArray(params.id) ? params.id[0] : (params.id ?? ""));

  // In a real app, you'd fetch this from a an API:
  // const article = await fetchArticle(articleId);
  const article = articles.find(a => a.href.endsWith(articleId));

  if (!article) {
    notFound();
  }

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(article.likes);
  const [saved, setSaved] = useState(false);

  const handleLike = () => {
    setLiked(prev => {
      const next = !prev;
      setLikeCount(c => next ? c + 1 : c - 1);
      return next;
    });
  };

  const handleSave = () => {
    setSaved(prev => !prev);
  };

  // Artículos relacionados: hasta 3 que compartan al menos un tag
  const otherArticles = articles.filter(a => a.href !== article.href);
  const related = otherArticles
    .filter(a => a.tags.some(t => article.tags.includes(t)))
    .slice(0, 3);
  const relatedArticles = related.length > 0 ? related : otherArticles.slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <article>
            <header className="mb-8">
                <p className="text-primary font-semibold mb-2">Publicado en la Red de Conocimiento</p>
                <h1 className="text-4xl lg:text-5xl font-bold font-headline leading-tight mb-4">{article.title}</h1>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <Link
                      href={`/profile/${slugify(article.author)}`}
                      className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                    >
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={article.authorAvatar} data-ai-hint="author avatar" />
                            <AvatarFallback>{article.author.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span>{article.author}</span>
                    </Link>
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
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleLike}
                  className={`cursor-pointer transition-colors ${liked ? "border-primary text-primary bg-primary/10" : ""}`}
                >
                    <ThumbsUp className={`mr-2 h-5 w-5 ${liked ? "fill-primary" : ""}`} />
                    {likeCount}
                </Button>
                 <a href="#discusion" className="cursor-pointer">
                  <Button variant="outline" size="lg" className="cursor-pointer">
                      <MessageCircle className="mr-2 h-5 w-5"/> {article.comments.length} Comentarios
                  </Button>
                </a>
             </div>
             <Button
               variant="outline"
               size="lg"
               onClick={handleSave}
               className={`cursor-pointer transition-colors ${saved ? "border-primary text-primary bg-primary/10" : ""}`}
             >
                <Bookmark className={`mr-2 h-5 w-5 ${saved ? "fill-primary" : ""}`} />
                {saved ? "Guardado en Biblioteca" : "Guardar en Biblioteca"}
            </Button>
        </div>

        <Separator />

        <section id="discusion">
            <h2 className="text-2xl font-bold font-headline mb-6">Discusión y Aportes</h2>
            <CommentSystem comments={article.comments} />
        </section>

        <Separator />

        <section>
            <h2 className="text-2xl font-bold font-headline mb-6">Artículos relacionados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedArticles.map(a => (
                    <Link key={a.id} href={a.href} className="cursor-pointer group">
                        <Card className="h-full transition-colors hover:border-primary/60 hover:bg-card/80">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                                        {a.title}
                                    </p>
                                    <ArrowUpRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
                                </div>
                                <p className="text-sm text-muted-foreground">{a.author}</p>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-1">
                                    {a.tags.slice(0, 2).map(tag => (
                                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </section>

    </div>
  );
}
