// src/app/(app)/info/layout.tsx
import { ReactNode } from "react";
import { InfoNavigation } from "./_components/navigation";

export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <InfoNavigation />
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
}
