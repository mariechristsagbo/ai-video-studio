import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h2>That page does not exist</h2>
      <p>The project or route you asked for is not available.</p>
      <Link className="button button-primary" href="/dashboard">
        Back to overview
      </Link>
    </div>
  );
}
