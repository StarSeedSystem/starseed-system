'use server';

/**
 * @fileOverview Summarizes notifications for quick understanding.
 *
 * - summarizeNotifications - A function that summarizes notifications.
 * - SummarizeNotificationsInput - The input type for the summarizeNotifications function.
 * - SummarizeNotificationsOutput - The return type for the summarizeNotifications function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeNotificationsInputSchema = z.object({
  notifications: z.string().describe('The notifications to summarize.'),
});
export type SummarizeNotificationsInput = z.infer<typeof SummarizeNotificationsInputSchema>;

const SummarizeNotificationsOutputSchema = z.object({
  summary: z.string().describe('The summarized notifications.'),
});
export type SummarizeNotificationsOutput = z.infer<typeof SummarizeNotificationsOutputSchema>;

export async function summarizeNotifications(
  input: SummarizeNotificationsInput
): Promise<SummarizeNotificationsOutput> {
  return summarizeNotificationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeNotificationsPrompt',
  input: {schema: SummarizeNotificationsInputSchema},
  output: {schema: SummarizeNotificationsOutputSchema},
  prompt: `Summarize the following notifications: {{{notifications}}}`,
});

const summarizeNotificationsFlow = ai.defineFlow(
  {
    name: 'summarizeNotificationsFlow',
    inputSchema: SummarizeNotificationsInputSchema,
    outputSchema: SummarizeNotificationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
