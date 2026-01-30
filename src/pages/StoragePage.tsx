import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { R2SyncManager } from '../utils/r2';
import { AppSettings, LocalStorageData } from '../types';
import { Upload, Download, Save, Loader2 } from 'lucide-react';

export const StoragePage: React.FC = () => {
  const { settings, dispatch, ...appData } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [formData, setFormData] = useState<AppSettings>(() => ({
    ...settings,
    r2Config: settings.r2Config || {
        endpoint: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucket: ''
    }
  }));

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', payload: formData });
    setMessage({ type: 'success', text: 'Settings saved successfully' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpload = async () => {
    if (!formData.r2Config?.endpoint || !formData.r2Config?.bucket) {
      setMessage({ type: 'error', text: 'Please configure R2 settings first' });
      return;
    }
    setLoading(true);
    try {
      const dataToUpload: LocalStorageData = {
        ...appData,
        settings: formData, // Use latest settings
      };
      await R2SyncManager.upload(dataToUpload, formData.r2Config);
      setMessage({ type: 'success', text: 'Data uploaded successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Upload failed: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!formData.r2Config?.endpoint || !formData.r2Config?.bucket) {
      setMessage({ type: 'error', text: 'Please configure R2 settings first' });
      return;
    }
    setLoading(true);
    try {
      const latestTimestamp = await R2SyncManager.getLatestTimestamp(formData.r2Config);
      if (latestTimestamp) {
          const currentTimestamp = appData.lastUpdated;
          if (new Date(latestTimestamp) <= new Date(currentTimestamp)) {
              if (!confirm('Cloud data is older or same as local data. Overwrite local data anyway?')) {
                  setLoading(false);
                  return;
              }
          }
      }

      const data = await R2SyncManager.download(formData.r2Config);
      dispatch({ type: 'SET_DATA', payload: data });
      // Update form data with downloaded settings
      setFormData({
          ...data.settings,
          r2Config: data.settings.r2Config || {
            endpoint: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucket: ''
        }
      });
      setMessage({ type: 'success', text: 'Data downloaded and applied successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Download failed: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Storage & Settings</h1>

      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cloudflare R2 Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Button onClick={handleUpload} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload to Cloud
            </Button>
            <Button onClick={handleDownload} disabled={loading} variant="secondary" className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download from Cloud
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSaveSettings}>
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Main Currency"
              value={formData.mainCurrency}
              onChange={e => setFormData({ ...formData, mainCurrency: e.target.value.toUpperCase() })}
            />
            
            <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="aiAccounting"
                  checked={formData.aiAccounting}
                  onChange={e => setFormData({ ...formData, aiAccounting: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                />
                <label htmlFor="aiAccounting" className="text-sm font-medium text-gray-700">Enable AI Accounting</label>
            </div>

            {formData.aiAccounting && (
                <Input
                  label="Gemini API Token"
                  type="password"
                  value={formData.geminiToken || ''}
                  onChange={e => setFormData({ ...formData, geminiToken: e.target.value })}
                  placeholder="Enter your Gemini API Token"
                />
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>R2 Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Endpoint"
              value={formData.r2Config?.endpoint || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, endpoint: e.target.value } 
              })}
              placeholder="https://<accountid>.r2.cloudflarestorage.com"
            />
            <Input
              label="Bucket Name"
              value={formData.r2Config?.bucket || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, bucket: e.target.value } 
              })}
            />
            <Input
              label="Access Key ID"
              value={formData.r2Config?.accessKeyId || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, accessKeyId: e.target.value } 
              })}
            />
            <Input
              label="Secret Access Key"
              type="password"
              value={formData.r2Config?.secretAccessKey || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, secretAccessKey: e.target.value } 
              })}
            />
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end">
            <Button type="submit" size="lg">
                <Save className="mr-2 h-4 w-4" /> Save Settings
            </Button>
        </div>
      </form>
    </div>
  );
};
