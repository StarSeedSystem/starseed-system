import { CommentSystem } from "@/components/comment-system";
import { Badge } from "@/components/ui/badge";

export default function DocumentPage({ params }: { params: { id: string } }) {
  return (
    <div className="grid md:grid-cols-3 gap-8">
      <div className="md:col-span-2">
        <article className="prose prose-invert max-w-none">
          <div className="mb-6">
            <Badge>Q2 2024 Planning</Badge>
            <h1 className="font-headline mt-2">Project Star Weaver: Core Features Proposal</h1>
            <p className="text-lg text-muted-foreground">
              This document outlines the proposed core features for the Star Weaver application, focusing on UI, and Generative AI capabilities.
            </p>
          </div>
          
          <h2 className="font-headline">1. Customizable Dashboard [UI]</h2>
          <p>
            Provide users with a highly customizable dashboard experience. Key features include widget-based personalization, drag-and-drop rearrangement, and multiple dashboard layouts. This will empower users to create a workspace tailored to their specific needs.
          </p>

          <h2 className="font-headline">2. AI-Assisted App Generation [GenAI, UI]</h2>
          <p>
            An innovative feature allowing users to generate functional applications using natural language descriptions. The AI will interpret the user's request, scaffold the necessary components, and provide ready-to-use code, drastically reducing development time for simple tools and prototypes.
          </p>
          <pre className="font-code bg-muted text-foreground p-4 rounded-lg">
            <code>
{`// Example GenAI Flow Invocation
import { generateApp } from '@/ai/flows';

async function createApp(description: string) {
  const { appCode } = await generateApp({ description });
  return appCode;
}`}
            </code>
          </pre>

          <h2 className="font-headline">3. Enriched Commenting System [UI]</h2>
          <p>
            Move beyond simple text replies. The enriched commenting system will allow users to reply with content-rich responses, including code snippets, file attachments, and embeds. This facilitates more detailed and effective collaboration directly within a document.
          </p>

        </article>
      </div>

      <aside className="md:col-span-1">
        <CommentSystem />
      </aside>
    </div>
  );
}
