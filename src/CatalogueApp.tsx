import { useEffect, useState } from "react";
import { App } from "./App";
import { ManageMyths } from "./ManageMyths";
import { catalogueRequest, type Catalogue } from "./game/catalogue-client";

export function CatalogueApp() {
  const management = window.location.pathname.replace(/\/+$/, "") === "/manage";
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (management) return;
    let active = true;
    catalogueRequest().then(
      (data) => { if (active) setCatalogue(data); },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load myths."); },
    );
    return () => { active = false; };
  }, [management]);

  if (management) return <ManageMyths />;
  if (error) return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl">Unable to load myths</h1>
      <p role="alert" className="my-4">{error}</p>
      <button type="button" className="underline" onClick={() => window.location.reload()}>Try again</button>
    </main>
  );
  if (!catalogue) return <main className="p-8" role="status">Loading myths...</main>;
  return <App myths={catalogue.myths} />;
}
