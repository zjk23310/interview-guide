package interview.guide.common.ai;

import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.regex.Pattern;

/**
 * 判断 OpenAI-兼容 provider 的 base-url 是否自带版本段（如 /v1、/v3、/api/paas/v4）。
 *
 * <p>背景：Spring AI {@code OpenAiApi} 默认 {@code completionsPath=/v1/chat/completions}、
 * {@code embeddingsPath=/v1/embeddings}，它假设 base-url 形如 {@code https://api.openai.com}。
 * 但国内常用的 OpenAI-兼容端点（阿里 DashScope {@code /compatible-mode/v1}、Kimi {@code /v1}、
 * 智谱 {@code /api/paas/v4}、豆包 Ark {@code /api/v3}、DeepSeek/SiliconFlow {@code /v1} ...）
 * 都把版本段放在 base-url 里，按默认路径拼接会得到 {@code .../v1/v1/chat/completions}（404）。
 *
 * <p>本方法识别 base-url 末尾的 {@code /v\d+} 或 {@code /api/.*\/v\d+} 模式；匹配到则调用方
 * 应显式将 completionsPath/embeddingsPath 改为不带 {@code /v1} 前缀的相对路径。
 */
public final class ApiPathResolver {

    private static final int DEFAULT_CONNECT_TIMEOUT = 10000;
    private static final int DEFAULT_READ_TIMEOUT = 300000;

    /** 以 /vN 结尾的版本段（允许后缀字母，如 v1beta）。*/
    private static final Pattern TRAILING_VERSION = Pattern.compile("/v\\d+[a-zA-Z0-9]*$");

    private ApiPathResolver() {}

    public static OpenAiApi buildOpenAiApi(String baseUrl, String apiKey) {
        return buildOpenAiApi(baseUrl, apiKey, DEFAULT_CONNECT_TIMEOUT, DEFAULT_READ_TIMEOUT);
    }

    public static OpenAiApi buildOpenAiApi(String baseUrl, String apiKey,
                                            int connectTimeout, int readTimeout) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeout);
        requestFactory.setReadTimeout(readTimeout);

        RestClient.Builder restClientBuilder = RestClient.builder()
            .requestFactory(requestFactory);

        OpenAiApi.Builder apiBuilder = OpenAiApi.builder()
            .baseUrl(baseUrl)
            .apiKey(apiKey)
            .restClientBuilder(restClientBuilder);
        if (baseUrlContainsVersion(baseUrl)) {
            apiBuilder.completionsPath("/chat/completions").embeddingsPath("/embeddings");
        }
        return apiBuilder.build();
    }

    public static boolean baseUrlContainsVersion(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            return false;
        }
        String stripped = stripTrailingSlashes(baseUrl.trim());
        return TRAILING_VERSION.matcher(stripped).find();
    }

    public static String stripTrailingSlashes(String value) {
        if (value == null) {
            return "";
        }
        String result = value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
