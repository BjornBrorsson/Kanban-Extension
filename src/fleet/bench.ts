import * as http from 'http';

/** Measures real output tokens/second of a local Ollama model (via its own eval stats). */
export function benchOllama(model: string, host = '127.0.0.1:11434', timeoutMs = 180_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const [hostname, port] = host.split(':');
    const body = JSON.stringify({
      model,
      prompt: 'Write a clear 150 word explanation of how a hash map works.',
      stream: false,
      options: { num_predict: 200 }
    });
    const req = http.request(
      { hostname, port: Number(port) || 11434, path: '/api/generate', method: 'POST', timeout: timeoutMs, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', d => (data += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) return reject(new Error(String(j.error)));
            const tps = j.eval_count && j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : 0;
            tps > 0 ? resolve(tps) : reject(new Error('no timing data returned'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
