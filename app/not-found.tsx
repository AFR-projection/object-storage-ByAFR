import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mb-6 mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <FileQuestion className="h-10 w-10 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild variant="default">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
