// mp4box ships no type definitions; it's only ever used through a dynamic import() in
// lib/video-compress.ts and typed as `any` there. This just stops TS from failing module
// resolution for the bare specifier.
declare module 'mp4box';
