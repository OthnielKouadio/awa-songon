import { redirect } from "next/navigation";
import { basesEspaces } from "@/lib/chemins";

export const dynamic = "force-dynamic";

export default function AdminIndex() {
  redirect(`${basesEspaces().admin}/dashboard`);
}
