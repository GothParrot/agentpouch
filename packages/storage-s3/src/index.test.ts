import { before, it } from "node:test";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { runStorageConformanceSuite } from "@agentbox/testkit";
import { S3Storage } from "./index.js";

const {
  S3_ENDPOINT: endpoint,
  S3_BUCKET: rawBucket,
  S3_ACCESS_KEY_ID: accessKeyId,
  S3_SECRET_ACCESS_KEY: secretAccessKey,
  S3_REGION: rawRegion,
} = process.env;

const bucket = rawBucket ?? "agentbox-test";
const region = rawRegion ?? "us-east-1";

if (endpoint && accessKeyId && secretAccessKey) {
  const adminClient = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  before(async () => {
    try {
      await adminClient.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw err;
    }
  });

  runStorageConformanceSuite(
    "S3Storage (MinIO)",
    async () => new S3Storage({ bucket, endpoint, accessKeyId, secretAccessKey, region }),
    "redirect",
  );
} else {
  it("S3Storage — skipped (S3_ENDPOINT / credentials not set)", { skip: "env vars not set" }, () => {});
}
