const baseUrl = process.env.COVERPRO_SMOKE_URL || 'http://127.0.0.1:1421/';
const debugPort = process.env.COVERPRO_CHROME_PORT || '9334';

async function connectTab() {
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const tab = tabs.find((candidate) => candidate.url.includes(new URL(baseUrl).host)) ?? tabs[0];
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error(`No Chrome tab found for ${baseUrl}`);
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve) => pending.set(callId, resolve));
  }

  async function evalJs(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.result?.exceptionDetails) {
      throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
    }
    return result.result.result.value;
  }

  await send('Runtime.enable');
  return { ws, send, evalJs };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const { ws, evalJs } = await connectTab();

try {
  await evalJs(`location.href=${JSON.stringify(baseUrl)}`);
  await evalJs(`new Promise((resolve) => setTimeout(resolve, 800))`);
  await evalJs(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Repair').click()`);
  await evalJs(`new Promise((resolve) => setTimeout(resolve, 150))`);
  await evalJs(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Load').click()`);
  await evalJs(`new Promise((resolve) => setTimeout(resolve, 800))`);

  let text = await evalJs(`document.body.innerText`);
  assert(text.includes('Repair Scope'), 'Repair Scope not visible');
  assert(text.includes('Summary:selectedAngle fixture'), 'fixture label not visible');
  assert(text.includes('Summary bullet 1'), 'summary target not visible');

  await evalJs(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Preview LLM payload').click()`);
  await evalJs(`new Promise((resolve) => setTimeout(resolve, 100))`);
  text = await evalJs(`document.body.innerText`);
  const payload = text.split('Scoped content sent to LLM:')[1] || '';
  assert(payload.includes('Selected angle'), 'summary line missing from payload preview');
  assert(!payload.includes('Focus Digital Experience'), 'payload preview includes Focus Digital section');
  assert(!payload.includes('WAR Cover Letter'), 'payload preview includes cover letter');

  const coverBefore = await evalJs(`document.body.innerText.match(/ExampleCo needs[\\s\\S]*?technical content pipeline\\./)?.[0] || ''`);
  const focusBefore = await evalJs(`document.body.innerText.match(/FOCUS DIGITAL EXPERIENCE[\\s\\S]*?FIRST PAGE SAGE EXPERIENCE/)?.[0] || ''`);
  assert(coverBefore, 'cover letter text missing before local fix');
  assert(focusBefore, 'Focus Digital text missing before local fix');

  await evalJs(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Local fix').click()`);
  await evalJs(`new Promise((resolve) => setTimeout(resolve, 300))`);
  text = await evalJs(`document.body.innerText`);

  assert(!text.includes('Selected angle'), 'selected-angle text still visible after local fix');
  assert(text.includes('Content strategist aligning proof and conversion paths for B2B buyers.'), 'summary line missing after local fix');
  assert(text.includes('Preservation Proof'), 'preservation proof not visible');
  assert(text.includes('Summary bullet 1 changed.'), 'summary change proof missing');
  assert(text.includes('Focus Digital unchanged.'), 'Focus Digital preservation proof missing');
  assert(text.includes('WAR Cover Letter unchanged.'), 'cover letter preservation proof missing');

  const coverAfter = await evalJs(`document.body.innerText.match(/ExampleCo needs[\\s\\S]*?technical content pipeline\\./)?.[0] || ''`);
  const focusAfter = await evalJs(`document.body.innerText.match(/FOCUS DIGITAL EXPERIENCE[\\s\\S]*?FIRST PAGE SAGE EXPERIENCE/)?.[0] || ''`);
  assert(coverAfter === coverBefore, 'cover letter changed after summary local fix');
  assert(focusAfter === focusBefore, 'Focus Digital changed after summary local fix');

  console.log('Summary:selectedAngle browser smoke passed.');
} finally {
  ws.close();
}
