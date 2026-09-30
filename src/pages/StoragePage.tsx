import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { AppSettings } from '../types';
import { Save, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { getDefaultTemplates } from '../utils/promptTemplates';
import { checkHealth } from '../utils/aiClient';
import { AICallLog, readRecentLogs } from '../utils/aiLogs';

export const StoragePage: React.FC = () => {
  const { settings, dispatch, syncError } = useAppContext();
  const { t } = useI18n();
  const [aiChecking, setAiChecking] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [aiStatusMessage, setAiStatusMessage] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [apiKeyGuideOpen, setApiKeyGuideOpen] = useState(false);
  const [logs, setLogs] = useState<AICallLog[]>([]);
  const [formData, setFormData] = useState<AppSettings>(() => ({
    ...settings,
    aiConfig: {
      ...settings.aiConfig,
      templates: settings.aiConfig?.templates?.text && settings.aiConfig?.templates?.image
        ? settings.aiConfig.templates
        : getDefaultTemplates(),
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
    });
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', payload: formData });
    setMessage({ type: 'success', text: t('settings.saved') });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCheckAI = async () => {
    setAiChecking(true);
    setAiStatus('idle');
    setAiStatusMessage('');
    try {
      const result = await checkHealth(
        formData.aiConfig.apiUrl,
        formData.aiConfig.token,
        [formData.aiConfig.textModel, formData.aiConfig.imageModel],
      );
      setAiStatus(result.ok ? 'ok' : 'fail');
      setAiStatusMessage(result.message);
    } finally {
      setAiChecking(false);
    }
  };

  const handleOpenLogs = () => {
    setLogs(readRecentLogs());
    setLogsOpen(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('page.storage')}</h1>

      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}
      {syncError && <div className="p-4 rounded-md bg-amber-50 text-amber-800">云端保存暂时失败，页面已重新同步：{syncError}</div>}

      <form onSubmit={handleSaveSettings}>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.general')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Input
              label={t('settings.mainCurrency')}
              value={formData.mainCurrency}
              onChange={e => setFormData({ ...formData, mainCurrency: e.target.value.toUpperCase() })}
            />
            <div className="min-w-0">
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
              label={t('settings.ai.token')}
              type="password"
              value={formData.aiConfig.token}
              onChange={e => setFormData({ ...formData, aiConfig: { ...formData.aiConfig, token: e.target.value } })}
            />
            <button
              type="button"
              className="text-sm font-medium text-green-700 hover:text-green-800 hover:underline"
              onClick={() => setApiKeyGuideOpen(true)}
            >
              {t('settings.ai.freeKey')}
            </button>
            <div className="grid gap-4 md:grid-cols-2">
              <Button type="button" variant="secondary" onClick={handleCheckAI} disabled={aiChecking}>
                {aiChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('settings.ai.connection')}
              </Button>
              {aiStatus !== 'idle' && (
                <div className={`text-sm font-medium self-center ${aiStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                  <div>{aiStatus === 'ok' ? t('settings.ai.connection.ok') : t('settings.ai.connection.fail')}</div>
                  {aiStatusMessage && <div className="font-normal mt-1 break-all">{aiStatusMessage}</div>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('settings.logs.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">{t('settings.logs.description')}</p>
            <Button type="button" variant="secondary" onClick={handleOpenLogs}>
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

      <Modal isOpen={apiKeyGuideOpen} onClose={() => setApiKeyGuideOpen(false)} title={t('settings.ai.keyGuide.title')}>
        <div className="space-y-4 text-sm text-gray-700">
          <ol className="list-decimal space-y-3 pl-5">
            <li>{t('settings.ai.keyGuide.step1')}</li>
            <li>{t('settings.ai.keyGuide.step2')}</li>
            <li>{t('settings.ai.keyGuide.step3')}</li>
            <li>{t('settings.ai.keyGuide.step4')}</li>
          </ol>
          <div className="rounded-md bg-amber-50 p-3 text-amber-800">
            {t('settings.ai.keyGuide.notice')}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setApiKeyGuideOpen(false)}>
              {t('common.close')}
            </Button>
            <a
              href="https://open.bigmodel.cn/usercenter/apikeys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-green-700"
            >
              {t('settings.ai.keyGuide.open')}
            </a>
          </div>
        </div>
      </Modal>

      <Modal isOpen={logsOpen} onClose={() => setLogsOpen(false)} title={t('settings.logs.title')}>
        <div className="max-h-[65vh] overflow-y-auto space-y-3">
            {logs.length === 0 ? (
              <div className="text-gray-400 text-sm py-6 text-center">{t('settings.logs.empty')}</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{log.type === 'image' ? t('settings.logs.image') : t('settings.logs.text')}</span>
                    <span className={log.status === 'success' ? 'text-green-600' : log.status === 'error' ? 'text-red-600' : 'text-amber-600'}>
                      {t(`settings.logs.status.${log.status}`)}
                    </span>
                  </div>
                  <div className="text-gray-500">{new Date(log.startedAt).toLocaleString()}</div>
                  <div>
                    <div className="font-medium text-gray-600 mb-1">{t('settings.logs.input')}</div>
                    <pre className="whitespace-pre-wrap break-all">{typeof log.input === 'string' ? log.input : JSON.stringify(log.input, null, 2)}</pre>
                  </div>
                  {log.response !== undefined && (
                    <div>
                      <div className="font-medium text-gray-600 mb-1">{t('settings.logs.response')}</div>
                      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.response, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))
            )}
        </div>
      </Modal>
    </div>
  );
};
