// src/components/comment-system.tsx
'use client'
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { comments as defaultComments, type Comment as CommentType } from "@/lib/data";
import { Send, ThumbsUp, Reply, MoreHorizontal, Paperclip, AtSign, Smile, Sparkles, Link as LinkIcon, Edit, Image as ImageIcon, File as FileIcon, Type } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { CanvasEditor } from "./canvas-editor";

function CommentInput() {
    const [isCanvasEditorOpen, setCanvasEditorOpen] = useState(false);

    return (
        <>
            <CanvasEditor
                isOpen={isCanvasEditorOpen}
                onOpenChange={setCanvasEditorOpen}
                canvasType="main"
                editorTitle="Editando Comentario de Lienzo"
            />
            <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="user avatar" />
                    <AvatarFallback>TÚ</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    <Card className="overflow-hidden border-2 border-primary/20">
                        <Textarea 
                            placeholder="Añade un comentario..." 
                            className="border-0 focus-visible:ring-0 resize-none min-h-[60px] bg-transparent p-2"
                        />
                         <div className="p-1 bg-muted/50 border-t flex justify-between items-center">
                            <div className="flex items-center gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCanvasEditorOpen(true)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><ImageIcon className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><FileIcon className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><AtSign className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"><LinkIcon className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary"><Sparkles className="h-4 w-4" /></Button>
                            </div>
                            <Button size="sm" className="h-8">
                                <Send className="mr-2 h-4 w-4" />
                                Publicar
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </>
    )
}

function Comment({ comment }: { comment: CommentType }) {
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
                        <ThumbsUp className="h-4 w-4" /> {comment.likes}
                    </Button>
                    <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                        <Reply className="h-4 w-4" /> Responder
                    </Button>
                </div>

                {comment.replies && comment.replies.map((reply) => (
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
                             <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{reply.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <Button variant="ghost" size="sm" className="flex items-center gap-1 text-xs">
                                <ThumbsUp className="h-4 w-4" /> {reply.likes}
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

export function CommentSystem({ comments = defaultComments }: { comments?: CommentType[] }) {
  return (
    <div className="w-full space-y-6">
        <CommentInput />
        <div className="space-y-6">
          {comments.map((comment) => (
            <Comment key={comment.id} comment={comment} />
          ))}
        </div>
    </div>
  );
}
