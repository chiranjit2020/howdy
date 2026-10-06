Fonts drawn into the welcome page's share image (`src/app/(welcome)/welcome/opengraph-image.tsx`), which cannot use
next/font. Both from Google Fonts under the SIL Open Font License 1.1: Fraunces (600, opsz 144) and Google Sans (500).
Google Sans is subset to Latin with its GSUB table dropped (`pyftsubset`): the image renderer (satori) cannot read one
of its substitution lookups.
