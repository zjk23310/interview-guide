package interview.guide.common.config;

import interview.guide.common.ai.ApiPathResolver;
import interview.guide.common.config.LlmProviderProperties.ProviderConfig;
import io.micrometer.observation.ObservationRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.document.MetadataMode;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.retry.RetryUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;

import java.util.Map;

@Configuration
@Slf4j
public class LlmEmbeddingConfig {

  @Bean
  @Conditional(EmbeddingConfiguredCondition.class)
  public EmbeddingModel embeddingModel(
      LlmProviderProperties properties,
      ObjectProvider<ObservationRegistry> observationRegistryProvider) {
    String providerId = properties.getDefaultProvider();
    Map<String, ProviderConfig> providers = properties.getProviders();
    ProviderConfig config = providers.get(providerId);

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

  static class EmbeddingConfiguredCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
      String defaultProvider = context.getEnvironment()
          .getProperty("app.ai.default-provider", "dashscope");
      String baseUrl = context.getEnvironment()
          .getProperty("app.ai.providers." + defaultProvider + ".base-url");
      if (baseUrl == null || baseUrl.isBlank()) {
        log.info("EmbeddingModel skipped: provider '{}' has no base-url", defaultProvider);
        return false;
      }
      String embeddingModel = context.getEnvironment()
          .getProperty("app.ai.providers." + defaultProvider + ".embedding-model");
      if (embeddingModel == null || embeddingModel.isBlank()) {
        log.info("EmbeddingModel skipped: provider '{}' has no embedding-model", defaultProvider);
        return false;
      }
      return true;
    }
  }
}
