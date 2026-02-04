import JSZip from 'jszip';

export interface R2Config {
  enabled: boolean;
  app: string;
  url: string;
  token: string;
}

const buildUrl = (config: R2Config, entity: string) => {
  const base = config.url.replace(/\/+$/, '');
  const app = config.app.replace(/^\/+|\/+$/g, '');
  const path = entity.replace(/^\/+/, '');
  return `${base}/${app}/${path}.zip`;
};

export class R2SyncManager {
  private static async zipContent(content: string, filename: string): Promise<Blob> {
    const zip = new JSZip();
    zip.file(filename, content);
    return zip.generateAsync({ type: 'blob' });
  }

  private static async unzipFirst(blob: Blob): Promise<string | null> {
    const zip = new JSZip();
    const contents = await zip.loadAsync(blob);
    const files = Object.keys(contents.files);
    if (files.length === 0) return null;
    return contents.files[files[0]].async('string');
  }

  static async upload<T>(data: T, config: R2Config, entity = 'backup'): Promise<void> {
    if (!config.enabled) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const zipContent = await this.zipContent(payload, `${entity}.json`);
    await fetch(buildUrl(config, entity), {
      method: 'PUT',
      headers: {
        'X-Custom-Auth-Key': config.token,
      },
      body: zipContent,
    });
  }

  static async download<T>(config: R2Config, entity = 'backup'): Promise<T | null> {
    if (!config.enabled) return null;
    try {
      const response = await fetch(buildUrl(config, entity), {
        headers: {
          'X-Custom-Auth-Key': config.token,
        },
      });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const zipBlob = await response.blob();
      const content = await this.unzipFirst(zipBlob);
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('404')) {
        console.warn('R2 download failed:', error);
      }
      return null;
    }
  }

  static async downloadText(config: R2Config, entity: string): Promise<string | null> {
    if (!config.enabled) return null;
    try {
      const response = await fetch(buildUrl(config, entity), {
        headers: {
          'X-Custom-Auth-Key': config.token,
        },
      });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const zipBlob = await response.blob();
      return await this.unzipFirst(zipBlob);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('404')) {
        console.warn('R2 download failed:', error);
      }
      return null;
    }
  }
}
