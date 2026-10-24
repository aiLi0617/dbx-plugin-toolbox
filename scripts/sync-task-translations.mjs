import fs from "node:fs";

// Run after collect-ui-messages.mjs; preserve translations unrelated to this work.
const rows = `Go home|返回首頁|Ir al inicio|Vai alla home|ホームに戻る|Ir para o início|홈으로 이동|Ana sayfaya git|Ana səhifəyə keç
Open tool library|開啟工具庫|Abrir herramientas|Apri strumenti|ツール一覧を開く|Abrir ferramentas|도구 모음 열기|Araç kitaplığını aç|Alətlər kitabxanasını aç
Open key vault|開啟金鑰庫|Abrir almacén de claves|Apri archivio chiavi|キーボールトを開く|Abrir cofre de chaves|키 보관함 열기|Anahtar kasasını aç|Açar anbarını aç
Toggle sidebar|展開或收合側欄|Mostrar u ocultar barra lateral|Mostra o nascondi barra laterale|サイドバーの表示を切り替え|Mostrar ou ocultar barra lateral|사이드바 전환|Kenar çubuğunu aç/kapat|Yan paneli aç/bağla
Previous open tool|上一個已開啟工具|Herramienta abierta anterior|Strumento aperto precedente|前のツールへ|Ferramenta aberta anterior|이전 열린 도구|Önceki açık araç|Əvvəlki açıq alət
Next open tool|下一個已開啟工具|Siguiente herramienta abierta|Strumento aperto successivo|次のツールへ|Próxima ferramenta aberta|다음 열린 도구|Sonraki açık araç|Növbəti açıq alət
Close current tool|關閉目前工具|Cerrar herramienta actual|Chiudi strumento attuale|現在のツールを閉じる|Fechar ferramenta atual|현재 도구 닫기|Geçerli aracı kapat|Cari aləti bağla
Toggle current tool favorite|切換目前工具收藏|Alternar favorito actual|Attiva o disattiva preferito attuale|現在のツールのお気に入りを切り替え|Alternar favorito atual|현재 도구 즐겨찾기 전환|Geçerli aracı favorilere ekle/çıkar|Cari aləti seçilmişlərə əlavə et/sil
Load current tool demo|載入目前工具範例|Cargar ejemplo de herramienta|Carica esempio dello strumento|現在のツールのサンプルを読み込む|Carregar exemplo da ferramenta|현재 도구 예제 불러오기|Geçerli araç örneğini yükle|Cari alət nümunəsini yüklə
Open shortcut settings|開啟快捷鍵設定|Abrir ajustes de atajos|Apri impostazioni scorciatoie|ショートカット設定を開く|Abrir configurações de atalhos|단축키 설정 열기|Kısayol ayarlarını aç|Qısayol parametrlərini aç
Navigation|導覽|Navegación|Navigazione|ナビゲーション|Navegação|탐색|Gezinme|Naviqasiya
Workspace|工作區|Espacio de trabajo|Area di lavoro|ワークスペース|Área de trabalho|작업 공간|Çalışma alanı|İş sahəsi
Current tool|目前工具|Herramienta actual|Strumento attuale|現在のツール|Ferramenta atual|현재 도구|Geçerli araç|Cari alət
Settings|設定|Ajustes|Impostazioni|設定|Configurações|설정|Ayarlar|Parametrlər
Use a shortcut with Ctrl/Cmd or Alt, or press F1–F12.|請使用含 Ctrl/Cmd、Alt 的組合鍵，或 F1–F12。|Usa Ctrl/Cmd o Alt, o pulsa F1–F12.|Usa Ctrl/Cmd o Alt, oppure premi F1–F12.|Ctrl/Cmd、Alt を含む組み合わせ、または F1–F12 を使用してください。|Use Ctrl/Cmd ou Alt, ou pressione F1–F12.|Ctrl/Cmd 또는 Alt 조합이나 F1–F12를 사용하세요.|Ctrl/Cmd veya Alt içeren bir birleşim ya da F1–F12 kullanın.|Ctrl/Cmd və ya Alt kombinasiyasından, yaxud F1–F12-dən istifadə edin.
Conflicts with another shortcut|與其他快捷鍵衝突|Conflicto con otro atajo|Conflitto con un'altra scorciatoia|他のショートカットと重複しています|Conflito com outro atalho|다른 단축키와 충돌|Başka bir kısayolla çakışıyor|Başqa qısayolla toqquşur
Press keys…|請按鍵…|Pulsa las teclas…|Premi i tasti…|キーを押してください…|Pressione as teclas…|키를 누르세요…|Tuşlara basın…|Düymələrə basın…
Keyboard shortcuts|鍵盤快捷鍵|Atajos de teclado|Scorciatoie da tastiera|キーボードショートカット|Atalhos de teclado|키보드 단축키|Klavye kısayolları|Klaviatura qısayolları
Manage workspace actions and assign direct shortcuts to tools.|管理工作區動作，並為常用工具設定快捷鍵。|Gestiona acciones y asigna atajos a las herramientas.|Gestisci le azioni e assegna scorciatoie agli strumenti.|ワークスペース操作とツールのショートカットを設定します。|Gerencie ações e atribua atalhos às ferramentas.|작업 공간 동작과 도구 단축키를 설정하세요.|Çalışma alanı eylemlerini ve araç kısayollarını yönetin.|İş sahəsi əməliyyatlarını və alət qısayollarını idarə edin.
Search actions or tools…|搜尋動作或工具…|Buscar acciones o herramientas…|Cerca azioni o strumenti…|操作やツールを検索…|Buscar ações ou ferramentas…|동작 또는 도구 검색…|Eylem veya araç ara…|Əməliyyat və ya alət axtar…
Search shortcuts|搜尋快捷鍵|Buscar atajos|Cerca scorciatoie|ショートカットを検索|Buscar atalhos|단축키 검색|Kısayol ara|Qısayol axtar
Open tools directly|工具直達|Abrir herramientas directamente|Apri strumenti direttamente|ツールを直接開く|Abrir ferramentas diretamente|도구 바로 열기|Araçları doğrudan aç|Alətləri birbaşa aç
Search for any tool to bind it. Bound and favorite tools appear when the search is empty.|搜尋工具以設定快捷鍵；未搜尋時顯示已綁定和收藏的工具。|Busca una herramienta para asignarle un atajo. Sin búsqueda se muestran las asignadas y favoritas.|Cerca uno strumento per assegnare una scorciatoia. Senza ricerca appaiono quelli assegnati e preferiti.|ツールを検索してキーを割り当てます。検索が空の場合は割り当て済みとお気に入りを表示します。|Busque uma ferramenta para atribuir um atalho. Sem busca, aparecem as atribuídas e favoritas.|도구를 검색해 단축키를 지정하세요. 검색이 비어 있으면 지정된 도구와 즐겨찾기를 표시합니다.|Kısayol atamak için araç arayın. Arama boşken atanmış ve favori araçlar gösterilir.|Qısayol təyin etmək üçün alət axtarın. Axtarış boş olduqda təyin edilmiş və seçilmiş alətlər göstərilir.
Favorite or search for a tool to assign a shortcut|收藏或搜尋工具以設定快捷鍵|Busca o marca una herramienta como favorita para asignarle un atajo|Cerca uno strumento o aggiungilo ai preferiti per assegnare una scorciatoia|ツールを検索するかお気に入りに追加してキーを割り当てます|Busque ou favorite uma ferramenta para atribuir um atalho|도구를 검색하거나 즐겨찾기에 추가해 단축키를 지정하세요|Kısayol atamak için araç arayın veya favorilere ekleyin|Qısayol təyin etmək üçün aləti axtarın və ya seçilmişlərə əlavə edin
While recording, press Esc to cancel or Backspace/Delete to clear. Shortcuts are disabled in text fields except search, settings, and direct tool bindings.|錄製時按 Esc 取消，按 Backspace/Delete 清除。文字輸入欄內只啟用搜尋、設定與工具直達快捷鍵。|Esc cancela y Backspace/Delete borra. En campos de texto solo funcionan búsqueda, ajustes y acceso directo a herramientas.|Esc annulla e Backspace/Delete cancella. Nei campi di testo funzionano solo ricerca, impostazioni e accesso diretto agli strumenti.|記録中は Esc で取消、Backspace/Delete で解除します。入力欄では検索、設定、ツール直達のみ有効です。|Esc cancela e Backspace/Delete limpa. Em campos de texto, apenas busca, configurações e acesso direto funcionam.|기록 중 Esc로 취소하고 Backspace/Delete로 지웁니다. 텍스트 입력란에서는 검색, 설정, 도구 바로가기만 작동합니다.|Kayıtta Esc iptal eder, Backspace/Delete temizler. Metin alanlarında yalnızca arama, ayarlar ve doğrudan araç kısayolları çalışır.|Qeyd zamanı Esc ləğv edir, Backspace/Delete təmizləyir. Mətn sahələrində yalnız axtarış, parametrlər və birbaşa alət qısayolları işləyir.
Restore all defaults|還原全部預設值|Restaurar valores predeterminados|Ripristina tutti i valori predefiniti|すべて初期値に戻す|Restaurar todos os padrões|모든 기본값 복원|Tüm varsayılanları geri yükle|Bütün standartları bərpa et
Queued|排隊中|En cola|In coda|待機中|Na fila|대기 중|Sırada|Növbədə
Cancelling and cleaning up…|正在取消並清理…|Cancelando y limpiando…|Annullamento e pulizia…|取消とクリーンアップ中…|Cancelando e limpando…|취소 및 정리 중…|İptal ediliyor ve temizleniyor…|Ləğv edilir və təmizlənir…
Cancelled|已取消|Cancelado|Annullato|取消済み|Cancelado|취소됨|İptal edildi|Ləğv edildi
Completed|已完成|Completado|Completato|完了|Concluído|완료됨|Tamamlandı|Tamamlandı
Failed; return to the tool for details|失敗，請返回工具查看詳情|Error; vuelve a la herramienta para ver detalles|Errore; torna allo strumento per i dettagli|失敗しました。詳細はツールで確認してください|Falhou; volte à ferramenta para detalhes|실패했습니다. 도구에서 세부 정보를 확인하세요|Başarısız; ayrıntılar için araca dönün|Uğursuz oldu; təfərrüatlar üçün alətə qayıdın
Preparing…|準備中…|Preparando…|Preparazione…|準備中…|Preparando…|준비 중…|Hazırlanıyor…|Hazırlanır…
Transferring files…|傳輸檔案…|Transfiriendo archivos…|Trasferimento file…|ファイル転送中…|Transferindo arquivos…|파일 전송 중…|Dosyalar aktarılıyor…|Fayllar ötürülür…
Reading document…|讀取文件…|Leyendo documento…|Lettura documento…|文書を読み込み中…|Lendo documento…|문서 읽는 중…|Belge okunuyor…|Sənəd oxunur…
Processing frames…|處理影格…|Procesando fotogramas…|Elaborazione fotogrammi…|フレーム処理中…|Processando quadros…|프레임 처리 중…|Kareler işleniyor…|Kadrlar emal edilir…
Encoding…|編碼中…|Codificando…|Codifica…|エンコード中…|Codificando…|인코딩 중…|Kodlanıyor…|Kodlaşdırılır…
Processing document…|處理文件…|Procesando documento…|Elaborazione documento…|文書処理中…|Processando documento…|문서 처리 중…|Belge işleniyor…|Sənəd emal edilir…
Writing result…|寫入結果…|Escribiendo resultado…|Scrittura risultato…|結果を書き込み中…|Gravando resultado…|결과 쓰는 중…|Sonuç yazılıyor…|Nəticə yazılır…
Rendering pages…|呈現頁面…|Renderizando páginas…|Rendering delle pagine…|ページ描画中…|Renderizando páginas…|페이지 렌더링 중…|Sayfalar oluşturuluyor…|Səhifələr təsvir edilir…
Task manager|任務管理|Gestor de tareas|Gestione attività|タスク管理|Gerenciador de tarefas|작업 관리자|Görev yöneticisi|Tapşırıq meneceri
Session tasks|本次工作階段任務|Tareas de esta sesión|Attività della sessione|このセッションのタスク|Tarefas desta sessão|현재 세션 작업|Oturum görevleri|Sessiya tapşırıqları
Clear finished tasks|清除已結束任務|Borrar tareas terminadas|Cancella attività terminate|終了したタスクを消去|Limpar tarefas encerradas|종료된 작업 지우기|Biten görevleri temizle|Bitmiş tapşırıqları təmizlə`;
const locales = ["zh-TW", "es", "it", "ja", "pt-BR", "ko", "tr", "az"];
const file = new URL("../src/lib/uiMessages.json", import.meta.url);
const messages = JSON.parse(fs.readFileSync(file, "utf8"));
for (const row of rows.split("\n")) {
  const [key, ...values] = row.split("|");
  if (values.length !== locales.length) throw new Error(`Invalid translations: ${key}`);
  if (messages[key]) Object.assign(messages[key], Object.fromEntries(locales.map((locale, index) => [locale, values[index]])));
}
fs.writeFileSync(file, JSON.stringify(messages, null, 2) + "\n");
const allLocales = ["en", "zh-CN", ...locales];
const compact = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, allLocales.map((locale) => value[locale] || "")]));
fs.writeFileSync(new URL("../src/lib/uiMessages.compact.json", import.meta.url), JSON.stringify(compact) + "\n");
