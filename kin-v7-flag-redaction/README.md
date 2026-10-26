# kin-v7-flag-redaction

One-shot, fail-closed kit to redact the single literal flag value found in the
public v7 doctrine dataset
([nyxspecter4/kinetigor-dpo-cybersec-v7-dataset](https://huggingface.co/datasets/nyxspecter4/kinetigor-dpo-cybersec-v7-dataset))
and then settle its license.

## What the full-corpus scan found (2026-10-26)

Every file was streamed end-to-end (the 1.5 MB combined file fetched complete;
row starts counted exactly; JSON array closes clean):

| file | rows | literal flags |
|---|---:|---|
| `train/dpo-combined.json` | 1,672 | 1 × `CTF{florian_pepellin}` |
| `train/dpo-expanded.json` | 35 | 1 × `CTF{florian_pepellin}` |
| `train/dpo.json` | 14 | 0 |

- **Every other flag-like string is placeholder prose** (`FLAG{...}`, `CTF{...}`).
- **The card's "program slugs" warning is conservative**: the mentions are
  platform names in doctrine prose (huntr, Monk, HackerOne, Bugcrowd,
  TryHackMe, HackTheBox), plus public reference domains and teaching examples
  (localhost, `127.0.0.1`, `evil.com`, `169.254.169.254`). No client
  identifiers, no real submission IDs (the one `submission_id` hit is the
  doctrine rule text), no third-party confidential data.
- Net exposure: **one retired closed-event challenge flag**, twice.

## Run it

```bash
# 1) fetch, verify, write patched copies locally (no HF writes yet)
python3 redact_v7_flag.py --fetch --out-dir ./redacted

# 2) eyeball the two .redacted files, then upload (needs HF write token)
python3 redact_v7_flag.py --fetch --push
```

The script is fail-closed. It refuses to write or upload unless, for each
file: byte size matches the scan ground truth, JSON parses, row count matches
(1,672 / 35), exactly one flag occurrence exists, and the patched byte delta
is exactly `len(flag) - len(replacement)`. If the remote file changed since
the scan, it dies instead of patching blind.

## Alternative: HF web editor (~2 minutes, no tooling)

Open each file on the Hub, search for `CTF{florian_pepellin}`, replace with
`CTF{redacted}`, commit:

- `train/dpo-combined.json`
- `train/dpo-expanded.json`

## License step (owner decision, not in the script)

The card deliberately asserts no license because the material derives from
live bug-bounty engagements. Given the scan results (platform names only, no
client data, one retired flag), asserting MIT to match
[kin-cyber-dpo-v2](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2)
is defensible: add `license: mit` to the dataset README frontmatter. Until
then the default is all-rights-reserved, which blocks legal reuse but leaves
the flag value public.

## History caveat

The redaction does NOT remove the flag from the dataset's git history —
anyone can still resolve the parent commit. Whether that matters depends on
whether the event is truly closed and whether the flag still grants anything.
If it does matter, the options are a support request to the Hub, or deleting
and re-creating the dataset repo from the patched files (loses Sep 22–Oct 26
history and the download counter).
