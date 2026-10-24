import fs from "node:fs";

// Settings copy for every supported host locale; run after i18n:sync.
const locales = ["zh-TW", "es", "it", "ja", "pt-BR", "ko", "tr", "az"];
const rows = [
  ["Dark", "深色", "Oscuro", "Scuro", "ダーク", "Escuro", "어둡게", "Koyu", "Tünd"],
  ["Light", "淺色", "Claro", "Chiaro", "ライト", "Claro", "밝게", "Açık", "Açıq"],
  ["Settings sections", "設定分類", "Secciones de ajustes", "Sezioni impostazioni", "設定カテゴリ", "Seções de configurações", "설정 분류", "Ayar bölümleri", "Parametr bölmələri"],
  ["Interface", "介面", "Interfaz", "Interfaccia", "インターフェース", "Interface", "인터페이스", "Arayüz", "İnterfeys"],
  ["Shortcuts", "快捷鍵", "Atajos", "Scorciatoie", "ショートカット", "Atalhos", "단축키", "Kısayollar", "Qısayollar"],
  ["Data & diagnostics", "資料與診斷", "Datos y diagnóstico", "Dati e diagnostica", "データと診断", "Dados e diagnóstico", "데이터 및 진단", "Veri ve tanılama", "Məlumat və diaqnostika"],
  ["Interface preferences", "介面偏好", "Preferencias de interfaz", "Preferenze interfaccia", "表示設定", "Preferências de interface", "인터페이스 설정", "Arayüz tercihleri", "İnterfeys seçimləri"],
  ["Default sidebar state", "側欄預設狀態", "Estado inicial de la barra lateral", "Stato iniziale barra laterale", "サイドバーの初期状態", "Estado inicial da barra lateral", "사이드바 기본 상태", "Varsayılan kenar çubuğu durumu", "Yan panelin ilkin vəziyyəti"],
  ["Whether the sidebar starts collapsed.", "控制啟動時側欄是否收合。", "Indica si la barra lateral inicia contraída.", "Indica se la barra laterale si avvia compressa.", "起動時にサイドバーを折りたたみます。", "Define se a barra lateral inicia recolhida.", "시작 시 사이드바를 접을지 설정합니다.", "Kenar çubuğunun daraltılmış başlamasını belirler.", "Yan panelin yığılmış başlamasını müəyyən edir."],
  ["Collapsed", "已收合", "Contraída", "Compressa", "折りたたみ", "Recolhida", "접힘", "Daraltılmış", "Yığılmış"],
  ["Expanded", "已展開", "Expandida", "Espansa", "展開", "Expandida", "펼침", "Genişletilmiş", "Açılmış"],
  ["Recent tools", "最近使用工具數量", "Herramientas recientes", "Strumenti recenti", "最近のツール数", "Ferramentas recentes", "최근 도구 수", "Son araçlar", "Son alətlər"],
  ["Number of recent tools kept in home and launcher.", "首頁與啟動器保留的最近工具數量。", "Cantidad de herramientas recientes guardadas en inicio y lanzador.", "Numero di strumenti recenti nella home e nel launcher.", "ホームとランチャーに保持する最近のツール数。", "Quantidade de ferramentas recentes no início e iniciador.", "홈과 실행기에 보관할 최근 도구 수입니다.", "Ana sayfa ve başlatıcıda tutulan son araç sayısı.", "Ana səhifədə və başladıcıda saxlanan son alətlərin sayı."],
  ["Controlled by the DBX host.", "由 DBX 宿主管理。", "Controlado por el anfitrión DBX.", "Gestito dall'host DBX.", "DBX ホストが管理します。", "Controlado pelo host DBX.", "DBX 호스트에서 관리합니다.", "DBX ana uygulaması tarafından yönetilir.", "DBX əsas tətbiqi tərəfindən idarə olunur."],
  ["Theme", "主題", "Tema", "Tema", "テーマ", "Tema", "테마", "Tema", "Mövzu"],
  ["Follows the DBX host theme.", "跟隨 DBX 宿主主題。", "Sigue el tema del anfitrión DBX.", "Segue il tema dell'host DBX.", "DBX ホストのテーマに従います。", "Segue o tema do host DBX.", "DBX 호스트 테마를 따릅니다.", "DBX ana uygulamasının temasını izler.", "DBX əsas tətbiqinin mövzusunu izləyir."],
  ["Reset interface", "重設介面偏好", "Restablecer interfaz", "Ripristina interfaccia", "表示設定をリセット", "Redefinir interface", "인터페이스 초기화", "Arayüzü sıfırla", "İnterfeysi sıfırla"],
  ["Assigned shortcuts", "已設定快捷鍵", "Atajos asignados", "Scorciatoie assegnate", "設定済みショートカット", "Atalhos atribuídos", "지정된 단축키", "Atanmış kısayollar", "Təyin edilmiş qısayollar"],
  ["Tool bindings", "工具直達", "Atajos de herramientas", "Scorciatoie strumenti", "ツールへの直接アクセス", "Atalhos de ferramentas", "도구 단축키", "Araç kısayolları", "Alət qısayolları"],
  ["Open shortcut editor", "開啟快捷鍵編輯器", "Abrir editor de atajos", "Apri editor scorciatoie", "ショートカット編集を開く", "Abrir editor de atalhos", "단축키 편집기 열기", "Kısayol düzenleyiciyi aç", "Qısayol redaktorunu aç"],
  ["Record bindings, search tools, and resolve conflicts.", "錄製組合鍵、搜尋工具並檢查衝突。", "Graba atajos, busca herramientas y resuelve conflictos.", "Registra combinazioni, cerca strumenti e risolvi conflitti.", "キーを記録し、ツールを検索して競合を解消します。", "Grave atalhos, busque ferramentas e resolva conflitos.", "단축키를 기록하고 도구를 검색하여 충돌을 해결합니다.", "Kısayol kaydedin, araç arayın ve çakışmaları çözün.", "Qısayolları yazın, alət axtarın və ziddiyyətləri həll edin."],
  ["Edit", "編輯", "Editar", "Modifica", "編集", "Editar", "편집", "Düzenle", "Redaktə et"],
  ["Settings shortcut", "設定中心快捷鍵", "Atajo de ajustes", "Scorciatoia impostazioni", "設定のショートカット", "Atalho de configurações", "설정 단축키", "Ayarlar kısayolu", "Parametrlər qısayolu"],
  ["Open settings center", "開啟設定中心", "Abrir centro de ajustes", "Apri centro impostazioni", "設定センターを開く", "Abrir central de configurações", "설정 센터 열기", "Ayar merkezini aç", "Parametrlər mərkəzini aç"],
  ["Lock the vault after inactivity.", "閒置後自動鎖定金鑰庫。", "Bloquea la bóveda tras inactividad.", "Blocca la cassaforte dopo inattività.", "操作がないときに保管庫をロックします。", "Bloqueia o cofre após inatividade.", "사용하지 않을 때 보관소를 잠급니다.", "Hareketsizlikten sonra kasayı kilitler.", "Fəaliyyətsizlikdən sonra anbarı kilidləyir."],
  ["Export preferences", "匯出偏好", "Exportar preferencias", "Esporta preferenze", "設定をエクスポート", "Exportar preferências", "설정 내보내기", "Tercihleri dışa aktar", "Seçimləri ixrac et"],
  ["Import preferences", "匯入偏好", "Importar preferencias", "Importa preferenze", "設定をインポート", "Importar preferências", "설정 가져오기", "Tercihleri içe aktar", "Seçimləri idxal et"],
  ["Import preview", "匯入預覽", "Vista previa de importación", "Anteprima importazione", "インポートのプレビュー", "Prévia de importação", "가져오기 미리보기", "İçe aktarma önizlemesi", "İdxala ön baxış"],
  ["Replaces shortcuts, interface, vault preferences and favorites. Key material is unchanged.", "將取代快捷鍵、介面、金鑰庫偏好與收藏，不變更金鑰材料。", "Reemplaza atajos, interfaz, preferencias de bóveda y favoritos. Las claves no cambian.", "Sostituisce scorciatoie, interfaccia, preferenze cassaforte e preferiti. Le chiavi restano invariate.", "ショートカット、表示、保管庫の設定、お気に入りを置き換えます。鍵データは変更しません。", "Substitui atalhos, interface, preferências do cofre e favoritos. As chaves permanecem intactas.", "단축키, 인터페이스, 보관소 설정과 즐겨찾기를 바꿉니다. 키 자료는 유지됩니다.", "Kısayolları, arayüzü, kasa tercihlerini ve favorileri değiştirir. Anahtarlar değişmez.", "Qısayolları, interfeysi, anbar seçimlərini və sevimliləri əvəz edir. Açarlar dəyişmir."],
  ["Load into draft", "載入草稿", "Cargar en borrador", "Carica nella bozza", "下書きに読み込む", "Carregar no rascunho", "초안에 불러오기", "Taslağa yükle", "Qaralamaya yüklə"],
  ["Clear preferences", "清除偏好設定", "Borrar preferencias", "Cancella preferenze", "設定を消去", "Limpar preferências", "설정 지우기", "Tercihleri temizle", "Seçimləri təmizlə"],
  ["Preferences version", "偏好版本", "Versión de preferencias", "Versione preferenze", "設定のバージョン", "Versão das preferências", "설정 버전", "Tercih sürümü", "Seçimlərin versiyası"],
  ["Unavailable", "無法取得", "No disponible", "Non disponibile", "利用不可", "Indisponível", "사용 불가", "Kullanılamıyor", "Mövcud deyil"],
  ["Backend", "後端", "Servidor local", "Backend locale", "バックエンド", "Servidor local", "백엔드", "Arka uç", "Arxa tərəf"],
  ["Connected", "已連線", "Conectado", "Connesso", "接続済み", "Conectado", "연결됨", "Bağlı", "Qoşulub"],
  ["User agent", "使用者代理", "Agente de usuario", "Agente utente", "ユーザーエージェント", "Agente do usuário", "사용자 에이전트", "Kullanıcı aracısı", "İstifadəçi agenti"],
  ["Platform", "平台", "Plataforma", "Piattaforma", "プラットフォーム", "Plataforma", "플랫폼", "Platform", "Platforma"],
  ["Time zone", "時區", "Zona horaria", "Fuso orario", "タイムゾーン", "Fuso horário", "시간대", "Saat dilimi", "Saat qurşağı"],
  ["Bound tools", "已綁定工具", "Herramientas vinculadas", "Strumenti associati", "割り当て済みツール", "Ferramentas vinculadas", "연결된 도구", "Bağlı araçlar", "Bağlanmış alətlər"],
  ["Diagnostics", "診斷資訊", "Diagnóstico", "Diagnostica", "診断情報", "Diagnóstico", "진단 정보", "Tanılama", "Diaqnostika"],
  ["Exports exclude keys, passwords, and tool inputs.", "匯出檔案不包含金鑰、密碼或工具輸入內容。", "Las exportaciones excluyen claves, contraseñas y entradas de herramientas.", "Le esportazioni escludono chiavi, password e contenuti degli strumenti.", "鍵、パスワード、ツールへの入力はエクスポートに含めません。", "Exportações excluem chaves, senhas e entradas das ferramentas.", "내보내기에 키, 비밀번호, 도구 입력은 포함되지 않습니다.", "Dışa aktarmalar anahtarları, parolaları ve araç girdilerini içermez.", "İxraca açarlar, parollar və alət girişləri daxil deyil."],
  ["Clear settings, favorites and recents? Vault contents will be kept.", "清除設定、收藏與最近記錄？金鑰庫內容將保留。", "¿Borrar ajustes, favoritos y recientes? Se conservará la bóveda.", "Cancellare impostazioni, preferiti e recenti? Il contenuto della cassaforte sarà conservato.", "設定、お気に入り、履歴を消去しますか？保管庫の内容は保持されます。", "Limpar configurações, favoritos e recentes? O conteúdo do cofre será mantido.", "설정, 즐겨찾기와 최근 기록을 지울까요? 보관소 내용은 유지됩니다.", "Ayarlar, favoriler ve geçmiş temizlensin mi? Kasa içeriği korunur.", "Parametrlər, sevimlilər və son qeydlər təmizlənsin? Anbar məzmunu saxlanacaq."],
  ["Preferences exported.", "偏好設定已匯出。", "Preferencias exportadas.", "Preferenze esportate.", "設定をエクスポートしました。", "Preferências exportadas.", "설정을 내보냈습니다.", "Tercihler dışa aktarıldı.", "Seçimlər ixrac edildi."],
  ["Import loaded into draft. Save changes to apply.", "匯入已載入草稿，請儲存變更。", "Importación cargada en borrador. Guarda para aplicar.", "Importazione caricata nella bozza. Salva per applicare.", "下書きに読み込みました。保存して適用してください。", "Importação carregada no rascunho. Salve para aplicar.", "초안에 불러왔습니다. 저장하여 적용하세요.", "İçe aktarma taslağa yüklendi. Uygulamak için kaydedin.", "İdxal qaralamaya yükləndi. Tətbiq etmək üçün saxlayın."],
  ["Preference clearing is pending. Save changes to apply.", "清除操作已加入草稿，請儲存變更。", "Borrado pendiente. Guarda para aplicar.", "Cancellazione in attesa. Salva per applicare.", "消去は保留中です。保存して適用してください。", "Limpeza pendente. Salve para aplicar.", "설정 삭제가 대기 중입니다. 저장하여 적용하세요.", "Tercih temizleme bekliyor. Uygulamak için kaydedin.", "Seçimlərin təmizlənməsi gözləyir. Tətbiq etmək üçün saxlayın."],
];
const path = "src/lib/uiMessages.json";
const messages = JSON.parse(fs.readFileSync(path, "utf8"));
for (const [key, ...translations] of rows) {
  if (!messages[key]) continue; // Retired copy is removed by i18n:sync.
  locales.forEach((locale, i) => { messages[key][locale] = translations[i]; });
}
fs.writeFileSync(path, JSON.stringify(messages, null, 2) + "\n");
const order = ["en", "zh-CN", "zh-TW", "es", "it", "ja", "pt-BR", "ko", "tr", "az"];
fs.writeFileSync("src/lib/uiMessages.compact.json", JSON.stringify(Object.fromEntries(Object.entries(messages).map(([key, entry]) => [key, order.map(locale => entry[locale] || "")]))) + "\n");
console.log(`Updated ${rows.length} settings messages in ${locales.length} locales`);
