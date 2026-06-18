'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("PAGE ERROR:", error);
    console.error('App group error:', error);
  }, [error]);

  return (
    <div className="p-8 text-center bg-yellow-50 text-yellow-800 border rounded">
      <h2 className="text-xl font-semibold mb-2">Something went wrong (DEBUG MODE)</h2>
      <p className="font-mono text-xs mb-2 break-all">Error: {error.message}</p>
      {error.stack && (
        <pre className="text-[10px] text-left overflow-auto max-h-40 bg-white p-2 border mb-4">{error.stack}</pre>
      )}
      <p className="text-xs mb-4">See console for "PAGE ERROR:" logs. Production error hiding temporarily disabled for debugging.</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded"
      >
        Try again
      </button>
    </div>
  );
}
