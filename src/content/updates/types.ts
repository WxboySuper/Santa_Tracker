export interface UpdateScreenshot {
  src: string;
  alt: string;
  caption?: string;
}

export interface UpdateSection {
  title: string;
  body: string;
  screenshots?: UpdateScreenshot[];
}

export interface ReleaseImprovement {
  id: string;
  text: string;
}

export interface ReleaseHotfixes {
  title: string;
  body: string;
  items: ReleaseImprovement[];
}

export interface ReleaseUpdate {
  version: string;
  title: string;
  summary: string;
  /** Optional hero graphics under `public/updates/v{version}/`. */
  promoImages?: UpdateScreenshot[];
  sections: UpdateSection[];
  hotfixes?: ReleaseHotfixes;
  improvements: ReleaseImprovement[];
}
