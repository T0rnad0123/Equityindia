"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="main" style={{ maxWidth: 640, margin: "10vh auto", padding: 24 }}>
      <h1 className="company-name">Something went wrong</h1>
      <p>
        The dashboard hit an unexpected error. Your uploaded data is stored only in this browser and has not been lost. Try again; if it keeps
        happening, clear this site&apos;s storage and reload.
      </p>
      <p className="muted small">{error.message}</p>
      <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
    </main>
  );
}
