import type { State } from "./types";

export function hasImportedRecords(state: State, customerId?: string) {
  return state.shipments.some(
    (shipment) =>
      shipment.source !== "synthetic" &&
      (!customerId || shipment.customerId === customerId),
  );
}

export function hasProtectedActivity(state: State) {
  return (
    hasImportedRecords(state) ||
    state.messages.some((message) => message.channel === "whatsapp") ||
    state.cases.some((record) => record.origin === "whatsapp")
  );
}
