const assert = require('node:assert/strict');
const { test } = require('node:test');
const configure = require('./app.config');
const { expo } = require('./app.json');

test('ATS permits only the configured HTTP API host and leaves HTTPS unchanged', (t) => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  });

  for (const apiUrl of ['http://192.0.0.2:8000', 'http://192.168.1.10:8000']) {
    process.env.EXPO_PUBLIC_API_URL = apiUrl;
    const config = configure({ config: structuredClone(expo) });
    assert.deepEqual(config.ios.infoPlist.NSAppTransportSecurity, {
      NSExceptionDomains: {
        [new URL(apiUrl).hostname]: { NSExceptionAllowsInsecureHTTPLoads: true },
      },
    });
    assert.equal(config.ios.infoPlist.NSLocalNetworkUsageDescription,
      expo.ios.infoPlist.NSLocalNetworkUsageDescription);
  }

  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
  assert.deepEqual(configure({ config: structuredClone(expo) }), expo);
  delete process.env.EXPO_PUBLIC_API_URL;
  assert.deepEqual(configure({ config: structuredClone(expo) }), expo);
});
