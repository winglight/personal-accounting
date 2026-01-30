import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { LocalStorageData, AppSettings } from '../types';
import { DataCompressor } from './compression';

export class R2SyncManager {
  private static getClient(config: NonNullable<AppSettings['r2Config']>) {
    return new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  static async upload(data: LocalStorageData, config: NonNullable<AppSettings['r2Config']>): Promise<void> {
    const client = this.getClient(config);
    const blob = await DataCompressor.compress(data);
    const arrayBuffer = await blob.arrayBuffer();
    
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: 'backup.zip',
      Body: new Uint8Array(arrayBuffer),
      ContentType: 'application/zip',
    }));
  }

  static async download(config: NonNullable<AppSettings['r2Config']>): Promise<LocalStorageData> {
    const client = this.getClient(config);
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: 'backup.zip',
    }));
    
    if (!response.Body) throw new Error('No data found');
    
    // Convert SDK stream to Blob
    // @ts-ignore
    const blob = await new Response(response.Body).blob();
    return DataCompressor.decompress(blob);
  }

  static async getLatestTimestamp(config: NonNullable<AppSettings['r2Config']>): Promise<string | null> {
    const client = this.getClient(config);
    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: 'backup.zip',
      }));
      return response.LastModified?.toISOString() || null;
    } catch (e) {
      return null;
    }
  }
}
