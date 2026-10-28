import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  SocialMessagingClient,
  SendWhatsAppMessageCommand,
  GetWhatsAppMessageMediaCommand,
} from "@aws-sdk/client-socialmessaging";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { store } from "../adapters/store";
import { interpret } from "../adapters/interpreter";
import { saveEvidence } from "../adapters/evidence";
import { receive, attach, audit } from "../core/engine";
import { id } from "../core/types";
type Binding = {
  tenantId: string;
  customerId: string;
  kind: "customer" | "transporter";
  shipmentIds?: string[];
};
const bindings = (): Record<string, Binding> =>
  JSON.parse(process.env.CONTACT_BINDINGS_JSON ?? "{}");
const social = new SocialMessagingClient({
  region: process.env.WHATSAPP_REGION || undefined,
  maxAttempts: 1,
});
export function matchesPhoneIdentity(arn: string, configured: string): boolean {
  if (!configured) return false;
  if (configured.startsWith("arn:")) return arn === configured;
  const match = arn.match(
    /^arn:[^:]+:social-messaging:[^:]+:\d{12}:phone-number-id\/([a-zA-Z0-9-]+)$/,
  );
  return !!match && match[1] === configured.replace(/^phone-number-id-/, "");
}
export function normalize(envelope: any) {
  const entry =
    typeof envelope.whatsAppWebhookEntry === "string"
      ? JSON.parse(envelope.whatsAppWebhookEntry)
      : envelope.whatsAppWebhookEntry;
  const entries = entry?.entry ?? (entry?.changes ? [entry] : []);
  return entries.flatMap((e: any) =>
    (e.changes ?? []).flatMap((c: any) =>
      (c.value?.messages ?? []).map((m: any) => ({
        from: m.from,
        messageId: m.id,
        timestamp: m.timestamp,
        type: m.type,
        text: m.text?.body ?? m[m.type]?.caption ?? "",
        media: m[m.type]?.id
          ? {
              id: m[m.type].id,
              mime: m[m.type].mime_type,
              name: m[m.type].filename ?? "WhatsApp attachment",
            }
          : undefined,
        metaPhoneId: c.value.metadata?.phone_number_id,
        phoneArns:
          envelope.context?.MetaPhoneNumberIds?.map((p: any) => p.arn) ?? [],
      })),
    ),
  );
}
export async function ingest(event: any) {
  for (const r of event.Records ?? []) {
    const envelope = JSON.parse(r.Sns.Message);
    for (const m of normalize(envelope)) {
      if (
        !process.env.WHATSAPP_PHONE_ID ||
        !m.phoneArns.some((a: string) =>
          matchesPhoneIdentity(a, process.env.WHATSAPP_PHONE_ID!),
        )
      )
        throw new Error("Unconfigured WhatsApp origination identity");
      if (
        process.env.WHATSAPP_META_PHONE_ID &&
        m.metaPhoneId !== process.env.WHATSAPP_META_PHONE_ID
      )
        throw new Error("Unexpected Meta phone identity");
      const b = bindings()[m.from];
      if (!b) {
        console.warn("whatsapp.unmapped_sender", { messageId: m.messageId });
        continue;
      }
      await new SQSClient({}).send(
        new SendMessageCommand({
          QueueUrl: process.env.INBOUND_QUEUE_URL,
          MessageBody: JSON.stringify({ ...m, binding: b }),
          MessageGroupId: b.tenantId + ":" + b.customerId,
          MessageDeduplicationId: m.messageId,
        }),
      );
    }
  }
}
export async function worker(event: any) {
  const failures: { itemIdentifier: string }[] = [];
  for (let index = 0; index < (event.Records ?? []).length; index++) {
    const record = event.Records[index];
    try {
      const m = JSON.parse(record.body);
      const b = m.binding as Binding;
      const currentBinding = bindings()[m.from];
      if (
        !currentBinding ||
        JSON.stringify(currentBinding) !== JSON.stringify(b)
      )
        throw new Error("Sender binding changed; review queued message");
      const state = await store.load(b.tenantId);
      if (state.processed.some((p) => p.id === m.messageId)) continue;
      if (!state.customers.some((c) => c.id === b.customerId))
        throw new Error("Bound customer not found");
      if (m.media) {
        const candidates = state.cases.filter(
          (c) =>
            c.customerId === b.customerId &&
            c.status !== "resolved" &&
            (b.kind === "customer" ||
              (c.shipmentId && b.shipmentIds?.includes(c.shipmentId))),
        );
        if (candidates.length !== 1) {
          await store.change(b.tenantId, (s) => {
            if (s.processed.some((p) => p.id === m.messageId)) return;
            if (b.kind === "customer")
              s.customers.find((c) => c.id === b.customerId)!.lastInboundAt =
                new Date(
                  Math.min(Date.now(), Number(m.timestamp) * 1000),
                ).toISOString();
            s.processed.push({ id: m.messageId, at: new Date().toISOString() });
            s.messages.push({
              id: m.messageId,
              customerId: b.customerId,
              direction: "inbound",
              text: "[Attachment received; matching needs staff review]",
              at: new Date().toISOString(),
              channel: "whatsapp",
            });
            audit(
              s,
              "whatsapp",
              "evidence.unmatched",
              "No unique authorized open case; attachment not auto-assigned",
              b.customerId,
            );
            s.outbox.push({
              id: id("send"),
              customerId: b.customerId,
              text: "The team needs a shipment reference to match this attachment. Please provide it; it has not been accepted as POD.",
              status: "pending",
              kind: "service",
              createdAt: new Date().toISOString(),
            });
          });
          continue;
        }
        // Retrieve into a quarantine prefix, enforce the application limit, then persist validated evidence.
        const client = new S3Client({
          region: process.env.WHATSAPP_REGION || undefined,
          requestChecksumCalculation: "WHEN_REQUIRED",
        });
        const mediaBucket =
          process.env.WHATSAPP_MEDIA_BUCKET ?? process.env.EVIDENCE_BUCKET!;
        // A signed PUT pins the exact object key. The prefix destination can add
        // a media extension, so deriving that final filename is unreliable.
        const prefix = `${b.tenantId}/incoming/${crypto.randomUUID()}/`;
        const tmp = prefix + m.media.id;
        const destinationUrl = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: mediaBucket,
            Key: tmp,
            ContentType: m.media.mime,
          }),
          { expiresIn: 300 },
        );
        await social.send(
          new GetWhatsAppMessageMediaCommand({
            mediaId: m.media.id,
            originationPhoneNumberId: process.env.WHATSAPP_PHONE_ID!,
            destinationS3PresignedUrl: {
              url: destinationUrl,
              headers: { "Content-Type": m.media.mime },
            },
          }),
        );
        let evidence;
        try {
          const object = await client.send(
            new GetObjectCommand({
              Bucket: mediaBucket,
              Key: tmp,
            }),
          );
          if ((object.ContentLength ?? Infinity) > 4 * 1024 * 1024)
            throw new Error("Media exceeds application limit");
          const bytes = Buffer.from(await object.Body!.transformToByteArray());
          evidence = await saveEvidence(
            b.tenantId,
            m.media.name,
            m.media.mime,
            bytes,
          );
        } finally {
          await client.send(
            new DeleteObjectCommand({
              Bucket: mediaBucket,
              Key: tmp,
            }),
          );
        }
        const target = candidates[0];
        await store.change(b.tenantId, (s) => {
          if (s.processed.some((p) => p.id === m.messageId)) return;
          const latest = s.cases.find((c) => c.id === target.id)!;
          attach(
            s,
            {
              id: `whatsapp:${b.kind}`,
              tenantId: b.tenantId,
              role: "logistics",
            },
            target.id,
            evidence,
            latest.version,
          );
          s.processed.push({ id: m.messageId, at: new Date().toISOString() });
          s.messages.push({
            id: m.messageId,
            customerId: b.customerId,
            direction: "inbound",
            text: `[Evidence: ${evidence.name}]`,
            at: new Date().toISOString(),
            channel: "whatsapp",
            evidenceId: evidence.id,
          });
          if (b.kind === "customer")
            s.customers.find((c) => c.id === b.customerId)!.lastInboundAt =
              new Date(
                Math.min(Date.now(), Number(m.timestamp) * 1000),
              ).toISOString();
          s.outbox.push({
            id: id("send"),
            customerId: b.customerId,
            text: "Document received and attached to the case. It is awaiting staff review; delivery acceptance has not changed.",
            status: "pending",
            kind: "service",
            createdAt: new Date().toISOString(),
          });
        });
      } else if (b.kind === "customer") {
        const result = await interpret(m.text, state, b.customerId);
        await store.change(b.tenantId, (s) =>
          receive(s, {
            customerId: b.customerId,
            text: m.text,
            messageId: m.messageId,
            channel: "whatsapp",
            inboundAt: new Date(
              Math.min(Date.now(), Number(m.timestamp) * 1000),
            ).toISOString(),
            ...result,
          }),
        );
      } else {
        await store.change(b.tenantId, (s) => {
          if (s.processed.some((p) => p.id === m.messageId)) return;
          s.processed.push({ id: m.messageId, at: new Date().toISOString() });
          audit(
            s,
            "whatsapp:transporter",
            "transporter.note",
            "Transporter text needs staff review; it cannot act as the customer",
            b.customerId,
          );
          s.messages.push({
            id: m.messageId,
            customerId: b.customerId,
            text: `Transporter note: ${m.text}`,
            at: new Date().toISOString(),
            direction: "inbound",
            channel: "whatsapp",
          });
        });
      }
    } catch (e) {
      console.error("inbound.failed", {
        id: record.messageId,
        error: (e as Error).message,
      });
      for (const unprocessed of event.Records.slice(index))
        failures.push({ itemIdentifier: unprocessed.messageId });
      break;
    }
  }
  return { batchItemFailures: failures };
}
export async function sender() {
  if (!process.env.WHATSAPP_PHONE_ID || !process.env.META_API_VERSION)
    return { configured: false };
  const map = bindings();
  let sent = 0;
  for (const tenant of (process.env.TENANT_IDS ?? "demofoods").split(",")) {
    const state = await store.load(tenant);
    for (const queued of state.outbox
      .filter((o) => o.status === "pending")
      .slice(0, 10)) {
      let claimed = false;
      let destination = "";
      let template = "";
      await store.change(tenant, (s) => {
        const o = s.outbox.find((x) => x.id === queued.id)!;
        if (o.status !== "pending") return;
        const c = s.customers.find((x) => x.id === o.customerId)!;
        if (
          o.kind === "followup" &&
          (!c.consent ||
            c.paused ||
            s.cases.some(
              (x) => x.customerId === c.id && x.status !== "resolved",
            ))
        ) {
          o.status = "suppressed";
          audit(
            s,
            "sender",
            "followup.suppressed",
            "Consent or service case changed before send",
            c.id,
          );
          return;
        }
        destination =
          Object.entries(map).find(
            ([, b]) =>
              b.kind === "customer" &&
              b.tenantId === tenant &&
              b.customerId === c.id,
          )?.[0] ?? "";
        if (!destination) return;
        const windowOpen =
          c.lastInboundAt &&
          Date.now() - Date.parse(c.lastInboundAt) < 24 * 3600000;
        if (!windowOpen) {
          template =
            (o.kind === "followup"
              ? process.env.FOLLOWUP_TEMPLATE
              : process.env.SERVICE_TEMPLATE) ?? "";
          if (!template || !c.consent) return;
        }
        o.status = "sending";
        claimed = true;
      });
      if (!claimed) continue;
      try {
        const payload = {
          messaging_product: "whatsapp",
          to: destination.startsWith("+") ? destination : "+" + destination,
          ...(template
            ? {
                type: "template",
                template: {
                  name: template,
                  language: { code: process.env.TEMPLATE_LANGUAGE ?? "en" },
                  components: [
                    {
                      type: "body",
                      parameters: [{ type: "text", text: queued.text }],
                    },
                  ],
                },
              }
            : { type: "text", text: { body: queued.text } }),
        };
        const response = await social.send(
          new SendWhatsAppMessageCommand({
            originationPhoneNumberId: process.env.WHATSAPP_PHONE_ID,
            message: Buffer.from(JSON.stringify(payload)),
            metaApiVersion: process.env.META_API_VERSION!,
          }),
        );
        await store.change(tenant, (s) => {
          const o = s.outbox.find((x) => x.id === queued.id)!;
          o.status = "sent";
          o.providerId = response.messageId;
          audit(
            s,
            "sender",
            "whatsapp.accepted",
            "Provider accepted the message; recipient delivery is not yet confirmed",
            o.customerId,
            o.id,
          );
        });
        sent++;
      } catch (e) {
        await store.change(tenant, (s) => {
          const o = s.outbox.find((x) => x.id === queued.id)!;
          o.status = "uncertain";
          o.error = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 1000);
          audit(
            s,
            "sender",
            "whatsapp.outcome_uncertain",
            "Inspect provider status before retrying; no blind resend",
            o.customerId,
            o.id,
          );
        });
      }
    }
  }
  return { configured: true, sent };
}
export async function emailSummary(tenant: string) {
  if (!process.env.SES_FROM || !process.env.SES_TO)
    throw new Error(
      "SES sender and verified test recipient are not configured",
    );
  const s = await store.load(tenant);
  return new SESv2Client({}).send(
    new SendEmailCommand({
      FromEmailAddress: process.env.SES_FROM,
      Destination: { ToAddresses: [process.env.SES_TO] },
      Content: {
        Simple: {
          Subject: { Data: "TradeLoop synthetic workspace summary" },
          Body: {
            Text: {
              Data: `SYNTHETIC DEMO DATA\nBusiness: ${s.business.name}\nOpen cases: ${s.cases.filter((c) => c.status !== "resolved").length}\nOrder requests: ${s.requests.length}\nNo credit, replacement, or stock reservation was executed.\nReview the staff dashboard for evidence and approved actions.`,
            },
          },
        },
      },
    }),
  );
}
