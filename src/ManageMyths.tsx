import { useEffect, useState, type ReactNode } from "react";
import { MAX_CATALOGUE_BYTES, validateCatalogue } from "./game/catalogue";
import { CatalogueRequestError, catalogueRequest, type Catalogue } from "./game/catalogue-client";
import { RISK_AREAS, VERDICTS, type Myth, type Verdict } from "./game/myths";
import "./management.css";

async function sessionRequest(method = "GET", password?: string): Promise<boolean> {
  const response = await fetch("/api/session", {
    method, cache: "no-store",
    ...(method === "GET" ? {} : {
      headers: { "Content-Type": "application/json", "X-Catalogue-Request": "1" },
      body: JSON.stringify(password === undefined ? {} : { password }),
    }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error : `Sign-in request failed (${response.status}).`);
  }
  if (typeof body !== "object" || body === null || !("authenticated" in body) || typeof body.authenticated !== "boolean") {
    throw new Error("The server returned an invalid sign-in response.");
  }
  return body.authenticated;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="management-field"><span>{label}</span>{children}</label>;
}

export function ManageMyths() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
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
        if (!await sessionRequest()) return;
        if (active) setUser("Editor");
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

  async function signIn() {
    setAuthBusy(true);
    setError("");
    try {
      if (!await sessionRequest("POST", password)) throw new Error("Sign-in did not establish an editor session.");
      setUser("Editor");
      if (!saved) {
        const catalogue = await catalogueRequest();
        setSaved(catalogue);
        setDraft(catalogue.myths);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setPassword("");
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (dirty && !window.confirm("Discard your unpublished draft and sign out?")) return;
    setAuthBusy(true);
    setError("");
    try {
      await sessionRequest("DELETE");
      setUser(null);
      setSaved(null);
      setDraft([]);
      setNotice("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
    } finally {
      setAuthBusy(false);
    }
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
      if (reason instanceof CatalogueRequestError && reason.status === 401) setUser(null);
      setError(reason instanceof Error ? reason.message : "Publishing failed. Your draft is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="management">
      <header className="management-header">
        <a href="/">Sovereign Cloud Debunkers</a>
        {user && <button type="button" disabled={authBusy || saving} onClick={() => void signOut()}>Sign out</button>}
      </header>
      <main className="management-main">
        <h1>Manage myths</h1>
        <p>Edit the catalogue, verdict summaries, rationale and sources. Publishing updates the game for everyone.</p>
        {checking && <p role="status">Checking editor sign-in...</p>}
        {!checking && !user && (
          <section className="management-card">
            <h2>Editor sign-in required</h2>
            <p>Enter the shared editor password to make changes. The game remains public.</p>
            {saved && <p>Your unpublished draft is still here. Sign in again to continue editing.</p>}
            <form onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
              <Field label="Editor password">
                <input type="password" autoComplete="current-password" required maxLength={256}
                  value={password} disabled={authBusy} onChange={(event) => setPassword(event.target.value)} />
              </Field>
              <button className="management-primary" type="submit" disabled={authBusy}>
                {authBusy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </section>
        )}
        {error && <div role="alert" className="management-error">
          <p>{error}</p>
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
