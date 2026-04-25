package interview.guide.modules.llmprovider.dto;

public record UpdateProviderRequest(
    String baseUrl,
    String apiKey,
    String model,
    String embeddingModel,
    Boolean supportsEmbedding,
    Double temperature
) {
    public UpdateProviderRequest(
        String baseUrl,
        String apiKey,
        String model,
        String embeddingModel,
        Double temperature
    ) {
        this(baseUrl, apiKey, model, embeddingModel, null, temperature);
    }
}
