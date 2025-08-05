import { WelcomeWidget } from "@/components/dashboard/welcome-widget";
import { ActionsWidget } from "@/components/dashboard/actions-widget";
import { StatsWidget } from "@/components/dashboard/stats-widget";
import { ProjectsWidget } from "@/components/dashboard/projects-widget";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s your personalized workspace.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WelcomeWidget />
        </div>
        <ActionsWidget />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsWidget />
      </div>
      
      <ProjectsWidget />

    </div>
  );
}
