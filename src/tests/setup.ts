// Set env before any test file imports config.ts.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.ANALYTICS_API_KEY = 'test-key-xyz';
process.env.ANALYTICS_ENDPOINT = 'https://analytics.test/post';
process.env.DB_PATH = ':memory:';
