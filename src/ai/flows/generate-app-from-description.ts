'use server';
/**
 * @fileOverview Generates a functional NextJS application with Firebase integration based on a natural language description.
 *
 * - generateApp - A function that generates the NextJS application code.
 * - GenerateAppInput - The input type for the generateApp function.
 * - GenerateAppOutput - The return type for the generateApp function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAppInputSchema = z.object({
  description: z.string().describe('A natural language description of the app to generate.'),
});
export type GenerateAppInput = z.infer<typeof GenerateAppInputSchema>;

const GenerateAppOutputSchema = z.object({
  appCode: z.string().describe('The generated NextJS application code with Firebase integration.'),
});
export type GenerateAppOutput = z.infer<typeof GenerateAppOutputSchema>;

export async function generateApp(input: GenerateAppInput): Promise<GenerateAppOutput> {
  return generateAppFlow(input);
}

const generateAppPrompt = ai.definePrompt({
  name: 'generateAppPrompt',
  input: {schema: GenerateAppInputSchema},
  output: {schema: GenerateAppOutputSchema},
  prompt: `You are an expert NextJS and Firebase developer. Generate a functional NextJS application code with Firebase integration based on the following description:\n\n{{{description}}}\n\nMake sure the code is complete and ready to run.`,
});

const generateAppFlow = ai.defineFlow(
  {
    name: 'generateAppFlow',
    inputSchema: GenerateAppInputSchema,
    outputSchema: GenerateAppOutputSchema,
  },
  async input => {
    const {output} = await generateAppPrompt(input);
    return output!;
  }
);
