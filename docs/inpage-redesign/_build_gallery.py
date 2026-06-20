# -*- coding: utf-8 -*-
"""Build gallery-before.html from per-snapshot source files.

Each snapshot lives in snaps/<key>.htmlsrc as a standalone file containing
the EXACT html payload (raw, HTML-entity-escaped, or <![CDATA[...]]>-wrapped,
as it was supplied). The manifest (snaps/index.json) lists component name +
key + render order. This avoids JSON-string-escaping as a corruption vector.

Snapshot HTML is preserved EXACTLY (this is the BEFORE baseline). The only
normalization is decoding the transport wrapper so it renders as live markup
inside an isolated <iframe srcdoc> (which prevents one snapshot's <style> /
inline styles from bleeding into sibling cards).
"""
import html
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
INDEX = json.loads((ROOT / "snaps" / "index.json").read_text(encoding="utf-8"))


def decode_snapshot(raw: str) -> str:
    s = raw.strip()
    if s.startswith("<![CDATA[") and s.endswith("]]>"):
        return s[len("<![CDATA["):-len("]]>")]
    if "&lt;" in s and "<div" not in s and "<html" not in s and "<svg" not in s:
        return html.unescape(raw)
    return raw


def srcdoc_attr(body: str) -> str:
    return body.replace("&", "&amp;").replace('"', "&quot;")


cards = []
for entry in INDEX:
    name = html.escape(entry["component"])
    key = entry["key"]
    raw = (ROOT / "snaps" / f"{key}.htmlsrc").read_text(encoding="utf-8")
    body = decode_snapshot(raw)
    doc = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;background:#0a0a0b;}body{padding:12px;}</style>"
        "</head><body>" + body + "</body></html>"
    )
    sd = srcdoc_attr(doc)
    cards.append(
        f'''  <section class="snap-card">
    <h2 class="snap-title">{name} <span class="snap-key">{html.escape(key)}</span></h2>
    <div class="snap-frame-wrap">
      <iframe class="snap-frame" loading="lazy" title="{name}" srcdoc="{sd}"></iframe>
    </div>
  </section>'''
    )

n = len(INDEX)
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GAW ModTools in-page UI — CURRENT (before redesign)</title>
<style>
  :root {{ color-scheme: dark; }}
  html, body {{ margin: 0; padding: 0; background: #0a0a0b; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #e8eaed;
    padding: 64px 24px 80px;
  }}
  .legend {{
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    background: rgba(12,14,18,0.96); backdrop-filter: blur(10px);
    border-bottom: 1px solid #2a2f38; padding: 10px 18px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
    color: #ff9933; box-shadow: 0 2px 12px rgba(0,0,0,0.5);
  }}
  .legend small {{ color: #8b929e; font-weight: 500; margin-left: 8px; }}
  .gallery {{ max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }}
  .snap-card {{ background: #0c0e12; border: 1px solid #2a2f38; border-radius: 8px; overflow: hidden; }}
  .snap-title {{
    margin: 0; padding: 12px 16px; font-size: 14px; font-weight: 700; color: #e8eaed;
    border-bottom: 1px solid #2a2f38;
    background: linear-gradient(180deg, #181b20 0%, #0c0e12 100%); letter-spacing: 0.2px;
  }}
  .snap-key {{
    font-size: 10px; font-weight: 600; color: #5c6370;
    font-family: ui-monospace, 'JetBrains Mono', Consolas, monospace;
    margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px;
  }}
  .snap-frame-wrap {{ background: #0a0a0b; }}
  .snap-frame {{ display: block; width: 100%; height: 560px; border: 0; background: #0a0a0b; }}
</style>
</head>
<body>
  <div class="legend">GAW ModTools in-page UI — CURRENT (before redesign)<small>{n} component snapshots · BEFORE baseline, styles preserved verbatim</small></div>
  <div class="gallery">
{chr(10).join(cards)}
  </div>
</body>
</html>
'''

out = ROOT / "gallery-before.html"
out.write_text(page, encoding="utf-8")
print(f"WROTE {out} with {n} sections")
