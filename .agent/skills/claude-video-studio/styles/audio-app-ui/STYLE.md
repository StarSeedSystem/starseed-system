# Scored in a music app

id: audio-app-ui
Best for: "AI scores my edit" demos, music and audio tool launches, beat sync explainers, sound design breakdowns.
Mood: a dark music app fills the frame, an AI cursor marks the cuts, locks the tempo and writes the music, then the scored edit plays full screen on the beat.
Reference piece: none, spec only (the original is built around real footage)
Gallery video: gallery/videos/audio-app-ui.mp4

## Palette (hex)
- desk: #0A0A0B, app window #121212, panels #1D1D1D (radius 8 px), lanes alternate #191919 and #1B1B1B
- text: #E2E2E2 (main), #8E8E8E (labels), #5C5C5C (dim)
- region colours (app colours, muted): video #3B3F46, chords #33507A, drums #2C5F5E, score #2D5A43, voice #4C478A
- meters: app green, for example #4F9271
- accent: #D97757 clay. The ONE accent. Cursor, focus ring, beat markers, the hairline on every region the AI writes, note flashes, lit piano keys, the volume automation line, the live beat light.

## Type
- Display: Switzer 750, tracking -0.03em, tabular numbers (big BPM readout, bars.beats in the LCD)
- Labels: Switzer 500 to 650, 13 to 16 px for lanes, tabs and mixer plates
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap">

## Easing (numbers)
- land: expo.out, 0.7 s (panels stagger in)
- leave: power2.in, 0.25 s
- move: power3.inOut, 0.45 s (camera pushes, cursor moves); the final fly in is power3.inOut too
- pop: back.out(2.2), 0.35 s (markers, chord notes, automation nodes); plan ticks back.out(2.6)
- tempo lock: back.out overshoot, the grid slides past and snaps back onto the markers
- stagger: 0.07 s panels
- beat: 120 BPM, every hit on a 0.5 s mark, every cut on a beat

## Motion rules
- One clock. Camera, cursor, playhead, BPM, grid, markers, key lights, meters, fader and the beat punch are pure functions of time.
- App opens tilted (scale 0.80, 16 deg and -13 deg) and settles wide by 1.5 s. Pushes are power3.inOut, about 0.45 s, then a slow linear drift hold.
- The cursor never teleports. Each click drops a clay ring. The label badge reads "AI name · step name" and flips to the left of the cursor near the frame edge, so it is always readable.
- Bar and beat lines are placed from the live BPM. When the BPM changes, the grid really moves.
- Meters have peak hold and move with the voice even in the opening, so the app feels alive from frame one.

## Signature moves
- The clay beat marker: the cursor scrubs the edit, the picture flicks through shots, and a clay marker drops on every cut. Everything later lands on those markers.
- Tempo lock: the cursor drags BPM from 96 to 120, the grid flows, overshoots and snaps onto the markers with a flash.
- Writing music: chords pop on the half beats in the piano roll and the keys light clay. A drum region paints in and a 3 px clay flash with a 14 px glow hits every marker.
- Ducking: voice regions ring clay, automation nodes pop, the cursor pulls the dips down. On Play, meters dance and the score fader rides the line.
- The finish: the camera flies into the Movie window, the app dims, and the edit plays full screen. Every beat punches the picture (scale 1 + 0.018, fast decay), every cut punches harder (+0.03). A small pill of 4 beat lights sits bottom left, the live one clay.

## Composition
- Control bar on top: transport buttons, an LCD with bars.beats, BPM, 4/4 and key.
- Top left: Movie window (the edit plays here) and a Tempo panel (big BPM plus 4 beat lights). Top right: Tracks (marker row, bar ruler, lanes 76 px tall: Video thumbnails, Chords, Drums, Score, Voice). AI panel on the far right.
- Bottom left: Piano Roll with a vertical keyboard. Bottom right: Mixer with 6 strips (inserts, pan, fader, stereo meters, name plates).
- Finish: the scored edit full frame for the last 2 s, slow 4 percent push (power1.inOut).

## With media
- The person's edit plays in the Movie window. Its cuts are the beat markers, so pick or trim clips so cuts fall on 0.5 s beats.
- The Video lane shows real thumbnails from each clip.
- Voice regions sit where the person talks; the ducking dips line up with those.
- The only overlay on the full-screen picture is the beat light pill, bottom left, away from any face.
- No footage? Use drawn placeholder frames (a studio silhouette, a runner, a dancer, a valley) on the same clock.

## Ban list
- real music app names, logos or brand colours
- a second accent colour in the chrome
- cuts or hits that miss the beat
- a grid that does not move when the BPM changes
- a frozen meter while sound is meant to be playing
- anything drawn over a face
- a light theme
