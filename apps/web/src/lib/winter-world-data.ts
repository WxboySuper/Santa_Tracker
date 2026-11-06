import type { MessageKey } from "@santa-tracker/localization";

export type WinterWorldDateRule = {
  startMonth: number;
  startDay: number;
  endMonth?: number;
  endDay?: number;
};

export type WinterWorldEntry = {
  id: string;
  titleKey: MessageKey;
  placeKey: MessageKey;
  storyKey: MessageKey;
  whenKey: MessageKey;
  latitude: number;
  longitude: number;
  dateRule?: WinterWorldDateRule;
  sourceNote: string;
};

export const winterWorldEntries: readonly WinterWorldEntry[] = [
  {
    id: "lucia",
    titleKey: "advent.activity.winterworld.entries.lucia.title",
    placeKey: "advent.activity.winterworld.entries.lucia.place",
    storyKey: "advent.activity.winterworld.entries.lucia.story",
    whenKey: "advent.activity.winterworld.entries.lucia.when",
    latitude: 59.33,
    longitude: 18.07,
    dateRule: { startMonth: 12, startDay: 13 },
    sourceNote: "National tourism body: Visit Sweden, Lucia traditions (https://visitsweden.com/what-to-do/culture-history-and-art/swedish-traditions/christmas/lucia/)",
  },
  {
    id: "hanukkah",
    titleKey: "advent.activity.winterworld.entries.hanukkah.title",
    placeKey: "advent.activity.winterworld.entries.hanukkah.place",
    storyKey: "advent.activity.winterworld.entries.hanukkah.story",
    whenKey: "advent.activity.winterworld.entries.hanukkah.when",
    latitude: 31.77,
    longitude: 35.21,
    sourceNote: "Museum overview: Smithsonian National Museum of American History, Hanukkah and other winter lights (https://americanhistory.si.edu/explore/stories/illuminating-thoughts-holidays)",
  },
  {
    id: "posadas",
    titleKey: "advent.activity.winterworld.entries.posadas.title",
    placeKey: "advent.activity.winterworld.entries.posadas.place",
    storyKey: "advent.activity.winterworld.entries.posadas.story",
    whenKey: "advent.activity.winterworld.entries.posadas.when",
    latitude: 19.43,
    longitude: -99.13,
    dateRule: { startMonth: 12, startDay: 16, endMonth: 12, endDay: 24 },
    sourceNote: "National cultural body: Mexico's Secretaría de Cultura, Las Posadas (https://www.gob.mx/cultura/es/articulos/y-tu-como-celebras-las-posadas?idiom=es)",
  },
  {
    id: "dongzhi",
    titleKey: "advent.activity.winterworld.entries.dongzhi.title",
    placeKey: "advent.activity.winterworld.entries.dongzhi.place",
    storyKey: "advent.activity.winterworld.entries.dongzhi.story",
    whenKey: "advent.activity.winterworld.entries.dongzhi.when",
    latitude: 31.23,
    longitude: 121.47,
    dateRule: { startMonth: 12, startDay: 21, endMonth: 12, endDay: 23 },
    sourceNote: "University overview: University of Chinese Academy of Sciences, Winter Solstice (https://english.ucas.ac.cn/index.php/academic-calendar/6338-winter-solstice-2)",
  },
  {
    id: "yalda",
    titleKey: "advent.activity.winterworld.entries.yalda.title",
    placeKey: "advent.activity.winterworld.entries.yalda.place",
    storyKey: "advent.activity.winterworld.entries.yalda.story",
    whenKey: "advent.activity.winterworld.entries.yalda.when",
    latitude: 35.69,
    longitude: 51.39,
    dateRule: { startMonth: 12, startDay: 20, endMonth: 12, endDay: 22 },
    sourceNote: "National cultural body: Iran's Islamic Culture and Relations Organization, Yalda (https://en.icro.ir/Customs/Yalda)",
  },
  {
    id: "yule",
    titleKey: "advent.activity.winterworld.entries.yule.title",
    placeKey: "advent.activity.winterworld.entries.yule.place",
    storyKey: "advent.activity.winterworld.entries.yule.story",
    whenKey: "advent.activity.winterworld.entries.yule.when",
    latitude: 59.91,
    longitude: 10.75,
    dateRule: { startMonth: 12, startDay: 21, endMonth: 12, endDay: 22 },
    sourceNote: "Scholarly overview: Hilda Ellis Davidson, 'Yule' in Encyclopedia of Religion (customs varied by place and period)",
  },
  {
    id: "hogmanay",
    titleKey: "advent.activity.winterworld.entries.hogmanay.title",
    placeKey: "advent.activity.winterworld.entries.hogmanay.place",
    storyKey: "advent.activity.winterworld.entries.hogmanay.story",
    whenKey: "advent.activity.winterworld.entries.hogmanay.when",
    latitude: 55.95,
    longitude: -3.19,
    dateRule: { startMonth: 12, startDay: 31 },
    sourceNote: "National tourism body: Scotland.org, Hogmanay history and customs (https://www.scotland.org/events/hogmanay)",
  },
  {
    id: "kwanzaa",
    titleKey: "advent.activity.winterworld.entries.kwanzaa.title",
    placeKey: "advent.activity.winterworld.entries.kwanzaa.place",
    storyKey: "advent.activity.winterworld.entries.kwanzaa.story",
    whenKey: "advent.activity.winterworld.entries.kwanzaa.when",
    latitude: 38.91,
    longitude: -77.04,
    dateRule: { startMonth: 12, startDay: 26, endMonth: 1, endDay: 1 },
    sourceNote: "Museum overview: Smithsonian National Museum of African American History and Culture, Kwanzaa (https://nmaahc.si.edu/explore/moments/kwanzaa)",
  },
  {
    id: "inti-raymi",
    titleKey: "advent.activity.winterworld.entries.intiRaymi.title",
    placeKey: "advent.activity.winterworld.entries.intiRaymi.place",
    storyKey: "advent.activity.winterworld.entries.intiRaymi.story",
    whenKey: "advent.activity.winterworld.entries.intiRaymi.when",
    latitude: -13.53,
    longitude: -71.97,
    dateRule: { startMonth: 6, startDay: 24 },
    sourceNote: "National tourism body: Peru Travel, Inti Raymi in Cusco (https://www.peru.travel/es/eventos/inti-raymi)",
  },
  {
    id: "tokyo-lights",
    titleKey: "advent.activity.winterworld.entries.tokyoLights.title",
    placeKey: "advent.activity.winterworld.entries.tokyoLights.place",
    storyKey: "advent.activity.winterworld.entries.tokyoLights.story",
    whenKey: "advent.activity.winterworld.entries.tokyoLights.when",
    latitude: 35.68,
    longitude: 139.69,
    sourceNote: "National tourism body: GO TOKYO, Winter Illumination Guide (https://www.gotokyo.org/en/story/guide/winter-illuimnation-guide/index.html)",
  },
] as const;

