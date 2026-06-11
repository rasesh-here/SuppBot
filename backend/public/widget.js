(function () {
  "use strict";

  // Config from script tag
  let scriptTag = document.currentScript;
  if (!scriptTag) {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.includes("/widget.js")) {
        scriptTag = scripts[i];
        break;
      }
    }
  }

  let scriptOrigin = "";
  if (scriptTag && scriptTag.src) {
    try { scriptOrigin = new URL(scriptTag.src).origin; } catch (e) { }
  }

  let apiUrl = scriptTag?.getAttribute("data-api-url") || scriptOrigin || "http://localhost:3001";
  if (scriptOrigin && !scriptOrigin.includes("localhost") && apiUrl.includes("localhost")) {
    apiUrl = scriptOrigin;
  }

  const positionAttr = scriptTag?.getAttribute("data-position") || "bottom-right";
  const offsetX = scriptTag?.getAttribute("data-offset-x") || "24px";
  const offsetY = scriptTag?.getAttribute("data-offset-y") || "24px";
  const isTop = positionAttr.includes("top");
  const isLeft = positionAttr.includes("left");

  const CONFIG = {
    apiUrl,
    widgetToken: scriptTag?.getAttribute("data-widget-token") || "",
    title: scriptTag?.getAttribute("data-title") || "Support Chat",
    welcome: scriptTag?.getAttribute("data-welcome") || "Hi! How can I help you today?",
    options: scriptTag?.getAttribute("data-options") || "Getting Started,Common Issues,Billing,Contact Support",
    primaryColor: scriptTag?.getAttribute("data-primary-color") || "",
    secondaryColor: scriptTag?.getAttribute("data-secondary-color") || "",
  };

  // Prevent double-init
  if (window.__SupportChatLoaded) return;
  window.__SupportChatLoaded = true;

  // State 
  let isOpen = false;
  let isLoading = false;
  let history = [];
  let hasShownWelcome = false;
  let lastActivityTime = Date.now();

  // Load stylesheet 
  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = `${CONFIG.apiUrl}/widget.css?v=${Date.now()}`;

  const preStyle = document.createElement("style");
  preStyle.innerHTML = `#sc-root { display: none !important; }`;
  document.head.appendChild(preStyle);
  styleLink.onload = () => preStyle.remove();
  document.head.appendChild(styleLink);

  // Build DOM 
  const root = document.createElement("div");
  root.id = "sc-root";

  if (isTop) {
    root.style.setProperty("--sc-top", offsetY);
    root.style.setProperty("--sc-window-top", `calc(${offsetY} + 58px)`);
  } else {
    root.style.setProperty("--sc-bottom", offsetY);
    root.style.setProperty("--sc-window-bottom", `calc(${offsetY} + 58px)`);
  }
  if (isLeft) {
    root.style.setProperty("--sc-left", offsetX);
  } else {
    root.style.setProperty("--sc-right", offsetX);
  }
  root.style.setProperty("--sc-translate-y", isTop ? "-10px" : "10px");

  if (CONFIG.primaryColor) root.style.setProperty("--sc-primary-color", CONFIG.primaryColor);
  if (CONFIG.secondaryColor) root.style.setProperty("--sc-secondary-color", CONFIG.secondaryColor);

  root.innerHTML = `
    <button id="sc-bubble" aria-label="Open support chat">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="white" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="var(--sc-primary-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="16.5" r="1.5" fill="var(--sc-primary-color)" />
      </svg>
    </button>

    <div id="sc-window" role="dialog" aria-label="Support chat">
      <div id="sc-header">
        <div id="sc-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div id="sc-title-container">
          <div id="sc-title">${CONFIG.title}</div>
          <div id="sc-status-dot" title="Online"></div>
        </div>
        <button id="sc-close" aria-label="Close chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div id="sc-messages" aria-live="polite"></div>
      <div id="sc-footer">
        <div id="sc-input-row">
          <textarea id="sc-input" placeholder="Ask a question..." rows="2" maxlength="500" aria-label="Type your message"></textarea>
          <button id="sc-send" aria-label="Send message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // References 
  const bubble = document.getElementById("sc-bubble");
  const chatWindow = document.getElementById("sc-window");
  const messagesEl = document.getElementById("sc-messages");
  const input = document.getElementById("sc-input");
  const sendBtn = document.getElementById("sc-send");
  const closeBtn = document.getElementById("sc-close");

  // Helpers 
  function addMessage(role, content) {
    const el = document.createElement("div");
    el.className = `sc-msg ${role}`;
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "sc-typing";
    el.id = "sc-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("sc-typing")?.remove();
  }

  function setLoading(val) {
    isLoading = val;
    sendBtn.disabled = val;
    input.disabled = val;
  }

  // Send message 
  async function sendMessage(overrideText = null, category = null) {
    const text = (overrideText !== null ? overrideText : input.value).trim();
    if (!text || isLoading) return;

    lastActivityTime = Date.now();

    if (overrideText === null) {
      input.value = "";
      input.style.height = "auto";
    }

    addMessage("user", text);
    history.push({ role: "user", content: text });
    setLoading(true);
    showTyping();

    try {
      const res = await fetch(`${CONFIG.apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-widget-token": CONFIG.widgetToken,
        },
        body: JSON.stringify({
          message: text,
          category,
          history: history.slice(-10, -1),
        }),
      });

      hideTyping();

      if (res.status === 429) {
        const data = await res.json();
        addMessage("error", data.message || "Too many messages. Please wait.");
        history.pop();
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const reply = data.reply || "Sorry, I couldn't process that.";

      lastActivityTime = Date.now();
      addMessage("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      hideTyping();
      addMessage("error", "Connection error. Please try again.");
      history.pop();
      console.error("SupportChat error:", err);
    } finally {
      setLoading(false);
      input.focus();
    }
  }

  // Auto-resize textarea 
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", () => sendMessage());

  // Open / close 
  function openChat() {
    isOpen = true;
    chatWindow.classList.add("open");
    bubble.classList.add("open");
    setTimeout(() => input.focus(), 250);

    // Reset after 5 min inactivity
    if (Date.now() - lastActivityTime > 5 * 60 * 1000) {
      messagesEl.innerHTML = "";
      history = [];
      hasShownWelcome = false;
    }
    lastActivityTime = Date.now();

    if (!hasShownWelcome) {
      hasShownWelcome = true;
      addMessage("bot", CONFIG.welcome);
      setTimeout(showQuickOptions, 400);
    }
  }

  function showQuickOptions() {
    const list = CONFIG.options.split(",").map((o) => o.trim()).filter(Boolean);
    if (list.length === 0) return;

    const container = document.createElement("div");
    container.className = "sc-options-container";

    list.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "sc-option-btn";
      btn.textContent = option;
      btn.addEventListener("click", () => {
        container.remove();
        sendMessage(option, option);
      });
      container.appendChild(btn);
    });

    messagesEl.appendChild(container);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove("open");
    bubble.classList.remove("open");
  }

  bubble.addEventListener("click", () => (isOpen ? closeChat() : openChat()));
  closeBtn.addEventListener("click", closeChat);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closeChat();
  });

  // Public API 
  window.SupportChat = {
    open: openChat,
    close: closeChat,
    toggle: () => (isOpen ? closeChat() : openChat()),
  };
})();
