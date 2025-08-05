import { Wand2 } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-headline text-lg font-semibold tracking-tighter">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wand2 className="h-5 w-5" />
      </div>
      Star Weaver
    </div>
  );
}
