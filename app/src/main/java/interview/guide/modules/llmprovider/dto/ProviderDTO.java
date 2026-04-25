package interview.guide.modules.llmprovider.dto;

import lombok.Builder;

@Builder
public record ProviderDTO(
    String id,
    String baseUrl,
    String maskedApiKey,
    String model,
    String embeddingModel,
    boolean supportsEmbedding,
    Double temperature,
    boolean defaultChatProvider,
    boolean defaultEmbeddingProvider
) {}
