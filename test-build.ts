await Bun.build({
  entrypoints: ["index.ts"],
  compile: {
    outfile: "test-bin",
    assets: ["dir/**/*"] // Just guessing here based on future/current bundler api? Let's check what Bun supports
  }
})
