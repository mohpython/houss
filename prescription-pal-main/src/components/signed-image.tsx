import { useEffect, useState, type ImgHTMLAttributes } from "react";

const PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

type SignedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

/**
 * Affiche une image servie par `/api/storage/...`.
 *
 * En développement, Vite intercepte les requêtes d'images avant la route
 * applicative ; on récupère donc le fichier via `fetch` (qui passe) et on
 * l'affiche depuis un blob local. En production, l'URL signée est utilisée
 * directement.
 */
export function SignedImage({ src, alt, ...props }: SignedImageProps) {
  const needsBlob = import.meta.env.DEV && src.startsWith("/api/storage/");
  const [resolved, setResolved] = useState<string | null>(needsBlob ? null : src);

  useEffect(() => {
    if (!needsBlob) {
      setResolved(src);
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    setResolved(null);
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`Image ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved("");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [needsBlob, src]);

  return <img src={resolved || PLACEHOLDER} alt={alt} {...props} />;
}
