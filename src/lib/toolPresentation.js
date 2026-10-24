// Presentation only: IDs, views, defaults and persisted preferences stay stable.
import { translateMessage } from './uiMessages.js';

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'es', 'it', 'ja', 'pt-BR', 'ko', 'tr', 'az'];
const localized = (values) => ({ ...Object.fromEntries(LOCALES.map((locale, i) => [locale, values[i]])), zh: values[1] });

export const CATEGORY_ORDER = ['developer', 'text', 'calculate', 'network', 'system', 'security', 'image', 'document'];
export const CATEGORY_NAMES = Object.fromEntries([
  ['developer', ['Development', '开发', '開發', 'Desarrollo', 'Sviluppo', '開発', 'Desenvolvimento', '개발', 'Geliştirme', 'Proqramlaşdırma']],
  ['text', ['Text', '文本', '文字', 'Texto', 'Testo', 'テキスト', 'Texto', '텍스트', 'Metin', 'Mətn']],
  ['calculate', ['Calculations', '计算', '計算', 'Cálculos', 'Calcoli', '計算', 'Cálculos', '계산', 'Hesaplama', 'Hesablamalar']],
  ['network', ['Network', '网络', '網路', 'Red', 'Rete', 'ネットワーク', 'Rede', '네트워크', 'Ağ', 'Şəbəkə']],
  ['system', ['System', '系统', '系統', 'Sistema', 'Sistema', 'システム', 'Sistema', '시스템', 'Sistem', 'Sistem']],
  ['security', ['Security', '安全', '安全', 'Seguridad', 'Sicurezza', 'セキュリティ', 'Segurança', '보안', 'Güvenlik', 'Təhlükəsizlik']],
  ['image', ['Images', '图像', '圖像', 'Imágenes', 'Immagini', '画像', 'Imagens', '이미지', 'Görüntüler', 'Şəkillər']],
  ['document', ['Documents', '文档', '文件', 'Documentos', 'Documenti', 'ドキュメント', 'Documentos', '문서', 'Belgeler', 'Sənədlər']],
].map(([id, values]) => [id, localized(values)]));

const CATEGORY_OVERRIDES = Object.fromEntries(Object.entries({
  developer: ['uuid', 'random-bytes', 'fake-data', 'semver', 'cron'],
  text: ['lorem'],
  network: ['phone', 'bandwidth', 'safelink', 'wifi-qr'],
  system: ['device-info', 'keyboard-event', 'file-type', 'chmod'],
  security: ['password', 'basic-auth', 'xor'],
  image: ['color', 'color-palette', 'qrcode'],
  document: ['spreadsheet', 'chart', 'markdown', 'rich-text'],
}).flatMap(([category, ids]) => ids.map(id => [id, category])));

const NAMES = Object.fromEntries([
  ['base64', ['Base encoding / decoding', 'Base 编解码', 'Base 編解碼', 'Codificación y decodificación Base', 'Codifica e decodifica Base', 'Base エンコード・デコード', 'Codificação e decodificação Base', 'Base 인코딩·디코딩', 'Base kodlama ve çözme', 'Base kodlaşdırma və dekodlaşdırma']],
  ['timestamp', ['Timestamp conversion', '时间戳转换', '時間戳轉換', 'Conversión de marcas de tiempo', 'Conversione timestamp', 'タイムスタンプ変換', 'Conversão de timestamps', '타임스탬프 변환', 'Zaman damgası dönüştürme', 'Zaman damğası çevirmə']],
  ['markdown', ['Markdown editor and preview', 'Markdown 编辑与预览', 'Markdown 編輯與預覽', 'Editor y vista previa Markdown', 'Editor e anteprima Markdown', 'Markdown 編集・プレビュー', 'Editor e prévia Markdown', 'Markdown 편집 및 미리보기', 'Markdown düzenleme ve önizleme', 'Markdown redaktəsi və önbaxışı']],
  ['html-playground', ['HTML live preview', 'HTML 在线预览', 'HTML 線上預覽', 'Vista previa HTML en vivo', 'Anteprima HTML dal vivo', 'HTML ライブプレビュー', 'Prévia HTML ao vivo', 'HTML 실시간 미리보기', 'HTML canlı önizleme', 'HTML canlı önbaxış']],
  ['semver', ['Semantic version comparison', '语义版本比较', '語意版本比較', 'Comparación de versiones semánticas', 'Confronto versioni semantiche', 'セマンティックバージョン比較', 'Comparação de versões semânticas', '시맨틱 버전 비교', 'Anlamsal sürüm karşılaştırma', 'Semantik versiyaların müqayisəsi']],
  ['image-ocr', ['Image text recognition', '图片文字识别', '圖片文字辨識', 'Reconocimiento de texto en imágenes', 'Riconoscimento testo nelle immagini', '画像の文字認識', 'Reconhecimento de texto em imagens', '이미지 문자 인식', 'Görüntüden metin tanıma', 'Şəkildə mətnin tanınması']],
  ['pdf-visual-signature', ['PDF handwritten and image signatures', 'PDF 手写与图片签名', 'PDF 手寫與圖片簽名', 'Firmas manuscritas y de imagen PDF', 'Firme manoscritte e immagini PDF', 'PDF 手書き・画像署名', 'Assinaturas manuscritas e de imagem PDF', 'PDF 손글씨 및 이미지 서명', 'PDF el yazısı ve görüntü imzaları', 'PDF əl yazısı və şəkil imzaları']],
  ['network-calc', ['IP subnet calculation', 'IP 子网计算', 'IP 子網計算', 'Cálculo de subredes IP', 'Calcolo sottoreti IP', 'IP サブネット計算', 'Cálculo de sub-redes IP', 'IP 서브넷 계산', 'IP alt ağ hesaplama', 'IP alt şəbəkə hesablanması']],
  ['jwt', ['JWT decoding, signing and verification', 'JWT 解码、签发与验签', 'JWT 解碼、簽發與驗簽', 'Decodificación, firma y verificación JWT', 'Decodifica, firma e verifica JWT', 'JWT デコード・署名・検証', 'Decodificação, assinatura e verificação JWT', 'JWT 디코딩·서명·검증', 'JWT çözme, imzalama ve doğrulama', 'JWT dekodlaşdırma, imzalama və yoxlama']],
  ['totp', ['TOTP code generation', 'TOTP 验证码生成', 'TOTP 驗證碼產生', 'Generación de códigos TOTP', 'Generazione codici TOTP', 'TOTP コード生成', 'Geração de códigos TOTP', 'TOTP 코드 생성', 'TOTP kodu oluşturma', 'TOTP kodunun yaradılması']],
  ['jwk', ['JWK / JWKS validation and conversion', 'JWK / JWKS 校验与转换', 'JWK / JWKS 驗證與轉換', 'Validación y conversión JWK / JWKS', 'Validazione e conversione JWK / JWKS', 'JWK / JWKS 検証・変換', 'Validação e conversão JWK / JWKS', 'JWK / JWKS 검증 및 변환', 'JWK / JWKS doğrulama ve dönüştürme', 'JWK / JWKS yoxlanması və çevrilməsi']],
  ['cert', ['Certificate and SSH inspection', '证书与 SSH 检查', '憑證與 SSH 檢查', 'Inspección de certificados y SSH', 'Analisi certificati e SSH', '証明書・SSH 検査', 'Inspeção de certificados e SSH', '인증서 및 SSH 검사', 'Sertifika ve SSH inceleme', 'Sertifikat və SSH yoxlanması']],
].map(([id, values]) => [id, localized(values)]));

// Algorithm names stay intact; the translated operation explains their purpose.
const OPERATIONS = {
  cipher: ['{0} encryption', '{0} 加密', '{0} 加密', 'Cifrado {0}', 'Cifratura {0}', '{0} 暗号化', 'Criptografia {0}', '{0} 암호화', '{0} şifreleme', '{0} şifrələmə'],
  kdf: ['{0} key derivation', '{0} 密钥派生', '{0} 金鑰衍生', 'Derivación de claves {0}', 'Derivazione chiavi {0}', '{0} 鍵導出', 'Derivação de chaves {0}', '{0} 키 파생', '{0} anahtar türetme', '{0} açar törətmə'],
  mac: ['{0} message authentication', '{0} 消息认证', '{0} 訊息驗證', 'Autenticación de mensajes {0}', 'Autenticazione messaggi {0}', '{0} メッセージ認証', 'Autenticação de mensagens {0}', '{0} 메시지 인증', '{0} mesaj doğrulama', '{0} mesaj autentifikasiyası'],
};
const ALGORITHMS = {
  cipher: { 'chacha20-poly1305': 'ChaCha20-Poly1305', 'xchacha20-poly1305': 'XChaCha20-Poly1305', 'aes-gcm-siv': 'AES-256-GCM-SIV', 'aes-siv': 'AES-256-SIV', 'aes-ccm': 'AES-256-CCM' },
  kdf: { 'argon2id-kdf': 'Argon2id', 'scrypt-kdf': 'scrypt', 'pbkdf2-kdf': 'PBKDF2-HMAC-SHA256', hkdf: 'HKDF-SHA256' },
  mac: { 'hmac-sha256': 'HMAC', 'aes-cmac': 'AES-CMAC', 'aes-128-gmac': 'AES-128-GMAC', 'aes-256-gmac': 'AES-256-GMAC', 'aes-mac': 'AES-CMAC / GMAC' },
};
for (const [operation, algorithms] of Object.entries(ALGORITHMS)) {
  for (const [id, algorithm] of Object.entries(algorithms)) {
    NAMES[id] = localized(OPERATIONS[operation].map(template => template.replace('{0}', algorithm)));
  }
}

export function presentTool(tool) {
  // This technical label is language-neutral; do not translate it via templates.
  const legacyName = tool.id === 'base64' ? localized(LOCALES.map(() => 'Base / Hex')) : tool.name;
  const name = NAMES[tool.id] || localized(LOCALES.map(locale => {
    const value = tool.name[locale];
    return value && value !== tool.name.en ? value : translateMessage(locale, tool.name.en) || value;
  }));
  const category = tool.id.startsWith('pdf-') ? 'document'
    : CATEGORY_OVERRIDES[tool.id] || ({ data: 'developer', encode: 'developer', generate: 'developer' }[tool.category]) || tool.category;
  return {
    ...tool,
    category,
    legacyCategory: tool.category,
    legacyName,
    name,
    aliases: [...new Set([...(tool.aliases || []), ...Object.values(legacyName)])],
  };
}
