// npm/Electron equivalent of Codex's runtime-package rules. No Bazel required.
module.exports = {
  appId:'io.sky.Desktop',productName:'sky',
  directories:{app:'output/release/app',output:'output/release/artifacts'},
  extraMetadata:{main:'electron/main.cjs'},
  // Workers, Python integration and sandbox launchers require real filesystem paths.
  asar:false,npmRebuild:true,
  files:['**/*','!**/.env*','!**/*.log','!**/__pycache__/**'],
  artifactName:'sky-${version}-${os}-${arch}.${ext}',
  linux:{target:['tar.gz'],executableName:'sky',category:'Utility',icon:'public/sky-icon.png'},
  win:{target:['zip'],executableName:'sky',icon:'public/sky-icon.png'},
  mac:{target:['zip'],icon:'public/sky-icon.png',category:'public.app-category.productivity',identity:null},
  publish:null,
};
