# OnlyNews
Search engine based on [NewsAPI](https://newsapi.org)service

## Updates 
- Basic user system implemented
- News categorized by source or topic

Next updates coming soon

## Static version (GitHub Pages)
`site/` is a static build of OnlyNews (headlines, keyword search over them and sources by category; no login).
NewsAPI can't be called from the browser, so `.github/workflows/pages.yml` runs `scripts/fetch-news.sh`
every 3 hours, saves the JSON into `site/data/` and deploys `site/` to Pages.

Setup: add the `NEWS_API_KEY` repository secret and set *Settings → Pages → Source* to **GitHub Actions**.

Local preview: `NEWS_API_KEY=xxx scripts/fetch-news.sh && python3 -m http.server -d site`
