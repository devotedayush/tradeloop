import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  TextractClient,
  DetectDocumentTextCommand,
} from "@aws-sdk/client-textract";
import { DomainError, id, type Evidence } from "../core/types";
const s3 = new S3Client({});
export async function saveEvidence(
  tenant: string,
  name: string,
  mime: string,
  bytes: Buffer,
): Promise<Evidence> {
  if (bytes.length > 4 * 1024 * 1024)
    throw new DomainError(413, "Demo supports files up to 4 MB");
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216;
  const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
  if (!(
    (mime === "image/png" && png) ||
    (mime === "image/jpeg" && jpg) ||
    (mime === "application/pdf" && pdf)
  ))
    throw new DomainError(400, "Upload a valid PNG, JPEG, or PDF");
  const eid = id("DOC");
  const key = `${tenant}/${eid}`;
  const e: Evidence = {
    id: eid,
    name: name.slice(0, 150),
    key,
    mime,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    extraction: "manual",
    kind: "attachment",
    createdAt: new Date().toISOString(),
  };
  if (process.env.EVIDENCE_BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.EVIDENCE_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mime,
      }),
    );
    try {
      const result = await new TextractClient({}).send(
        new DetectDocumentTextCommand({
          Document: {
            S3Object: { Bucket: process.env.EVIDENCE_BUCKET, Name: key },
          },
        }),
      );
      e.extractedText = result.Blocks?.filter((x) => x.BlockType === "LINE")
        .map((x) => x.Text)
        .join("\n");
      e.extraction = "extracted";
    } catch {
      e.extraction = "manual";
    }
  } else {
    await mkdir(".runtime/evidence/" + tenant, { recursive: true });
    await writeFile(".runtime/evidence/" + key, bytes);
  }
  return e;
}
export async function evidenceUrl(e: Evidence) {
  return process.env.EVIDENCE_BUCKET
    ? getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.EVIDENCE_BUCKET,
          Key: e.key,
        }),
        { expiresIn: 120 },
      )
    : `/api/evidence/${e.id}`;
}
export async function localEvidence(e: Evidence) {
  return readFile(".runtime/evidence/" + e.key);
}
