"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Card className="max-w-md">
        <CardHeader>
          <div className="size-9 rounded-md bg-destructive/15 grid place-items-center text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle className="text-base">Something broke</CardTitle>
          <CardDescription>
            {error.message || "An unexpected error occurred."}
            {error.digest ? (
              <span className="block mt-1 font-mono text-[10px] text-muted-foreground">
                digest: {error.digest}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} size="sm">
            <RotateCcw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
