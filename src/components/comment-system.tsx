import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { comments } from "@/lib/data";
import { Send, ThumbsUp, Reply } from "lucide-react";
import Image from "next/image";

export function CommentSystem() {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="font-headline">Discusión</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="user avatar" />
              <AvatarFallback>TÚ</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Textarea placeholder="Añadir un comentario..." className="mb-2" />
              <Button size="sm">
                <Send className="mr-2 h-4 w-4" />
                Publicar Comentario
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={comment.avatar} data-ai-hint={comment.dataAiHint} />
                <AvatarFallback>{comment.author.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{comment.author}</p>
                  <p className="text-xs text-muted-foreground">{comment.timestamp}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{comment.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Reply className="h-4 w-4" />
                  </Button>
                </div>

                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex gap-3 mt-4">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={reply.avatar} data-ai-hint={reply.dataAiHint} />
                      <AvatarFallback>{reply.author.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{reply.author}</p>
                        <p className="text-xs text-muted-foreground">{reply.timestamp}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{reply.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ThumbsUp className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
