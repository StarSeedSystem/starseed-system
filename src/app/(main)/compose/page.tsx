'use client';

import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { composeMessage, ComposeMessageOutput } from "@/ai/flows/compose-message";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function ComposeMessagePage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [result, setResult] = useState<ComposeMessageOutput | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a request for the message.",
      });
      return;
    }
    startTransition(async () => {
      setResult(null);
      try {
        const composeResult = await composeMessage({ request });
        setResult(composeResult);
        toast({
            title: "Message Composed!",
            description: "Your message has been drafted below.",
        })
      } catch (error) {
        console.error("Failed to compose message:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not compose the message. Please try again.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">AI Message Composer</h1>
        <p className="text-muted-foreground">
          Let AI craft the perfect message for any situation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline">Your Request</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g., 'Draft a friendly reminder to the team about the Q3 report deadline this Friday.'"
              className="min-h-32"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={isPending}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              <Bot className="mr-2 h-4 w-4" />
              {isPending ? "Composing..." : "Compose with AI"}
            </Button>
          </CardFooter>
        </Card>
        
        <div className="md:col-span-1">
            {(isPending || result) && (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">AI Composition</CardTitle>
                    <CardDescription>Review and send the AI-generated message.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isPending ? (
                        <div className="space-y-4">
                            <Skeleton className="h-8 w-1/3" />
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-8 w-1/2" />
                        </div>
                    ) : result && (
                        <>
                        <div>
                            <Label htmlFor="message">Message</Label>
                            <Textarea id="message" value={result.message} readOnly className="min-h-32 mt-1 bg-muted/50"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="app">App</Label>
                                <Input id="app" value={result.app} readOnly className="mt-1 bg-muted/50"/>
                            </div>
                            <div>
                                <Label htmlFor="channel">Channel</Label>
                                <Input id="channel" value={result.channel} readOnly className="mt-1 bg-muted/50"/>
                            </div>
                        </div>
                        </>
                    )}
                </CardContent>
                <CardFooter>
                    <Button disabled={isPending || !result}>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                    </Button>
                </CardFooter>
            </Card>
            )}
        </div>
      </form>
    </div>
  );
}
