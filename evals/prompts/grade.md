You are grading an answer from an etymology bot. The bot was asked about a word, looked things up in
dictionaries and encyclopedias, and wrote an answer in {{language}} for a Telegram user.

Word: {{word}}

KEY FACTS a correct answer should contain:
{{keyFacts}}

MATERIAL the bot had (the initial sources and every tool result; citations [n] refer to numbered sources):
{{material}}

ANSWER:
{{answer}}

Grade the answer:
1. keyFacts: for each key fact, is it present in the answer, in any wording or language? A fact that is
   contradicted or garbled counts as absent.
2. unsupportedClaims: factual claims about the word's origin, forms, dates or history that are neither
   supported by the MATERIAL nor well-established scholarship, or that are cited to a source that does
   not say them. Ignore clearly marked speculation and legends. Empty if there are none.
3. mythsLabelled: if the answer mentions a popular story, folk etymology or legend, is every one marked
   as such rather than presented as fact? null if it mentions none.
4. notes: one or two sentences on the answer's biggest weakness.

Reply with only a JSON object, no other text:
{"keyFacts": [{"fact": "...", "present": true}], "unsupportedClaims": [], "mythsLabelled": null, "notes": "..."}
