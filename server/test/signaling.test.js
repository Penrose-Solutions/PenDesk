import http from 'node:http';
import assert from 'node:assert';

// Test HTTP endpoints on the running server
const options = {
  hostname: '127.0.0.1',
  port: 8080,
  path: '/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  assert.strictEqual(res.statusCode, 200, 'Health check should return 200');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const json = JSON.parse(data);
    assert.strictEqual(json.status, 'ok', 'Status should be ok');
    console.log('✓ Health check passed:', json);

    // Test ICE servers endpoint
    http.get('http://127.0.0.1:8080/api/ice-servers?clientId=test-user', (iceRes) => {
      assert.strictEqual(iceRes.statusCode, 200);
      let iceData = '';
      iceRes.on('data', (c) => { iceData += c; });
      iceRes.on('end', () => {
        const iceJson = JSON.parse(iceData);
        assert(Array.isArray(iceJson.iceServers), 'iceServers should be an array');
        assert(iceJson.iceServers.length >= 2, 'Should have STUN and TURN configurations');
        console.log('✓ ICE Servers endpoint passed:', iceJson.iceServers);
        process.exit(0);
      });
    });
  });
});

req.on('error', (err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

req.end();
