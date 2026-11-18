import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";
import type { Config } from "./config";

/** Maximum number of keys accepted by a single DeleteObjects call. */
const DELETE_BATCH_SIZE = 1000;

/** Build an S3 client configured with an explicit custom endpoint. */
export function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * List every object key in a bucket, following pagination.
 *
 * @returns The object keys, in the order returned by the server.
 */
export async function listObjectKeys(
  client: S3Client,
  bucket: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (object.Key !== undefined) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken !== undefined);

  return keys;
}

/**
 * Delete the given object keys from a bucket, in batches.
 *
 * @returns The keys the server reported as failed to delete.
 */
export async function deleteObjectKeys(
  client: S3Client,
  bucket: string,
  keys: string[],
): Promise<string[]> {
  const failed: string[] = [];

  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    const objects: ObjectIdentifier[] = batch.map((Key) => ({ Key }));

    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );

    for (const error of response.Errors ?? []) {
      if (error.Key !== undefined) {
        failed.push(error.Key);
      }
    }
  }

  return failed;
}
