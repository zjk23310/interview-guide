package interview.guide.modules.llmprovider.service;

import interview.guide.common.ai.ApiPathResolver;
import interview.guide.common.ai.LlmProviderRegistry;
import interview.guide.common.config.LlmProviderProperties;
import interview.guide.common.config.LlmProviderProperties.ProviderConfig;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.llmprovider.dto.AsrConfigDTO;
import interview.guide.modules.llmprovider.dto.AsrConfigRequest;
import interview.guide.modules.llmprovider.dto.CreateProviderRequest;
import interview.guide.modules.llmprovider.dto.DefaultProviderDTO;
import interview.guide.modules.llmprovider.dto.ProviderDTO;
import interview.guide.modules.llmprovider.dto.ProviderTestResult;
import interview.guide.modules.llmprovider.dto.TtsConfigDTO;
import interview.guide.modules.llmprovider.dto.TtsConfigRequest;
import interview.guide.modules.llmprovider.dto.UpdateProviderRequest;
import interview.guide.modules.voiceinterview.config.VoiceInterviewProperties;
import interview.guide.modules.voiceinterview.service.QwenAsrService;
import interview.guide.modules.voiceinterview.service.QwenTtsService;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.representer.Representer;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class LlmProviderConfigService {

    private final LlmProviderProperties properties;
    private final LlmProviderRegistry registry;
    private final String yamlPath;
    private final String envPath;
    private final Object configLock = new Object();
    private final VoiceInterviewProperties voiceProperties;
    private final QwenAsrService asrService;
    private final QwenTtsService ttsService;

    public LlmProviderConfigService(
            LlmProviderProperties properties,
            LlmProviderRegistry registry,
            VoiceInterviewProperties voiceProperties,
            QwenAsrService asrService,
            QwenTtsService ttsService) {
        this.properties = properties;
        this.registry = registry;
        this.yamlPath = properties.getConfigYamlPath();
        this.envPath = properties.getConfigEnvPath();
        this.voiceProperties = voiceProperties;
        this.asrService = asrService;
        this.ttsService = ttsService;
    }

    /**
     * 启动时确保 Provider 配置文件的父目录存在且可写。
     *
     * 旧默认值曾指向 {@code tmp/persistence-test/...} 或源码里的 {@code application.yml}，前者会在容器
     * 重启后丢失，后者会污染 classpath 资源 / git 跟踪文件。这里改为 fail-fast：若配置的路径父目录
     * 既不存在又无法创建、或存在但不可写，直接抛 {@link BusinessException}，避免 UI 保存接口返回 200
     * 但实际磁盘无任何落盘。
     */
    @PostConstruct
    void validateWritablePaths() {
        ensureParentWritable(yamlPath, "config-yaml-path");
        ensureParentWritable(envPath, "config-env-path");
    }

    private void ensureParentWritable(String rawPath, String label) {
        if (rawPath == null || rawPath.isBlank()) {
            log.warn("{} is not configured; runtime Provider edits will be skipped", label);
            return;
        }
        Path parent = Path.of(rawPath).toAbsolutePath().getParent();
        if (parent == null) {
            return;
        }
        try {
            Files.createDirectories(parent);
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED,
                label + " 的父目录不可创建: " + parent, e);
        }
        if (!Files.isWritable(parent)) {
            throw new BusinessException(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED,
                label + " 的父目录不可写: " + parent);
        }
        log.info("{} resolved to {} (parent writable)", label, rawPath);
    }

    public List<ProviderDTO> listProviders() {
        Map<String, ProviderConfig> providers = properties.getProviders();
        if (providers == null) return List.of();

        return providers.entrySet().stream()
            .map(e -> ProviderDTO.builder()
                .id(e.getKey())
                .baseUrl(e.getValue().getBaseUrl())
                .maskedApiKey(maskApiKey(e.getValue().getApiKey()))
                .model(e.getValue().getModel())
                .embeddingModel(e.getValue().getEmbeddingModel())
                .temperature(e.getValue().getTemperature())
                .build())
            .toList();
    }

    public ProviderDTO getProvider(String id) {
        ProviderConfig config = getProviderConfigOrThrow(id);
        return ProviderDTO.builder()
            .id(id)
            .baseUrl(config.getBaseUrl())
            .maskedApiKey(maskApiKey(config.getApiKey()))
            .model(config.getModel())
            .embeddingModel(config.getEmbeddingModel())
            .temperature(config.getTemperature())
            .build();
    }

    public void createProvider(CreateProviderRequest request) {
        synchronized (configLock) {
            Map<String, ProviderConfig> providers = getProvidersOrThrow();
            if (providers.containsKey(request.id())) {
                throw new BusinessException(ErrorCode.PROVIDER_ALREADY_EXISTS,
                    "Provider '" + request.id() + "' 已存在");
            }

            ProviderConfig config = new ProviderConfig();
            config.setBaseUrl(request.baseUrl());
            config.setApiKey(request.apiKey());
            config.setModel(request.model());
            config.setEmbeddingModel(request.embeddingModel());
            config.setTemperature(request.temperature());
            providers.put(request.id(), config);

            String envKey = toEnvKey(request.id());
            writeProviderToYaml(request.id(), config, envKey);
            writeEnvValue(envKey, request.apiKey());
            registry.reload();
            log.info("Created provider: id={}, baseUrl={}, model={}", request.id(), request.baseUrl(), request.model());
        }
    }

    public void updateProvider(String id, UpdateProviderRequest request) {
        synchronized (configLock) {
            ProviderConfig config = getProviderConfigOrThrow(id);

            // baseUrl / model / apiKey 是必填字段：null = 前端未提交该字段（不更新），
            // 纯空白 = 前端提交了但值无意义（拒绝，避免写出坏配置）。只有 embeddingModel 允许
            // 用空串显式"清空"，语义上它是可选字段。
            String trimmedBaseUrl = trimOrNull(request.baseUrl());
            if (request.baseUrl() != null && trimmedBaseUrl == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "baseUrl 不能为空字符串");
            }
            String trimmedModel = trimOrNull(request.model());
            if (request.model() != null && trimmedModel == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "model 不能为空字符串");
            }
            String trimmedApiKey = trimOrNull(request.apiKey());
            if (request.apiKey() != null && trimmedApiKey == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "apiKey 不能为空字符串");
            }

            if (trimmedBaseUrl != null) config.setBaseUrl(trimmedBaseUrl);
            if (trimmedModel != null) config.setModel(trimmedModel);
            if (request.embeddingModel() != null) {
                config.setEmbeddingModel(trimOrNull(request.embeddingModel()));
            }
            if (request.temperature() != null) {
                config.setTemperature(request.temperature());
            }
            if (trimmedApiKey != null) {
                config.setApiKey(trimmedApiKey);
                String envKey = toEnvKey(id);
                updateEnvValue(envKey, trimmedApiKey);
            }

            String envKey = toEnvKey(id);
            writeProviderToYaml(id, config, envKey);
            registry.reload();
            log.info("Updated provider: id={}", id);
        }
    }

    public void deleteProvider(String id) {
        synchronized (configLock) {
            if (id.equals(properties.getDefaultProvider())) {
                throw new BusinessException(ErrorCode.PROVIDER_DEFAULT_CANNOT_DELETE,
                    "默认 Provider '" + id + "' 不可删除，请先切换默认 Provider");
            }
            getProviderConfigOrThrow(id);
            getProvidersOrThrow().remove(id);

            String envKey = toEnvKey(id);
            removeProviderFromYaml(id);
            removeFromEnv(envKey);
            registry.reload();
            log.info("Deleted provider: id={}", id);
        }
    }

    public ProviderTestResult testProvider(String id) {
        ProviderConfig config = getProviderConfigOrThrow(id);
        try {
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(5000);
            requestFactory.setReadTimeout(10000);

            RestClient restClient = RestClient.builder()
                .defaultHeader("Authorization", "Bearer " + config.getApiKey())
                .requestFactory(requestFactory)
                .build();

            Map<String, Object> requestBody = buildConnectivityTestRequestBody(config.getModel());

            List<String> candidateUrls = buildConnectivityTestUrls(config.getBaseUrl());
            String lastFailureMessage = "Unknown error";

            for (String targetUrl : candidateUrls) {
                try {
                    restClient.post()
                        .uri(URI.create(targetUrl))
                        .body(requestBody)
                        .retrieve()
                        .toEntity(String.class);
                    log.info("Provider connectivity test succeeded: providerId={}, baseUrl={}, targetUrl={}, model={}",
                        id, config.getBaseUrl(), targetUrl, config.getModel());
                    return ProviderTestResult.builder()
                        .success(true)
                        .message("连接成功")
                        .model(config.getModel())
                        .build();
                } catch (RestClientResponseException e) {
                    String responseBody = abbreviate(e.getResponseBodyAsString());
                    lastFailureMessage = String.format(
                        "HTTP %s on %s, body=%s",
                        e.getStatusCode().value(),
                        targetUrl,
                        responseBody
                    );
                    log.warn(
                        "Provider connectivity test failed with response: providerId={}, baseUrl={}, targetUrl={}, model={}, status={}, body={}",
                        id,
                        config.getBaseUrl(),
                        targetUrl,
                        config.getModel(),
                        e.getStatusCode().value(),
                        responseBody,
                        e
                    );
                } catch (Exception e) {
                    lastFailureMessage = String.format(
                        "%s on %s: %s",
                        e.getClass().getSimpleName(),
                        targetUrl,
                        e.getMessage()
                    );
                    log.warn(
                        "Provider connectivity test failed: providerId={}, baseUrl={}, targetUrl={}, model={}, error={}",
                        id,
                        config.getBaseUrl(),
                        targetUrl,
                        config.getModel(),
                        e.getMessage(),
                        e
                    );
                }
            }
            return ProviderTestResult.builder()
                .success(false)
                .message("连接失败: " + lastFailureMessage)
                .model(config.getModel())
                .build();
        } catch (Exception e) {
            log.warn("Provider connectivity test setup failed: providerId={}, baseUrl={}, model={}, error={}",
                id, config.getBaseUrl(), config.getModel(), e.getMessage(), e);
            return ProviderTestResult.builder()
                .success(false)
                .message("连接失败: " + e.getMessage())
                .model(config.getModel())
                .build();
        }
    }

    public DefaultProviderDTO getDefaultProvider() {
        return new DefaultProviderDTO(properties.getDefaultProvider());
    }

    public void updateDefaultProvider(DefaultProviderDTO request) {
        String providerId = trimOrNull(request.defaultProvider());
        if (providerId == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "defaultProvider 不能为空");
        }
        getProviderConfigOrThrow(providerId);
        properties.setDefaultProvider(providerId);
        writeDefaultProviderToYaml(providerId);
        registry.reload();
        log.info("Updated default provider: {}", providerId);
    }

    public void reloadProviders() {
        registry.reload();
        log.info("Manual provider reload triggered");
    }

    public AsrConfigDTO getAsrConfig() {
        VoiceInterviewProperties.AsrConfig asr = voiceProperties.getQwen().getAsr();
        return AsrConfigDTO.builder()
            .url(asr.getUrl())
            .model(asr.getModel())
            .maskedApiKey(maskApiKey(asr.getApiKey()))
            .language(asr.getLanguage())
            .format(asr.getFormat())
            .sampleRate(asr.getSampleRate())
            .enableTurnDetection(asr.isEnableTurnDetection())
            .turnDetectionType(asr.getTurnDetectionType())
            .turnDetectionThreshold(asr.getTurnDetectionThreshold())
            .turnDetectionSilenceDurationMs(asr.getTurnDetectionSilenceDurationMs())
            .build();
    }

    public TtsConfigDTO getTtsConfig() {
        VoiceInterviewProperties.QwenTtsConfig tts = voiceProperties.getQwen().getTts();
        return TtsConfigDTO.builder()
            .model(tts.getModel())
            .maskedApiKey(maskApiKey(tts.getApiKey()))
            .voice(tts.getVoice())
            .format(tts.getFormat())
            .sampleRate(tts.getSampleRate())
            .mode(tts.getMode())
            .languageType(tts.getLanguageType())
            .speechRate(tts.getSpeechRate())
            .volume(tts.getVolume())
            .build();
    }

    public void updateAsrConfig(AsrConfigRequest request) {
        synchronized (configLock) {
            VoiceInterviewProperties.AsrConfig asr = voiceProperties.getQwen().getAsr();
            if (request.url() != null) asr.setUrl(request.url());
            if (request.model() != null) asr.setModel(request.model());
            if (request.language() != null) asr.setLanguage(request.language());
            if (request.format() != null) asr.setFormat(request.format());
            if (request.sampleRate() != null) asr.setSampleRate(request.sampleRate());
            if (request.enableTurnDetection() != null) asr.setEnableTurnDetection(request.enableTurnDetection());
            if (request.turnDetectionType() != null) asr.setTurnDetectionType(request.turnDetectionType());
            if (request.turnDetectionThreshold() != null) asr.setTurnDetectionThreshold(request.turnDetectionThreshold());
            if (request.turnDetectionSilenceDurationMs() != null) asr.setTurnDetectionSilenceDurationMs(request.turnDetectionSilenceDurationMs());
            if (request.apiKey() != null) {
                asr.setApiKey(request.apiKey());
                updateEnvValue("AI_BAILIAN_API_KEY", request.apiKey());
            }

            writeAsrConfigToYaml(asr);
            asrService.reload(voiceProperties);
            log.info("Updated ASR config");
        }
    }

    public void updateTtsConfig(TtsConfigRequest request) {
        synchronized (configLock) {
            VoiceInterviewProperties.QwenTtsConfig tts = voiceProperties.getQwen().getTts();
            if (request.model() != null) tts.setModel(request.model());
            if (request.voice() != null) tts.setVoice(request.voice());
            if (request.format() != null) tts.setFormat(request.format());
            if (request.sampleRate() != null) tts.setSampleRate(request.sampleRate());
            if (request.mode() != null) tts.setMode(request.mode());
            if (request.languageType() != null) tts.setLanguageType(request.languageType());
            if (request.speechRate() != null) tts.setSpeechRate(request.speechRate());
            if (request.volume() != null) tts.setVolume(request.volume());
            if (request.apiKey() != null) {
                tts.setApiKey(request.apiKey());
                updateEnvValue("AI_BAILIAN_API_KEY", request.apiKey());
            }

            writeTtsConfigToYaml(tts);
            ttsService.reload(voiceProperties);
            log.info("Updated TTS config");
        }
    }

    public ProviderTestResult testAsrConfig() {
        VoiceInterviewProperties.AsrConfig asr = voiceProperties.getQwen().getAsr();
        try {
            java.net.URI wsUri = java.net.URI.create(asr.getUrl());
            String host = wsUri.getHost();
            int port = wsUri.getPort() > 0 ? wsUri.getPort() : (wsUri.getScheme().equals("wss") ? 443 : 80);
            java.net.InetSocketAddress address = new java.net.InetSocketAddress(host, port);
            java.net.Socket socket = new java.net.Socket();
            socket.connect(address, 5000);
            socket.close();
            return ProviderTestResult.builder()
                .success(true)
                .message("ASR WebSocket 连接成功: " + host)
                .model(asr.getModel())
                .build();
        } catch (Exception e) {
            return ProviderTestResult.builder()
                .success(false)
                .message("ASR 连接失败: " + e.getMessage())
                .model(asr.getModel())
                .build();
        }
    }

    // ===== 内部方法 =====

    private Map<String, ProviderConfig> getProvidersOrThrow() {
        Map<String, ProviderConfig> providers = properties.getProviders();
        if (providers == null) {
            throw new BusinessException(ErrorCode.PROVIDER_CONFIG_READ_FAILED,
                "Provider 配置未初始化");
        }
        return providers;
    }

    ProviderConfig getProviderConfigOrThrow(String id) {
        Map<String, ProviderConfig> providers = getProvidersOrThrow();
        ProviderConfig config = providers.get(id);
        if (config == null) {
            throw new BusinessException(ErrorCode.PROVIDER_NOT_FOUND,
                "Provider '" + id + "' 不存在");
        }
        return config;
    }

    String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() <= 6) {
            return "***";
        }
        return apiKey.substring(0, 3) + "***" + apiKey.substring(apiKey.length() - 3);
    }

    private String abbreviate(String text) {
        if (text == null || text.isBlank()) {
            return "[no body]";
        }
        String normalized = text.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= 200) {
            return normalized;
        }
        return normalized.substring(0, 200) + "...";
    }

    private List<String> buildConnectivityTestUrls(String baseUrl) {
        String normalizedBaseUrl = ApiPathResolver.stripTrailingSlashes(baseUrl);
        LinkedHashSet<String> candidateUrls = new LinkedHashSet<>();

        candidateUrls.add(normalizedBaseUrl + "/chat/completions");
        if (!ApiPathResolver.baseUrlContainsVersion(normalizedBaseUrl)) {
            candidateUrls.add(normalizedBaseUrl + "/v1/chat/completions");
        }

        return List.copyOf(candidateUrls);
    }

    private Map<String, Object> buildConnectivityTestRequestBody(String model) {
        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("model", model);
        requestBody.put("messages", List.of(Map.of(
            "role", "user",
            "content", "Reply with OK only."
        )));
        requestBody.put("max_tokens", 1);
        return requestBody;
    }

    /**
     * 空白归一：{@code null} / 空串 / 纯空白都返回 {@code null}，否则返回 trim 结果。
     * 用于 {@code embeddingModel} 等"允许显式清空"的可选字段。
     */
    private String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String toEnvKey(String providerId) {
        return "PROVIDER_" + providerId.toUpperCase().replace("-", "_") + "_API_KEY";
    }

    private void writeProviderToYaml(String id, ProviderConfig config, String envKey) {
        mutateYaml(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED, "写入 YAML 配置失败", data -> {
            Map<String, Object> providers = getOrCreateMap(
                getOrCreateMap(getOrCreateMap(data, "app"), "ai"), "providers");
            Map<String, Object> provider = new LinkedHashMap<>();
            provider.put("base-url", config.getBaseUrl());
            provider.put("api-key", "${" + envKey + "}");
            provider.put("model", config.getModel());
            if (config.getEmbeddingModel() != null) {
                provider.put("embedding-model", config.getEmbeddingModel());
            }
            if (config.getTemperature() != null) {
                provider.put("temperature", config.getTemperature());
            }
            providers.put(id, provider);
        });
    }

    private void removeProviderFromYaml(String id) {
        mutateYaml(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED, "删除 YAML 配置失败", data -> {
            Map<String, Object> providers = navigateMap(data, "app", "ai", "providers");
            if (providers != null) {
                providers.remove(id);
            }
        });
    }

    private void writeDefaultProviderToYaml(String defaultProvider) {
        mutateYaml(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED, "写入默认 Provider 配置失败", data -> {
            Map<String, Object> ai = getOrCreateMap(getOrCreateMap(data, "app"), "ai");
            ai.put("default-provider", defaultProvider);
            ai.remove("module-defaults");
        });
    }

    private void writeEnvValue(String key, String value) {
        if (envPath == null || envPath.isBlank()) return;
        try {
            Path path = Path.of(envPath);
            if (!Files.exists(path)) {
                Files.writeString(path, key + "=" + value + "\n", StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                return;
            }
            String content = Files.readString(path, StandardCharsets.UTF_8);
            if (content.contains(key + "=")) {
                content = content.replaceAll("(?m)^" + Pattern.quote(key) + "=.*",
                    Matcher.quoteReplacement(key + "=" + value));
            } else {
                if (!content.endsWith("\n")) {
                    content += "\n";
                }
                content += key + "=" + value + "\n";
            }
            Files.writeString(path, content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("写入 .env 失败: {}", e.getMessage());
        }
    }

    private void updateEnvValue(String key, String value) {
        writeEnvValue(key, value);
    }

    private void removeFromEnv(String key) {
        if (envPath == null || envPath.isBlank()) return;
        try {
            Path path = Path.of(envPath);
            if (!Files.exists(path)) return;
            String content = Files.readString(path, StandardCharsets.UTF_8);
            content = content.replaceAll("(?m)^" + Pattern.quote(key) + "=.*\\R?", "");
            Files.writeString(path, content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("删除 .env 条目失败: {}", e.getMessage());
        }
    }

    private void writeAsrConfigToYaml(VoiceInterviewProperties.AsrConfig asr) {
        mutateYaml(ErrorCode.VOICE_CONFIG_WRITE_FAILED, "写入 ASR 配置失败", data -> {
            Map<String, Object> qwen = getOrCreateMap(
                getOrCreateMap(getOrCreateMap(data, "app"), "voice-interview"), "qwen");
            Map<String, Object> asrMap = getOrCreateMap(qwen, "asr");
            asrMap.put("url", asr.getUrl());
            asrMap.put("model", asr.getModel());
            asrMap.put("api-key", "${AI_BAILIAN_API_KEY}");
            asrMap.put("language", asr.getLanguage());
            asrMap.put("format", asr.getFormat());
            asrMap.put("sample-rate", asr.getSampleRate());
            asrMap.put("enable-turn-detection", asr.isEnableTurnDetection());
            asrMap.put("turn-detection-type", asr.getTurnDetectionType());
            asrMap.put("turn-detection-threshold", asr.getTurnDetectionThreshold());
            asrMap.put("turn-detection-silence-duration-ms", asr.getTurnDetectionSilenceDurationMs());
        });
    }

    private void writeTtsConfigToYaml(VoiceInterviewProperties.QwenTtsConfig tts) {
        mutateYaml(ErrorCode.VOICE_CONFIG_WRITE_FAILED, "写入 TTS 配置失败", data -> {
            Map<String, Object> qwen = getOrCreateMap(
                getOrCreateMap(getOrCreateMap(data, "app"), "voice-interview"), "qwen");
            Map<String, Object> ttsMap = getOrCreateMap(qwen, "tts");
            ttsMap.put("model", tts.getModel());
            ttsMap.put("api-key", "${AI_BAILIAN_API_KEY}");
            ttsMap.put("voice", tts.getVoice());
            ttsMap.put("format", tts.getFormat());
            ttsMap.put("sample-rate", tts.getSampleRate());
            ttsMap.put("mode", tts.getMode());
            ttsMap.put("language-type", tts.getLanguageType());
            ttsMap.put("speech-rate", tts.getSpeechRate());
            ttsMap.put("volume", tts.getVolume());
        });
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getOrCreateMap(Map<String, Object> parent, String key) {
        Object child = parent.get(key);
        if (child instanceof Map) return (Map<String, Object>) child;
        Map<String, Object> map = new LinkedHashMap<>();
        parent.put(key, map);
        return map;
    }

    private void mutateYaml(ErrorCode errorCode, String errorMessage, Consumer<Map<String, Object>> mutator) {
        if (yamlPath == null || yamlPath.isBlank()) {
            log.warn("YAML path not configured, skip writing");
            return;
        }
        try {
            Yaml yaml = createYaml();
            Path path = Path.of(yamlPath);
            Map<String, Object> data;

            if (Files.exists(path)) {
                try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                    data = yaml.load(reader);
                }
            } else {
                data = new LinkedHashMap<>();
            }
            if (data == null) {
                data = new LinkedHashMap<>();
            }

            mutator.accept(data);

            try (Writer writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                yaml.dump(data, writer);
            }
        } catch (IOException e) {
            throw new BusinessException(errorCode, errorMessage + ": " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> navigateMap(Map<String, Object> data, String... keys) {
        Map<String, Object> current = data;
        for (String key : keys) {
            Object child = current.get(key);
            if (!(child instanceof Map)) return null;
            current = (Map<String, Object>) child;
        }
        return current;
    }

    private Yaml createYaml() {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setPrettyFlow(true);
        Representer representer = new Representer(options);
        representer.getPropertyUtils().setSkipMissingProperties(true);
        return new Yaml(representer, options);
    }
}
