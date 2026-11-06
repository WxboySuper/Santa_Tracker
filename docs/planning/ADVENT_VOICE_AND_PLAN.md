# Advent 2026: voice, direction, and day plan

Audience: one adult (the owner), mostly alone at Christmas, wanting to feel the season. Not a children's site. Strangers may visit, but we write for that one reader.

## Voice

- **Warm, dry, specific.** A friend who loves Christmas and is slightly self-aware about it. One precise detail beats three adjectives ("the kitchen window fogging while the oven ticks", not "cozy atmosphere").
- **Wry, never snarky.** Light humor about the season's absurdities (fruitcake, tangled lights). Never mocks the feeling.
- **Quiet over loud.** No exclamation-mark cheerleading, no "Ho ho ho!", no "kids will love". Short paragraphs. Room to breathe.
- **Honest about loneliness without dwelling on it.** The tone can acknowledge a quiet evening. It never pities and never lectures. Comfort, not therapy.
- **Plain facts are checked facts.** Folklore and history doors must be accurate; where a story is a legend, say "the legend goes". No invented statistics, no invented quotes from real people.
- **No brands, no religion-as-trivia, no politics.** Traditions can be described respectfully and inclusively (Yule, Lucia, Posadas, Hanukkah lights, Kwanzaa may appear as winter-light traditions in the world door).
- **Length:** facts 80-160 words. Story chapters 250-450 words. Puzzle and toy intros one or two sentences.

## Serialized story: "The Night Shift"

One continuing story across eight chapters (Days 3, 6, 9, 11, 14, 17, 20, 24).

- **Premise:** Wren, the overnight dispatcher at the North Pole logistics desk, spends December keeping the quietest, most important job running while everyone else sleeps. It is a workplace story about attention and small kindnesses, with warm magic at the edges.
- **Cast:** Wren (dispatcher, practical, a little tired); Bellamy (a retired sleigh navigator who visits the desk with terrible tea); the Ledger (an old, opinionated book of deliveries that talks in margin notes); Pim (a very new elf apprentice who asks the right questions).
- **Arc:** ch1 the desk and the routine; ch2 a missing address; ch3 Bellamy's story of the longest night; ch4 the Ledger's margin notes disagree with the map; ch5 a storm over the Pacific (ties to the real route sweeping across time zones); ch6 Pim finds the address; ch7 a delivery that is not a present; ch8 (Day 24) Christmas Eve: the desk goes quiet and Wren steps outside to watch Santa pass over. Last paragraph points the reader to the live tracker.
- Each chapter stands alone enough to enjoy if a day was skipped, and ends on a small image, not a cliffhanger.

## The 24 days

Day 1 is the shipped game, Ornament Smash. Types map to the renderers in `apps/web/src/components/advent/`.

| Day | Type | Title idea |
| --- | --- | --- |
| 1 | toy (game, shipped) | Ornament Smash |
| 2 | puzzle | Cipher: a note from the desk (shipped framework) |
| 3 | story | The Night Shift, ch. 1 |
| 4 | toy | Snowflake designer |
| 5 | fact | Why carols sound the way they do |
| 6 | story | ch. 2 |
| 7 | toy | Light-show composer |
| 8 | quiz | Winter traditions (shipped framework) |
| 9 | story | ch. 3 |
| 10 | fact | The long history of holiday food |
| 11 | story | ch. 4 |
| 12 | toy | Jigsaw reveal |
| 13 | puzzle | Word search: winter words |
| 14 | story | ch. 5 |
| 15 | toy | Winter around the world (light traditions) |
| 16 | fact | Folklore of the long night |
| 17 | story | ch. 6 |
| 18 | puzzle | Maze: find the address |
| 19 | fact | A short history of Christmas lights |
| 20 | story | ch. 7 |
| 21 | puzzle | Timezone puzzle: when does midnight arrive? |
| 22 | fact | The weather science of a white Christmas |
| 23 | toy | Postcard studio |
| 24 | story | ch. 8, then the tracker |

Mix: 6 toys, 5 puzzles/quizzes, 8 story chapters, 5 facts.

## Experience rules for every door

- Works well on a phone, with touch and keyboard, with reduced motion respected.
- Nothing is lost if a day is skipped; no required progress, streaks, or guilt.
- Ambient and replayable beats competitive. No scores that matter.
- Local-only state (localStorage) at most; blocked storage must not break the door.
- Audio, if any, is opt-in and synthesized (no licensed music files).
- The door always renders something useful if its payload is bad (the fallback).

## Review flow

Workers draft from this document; Claude reviews and edits for facts, tone, and consistency; the owner reviews the result last. Facts doors need a source note in the PR description for each claim.
