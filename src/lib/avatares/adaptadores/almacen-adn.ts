import { AdnAvatar } from '../adn/adn';
import { sanearAdn as sanearAdnFromAdn } from '../adn/adn';

export interface AdnLibraryEntry {
  id: string;
  kind: string;
  visibilidad: string;
  raw?: string;
}

const storage = new Map<string, AdnLibraryEntry>();

export async function saveAdnToLibrary(adn: AdnAvatar, visibility: string): Promise<void> {
  const ref = `biblioteca:${adn.id}`;
  const entry: AdnLibraryEntry = {
    id: adn.id,
    kind: 'avatar-adn',
    visibilidad: visibility,
    raw: JSON.stringify(adn),
  };
  storage.set(ref, entry);
}

export async function loadAdnEntry(ref: string): Promise<AdnLibraryEntry | null> {
  return storage.get(ref) ?? null;
}

export async function parseAdnEntry(entry: AdnLibraryEntry): Promise<AdnAvatar | null> {
  if (!entry?.raw) {
    return null;
  }
  try {
    return JSON.parse(entry.raw) as AdnAvatar;
  } catch {
    return null;
  }
}

export function sanearAdn(v: unknown): AdnAvatar | null {
  return sanearAdnFromAdn(v);
}

export async function removeAdnFromLibrary(ref: string): Promise<void> {
  storage.delete(ref);
}