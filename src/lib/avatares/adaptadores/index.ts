import { AdnAvatar, sanearAdn } from "@/lib/avatares/adn/adn";

// In-memory library for ADN items
const adnLibrary = new Map<string, { adn: AdnAvatar; visibility: string }>();

export async function saveAdnToLibrary(adn: AdnAvatar, visibility: string): Promise<void> {
  adnLibrary.set(adn.id, { adn, visibility });
}

export async function loadAdnEntry(ref: string): Promise<any> {
  if (!ref.startsWith("biblioteca:")) {
    return null;
  }
  const id = ref.substring("biblioteca:".length);
  const item = adnLibrary.get(id);
  if (!item) {
    return null;
  }
  return {
    id: item.adn.id,
    kind: "avatar-adn",
    visibilidad: item.visibility,
    content: JSON.stringify(item.adn),
  };
}

export async function removeAdnFromLibrary(ref: string): Promise<void> {
  if (!ref.startsWith("biblioteca:")) {
    return;
  }
  const id = ref.substring("biblioteca:".length);
  adnLibrary.delete(id);
}

export async function parseAdnEntry(entry: any): Promise<AdnAvatar | null> {
  if (!entry || !entry.content) {
    return null;
  }
  try {
    return JSON.parse(entry.content) as AdnAvatar;
  } catch (e) {
    return null;
  }
}

export { sanearAdn };