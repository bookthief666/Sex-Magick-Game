# Embedded release fonts

`index.html` embeds the Google Fonts distributions of Orbitron (variable
400–900) and Cinzel Decorative (700 and 900) as data URLs. Keeping the faces in
the single-file shell removes first-paint and offline dependence on Google Fonts
without changing the established typography.

Both families are distributed under the SIL Open Font License 1.1. The exact
license notices are retained beside this file.

- Orbitron source: `google/fonts/ofl/orbitron/Orbitron[wght].ttf`
  (`1fc54ce7116a6ec549f37358466bcc92f9a72c33`)
- Cinzel Decorative sources:
  `google/fonts/ofl/cinzeldecorative/CinzelDecorative-Bold.ttf`
  (`7bb0f359939a39da4e0857a3c15a321d780d04e6`) and
  `CinzelDecorative-Black.ttf`
  (`e5294b9ec9c5914fc9b775dc401e6a737d059272`).
