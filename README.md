# OnlyNews
Search engine based on [NewsAPI](https://newsapi.org)service

## Updates 
- Basic user system implemented
- News categorized by source or topic

Next updates coming soon

## Static version (GitHub Pages)
**https://kenserikawa.github.io/onlynews/**: a Ground News–style aggregator. Stories are grouped across
~37 Spanish and international outlets, with a left/center/right coverage bar, blindspots and a side-by-side
comparison of how each outlet covers the story.

- `pipeline/`: Node script run hourly by `.github/workflows/pages.yml`. It fetches the RSS feeds listed in
  `pipeline/sources.json`, clusters articles into stories (TF-IDF + average-link) and writes `site/data/*.json`.
- `site/`: static front-end (plain HTML/CSS/ES modules) that only reads those JSON files.
- Outlet bias ratings live in `pipeline/sources.json` and are indicative.
- Optional: set `REFINE_ENDPOINT` (OpenAI-compatible API) to plug in a model for refining stories (not implemented yet).

```bash
npm install
npm test                                   # pipeline unit tests
npm run build                              # fetch feeds → site/data/
node pipeline/tools/inspect.js es          # review clustering
python3 -m http.server -d site             # preview at http://localhost:8000
```
