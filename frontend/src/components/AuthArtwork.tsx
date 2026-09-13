export function AuthArtwork() {
  return (
    <aside className="auth-artwork" aria-label="AIP&T global reach">
      {/* Preserve the original image proportions, including all text and office details. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="auth-artwork-image"
        src="/images/auth-global-reach.png"
        alt="AIP&T global office network, with its main office in Egypt and branch office in Saudi Arabia"
        width={1671}
        height={941}
        decoding="async"
      />
    </aside>
  );
}
