import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { R2SyncManager } from '../utils/r2Sync';
import { AppSettings, LocalStorageData } from '../types';
import { Upload, Download, Save, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { getDefaultTemplates } from '../utils/promptTemplates';
import { checkHealth } from '../utils/aiClient';
import { AILogEntry, downloadLog } from '../utils/aiLogs';

export const StoragePage: React.FC = () => {
  const { settings, dispatch, ...appData } = useAppContext();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<AILogEntry[]>([]);

  const [formData, setFormData] = useState<AppSettings>(() => ({
    ...settings,
    aiConfig: {
      ...settings.aiConfig,
      templates: settings.aiConfig?.templates?.text && settings.aiConfig?.templates?.image
        ? settings.aiConfig.templates
        : getDefaultTemplates(),
    },
    r2Config: settings.r2Config || {
      enabled: false,
      app: '',
      url: '',
      token: '',
    },
  }));

  useEffect(() => {
    setFormData({
      ...settings,
      aiConfig: {
        ...settings.aiConfig,
        templates: settings.aiConfig?.templates?.text && settings.aiConfig?.templates?.image
          ? settings.aiConfig.templates
          : getDefaultTemplates(),
      },
      r2Config: settings.r2Config || {
        enabled: false,
        app: '',
        url: '',
        token: '',
      },
    });
  }, [settings]);

  const buildConfigPayload = (data: AppSettings) => {
    const { r2Config, ...rest } = data;
    return rest;
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', payload: formData });
    try {
      if (formData.r2Config?.enabled && formData.r2Config?.url && formData.r2Config?.app && formData.r2Config?.token) {
        await R2SyncManager.uploadJson(buildConfigPayload(formData), formData.r2Config, 'config');
      }
      setMessage({ type: 'success', text: t('settings.saved') });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      setMessage({ type: 'error', text: `${t('settings.r2.fail')}: ${messageText}` });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpload = async () => {
    if (!formData.r2Config?.enabled || !formData.r2Config?.url || !formData.r2Config?.app || !formData.r2Config?.token) {
      setMessage({ type: 'error', text: t('settings.r2.fail') });
      return;
    }
    setLoading(true);
    try {
      const dataToUpload: LocalStorageData = {
        ...appData,
        settings: formData, // Use latest settings
      };
      await R2SyncManager.upload(dataToUpload, formData.r2Config, 'backup');
      setMessage({ type: 'success', text: t('settings.r2.success') });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      setMessage({ type: 'error', text: `${t('settings.r2.fail')}: ${messageText}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!formData.r2Config?.enabled || !formData.r2Config?.url || !formData.r2Config?.app || !formData.r2Config?.token) {
      setMessage({ type: 'error', text: t('settings.r2.fail') });
      return;
    }
    setLoading(true);
    try {
      const data = await R2SyncManager.download<LocalStorageData>(formData.r2Config, 'backup');
      if (data) {
        const currentTimestamp = appData.lastUpdated;
        if (data.lastUpdated && new Date(data.lastUpdated) <= new Date(currentTimestamp)) {
          if (!confirm(t('settings.r2.overwriteConfirm'))) {
            setLoading(false);
            return;
          }
        }
        dispatch({ type: 'SET_DATA', payload: data });
        setFormData({
          ...data.settings,
          aiConfig: {
            ...data.settings.aiConfig,
            templates: data.settings.aiConfig?.templates?.text && data.settings.aiConfig?.templates?.image
              ? data.settings.aiConfig.templates
              : getDefaultTemplates(),
          },
        });
      }
      setMessage({ type: 'success', text: t('settings.r2.success') });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      setMessage({ type: 'error', text: `${t('settings.r2.fail')}: ${messageText}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckAI = async () => {
    setAiChecking(true);
    try {
      const ok = await checkHealth(formData.aiConfig.baseUrl, formData.aiConfig.token);
      setAiStatus(ok ? 'ok' : 'fail');
    } finally {
      setAiChecking(false);
      setTimeout(() => setAiStatus('idle'), 3000);
    }
  };

  const handleLoadLogs = async () => {
    setLogsLoading(true);
    try {
      const entries = await downloadLog(logDate, formData.r2Config);
      setLogs(entries);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('page.storage')}</h1>

      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.r2.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="r2Enabled"
              checked={formData.r2Config?.enabled || false}
              onChange={e => setFormData({ ...formData, r2Config: { ...formData.r2Config!, enabled: e.target.checked } })}
              className="rounded border-gray-300 text-green-600 focus:ring-green-600"
            />
            <label htmlFor="r2Enabled" className="text-sm font-medium text-gray-700">{t('settings.r2.enable')}</label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t('settings.r2.app')}
              value={formData.r2Config?.app || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, app: e.target.value } 
              })}
              placeholder="personal-accounting"
            />
            <Input
              label={t('settings.r2.url')}
              value={formData.r2Config?.url || ''}
              onChange={e => setFormData({ 
                ...formData, 
                r2Config: { ...formData.r2Config!, url: e.target.value } 
              })}
              placeholder="https://your-r2-gateway"
            />
          </div>
          <Input
            label={t('settings.r2.token')}
            type="password"
            value={formData.r2Config?.token || ''}
            onChange={e => setFormData({ 
              ...formData, 
              r2Config: { ...formData.r2Config!, token: e.target.value } 
            })}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Button onClick={handleUpload} disabled={loading || !formData.r2Config?.enabled} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t('settings.r2.syncNow')}
            </Button>
            <Button onClick={handleDownload} disabled={loading || !formData.r2Config?.enabled} variant="secondary" className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t('settings.r2.pullLatest')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSaveSettings}>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.general')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={t('settings.mainCurrency')}
              value={formData.mainCurrency}
              onChange={e => setFormData({ ...formData, mainCurrency: e.target.value.toUpperCase() })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.language')}</label>
              <select
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
                value={formData.language}
                onChange={e => setFormData({ ...formData, language: e.target.value === 'en' ? 'en' : 'zh' })}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('settings.ai.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="aiEnabled"
                checked={formData.aiConfig.enabled}
                onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, enabled: e.target.checked } })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-600"
              />
              <label htmlFor="aiEnabled" className="text-sm font-medium text-gray-700">{t('settings.ai.enable')}</label>
            </div>
            <Input
              label={t('settings.ai.baseUrl')}
              value={formData.aiConfig.baseUrl}
              onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, baseUrl: e.target.value } })}
              placeholder="http://localhost:8000"
            />
            <Input
              label={t('settings.ai.token')}
              type="password"
              value={formData.aiConfig.token}
              onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, token: e.target.value } })}
            />
            <Input
              label={t('settings.ai.model')}
              value={formData.aiConfig.model || ''}
              onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, model: e.target.value } })}
              placeholder="gpt-4"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.ai.logMode')}</label>
              <select
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
                value={formData.aiConfig.logImageMode}
                onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, logImageMode: e.target.value as 'metadata' | 'full' } })}
              >
                <option value="metadata">{t('settings.ai.logMode.metadata')}</option>
                <option value="full">{t('settings.ai.logMode.full')}</option>
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Button type="button" variant="secondary" onClick={handleCheckAI} disabled={aiChecking}>
                {aiChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('settings.ai.connection')}
              </Button>
              {aiStatus !== 'idle' && (
                <div className={`text-sm font-medium ${aiStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                  {aiStatus === 'ok' ? t('settings.ai.connection.ok') : t('settings.ai.connection.fail')}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.ai.templateText')}</label>
              <textarea
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent min-h-[160px]"
                value={formData.aiConfig.templates.text}
                onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, templates: { ...formData.aiConfig.templates, text: e.target.value } } })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.ai.templateImage')}</label>
              <textarea
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent min-h-[160px]"
                value={formData.aiConfig.templates.image}
                onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, templates: { ...formData.aiConfig.templates, image: e.target.value } } })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, templates: getDefaultTemplates() } })}
            >
              {t('settings.ai.templateReset')}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('settings.logs.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="secondary" onClick={() => setLogsOpen(true)}>
              {t('settings.logs.open')}
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end">
            <Button type="submit" size="lg">
                <Save className="mr-2 h-4 w-4" /> {t('common.save')}
            </Button>
        </div>
      </form>

      <Modal isOpen={logsOpen} onClose={() => setLogsOpen(false)} title={t('settings.logs.title')}>
        <div className="space-y-4">
          <Input
            label={t('settings.logs.date')}
            type="date"
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
          />
          <Button type="button" onClick={handleLoadLogs} disabled={logsLoading}>
            {logsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('settings.logs.load')}
          </Button>
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md p-3 text-xs bg-gray-50">
            {logs.length === 0 ? (
              <div className="text-gray-400">{t('settings.logs.empty')}</div>
            ) : (
              <pre className="whitespace-pre-wrap">{JSON.stringify(logs, null, 2)}</pre>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
