import { PlancheAutocollants } from "./PlancheAutocollants";

type SP = { cite?: string; debut?: string; fin?: string; ids?: string };
const entier = (v?: string) => (v && /^\d{1,4}$/.test(v) ? Number(v) : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ids = sp.ids?.split(",").filter((x) => UUID.test(x)) ?? null;
  return (
    <PlancheAutocollants
      cite={sp.cite && UUID.test(sp.cite) ? sp.cite : null}
      debut={entier(sp.debut)}
      fin={entier(sp.fin)}
      ids={ids && ids.length ? ids : null}
    />
  );
}
