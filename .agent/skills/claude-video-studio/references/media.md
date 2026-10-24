# Media mode: graphics plus real photos, clips and AI clips

Media mode is Motion mode with real pictures in it. The graphics still lead; media sits inside them.

## Three kinds of media (cheapest first)
1. The person's own photos. Free. Code can bring a photo to life: a slow push-in, parallax
   between a cut-out and the background, a light sweep, a mask reveal.
2. The person's own clips (screen recordings, product shots, talking head). Free.
3. AI clips from Higgsfield. Costs credits. Best for turning ONE still photo into a 4 to 8 s
   moving shot (image to video), or for B-roll nobody filmed (text to video).

## The key (never in chat)
- The person sets `HIGGSFIELD_API_KEY=key_id:key_secret` in their shell, or in a `.env` file
  in the project folder. Keys come from https://console.higgsfield.ai .
- `python3 scripts/higgsfield.py check` says yes or no. It never prints the key.
- Never ask the person to paste a key. Never echo it, log it, or commit it. `.env` is in `.gitignore`.

## The API (what the script does)
- Base: `https://platform.higgsfield.ai` (set `HIGGSFIELD_API_BASE` to change; the docs show `https://api.higgsfield.ai`).
- Header: `Authorization: Key <key_id>:<key_secret>`.
- Upload a photo: `POST /files/generate-upload-url` with `{"content_type": "image/jpeg"}`, then PUT the file
  to `upload_url` with the returned headers. Use `public_url` as `image_url`.
- Price check, free: `POST /estimate/<endpoint>` with the same body. Returns `credits`.
- Submit: `POST /<endpoint>` with an `Idempotency-Key` header. Returns `status_url`.
- Poll `status_url` (2 s, growing to 10 s) until `completed`, `failed`, `nsfw` or `canceled`.
  The clip is at `video.url`. Download it; links last about 7 days. Failed jobs are not charged.
- Docs: https://docs.higgsfield.ai

| Name in this skill | Endpoint | Good for | Length |
|---|---|---|---|
| seedance-2.0 (default) | `bytedance/seedance-2.0/image-to-video` and `/text-to-video` | photo to clip, any serious motion, start + end frame | 4 to 15 s |
| seedance-2.5 | `bytedance/seedance-2.5/image-to-video` and `/text-to-video` | longer single shots | 4 to 30 s |
| kling-3-turbo | `kling-video/v3.0-turbo/image-to-video` | cheap simple moves | 3 to 15 s |

The script turns off generated sound (`generate_audio: false`). Sound belongs in the edit.

## The storyboard gate (always)
Before any spend:
1. Write `storyboard.json` (see `examples/storyboard.json`): every shot, its time, what the graphic
   does, and which asset it uses: `code`, `user_photo`, `user_clip`, or `generate` (with model, prompt,
   length, resolution).
2. Run `python3 scripts/storyboard.py storyboard.json`. It prints the table and the credit estimate.
3. Show that table to the person. Wait for a clear "yes". Any change: update and show it again.
4. Only then run `scripts/higgsfield.py generate ... --yes`, one shot at a time, and check each clip
   (grab 3 frames) before using it.

## Prompts that work for photo to clip
- Describe the CAMERA and ONE action: "slow push in, she looks up from the laptop and smiles, soft window light".
- Keep the framing close to the photo. Big framing changes make the model cut mid-clip.
- For a loop, pass the same photo as the end image (seedance) so the clip ends where it began.
- Never ask for text in the clip. Text is always code, on top.

## Putting media in the composition
- Copy files into the project's `media/` folder.
- Clips are `<video class="clip" muted playsinline data-start=".." data-duration=".." data-media-start="..">`.
- Put media INSIDE a graphic (a mask, a card, a shape) so it reads as one design, not a slideshow.
- Never draw over a face. Never crop a 16:9 clip into a strange shape without saying so.
- Match the colours: sample the clip and nudge the style's ground towards it, or grade the clip with a
  CSS filter so both feel like one world.
