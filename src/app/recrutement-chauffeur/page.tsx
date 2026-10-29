import type { Metadata } from "next";
import { Recrutement } from "./Recrutement";

// Servie uniquement via le lien secret DRIVER_SIGNUP_PATH (voir src/middleware.ts).
export const metadata: Metadata = { title: "Devenir livreur — Distribution Eau", robots: { index: false, follow: false } };

export default function Page() {
  return <Recrutement />;
}
