import type { State } from "../core/types";

type OverviewProps = {
  state: State;
  onOpenCustomer: (customerId: string) => void;
  onViewEvidence: (evidenceId: string) => void;
  onOpenActivity: () => void;
  searchQuery?: string;
};

function Icon({
  kind,
}: {
  kind: "calendar" | "followup" | "case" | "order" | "document" | "arrow";
}) {
  const paths = {
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="4" />
        <path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2" />
      </>
    ),
    followup: (
      <>
        <path d="M20 11a8 8 0 1 0-3 6M20 4v7h-7M12 7v5l-3 2" />
      </>
    ),
    case: (
      <>
        <rect x="3" y="6" width="18" height="15" rx="3" />
        <path d="M8 6V3h8v3M3 12h18m-9-2v4" />
      </>
    ),
    order: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 8h6m-6 4h6m-6 4h4" />
      </>
    ),
    document: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

const formatDate = (value: string, timezone: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  });
};

export default function Overview({
  state,
  onOpenCustomer,
  onViewEvidence,
  onOpenActivity,
  searchQuery = "",
}: OverviewProps) {
  const now = Date.now();
  const due = state.customers.filter(
    (customer) =>
      customer.consent &&
      !customer.paused &&
      new Date(customer.nextFollowupAt).getTime() <= now,
  );
  const openCases = state.cases.filter(
    (record) => record.status !== "resolved",
  );
  const resolved = state.cases.length - openCases.length;
  const requests = state.requests.filter(
    (request) => request.status !== "declined",
  );
  const percent = state.cases.length
    ? Math.round((resolved / state.cases.length) * 100)
    : 0;
  const query = searchQuery.trim().toLowerCase();
  const matches = (...values: (string | undefined)[]) =>
    !query || values.some((value) => value?.toLowerCase().includes(query));
  const matchesCustomer = (customerId: string) => {
    const customer = state.customers.find((record) => record.id === customerId);
    return matches(
      customer?.id,
      customer?.name,
      customer?.city,
      customer?.owner,
      ...state.shipments
        .filter((record) => record.customerId === customerId)
        .flatMap((record) => [record.id, record.lr]),
      ...state.orders
        .filter((record) => record.customerId === customerId)
        .map((record) => record.invoice),
    );
  };
  const owners = [
    ...new Set(
      state.customers.map((customer) => customer.owner || "Unassigned"),
    ),
  ]
    .map((name) => {
      const customers = state.customers.filter(
        (customer) => (customer.owner || "Unassigned") === name,
      );
      const ids = new Set(customers.map((customer) => customer.id));
      return {
        name,
        customers: customers.length,
        cases: openCases.filter((record) => ids.has(record.customerId)).length,
        due: due.filter((customer) => ids.has(customer.id)).length,
      };
    })
    .sort(
      (a, b) =>
        b.cases + b.due - a.cases - a.due || a.name.localeCompare(b.name),
    );
  const documents = state.cases
    .flatMap((record) =>
      record.evidence.map((evidence) => ({
        record,
        evidence,
        customer: state.customers.find(
          (customer) => customer.id === record.customerId,
        ),
        shipment: state.shipments.find(
          (shipment) => shipment.id === record.shipmentId,
        ),
      })),
    )
    .filter(
      ({ record, evidence, customer }) =>
        matches(customer?.name, evidence.name, record.shipmentId, record.id) ||
        matchesCustomer(record.customerId),
    )
    .sort(
      (a, b) =>
        new Date(b.evidence.createdAt).getTime() -
        new Date(a.evidence.createdAt).getTime(),
    )
    .slice(0, 3);
  const representedShipments = new Set(
    documents.map(({ record }) => record.shipmentId),
  );
  const pendingShipments = state.shipments
    .filter(
      (shipment) =>
        shipment.podStatus !== "accepted" &&
        !representedShipments.has(shipment.id) &&
        matches(
          shipment.id,
          shipment.lr,
          state.orders.find((order) => order.id === shipment.orderId)?.invoice,
          state.customers.find(
            (customer) => customer.id === shipment.customerId,
          )?.name,
        ),
    )
    .slice(0, 3 - documents.length);
  const reconnect = [...due]
    .filter((customer) => matchesCustomer(customer.id))
    .sort(
      (a, b) =>
        new Date(a.nextFollowupAt).getTime() -
        new Date(b.nextFollowupAt).getTime(),
    )
    .slice(0, 5);
  const timezone = state.business.timezone || "Asia/Kolkata";
  const stats = [
    {
      label: "Follow-ups due",
      value: due.length,
      kind: "followup" as const,
      detail: "Consented customers ready to reconnect",
    },
    {
      label: "Open delivery cases",
      value: openCases.length,
      kind: "case" as const,
      detail: "Awaiting evidence, review or action",
    },
    {
      label: "Order requests",
      value: requests.length,
      kind: "order" as const,
      detail: "Draft, confirmed and approved requests",
    },
  ];

  return (
    <section className="overview-page" aria-label="Workspace overview">
      <header className="overview-heading">
        <div>
          <h1>Overview</h1>
          <p>Stay close to your customers and every delivery.</p>
        </div>
        <div className="overview-date">
          <Icon kind="calendar" />
          {formatDate(new Date().toISOString(), timezone)}
        </div>
      </header>
      <div className="overview-layout">
        <div className="overview-main">
          <div className="overview-stats">
            {stats.map((stat) => (
              <article className="card stat-card" key={stat.label}>
                <div className="stat-top">
                  <span>{stat.label}</span>
                  <Icon kind={stat.kind} />
                </div>
                <div className="stat-value">
                  {stat.value.toLocaleString("en-IN")}
                </div>
                <div className="stat-foot">
                  <span className="stat-indicator" />
                  {stat.detail}
                </div>
              </article>
            ))}
          </div>
          <div className="overview-panels">
            <article className="card performance-card">
              <div className="section-heading">
                <h2>Case resolution</h2>
                <span className="pill">All cases</span>
              </div>
              <div className="performance-gauge">
                <svg
                  viewBox="0 0 300 180"
                  role="img"
                  aria-label={`${resolved} of ${state.cases.length} delivery cases resolved, ${percent} percent`}
                >
                  <path
                    d="M 30 145 A 120 120 0 0 1 270 145"
                    fill="none"
                    stroke="#b5df2d"
                    strokeWidth="30"
                    strokeLinecap="round"
                    pathLength="100"
                  />
                  {resolved > 0 && (
                    <path
                      d="M 30 145 A 120 120 0 0 1 270 145"
                      fill="none"
                      stroke="#101110"
                      strokeWidth="30"
                      strokeLinecap="round"
                      pathLength="100"
                      strokeDasharray={`${percent} 100`}
                    />
                  )}
                  <text
                    x="150"
                    y="124"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="48"
                    fontWeight="600"
                  >
                    {state.cases.length ? `${percent}%` : "0"}
                  </text>
                  <text
                    x="150"
                    y="150"
                    textAnchor="middle"
                    fill="#777b75"
                    fontSize="12"
                  >
                    {resolved} of {state.cases.length} cases resolved
                  </text>
                </svg>
              </div>
              <div className="gauge-caption">
                <h3>
                  {state.cases.length === 0
                    ? "A clear starting point"
                    : openCases.length === 0
                      ? "Every case is resolved"
                      : `${openCases.length} ${openCases.length === 1 ? "case needs" : "cases need"} attention`}
                </h3>
                <p>
                  {state.cases.length
                    ? "Resolved cases across this workspace. Open cases stay visible until the team records a resolution."
                    : "Delivery cases will appear here when a customer reports an issue."}
                </p>
                <div className="gauge-legend">
                  <span>
                    <i style={{ background: "#101110" }} />
                    Resolved
                  </span>
                  <span>
                    <i style={{ background: "#b5df2d" }} />
                    Open
                  </span>
                </div>
              </div>
            </article>
            <article className="card owner-card">
              <div className="section-heading">
                <h2>Owner workload</h2>
                <span className="pill">{owners.length} owners</span>
              </div>
              <p className="owner-subtitle">
                Customer portfolios and outstanding work
              </p>
              {owners.length ? (
                owners.map((owner) => (
                  <div className="owner-row" key={owner.name}>
                    <div className="owner-avatar" aria-hidden="true">
                      {owner.name
                        .split(/\s+/)
                        .map((part) => part.charAt(0))
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="owner-info">
                      <strong>{owner.name}</strong>
                      <span>
                        {owner.customers}{" "}
                        {owner.customers === 1 ? "customer" : "customers"} ·{" "}
                        {owner.cases} open{" "}
                        {owner.cases === 1 ? "case" : "cases"}
                      </span>
                    </div>
                    <div className="owner-count">
                      <strong>{owner.due}</strong>
                      <span>due</span>
                    </div>
                  </div>
                ))
              ) : (
                <p>No customer owners assigned yet.</p>
              )}
              <button
                className="text-button owner-activity"
                onClick={onOpenActivity}
              >
                View workspace activity <Icon kind="arrow" />
              </button>
            </article>
          </div>
          <article className="card reconnect-card">
            <div className="section-heading">
              <div>
                <h2>Customers to reconnect with</h2>
                <p>Follow-ups due, ordered by the earliest date.</p>
              </div>
              <span className="pill">{due.length} due</span>
            </div>
            {reconnect.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Owner</th>
                      <th>Follow-up</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconnect.map((customer) => {
                      const count = openCases.filter(
                        (record) => record.customerId === customer.id,
                      ).length;
                      const imported = state.shipments.some(
                        (shipment) =>
                          shipment.customerId === customer.id &&
                          shipment.source !== "synthetic",
                      );
                      return (
                        <tr key={customer.id}>
                          <td>
                            <button
                              className="customer-link"
                              onClick={() => onOpenCustomer(customer.id)}
                            >
                              {customer.name}
                            </button>
                            <small>
                              {customer.city}
                              {imported ? " · Imported source" : ""}
                            </small>
                          </td>
                          <td>{customer.owner || "Unassigned"}</td>
                          <td>
                            {formatDate(customer.nextFollowupAt, timezone)}
                          </td>
                          <td>
                            <span className="pill">
                              {count
                                ? `${count} open ${count === 1 ? "case" : "cases"}`
                                : "Ready to reconnect"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="outline"
                              onClick={() => onOpenCustomer(customer.id)}
                            >
                              Open <Icon kind="arrow" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="doc-placeholder">
                <Icon kind="followup" />
                <h3>
                  {query ? "No matching follow-ups" : "You're all caught up"}
                </h3>
                <p>
                  {query
                    ? "Try another customer, owner or city."
                    : "No consented, active customers have a follow-up due right now."}
                </p>
              </div>
            )}
          </article>
        </div>
        <aside className="documents-panel" aria-label="Delivery documents">
          <div className="documents-heading">
            <h2>Documents</h2>
            <Icon kind="document" />
          </div>
          {documents.map(({ record, evidence, customer, shipment }) => (
            <article
              className="card document-card"
              key={`${record.id}-${evidence.id}`}
            >
              <div className="document-meta">
                <span className="pill">
                  {evidence.extraction === "extracted"
                    ? "Text extracted"
                    : evidence.extraction === "manual"
                      ? "Manual review required"
                      : "Extraction pending"}
                </span>
                <span className="pill">
                  {record.status === "resolved"
                    ? "Case resolved"
                    : record.status === "review"
                      ? "Awaiting review"
                      : record.status.replaceAll("_", " ")}
                </span>
              </div>
              <h3>
                <button
                  className="customer-link"
                  onClick={() => onOpenCustomer(record.customerId)}
                >
                  {customer?.name ?? "Customer unavailable"}
                </button>
              </h3>
              <button
                className="text-button document-name"
                onClick={() => onViewEvidence(evidence.id)}
              >
                <Icon kind="document" />
                {evidence.name}
              </button>
              <dl className="document-details">
                <div>
                  <dt>Shipment</dt>
                  <dd>{record.shipmentId ?? "Not linked"}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{formatDate(evidence.createdAt, timezone)}</dd>
                </div>
                <div>
                  <dt>Expected</dt>
                  <dd>
                    {record.expected ?? shipment?.expected ?? "Not recorded"}
                    {shipment ? ` ${shipment.unit}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Reported</dt>
                  <dd>
                    {record.reported ?? "Not recorded"}
                    {record.reported !== undefined && shipment
                      ? ` ${shipment.unit}`
                      : ""}
                  </dd>
                </div>
              </dl>
              <div className="document-footer">
                <span>
                  {shipment && shipment.source !== "synthetic"
                    ? "Imported source"
                    : evidence.kind === "sample"
                      ? "Sample document"
                      : "Customer evidence"}
                </span>
                <button
                  className="text-button"
                  onClick={() => onViewEvidence(evidence.id)}
                >
                  View document <Icon kind="arrow" />
                </button>
              </div>
            </article>
          ))}
          {!documents.length && (
            <p className="documents-empty-note">
              {query
                ? "No documents match your search."
                : "No delivery documents attached yet."}
            </p>
          )}
          {pendingShipments.map((shipment) => (
            <article className="card document-card" key={shipment.id}>
              <div className="document-meta">
                <span className="pill">
                  {shipment.podStatus === "correction"
                    ? "POD correction needed"
                    : shipment.podStatus === "pending"
                      ? "POD review pending"
                      : "Awaiting POD"}
                </span>
              </div>
              <h3>
                {state.customers.find(
                  (customer) => customer.id === shipment.customerId,
                )?.name ?? "Customer unavailable"}
              </h3>
              <p>Shipment {shipment.id}</p>
              <dl className="document-details">
                <div>
                  <dt>Expected</dt>
                  <dd>
                    {shipment.expected} {shipment.unit}
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(shipment.updatedAt, timezone)}</dd>
                </div>
              </dl>
              <div className="document-footer">
                <span>
                  {shipment.source !== "synthetic"
                    ? "Imported source"
                    : "Demo shipment"}
                </span>
                <button
                  className="text-button"
                  onClick={() => onOpenCustomer(shipment.customerId)}
                >
                  Open customer <Icon kind="arrow" />
                </button>
              </div>
            </article>
          ))}
          {!documents.length && !pendingShipments.length && (
            <div className="card doc-placeholder">
              <Icon kind="document" />
              <h3>No pending documents</h3>
              <p>
                Attached delivery evidence and pending proof of delivery will
                appear here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
