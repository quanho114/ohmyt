const dns = require('node:dns').promises;
const { isIP } = require('node:net');

// Conservative public-address policy: deny transition/mapped IPv6 and special-use
// ranges rather than risk translating a public-looking address into a private one.
function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1,-1);
    const first = parseInt(normalized.split(':')[0],16);
    return first >= 0x2000 && first < 0x3fff &&
      !(first === 0x2001 && (parseInt(normalized.split(':')[1] || '0',16) <= 0x1ff || normalized.startsWith('2001:db8:'))) && !normalized.startsWith('2002:');
  }
  return false;
}

function createNetworkPolicy({ lookup = dns.lookup, timeoutMs = 3000 } = {}) {
  return async url => {
    let parsed;
    try { parsed = new URL(url); } catch { return false; }
    // Browser-local resources do not contact a network destination.
    if (['data:', 'blob:', 'about:'].includes(parsed.protocol)) return true;
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
    const host = parsed.hostname.replace(/^\[|\]$/g,'').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    if (isIP(host)) return publicAddress(host);
    let timer;
    try {
      const records = await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), timeoutMs); }),
      ]);
      return records.length > 0 && records.every(record => publicAddress(record.address));
    } catch { return false; }
    finally { clearTimeout(timer); }
  };
}
module.exports = { publicAddress, createNetworkPolicy };
