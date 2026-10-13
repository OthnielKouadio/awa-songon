import type { Metadata } from "next";

// Page servie uniquement par un lien secret (voir src/middleware.ts) : jamais indexée.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SecretLayout({ children }: { children: React.ReactNode }) {
  return children;
}
