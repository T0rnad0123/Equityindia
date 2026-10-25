import Link from "next/link";

export default function NotFound() {
  return (
    <main className="main" style={{ maxWidth: 640, margin: "10vh auto", padding: 24 }}>
      <h1 className="company-name">Page not found</h1>
      <p><Link href="/">Back to the dashboard</Link></p>
    </main>
  );
}
