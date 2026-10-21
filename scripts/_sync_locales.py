#!/usr/bin/env python3
"""Fill locale keys that English has and the other languages do not."""
import json
import os

BASE = os.path.join("purefusion-feed", "_locales")

# Keys added in English and never copied into the other locale files.
NEW = {
    "ar": {
        "popup_hide_friend_activity": "إخفاء منشورات «أعجب بهذا»",
        "popup_hide_friend_activity_desc": "يزيل المنشورات التي أعجب بها صديق أو علّق عليها فقط",
        "options_filters_hide_friend_activity": "إخفاء «أعجب بهذا» / «علّق على هذا»",
        "options_filters_hide_friend_activity_desc": "يزيل المنشورات التي أدرجها فيسبوك فقط لأن صديقًا أعجب بها أو علّق عليها أو رد عليها. تبقى المنشورات العادية.",
        "popup_hide_stories": "إخفاء القصص",
        "popup_hide_stories_desc": "يزيل شريط القصص أعلى الخلاصة",
        "popup_ad_blocker_on": "✓ جارٍ حجب الإعلانات، بما في ذلك تسميات «برعاية» والشراكة المدفوعة",
        "options_filters_removeAds": "حجب الإعلانات (إشارات البنية التحتية وتسميات الرعاية)",
    },
    "da": {
        "popup_hide_friend_activity": "Skjul opslag med \"Syntes godt om dette\"",
        "popup_hide_friend_activity_desc": "Fjerner opslag, som en ven kun har syntes godt om eller kommenteret",
        "options_filters_hide_friend_activity": "Skjul \"Syntes godt om dette\" / \"Kommenterede dette\"",
        "options_filters_hide_friend_activity_desc": "Fjerner opslag, som Facebook kun indsatte, fordi en ven syntes godt om, kommenterede eller svarede. Almindelige opslag bliver.",
        "popup_hide_stories": "Skjul Stories",
        "popup_hide_stories_desc": "Fjerner Stories-linjen øverst i feedet",
        "popup_ad_blocker_on": "✓ Blokerer annoncer, herunder etiketter for Sponsoreret og Betalt partnerskab",
        "options_filters_removeAds": "Bloker annoncer (infrastruktursignaler og Sponsoreret-etiketter)",
    },
    "de": {
        "popup_hide_friend_activity": "„Gefällt das“-Beiträge ausblenden",
        "popup_hide_friend_activity_desc": "Entfernt Beiträge, die ein Freund nur mit „Gefällt mir“ markiert oder kommentiert hat",
        "options_filters_hide_friend_activity": "„Gefällt das“ / „Hat das kommentiert“ ausblenden",
        "options_filters_hide_friend_activity_desc": "Entfernt Beiträge, die Facebook nur eingefügt hat, weil ein Freund sie mit „Gefällt mir“ markiert, kommentiert oder beantwortet hat. Normale Beiträge bleiben.",
        "popup_hide_stories": "Stories ausblenden",
        "popup_hide_stories_desc": "Entfernt die Stories-Leiste oben im Feed",
        "popup_ad_blocker_on": "✓ Anzeigen werden blockiert, einschließlich Kennzeichnungen für Gesponsert und Bezahlte Partnerschaft",
        "options_filters_removeAds": "Anzeigen blockieren (Infrastruktursignale und Gesponsert-Kennzeichnungen)",
    },
    "es": {
        "popup_hide_friend_activity": "Ocultar publicaciones de «Le gusta esto»",
        "popup_hide_friend_activity_desc": "Elimina publicaciones que un amigo solo marcó con me gusta o comentó",
        "options_filters_hide_friend_activity": "Ocultar «Le gusta esto» / «Comentó esto»",
        "options_filters_hide_friend_activity_desc": "Elimina publicaciones que Facebook insertó solo porque un amigo indicó me gusta, comentó o respondió. Las publicaciones normales se mantienen.",
        "popup_hide_stories": "Ocultar Historias",
        "popup_hide_stories_desc": "Elimina la barra de historias de la parte superior del feed",
        "popup_ad_blocker_on": "✓ Bloqueando anuncios, incluidas las etiquetas de Patrocinado y Colaboración pagada",
        "options_filters_removeAds": "Bloquear anuncios (señales de infraestructura y etiquetas de Patrocinado)",
        "popup_hide_sponsored_posts": "Filtro avanzado de anuncios",
        "options_filters_removeSponsored": "Filtro avanzado de anuncios (detección por etiqueta)",
        "inpage_modal_sponsored": "Filtro avanzado de anuncios",
        "options_theme_preview_chip_filtered": "Anuncios filtrados",
        "options_presets_minimal": "Mínimo",
        "popup_nuke_meta_ai": "Eliminar Meta AI",
        "inpage_modal_sugg": "Ocultar sugeridos y Reels",
        "welcome_god_mode_desc": "Erradicación total de anuncios, reels sugeridos y basura algorítmica.",
        "welcome_god_mode": "Núcleo del Modo Dios",
        "welcome_privacy_ai_desc": "Resume las publicaciones largas y bloquea el clickbait en el dispositivo.",
        "options_sidebar_filters": "🚫 Filtros principales",
        "options_sidebar_data": "💾 Datos y copia de seguridad",
        "options_toast_mode_smart_applied": "Modo inteligente aplicado.",
    },
    "fil": {
        "popup_hide_friend_activity": "Itago ang mga post na \"Ni-like ito\"",
        "popup_hide_friend_activity_desc": "Nag-aalis ng mga post na ni-like o kinomentuhan lang ng kaibigan",
        "options_filters_hide_friend_activity": "Itago ang \"Ni-like ito\" / \"Nagkomento dito\"",
        "options_filters_hide_friend_activity_desc": "Nag-aalis ng mga post na idinagdag ng Facebook dahil lang may kaibigang nag-like, nagkomento, o sumagot. Nanatili ang mga ordinaryong post.",
        "popup_hide_stories": "Itago ang Mga Stories",
        "popup_hide_stories_desc": "Nag-aalis ng Stories bar sa itaas ng feed",
        "popup_ad_blocker_on": "✓ Nagha-block ng mga ad, kasama ang mga label na Sponsored at Paid partnership",
        "options_filters_removeAds": "I-block ang Mga Ad (mga infrastructure signal at Sponsored na label)",
    },
    "fr": {
        "popup_hide_friend_activity": "Masquer les publications « a aimé »",
        "popup_hide_friend_activity_desc": "Supprime les publications qu'un ami a seulement aimées ou commentées",
        "options_filters_hide_friend_activity": "Masquer « a aimé » / « a commenté »",
        "options_filters_hide_friend_activity_desc": "Supprime les publications que Facebook a insérées seulement parce qu'un ami a aimé, commenté ou répondu. Les publications ordinaires restent.",
        "popup_hide_stories": "Masquer les Stories",
        "popup_hide_stories_desc": "Supprime la barre Stories en haut du fil",
        "popup_ad_blocker_on": "✓ Blocage des publicités, y compris les libellés Sponsorisé et Partenariat rémunéré",
        "options_filters_removeAds": "Bloquer les publicités (signaux d'infrastructure et libellés Sponsorisé)",
    },
    "hi": {
        "popup_hide_friend_activity": "\"इसे पसंद किया\" पोस्ट छिपाएं",
        "popup_hide_friend_activity_desc": "उन पोस्ट को हटाता है जिन्हें किसी मित्र ने केवल पसंद किया या उन पर टिप्पणी की",
        "options_filters_hide_friend_activity": "\"इसे पसंद किया\" / \"इस पर टिप्पणी की\" छिपाएं",
        "options_filters_hide_friend_activity_desc": "वे पोस्ट हटाता है जिन्हें Facebook ने केवल इसलिए डाला क्योंकि किसी मित्र ने पसंद किया, टिप्पणी की या जवाब दिया। सामान्य पोस्ट रहती हैं।",
        "popup_hide_stories": "स्टोरीज़ छिपाएं",
        "popup_hide_stories_desc": "फ़ीड के ऊपर वाली स्टोरी बार हटाता है",
        "popup_ad_blocker_on": "✓ विज्ञापन ब्लॉक हो रहे हैं, जिनमें प्रायोजित और सशुल्क साझेदारी लेबल शामिल हैं",
        "options_filters_removeAds": "विज्ञापन ब्लॉक करें (इन्फ्रास्ट्रक्चर संकेत और प्रायोजित लेबल)",
    },
    "id": {
        "popup_hide_friend_activity": "Sembunyikan postingan \"Menyukai ini\"",
        "popup_hide_friend_activity_desc": "Menghapus postingan yang hanya disukai atau dikomentari teman",
        "options_filters_hide_friend_activity": "Sembunyikan \"Menyukai ini\" / \"Mengomentari ini\"",
        "options_filters_hide_friend_activity_desc": "Menghapus postingan yang Facebook sisipkan hanya karena teman menyukai, mengomentari, atau membalas. Postingan biasa tetap ada.",
        "popup_hide_stories": "Sembunyikan Stories",
        "popup_hide_stories_desc": "Menghapus bilah Stories di atas feed",
        "popup_ad_blocker_on": "✓ Memblokir iklan, termasuk label Bersponsor dan Kemitraan berbayar",
        "options_filters_removeAds": "Blokir Iklan (sinyal infrastruktur dan label Bersponsor)",
    },
    "it": {
        "popup_hide_friend_activity": "Nascondi i post \"Ha messo Mi piace\"",
        "popup_hide_friend_activity_desc": "Rimuove i post a cui un amico ha solo messo Mi piace o che ha commentato",
        "options_filters_hide_friend_activity": "Nascondi \"Ha messo Mi piace\" / \"Ha commentato\"",
        "options_filters_hide_friend_activity_desc": "Rimuove i post che Facebook ha inserito solo perché un amico ha messo Mi piace, ha commentato o ha risposto. I post normali restano.",
        "popup_hide_stories": "Nascondi Storie",
        "popup_hide_stories_desc": "Rimuove la barra delle Storie in cima al feed",
        "popup_ad_blocker_on": "✓ Annunci bloccati, incluse le etichette Sponsorizzato e Partnership a pagamento",
        "options_filters_removeAds": "Blocca annunci (segnali infrastrutturali ed etichette Sponsorizzato)",
    },
    "ja": {
        "popup_hide_friend_activity": "「いいね！」した投稿を非表示",
        "popup_hide_friend_activity_desc": "友だちがいいねまたはコメントしただけの投稿を削除",
        "options_filters_hide_friend_activity": "「いいね！」/「コメントしました」を非表示",
        "options_filters_hide_friend_activity_desc": "友だちがいいね、コメント、または返信したためだけに Facebook が挿入した投稿を削除します。通常の投稿は残ります。",
        "popup_hide_stories": "ストーリーズを非表示",
        "popup_hide_stories_desc": "フィード上部のストーリーズバーを削除",
        "popup_ad_blocker_on": "✓ 広告をブロック中（スポンサーと有料パートナーシップのラベルを含む）",
        "options_filters_removeAds": "広告をブロック（インフラシグナルとスポンサーのラベル）",
    },
    "ko": {
        "popup_hide_friend_activity": "\"좋아합니다\" 게시물 숨기기",
        "popup_hide_friend_activity_desc": "친구가 좋아요만 누르거나 댓글만 단 게시물을 제거",
        "options_filters_hide_friend_activity": "\"좋아합니다\" / \"댓글을 남겼습니다\" 숨기기",
        "options_filters_hide_friend_activity_desc": "친구가 좋아요, 댓글 또는 답글을 남겼기 때문에 Facebook이 넣은 게시물만 제거합니다. 일반 게시물은 남습니다.",
        "popup_hide_stories": "스토리 숨기기",
        "popup_hide_stories_desc": "피드 상단의 스토리 막대를 제거",
        "popup_ad_blocker_on": "✓ 광고 차단 중 (스폰서 및 유료 파트너십 라벨 포함)",
        "options_filters_removeAds": "광고 차단 (인프라 신호 및 스폰서 라벨)",
    },
    "nl": {
        "popup_hide_friend_activity": "Verberg \"Vindt dit leuk\"-berichten",
        "popup_hide_friend_activity_desc": "Verwijdert berichten die een vriend alleen leuk vond of waarop alleen is gereageerd",
        "options_filters_hide_friend_activity": "Verberg \"Vindt dit leuk\" / \"Heeft dit becommentarieerd\"",
        "options_filters_hide_friend_activity_desc": "Verwijdert berichten die Facebook alleen invoegde omdat een vriend ze leuk vond, becommentarieerde of beantwoordde. Gewone berichten blijven staan.",
        "popup_hide_stories": "Verberg Stories",
        "popup_hide_stories_desc": "Verwijdert de Stories-balk bovenaan de feed",
        "popup_ad_blocker_on": "✓ Advertenties geblokkeerd, inclusief labels Gesponsord en Betaald partnerschap",
        "options_filters_removeAds": "Advertenties blokkeren (infrastructuursignalen en Gesponsord-labels)",
    },
    "no": {
        "popup_hide_friend_activity": "Skjul innlegg med «Likte dette»",
        "popup_hide_friend_activity_desc": "Fjerner innlegg en venn bare likte eller kommenterte",
        "options_filters_hide_friend_activity": "Skjul «Likte dette» / «Kommenterte dette»",
        "options_filters_hide_friend_activity_desc": "Fjerner innlegg Facebook bare la inn fordi en venn likte, kommenterte eller svarte. Vanlige innlegg blir.",
        "popup_hide_stories": "Skjul Stories",
        "popup_hide_stories_desc": "Fjerner Stories-linjen øverst i feeden",
        "popup_ad_blocker_on": "✓ Blokkerer annonser, inkludert etiketter for Sponset og Betalt partnerskap",
        "options_filters_removeAds": "Blokker annonser (infrastruktursignaler og Sponset-etiketter)",
    },
    "pl": {
        "popup_hide_friend_activity": "Ukryj posty „Polubił to”",
        "popup_hide_friend_activity_desc": "Usuwa posty, które znajomy tylko polubił lub skomentował",
        "options_filters_hide_friend_activity": "Ukryj „Polubił to” / „Skomentował to”",
        "options_filters_hide_friend_activity_desc": "Usuwa posty, które Facebook wstawił tylko dlatego, że znajomy je polubił, skomentował lub na nie odpowiedział. Zwykłe posty zostają.",
        "popup_hide_stories": "Ukryj Stories",
        "popup_hide_stories_desc": "Usuwa pasek Stories u góry kanału",
        "popup_ad_blocker_on": "✓ Blokuję reklamy, w tym etykiety Sponsorowane i Płatne partnerstwo",
        "options_filters_removeAds": "Blokuj reklamy (sygnały infrastruktury i etykiety Sponsorowane)",
    },
    "pt": {
        "popup_hide_friend_activity": "Ocultar publicações de \"Curtiu isto\"",
        "popup_hide_friend_activity_desc": "Remove publicações que um amigo apenas curtiu ou comentou",
        "options_filters_hide_friend_activity": "Ocultar \"Curtiu isto\" / \"Comentou isto\"",
        "options_filters_hide_friend_activity_desc": "Remove publicações que o Facebook inseriu só porque um amigo curtiu, comentou ou respondeu. As publicações normais permanecem.",
        "popup_hide_stories": "Ocultar Stories",
        "popup_hide_stories_desc": "Remove a barra de Stories no topo do feed",
        "popup_ad_blocker_on": "✓ Bloqueando anúncios, incluindo rótulos de Patrocinado e Parceria paga",
        "options_filters_removeAds": "Bloquear Anúncios (sinais de infraestrutura e rótulos de Patrocinado)",
    },
    "ru": {
        "popup_hide_friend_activity": "Скрыть публикации «Нравится»",
        "popup_hide_friend_activity_desc": "Удаляет публикации, которые друг только лайкнул или прокомментировал",
        "options_filters_hide_friend_activity": "Скрыть «Нравится» / «Прокомментировал»",
        "options_filters_hide_friend_activity_desc": "Удаляет публикации, которые Facebook вставил только потому, что друг поставил отметку «Нравится», прокомментировал или ответил. Обычные публикации остаются.",
        "popup_hide_stories": "Скрыть Истории",
        "popup_hide_stories_desc": "Удаляет панель историй вверху ленты",
        "popup_ad_blocker_on": "✓ Блокирую рекламу, включая метки «Реклама» и «Платное партнёрство»",
        "options_filters_removeAds": "Блокировать рекламу (инфраструктурные сигналы и метки «Реклама»)",
    },
    "sv": {
        "popup_hide_friend_activity": "Dölj inlägg med \"Gillade det här\"",
        "popup_hide_friend_activity_desc": "Tar bort inlägg som en vän bara gillade eller kommenterade",
        "options_filters_hide_friend_activity": "Dölj \"Gillade det här\" / \"Kommenterade det här\"",
        "options_filters_hide_friend_activity_desc": "Tar bort inlägg som Facebook bara lade in för att en vän gillade, kommenterade eller svarade. Vanliga inlägg blir kvar.",
        "popup_hide_stories": "Dölj Stories",
        "popup_hide_stories_desc": "Tar bort Stories-fältet högst upp i flödet",
        "popup_ad_blocker_on": "✓ Blockerar annonser, inklusive etiketter för Sponsrad och Betalt partnerskap",
        "options_filters_removeAds": "Blockera annonser (infrastruktursignaler och Sponsrad-etiketter)",
    },
    "tr": {
        "popup_hide_friend_activity": "\"Bunu beğendi\" gönderilerini gizle",
        "popup_hide_friend_activity_desc": "Bir arkadaşın yalnızca beğendiği veya yorum yaptığı gönderileri kaldırır",
        "options_filters_hide_friend_activity": "\"Bunu beğendi\" / \"Bunu yorumladı\" öğesini gizle",
        "options_filters_hide_friend_activity_desc": "Facebook'un yalnızca bir arkadaş beğendiği, yorum yaptığı veya yanıt verdiği için eklediği gönderileri kaldırır. Normal gönderiler kalır.",
        "popup_hide_stories": "Hikayeleri gizle",
        "popup_hide_stories_desc": "Akışın üstündeki Hikayeler çubuğunu kaldırır",
        "popup_ad_blocker_on": "✓ Reklamlar engelleniyor, Sponsorlu ve Ücretli ortaklık etiketleri dahil",
        "options_filters_removeAds": "Reklamları Engelle (altyapı sinyalleri ve Sponsorlu etiketler)",
    },
    "vi": {
        "popup_hide_friend_activity": "Ẩn bài viết \"Đã thích\"",
        "popup_hide_friend_activity_desc": "Xóa bài viết mà bạn bè chỉ thích hoặc bình luận",
        "options_filters_hide_friend_activity": "Ẩn \"Đã thích\" / \"Đã bình luận\"",
        "options_filters_hide_friend_activity_desc": "Xóa bài viết Facebook chỉ chèn vì bạn bè đã thích, bình luận hoặc trả lời. Bài viết thông thường vẫn được giữ lại.",
        "popup_hide_stories": "Ẩn Stories",
        "popup_hide_stories_desc": "Xóa thanh Stories ở đầu feed",
        "popup_ad_blocker_on": "✓ Đang chặn quảng cáo, gồm nhãn Được tài trợ và Hợp tác trả phí",
        "options_filters_removeAds": "Chặn quảng cáo (tín hiệu cơ sở hạ tầng và nhãn Được tài trợ)",
    },
    "zh_TW": {
        "popup_hide_friend_activity": "隱藏「對此按讚」的貼文",
        "popup_hide_friend_activity_desc": "移除朋友只按讚或留言的貼文",
        "options_filters_hide_friend_activity": "隱藏「對此按讚」/「留言了」",
        "options_filters_hide_friend_activity_desc": "移除 Facebook 只因為朋友按讚、留言或回覆而插入的貼文。一般貼文會保留。",
        "popup_hide_stories": "隱藏限時動態",
        "popup_hide_stories_desc": "移除訊息流頂端的限時動態列",
        "popup_ad_blocker_on": "✓ 正在封鎖廣告，包括贊助和付費合作標籤",
        "options_filters_removeAds": "封鎖廣告（基礎架構訊號和贊助標籤）",
    },
}


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save(path, data):
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    with open(path, "wb") as handle:
        handle.write(text.replace("\n", "\r\n").encode("utf-8"))


def main():
    en_path = os.path.join(BASE, "en", "messages.json")
    en = load(en_path)
    required = [
        "popup_hide_friend_activity",
        "popup_hide_friend_activity_desc",
        "options_filters_hide_friend_activity",
        "options_filters_hide_friend_activity_desc",
        "popup_hide_stories",
        "popup_hide_stories_desc",
        "popup_ad_blocker_on",
        "options_filters_removeAds",
    ]

    for loc, updates in NEW.items():
        missing = [key for key in required if key not in updates]
        if missing:
            raise SystemExit(f"{loc} missing translations: {missing}")
        path = os.path.join(BASE, loc, "messages.json")
        data = load(path)
        ordered = {}
        for key in en:
            if key in data:
                ordered[key] = data[key]
            elif key in updates:
                ordered[key] = {"message": updates[key]}
            else:
                raise SystemExit(f"{loc} has no entry for {key}")
        extra = set(data) - set(en)
        if extra:
            raise SystemExit(f"{loc} has extra keys: {sorted(extra)}")
        for key, message in updates.items():
            ordered[key]["message"] = message
        save(path, ordered)
        print(f"updated {loc}")


if __name__ == "__main__":
    main()
