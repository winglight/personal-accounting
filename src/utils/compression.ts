import JSZip from 'jszip';
import { CompressedDataPackage, LocalStorageData } from '../types';

export class DataCompressor {
  static async compress(data: LocalStorageData): Promise<Blob> {
    const zip = new JSZip();
    const packageData: CompressedDataPackage = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data,
      checksum: '', // TODO: Implement checksum if needed
    };
    
    zip.file('data.json', JSON.stringify(packageData));
    return await zip.generateAsync({ type: 'blob' });
  }

  static async decompress(blob: Blob): Promise<LocalStorageData> {
    const zip = new JSZip();
    const unzipped = await zip.loadAsync(blob);
    const file = unzipped.file('data.json');
    if (!file) throw new Error('Invalid data package: data.json not found');
    
    const content = await file.async('string');
    const packageData = JSON.parse(content) as CompressedDataPackage;
    return packageData.data;
  }
}
