'use client';

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { generateApp } from "@/ai/flows/generate-app-from-description";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function CreateAppPage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a description for your app.",
      });
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateApp({ description });
        setGeneratedCode(result.appCode);
        toast({
            title: "App Generated!",
            description: "Your app code has been created below.",
        })
      } catch (error) {
        console.error("Failed to generate app:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not generate the app. Please try again.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">AI App Generator</h1>
        <p className="text-muted-foreground">
          Describe the application you want to build in plain English.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">App Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g., 'A simple to-do list app with categories and due dates. Users should be able to add, edit, and delete tasks.'"
              className="min-h-32 font-code"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              <Wand2 className="mr-2 h-4 w-4" />
              {isPending ? "Generating..." : "Generate App"}
            </Button>
          </CardFooter>
        </Card>
      </form>
      
      {(isPending || generatedCode) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Generated Code</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : (
              <pre className="p-4 rounded-md bg-muted text-sm font-code overflow-x-auto">
                <code>{generatedCode}</code>
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
