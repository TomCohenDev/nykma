# Thumbnail

Read this when the brief asks for a thumbnail. It's a cover image for each layout: what people see before they press play, where a platform lets you choose one (a YouTube video, a Reel's cover, a LinkedIn or Facebook video). It isn't frame 0. In a feed that plays on its own, frame 0 is still the first impression, so the craft rule about it still holds.

## What makes one work

- **Read in half a second, at the size of a thumb.** One subject, big and close, a strong contrast between it and the background, and at most four or five words in type far larger than the ad's. If it doesn't read at 160 px wide, it doesn't read.
- **The same promise as the ad.** It's the ad's idea at a glance, not a different hook. Every word on it is held to the same rule as the ad: nothing the ad and `brand.md` don't back. Put its words in the pitch so `bun run claims` checks them.
- **The brand, small but there.** The logo, the app's look or the brand's colour, so the cover belongs to the ad without shouting.
- **Each layout composed for itself.** The 16:9 is for YouTube and the wide places. The 9:16 is a Reel's or a Short's cover, and grids crop it to the middle (Instagram's to 3:4, a square on older grids), so keep the subject and the words in the middle half. The 1:1 is for feeds that show squares.
- **No tricks a viewer would call a lie:** no UI state the app can't be in, no "shocked face" stock person presented as a user, no arrow pointing at nothing.

## Making it

It's code, like the ad: a component on the registry line, which gets each ratio's props, with `useFrame()` at 0.

```tsx
export function Thumb({ ratio }: AdProps) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Sequence from={-180}>            {/* the ad's frame 180, as the background */}
        <Payoff ratio={ratio} />
      </Sequence>
      <h1 style={{ … }}>…</h1>          {/* the cover's own words, bigger than the ad's */}
    </div>
  );
}

defineAd({ slug: "launch", ratios: ["1x1"], scenes: [...], thumbnail: Thumb })
```

A `<Sequence from={-n}>` shows any moment of the ad, three.js included, so the cover can start from its best frame and add its own type. It can also be its own composition.

- `bun run stills <id> --ratio all --thumbnail` to look at it. Read it, and judge it as a stranger scrolling past would.
- `bun run render <slug> --ratio all` writes `<id>-thumbnail.png` and a `.jpg` (under 2 MB, for YouTube) next to the MP4s, and `--thumbnail` renders only those. Copy them to the queue folder with the renders at the first look.
- `post.md` says which file is the cover for which platform.
