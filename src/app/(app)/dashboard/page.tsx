// src/app/(app)/dashboard/page.tsx
import { ExploreNetworkWidget } from "@/components/dashboard/explore-network-widget";
import { MyPagesWidget } from "@/components/dashboard/my-pages-widget";
import { PoliticalSummaryWidget } from "@/components/dashboard/political-summary-widget";
import { LearningPathWidget } from "@/components/dashboard/learning-path-widget";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Dashboard</h1>
        <p className="text-muted-foreground">
          Bienvenido a tu centro de mando personalizado.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-6">
            <ExploreNetworkWidget />
            <PoliticalSummaryWidget />
            <LearningPathWidget />
        </div>
        <div className="lg:col-span-1">
            <MyPagesWidget />
        </div>
      </div>
    </div>
  );
}
