// Establish Socket Connection
const socket = io();

// State
const STATE = {
    connected: false,
    mode: 'none', // 'p2p' | 'group'
    roomId: null,
};

// DOM Cache
const els = {
    loginScreen: document.getElementById('login-screen'),
    appInterface: document.getElementById('app-interface'),
    loginForm: document.getElementById('login-form'),
    msgContainer: document.getElementById('messages-container'),
    msgInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('btn-send'),
    recordBtn: document.getElementById('btn-record'), // Retaining for DOM safety, but disabling
    videoOverlay: document.getElementById('video-overlay'), // Retaining for DOM safety
    localVideo: document.getElementById('local-video'), // Retaining for DOM safety
    remoteVideo: document.getElementById('remote-video'), // Retaining for DOM safety
    statusIndicator: document.getElementById('chat-status-indicator'),
    chatTitle: document.getElementById('chat-title'),
    chatSubtitle: document.getElementById('chat-subtitle'),
    serverCap: document.getElementById('server-cap-display'),
    endCallBtn: document.getElementById('btn-end-call'),
    regionSelector: document.getElementById('region-selector'),
    regionSelect: document.getElementById('region-select'),
    welcomePlaceholder: document.getElementById('welcome-placeholder'),
    userBadge: document.getElementById('user-badge'),
    activeCallPanel: document.getElementById('active-call-panel'), // Retaining for DOM safety
    btnVideo: document.getElementById('btn-video'),
    btnVc: document.getElementById('btn-vc')
};

// --- SOCKET EVENTS ---

socket.on('connect', () => {
    STATE.connected = true;
    console.log('Connected to server');
});

socket.on('server_stats', (data) => {
    if (els.serverCap) els.serverCap.innerText = data.count;
});

socket.on('login_success', (data) => {
    els.loginScreen.classList.add('hidden');
    els.appInterface.classList.remove('hidden');
    els.userBadge.innerText = data.name; 
    showToast('Welcome', `Logged in as ${data.name}`, 'success');
});

socket.on('login_error', (data) => showToast('Error', data.msg, 'error'));

socket.on('p2p_waiting', (data) => {
    els.chatTitle.innerText = "Searching...";
    els.chatSubtitle.innerText = data.msg;
    els.statusIndicator.className = "w-3 h-3 bg-yellow-500 rounded-full animate-pulse";
    clearChat();
});

socket.on('p2p_matched', (data) => {
    STATE.mode = 'p2p';
    STATE.roomId = data.room;
    els.chatTitle.innerText = "Connected";
    els.chatSubtitle.innerText = `Chatting with ${data.partner}`;
    els.statusIndicator.className = "w-3 h-3 bg-emerald-500 rounded-full";
    enableChat();
    addSystemMessage(`Matched with **${data.partner}**. Say hi!`);
});

socket.on('group_joined', (data) => {
    STATE.mode = 'group';
    STATE.roomId = data.room || `group_${data.region}`; 
    els.chatTitle.innerText = `Channel: ${data.region ? data.region.toUpperCase() : 'Public'}`;
    els.chatSubtitle.innerText = "Public Group";
    els.statusIndicator.className = "w-3 h-3 bg-emerald-500 rounded-full";
    enableChat();
    addSystemMessage(`Joined **${data.region}** channel.`);
});

socket.on('peer_disconnected', () => {
    // This handles both P2P partner disconnects and general mode changes/cleanup
    addSystemMessage("Partner disconnected. Chat disabled.");
    els.msgInput.disabled = true;
    els.sendBtn.disabled = true;
    // No video cleanup needed
});

socket.on('message', (data) => {
    const type = data.isSelf ? 'out' : 'in';
    // Only handle text messages now
    if (data.text) {
        addMessage(data.text, type, data.user);
    }
    // Audio/Video events are ignored
});

// --- UI INTERACTION ---

els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('username').value;
    const age = document.getElementById('age').value;
    if (name && age) {
        socket.emit('login', { name, age });
    } else {
        showToast('Warning', 'Name and Age are required.', 'error');
    }
});

document.getElementById('btn-p2p').addEventListener('click', () => {
    setActiveMode('p2p');
});

document.getElementById('btn-group').addEventListener('click', () => {
    setActiveMode('group');
});

els.regionSelect.addEventListener('change', (e) => {
    if (STATE.mode === 'group') {
        socket.emit('join_group', { region: e.target.value });
    }
});

// Disable video/audio buttons and recording
if (els.btnVideo) els.btnVideo.style.display = 'none';
if (els.btnVc) els.btnVc.style.display = 'none';
if (els.recordBtn) els.recordBtn.style.display = 'none';


function setActiveMode(mode) {
    if (STATE.mode !== mode) {
        STATE.mode = mode;
        clearChat();
        disableChat();
    }
    
    if (mode === 'group') {
        els.regionSelector.classList.remove('hidden');
        const selectedRegion = els.regionSelect.value;
        if (selectedRegion) {
             socket.emit('join_group', { region: selectedRegion });
        } else {
             els.chatTitle.innerText = "Select Channel";
             els.chatSubtitle.innerText = "Choose a region to start chatting.";
             els.statusIndicator.className = "w-3 h-3 bg-slate-500 rounded-full";
        }
    } else if (mode === 'p2p') {
        els.regionSelector.classList.add('hidden');
        socket.emit('join_p2p');
    }
}

// --- MESSAGING ---

els.sendBtn.addEventListener('click', sendMessage);
els.msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const text = els.msgInput.value.trim();
    if (!text || !STATE.roomId) return;
    socket.emit('send_message', { text: text });
    els.msgInput.value = '';
}

function addMessage(text, type, user) {
    const div = document.createElement('div');
    const alignmentClass = type === 'out' ? 'justify-end' : 'justify-start';
    const bubbleClass = type === 'out' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800';
    div.className = `flex ${alignmentClass} mb-2`;

    const messageContent = document.createElement('div');
    messageContent.className = `max-w-[80%] p-3 rounded-xl shadow-md ${bubbleClass} fade-in`;
    
    if (type === 'in') {
        const nameTag = document.createElement('div');
        nameTag.className = "text-[10px] font-bold opacity-80 mb-1";
        nameTag.innerText = user || 'Anonymous'; 
        messageContent.appendChild(nameTag);
    }
    
    const content = document.createElement('p');
    content.innerText = text;
    messageContent.appendChild(content);
    
    div.appendChild(messageContent);
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = "text-center text-xs text-slate-500 my-4";
    div.innerHTML = text; 
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function clearChat() {
    els.msgContainer.innerHTML = '';
    els.welcomePlaceholder.classList.remove('hidden');
}

function enableChat() {
    els.msgInput.disabled = false;
    els.sendBtn.disabled = false;
    els.welcomePlaceholder.classList.add('hidden');
}

function disableChat() {
    els.msgInput.disabled = true;
    els.sendBtn.disabled = true;
}

function scrollToBottom() {
    els.msgContainer.scrollTop = els.msgContainer.scrollHeight;
}

// --- UTILS ---
function showToast(title, msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(`Toast: ${title} - ${msg}`); 
    const div = document.createElement('div');
    const bg = type === 'error' ? 'bg-rose-600' : (type === 'success' ? 'bg-blue-600' : 'bg-yellow-600');
    div.className = `${bg} text-white px-6 py-3 rounded-lg shadow-xl fade-in z-50 fixed bottom-5 right-5`;
    div.innerHTML = `<b>${title}</b><br><span class="text-xs">${msg}</span>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}
