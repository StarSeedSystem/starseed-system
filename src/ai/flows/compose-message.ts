// src/ai/flows/compose-message.ts
'use server';
/**
 * @fileOverview A flow for composing messages using AI assistance by assembling apps and communication channels.
 *
 * - composeMessage - A function that composes messages based on user requests.
 * - ComposeMessageInput - The input type for the composeMessage function.
 * - ComposeMessageOutput - The return type for the composeMessage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ComposeMessageInputSchema = z.object({
  request: z.string().describe('The user request for composing a message.'),
});
export type ComposeMessageInput = z.infer<typeof ComposeMessageInputSchema>;

const ComposeMessageOutputSchema = z.object({
  message: z.string().describe('The AI-composed message.'),
  app: z.string().describe('The selected app for the message.'),
  channel: z.string().describe('The selected communication channel.'),
});
export type ComposeMessageOutput = z.infer<typeof ComposeMessageOutputSchema>;

export async function composeMessage(input: ComposeMessageInput): Promise<ComposeMessageOutput> {
  return composeMessageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'composeMessagePrompt',
  input: {schema: ComposeMessageInputSchema},
  output: {schema: ComposeMessageOutputSchema},
  prompt: `You are an AI assistant that composes messages based on user requests, selecting the most appropriate app and communication channel.

  User Request: {{{request}}}

  Compose a message that fulfills the user's request, and select an appropriate app and communication channel for sending the message.
`,
});

const composeMessageFlow = ai.defineFlow(
  {
    name: 'composeMessageFlow',
    inputSchema: ComposeMessageInputSchema,
    outputSchema: ComposeMessageOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
