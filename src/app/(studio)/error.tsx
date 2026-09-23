"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>Your workspace is temporarily unavailable</h2>
      <p>Check the database connection and try again.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
