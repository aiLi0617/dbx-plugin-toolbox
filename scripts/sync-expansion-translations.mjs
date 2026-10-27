import fs from "node:fs";
import { EXPANSION_NAMES } from "../src/lib/expansionNames.js";
import { EXPANSION_TOOLS } from "../src/lib/expansionTools.js";
const file = new URL("../src/lib/uiMessages.json", import.meta.url);
const messages = JSON.parse(fs.readFileSync(file, "utf8"));
const locales = ["zh-TW", "es", "it", "ja", "pt-BR", "ko", "tr", "az"];
const traditional = {
  Username: "使用者名稱",
  Password: "密碼",
  "Generate header": "產生認證標頭",
  Pause: "暫停",
  Lap: "計次",
  "Export laps": "匯出計次",
  Category: "類別",
  Calculate: "計算",
  Example: "範例",
  "Network name": "網路名稱",
  Encryption: "加密方式",
  "Open network": "開放網路",
  "Hidden network": "隱藏網路",
  "Generate QR code": "產生二維碼",
  "Export PNG": "匯出 PNG",
  "Export SVG": "匯出 SVG",
};
for (const [key, value] of Object.entries(traditional))
  if (messages[key]) messages[key]["zh-TW"] = value;
const inflectionLoading = [
  "正在載入詞形轉換規則…",
  "Cargando reglas de flexión…",
  "Caricamento delle regole di flessione…",
  "名詞の変換規則を読み込み中…",
  "Carregando regras de flexão…",
  "명사 활용 규칙을 불러오는 중…",
  "İsim çekim kuralları yükleniyor…",
  "İsimlərin dəyişmə qaydaları yüklənir…",
];
for (let i = 0; i < locales.length; i++)
  if (messages["Loading noun inflection rules…"])
    messages["Loading noun inflection rules…"][locales[i]] =
      inflectionLoading[i];
const pdfUi = {
  "LOCAL ONLY": ["僅本機處理", "SOLO LOCAL", "SOLO LOCALE", "ローカル処理のみ", "SOMENTE LOCAL", "로컬 전용", "YALNIZCA YEREL", "YALNIZ YERLİ"],
  "Files are processed only in memory on this device and are never uploaded.": [
    "檔案只會在此裝置的記憶體中處理，不會上傳。",
    "Los archivos se procesan solo en la memoria de este dispositivo y nunca se suben.",
    "I file vengono elaborati solo nella memoria di questo dispositivo e non vengono mai caricati.",
    "ファイルはこの端末のメモリ内だけで処理され、アップロードされません。",
    "Os arquivos são processados apenas na memória deste dispositivo e nunca são enviados.",
    "파일은 이 기기의 메모리에서만 처리되며 업로드되지 않습니다.",
    "Dosyalar yalnızca bu cihazın belleğinde işlenir ve yüklenmez.",
    "Fayllar yalnız bu cihazın yaddaşında işlənir və yüklənmir.",
  ],
  "Load sample": ["載入範例", "Cargar ejemplo", "Carica esempio", "サンプルを読み込む", "Carregar exemplo", "예제 불러오기", "Örneği yükle", "Nümunəni yüklə"],
  "Add or replace files": ["新增或更換檔案", "Añadir o sustituir archivos", "Aggiungi o sostituisci file", "ファイルを追加または変更", "Adicionar ou substituir arquivos", "파일 추가 또는 교체", "Dosya ekle veya değiştir", "Fayl əlavə et və ya dəyişdir"],
  "Choose PDFs to process": ["選擇要處理的 PDF", "Elige los PDF que quieres procesar", "Scegli i PDF da elaborare", "処理する PDF を選択", "Escolha os PDFs para processar", "처리할 PDF 선택", "İşlenecek PDF'leri seç", "İşlənəcək PDF-ləri seç"],
  "Select multiple files and adjust their order before merging.": ["可選擇多個檔案，並在合併前調整順序。", "Selecciona varios archivos y ajusta su orden antes de combinarlos.", "Seleziona più file e regolane l'ordine prima di unirli.", "複数のファイルを選択し、結合前に順序を調整できます。", "Selecione vários arquivos e ajuste a ordem antes de mesclar.", "여러 파일을 선택하고 병합 전에 순서를 조정하세요.", "Birden fazla dosya seçin ve birleştirmeden önce sıralarını ayarlayın.", "Bir neçə fayl seçin və birləşdirməzdən əvvəl sırasını tənzimləyin."],
  "Choose one PDF file to begin.": ["選擇一個 PDF 檔案以開始。", "Elige un archivo PDF para empezar.", "Scegli un file PDF per iniziare.", "PDF ファイルを 1 つ選択してください。", "Escolha um arquivo PDF para começar.", "시작할 PDF 파일을 하나 선택하세요.", "Başlamak için bir PDF dosyası seçin.", "Başlamaq üçün bir PDF faylı seçin."],
  "50 MB per file · 100 MB total · up to 500 pages": ["單一檔案 50 MB · 總計 100 MB · 最多 500 頁", "50 MB por archivo · 100 MB en total · hasta 500 páginas", "50 MB per file · 100 MB totali · fino a 500 pagine", "1 ファイル 50 MB · 合計 100 MB · 最大 500 ページ", "50 MB por arquivo · 100 MB no total · até 500 páginas", "파일당 50MB · 총 100MB · 최대 500페이지", "Dosya başına 50 MB · toplam 100 MB · en fazla 500 sayfa", "Hər fayl üçün 50 MB · cəmi 100 MB · ən çox 500 səhifə"],
  "Selected files": ["已選檔案", "Archivos seleccionados", "File selezionati", "選択したファイル", "Arquivos selecionados", "선택한 파일", "Seçilen dosyalar", "Seçilmiş fayllar"],
  files: ["個檔案", "archivos", "file", "ファイル", "arquivos", "개 파일", "dosya", "fayl"],
  "Move up": ["上移", "Subir", "Sposta su", "上へ移動", "Mover para cima", "위로 이동", "Yukarı taşı", "Yuxarı daşı"],
  "Move down": ["下移", "Bajar", "Sposta giù", "下へ移動", "Mover para baixo", "아래로 이동", "Aşağı taşı", "Aşağı daşı"],
  "Remove {0}": ["移除 {0}", "Eliminar {0}", "Rimuovi {0}", "{0} を削除", "Remover {0}", "{0} 제거", "{0} öğesini kaldır", "{0} faylını sil"],
  "Leave empty for unencrypted files": ["未加密檔案請留空", "Déjalo vacío para archivos sin cifrar", "Lascia vuoto per i file non crittografati", "暗号化されていないファイルでは空欄にします", "Deixe em branco para arquivos não criptografados", "암호화되지 않은 파일은 비워 두세요", "Şifrelenmemiş dosyalar için boş bırakın", "Şifrələnməmiş fayllar üçün boş saxlayın"],
  "Read and configure": ["讀取並設定", "Leer y configurar", "Leggi e configura", "読み込んで設定", "Ler e configurar", "읽기 및 설정", "Oku ve yapılandır", "Oxu və sazla"],
  "Processing settings": ["處理設定", "Ajustes de procesamiento", "Impostazioni di elaborazione", "処理設定", "Configurações de processamento", "처리 설정", "İşleme ayarları", "Emal ayarları"],
  "Run processing": ["執行處理", "Ejecutar procesamiento", "Avvia elaborazione", "処理を実行", "Executar processamento", "처리 실행", "İşlemi çalıştır", "Emalı başlat"],
  "A new file will be created; the original is not modified.": ["將建立新檔案，不會修改原始檔案。", "Se creará un archivo nuevo; el original no se modifica.", "Verrà creato un nuovo file; l'originale non verrà modificato.", "新しいファイルが作成され、元のファイルは変更されません。", "Um novo arquivo será criado; o original não será modificado.", "새 파일이 생성되며 원본은 변경되지 않습니다.", "Yeni bir dosya oluşturulur; orijinal dosya değiştirilmez.", "Yeni fayl yaradılacaq; orijinal fayl dəyişdirilməyəcək."],
  "Processing complete": ["處理完成", "Procesamiento completado", "Elaborazione completata", "処理完了", "Processamento concluído", "처리 완료", "İşlem tamamlandı", "Emal tamamlandı"],
  "Signature inspection report": ["簽章檢查報告", "Informe de inspección de firmas", "Rapporto di verifica delle firme", "署名検査レポート", "Relatório de inspeção de assinaturas", "서명 검사 보고서", "İmza inceleme raporu", "İmza yoxlama hesabatı"],
};
for (const [key, translated] of Object.entries(pdfUi))
  if (messages[key])
    for (let i = 0; i < locales.length; i++) messages[key][locales[i]] = translated[i];
for (const [id, , , en] of EXPANSION_TOOLS) {
  const translated = EXPANSION_NAMES[id];
  if (!translated || !messages[en]) continue;
  for (let i = 0; i < locales.length; i++)
    messages[en][locales[i]] = translated[i];
}
fs.writeFileSync(file, JSON.stringify(messages, null, 2) + "\n");
