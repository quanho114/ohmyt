export const targets = {
  linux: {flag:'--linux',artifact:'tar.gz',description:'Linux portable archive; requires system bubblewrap for project execution'},
  win32: {flag:'--win',artifact:'zip',description:'Windows portable archive; project execution remains subject to supported sandbox availability'},
  darwin: {flag:'--mac',artifact:'zip',description:'macOS app archive; unsigned unless signing is configured externally'},
};
