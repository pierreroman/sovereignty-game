import { useEffect, useState, type ReactNode } from "react";
import { MAX_CATALOGUE_BYTES, validateCatalogue } from "./game/catalogue";
import { catalogueRequest, type Catalogue } from "./game/catalogue-client";
import { RISK_AREAS, VERDICTS, type Myth, type Verdict } from "./game/myths";
import "./management.css";

const TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const SIGN_IN = "/.auth/login/aad?post_login_redirect_uri=/manage";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="management-field"><span>{label}</span>{children}</label>;
}

export function ManageMyths() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saved, setSaved] = useState<Catalogue | null>(null);
  const [draft, setDraft] = useState<Myth[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = saved !== null && JSON.stringify(saved.myths) !== JSON.stringify(draft);

  useEffect(() => {
    document.title = "Manage myths · Sovereign Cloud Debunkers";
    let active = true;
    async function load() {
      try {
        const response = await fetch("/.auth/me", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to check your sign-in. Please reload to try again.");
        const body = await response.json();
        const principal = body.clientPrincipal;
        if (!principal) return;
        if (principal.identityProvider !== "aad" || !Array.isArray(principal.userRoles) ||
            !principal.userRoles.includes("authenticated") ||
            !Array.isArray(principal.claims) || !principal.claims.some(
              (claim: { typ?: string; val?: string }) =>
                (claim.typ === "tid" || claim.typ === "http://schemas.microsoft.com/identity/claims/tenantid") &&
                claim.val === TENANT_ID,
            )) {
          throw new Error("Editing is restricted to the configured Microsoft tenant. Sign out and use an account in that tenant.");
        }
        if (active) setUser(principal.userDetails || "Microsoft user");
        const catalogue = await catalogueRequest();
        if (active) {
          setSaved(catalogue);
          setDraft(catalogue.myths);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load the management page.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(index: number, patch: Partial<Myth>) {
    setDraft((items) => items.map((myth, i) => i === index ? { ...myth, ...patch } : myth));
    setNotice("");
  }

  async function publish() {
    setError("");
    setNotice("");
    let myths: Myth[];
    try {
      myths = validateCatalogue(draft);
      if (new TextEncoder().encode(JSON.stringify(myths)).length > MAX_CATALOGUE_BYTES) {
        throw new Error("The catalogue exceeds the 512 KiB limit.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please check your draft.");
      return;
    }
    if (!saved) return;
    setSaving(true);
    try {
      const result = await catalogueRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": saved.version, "X-Catalogue-Request": "1" },
        body: JSON.stringify(myths),
      });
      setSaved(result);
      setDraft(result.myths);
      setNotice("Published. Players will see the updated myths on their next page load.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Publishing failed. Your draft is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="management">
      <header className="management-header">
        <a href="/">Sovereign Cloud Debunkers</a>
        <a href="/.auth/logout?post_logout_redirect_uri=/manage">Sign out</a>
      </header>
      <main className="management-main">
        <h1>Manage myths</h1>
        <p>Edit the catalogue, verdict summaries, rationale and sources. Publishing updates the game for everyone.</p>
        {checking && <p role="status">Checking Microsoft sign-in...</p>}
        {!checking && !user && (
          <section className="management-card">
            <h2>Microsoft tenant sign-in required</h2>
            <p>Only accounts in the Microsoft tenant can edit. The game remains public.</p>
            <a className="management-primary" href={SIGN_IN}>Sign in with Microsoft</a>
          </section>
        )}
        {error && <div role="alert" className="management-error">
          <p>{error}</p>
          <a href={SIGN_IN}>Sign in again</a>{" · "}
          <button type="button" onClick={() => {
            if (!dirty || window.confirm("Discard your unpublished draft and reload the catalogue?")) window.location.reload();
          }}>Reload catalogue</button>
        </div>}
        {notice && <p role="status" className="management-notice">{notice}</p>}
        {user && saved && (
          <form onSubmit={(event) => { event.preventDefault(); void publish(); }}>
            <div className="management-toolbar">
              <span>Signed in as {user}. {draft.length} myths. {dirty ? "Unpublished changes." : "No unpublished changes."}</span>
              <button className="management-primary" disabled={saving || !dirty} type="submit">
                {saving ? "Publishing..." : "Publish changes"}
              </button>
            </div>
            <fieldset disabled={saving}>
              {draft.map((myth, index) => (
                <section className="management-card" key={index} aria-label={`Edit myth ${index + 1}`}>
                  <div className="management-toolbar">
                    <h2>Myth {myth.number}</h2>
                    <button type="button" disabled={draft.length === 1} onClick={() => {
                      if (window.confirm(`Remove "${myth.claim || "this myth"}"? This takes effect only after publishing.`)) {
                        setDraft((items) => items.filter((_, i) => i !== index));
                        setNotice("");
                      }
                    }}>Remove myth</button>
                  </div>
                  <div className="management-grid">
                    <Field label="Stable ID (used by slide links)">
                      <input required value={myth.id} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        onChange={(e) => update(index, { id: e.target.value })} />
                    </Field>
                    <Field label="Display number">
                      <input type="number" required min={1} step={1} value={myth.number}
                        onChange={(e) => update(index, { number: e.target.valueAsNumber })} />
                    </Field>
                  </div>
                  <p className="management-muted">Keep existing IDs and numbers to preserve pinned slide links and device history.</p>
                  <Field label="Myth / claim">
                    <textarea required value={myth.claim} maxLength={1000} onChange={(e) => update(index, { claim: e.target.value })} />
                  </Field>
                  <div className="management-grid">
                    <Field label="Verdict">
                      <select value={myth.verdict} onChange={(e) => update(index, { verdict: e.target.value as Verdict })}>
                        {VERDICTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Qualifier (optional)">
                      <input value={myth.qualifier || ""} maxLength={200} onChange={(e) => update(index, { qualifier: e.target.value })} />
                    </Field>
                  </div>
                  <fieldset className="management-areas">
                    <legend>Risk areas</legend>
                    {RISK_AREAS.map((area) => <label key={area.id}>
                      <input type="checkbox" checked={myth.areas.includes(area.id)} onChange={(e) => update(index, {
                        areas: e.target.checked ? [...myth.areas, area.id] : myth.areas.filter((id) => id !== area.id),
                      })} /> {area.label}
                    </label>)}
                  </fieldset>
                  <Field label="Verdict summary">
                    <textarea required value={myth.summary} maxLength={8000} onChange={(e) => update(index, { summary: e.target.value })} />
                  </Field>
                  <h3>Rationale</h3>
                  {myth.rationale.map((paragraph, p) => <div key={p} className="management-row">
                    <Field label={`Paragraph ${p + 1}`}>
                      <textarea required value={paragraph} maxLength={8000} onChange={(e) => update(index, {
                        rationale: myth.rationale.map((value, i) => i === p ? e.target.value : value),
                      })} />
                    </Field>
                    <button type="button" disabled={myth.rationale.length === 1} aria-label={`Remove rationale paragraph ${p + 1}`}
                      onClick={() => update(index, { rationale: myth.rationale.filter((_, i) => i !== p) })}>Remove</button>
                  </div>)}
                  <button type="button" disabled={myth.rationale.length >= 30}
                    onClick={() => update(index, { rationale: [...myth.rationale, ""] })}>Add paragraph</button>
                  <Field label="Tradeoff">
                    <textarea required value={myth.tradeoff} maxLength={8000} onChange={(e) => update(index, { tradeoff: e.target.value })} />
                  </Field>
                  <h3>Sources</h3>
                  {myth.sources.map((source, s) => <div key={s} className="management-source">
                    <Field label={`Source ${s + 1} label`}>
                      <input required value={source.label} maxLength={500} onChange={(e) => update(index, {
                        sources: myth.sources.map((value, i) => i === s ? { ...value, label: e.target.value } : value),
                      })} />
                    </Field>
                    <Field label={`Source ${s + 1} URL`}>
                      <input required type="url" value={source.url} maxLength={2000} onChange={(e) => update(index, {
                        sources: myth.sources.map((value, i) => i === s ? { ...value, url: e.target.value } : value),
                      })} />
                    </Field>
                    <button type="button" disabled={myth.sources.length === 1} aria-label={`Remove source ${s + 1}`}
                      onClick={() => update(index, { sources: myth.sources.filter((_, i) => i !== s) })}>Remove source</button>
                  </div>)}
                  <button type="button" disabled={myth.sources.length >= 30}
                    onClick={() => update(index, { sources: [...myth.sources, { label: "", url: "" }] })}>Add source</button>
                </section>
              ))}
              <button type="button" disabled={draft.length >= 100} onClick={() => {
                setDraft((items) => [...items, {
                  id: "", number: Math.max(...items.map((m) => m.number).filter(Number.isFinite), 0) + 1,
                  claim: "", verdict: "busted", areas: ["data"], summary: "", rationale: [""],
                  tradeoff: "", sources: [{ label: "", url: "" }],
                }]);
                setNotice("");
              }}>Add myth</button>
            </fieldset>
          </form>
        )}
      </main>
    </div>
  );
}
