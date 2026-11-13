package interview.guide.modules.llmprovider.service;

import interview.guide.common.config.LlmProviderProperties;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;



@Slf4j
@Service
public class ApiKeyEncryptionService {

  private static final int NONCE_BYTES = 12;//每次加密使用 12 字节的随机 nonce。
  private static final int GCM_TAG_BITS = 128;//AES-GCM 的完整性校验标签长度是 128 位。
  private static final String CIPHER = "AES/GCM/NoPadding";//使用 AES-GCM 加密算法。
  private static final String DEV_FALLBACK_KEY =
      "interview-guide-dev-only-provider-api-key-encryption";//开发环境备用密钥。

  private final LlmProviderProperties properties;
  private final SecureRandom secureRandom = new SecureRandom();
  private SecretKeySpec secretKey;//用于AES加密解密的密钥对象

  public ApiKeyEncryptionService(LlmProviderProperties properties) {
    this.properties = properties;
  }

  /**
   *Spring完成注册依赖自动助兴
   */
  @PostConstruct
  void init() {
    String configuredKey = resolveConfiguredKey(properties.getSecurity());
    secretKey = new SecretKeySpec(resolveKeyBytes(configuredKey), "AES");
  }

  private String resolveConfiguredKey(LlmProviderProperties.SecurityConfig security) {
    String configuredKey = security != null ? security.getApiKeyEncryptionKey() : null;
    if (configuredKey != null && !configuredKey.isBlank()) {
      return configuredKey;
    }

    boolean requireEncryptionKey = security == null || security.isRequireEncryptionKey();
    if (requireEncryptionKey) {//需要密钥
      throw new BusinessException(ErrorCode.PROVIDER_CONFIG_READ_FAILED,
          "APP_AI_CONFIG_ENCRYPTION_KEY 未配置，无法初始化 Provider API Key 加密");//这个在env自己配置
    }

    boolean allowFallback = security != null && security.isAllowFallbackEncryptionKey();
    if (!allowFallback) {//是否支持备用密钥，这个必须显式开启
      throw new BusinessException(ErrorCode.PROVIDER_CONFIG_READ_FAILED,
          "APP_AI_CONFIG_ENCRYPTION_KEY 未配置，且未显式允许 Provider API Key 开发 fallback");
    }

    log.warn("APP_AI_CONFIG_ENCRYPTION_KEY is not configured; using explicitly enabled fallback key");
    return DEV_FALLBACK_KEY;
  }

  public EncryptedValue encrypt(String plainText) {//加密方法
    try {
      byte[] nonce = new byte[NONCE_BYTES];
      secureRandom.nextBytes(nonce);

      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, nonce));
      byte[] ciphertext = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

      return new EncryptedValue(
          Base64.getEncoder().encodeToString(nonce),
          Base64.getEncoder().encodeToString(ciphertext)
      );
    } catch (Exception e) {
      throw new BusinessException(ErrorCode.PROVIDER_CONFIG_WRITE_FAILED,
          "加密 Provider API Key 失败", e);
    }
  }

  public String decrypt(String nonceBase64, String ciphertextBase64) {//解密方法
    try {
      byte[] nonce = Base64.getDecoder().decode(nonceBase64);
      byte[] ciphertext = Base64.getDecoder().decode(ciphertextBase64);

      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, nonce));
      byte[] plainText = cipher.doFinal(ciphertext);
      return new String(plainText, StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new BusinessException(ErrorCode.PROVIDER_CONFIG_READ_FAILED,
          "解密 Provider API Key 失败，请检查 APP_AI_CONFIG_ENCRYPTION_KEY", e);
    }
  }

  private byte[] resolveKeyBytes(String configuredKey) {//，密钥转换
    String trimmed = configuredKey.trim();
    try {
      byte[] decoded = Base64.getDecoder().decode(trimmed);
      if (decoded.length == 32) {
        return decoded;
      }
    } catch (IllegalArgumentException ignored) {
      // Fall through to SHA-256 derivation for human-readable keys.
    }
    return sha256(trimmed);
  }

  private byte[] sha256(String value) {
    try {
      return MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new BusinessException(ErrorCode.PROVIDER_CONFIG_READ_FAILED,
          "初始化 Provider API Key 加密密钥失败", e);
    }
  }

  public record EncryptedValue(String nonce, String ciphertext) {
  }
}
