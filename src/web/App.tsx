import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { State, Actor, Customer, ServiceCase } from "../core/types";
import "./style.css";
type Config = {
  region: string;
  poolId: string | null;
  clientId: string | null;
  interpreter: string;
  model: string | null;
  whatsapp: boolean;
  storage: string;
  kaysons: boolean;
};
type Workspace = State & { actor: Actor };
const nav = [
  ["today", "◫", "Today"],
  ["customers", "◎", "Customers"],
  ["cases", "▱", "Delivery cases"],
  ["orders", "▤", "Order requests"],
  ["activity", "↗", "Activity"],
  ["settings", "⚙", "Connections"],
];
const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
function App() {
  const [config, setConfig] = useState<Config>();
  const [state, setState] = useState<Workspace>();
  const [tab, setTab] = useState("today");
  const [selected, setSelected] = useState("C001");
  const [token, setToken] = useState(
    sessionStorage.getItem("tradeloop-token") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [user, setUser] = useState("reviewer");
  const [password, setPassword] = useState("");
  async function api(route: string, body?: unknown) {
    const r = await fetch("/api/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const d = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        sessionStorage.removeItem("tradeloop-token");
        setToken("");
        setState(undefined);
      }
      throw new Error(d.error ?? "Request failed");
    }
    return d;
  }
  async function refresh() {
    setState(await api("state"));
  }
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Cannot reach the application."));
  }, []);
  useEffect(() => {
    if (config && (!config.poolId || token))
      refresh().catch((e) => setError(e.message));
  }, [config, token]);
  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [!!state, token]);
  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      if (success) setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `https://cognito-idp.${config!.region}.amazonaws.com/`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-amz-json-1.1",
            "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
          },
          body: JSON.stringify({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: config!.clientId,
            AuthParameters: { USERNAME: user, PASSWORD: password },
          }),
        },
      );
      const d = await r.json();
      if (!d.AuthenticationResult?.IdToken)
        throw new Error(d.message ?? "Staff sign-in could not complete");
      sessionStorage.setItem("tradeloop-token", d.AuthenticationResult.IdToken);
      setToken(d.AuthenticationResult.IdToken);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const c = state?.customers.find((x) => x.id === selected);
  const cases = state?.cases.filter((x) => x.customerId === selected) ?? [];
  const current = cases.find((x) => x.status !== "resolved") ?? cases.at(-1);
  const due =
    state?.customers.filter(
      (c) =>
        c.consent &&
        !c.paused &&
        new Date(c.nextFollowupAt).getTime() <= Date.now(),
    ) ?? [];
  const open = state?.cases.filter((c) => c.status !== "resolved") ?? [];
  const requests = state?.requests ?? [];
  const openCustomer = (cid: string) => {
    setSelected(cid);
    setTab("customers");
    setNote("");
    setError("");
  };
  async function send(text = draft) {
    if (!text.trim() || !c) return;
    await act(async () => {
      await api("messages", {
        customerId: c.id,
        text,
        messageId: crypto.randomUUID(),
      });
      setDraft("");
    });
  }
  async function upload(file: File) {
    if (!current) return;
    await act(async () => {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Please choose a file under 4 MB");
      const bytes = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api("evidence", {
        caseId: current.id,
        version: current.version,
        name: file.name,
        mime: file.type,
        base64: bytes,
      });
    }, "Evidence attached. Review it before approving the next action.");
  }
  async function viewEvidence(eid: string) {
    await act(async () => {
      const response = await fetch(`/api/evidence/${eid}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Evidence could not be opened");
      if (response.headers.get("content-type")?.includes("json")) {
        const { url } = await response.json();
        window.open(url, "_blank", "noopener");
      } else {
        const url = URL.createObjectURL(await response.blob());
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      }
    });
  }
  const review = (action: string) =>
    act(
      async () => {
        await api("cases/action", {
          caseId: current!.id,
          version: current!.version,
          action,
          note:
            note.trim() ||
            (action === "approve" ? `Approved: ${current!.proposal}` : ""),
        });
        setNote("");
      },
      action === "approve"
        ? "Next action approved. The case stays open until completion is recorded."
        : undefined,
    );
  if (!config) return <div className="loading">Opening your workspace…</div>;
  if (config.poolId && !token)
    return (
      <main className="login">
        <div className="login-story">
          <Brand />
          <div>
            <span className="eyebrow">FROM CONVERSATION TO COMPLETION</span>
            <h1>
              Good business
              <br />
              comes full circle.
            </h1>
            <p>
              Follow up with customers. Bring delivery issues into view. Give
              every next step an owner.
            </p>
            <div className="login-loop">
              Follow up <span>→</span> Understand <span>→</span> Resolve{" "}
              <span>↻</span>
            </div>
          </div>
          <small>TradeLoop · AWS CDS hackathon prototype</small>
        </div>
        <form className="login-form" onSubmit={login}>
          <span className="pill">SYNTHETIC DEMO WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in to your staff workspace.</p>
          <label>
            Username
            <input
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? (
            <div role="alert" className="error">
              {error}
            </div>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Open workspace →"}
          </button>
          <p className="micro">
            Access is restricted to authorized reviewers. Customer records shown
            here are fictional.
          </p>
        </form>
      </main>
    );
  if (!state)
    return (
      <div className="loading">
        {error || "Loading customer records…"}
        {error ? (
          <button onClick={() => refresh().catch((e) => setError(e.message))}>
            Retry
          </button>
        ) : null}
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-name">
          <span className="avatar">DF</span>
          <div>
            <strong>Demo Foods</strong>
            <small>Distribution workspace</small>
          </div>
          <span>⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setError("");
              }}
            >
              <span>{icon}</span>
              {label}
              {key === "cases" && open.length ? <b>{open.length}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="dot" /> Demonstration workspace
            <p>
              Fictional records.
              <br />
              Real workflow controls.
            </p>
          </div>
          <div className="user">
            <span className="avatar small">RV</span>
            <div>
              <strong>Review team</strong>
              <small>{state.actor.role} access</small>
            </div>
            {token ? (
              <button
                aria-label="Sign out"
                onClick={() => {
                  sessionStorage.removeItem("tradeloop-token");
                  setToken("");
                  setState(undefined);
                }}
              >
                ↪
              </button>
            ) : null}
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>{nav.find((n) => n[0] === tab)?.[2]}</strong>
          </span>
          <div>
            <span
              className={
                "status-dot " +
                (config.interpreter === "bedrock" ? "green" : "amber")
              }
            />
            <span>
              {config.interpreter === "bedrock"
                ? "Bedrock connected"
                : "Demo rules interpreter"}
            </span>
            <span className="top-date">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        <main className="main">
          <div className="demo-banner">
            <span>◈</span>
            <strong>Synthetic business data</strong>
            <span>
              Conversations in the test console are simulated. WhatsApp:{" "}
              {config.whatsapp ? "configured" : "not connected"}.
            </span>
            <button onClick={() => setTab("settings")}>
              View connections ↗
            </button>
          </div>
          {error ? (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="success" role="status">
              {notice}
            </div>
          ) : null}
          {tab === "today" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR DAILY OPERATING VIEW</span>
                  <h1>Let’s close the loop.</h1>
                  <p>
                    A clearer view of your customers, conversations, and next
                    steps.
                  </p>
                </div>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => act(refresh, "Workspace refreshed")}
                >
                  ↻ Refresh
                </button>
              </div>
              <div className="metrics">
                <Metric
                  icon="↗"
                  label="Follow-ups due"
                  value={due.length}
                  detail="Ready for a thoughtful check-in"
                />
                <Metric
                  icon="▱"
                  label="Open delivery cases"
                  value={open.length}
                  detail="Every issue has a next step"
                  tone="warm"
                />
                <Metric
                  icon="▤"
                  label="Order requests"
                  value={requests.filter((r) => r.status !== "declined").length}
                  detail="Requests, not fulfilled sales"
                />
                <Metric
                  icon="✓"
                  label="Resolved cases"
                  value={
                    state.cases.filter((c) => c.status === "resolved").length
                  }
                  detail="Completion recorded by staff"
                />
              </div>
              <div className="overview-grid">
                <section className="card">
                  <div className="card-title">
                    <div>
                      <h2>Customers to reconnect with</h2>
                      <p>Based on recorded purchases and follow-up dates.</p>
                    </div>
                    <span className="pill">{due.length} DUE</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Last order</th>
                          <th>Owner</th>
                          <th>Next step</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.customers.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <button
                                className="customer-link"
                                onClick={() => openCustomer(c.id)}
                              >
                                <span className="avatar mini">
                                  {c.name
                                    .split(" ")
                                    .map((x) => x[0])
                                    .join("")
                                    .slice(0, 2)}
                                </span>
                                <span>
                                  <strong>{c.name}</strong>
                                  <small>{c.city}</small>
                                </span>
                              </button>
                            </td>
                            <td>{date(c.lastOrderAt)}</td>
                            <td>{c.owner}</td>
                            <td>
                              <button
                                className={
                                  "text-button " + (c.paused ? "orange" : "")
                                }
                                onClick={() => openCustomer(c.id)}
                              >
                                {!c.consent
                                  ? "Opted out"
                                  : c.paused
                                    ? "Review issue →"
                                    : new Date(c.nextFollowupAt).getTime() >
                                        Date.now()
                                      ? "Scheduled →"
                                      : "Open customer →"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="card journey">
                  <span className="eyebrow">ONE CONNECTED WORKFLOW</span>
                  <h2>
                    The next order starts
                    <br />
                    with the last experience.
                  </h2>
                  <p>
                    When a follow-up uncovers a delivery problem, resolve the
                    issue before continuing the sales conversation.
                  </p>
                  <ol>
                    <li>
                      <b>01</b>
                      <span>Check in with the customer</span>
                    </li>
                    <li>
                      <b>02</b>
                      <span>Understand what’s holding them back</span>
                    </li>
                    <li>
                      <b>03</b>
                      <span>Gather evidence and assign a reviewer</span>
                    </li>
                    <li>
                      <b>04</b>
                      <span>Complete the next approved action</span>
                    </li>
                  </ol>
                  <button
                    className="primary"
                    onClick={() => openCustomer("C001")}
                  >
                    Explore the customer workspace →
                  </button>
                </section>
              </div>
              <section className="card activity-preview">
                <div className="card-title">
                  <h2>Latest activity</h2>
                  <button
                    className="text-button"
                    onClick={() => setTab("activity")}
                  >
                    View timeline ↗
                  </button>
                </div>
                {state.audit.length ? (
                  state.audit
                    .slice(-4)
                    .reverse()
                    .map((e) => (
                      <div className="event" key={e.id}>
                        <span className="event-mark">↗</span>
                        <div>
                          <strong>{e.action.replaceAll(".", " · ")}</strong>
                          <p>{e.detail}</p>
                        </div>
                        <time>
                          {new Date(e.at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))
                ) : (
                  <div className="empty-inline">
                    Your workspace is ready. Open a customer to begin the first
                    conversation.
                  </div>
                )}
              </section>
            </>
          ) : null}
          {tab === "customers" && c ? (
            <>
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">CUSTOMER WORKSPACE</span>
                  <h1>{c.name}</h1>
                  <p>
                    {c.city} <span className="separator">·</span> Assigned to{" "}
                    {c.owner} <span className="separator">·</span> {c.id}
                  </p>
                </div>
                <span className={"pill " + (c.paused ? "orange" : "")}>
                  {!c.consent
                    ? "FOLLOW-UPS STOPPED"
                    : c.paused
                      ? "SALES FOLLOW-UP PAUSED"
                      : "CUSTOMER ACTIVE"}
                </span>
              </div>
              <div className="customer-tabs">
                {state.customers.map((x) => (
                  <button
                    className={x.id === selected ? "selected" : ""}
                    onClick={() => openCustomer(x.id)}
                    key={x.id}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
              <div className="customer-grid">
                <section className="card conversation">
                  <div className="card-title">
                    <div>
                      <h2>Conversation</h2>
                      <p>
                        Staff test console ·{" "}
                        {config.interpreter === "bedrock"
                          ? "Bedrock interpretation"
                          : "deterministic demo interpretation"}
                      </p>
                    </div>
                    <span className="pill">SIMULATOR</span>
                  </div>
                  <div className="chat-log" aria-live="polite">
                    {state.messages.filter((m) => m.customerId === c.id)
                      .length ? (
                      state.messages
                        .filter((m) => m.customerId === c.id)
                        .map((m) => (
                          <div className={"bubble " + m.direction} key={m.id}>
                            <small>
                              {m.direction === "inbound" ? c.name : "TradeLoop"}{" "}
                              <span>
                                · {m.channel}
                                {m.engine ? " · " + m.engine : ""}
                              </span>
                            </small>
                            <p>{m.text}</p>
                            <time>
                              {new Date(m.at).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                        ))
                    ) : (
                      <div className="chat-empty">
                        <div>↔</div>
                        <h3>Start with a conversation.</h3>
                        <p>
                          Try a delivery enquiry, a complaint, or a repeat
                          order. The resulting records appear alongside the
                          conversation.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="suggestions">
                    <span>TRY A CUSTOMER MESSAGE</span>
                    {[
                      "Where is my delivery?",
                      "2 cartons missing from my last delivery",
                      "Same order again, 5 cartons",
                      "Confirm",
                      "Stop messages",
                    ].map((t) => (
                      <button key={t} disabled={busy} onClick={() => send(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                  >
                    <label className="sr-only" htmlFor="message">
                      Customer message
                    </label>
                    <textarea
                      id="message"
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type as this customer… Hindi / English"
                      maxLength={2000}
                    />
                    <button
                      className="primary"
                      disabled={busy || !draft.trim()}
                    >
                      {busy ? "Processing…" : "Send test message ↑"}
                    </button>
                  </form>
                </section>
                <div className="context-stack">
                  <section className="card">
                    <div className="card-title">
                      <h2>Customer context</h2>
                      <span className="subtle-icon">◎</span>
                    </div>
                    <div className="detail-list">
                      <Detail
                        label="Last recorded purchase"
                        value={date(c.lastOrderAt)}
                      />
                      <Detail
                        label="Next follow-up"
                        value={
                          c.paused
                            ? "Paused for service review"
                            : date(c.nextFollowupAt)
                        }
                      />
                      <Detail
                        label="Messaging consent"
                        value={
                          c.consent ? "Demo participant opted in" : "Opted out"
                        }
                      />
                      <Detail
                        label="Data source"
                        value="Synthetic demonstration"
                      />
                    </div>
                    {c.reason ? (
                      <div className="customer-reason">
                        <small>CUSTOMER-STATED REASON</small>
                        <p>“{c.reason}”</p>
                      </div>
                    ) : null}
                    <button
                      className="outline full"
                      disabled={busy || c.paused || !c.consent}
                      onClick={() =>
                        act(
                          () => api("followups/" + c.id, {}),
                          "Follow-up queued. Delivery requires an eligible session or approved template and a mapped test number.",
                        )
                      }
                    >
                      Queue sales follow-up
                    </button>
                  </section>
                  {state.shipments
                    .filter((sh) => sh.customerId === c.id)
                    .map((sh) => (
                      <section className="card shipment" key={sh.id}>
                        <div className="card-title">
                          <h2>Latest delivery</h2>
                          <span className="pill">
                            {sh.source.toUpperCase()}
                          </span>
                        </div>
                        <strong className="shipment-id">{sh.id}</strong>
                        <p>{sh.status}</p>
                        <div className="detail-list">
                          <Detail
                            label="Expected quantity"
                            value={`${sh.expected} ${sh.unit}s`}
                          />
                          <Detail label="Carrier reference" value={sh.lr} />
                          <Detail label="POD review" value={sh.podStatus} />
                          <Detail
                            label="Last recorded update"
                            value={date(sh.updatedAt)}
                          />
                        </div>
                        <div className="micro">
                          Recorded status. No live vehicle location feed.
                        </div>
                      </section>
                    ))}
                </div>
              </div>
              {current ? (
                <section className="card case-panel">
                  <div className="card-title">
                    <div>
                      <span className="eyebrow">DELIVERY ISSUE</span>
                      <h2>
                        {current.type}{" "}
                        <span className="pill orange">
                          {current.status.replaceAll("_", " ").toUpperCase()}
                        </span>
                      </h2>
                      <p>
                        {current.shipmentId ?? "Shipment reference needed"} ·
                        Revision {current.version} · {current.owner}
                      </p>
                    </div>
                    <span className="micro">{current.id.slice(0, 13)}</span>
                  </div>
                  <div className="case-columns">
                    <div>
                      <small className="field-label">CUSTOMER CLAIM</small>
                      <p className="claim">“{current.claim}”</p>
                      <div className="quantity-pair">
                        <div>
                          <small>Expected</small>
                          <strong>{current.expected ?? "Unknown"}</strong>
                        </div>
                        <div>
                          <small>Reported received</small>
                          <strong>{current.reported ?? "Not stated"}</strong>
                        </div>
                      </div>
                      <p className="micro">
                        Claims and document readings remain separate from
                        accepted delivery facts.
                      </p>
                      <label
                        className={
                          "upload " +
                          (busy || current.status === "resolved"
                            ? "disabled"
                            : "")
                        }
                      >
                        ＋ Attach POD or customer evidence
                        <input
                          aria-label="Attach evidence"
                          type="file"
                          accept="image/png,image/jpeg,application/pdf"
                          disabled={busy || current.status === "resolved"}
                          onChange={(e) => {
                            if (e.target.files?.[0]) upload(e.target.files[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <small className="micro">
                        PNG, JPEG, PDF · up to 4 MB · printed documents
                      </small>
                      {current.evidence.map((e) => (
                        <div className="evidence" key={e.id}>
                          <button onClick={() => viewEvidence(e.id)}>
                            ▧ {e.name} ↗
                          </button>
                          <small>
                            {e.extraction === "extracted"
                              ? "Text extracted; staff review required"
                              : "Manual document review required"}
                          </small>
                          {e.extractedText ? (
                            <details>
                              <summary>View extracted text</summary>
                              <pre>{e.extractedText}</pre>
                            </details>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="review-box">
                      <small className="field-label">
                        STAFF REVIEW & NEXT ACTION
                      </small>
                      {current.proposal ? (
                        <div className="proposal">
                          <strong>Proposed action</strong>
                          <p>{current.proposal}</p>
                        </div>
                      ) : null}
                      {current.resolution ? (
                        <div className="success">
                          Completion recorded: {current.resolution}
                        </div>
                      ) : null}
                      <label htmlFor="review-note">
                        Review / completion note
                      </label>
                      <textarea
                        id="review-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Describe the proposed action, or evidence that it was completed."
                        rows={3}
                        maxLength={1000}
                        disabled={current.status === "resolved"}
                      />
                      <div className="button-row">
                        <button
                          className="outline"
                          disabled={
                            busy || current.status !== "review" || !note.trim()
                          }
                          onClick={() => review("propose")}
                        >
                          Save proposal
                        </button>
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            current.status !== "review" ||
                            !current.proposal
                          }
                          onClick={() => review("approve")}
                        >
                          Approve next action
                        </button>
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            current.status !== "action_pending" ||
                            !note.trim()
                          }
                          onClick={() => review("resolve")}
                        >
                          Record completion
                        </button>
                      </div>
                      <p className="micro">
                        Approval authorizes the next step. It does not issue a
                        credit, dispatch goods, or close the case.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
              {requests
                .filter((r) => r.customerId === c.id)
                .map((r) => (
                  <section className="card order-card" key={r.id}>
                    <div className="card-title">
                      <h2>
                        Order request{" "}
                        <span className="pill">
                          {r.status.replaceAll("_", " ").toUpperCase()}
                        </span>
                      </h2>
                      <span className="micro">Revision {r.version}</span>
                    </div>
                    {r.items.map((i) => (
                      <p key={i.productId}>
                        {i.quantity} cartons ·{" "}
                        {state.products.find((p) => p.id === i.productId)?.name}{" "}
                        <span className="micro">
                          (
                          {
                            state.products.find((p) => p.id === i.productId)
                              ?.pack
                          }
                          )
                        </span>
                      </p>
                    ))}
                    <button
                      className="primary"
                      disabled={busy || r.status !== "customer_confirmed"}
                      onClick={() =>
                        act(
                          () =>
                            api("requests/approve", {
                              requestId: r.id,
                              version: r.version,
                            }),
                          "Request approved for processing. No stock reservation or invoice was created.",
                        )
                      }
                    >
                      Approve for processing
                    </button>
                    <p className="micro">
                      Requires customer confirmation and staff checks. Not a
                      fulfilled sale.
                    </p>
                  </section>
                ))}
            </>
          ) : null}
          {tab === "cases" ? (
            <>
              <PageTitle
                eyebrow="SERVICE COORDINATION"
                title="Every issue, an owner."
                text="Review customer claims, delivery evidence, and the next approved action."
              />
              {open.length || state.cases.length ? (
                <div className="case-list">
                  {state.cases.map((x) => (
                    <button
                      className="card case-list-item"
                      key={x.id}
                      onClick={() => openCustomer(x.customerId)}
                    >
                      <span className="pill orange">
                        {x.status.replaceAll("_", " ")}
                      </span>
                      <h2>
                        {
                          state.customers.find((c) => c.id === x.customerId)
                            ?.name
                        }
                      </h2>
                      <p>{x.claim}</p>
                      <small>
                        {x.shipmentId ?? "Reference pending"} · {x.owner}
                      </small>
                      <span className="text-button">Review case →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No delivery issues yet."
                  text="A customer complaint in the test console will open a case and pause their routine sales follow-ups."
                  action={() => openCustomer("C001")}
                />
              )}
            </>
          ) : null}
          {tab === "orders" ? (
            <>
              <PageTitle
                eyebrow="SALES COORDINATION"
                title="From interest to request."
                text="Customer-confirmed requests move to staff review before commercial commitments."
              />
              {requests.length ? (
                <div className="case-list">
                  {requests.map((r) => (
                    <button
                      className="card case-list-item"
                      key={r.id}
                      onClick={() => openCustomer(r.customerId)}
                    >
                      <span className="pill">
                        {r.status.replaceAll("_", " ")}
                      </span>
                      <h2>
                        {
                          state.customers.find((c) => c.id === r.customerId)
                            ?.name
                        }
                      </h2>
                      <p>
                        {r.items
                          .map(
                            (i) =>
                              `${i.quantity} cartons of ${state.products.find((p) => p.id === i.productId)?.name}`,
                          )
                          .join(", ")}
                      </p>
                      <small>
                        {date(r.createdAt)} · Revision {r.version}
                      </small>
                      <span className="text-button">Open request →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Ready for the next order."
                  text="Open a customer and try “same order again, 5 cartons”, then confirm the request."
                  action={() => openCustomer("C002")}
                />
              )}
              <section className="card catalogue">
                <h2>Approved demo catalogue</h2>
                <p className="micro">
                  Sample prices only. No live stock feed, taxes, or delivery
                  commitments.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Pack</th>
                        <th>Unit</th>
                        <th>Sample price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.products.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.pack}</td>
                          <td>{p.unit}</td>
                          <td>{money(p.priceMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
          {tab === "activity" ? (
            <>
              <PageTitle
                eyebrow="TRACEABLE ACTIONS"
                title="The whole story, recorded."
                text="An operational timeline of customer messages, state changes, and staff decisions."
              />
              <section className="card">
                {state.audit.length ? (
                  state.audit
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div className="event" key={e.id}>
                        <span className="event-mark">↗</span>
                        <div>
                          <strong>{e.action.replaceAll(".", " · ")}</strong>
                          <p>{e.detail}</p>
                          <small>
                            {e.actor} {e.customerId ? "· " + e.customerId : ""}
                          </small>
                        </div>
                        <time>
                          {date(e.at)}
                          <br />
                          {new Date(e.at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))
                ) : (
                  <div className="empty-inline">No actions recorded yet.</div>
                )}
              </section>
            </>
          ) : null}
          {tab === "settings" ? (
            <>
              <PageTitle
                eyebrow="WORKSPACE CONNECTIONS"
                title="Know what is connected."
                text="Live infrastructure and prototype boundaries, visible in one place."
              />
              <div className="connections">
                {[
                  [
                    "AI interpretation",
                    config.interpreter === "bedrock"
                      ? "Connected"
                      : "Demo rules",
                    config.model ??
                      "No model configured. Local classification is deterministic.",
                  ],
                  [
                    "Business records",
                    config.storage === "dynamodb"
                      ? "DynamoDB"
                      : "Local file store",
                    "Synthetic customers, products, purchase history, and shipments.",
                  ],
                  [
                    "WhatsApp",
                    config.whatsapp ? "Configured" : "Setup required",
                    "A WhatsApp Business account and dedicated number must be linked to AWS.",
                  ],
                  [
                    "Kaysons integration",
                    "Not connected",
                    "Connector contract exists. No Kaysons production reads or writes are enabled.",
                  ],
                ].map(([title, status, detail]) => (
                  <section className="card connection" key={title}>
                    <div className="card-title">
                      <h2>{title}</h2>
                      <span className="pill">{status}</span>
                    </div>
                    <p>{detail}</p>
                  </section>
                ))}
              </div>
              <section className="card">
                <h2>Demonstration controls</h2>
                <p>
                  Reset only this synthetic workspace. This removes its
                  conversations, requests, and cases.
                </p>
                <button
                  className="outline danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset this synthetic workspace and remove its demo activity?",
                      )
                    )
                      act(() => api("reset", {}), "Synthetic workspace reset.");
                  }}
                >
                  Reset synthetic workspace
                </button>
              </section>
            </>
          ) : null}
          <footer>
            TradeLoop <span>·</span> Conversations with a next step.
            <span className="footer-right">
              AWS CDS prototype · Synthetic data
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M7 14h18a8 8 0 0 1 0 16H14m0 0 5-5m-5 5 5 5M31 12l-5-5m5 5-5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        TradeLoop<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  detail,
  tone = "",
}: {
  icon: string;
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <section className={"metric " + tone}>
      <div>
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: () => void;
}) {
  return (
    <section className="card empty">
      <span>↔</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={action}>
        Open customer workspace →
      </button>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
