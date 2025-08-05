// src/app/(main)/files/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function FileManagerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">File Manager</h1>
        <p className="text-muted-foreground">
          Organize, upload, and manage your files.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">Your Files</CardTitle>
            <CardDescription>All your uploaded assets in one place.</CardDescription>
          </div>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">No files yet. Upload one to get started!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
