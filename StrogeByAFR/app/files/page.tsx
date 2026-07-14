import { FileBrowser } from "@/components/files/file-browser";
import { FolderOpen } from "lucide-react";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; select?: string }>;
}) {
  const { folder, select } = await searchParams;
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 sm:gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
          <FolderOpen className="h-6 w-6 sm:h-7 sm:w-7 text-accent" />
          My Files
        </h1>
        <p className="mt-1 text-sm text-muted-foreground/70">Browse, upload, and manage your files</p>
      </div>
      <FileBrowser folderId={folder ?? null} selectedFileId={select ?? null} />
    </div>
  );
}