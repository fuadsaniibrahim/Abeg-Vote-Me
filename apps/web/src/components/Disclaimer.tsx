export const DISCLAIMER_TEXT =
  'Abeg Vote Me is satire. Every party, politician, media house, agency and armed group in this game is fictional. Any resemblance to real persons or organisations is coincidental. Place names are used only as a setting.';

export function Disclaimer() {
  return (
    <aside aria-label="Disclaimer" className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <strong className="font-semibold">Disclaimer: </strong>
      {DISCLAIMER_TEXT}
    </aside>
  );
}
