// Twitter/X share card reuses the Open Graph image verbatim. `runtime` is redeclared here rather
// than re-exported so Next can statically read it as a string literal -- re-exporting it trips a
// build warning ("can't recognize the exported `runtime` field").
export const runtime = 'nodejs';
export { default, alt, size, contentType } from './opengraph-image';
