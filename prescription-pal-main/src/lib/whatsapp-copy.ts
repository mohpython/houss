/** Localized WhatsApp bot copy (fr / en / ar). No medical detail in menus. */

export type BotLang = "fr" | "en" | "ar";

export function botLang(value?: string | null): BotLang {
  return value === "en" || value === "ar" ? value : "fr";
}

type Copy = {
  welcome: string;
  welcomeHeader: string;
  btnSendRx: string;
  btnNoRx: string;
  btnTrack: string;
  askPhoto: string;
  photoReceived: string;
  analyzing: string;
  extractionFailed: string;
  noMedicines: string;
  medicinesHeader: string;
  confirmQuestion: string;
  btnConfirm: string;
  btnRetry: string;
  askLocation: string;
  locationMissing: string;
  neighborhoodPick: (names: string[]) => string;
  neighborhoodNotFound: string;
  searching: string;
  routed: (p: { pharmacy: string; address: string; distance: string; ref: string }) => string;
  noPharmacy: string;
  courierAssigned: (name: string) => string;
  courierPending: string;
  askFreeOrder: string;
  freeOrderSaved: string;
  trackNone: string;
  trackHeader: string;
  statusLine: (p: { ref: string; pharmacy: string; status: string; delivery: string }) => string;
  fallback: string;
  unsupported: string;
  error: string;
  linkedAccount: (url: string) => string;
  // Fulfillment choice (same as the site: pickup or courier delivery)
  askFulfillment: string;
  btnDelivery: string;
  btnPickup: string;
  // Price recap + confirmation
  orderSummary: (p: {
    pharmacy: string;
    address: string;
    distance: string;
    items: string;
    itemsTotal: string;
    fee: string;
    total: string;
    method: string;
    ref: string;
  }) => string;
  btnOrderConfirm: string;
  btnOrderCancel: string;
  orderCancelled: string;
  // Payment + validation codes
  paymentInstructions: (p: { total: string; orange: string; moov: string; ref: string }) => string;
  codesMessage: (p: { pickup: string; receipt: string }) => string;
  // Review + feedback
  reviewNotice: string;
  feedbackAskRating: string;
  feedbackAskComment: string;
  feedbackThanks: string;
  feedbackInvalid: string;
};

const STATUS: Record<BotLang, Record<string, string>> = {
  fr: {
    pending: "En attente de la pharmacie",
    accepted: "Acceptée par la pharmacie",
    rejected: "Refusée",
    ready: "Prête",
    completed: "Terminée",
    cancelled: "Annulée",
    unassigned: "Livreur non assigné",
    assigned: "Livreur assigné",
    picked_up: "Colis récupéré",
    en_route: "En route",
    delivered: "Livrée",
    failed: "Échec de livraison",
  },
  en: {
    pending: "Waiting for the pharmacy",
    accepted: "Accepted by the pharmacy",
    rejected: "Declined",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
    unassigned: "No courier yet",
    assigned: "Courier assigned",
    picked_up: "Picked up",
    en_route: "On the way",
    delivered: "Delivered",
    failed: "Delivery failed",
  },
  ar: {
    pending: "في انتظار الصيدلية",
    accepted: "قبلتها الصيدلية",
    rejected: "مرفوضة",
    ready: "جاهزة",
    completed: "مكتملة",
    cancelled: "ملغاة",
    unassigned: "لا يوجد موصّل بعد",
    assigned: "تم تعيين موصّل",
    picked_up: "تم الاستلام",
    en_route: "في الطريق",
    delivered: "تم التسليم",
    failed: "فشل التوصيل",
  },
};

export function statusLabel(lang: BotLang, key: string): string {
  return STATUS[lang][key] ?? key;
}

export const COPY: Record<BotLang, Copy> = {
  fr: {
    welcomeHeader: "SAHA Santé",
    welcome:
      "Bonjour 👋\nJe suis l'assistant SAHA Santé. Je peux transmettre votre ordonnance à une pharmacie partenaire et organiser la livraison.\n\nQue souhaitez-vous faire ?",
    btnSendRx: "Envoyer ordonnance",
    btnNoRx: "Sans ordonnance",
    btnTrack: "Suivre ma commande",
    askPhoto:
      "📸 Envoyez une *photo nette* de votre ordonnance (ou un PDF).\nAssurez-vous que le nom du médecin, la date et les médicaments sont lisibles.",
    photoReceived: "✅ Ordonnance reçue.",
    analyzing: "🤖 Analyse en cours par l'IA…",
    extractionFailed:
      "❌ Je n'ai pas pu lire cette ordonnance :\n%s\n\nRenvoyez une photo plus nette, bien éclairée et complète.",
    noMedicines: "Aucun médicament n'a été détecté. Renvoyez une photo plus nette svp.",
    medicinesHeader: "💊 Médicaments détectés :",
    confirmQuestion: "Est-ce correct ?",
    btnConfirm: "Confirmer",
    btnRetry: "Reprendre photo",
    askLocation:
      "📍 Où livrer ?\n• Partagez votre position (📎 > Localisation), ou\n• Écrivez le nom du *quartier* de livraison (ex. Daoudabougou) si c'est ailleurs.\n\nJe trouverai la pharmacie partenaire la plus proche qui a *tous* vos médicaments en stock.",
    locationMissing:
      "J'ai besoin du lieu de livraison : partagez votre position (📎 > Localisation) ou écrivez le nom du quartier (ex. Hamdallaye ACI).",
    neighborhoodPick: (names) =>
      `Plusieurs quartiers correspondent. Répondez avec le numéro :\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    neighborhoodNotFound:
      "Je ne connais pas ce quartier. Vérifiez l'orthographe (ex. Daoudabougou, Badalabougou, Kalaban Coura) ou partagez votre position.",
    searching: "🔎 Recherche de la pharmacie la plus proche ayant tout en stock…",
    routed: ({ pharmacy, address, distance, ref }) =>
      `✅ Commande transmise !\n\n🏥 *${pharmacy}*\n📍 ${address}\n📏 ${distance} km\n🔖 Réf. ${ref}\n\nLa pharmacie prépare votre commande. Vous recevrez un message à chaque étape.`,
    noPharmacy:
      "😔 Aucune pharmacie partenaire n'a la totalité de vos médicaments en stock pour le moment. Réessayez plus tard ou contactez-nous.",
    courierAssigned: (name) => `🛵 Livreur assigné : ${name}. Il récupérera votre commande dès qu'elle sera prête.`,
    courierPending: "🛵 Un livreur sera assigné dès que la pharmacie aura préparé la commande.",
    askFreeOrder:
      "✍️ Écrivez la liste des médicaments souhaités (un par ligne). Attention : les médicaments sur ordonnance nécessitent une ordonnance valide.",
    freeOrderSaved:
      "✅ Demande enregistrée. Partagez maintenant votre position pour trouver la pharmacie la plus proche.",
    trackNone: "Vous n'avez aucune commande en cours.",
    trackHeader: "📦 Vos dernières commandes :",
    statusLine: ({ ref, pharmacy, status, delivery }) =>
      `🔖 ${ref} — ${pharmacy}\n   • Commande : ${status}\n   • Livraison : ${delivery}`,
    fallback: "Je n'ai pas compris. Voici le menu :",
    unsupported: "Ce type de message n'est pas pris en charge. Envoyez une photo ou du texte.",
    error: "⚠️ Une erreur est survenue. Réessayez dans un instant.",
    linkedAccount: (url) => `Suivi détaillé et carte en direct : ${url}`,
    askFulfillment: "Comment souhaitez-vous récupérer votre commande ?",
    btnDelivery: "🛵 Livraison",
    btnPickup: "🏬 Je viens la chercher",
    orderSummary: ({ pharmacy, address, distance, items, itemsTotal, fee, total, method, ref }) =>
      `🧾 *Récapitulatif — Réf. ${ref}*\n\n🏥 ${pharmacy}\n📍 ${address}\n📏 ${distance} km\n${method}\n\n${items}\n\nProduits : ${itemsTotal}\nLivraison : ${fee}\n*Total : ${total}*\n\nConfirmez-vous la commande ?`,
    btnOrderConfirm: "✅ Je confirme",
    btnOrderCancel: "❌ Annuler",
    orderCancelled: "Commande annulée. Revenez quand vous voulez !",
    paymentInstructions: ({ total, orange, moov, ref }) =>
      `💳 *Paiement — ${total}*\n\n• Orange Money : ${orange}\n• Moov Money : ${moov}\n\nIndiquez la référence *${ref}* dans le motif du transfert, puis envoyez la référence de transaction sur la page de paiement :`,
    codesMessage: ({ pickup, receipt }) =>
      `🔐 *Vos codes de validation*\n\n• Code retrait (à donner à la pharmacie / au livreur) : *${pickup}*\n• Code réception (à donner uniquement quand vous avez vos médicaments en main) : *${receipt}*\n\nNe partagez jamais le code réception avant d'avoir reçu le colis.`,
    reviewNotice:
      "🕵️ Votre ordonnance présente un point à vérifier (date, lisibilité ou authenticité). Elle vient d'être transmise à notre équipe : vous recevrez un message dès qu'elle sera validée.",
    feedbackAskRating:
      "⭐ Votre commande est terminée ! Notez votre expérience de 1 à 5 (répondez simplement avec le chiffre).",
    feedbackAskComment: "Merci ! Un commentaire à ajouter ? (écrivez-le, ou répondez *non*)",
    feedbackThanks: "🙏 Merci pour votre avis, il nous aide à améliorer SAHA Santé !",
    feedbackInvalid: "Répondez avec un chiffre de 1 à 5 pour noter votre expérience.",
  },
  en: {
    welcomeHeader: "SAHA Santé",
    welcome:
      "Hello 👋\nI'm the SAHA Santé assistant. I can send your prescription to a partner pharmacy and arrange delivery.\n\nWhat would you like to do?",
    btnSendRx: "Send prescription",
    btnNoRx: "Without Rx",
    btnTrack: "Track my order",
    askPhoto:
      "📸 Send a *clear photo* of your prescription (or a PDF).\nMake sure the doctor name, date and medicines are readable.",
    photoReceived: "✅ Prescription received.",
    analyzing: "🤖 AI analysis in progress…",
    extractionFailed:
      "❌ I couldn't read this prescription:\n%s\n\nPlease send a sharper, well-lit and complete photo.",
    noMedicines: "No medicine was detected. Please send a clearer photo.",
    medicinesHeader: "💊 Detected medicines:",
    confirmQuestion: "Is this correct?",
    btnConfirm: "Confirm",
    btnRetry: "Retake photo",
    askLocation:
      "📍 Where should we deliver?\n• Share your location (📎 > Location), or\n• Type the name of the delivery *neighborhood* (e.g. Daoudabougou) if it's elsewhere.\n\nI'll find the nearest partner pharmacy with *all* your medicines in stock.",
    locationMissing:
      "I need the delivery place: share your location (📎 > Location) or type the neighborhood name (e.g. Hamdallaye ACI).",
    neighborhoodPick: (names) =>
      `Several neighborhoods match. Reply with the number:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    neighborhoodNotFound:
      "I don't know that neighborhood. Check the spelling (e.g. Daoudabougou, Badalabougou, Kalaban Coura) or share your location.",
    searching: "🔎 Looking for the nearest pharmacy with everything in stock…",
    routed: ({ pharmacy, address, distance, ref }) =>
      `✅ Order sent!\n\n🏥 *${pharmacy}*\n📍 ${address}\n📏 ${distance} km\n🔖 Ref. ${ref}\n\nThe pharmacy is preparing your order. You'll get a message at each step.`,
    noPharmacy:
      "😔 No partner pharmacy currently has all your medicines in stock. Please try again later.",
    courierAssigned: (name) => `🛵 Courier assigned: ${name}. They'll pick up your order once ready.`,
    courierPending: "🛵 A courier will be assigned as soon as the pharmacy prepares the order.",
    askFreeOrder:
      "✍️ Write the list of medicines you need (one per line). Note: prescription-only drugs require a valid prescription.",
    freeOrderSaved: "✅ Request saved. Now share your location to find the nearest pharmacy.",
    trackNone: "You have no ongoing order.",
    trackHeader: "📦 Your latest orders:",
    statusLine: ({ ref, pharmacy, status, delivery }) =>
      `🔖 ${ref} — ${pharmacy}\n   • Order: ${status}\n   • Delivery: ${delivery}`,
    fallback: "I didn't understand. Here's the menu:",
    unsupported: "This message type isn't supported. Send a photo or text.",
    error: "⚠️ Something went wrong. Please try again shortly.",
    linkedAccount: (url) => `Detailed tracking and live map: ${url}`,
    askFulfillment: "How would you like to get your order?",
    btnDelivery: "🛵 Delivery",
    btnPickup: "🏬 I'll pick it up",
    orderSummary: ({ pharmacy, address, distance, items, itemsTotal, fee, total, method, ref }) =>
      `🧾 *Summary — Ref. ${ref}*\n\n🏥 ${pharmacy}\n📍 ${address}\n📏 ${distance} km\n${method}\n\n${items}\n\nProducts: ${itemsTotal}\nDelivery: ${fee}\n*Total: ${total}*\n\nDo you confirm the order?`,
    btnOrderConfirm: "✅ Confirm",
    btnOrderCancel: "❌ Cancel",
    orderCancelled: "Order cancelled. Come back anytime!",
    paymentInstructions: ({ total, orange, moov, ref }) =>
      `💳 *Payment — ${total}*\n\n• Orange Money: ${orange}\n• Moov Money: ${moov}\n\nUse reference *${ref}* in the transfer note, then enter the transaction reference on the payment page:`,
    codesMessage: ({ pickup, receipt }) =>
      `🔐 *Your validation codes*\n\n• Pickup code (give to the pharmacy / courier): *${pickup}*\n• Receipt code (give ONLY once you have your medicines in hand): *${receipt}*\n\nNever share the receipt code before receiving the parcel.`,
    reviewNotice:
      "🕵️ Your prescription has a point to verify (date, readability or authenticity). It has been sent to our team: you'll get a message as soon as it's validated.",
    feedbackAskRating:
      "⭐ Your order is complete! Rate your experience from 1 to 5 (just reply with the number).",
    feedbackAskComment: "Thanks! Any comment to add? (write it, or reply *no*)",
    feedbackThanks: "🙏 Thank you for your feedback, it helps us improve SAHA Santé!",
    feedbackInvalid: "Reply with a number from 1 to 5 to rate your experience.",
  },
  ar: {
    welcomeHeader: "SAHA Santé",
    welcome:
      "مرحباً 👋\nأنا مساعد SAHA Santé. يمكنني إرسال وصفتك الطبية إلى صيدلية شريكة وتنظيم التوصيل.\n\nماذا تريد أن تفعل؟",
    btnSendRx: "إرسال وصفة",
    btnNoRx: "بدون وصفة",
    btnTrack: "تتبع طلبي",
    askPhoto:
      "📸 أرسل *صورة واضحة* لوصفتك الطبية (أو ملف PDF).\nتأكد من وضوح اسم الطبيب والتاريخ والأدوية.",
    photoReceived: "✅ تم استلام الوصفة.",
    analyzing: "🤖 جاري التحليل بالذكاء الاصطناعي…",
    extractionFailed: "❌ لم أتمكن من قراءة هذه الوصفة:\n%s\n\nأرسل صورة أوضح وكاملة.",
    noMedicines: "لم يتم اكتشاف أي دواء. أرسل صورة أوضح من فضلك.",
    medicinesHeader: "💊 الأدوية المكتشفة:",
    confirmQuestion: "هل هذا صحيح؟",
    btnConfirm: "تأكيد",
    btnRetry: "إعادة الصورة",
    askLocation:
      "📍 أين نوصّل؟\n• شارك موقعك (📎 > الموقع)، أو\n• اكتب اسم *الحي* المراد التوصيل إليه (مثال: Daoudabougou) إن كان مكاناً آخر.\n\nسأجد أقرب صيدلية شريكة تتوفر فيها *كل* أدويتك.",
    locationMissing:
      "أحتاج إلى مكان التوصيل: شارك موقعك (📎 > الموقع) أو اكتب اسم الحي (مثال: Hamdallaye ACI).",
    neighborhoodPick: (names) =>
      `عدة أحياء مطابقة. أجب بالرقم:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    neighborhoodNotFound:
      "لا أعرف هذا الحي. تحقق من الكتابة (مثال: Daoudabougou, Badalabougou, Kalaban Coura) أو شارك موقعك.",
    searching: "🔎 البحث عن أقرب صيدلية تتوفر فيها كل الأدوية…",
    routed: ({ pharmacy, address, distance, ref }) =>
      `✅ تم إرسال الطلب!\n\n🏥 *${pharmacy}*\n📍 ${address}\n📏 ${distance} كم\n🔖 المرجع ${ref}\n\nالصيدلية تحضّر طلبك. ستصلك رسالة عند كل مرحلة.`,
    noPharmacy: "😔 لا توجد صيدلية شريكة تتوفر فيها كل أدويتك حالياً. حاول لاحقاً.",
    courierAssigned: (name) => `🛵 تم تعيين موصّل: ${name}.`,
    courierPending: "🛵 سيتم تعيين موصّل بمجرد تجهيز الطلب.",
    askFreeOrder: "✍️ اكتب قائمة الأدوية المطلوبة (دواء في كل سطر).",
    freeOrderSaved: "✅ تم حفظ الطلب. شارك الآن موقعك للعثور على أقرب صيدلية.",
    trackNone: "ليس لديك أي طلب جارٍ.",
    trackHeader: "📦 آخر طلباتك:",
    statusLine: ({ ref, pharmacy, status, delivery }) =>
      `🔖 ${ref} — ${pharmacy}\n   • الطلب: ${status}\n   • التوصيل: ${delivery}`,
    fallback: "لم أفهم. إليك القائمة:",
    unsupported: "هذا النوع من الرسائل غير مدعوم. أرسل صورة أو نصاً.",
    error: "⚠️ حدث خطأ. أعد المحاولة بعد قليل.",
    linkedAccount: (url) => `تتبع مفصل وخريطة مباشرة: ${url}`,
    askFulfillment: "كيف تريد استلام طلبك؟",
    btnDelivery: "🛵 توصيل",
    btnPickup: "🏬 سآتي لأخذه",
    orderSummary: ({ pharmacy, address, distance, items, itemsTotal, fee, total, method, ref }) =>
      `🧾 *ملخص — المرجع ${ref}*\n\n🏥 ${pharmacy}\n📍 ${address}\n📏 ${distance} كم\n${method}\n\n${items}\n\nالمنتجات: ${itemsTotal}\nالتوصيل: ${fee}\n*المجموع: ${total}*\n\nهل تؤكد الطلب؟`,
    btnOrderConfirm: "✅ أؤكد",
    btnOrderCancel: "❌ إلغاء",
    orderCancelled: "تم إلغاء الطلب. عد متى شئت!",
    paymentInstructions: ({ total, orange, moov, ref }) =>
      `💳 *الدفع — ${total}*\n\n• Orange Money: ${orange}\n• Moov Money: ${moov}\n\nاذكر المرجع *${ref}* في سبب التحويل، ثم أدخل مرجع العملية في صفحة الدفع:`,
    codesMessage: ({ pickup, receipt }) =>
      `🔐 *رموز التحقق*\n\n• رمز الاستلام (للصيدلية / الموصّل): *${pickup}*\n• رمز التسليم (فقط عند استلام أدويتك): *${receipt}*\n\nلا تشارك رمز التسليم قبل استلام الطرد.`,
    reviewNotice:
      "🕵️ وصفتك تحتاج إلى تحقق (التاريخ أو الوضوح أو الأصالة). تم إرسالها إلى فريقنا وستصلك رسالة فور التحقق منها.",
    feedbackAskRating: "⭐ اكتمل طلبك! قيّم تجربتك من 1 إلى 5 (أجب بالرقم فقط).",
    feedbackAskComment: "شكراً! هل تريد إضافة تعليق؟ (اكتبه أو أجب *لا*)",
    feedbackThanks: "🙏 شكراً لرأيك، يساعدنا على تحسين SAHA Santé!",
    feedbackInvalid: "أجب برقم من 1 إلى 5 لتقييم تجربتك.",
  },
};

/** Detects a language switch command like "english", "عربي", "français". */
export function detectLangCommand(text: string): BotLang | null {
  const t = text.trim().toLowerCase();
  if (/^(en|english|anglais)$/.test(t)) return "en";
  if (/^(fr|français|francais|french)$/.test(t)) return "fr";
  if (/^(ar|arabe|arabic|عربي|العربية)$/.test(t)) return "ar";
  return null;
}

/* ------------------------------------------------------------------ admin-editable templates */

/** Keys an admin may override; function-based keys use {placeholders}. */
export const TEMPLATE_KEYS = [
  { key: "welcome", label: "Message d'accueil", placeholders: [] },
  { key: "askPhoto", label: "Demande de photo d'ordonnance", placeholders: [] },
  { key: "photoReceived", label: "Ordonnance reçue", placeholders: [] },
  { key: "analyzing", label: "Analyse en cours", placeholders: [] },
  { key: "noMedicines", label: "Aucun médicament détecté", placeholders: [] },
  { key: "medicinesHeader", label: "En-tête liste médicaments", placeholders: [] },
  { key: "confirmQuestion", label: "Question de confirmation", placeholders: [] },
  { key: "askLocation", label: "Demande du lieu de livraison", placeholders: [] },
  { key: "locationMissing", label: "Lieu de livraison manquant", placeholders: [] },
  { key: "neighborhoodNotFound", label: "Quartier inconnu", placeholders: [] },
  { key: "searching", label: "Recherche de pharmacie", placeholders: [] },
  { key: "routed", label: "Commande transmise", placeholders: ["pharmacy", "address", "distance", "ref"] },
  { key: "noPharmacy", label: "Aucune pharmacie disponible", placeholders: [] },
  { key: "courierAssigned", label: "Livreur assigné", placeholders: ["name"] },
  { key: "courierPending", label: "Livreur en attente", placeholders: [] },
  { key: "askFreeOrder", label: "Commande sans ordonnance", placeholders: [] },
  { key: "freeOrderSaved", label: "Demande sans ordonnance enregistrée", placeholders: [] },
  { key: "trackNone", label: "Aucune commande en cours", placeholders: [] },
  { key: "trackHeader", label: "En-tête suivi", placeholders: [] },
  { key: "fallback", label: "Message non compris", placeholders: [] },
  { key: "error", label: "Erreur technique", placeholders: [] },
  { key: "askFulfillment", label: "Choix livraison ou retrait", placeholders: [] },
  { key: "orderSummary", label: "Récapitulatif de commande", placeholders: ["pharmacy", "address", "distance", "items", "itemsTotal", "fee", "total", "method", "ref"] },
  { key: "paymentInstructions", label: "Instructions de paiement", placeholders: ["total", "orange", "moov", "ref"] },
  { key: "codesMessage", label: "Codes de validation", placeholders: ["pickup", "receipt"] },
  { key: "reviewNotice", label: "Ordonnance envoyée en vérification", placeholders: [] },
  { key: "feedbackAskRating", label: "Demande de note après livraison", placeholders: [] },
  { key: "feedbackAskComment", label: "Demande de commentaire", placeholders: [] },
  { key: "feedbackThanks", label: "Remerciement après avis", placeholders: [] },
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number]["key"];

const FN_DEFAULTS: Record<string, Record<BotLang, string>> = {
  routed: {
    fr: "✅ Commande transmise !\n\n🏥 *{pharmacy}*\n📍 {address}\n📏 {distance} km\n🔖 Réf. {ref}\n\nLa pharmacie prépare votre commande. Vous recevrez un message à chaque étape.",
    en: "✅ Order sent!\n\n🏥 *{pharmacy}*\n📍 {address}\n📏 {distance} km\n🔖 Ref. {ref}\n\nThe pharmacy is preparing your order. You'll get a message at each step.",
    ar: "✅ تم إرسال الطلب!\n\n🏥 *{pharmacy}*\n📍 {address}\n📏 {distance} كم\n🔖 المرجع {ref}\n\nالصيدلية تحضّر طلبك. ستصلك رسالة عند كل مرحلة.",
  },
  courierAssigned: {
    fr: "🛵 Livreur assigné : {name}. Il récupérera votre commande dès qu'elle sera prête.",
    en: "🛵 Courier assigned: {name}. They'll pick up your order once ready.",
    ar: "🛵 تم تعيين موصّل: {name}.",
  },
  orderSummary: {
    fr: "🧾 *Récapitulatif — Réf. {ref}*\n\n🏥 {pharmacy}\n📍 {address}\n📏 {distance} km\n{method}\n\n{items}\n\nProduits : {itemsTotal}\nLivraison : {fee}\n*Total : {total}*\n\nConfirmez-vous la commande ?",
    en: "🧾 *Summary — Ref. {ref}*\n\n🏥 {pharmacy}\n📍 {address}\n📏 {distance} km\n{method}\n\n{items}\n\nProducts: {itemsTotal}\nDelivery: {fee}\n*Total: {total}*\n\nDo you confirm the order?",
    ar: "🧾 *ملخص — المرجع {ref}*\n\n🏥 {pharmacy}\n📍 {address}\n📏 {distance} كم\n{method}\n\n{items}\n\nالمنتجات: {itemsTotal}\nالتوصيل: {fee}\n*المجموع: {total}*\n\nهل تؤكد الطلب؟",
  },
  paymentInstructions: {
    fr: "💳 *Paiement — {total}*\n\n• Orange Money : {orange}\n• Moov Money : {moov}\n\nIndiquez la référence *{ref}* dans le motif du transfert, puis envoyez la référence de transaction sur la page de paiement :",
    en: "💳 *Payment — {total}*\n\n• Orange Money: {orange}\n• Moov Money: {moov}\n\nUse reference *{ref}* in the transfer note, then enter the transaction reference on the payment page:",
    ar: "💳 *الدفع — {total}*\n\n• Orange Money: {orange}\n• Moov Money: {moov}\n\nاذكر المرجع *{ref}* في سبب التحويل، ثم أدخل مرجع العملية في صفحة الدفع:",
  },
  codesMessage: {
    fr: "🔐 *Vos codes de validation*\n\n• Code retrait (à donner à la pharmacie / au livreur) : *{pickup}*\n• Code réception (à donner uniquement quand vous avez vos médicaments en main) : *{receipt}*\n\nNe partagez jamais le code réception avant d'avoir reçu le colis.",
    en: "🔐 *Your validation codes*\n\n• Pickup code (give to the pharmacy / courier): *{pickup}*\n• Receipt code (give ONLY once you have your medicines in hand): *{receipt}*\n\nNever share the receipt code before receiving the parcel.",
    ar: "🔐 *رموز التحقق*\n\n• رمز الاستلام (للصيدلية / الموصّل): *{pickup}*\n• رمز التسليم (فقط عند استلام أدويتك): *{receipt}*\n\nلا تشارك رمز التسليم قبل استلام الطرد.",
  },
};

/** Default text shown in the admin editor for a key/lang. */
export function defaultTemplate(key: TemplateKey, lang: BotLang): string {
  const fn = FN_DEFAULTS[key];
  if (fn) return fn[lang];
  const v = (COPY[lang] as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/** Merges admin overrides (key -> body) onto the built-in copy for a language. */
export function mergeCopy(lang: BotLang, overrides: Record<string, string>): Copy {
  const base = COPY[lang];
  const out: Record<string, unknown> = { ...base };
  for (const [key, body] of Object.entries(overrides)) {
    if (!body?.trim()) continue;
    if (key === "routed") out.routed = (p: Record<string, string>) => fill(body, p);
    else if (key === "courierAssigned") out.courierAssigned = (name: string) => fill(body, { name });
    else if (key === "orderSummary")
      out.orderSummary = (p: Record<string, string>) => fill(body, p);
    else if (key === "paymentInstructions")
      out.paymentInstructions = (p: Record<string, string>) => fill(body, p);
    else if (key === "codesMessage")
      out.codesMessage = (p: Record<string, string>) => fill(body, p);
    else if (typeof (base as unknown as Record<string, unknown>)[key] === "string") out[key] = body;
  }
  return out as unknown as Copy;
}
