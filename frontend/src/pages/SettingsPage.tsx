import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Plus, Trash2, Plug, CheckCircle, XCircle,
  Loader2, Eye, EyeOff, RefreshCw, Server, Edit2, Mic, Volume2,
} from 'lucide-react';
import { llmProviderApi } from '../api/llmProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import type {
  ProviderItem, CreateProviderRequest, UpdateProviderRequest,
  ProviderTestResult, AsrConfig, TtsConfig, AsrConfigRequest, TtsConfigRequest,
} from '../types/llmProvider';

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formId, setFormId] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formEmbeddingModel, setFormEmbeddingModel] = useState('');
  const [formTemperature, setFormTemperature] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingDefaultProviderId, setPendingDefaultProviderId] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);

  // Voice config state
  const [asrConfig, setAsrConfig] = useState<AsrConfig | null>(null);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState<'asr' | 'tts' | null>(null);
  const [testingAsr, setTestingAsr] = useState(false);
  const [asrTestResult, setAsrTestResult] = useState<ProviderTestResult | null>(null);
  const [voiceSaving, setVoiceSaving] = useState(false);

  // ASR/TTS form fields
  const [asrForm, setAsrForm] = useState<AsrConfigRequest>({});
  const [ttsForm, setTtsForm] = useState<TtsConfigRequest>({});

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const isGlobalDefaultProvider = useCallback((providerId: string) => (
    defaultProviderId === providerId
  ), [defaultProviderId]);

  const loadData = useCallback(async () => {
    try {
      const [providerList, defaultProvider, asr, tts] = await Promise.all([
        llmProviderApi.list(),
        llmProviderApi.getDefaultProvider(),
        llmProviderApi.getAsrConfig(),
        llmProviderApi.getTtsConfig(),
      ]);
      setProviders(providerList);
      setDefaultProviderId(defaultProvider.defaultProvider);
      setAsrConfig(asr);
      setTtsConfig(tts);
    } catch (err) {
      console.error('Failed to load settings:', err);
      showToast('加载数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Modal helpers ---
  const openCreateModal = () => {
    setEditingProvider(null);
    setFormId('');
    setFormBaseUrl('');
    setFormApiKey('');
    setFormModel('');
    setFormEmbeddingModel('');
    setShowApiKey(false);
    setShowModal(true);
  };

  const openEditModal = (provider: ProviderItem) => {
    setEditingProvider(provider);
    setFormId(provider.id);
    setFormBaseUrl(provider.baseUrl);
    setFormApiKey('');
    setFormModel(provider.model);
    setFormEmbeddingModel(provider.embeddingModel || '');
    setFormTemperature(provider.temperature != null ? String(provider.temperature) : '');
    setShowApiKey(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProvider(null);
  };

  // --- CRUD handlers ---
  const handleCreate = async () => {
    if (!formId.trim() || !formBaseUrl.trim() || !formApiKey.trim() || !formModel.trim()) {
      showToast('请填写必填字段', 'error');
      return;
    }
    setSaving(true);
    try {
      const data: CreateProviderRequest = {
        id: formId.trim(),
        baseUrl: formBaseUrl.trim(),
        apiKey: formApiKey.trim(),
        model: formModel.trim(),
      };
      if (formEmbeddingModel.trim()) {
        data.embeddingModel = formEmbeddingModel.trim();
      }
      if (formTemperature.trim()) {
        const temp = parseFloat(formTemperature.trim());
        if (!isNaN(temp)) data.temperature = temp;
      }
      await llmProviderApi.create(data);
      showToast('Provider 创建成功');
      closeModal();
      await loadData();
    } catch (err) {
      console.error('Failed to create provider:', err);
      showToast(err instanceof Error ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingProvider) return;
    if (!formBaseUrl.trim() || !formModel.trim()) {
      showToast('请填写必填字段', 'error');
      return;
    }
    setSaving(true);
    try {
      const data: UpdateProviderRequest = {
        baseUrl: formBaseUrl.trim(),
        model: formModel.trim(),
        embeddingModel: formEmbeddingModel.trim(),
      };
      if (formApiKey.trim()) {
        data.apiKey = formApiKey.trim();
      }
      if (formTemperature.trim()) {
        const temp = parseFloat(formTemperature.trim());
        if (!isNaN(temp)) data.temperature = temp;
      }
      await llmProviderApi.update(editingProvider.id, data);
      showToast('Provider 更新成功');
      closeModal();
      await loadData();
    } catch (err) {
      console.error('Failed to update provider:', err);
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await llmProviderApi.delete(deleteConfirmId);
      showToast('Provider 已删除');
      setDeleteConfirmId(null);
      await loadData();
    } catch (err) {
      console.error('Failed to delete provider:', err);
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await llmProviderApi.test(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      console.error('Test failed:', err);
      setTestResults(prev => ({
        ...prev,
        [id]: {
          success: false,
          message: err instanceof Error ? err.message : '连接测试失败',
          model: '',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleSetDefault = async (providerId: string) => {
    setPendingDefaultProviderId(providerId);
  };

  const handleConfirmSetDefault = async () => {
    if (!pendingDefaultProviderId) {
      return;
    }
    setSettingDefault(true);
    try {
      await llmProviderApi.updateDefaultProvider({ defaultProvider: pendingDefaultProviderId });
      showToast(`已将 "${pendingDefaultProviderId}" 设为默认文字服务`);
      setPendingDefaultProviderId(null);
      await loadData();
    } catch (err) {
      console.error('Failed to set default:', err);
      showToast(err instanceof Error ? err.message : '设置默认 Provider 失败', 'error');
    } finally {
      setSettingDefault(false);
    }
  };

  const handleSaveModal = () => {
    if (editingProvider) {
      handleUpdate();
    } else {
      handleCreate();
    }
  };

  // --- Voice config handlers ---
  const openAsrModal = () => {
    if (!asrConfig) return;
    setAsrForm({
      url: asrConfig.url,
      model: asrConfig.model,
      language: asrConfig.language,
      format: asrConfig.format,
      sampleRate: asrConfig.sampleRate,
      enableTurnDetection: asrConfig.enableTurnDetection,
      turnDetectionType: asrConfig.turnDetectionType,
      turnDetectionThreshold: asrConfig.turnDetectionThreshold,
      turnDetectionSilenceDurationMs: asrConfig.turnDetectionSilenceDurationMs,
    });
    setShowVoiceModal('asr');
  };

  const openTtsModal = () => {
    if (!ttsConfig) return;
    setTtsForm({
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      format: ttsConfig.format,
      sampleRate: ttsConfig.sampleRate,
      mode: ttsConfig.mode,
      languageType: ttsConfig.languageType,
      speechRate: ttsConfig.speechRate,
      volume: ttsConfig.volume,
    });
    setShowVoiceModal('tts');
  };

  const handleSaveAsr = async () => {
    setVoiceSaving(true);
    try {
      await llmProviderApi.updateAsrConfig(asrForm);
      showToast('ASR 配置已更新');
      setShowVoiceModal(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setVoiceSaving(false);
    }
  };

  const handleSaveTts = async () => {
    setVoiceSaving(true);
    try {
      await llmProviderApi.updateTtsConfig(ttsForm);
      showToast('TTS 配置已更新');
      setShowVoiceModal(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setVoiceSaving(false);
    }
  };

  const handleTestAsr = async () => {
    setTestingAsr(true);
    setAsrTestResult(null);
    try {
      const result = await llmProviderApi.testAsr();
      setAsrTestResult(result);
    } catch (err) {
      setAsrTestResult({
        success: false,
        message: err instanceof Error ? err.message : '连接测试失败',
        model: '',
      });
    } finally {
      setTestingAsr(false);
    }
  };

  // --- Render ---
  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 shadow-lg shadow-primary-500/25">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">系统设置</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-sm">管理文字服务和模块配置</p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="providers"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
              {/* Provider header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  文字服务
                </h2>
                <motion.button
                  onClick={openCreateModal}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm
                    bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25
                    hover:from-primary-600 hover:to-primary-700 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  新增 Provider
                </motion.button>
              </div>

              {/* Provider grid */}
              {providers.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Server className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">暂无 Provider，点击上方按钮新增</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((provider, index) => {
                    const isGlobalDefault = isGlobalDefaultProvider(provider.id);

                    return (
                    <motion.div
                      key={provider.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg ${
                            isGlobalDefault
                              ? 'bg-primary-100 dark:bg-primary-900/30'
                              : 'bg-slate-100 dark:bg-slate-700'
                          }`}>
                            <Server className={`w-4 h-4 ${
                              isGlobalDefault
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                              {provider.id}
                            </h3>
                            {isGlobalDefault && (
                              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                                <Plug className="w-3 h-3" />
                                全局默认
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card details */}
                      <div className="space-y-1.5 mb-4 text-xs">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Base URL</span>
                          <span className="truncate" title={provider.baseUrl}>{provider.baseUrl}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Model</span>
                          <span className="truncate" title={provider.model}>{provider.model}</span>
                        </div>
                        {provider.embeddingModel && (
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Embed</span>
                            <span className="truncate" title={provider.embeddingModel}>{provider.embeddingModel}</span>
                          </div>
                        )}
                        {provider.temperature != null && (
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Temp</span>
                            <span>{provider.temperature}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">API Key</span>
                          <span className="font-mono">{provider.maskedApiKey}</span>
                        </div>
                      </div>

                      {/* Test result */}
                      {testResults[provider.id] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
                            testResults[provider.id].success
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {testResults[provider.id].success
                              ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            }
                            <span>{testResults[provider.id].message}</span>
                          </div>
                        </motion.div>
                      )}

                      {/* Card actions */}
                      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <button
                          onClick={() => openEditModal(provider)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleTest(provider.id)}
                          disabled={testingId === provider.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed"
                          title="测试连接"
                        >
                          {testingId === provider.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />
                          }
                          测试
                        </button>
                        <button
                          onClick={() => handleSetDefault(provider.id)}
                          disabled={isGlobalDefault || settingDefault}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors
                            disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                          title="设为默认文字服务"
                        >
                          <Plug className="w-3.5 h-3.5" />
                          设为默认
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(provider.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors
                            ml-auto"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Voice service cards */}
              <div className="mt-6">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
                  语音服务
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ASR Card */}
                  {asrConfig && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <Mic className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                              ASR 语音识别
                            </h3>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              语音服务
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 mb-4 text-xs">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">URL</span>
                          <span className="truncate" title={asrConfig.url}>{asrConfig.url}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Model</span>
                          <span className="truncate">{asrConfig.model}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Language</span>
                          <span>{asrConfig.language}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Sample</span>
                          <span>{asrConfig.sampleRate}Hz</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">API Key</span>
                          <span className="font-mono">{asrConfig.maskedApiKey}</span>
                        </div>
                      </div>

                      {asrTestResult && (
                        <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
                          asrTestResult.success
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            {asrTestResult.success
                              ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            }
                            <span>{asrTestResult.message}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <button
                          onClick={openAsrModal}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          编辑
                        </button>
                        <button
                          onClick={handleTestAsr}
                          disabled={testingAsr}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingAsr
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />
                          }
                          测试
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* TTS Card */}
                  {ttsConfig && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <Volume2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                              TTS 语音合成
                            </h3>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              语音服务
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 mb-4 text-xs">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Model</span>
                          <span className="truncate">{ttsConfig.model}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Voice</span>
                          <span>{ttsConfig.voice}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Sample</span>
                          <span>{ttsConfig.sampleRate}Hz</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">Volume</span>
                          <span>{ttsConfig.volume}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300 w-16 flex-shrink-0">API Key</span>
                          <span className="font-mono">{ttsConfig.maskedApiKey}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <button
                          onClick={openTtsModal}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          编辑
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6"
              >
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-5">
                  {editingProvider ? '编辑 Provider' : '新增 Provider'}
                </h3>

                <div className="space-y-4">
                  {/* Provider ID */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Provider ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      disabled={!!editingProvider}
                      placeholder="例如: dashscope, kimi, glm"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                        bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                        placeholder:text-slate-400 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50 focus:border-primary-400 transition-shadow
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Base URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                      placeholder="例如: https://api.openai.com/v1"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                        bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                        placeholder:text-slate-400 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                    />
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      API Key{' '}
                      {editingProvider && (
                        <span className="text-slate-400 font-normal">(留空则不修改)</span>
                      )}
                      {!editingProvider && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        placeholder={editingProvider ? '留空则保持原值' : '输入 API Key'}
                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-600
                          bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                          placeholder:text-slate-400 focus:outline-none focus:ring-2
                          focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400
                          hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formModel}
                      onChange={(e) => setFormModel(e.target.value)}
                      placeholder="例如: qwen3.5-flash, kimi-latest, glm-4-flash"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                        bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                        placeholder:text-slate-400 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                    />
                  </div>

                  {/* Embedding Model */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Embedding Model <span className="text-slate-400 font-normal">(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={formEmbeddingModel}
                      onChange={(e) => setFormEmbeddingModel(e.target.value)}
                      placeholder="例如: text-embedding-3-small"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                        bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                        placeholder:text-slate-400 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                    />
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Temperature <span className="text-slate-400 font-normal">(可选, 默认 0.2)</span>
                    </label>
                    <input
                      type="text"
                      value={formTemperature}
                      onChange={(e) => setFormTemperature(e.target.value)}
                      placeholder="例如: 0.2, 0.7, 1"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600
                        bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white
                        placeholder:text-slate-400 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
                    />
                  </div>
                </div>

                {/* Modal actions */}
                <div className="flex gap-3 justify-end mt-6">
                  <motion.button
                    onClick={closeModal}
                    disabled={saving}
                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-600
                      text-slate-600 dark:text-slate-300 rounded-xl font-medium text-sm
                      hover:bg-slate-50 dark:hover:bg-slate-700 transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    onClick={handleSaveModal}
                    disabled={saving}
                    className="px-5 py-2.5 text-white rounded-xl font-semibold text-sm
                      bg-gradient-to-r from-primary-500 to-primary-600
                      shadow-lg shadow-primary-500/25
                      hover:from-primary-600 hover:to-primary-700
                      transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        保存中...
                      </span>
                    ) : (
                      '保存'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Voice Edit Modal */}
      <AnimatePresence>
        {showVoiceModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVoiceModal(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
              >
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-5">
                  {showVoiceModal === 'asr' ? '编辑 ASR 语音识别' : '编辑 TTS 语音合成'}
                </h3>

                {showVoiceModal === 'asr' ? (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">连接配置</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">WebSocket URL</label>
                      <input type="text" value={asrForm.url || ''} onChange={(e) => setAsrForm(f => ({ ...f, url: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Model</label>
                        <input type="text" value={asrForm.model || ''} onChange={(e) => setAsrForm(f => ({ ...f, model: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">API Key <span className="text-slate-400 font-normal">(留空不改)</span></label>
                        <input type="password" value={asrForm.apiKey || ''} onChange={(e) => setAsrForm(f => ({ ...f, apiKey: e.target.value }))}
                          placeholder="留空则保持原值"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Language</label>
                      <input type="text" value={asrForm.language || ''} onChange={(e) => setAsrForm(f => ({ ...f, language: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                    </div>

                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">音频参数</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Format</label>
                        <input type="text" value={asrForm.format || ''} onChange={(e) => setAsrForm(f => ({ ...f, format: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sample Rate</label>
                        <input type="number" value={asrForm.sampleRate || 0} onChange={(e) => setAsrForm(f => ({ ...f, sampleRate: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">VAD 参数</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Turn Detection</label>
                        <select value={asrForm.enableTurnDetection ? 'true' : 'false'} onChange={(e) => setAsrForm(f => ({ ...f, enableTurnDetection: e.target.value === 'true' }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow">
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Detection Type</label>
                        <input type="text" value={asrForm.turnDetectionType || ''} onChange={(e) => setAsrForm(f => ({ ...f, turnDetectionType: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Threshold</label>
                        <input type="number" step="0.1" value={asrForm.turnDetectionThreshold || 0} onChange={(e) => setAsrForm(f => ({ ...f, turnDetectionThreshold: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Silence Duration (ms)</label>
                        <input type="number" value={asrForm.turnDetectionSilenceDurationMs || 0} onChange={(e) => setAsrForm(f => ({ ...f, turnDetectionSilenceDurationMs: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">连接配置</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Model</label>
                        <input type="text" value={ttsForm.model || ''} onChange={(e) => setTtsForm(f => ({ ...f, model: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">API Key <span className="text-slate-400 font-normal">(留空不改)</span></label>
                        <input type="password" value={ttsForm.apiKey || ''} onChange={(e) => setTtsForm(f => ({ ...f, apiKey: e.target.value }))}
                          placeholder="留空则保持原值"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">语音参数</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Voice</label>
                        <input type="text" value={ttsForm.voice || ''} onChange={(e) => setTtsForm(f => ({ ...f, voice: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Format</label>
                        <input type="text" value={ttsForm.format || ''} onChange={(e) => setTtsForm(f => ({ ...f, format: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sample Rate</label>
                        <input type="number" value={ttsForm.sampleRate || 0} onChange={(e) => setTtsForm(f => ({ ...f, sampleRate: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Mode</label>
                        <input type="text" value={ttsForm.mode || ''} onChange={(e) => setTtsForm(f => ({ ...f, mode: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Language</label>
                        <input type="text" value={ttsForm.languageType || ''} onChange={(e) => setTtsForm(f => ({ ...f, languageType: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">输出控制</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Speech Rate</label>
                        <input type="number" step="0.1" value={ttsForm.speechRate || 0} onChange={(e) => setTtsForm(f => ({ ...f, speechRate: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Volume</label>
                        <input type="number" value={ttsForm.volume || 0} onChange={(e) => setTtsForm(f => ({ ...f, volume: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 transition-shadow" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal actions */}
                <div className="flex gap-3 justify-end mt-6">
                  <motion.button
                    onClick={() => setShowVoiceModal(null)}
                    disabled={voiceSaving}
                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    onClick={showVoiceModal === 'asr' ? handleSaveAsr : handleSaveTts}
                    disabled={voiceSaving}
                    className="px-5 py-2.5 text-white rounded-xl font-semibold text-sm bg-gradient-to-r from-primary-500 to-primary-600 shadow-lg shadow-primary-500/25 hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {voiceSaving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        保存中...
                      </span>
                    ) : (
                      '保存'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={pendingDefaultProviderId !== null}
        title="设为默认文字服务"
        message={`确定要将 "${pendingDefaultProviderId ?? ''}" 设为默认文字服务吗？`}
        confirmText="确认设置"
        cancelText="取消"
        loading={settingDefault}
        onConfirm={handleConfirmSetDefault}
        onCancel={() => {
          if (!settingDefault) {
            setPendingDefaultProviderId(null);
          }
        }}
      />

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6"
              >
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  删除 Provider
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-6">
                  确定要删除 Provider &ldquo;{deleteConfirmId}&rdquo; 吗？删除后无法恢复。
                  如果有模块正在使用此 Provider，请先切换到其他 Provider。
                </p>
                <div className="flex gap-3 justify-end">
                  <motion.button
                    onClick={() => setDeleteConfirmId(null)}
                    disabled={deleting}
                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-600
                      text-slate-600 dark:text-slate-300 rounded-xl font-medium text-sm
                      hover:bg-slate-50 dark:hover:bg-slate-700 transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-5 py-2.5 text-white rounded-xl font-semibold text-sm
                      bg-gradient-to-r from-red-500 to-red-600
                      hover:from-red-600 hover:to-red-700
                      transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {deleting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        删除中...
                      </span>
                    ) : (
                      '确定删除'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-6 left-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium
              flex items-center gap-2 z-[60] ${
                toast.type === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
          >
            {toast.type === 'success'
              ? <CheckCircle className="w-4 h-4" />
              : <XCircle className="w-4 h-4" />
            }
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
