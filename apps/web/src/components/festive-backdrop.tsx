/** Decorative night-sky, snow and string-light scene behind the page. Hidden from assistive tech. */
export default function FestiveBackdrop() {
  return (
    <div className="festive-backdrop" aria-hidden="true">
      <div className="festive-stars" />
      <div className="festive-snow festive-snow--far" />
      <div className="festive-snow festive-snow--near" />
      <div className="festive-lights" />
    </div>
  );
}
