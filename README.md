# US Economy Nowcasting: public results site

A static site (plain HTML, CSS and JavaScript, no build step) presenting the GDP nowcast and the
industry models of the `m1dfm` project. Charts use Observable Plot and equations KaTeX, both from
jsDelivr.

- `*.html`: the six pages; `assets/`: styles and one script per page.
- `data/*.json`: model results exported by `scripts/build_site_data.py` in the code repository.
  The site holds results and series metadata only, not raw data values.

Preview locally with `python3 -m http.server` in this folder (the pages load JSON, so opening the
files directly does not work).
