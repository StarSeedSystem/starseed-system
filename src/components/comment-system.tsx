import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { comments } from "@/lib/data";
import { Send, ThumbsUp, Reply, MoreHorizontal, Paperclip, AtSign, Smile, Sparkles } from "lucide-react";
import Image from "next/image";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

function CommentInput() {
    return (
        <div className="flex gap-3">
            <Avatar className="h-8 w-8">
                <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="user avatar" />
                <AvatarFallback>TÚ</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <Card className="overflow-hidden border-2 border-primary/20">
                    <CardContent className="p-0">
                        <Textarea 
                            placeholder="Añade un comentario como lienzo..." 
                            className="border-0 focus-visible:ring-0 resize-none min-h-[60px] bg-transparent"
                        />
                    </CardContent>
                    <div className="p-2 bg-muted/50 border-t flex justify-between items-center">
                        <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" className="h-8 w-8"><Paperclip className="h-4 w-4" /></Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8"><AtSign className="h-4 w-4" /></Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8"><Smile className="h-4 w-4" /></Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"><Sparkles className="h-4 w-4" /></Button>
                        </div>
                        <Button size="sm">
                            <Send className="mr-2 h-4 w-4" />
                            Publicar
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}

function Comment({ comment }: { comment: (typeof comments)[0] }) {
    return (
         <div className="flex gap-3">
            <Avatar className="h-8 w-8">
                <AvatarImage src={comment.avatar} data-ai-hint={comment.dataAiHint} />
                <AvatarFallback>{comment.author.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                             <p className="font-semibold text-sm">{comment.author}</p>
                             <p className="text-xs text-muted-foreground">{comment.timestamp}</p>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem>Citar Comentario</DropdownMenuItem>
                                <DropdownMenuItem>Reportar</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="text-sm text-foreground mt-2">{comment.content}</div>
                </div>
                
                <div className="flex items-center gap-1 mt-1">
                    <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                        <ThumbsUp className="h-4 w-4" /> 2
                    </Button>
                    <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                        <Reply className="h-4 w-4" /> Responder
                    </Button>
                </div>

                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex gap-3 mt-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={reply.avatar} data-ai-hint={reply.dataAiHint} />
                      <AvatarFallback>{reply.author.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <div className="bg-muted/40 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm">{reply.author}</p>
                                <p className="text-xs text-muted-foreground">{reply.timestamp}</p>
                            </div>
                            <p className="text-sm text-foreground mt-2">{reply.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                                <ThumbsUp className="h-4 w-4" /> 1
                            </Button>
                            <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                                <Reply className="h-4 w-4" /> Responder
                            </Button>
                        </div>
                    </div>
                  </div>
                ))}
            </div>
        </div>
    )
}

export function CommentSystem() {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="font-headline">Discusión</CardTitle>
        <CardDescription>Participa en la conversación. Los comentarios son lienzos en miniatura.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CommentInput />
        <div className="space-y-6">
          {comments.map((comment) => (
            <Comment key={comment.id} comment={comment} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
