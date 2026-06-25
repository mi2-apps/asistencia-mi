import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const isS3Configured =
  !!(process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.BUCKET_NAME);

export const s3 = isS3Configured
  ? new S3Client({
      endpoint:        process.env.AWS_ENDPOINT_URL_S3,
      region:          process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true, // required for MinIO path-style URLs
    })
  : null;

export const BUCKET     = process.env.BUCKET_NAME ?? "";
export const PUBLIC_BASE = (process.env.BUCKET_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

export async function uploadFoto(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (!s3 || !isS3Configured) throw new Error("S3 not configured");
  await s3.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: contentType,
    }),
  );
  return `${PUBLIC_BASE}/${key}`;
}
