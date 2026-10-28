import type { Customer, State } from "../core/types";

export const retentionLabels = {
  price: "Price concern",
  stock_remaining: "Stock still left",
  low_demand: "Low demand",
  product_quality: "Product quality",
  delivery_issue: "Delivery issue",
  other: "Other feedback",
} as const;

type RetentionCustomer = Customer;

export function CustomerFeedback({
  customer,
}: {
  customer: RetentionCustomer;
}) {
  const feedback = customer.retention;
  if (!feedback && !customer.reason) return null;
  return (
    <div className="customer-reason">
      <span className="pill">
        {feedback ? retentionLabels[feedback.category] : "Feedback recorded"}
      </span>
      <p style={{ fontSize: 14 }}>Customer-stated message</p>
      <p style={{ fontSize: 16 }}>“{feedback?.statement ?? customer.reason}”</p>
      {feedback ? (
        <>
          <p style={{ fontSize: 14 }}>
            Category and next step are workflow interpretation, for staff
            review.
          </p>
          <p style={{ fontSize: 16 }}>
            <strong>{customer.owner}:</strong> {feedback.nextAction}
          </p>
        </>
      ) : null}
    </div>
  );
}

type Props = {
  state: State;
  busy: boolean;
  canQueue: boolean;
  onOpenCustomer: (id: string) => void;
  onQueue: (id: string) => void;
};

export default function SalesFollowups({
  state,
  busy,
  canQueue,
  onOpenCustomer,
  onQueue,
}: Props) {
  const now = Date.now();
  const customers: RetentionCustomer[] = [...state.customers].sort(
    (a, b) => Date.parse(a.nextFollowupAt) - Date.parse(b.nextFollowupAt),
  );
  const blocked = (customer: Customer) =>
    !customer.consent ||
    customer.paused ||
    state.cases.some(
      (record) =>
        record.customerId === customer.id && record.status !== "resolved",
    );
  const due = customers.filter(
    (customer) =>
      Date.parse(customer.nextFollowupAt) <= now && !blocked(customer),
  );
  const feedbackCustomers = customers.filter((customer) => customer.retention);
  const categories = Object.entries(retentionLabels) as [
    keyof typeof retentionLabels,
    string,
  ][];
  const dayCount = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time)
      ? `${Math.max(0, Math.floor((now - time) / 86400000))} days since last recorded purchase`
      : "Last purchase date unavailable";
  };
  const showDate = (value: string) =>
    new Date(value).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: state.business.timezone,
    });
  return (
    <section
      className="sales-followups"
      aria-label="Sales follow-ups"
      style={{ fontSize: 16 }}
    >
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">SALES COORDINATION</span>
          <h1>Keep the next order moving.</h1>
          <p>
            Ask whether the next delivery is needed. Capture why customers are
            waiting, and give the team a next step.
          </p>
        </div>
      </div>
      <div className="sales-summary overview-stats">
        {[
          ["Due check-ins", due.length],
          ["Categorized feedback", feedbackCustomers.length],
          ["Follow-ups blocked", customers.filter(blocked).length],
        ].map(([label, value]) => (
          <article className="card stat-card" key={label}>
            <span style={{ fontSize: 16 }}>{label}</span>
            <div className="stat-value">{value}</div>
          </article>
        ))}
      </div>
      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-title">
          <h2>The check-in</h2>
          <span className="pill">Suggested wording</span>
        </div>
        <p>
          “Would you like your next delivery? If you are waiting or have stopped
          ordering, please tell us why: stock still left, price, low demand,
          product quality, or a delivery issue.”
        </p>
        <p style={{ fontSize: 14 }}>
          Due dates are the existing staff schedule. Purchase history alone does
          not establish a usual reorder interval. Queuing a follow-up does not
          confirm WhatsApp delivery.
        </p>
      </section>
      <div className="sales-customer-list" style={{ marginTop: 20 }}>
        {customers.map((customer) => {
          const isBlocked = blocked(customer);
          const isDue = Date.parse(customer.nextFollowupAt) <= now;
          const pending = state.outbox.some(
            (item) =>
              item.customerId === customer.id &&
              item.kind === "followup" &&
              ["pending", "sending"].includes(item.status),
          );
          return (
            <article
              className="card sales-customer-row"
              key={customer.id}
              style={{ marginBottom: 16 }}
            >
              <div className="card-title">
                <div>
                  <h2>{customer.name}</h2>
                  <p style={{ fontSize: 14 }}>
                    {customer.city} · Owner: {customer.owner}
                  </p>
                </div>
                <span className={"pill " + (isBlocked ? "orange" : "")}>
                  {!customer.consent
                    ? "Opted out"
                    : isBlocked
                      ? "Paused for service review"
                      : pending
                        ? "Follow-up queued"
                        : isDue
                          ? "Check-in due"
                          : "Scheduled"}
                </span>
              </div>
              <p>
                {dayCount(customer.lastOrderAt)} · Follow-up{" "}
                {showDate(customer.nextFollowupAt)}
              </p>
              <CustomerFeedback customer={customer} />
              {!customer.retention && !customer.reason ? (
                <p style={{ fontSize: 14 }}>
                  No customer reason recorded. Ask before assuming why orders
                  stopped.
                </p>
              ) : null}
              <div className="suggestions">
                <button
                  className="primary"
                  disabled={busy || !canQueue || isBlocked || !isDue || pending}
                  onClick={() => onQueue(customer.id)}
                >
                  Queue check-in
                </button>
                <button
                  className="outline"
                  onClick={() => onOpenCustomer(customer.id)}
                >
                  Open conversation →
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <section
        className="card sales-feedback-summary"
        style={{ marginTop: 20 }}
      >
        <div className="card-title">
          <div>
            <h2>Customer feedback for the brand team</h2>
            <p style={{ fontSize: 14 }}>
              One latest categorized reason per customer in this workspace.
              Counts describe recorded feedback, not the wider market.
            </p>
          </div>
        </div>
        <div className="sales-reason-counts suggestions">
          {categories.map(([category, label]) => (
            <span className="pill" key={category}>
              {label}:{" "}
              {
                feedbackCustomers.filter(
                  (customer) => customer.retention?.category === category,
                ).length
              }
            </span>
          ))}
        </div>
        {!feedbackCustomers.length ? (
          <p>
            No categorized feedback yet. Open a fictional customer and try “I
            still have stock left” in the simulator.
          </p>
        ) : (
          feedbackCustomers.map((customer) => (
            <div className="sales-feedback-action" key={customer.id}>
              <p>
                <strong>
                  {customer.name} ·{" "}
                  {retentionLabels[customer.retention!.category]}
                </strong>
              </p>
              <p>
                {customer.owner}: {customer.retention!.nextAction}
              </p>
              <button
                className="text-button"
                onClick={() => onOpenCustomer(customer.id)}
              >
                Review customer message →
              </button>
            </div>
          ))
        )}
        {customers.some(
          (customer) => customer.reason && !customer.retention,
        ) ? (
          <p style={{ fontSize: 14 }}>
            Earlier free-text reasons remain visible on customer cards. They are
            excluded from category counts until classified.
          </p>
        ) : null}
      </section>
    </section>
  );
}
