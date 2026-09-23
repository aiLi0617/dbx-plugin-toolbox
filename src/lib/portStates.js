import { localize } from "./locale.js";

const copy = (en, zhCN, zhTW, es, it, ja, ptBR, ko, tr, az) => ({
  en, "zh-CN": zhCN, "zh-TW": zhTW, es, it, ja, "pt-BR": ptBR, ko, tr, az,
});

const LISTENING = copy("Listening", "监听中", "監聽中", "Escuchando", "In ascolto", "待機中", "Em escuta", "수신 대기", "Dinleniyor", "Dinlənilir");

const STATE_LABELS = Object.freeze({
  CLOSED: copy("Closed", "已关闭", "已關閉", "Cerrado", "Chiuso", "クローズ", "Fechado", "닫힘", "Kapalı", "Bağlıdır"),
  LISTEN: LISTENING,
  LISTENING,
  SYNSENT: copy("SYN sent", "SYN 已发送", "SYN 已傳送", "SYN enviado", "SYN inviato", "SYN 送信済み", "SYN enviado", "SYN 전송됨", "SYN gönderildi", "SYN göndərildi"),
  SYNRECEIVED: copy("SYN received", "SYN 已接收", "SYN 已接收", "SYN recibido", "SYN ricevuto", "SYN 受信済み", "SYN recebido", "SYN 수신됨", "SYN alındı", "SYN alındı"),
  ESTABLISHED: copy("Established", "已建立", "已建立", "Establecida", "Stabilita", "接続済み", "Estabelecida", "연결됨", "Kuruldu", "Qurulub"),
  FINWAIT1: copy("Finish wait 1", "等待结束 1", "等待結束 1", "Espera de cierre 1", "Attesa chiusura 1", "終了待機 1", "Espera de encerramento 1", "종료 대기 1", "Kapanma bekleme 1", "Bağlanma gözləməsi 1"),
  FINWAIT2: copy("Finish wait 2", "等待结束 2", "等待結束 2", "Espera de cierre 2", "Attesa chiusura 2", "終了待機 2", "Espera de encerramento 2", "종료 대기 2", "Kapanma bekleme 2", "Bağlanma gözləməsi 2"),
  CLOSEWAIT: copy("Close wait", "等待关闭", "等待關閉", "Espera de cierre", "Attesa chiusura", "クローズ待機", "Espera de fechamento", "닫기 대기", "Kapanma bekleniyor", "Bağlanma gözlənilir"),
  CLOSING: copy("Closing", "正在关闭", "正在關閉", "Cerrando", "Chiusura", "クローズ中", "Fechando", "닫는 중", "Kapatılıyor", "Bağlanır"),
  LASTACK: copy("Last acknowledgement", "等待最终确认", "等待最終確認", "Última confirmación", "Ultima conferma", "最終確認待ち", "Última confirmação", "최종 확인 대기", "Son onay bekleniyor", "Son təsdiq gözlənilir"),
  TIMEWAIT: copy("Time wait", "等待释放", "等待釋放", "Espera de liberación", "Attesa rilascio", "解放待機", "Espera de liberação", "해제 대기", "Serbest bırakma bekleniyor", "Buraxılma gözlənilir"),
  DELETETCB: copy("Deleting connection", "正在删除连接", "正在刪除連線", "Eliminando conexión", "Eliminazione connessione", "接続を削除中", "Excluindo conexão", "연결 삭제 중", "Bağlantı siliniyor", "Bağlantı silinir"),
  BOUND: copy("Bound", "已绑定", "已繫結", "Vinculado", "Associato", "バインド済み", "Vinculado", "바인딩됨", "Bağlandı", "Bağlanıb"),
  IDLE: copy("Idle", "空闲", "閒置", "Inactivo", "Inattivo", "アイドル", "Ocioso", "유휴", "Boşta", "Boşdur"),
  UDP: copy("UDP", "UDP", "UDP", "UDP", "UDP", "UDP", "UDP", "UDP", "UDP", "UDP"),
});

export function normalizePortState(value) {
  return String(value ?? "").trim().replace(/[\s_-]+/g, "").toUpperCase();
}

export function localizePortState(locale, value) {
  const raw = String(value ?? "").trim();
  return localize(locale, STATE_LABELS[normalizePortState(raw)]) || raw;
}

