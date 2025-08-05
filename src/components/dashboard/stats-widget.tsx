import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, Bell, Bot, FileText } from "lucide-react";

const stats = [
    {
        title: "Apps Generated",
        value: "12",
        icon: Rocket
    },
    {
        title: "Messages Composed",
        value: "57",
        icon: Bot
    },
    {
        title: "Active Documents",
        value: "3",
        icon: FileText
    },
    {
        title: "Notifications Summarized",
        value: "8",
        icon: Bell
    },
];

export function StatsWidget() {
    return (
        <>
            {stats.map((stat) => (
                <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold font-headline">{stat.value}</div>
                        <p className="text-xs text-muted-foreground">+2 from last month</p>
                    </CardContent>
                </Card>
            ))}
        </>
    )
}
