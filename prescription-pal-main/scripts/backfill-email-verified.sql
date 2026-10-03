-- Comptes créés AVANT la mise en place du contrôle d'e-mail (2026-10-03).
--
-- Aucun compte n'est bloqué : la connexion par mot de passe n'exige pas
-- `email_verified_at`. On aligne donc l'existant sur la règle réelle :
--   * comptes Google      -> déjà vérifiés par Google (email_verified_at posé)
--   * comptes internes   -> seed / admin (démo, gérants de pharmacie) : marqués
--   * comptes e-mail libre-> resteront `NULL` tant que le code par e-mail
--                            (SMTP) n'est pas en place ; ils sont signalés
--                            « non confirmés » dans l'espace admin.
--
-- Idempotent : ne touche que les lignes encore NULL.

UPDATE users
SET email_verified_at = now()
WHERE email_verified_at IS NULL
  AND (
    -- gérants de pharmacie générés par le seed
    email LIKE '%@pharmacies.saha'
    -- comptes de démonstration / administration créés en local
    OR email LIKE '%@exemple.com'
    -- comptes Google (par sécurité, si le drapeau aurait été perdu)
    OR google_sub IS NOT NULL
  );

-- Contrôle attendu après exécution : 0 ligne pour les comptes internes.
SELECT email, email_verified_at, google_sub IS NOT NULL AS via_google
FROM users
WHERE email_verified_at IS NULL
ORDER BY created_at;