import type { State } from "./types";
export function seed(tenantId = "demofoods"): State {
  const now = new Date();
  const ago = (days: number) =>
    new Date(now.getTime() - days * 86400000).toISOString();
  const names =
    tenantId === "demofoods"
      ? [
          "Sunrise Café",
          "Baker Street",
          "Olive Kitchen",
          "Metro Mart",
          "The Pizza Room",
        ]
      : ["Northstar Test Outlet"];
  const customers = names.map((name, i) => ({
    id: `C00${i + 1}`,
    name,
    city: ["Lucknow", "Kanpur", "Lucknow", "Unnao", "Kanpur"][i],
    contact: "Unmapped test contact",
    owner: i % 2 ? "Priya" : "Amit",
    lastOrderAt: ago(14 + i * 3),
    nextFollowupAt: ago(i + 1),
    consent: i !== 3,
    paused: false,
  }));
  return {
    tenantId,
    revision: 0,
    business: {
      name:
        tenantId === "demofoods"
          ? "Demo Foods Distribution"
          : "Northstar Isolation Fixture",
      synthetic: true,
      timezone: "Asia/Kolkata",
    },
    customers,
    products: [
      {
        id: "P01",
        name: "Tomato pizza sauce",
        pack: "6 × 1 kg",
        unit: "carton",
        priceMinor: 168000,
        currency: "INR",
      },
      {
        id: "P02",
        name: "Bakery chocolate compound",
        pack: "10 × 500 g",
        unit: "carton",
        priceMinor: 240000,
        currency: "INR",
      },
      {
        id: "P03",
        name: "Whipping cream",
        pack: "12 × 1 L",
        unit: "carton",
        priceMinor: 216000,
        currency: "INR",
      },
      {
        id: "P04",
        name: "Pasta penne",
        pack: "12 × 500 g",
        unit: "carton",
        priceMinor: 144000,
        currency: "INR",
      },
      {
        id: "P05",
        name: "Chocolate syrup",
        pack: "6 × 1.3 kg",
        unit: "carton",
        priceMinor: 198000,
        currency: "INR",
      },
      {
        id: "P06",
        name: "Pizza seasoning",
        pack: "20 × 100 g",
        unit: "carton",
        priceMinor: 120000,
        currency: "INR",
      },
    ],
    orders: customers.flatMap((c, i) =>
      [0, 1].map((n) => ({
        id: `ORD-${100 + i * 2 + n}`,
        customerId: c.id,
        date: ago(14 + i * 3 + n * 15),
        invoice: `INV-${200 + i * 2 + n}`,
        items: [{ productId: i % 2 ? "P02" : "P01", quantity: 20 - i * 2 }],
      })),
    ),
    shipments: customers.slice(0, 3).map((c, i) => ({
      id: `SHP-${101 + i}`,
      customerId: c.id,
      orderId: `ORD-${100 + i * 2}`,
      receiver: c.name,
      lr: `LR-${501 + i}`,
      expected: 20 - i * 2,
      unit: "carton",
      status:
        i === 0
          ? "Delivery reported; POD missing"
          : i === 1
            ? "In transit"
            : "Dispatched",
      updatedAt: ago(i === 0 ? 2 : 0),
      transporter: "Demo Transport",
      source: "synthetic" as const,
      podStatus: "missing" as const,
      version: 1,
    })),
    cases: [],
    requests: [],
    messages: [],
    audit: [],
    outbox: [],
    processed: [],
  };
}
