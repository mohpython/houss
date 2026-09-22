/**
 * Animated aurora blobs that sit behind page content.
 * Purely decorative — pointer-events: none so it never blocks interaction.
 */
export function AuroraBackground({ intense = false }: { intense?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -top-32 -left-24 h-[42rem] w-[42rem] rounded-full blur-3xl animate-aurora"
        style={{
          background:
            "radial-gradient(circle, hsl(202 100% 40% / 0.55) 0%, transparent 60%)",
          opacity: intense ? 0.9 : 0.6,
        }}
      />
      <div
        className="absolute top-1/3 -right-24 h-[38rem] w-[38rem] rounded-full blur-3xl animate-aurora-2"
        style={{
          background:
            "radial-gradient(circle, hsl(191 100% 45% / 0.5) 0%, transparent 60%)",
          opacity: intense ? 0.85 : 0.55,
        }}
      />
      <div
        className="absolute bottom-[-10rem] left-1/3 h-[36rem] w-[36rem] rounded-full blur-3xl animate-aurora"
        style={{
          background:
            "radial-gradient(circle, hsl(174 62% 50% / 0.45) 0%, transparent 60%)",
          opacity: intense ? 0.8 : 0.5,
        }}
      />
      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(220 30% 96% / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(220 30% 96% / 0.4) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}
