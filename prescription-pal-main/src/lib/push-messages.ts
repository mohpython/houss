/** Localized push notification copy. Kept free of any medical detail. */

export type PushLang = "fr" | "en" | "ar";

type Copy = { title: string; body: string };

const MESSAGES: Record<string, Record<PushLang, Copy>> = {
  new_reservation: {
    fr: { title: "Nouvelle commande", body: "Une ordonnance vient d'être envoyée à votre pharmacie." },
    en: { title: "New order", body: "A prescription has just been sent to your pharmacy." },
    ar: { title: "طلب جديد", body: "تم إرسال وصفة طبية إلى صيدليتكم للتو." },
  },
  reservation_created: {
    fr: { title: "Commande envoyée", body: "Votre commande a été transmise à la pharmacie." },
    en: { title: "Order sent", body: "Your order has been sent to the pharmacy." },
    ar: { title: "تم إرسال الطلب", body: "تم إرسال طلبك إلى الصيدلية." },
  },
  reservation_accepted: {
    fr: { title: "Commande acceptée", body: "La pharmacie a accepté votre commande." },
    en: { title: "Order accepted", body: "The pharmacy accepted your order." },
    ar: { title: "تم قبول الطلب", body: "قبلت الصيدلية طلبك." },
  },
  reservation_rejected: {
    fr: { title: "Commande refusée", body: "La pharmacie n'a pas pu traiter votre commande." },
    en: { title: "Order declined", body: "The pharmacy could not process your order." },
    ar: { title: "تم رفض الطلب", body: "لم تتمكن الصيدلية من معالجة طلبك." },
  },
  reservation_ready: {
    fr: { title: "Commande prête", body: "Votre commande est prête en pharmacie." },
    en: { title: "Order ready", body: "Your order is ready at the pharmacy." },
    ar: { title: "الطلب جاهز", body: "طلبك جاهز في الصيدلية." },
  },
  courier_assigned: {
    fr: { title: "Livreur assigné", body: "Un livreur prend en charge votre commande." },
    en: { title: "Courier assigned", body: "A courier is taking care of your order." },
    ar: { title: "تم تعيين موصّل", body: "يتولى موصّل تسليم طلبك." },
  },
  new_delivery: {
    fr: { title: "Nouvelle course", body: "Une livraison vous a été attribuée." },
    en: { title: "New delivery", body: "A delivery has been assigned to you." },
    ar: { title: "توصيل جديد", body: "تم إسناد عملية توصيل إليك." },
  },
  courier_picked_up: {
    fr: { title: "Colis récupéré", body: "Le livreur a récupéré votre commande." },
    en: { title: "Order picked up", body: "The courier picked up your order." },
    ar: { title: "تم استلام الطلب", body: "استلم الموصّل طلبك." },
  },
  delivered: {
    fr: { title: "Commande livrée", body: "Votre commande a été livrée. Bonne santé !" },
    en: { title: "Order delivered", body: "Your order has been delivered. Get well soon!" },
    ar: { title: "تم تسليم الطلب", body: "تم تسليم طلبك. دمتم بصحة جيدة!" },
  },
  appointment_requested: {
    fr: { title: "Nouvelle demande de rendez-vous", body: "Un patient souhaite une consultation. Répondez dans votre espace praticien." },
    en: { title: "New appointment request", body: "A patient requested a consultation. Reply in your practitioner space." },
    ar: { title: "طلب موعد جديد", body: "يطلب مريض استشارة. أجب من مساحة الممارس." },
  },
  appointment_pending: {
    fr: { title: "Demande en attente", body: "Un patient attend toujours votre réponse." },
    en: { title: "Pending request", body: "A patient is still waiting for your reply." },
    ar: { title: "طلب قيد الانتظار", body: "ما زال مريض ينتظر ردك." },
  },
  appointment_accepted: {
    fr: { title: "Rendez-vous confirmé", body: "Votre praticien a accepté votre rendez-vous." },
    en: { title: "Appointment confirmed", body: "Your practitioner accepted your appointment." },
    ar: { title: "تم تأكيد الموعد", body: "قبل الممارس موعدك." },
  },
  appointment_rescheduled: {
    fr: { title: "Nouvelle date proposée", body: "Votre praticien propose une autre date. Confirmez dans l'application." },
    en: { title: "New date proposed", body: "Your practitioner proposed another date. Confirm in the app." },
    ar: { title: "اقتراح موعد جديد", body: "اقترح الممارس موعداً آخر. أكّد من التطبيق." },
  },
  appointment_rejected: {
    fr: { title: "Demande refusée", body: "Votre praticien ne peut pas prendre ce rendez-vous." },
    en: { title: "Request declined", body: "Your practitioner can't take this appointment." },
    ar: { title: "تم رفض الطلب", body: "لا يستطيع الممارس أخذ هذا الموعد." },
  },
  appointment_completed: {
    fr: { title: "Consultation terminée", body: "Votre compte-rendu est disponible dans l'application." },
    en: { title: "Consultation completed", body: "Your report is available in the app." },
    ar: { title: "اكتملت الاستشارة", body: "تقريرك متاح في التطبيق." },
  },
  appointment_cancelled: {
    fr: { title: "Rendez-vous annulé", body: "Le patient a annulé sa demande." },
    en: { title: "Appointment cancelled", body: "The patient cancelled the request." },
    ar: { title: "تم إلغاء الموعد", body: "ألغى المريض طلبه." },
  },
  appointment_patient_confirmed: {
    fr: { title: "Date confirmée", body: "Le patient a confirmé la nouvelle date." },
    en: { title: "Date confirmed", body: "The patient confirmed the new date." },
    ar: { title: "تم تأكيد الموعد", body: "أكّد المريض الموعد الجديد." },
  },
  appointment_reminder: {
    fr: { title: "Rappel de rendez-vous", body: "Vous avez un rendez-vous bientôt. Ouvrez l'application pour les détails." },
    en: { title: "Appointment reminder", body: "You have an appointment soon. Open the app for details." },
    ar: { title: "تذكير بالموعد", body: "لديك موعد قريباً. افتح التطبيق للتفاصيل." },
  },
  appointment_unanswered: {
    fr: { title: "Praticien sans réponse", body: "Une demande attend depuis plus de 24 h." },
    en: { title: "Unanswered practitioner", body: "A request has been waiting for over 24h." },
    ar: { title: "ممارس بدون رد", body: "طلب ينتظر منذ أكثر من 24 ساعة." },
  },
};

export function pushCopy(
  type: string,
  lang: string,
  fallback: { title: string; body: string },
): Copy {
  const l: PushLang = lang === "en" || lang === "ar" ? lang : "fr";
  const entry = MESSAGES[type]?.[l];
  if (entry) return entry;
  return {
    title: fallback.title || "SAHA Santé",
    body: fallback.body || "",
  };
}

/** In-app destination for a notification. */
export function pushLink(type: string, data: Record<string, unknown>): string {
  const rid = typeof data.reservation_id === "string" ? data.reservation_id : null;
  const pid = typeof data.pharmacy_id === "string" ? data.pharmacy_id : null;
  const aid = typeof data.appointment_id === "string" ? data.appointment_id : null;
  if (aid) {
    if (data.for === "admin") return "/app/admin/practitioners";
    if (data.for === "practitioner") {
      return type === "appointment_requested" || type === "appointment_pending" || type === "appointment_cancelled"
        ? "/app/praticien"
        : `/app/praticien/rdv/${aid}`;
    }
    return "/app/appointments";
  }
  if (!rid) return "/app";
  if (type === "new_reservation") return pid ? `/app/pharmacy/${pid}/reservations` : "/app/pharmacy";
  if (type === "new_delivery") return `/app/courier/deliveries/${rid}`;
  if (type === "courier_assigned" || type === "courier_picked_up") {
    return `/app/reservations/${rid}/track`;
  }
  return `/app/reservations/${rid}`;
}
