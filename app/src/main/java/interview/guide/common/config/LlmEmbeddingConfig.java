package interview.guide.common.config;

import interview.guide.common.ai.ApiPathResolver;
import interview.guide.common.config.LlmProviderProperties.ProviderConfig;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import io.micrometer.observation.ObservationRegistry;
import org.springframework.ai.document.MetadataMode;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.retry.RetryUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;

import java.util.Map;

@Configuration
public class LlmEmbeddingConfig {

    @Bean
    public EmbeddingModel embeddingModel(
            LlmProviderProperties properties,
            ObjectProvider<ObservationRegistry> observationRegistryProvider) {
        String providerId = properties.getDefaultProvider();
        Map<String, ProviderConfig> providers = properties.getProviders();
        ProviderConfig config = providers != null ? providers.get(providerId) : null;

        if (config == null) {
            throw new BusinessException(
                ErrorCode.PROVIDER_NOT_FOUND,
                "Default provider '" + providerId + "' 不存在，无法初始化 EmbeddingModel"
            );
        }
        if (config.getEmbeddingModel() == null || config.getEmbeddingModel().isBlank()) {
            throw new BusinessException(
                ErrorCode.AI_SERVICE_UNAVAILABLE,
                "Provider '" + providerId + "' 未配置 embedding-model"
            );
        }

        OpenAiApi openAiApi = ApiPathResolver.buildOpenAiApi(config.getBaseUrl(), config.getApiKey());

        OpenAiEmbeddingOptions options = OpenAiEmbeddingOptions.builder()
            .model(config.getEmbeddingModel())
            .build();
        ObservationRegistry observationRegistry = observationRegistryProvider
            .getIfAvailable(() -> ObservationRegistry.NOOP);

        return new OpenAiEmbeddingModel(
            openAiApi,
            MetadataMode.EMBED,
            options,
            RetryUtils.DEFAULT_RETRY_TEMPLATE,
            observationRegistry
        );
    }
}
