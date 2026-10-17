export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="page-transition"
      id="main-content"
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
