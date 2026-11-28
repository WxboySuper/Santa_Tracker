import cardsJson from "../../../../content/stop-cards.json";

/** What the tracker shows for one place: a sourced note and an attributed photo, either of which may be missing. */
export interface StopCardView {
  note: string | null;
  source: string | null;
  photo: { url: string; width: number; height: number; author: string; license: string; licenseUrl: string; sourcePage: string } | null;
}

interface StopCardRecord {
  place_id: string;
  note: string | null;
  sources: string[];
  photo: { url: string; width: number; height: number; author: string; license: string; license_url: string; source_page: string } | null;
  review_status: "draft" | "approved" | "stale";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** The most readable source to credit beside a note: Wikipedia or an official page before the Wikidata entry. */
function displaySource(sources: string[]): string | null {
  return sources.find(source => hostOf(source) !== "www.wikidata.org" && hostOf(source) !== "wikidata.org") ?? sources[0] ?? null;
}

function toView(card: StopCardRecord): StopCardView {
  return {
    note: card.note,
    source: card.note ? displaySource(card.sources) : null,
    photo: card.photo && {
      url: card.photo.url,
      width: card.photo.width,
      height: card.photo.height,
      author: card.photo.author,
      license: card.photo.license,
      licenseUrl: card.photo.license_url,
      sourcePage: card.photo.source_page,
    },
  };
}

/**
 * Cards visitors may see, keyed by candidate place ID. Production shows only cards the owner has approved; local
 * development and the demo also show drafts so the panel can be designed and checked before review.
 */
export function publishedStopCards(includeDrafts: boolean): Record<string, StopCardView> {
  const cards = cardsJson as StopCardRecord[];
  const visible = cards.filter(card => card.review_status === "approved" || (includeDrafts && card.review_status === "draft"));
  return Object.fromEntries(visible.map(card => [card.place_id, toView(card)]));
}
