/// Chat widget entry point – vanilla JS, self‑contained module
/// Inserts the chat UI into the page and handles user interaction with the backend

export function initChatWidget() {
  // -----------------------------------------------------------------
  // 1️⃣  Create container and UI markup
  // -----------------------------------------------------------------
  const container = document.createElement('div');
  container.id = 'chat-widget-container';
  container.className = 'open'; // start visible
  container.innerHTML = `
    <div id="chat-header">Chat <span>&times;</span></div>
    <div id="chat-messages" class="chat-messages"></div>
    <div id="chat-typing" class="chat-typing" hidden><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
    <form id="chat-form" class="chat-form">
      <input type="text" id="chat-input" placeholder="Ask something…" autocomplete="off" />
      <button type="submit" id="chat-send">Send</button>
    </form>
  `;
  document.body.appendChild(container);

  // -----------------------------------------------------------------
  // 2️⃣  Cache DOM nodes for later use
  // -----------------------------------------------------------------
  const header = container.querySelector('#chat-header');
  const messagesDiv = container.querySelector('#chat-messages');
  const form = container.querySelector('#chat-form');
  const input = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#chat-send');
  const typingEl = container.querySelector('#chat-typing');

  // -----------------------------------------------------------------
  // 3️⃣  Session handling – reuse a saved UUID or generate a new one
  // -----------------------------------------------------------------
  let sessionId = localStorage.getItem('chatSessionId');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('chatSessionId', sessionId);
  }

  // -----------------------------------------------------------------
  // 4️⃣  Helper: escape user/API text before inserting (XSS safety)
  // -----------------------------------------------------------------
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // -----------------------------------------------------------------
  // 5️⃣  Helper: render a chat bubble (escaped, XSS-safe)
  // -----------------------------------------------------------------
  function addMessage(sender, text, intent = null) {
    const msg = document.createElement('li');
    msg.className = `chat-message ${sender}`;
    const label = document.createElement('strong');
    label.textContent = sender === 'user' ? 'You' : 'Bot';
    msg.appendChild(label);
    msg.appendChild(document.createTextNode(': '));
    msg.appendChild(document.createTextNode(text));
    if (intent) {
      const intentSpan = document.createElement('span');
      intentSpan.className = 'intent';
      intentSpan.textContent = ` [${intent}]`;
      msg.appendChild(intentSpan);
    }
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // -----------------------------------------------------------------
  // 6️⃣  Helper: render structured result chips from the backend
  // -----------------------------------------------------------------
  function addDataChips(data) {
    if (!data) return;
    const chips = [];
    if (Array.isArray(data.items) && data.items.length) {
      chips.push({ label: `${data.items.length} feedback item(s)`, title: data.items.map((i) => i.text || i.reason).join(' | ') });
    }
    if (Array.isArray(data.actions) && data.actions.length) {
      chips.push({ label: `${data.actions.length} action(s)`, title: data.actions.map((a) => a.recommendedAction || a.reason).join(' | ') });
    }
    if (Array.isArray(data.spikes) && data.spikes.length) {
      chips.push({ label: `${data.spikes.length} spike(s)`, title: data.spikes.map((s) => s.reason || s.text).join(' | ') });
    }
    if (chips.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-data-chips';
    chips.forEach((chip) => {
      const chipEl = document.createElement('span');
      chipEl.className = 'chat-chip';
      chipEl.textContent = chip.label;
      if (chip.title) chipEl.title = chip.title;
      wrapper.appendChild(chipEl);
    });
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function setTyping(show) {
    if (typingEl) typingEl.hidden = !show;
  }

  function setChatBusy(busy) {
    input.disabled = busy;
    sendBtn.disabled = busy;
    sendBtn.classList.toggle('is-loading', busy);
  }

  async function loadChatHistory() {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`);
      if (!response.ok) return;
      const history = await response.json();
      history.forEach((item) => {
        addMessage(item.sender, item.message, item.intent);
        if (item.sender === 'bot' && item.data) addDataChips(item.data);
      });
    } catch (error) {
      console.warn('Unable to load chat history', error);
    }
  }

  // -----------------------------------------------------------------
  // 5️⃣  Toggle show/hide widget (click on header)
  // -----------------------------------------------------------------
  header.addEventListener('click', () => {
    container.classList.toggle('open');
  });

  // -----------------------------------------------------------------
  // 7️⃣  Form submission → call backend chat endpoint
  // -----------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    addMessage('user', message);
    input.value = '';
    setTyping(true);
    setChatBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        addMessage('bot', data.error || 'Sorry, something went wrong.');
        return;
      }
      sessionId = data.sessionId || sessionId;
      localStorage.setItem('chatSessionId', sessionId);
      addMessage('bot', data.reply, data.intent);
      addDataChips(data.data);
    } catch (err) {
      console.error('Chat API error', err);
      addMessage('bot', 'Sorry, something went wrong.');
    } finally {
      setTyping(false);
      setChatBusy(false);
      input.focus();
    }
  });

  // -----------------------------------------------------------------
  // 8️⃣  Initial render (load persisted session history)
  // -----------------------------------------------------------------
  loadChatHistory();
}

// Auto‑bootstrap when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatWidget);
} else {
  initChatWidget();
}