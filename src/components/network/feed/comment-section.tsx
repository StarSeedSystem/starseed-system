"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { networkService, Comment, FileAttachment } from "@/services/network-simulation-service";
import { Send, Paperclip, FileText, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

interface CommentSectionProps {
    postId: string;
}

export function CommentSection({ postId }: CommentSectionProps) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        loadComments();
    }, [postId]);

    const loadComments = async () => {
        const data = await networkService.getComments(postId);
        setComments(data);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newComment.trim() && attachments.length === 0) || isLoading) return;

        setIsLoading(true);
        try {
            await networkService.addComment(postId, newComment, attachments);
            setNewComment("");
            setAttachments([]);
            toast.success("Comment posted");
            loadComments(); // Refresh
        } catch (error) {
            toast.error("Failed to post comment");
        } finally {
            setIsLoading(false);
        }
    };

    // Simulated Drag & Drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        toast.info(`Uploading ${files.length} file(s)...`);

        try {
            const uploadedFiles = await Promise.all(files.map(f => networkService.uploadFile(f)));
            setAttachments(prev => [...prev, ...uploadedFiles]);
            toast.success("Files attached successfully");
        } catch (err) {
            toast.error("Upload failed");
        }
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(f => f.id !== id));
    };

    return (
        <div className="mt-4 space-y-4">
            <h3 className="text-sm font-semibold text-white/50 px-1">Comments ({comments.length})</h3>

            {/* List */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {comments.map((comment) => (
                    <div key={comment.id} className="group flex gap-3 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                        <img src={comment.author.avatar} alt={comment.author.name} className="w-8 h-8 rounded-full border border-white/10" />
                        <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-bold text-white/90">{comment.author.name}</span>
                                <span className="text-xs text-white/40">{new Date(comment.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-white/80 leading-relaxed">{comment.content}</p>

                            {/* Attachments Display */}
                            {comment.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {comment.attachments.map(file => (
                                        <div key={file.id} className="flex items-center gap-2 px-2 py-1 bg-black/40 rounded border border-white/10 text-xs text-white/70">
                                            {file.type === 'pdf' ? <FileText className="w-3 h-3 text-red-400" /> : <ImageIcon className="w-3 h-3 text-blue-400" />}
                                            <a href={file.url} className="hover:underline truncate max-w-[150px]">{file.name}</a>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative p-2 rounded-xl border border-white/10 bg-black/20 transition-all",
                    isDragging && "border-primary/50 bg-primary/10 ring-2 ring-primary/20",
                    isLoading && "opacity-50 pointer-events-none"
                )}
            >
                {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-xl">
                        <span className="text-primary font-bold animate-pulse">Drop files to attach</span>
                    </div>
                )}

                {/* Attachments Preview */}
                {attachments.length > 0 && (
                    <div className="flex gap-2 mb-2 p-2 overflow-x-auto">
                        {attachments.map(file => (
                            <div key={file.id} className="relative group/file flex flex-col items-center gap-1 p-2 bg-white/5 rounded-md border border-white/10">
                                <button type="button" onClick={() => removeAttachment(file.id)} className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover/file:opacity-100 transition-opacity">
                                    <X className="w-3 h-3 text-white" />
                                </button>
                                {file.type === 'image' ? (
                                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center"><ImageIcon className="w-4 h-4" /></div>
                                ) : (
                                    <FileText className="w-8 h-8 text-white/50" />
                                )}
                                <span className="text-[10px] max-w-[60px] truncate text-white/60">{file.name}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 items-end">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment... (Drag files here)"
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm min-h-[40px] max-h-[100px] resize-y placeholder:text-white/30"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />
                    <div className="flex gap-1 pb-1">
                        <button type="button" className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Attach Files">
                            <Paperclip className="w-4 h-4" />
                        </button>
                        <button type="submit" disabled={!newComment && attachments.length === 0} className="p-2 bg-primary/20 text-primary hover:bg-primary/30 rounded-full transition-colors disabled:opacity-50">
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
