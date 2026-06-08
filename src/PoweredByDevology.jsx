export function PoweredByDevology({ inline = false }) {
  return (
    <div
      className={`powered-by-devology${inline ? ' powered-by-devology--inline' : ''}`}
      aria-label="Powered by Devology"
    >
      <span className="powered-by-label">Powered by</span>
      <img
        src="/devology-logo-sm.png"
        alt="Devology"
        className="powered-by-logo"
        width={128}
        height={80}
        decoding="async"
      />
    </div>
  );
}
