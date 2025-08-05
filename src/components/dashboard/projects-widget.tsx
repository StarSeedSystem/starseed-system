import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const projects = [
  { name: "Project Phoenix", status: "Active", progress: 75 },
  { name: "Nebula Dashboard", status: "Active", progress: 40 },
  { name: "Orion Data Sync", status: "On Hold", progress: 30 },
  { name: "Nova AI Core", status: "Completed", progress: 100 },
];

export function ProjectsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Recent Projects</CardTitle>
        <CardDescription>An overview of your latest work.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.name}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <Badge variant={project.status === "Active" ? "default" : "secondary"}>
                    {project.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{project.progress}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
