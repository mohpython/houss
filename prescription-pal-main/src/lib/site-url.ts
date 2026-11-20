/**
 * URL publique du site, utilisable depuis le client ET le serveur.
 *
 * La valeur est figée au build depuis `APP_URL` (fichier `.env`) via
 * `define.__APP_URL__` (voir `vite.config.ts`). Le bundle navigateur et le
 * rendu serveur partagent donc la même base, et aucun secret n'est exposé.
 *
 * En développement local, `APP_URL=http://localhost:3000` : le site ne
 * référence plus le domaine de production (canonical, Open Graph, sitemap,
 * liens de partage). En production, `APP_URL` pointe sur le domaine réel —
 * le comportement y est inchangé.
 */

/** Constante injectée à la compilation par Vite. */
declare const __APP_URL__: string | undefined;

/** Base publique du site, sans slash final. */
export const SITE_URL: string = (
  typeof __APP_URL__ === "string" && __APP_URL__ ? __APP_URL__ : "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * Construit une URL absolue à partir de la base publique.
 * Une URL déjà absolue est renvoyée telle quelle.
 */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
