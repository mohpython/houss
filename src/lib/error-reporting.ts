/**
 * Remontée des erreurs capturées par l'error boundary React.
 * Les erreurs sont écrites dans la console du navigateur ; brancher ici un
 * service de suivi (Sentry, etc.) si besoin.
 */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error(
    "[SAHA] erreur interface",
    message,
    { route: window.location.pathname, ...context },
    error,
  );
}
