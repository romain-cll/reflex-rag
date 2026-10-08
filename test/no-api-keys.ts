// Preloaded before every test file (see bunfig.toml). Bun loads `.env`, which
// holds real API keys: removing them makes any test that forgets to inject a
// fake client fail instead of calling a paid API.
delete process.env.ANTHROPIC_API_KEY
delete process.env.MISTRAL_API_KEY
