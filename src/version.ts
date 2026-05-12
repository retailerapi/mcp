// Compile-time package identity. tsup's `define` replaces __PKG_NAME__ and
// __PKG_VERSION__ with the literals from package.json — see tsup.config.ts.
// This is the only file in the bundle that knows the version; everything else
// imports from here. Bumping package.json is the only way to change it.

declare const __PKG_NAME__: string;
declare const __PKG_VERSION__: string;

export const PKG_NAME: string = __PKG_NAME__;
export const PKG_VERSION: string = __PKG_VERSION__;
