import { config } from 'dotenv';
config();

import '@/ai/flows/generate-app-from-description.ts';
import '@/ai/flows/summarize-notifications.ts';
import '@/ai/flows/compose-message.ts';