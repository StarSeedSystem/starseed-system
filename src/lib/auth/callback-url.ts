export function buildSuccessRedirect(origin: string, next: string): string {
  return `${origin}${next}`;
}

export function buildErrorRedirect(origin: string): string {
  return `${origin}/login?error=auth-callback`;
}
