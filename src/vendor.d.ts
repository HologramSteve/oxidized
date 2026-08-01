// electrobun's bundled API imports `three` for its WGPU adapters; we don't
// use them, so stub the module to keep typechecking quiet.
declare module "three";
