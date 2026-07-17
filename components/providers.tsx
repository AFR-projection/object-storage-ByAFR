"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { MotionConfig } from "framer-motion";
import { SystemFeedback } from "@/components/system/system-feedback";
import { EncryptedDownloadDialog } from "@/components/download/encrypted-download-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          {children}
          <SystemFeedback />
          <EncryptedDownloadDialog />
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
