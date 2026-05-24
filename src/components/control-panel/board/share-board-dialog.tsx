"use client";
import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Share2, Globe, Link as LinkIcon, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useBoardSystem } from "@/context/board-context";

interface ShareBoardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShareBoardDialog({ open, onOpenChange }: ShareBoardDialogProps) {
    const { activeBoardId, boards, publishBoard } = useBoardSystem();
    const board = boards.find(b => b.id === activeBoardId);
    const [copied, setCopied] = useState(false);

    if (!board) return null;

    const shareUrl = `https://starseed.app/board/${board.id}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Link copied to clipboard!");
    };

    const handleShareToFeed = () => {
        toast.success("Shared to your feed!");
        onOpenChange(false);
    };

    const handlePublish = () => {
        publishBoard(board.id);
        onOpenChange(false); // Close dialog
        // Optional: switch to marketplace tab?
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-black/80 backdrop-blur-xl border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-indigo-400" />
                        Share Board
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Share "{board.name}" with friends or the community.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="link" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-white/5">
                        <TabsTrigger value="link">Share Link</TabsTrigger>
                        <TabsTrigger value="publish">Publish</TabsTrigger>
                    </TabsList>

                    <TabsContent value="link" className="space-y-4 py-4">
                        <div className="flex items-center space-x-2">
                            <div className="grid flex-1 gap-2">
                                <Input
                                    id="link"
                                    defaultValue={shareUrl}
                                    readOnly
                                    className="bg-black/40 border-white/10"
                                />
                            </div>
                            <Button size="sm" onClick={handleCopy} className="px-3">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleShareToFeed}>
                            Share to Feed
                        </Button>
                    </TabsContent>

                    <TabsContent value="publish" className="space-y-4 py-4">
                        <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <Globe className="w-5 h-5 text-indigo-400 mt-1" />
                                <div>
                                    <h4 className="font-medium text-sm text-indigo-200">Public Marketplace</h4>
                                    <p className="text-xs text-indigo-200/60 mt-1">
                                        Publishing makes a copy of this board available for anyone in the community to install.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handlePublish}>
                            Publish to Marketplace
                        </Button>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
