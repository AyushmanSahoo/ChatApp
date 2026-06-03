const apiBase = window.location.protocol === "file:" ? "http://localhost:8080" : window.location.origin;

const els = {
  roomForm: document.querySelector("#roomForm"),
  roomIdInput: document.querySelector("#roomIdInput"),
  senderInput: document.querySelector("#senderInput"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  roomList: document.querySelector("#roomList"),
  roomCount: document.querySelector("#roomCount"),
  statusDot: document.querySelector("#statusDot"),
  connectionText: document.querySelector("#connectionText"),
  activeRoomTitle: document.querySelector("#activeRoomTitle"),
  activeRoomSubtitle: document.querySelector("#activeRoomSubtitle"),
  livePill: document.querySelector("#livePill"),
  copyRoomButton: document.querySelector("#copyRoomButton"),
  reconnectButton: document.querySelector("#reconnectButton"),
  messageList: document.querySelector("#messageList"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  charCount: document.querySelector("#charCount"),
  codeButton: document.querySelector("#codeButton"),
  topicButton: document.querySelector("#topicButton"),
  clearDraftButton: document.querySelector("#clearDraftButton"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileMeta: document.querySelector("#profileMeta"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  detailRoomId: document.querySelector("#detailRoomId"),
  detailCreatedBy: document.querySelector("#detailCreatedBy"),
  detailCreatedAt: document.querySelector("#detailCreatedAt"),
  detailMembers: document.querySelector("#detailMembers"),
  activityList: document.querySelector("#activityList"),
  toast: document.querySelector("#toast")
};

const seedRooms = [
  { id: "backend-sync", live: true, members: 4, createdBy: "Alex Dev", createdAt: "2025-05-22T09:41:00" },
  { id: "api-design", live: false, members: 3 },
  { id: "frontend-chat", live: true, members: 5 },
  { id: "dev-ops", live: false, members: 2 },
  { id: "random", live: false, members: 1 }
];

const sampleMessages = [
  {
    sender: "System",
    content: "Create or join a room to start Message history.",
    timestamp: new Date().toISOString(),
    system: true
  }
];

const state = {
  roomId: null,
  sender: localStorage.getItem("chatapp.sender") || "Alex Dev",
  rooms: loadRooms(),
  messages: [],
  socket: null,
  stompReady: false,
  frameBuffer: "",
  createdMeta: loadMeta(),
  activity: []
};

function loadRooms() {
  try {
    const stored = JSON.parse(localStorage.getItem("chatapp.rooms") || "[]");
    const merged = [...stored, ...seedRooms].reduce((map, room) => {
      map.set(room.id, { ...room, ...map.get(room.id) });
      return map;
    }, new Map());
    return [...merged.values()];
  } catch {
    return seedRooms;
  }
}

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem("chatapp.meta") || "{}");
  } catch {
    return {};
  }
}

function saveRooms() {
  const userRooms = state.rooms.filter((room) => !seedRooms.some((seed) => seed.id === room.id));
  localStorage.setItem("chatapp.rooms", JSON.stringify(userRooms));
  localStorage.setItem("chatapp.meta", JSON.stringify(state.createdMeta));
}

function initials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "G").concat(parts[1]?.[0] || parts[0]?.[1] || "").toUpperCase();
}

function roomLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
}

function localIsoNow() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 19);
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Today";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function addActivity(text) {
  state.activity.unshift({ text, time: new Date().toISOString() });
  state.activity = state.activity.slice(0, 6);
  renderActivity();
}

function updateProfile() {
  const sender = els.senderInput.value.trim() || state.sender;
  state.sender = sender;
  localStorage.setItem("chatapp.sender", sender);
  els.profileAvatar.textContent = initials(sender);
  els.profileName.textContent = sender;
  els.profileMeta.textContent = state.roomId ? `Active in #${state.roomId}` : "Ready to connect";
}

function renderRooms() {
  els.roomList.innerHTML = "";
  els.roomCount.textContent = state.rooms.length;

  state.rooms.forEach((room) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `room-item${room.id === state.roomId ? " active" : ""}`;
    button.innerHTML = `
      <span class="room-hash">#</span>
      <span>
        <strong>${escapeHtml(room.id)}</strong>
        <small><i class="mini-dot ${room.live ? "live" : ""}"></i>${room.live ? "Live room" : "Waiting for room"}</small>
      </span>
      <span class="room-members">${room.members || 1}</span>
    `;
    button.addEventListener("click", () => {
      els.roomIdInput.value = room.id;
      joinRoom(room.id);
    });
    els.roomList.append(button);
  });
}

function renderActivity() {
  const items = state.activity.length ? state.activity : [
    { text: "Waiting for room", time: new Date().toISOString() },
    { text: "Ready to connect", time: new Date().toISOString() }
  ];

  els.activityList.innerHTML = items.map((item) => `
    <li>
      <time>${formatTime(item.time)}</time>
      <span>${escapeHtml(item.text)}</span>
    </li>
  `).join("");
}

function renderDetails() {
  const room = state.rooms.find((item) => item.id === state.roomId);
  const meta = state.createdMeta[state.roomId] || room || {};
  const uniqueSenders = new Set(state.messages.filter((message) => !message.system).map((message) => message.sender));
  const members = Math.max(room?.members || 0, uniqueSenders.size || 0, state.roomId ? 1 : 0);

  els.detailRoomId.textContent = state.roomId || "-";
  els.detailCreatedBy.textContent = meta.createdBy || (state.roomId ? state.sender : "-");
  els.detailCreatedAt.textContent = meta.createdAt ? `${formatDate(meta.createdAt)} ${formatTime(meta.createdAt)}` : "-";
  els.detailMembers.textContent = String(members);
}

function renderHeader() {
  const hasRoom = Boolean(state.roomId);
  els.activeRoomTitle.textContent = hasRoom ? state.roomId : "Live room";
  els.activeRoomSubtitle.textContent = hasRoom
    ? `${state.messages.length} messages loaded from this room`
    : "Choose a room to load Message history";
  els.livePill.textContent = state.stompReady ? "Connected" : hasRoom ? "Waiting for room" : "Waiting for room";
  els.livePill.classList.toggle("connected", state.stompReady);
}

function setConnection(status, text) {
  els.statusDot.className = `status-dot ${status || ""}`.trim();
  els.connectionText.textContent = text;
  renderHeader();
  updateComposerState();
}

function renderMessages() {
  els.messageList.innerHTML = "";
  const messages = state.roomId ? state.messages : sampleMessages;

  if (!messages.length) {
    els.messageList.innerHTML = `
      <div class="empty-state">
        <div>
          <h3>No messages yet</h3>
          <p>Send the first message in this room. New messages will appear here as soon as the WebSocket connection is live.</p>
        </div>
      </div>
    `;
    return;
  }

  let lastDate = "";
  messages.forEach((message) => {
    const stamp = message.timestamp || message.messageTime || new Date().toISOString();
    const day = formatDate(stamp);
    if (day !== lastDate) {
      const chip = document.createElement("div");
      chip.className = "date-chip";
      chip.textContent = day;
      els.messageList.append(chip);
      lastDate = day;
    }

    const sender = message.sender || "Guest";
    const isMine = sender === state.sender;
    const isSystem = message.system || sender.toLowerCase() === "system";
    const row = document.createElement("article");
    row.className = `message-row ${isSystem ? "system" : isMine ? "outgoing" : "incoming"}`;
    row.innerHTML = `
      <span class="avatar">${escapeHtml(initials(sender))}</span>
      <div class="message-bubble ${isSystem ? "system-bubble" : ""}">
        <div class="message-meta">
          <strong>${escapeHtml(sender)}</strong>
          <time>${formatTime(stamp)}</time>
        </div>
        <div class="message-text">${formatMessage(message.content || "")}</div>
      </div>
    `;
    els.messageList.append(row);
  });

  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight;
  });
}

function updateComposerState() {
  const hasText = els.messageInput.value.trim().length > 0;
  const canSend = Boolean(state.roomId && state.stompReady && hasText);
  els.messageInput.disabled = !state.roomId;
  els.sendButton.disabled = !canSend;
  els.charCount.textContent = `${els.messageInput.value.length} / 2000`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessage(content) {
  const safe = escapeHtml(content);
  return safe.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
}

function upsertRoom(roomId, patch = {}) {
  const index = state.rooms.findIndex((room) => room.id === roomId);
  if (index >= 0) {
    state.rooms[index] = { ...state.rooms[index], ...patch, id: roomId };
  } else {
    state.rooms.unshift({ id: roomId, live: true, members: 1, ...patch });
  }
  saveRooms();
  renderRooms();
}

async function requestText(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createRoom() {
  updateProfile();
  const roomId = roomLabel(els.roomIdInput.value);
  if (!roomId) {
    showToast("Enter a room ID first.");
    return;
  }

  els.roomIdInput.value = roomId;
  els.createRoomButton.disabled = true;
  try {
    const response = await fetch(`${apiBase}/api/v1/rooms`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: roomId
    });
    const data = await requestText(response);
    if (!response.ok) throw new Error(typeof data === "string" ? data : "Could not create room.");

    const createdAt = new Date().toISOString();
    state.createdMeta[roomId] = { createdBy: state.sender, createdAt };
    upsertRoom(roomId, { live: true, members: 1, createdBy: state.sender, createdAt });
    addActivity(`${state.sender} created #${roomId}`);
    showToast(`Room #${roomId} created.`);
    await activateRoom(data.roomId || roomId, data.messages || []);
  } catch (error) {
    showToast(error.message);
  } finally {
    els.createRoomButton.disabled = false;
  }
}

async function joinRoom(roomId = roomLabel(els.roomIdInput.value)) {
  updateProfile();
  if (!roomId) {
    showToast("Enter a room ID first.");
    return;
  }

  els.roomIdInput.value = roomId;
  els.joinRoomButton.disabled = true;
  try {
    const response = await fetch(`${apiBase}/api/v1/rooms/${encodeURIComponent(roomId)}`);
    const data = await requestText(response);
    if (!response.ok) throw new Error(typeof data === "string" ? data : "Room not found.");

    upsertRoom(roomId, { live: true, members: Math.max(1, data.messages?.length ? 2 : 1) });
    addActivity(`${state.sender} joined #${roomId}`);
    await activateRoom(data.roomId || roomId, data.messages || []);
  } catch (error) {
    showToast(error.message);
  } finally {
    els.joinRoomButton.disabled = false;
  }
}

async function activateRoom(roomId, initialMessages = []) {
  state.roomId = roomId;
  state.messages = normalizeMessages(initialMessages);
  renderRooms();
  renderHeader();
  renderMessages();
  renderDetails();
  updateProfile();
  await loadMessages(roomId);
  connectSocket(roomId);
}

async function loadMessages(roomId) {
  try {
    const response = await fetch(`${apiBase}/api/v1/rooms/${encodeURIComponent(roomId)}/messages?size=50`);
    if (!response.ok) return;
    const messages = await response.json();
    state.messages = normalizeMessages(messages);
    renderMessages();
    renderDetails();
  } catch {
    showToast("Message history could not be loaded yet.");
  }
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.content || message.sender))
    .map((message) => ({
      sender: message.sender || "Guest",
      content: message.content || "",
      timestamp: message.timestamp || message.messageTime || new Date().toISOString()
    }));
}

function wsUrl(path) {
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  return url.toString();
}

function sockJsWebSocketPath() {
  const sessionId = Math.random().toString(36).slice(2, 14);
  return `/chat/000/${sessionId}/websocket`;
}

function frame(command, headers = {}, body = "") {
  const headerText = Object.entries(headers).map(([key, value]) => `${key}:${value}`).join("\n");
  return `${command}\n${headerText}\n\n${body}\0`;
}

function sendSockJsFrame(payload) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify([payload]));
}

function parseFrames(data) {
  state.frameBuffer += data;
  const parts = state.frameBuffer.split("\0");
  state.frameBuffer = parts.pop() || "";
  return parts.filter(Boolean).map((raw) => {
    const lines = raw.replace(/^\n+/, "").split("\n");
    const command = lines.shift();
    const headers = {};
    let index = 0;
    while (index < lines.length && lines[index] !== "") {
      const [key, ...rest] = lines[index].split(":");
      headers[key] = rest.join(":");
      index += 1;
    }
    const body = lines.slice(index + 1).join("\n");
    return { command, headers, body };
  });
}

function connectSocket(roomId) {
  disconnectSocket();
  setConnection("connecting", "Connecting to server");

  try {
    state.socket = new WebSocket(wsUrl(sockJsWebSocketPath()));
  } catch {
    setConnection("", "Waiting for room");
    showToast("WebSocket is unavailable in this browser.");
    return;
  }

  state.socket.addEventListener("message", (event) => {
    if (event.data === "o") {
      sendSockJsFrame(frame("CONNECT", {
        "accept-version": "1.2",
        "heart-beat": "0,0"
      }));
      return;
    }

    if (event.data === "h") return;

    if (event.data.startsWith("c")) {
      state.stompReady = false;
      setConnection("", state.roomId ? "Waiting for room" : "Waiting for room");
      return;
    }

    const packets = event.data.startsWith("a") ? JSON.parse(event.data.slice(1)) : [event.data];
    packets.flatMap((packet) => parseFrames(packet)).forEach((received) => {
      if (received.command === "CONNECTED") {
        state.stompReady = true;
        sendSockJsFrame(frame("SUBSCRIBE", {
          id: `sub-${roomId}`,
          destination: `/topic/room/${roomId}`
        }));
        setConnection("connected", "Connected");
        addActivity("Room is now live");
      }

      if (received.command === "MESSAGE" && received.body) {
        try {
          const message = JSON.parse(received.body);
          appendMessage(message);
        } catch {
          appendMessage({ sender: "System", content: received.body, timestamp: new Date().toISOString() });
        }
      }

      if (received.command === "ERROR") {
        showToast(received.body || "WebSocket error.");
      }
    });
  });

  state.socket.addEventListener("close", () => {
    state.stompReady = false;
    setConnection("", state.roomId ? "Waiting for room" : "Waiting for room");
  });

  state.socket.addEventListener("error", () => {
    state.stompReady = false;
    setConnection("", "Waiting for room");
    showToast("Could not connect to the WebSocket endpoint.");
  });
}

function disconnectSocket() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    sendSockJsFrame(frame("DISCONNECT", { receipt: "close" }));
    state.socket.close();
  } else if (state.socket) {
    state.socket.close();
  }
  state.socket = null;
  state.stompReady = false;
  state.frameBuffer = "";
}

function appendMessage(message) {
  const normalized = normalizeMessages([message])[0];
  if (!normalized) return;
  const key = `${normalized.sender}|${normalized.content}|${normalized.timestamp}`;
  const exists = state.messages.some((item) => `${item.sender}|${item.content}|${item.timestamp}` === key);
  if (!exists) {
    state.messages.push(normalized);
    const room = state.rooms.find((item) => item.id === state.roomId);
    if (room) {
      room.live = true;
      room.members = Math.max(room.members || 1, new Set(state.messages.map((item) => item.sender)).size);
    }
    addActivity(`${normalized.sender} sent a message`);
    renderRooms();
    renderHeader();
    renderMessages();
    renderDetails();
  }
}

function sendMessage() {
  const content = els.messageInput.value.trim();
  if (!content || !state.roomId || !state.stompReady || !state.socket) return;

  sendSockJsFrame(frame("SEND", {
    destination: `/app/sendMessage/${state.roomId}`,
    "content-type": "application/json"
  }, JSON.stringify({
    roomId: state.roomId,
    sender: state.sender,
    content,
    messageTime: localIsoNow()
  })));

  els.messageInput.value = "";
  updateComposerState();
}

function insertAtCursor(text) {
  const input = els.messageInput;
  if (input.disabled) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end);
  input.value = `${input.value.slice(0, start)}${text.replace("$1", selected)}${input.value.slice(end)}`;
  input.focus();
  updateComposerState();
}

els.createRoomButton.addEventListener("click", createRoom);
els.roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom();
});
els.senderInput.addEventListener("input", updateProfile);
els.saveProfileButton.addEventListener("click", () => {
  updateProfile();
  showToast("Profile saved.");
});
els.copyRoomButton.addEventListener("click", async () => {
  if (!state.roomId) return showToast("Join a room first.");
  await navigator.clipboard?.writeText(state.roomId);
  showToast("Room ID copied.");
});
els.reconnectButton.addEventListener("click", () => {
  if (!state.roomId) return showToast("Join a room first.");
  connectSocket(state.roomId);
});
els.messageInput.addEventListener("input", updateComposerState);
els.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});
els.codeButton.addEventListener("click", () => insertAtCursor("`$1`"));
els.topicButton.addEventListener("click", () => insertAtCursor("#topic "));
els.clearDraftButton.addEventListener("click", () => {
  els.messageInput.value = "";
  updateComposerState();
  els.messageInput.focus();
});

window.addEventListener("beforeunload", disconnectSocket);

els.senderInput.value = state.sender;
els.roomIdInput.value = "backend-sync";
updateProfile();
renderRooms();
renderActivity();
renderDetails();
renderHeader();
renderMessages();
setConnection("", "Waiting for room");
