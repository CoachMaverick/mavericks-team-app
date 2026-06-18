'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("PAGE ERROR:", error);
    console.error('Root error (production debug):', error);
  }, [error]);

  return (
    <div className="p-8 text-center min-h-screen flex flex-col items-center justify-center bg-yellow-50 text-yellow-900">
      <h1 className="text-2xl font-bold mb-4">App Error (DEBUG MODE ENABLED)</h1>
      <p className="mb-2">Something went wrong at the root level.</p>
      <p className="font-mono text-sm mb-2 break-all">Message: {error.message}</p>
      {error.stack && (
        <pre className="text-left text-xs bg-white p-4 border max-w-3xl overflow-auto mb-4 max-h-60">
          {error.stack}
        </pre>
      )}
      <p className="text-xs mb-4">Check browser console for detailed "PAGE ERROR:" logs. This view shows full details temporarily for debugging (even in production).</p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800"
      >
        Try again
      </button>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-1 text-sm underline"
      >
        Hard reload
      </button>
    </div>
  );
}
