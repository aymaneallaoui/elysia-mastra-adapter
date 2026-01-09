import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import { ElysiaServer } from '../../../src/index.js';

const app = new Elysia();

const mastra = new Mastra({});

const server = new ElysiaServer({
  app,
  mastra,
  prefix: '/api',
  streamOptions: {
    redact: false,
  },
});

server.registerContextMiddleware();
await server.registerRoutes();

app.get('/events', async function* ({ set, query }) {
  set.headers['Content-Type'] = 'text/event-stream';
  set.headers['Cache-Control'] = 'no-cache';
  set.headers['Connection'] = 'keep-alive';
  set.headers['Access-Control-Allow-Origin'] = '*';

  const interval = parseInt(query.interval as string) || 1000;
  const count = parseInt(query.count as string) || 10;

  yield `data: ${JSON.stringify({
    type: 'connected',
    message: 'Connected to event stream',
    timestamp: new Date().toISOString(),
  })}\n\n`;

  for (let i = 1; i <= count; i++) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    const event = {
      type: 'update',
      id: i,
      message: `Event ${i} of ${count}`,
      timestamp: new Date().toISOString(),
      data: {
        progress: (i / count) * 100,
        remaining: count - i,
      },
    };

    yield `data: ${JSON.stringify(event)}\n\n`;
  }

  yield `data: ${JSON.stringify({
    type: 'complete',
    message: 'Stream completed',
    timestamp: new Date().toISOString(),
  })}\n\n`;
});

app.post('/chat/stream', async function* ({ body, set }) {
  const { message } = body as { message: string };

  set.headers['Content-Type'] = 'text/event-stream';
  set.headers['Cache-Control'] = 'no-cache';
  set.headers['Connection'] = 'keep-alive';

  const response = `I understand you said: "${message}". Let me provide a detailed response about that topic.`;
  const words = response.split(' ');

  yield `data: ${JSON.stringify({
    type: 'start',
    message: 'Starting response...',
    timestamp: new Date().toISOString(),
  })}\n\n`;

  let accumulated = '';
  for (let i = 0; i < words.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    accumulated += (i > 0 ? ' ' : '') + words[i];

    yield `data: ${JSON.stringify({
      type: 'token',
      token: words[i],
      accumulated,
      progress: ((i + 1) / words.length) * 100,
      timestamp: new Date().toISOString(),
    })}\n\n`;
  }

  yield `data: ${JSON.stringify({
    type: 'complete',
    message: 'Response completed',
    final_text: accumulated,
    timestamp: new Date().toISOString(),
  })}\n\n`;
});

app.get('/data/stream', async function* ({ set, query }) {
  set.headers['Content-Type'] = 'application/x-ndjson';
  set.headers['Transfer-Encoding'] = 'chunked';

  const count = parseInt(query.count as string) || 5;
  const delay = parseInt(query.delay as string) || 500;

  for (let i = 1; i <= count; i++) {
    await new Promise((resolve) => setTimeout(resolve, delay));

    const data = {
      id: i,
      timestamp: new Date().toISOString(),
      data: {
        value: Math.random() * 100,
        status: i === count ? 'complete' : 'processing',
      },
    };

    yield JSON.stringify(data) + '\n';
  }
});

app.ws('/ws', {
  open(ws) {
    console.log('WebSocket connection opened');
    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString(),
      })
    );
  },

  message(ws, message) {
    console.log('Received message:', message);

    try {
      const data = JSON.parse(message as string);

      ws.send(
        JSON.stringify({
          type: 'echo',
          original: data,
          timestamp: new Date().toISOString(),
          response: `Received: ${data.message || 'No message'}`,
        })
      );

      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: 'followup',
            message: 'This is a delayed follow-up message',
            timestamp: new Date().toISOString(),
          })
        );
      }, 2000);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid JSON format',
          timestamp: new Date().toISOString(),
        })
      );
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(ws) {
    console.log('WebSocket connection closed');
  },
});

app.get('/', () => {
  return new Response(
    `
<!DOCTYPE html>
<html>
<head>
    <title>Streaming Examples</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; }
        .output { background: #f5f5f5; padding: 10px; margin: 10px 0; height: 200px; overflow-y: auto; }
        button { padding: 10px 20px; margin: 5px; }
        input { padding: 8px; margin: 5px; width: 300px; }
    </style>
</head>
<body>
    <h1>Elysia-Mastra Streaming Examples</h1>
    
    <div class="section">
        <h2>Server-Sent Events</h2>
        <button onclick="startSSE()">Start Event Stream</button>
        <button onclick="stopSSE()">Stop Stream</button>
        <div id="sse-output" class="output"></div>
    </div>
    
    <div class="section">
        <h2>Streaming Chat</h2>
        <input type="text" id="chat-input" placeholder="Enter your message..." />
        <button onclick="sendChatMessage()">Send Message</button>
        <div id="chat-output" class="output"></div>
    </div>
    
    <div class="section">
        <h2>WebSocket</h2>
        <input type="text" id="ws-input" placeholder="Enter WebSocket message..." />
        <button onclick="connectWS()">Connect</button>
        <button onclick="sendWSMessage()">Send Message</button>
        <button onclick="disconnectWS()">Disconnect</button>
        <div id="ws-output" class="output"></div>
    </div>

    <script>
        let eventSource = null;
        let websocket = null;

        function addOutput(elementId, message) {
            const output = document.getElementById(elementId);
            output.innerHTML += message + '\\n';
            output.scrollTop = output.scrollHeight;
        }

        function startSSE() {
            if (eventSource) eventSource.close();
            
            eventSource = new EventSource('/events?count=5&interval=1000');
            
            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                addOutput('sse-output', \`[\${data.timestamp}] \${data.type}: \${data.message}\`);
            };
            
            eventSource.onerror = function(event) {
                addOutput('sse-output', 'SSE Error occurred');
            };
        }

        function stopSSE() {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
                addOutput('sse-output', 'Stream stopped');
            }
        }

        function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (!message) return;

            fetch('/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            }).then(response => {
                const reader = response.body.getReader();
                
                function readStream() {
                    reader.read().then(({ done, value }) => {
                        if (done) return;
                        
                        const text = new TextDecoder().decode(value);
                        const lines = text.split('\\n');
                        
                        lines.forEach(line => {
                            if (line.startsWith('data: ')) {
                                const data = JSON.parse(line.slice(6));
                                addOutput('chat-output', \`[\${data.type}] \${data.token || data.message}\`);
                            }
                        });
                        
                        readStream();
                    });
                }
                
                readStream();
            });

            input.value = '';
        }

        function connectWS() {
            if (websocket) websocket.close();
            
            websocket = new WebSocket('ws://localhost:3000/ws');
            
            websocket.onopen = function() {
                addOutput('ws-output', 'WebSocket connected');
            };
            
            websocket.onmessage = function(event) {
                const data = JSON.parse(event.data);
                addOutput('ws-output', \`[\${data.type}] \${data.message || JSON.stringify(data)}\`);
            };
            
            websocket.onclose = function() {
                addOutput('ws-output', 'WebSocket disconnected');
            };
        }

        function sendWSMessage() {
            const input = document.getElementById('ws-input');
            const message = input.value.trim();
            if (!message || !websocket) return;

            websocket.send(JSON.stringify({ message }));
            input.value = '';
        }

        function disconnectWS() {
            if (websocket) {
                websocket.close();
                websocket = null;
            }
        }
    </script>
</body>
</html>
  `,
    {
      headers: { 'Content-Type': 'text/html' },
    }
  );
});

app.get('/health', () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  streaming: 'enabled',
}));

const port = process.env.PORT || 3000;
app.listen(port);

console.log(`🚀 Server running at http://localhost:${port}`);
console.log(`🌊 Streaming endpoints available:`);
console.log(`   GET /events - Server-Sent Events`);
console.log(`   POST /chat/stream - Streaming chat`);
console.log(`   GET /data/stream - NDJSON streaming`);
console.log(`   WS /ws - WebSocket connection`);
console.log(`\n🎮 Interactive demo: http://localhost:${port}`);
