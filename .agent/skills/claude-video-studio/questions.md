# The questions (Stage B)

Claude sends the block below as ONE message, word for word, after the person has picked a look.
Edit this file to change the questions. Keep it numbered, one line each, defaults in [brackets].
If the person already answered something, Claude skips it and keeps the rest.

---

1. What is it for? (YouTube intro, Short, launch, explainer, ad) and how long? [12 s, 16:9]
2. What should it say? (the words on screen) [I'll write it from your topic]
3. Does it loop? [no]
4. Your brand: colours, fonts, logo? [use the style's]
5. Real media? Your photos or clips, AI clips from Higgsfield, or none (pure graphics) [none]

Reply with just the numbers you want to change, like "1: Short, 8 s. 5: my photos". Or say "go" for all the defaults.

---

## Follow-ups (only when needed)

- If 5 is "my photos or clips": "Drag the files in, or give me the folder path."
- If 5 is "AI clips": run `python3 scripts/higgsfield.py check`. If there is no key, say:
  "Add your Higgsfield key to a file called .env in this folder, one line:
  HIGGSFIELD_API_KEY=your_key_id:your_key_secret (from https://console.higgsfield.ai). Never paste it here. Tell me when it is done."
