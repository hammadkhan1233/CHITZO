// Establish Socket Connection
const socket = io();

// State
const STATE = {
    connected: false,
    mode: 'none', // 'p2p' | 'group'
    roomId: null,
    mediaStream: null,
    peerConnection: null,
    mediaRecorder: null,
    chunks: []
};

// DOM Cache
const els = {
    loginScreen: document.getElementById('login-screen'),
    appInterface: document.getElementById('app-interface'),
    loginForm: document.getElementById('login-form'),
    msgContainer: document.getElementById('messages-container'),
    msgInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('btn-send'),
    recordBtn: document.getElementById('btn-record'),
    videoOverlay: document.getElementById('video-overlay'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    statusIndicator: document.getElementById('chat-status-indicator'),
    chatTitle: document.getElementById('chat-title'),
    chatSubtitle: document.getElementById('chat-subtitle'),
    serverCap: document.getElementById('server-cap-display')
};

// WebRTC Config
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- SOCKET EVENTS ---

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('server_stats', (data) => {
    if (els.serverCap) els.serverCap.innerText = data.count;
});

socket.on('login_success', (data) => {
    els.loginScreen.classList.add('hidden');
    els.appInterface.classList.remove('hidden');
    document.getElementById('user-badge').innerText = data.name;
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
    addSystemMessage(`Matched with ${data.partner}. Say hi!`);
});

socket.on('group_joined', (data) => {
    STATE.mode = 'group';
    STATE.roomId = `group_${data.region}`;
    els.chatTitle.innerText = `Channel: ${data.region.toUpperCase()}`;
    els.chatSubtitle.innerText = "Public Group";
    els.statusIndicator.className = "w-3 h-3 bg-emerald-500 rounded-full";
    enableChat();
    addSystemMessage(`Joined ${data.region} channel.`);
});

socket.on('peer_disconnected', () => {
    addSystemMessage("Partner disconnected.");
    els.msgInput.disabled = true;
    els.sendBtn.disabled = true;
    endCall(); // Ensure video cleanup
});

socket.on('message', (data) => {
    const type = data.isSelf ? 'out' : 'in';
    if (data.audio) {
        // Convert base64 back to blob for playback (simplified)
        addAudioMessage(data.audio, type);
    } else {
        addMessage(data.text, type, data.user);
    }
});

// --- UI INTERACTION ---

els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('username').value;
    const age = document.getElementById('age').value;
    socket.emit('login', { name, age });
});

document.getElementById('btn-p2p').addEventListener('click', () => {
    setActiveMode('p2p');
    socket.emit('join_p2p');
});

document.getElementById('btn-group').addEventListener('click', () => {
    setActiveMode('group');
    document.getElementById('region-selector').classList.remove('hidden');
});

document.getElementById('region-select').addEventListener('change', (e) => {
    if (STATE.mode === 'group') {
        socket.emit('join_group', { region: e.target.value });
    }
});

// Start group chat when first entering group mode
function setActiveMode(mode) {
    STATE.mode = mode;
    // UI Toggles (simplified for brevity)
    if(mode === 'group') {
        document.getElementById('region-selector').classList.remove('hidden');
        socket.emit('join_group', { region: document.getElementById('region-select').value });
    } else {
        document.getElementById('region-selector').classList.add('hidden');
    }
}

// --- MESSAGING ---

els.sendBtn.addEventListener('click', sendMessage);
els.msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = els.msgInput.value.trim();
    if (!text) return;
    socket.emit('send_message', { text: text });
    els.msgInput.value = '';
}

function addMessage(text, type, user) {
    const div = document.createElement('div');
    div.className = `max-w-[80%] p-3 mb-2 ${type === 'out' ? 'message-out' : 'message-in'} fade-in`;
    
    if (type === 'in') {
        const nameTag = document.createElement('div');
        nameTag.className = "text-[10px] font-bold opacity-75 mb-1";
        nameTag.innerText = user;
        div.appendChild(nameTag);
    }
    
    const content = document.createElement('div');
    content.innerText = text;
    div.appendChild(content);
    
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = "text-center text-xs text-slate-500 my-4";
    div.innerText = text;
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function clearChat() {
    els.msgContainer.innerHTML = '';
}

function enableChat() {
    els.msgInput.disabled = false;
    els.sendBtn.disabled = false;
    document.getElementById('welcome-placeholder').classList.add('hidden');
}

function scrollToBottom() {
    els.msgContainer.scrollTop = els.msgContainer.scrollHeight;
}

// --- VIDEO CALLING (WebRTC) ---

document.getElementById('btn-video').addEventListener('click', startVideoCall);
document.getElementById('btn-vc').addEventListener('click', startVideoCall); // Reuse logic for now

async function startVideoCall() {
    if (!STATE.roomId) return showToast('Error', 'Join a room first', 'error');
    
    try {
        STATE.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        els.localVideo.srcObject = STATE.mediaStream;
        els.videoOverlay.classList.remove('hidden');
        document.getElementById('active-call-panel').classList.remove('hidden');

        STATE.peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Add tracks
        STATE.mediaStream.getTracks().forEach(track => {
            STATE.peerConnection.addTrack(track, STATE.mediaStream);
        });

        // Handle remote stream
        STATE.peerConnection.ontrack = (event) => {
            els.remoteVideo.srcObject = event.streams[0];
        };

        // ICE Candidates
        STATE.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { type: 'candidate', data: event.candidate });
            }
        };

        // Create Offer
        const offer = await STATE.peerConnection.createOffer();
        await STATE.peerConnection.setLocalDescription(offer);
        socket.emit('signal', { type: 'offer', data: offer });

    } catch (err) {
        showToast('Error', 'Could not access camera/mic', 'error');
        console.error(err);
    }
}

// Handle Signaling
socket.on('signal', async (msg) => {
    if (!STATE.peerConnection) {
        // Receiver setup
        STATE.peerConnection = new RTCPeerConnection(rtcConfig);
        
        // If we receive an offer, we might need to get our own media to answer
        if (msg.type === 'offer' && !STATE.mediaStream) {
             // For simplicity in this demo, answer with audio/video if possible
             try {
                 STATE.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                 els.localVideo.srcObject = STATE.mediaStream;
                 STATE.mediaStream.getTracks().forEach(track => STATE.peerConnection.addTrack(track, STATE.mediaStream));
                 els.videoOverlay.classList.remove('hidden');
                 document.getElementById('active-call-panel').classList.remove('hidden');
                 
                 STATE.peerConnection.ontrack = (e) => els.remoteVideo.srcObject = e.streams[0];
                 STATE.peerConnection.onicecandidate = (e) => {
                     if (e.candidate) socket.emit('signal', { type: 'candidate', data: e.candidate });
                 };
             } catch (e) { console.error(e); }
        }
    }

    if (msg.type === 'offer') {
        await STATE.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));
        const answer = await STATE.peerConnection.createAnswer();
        await STATE.peerConnection.setLocalDescription(answer);
        socket.emit('signal', { type: 'answer', data: answer });
    } else if (msg.type === 'answer') {
        await STATE.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));
    } else if (msg.type === 'candidate') {
        try {
            await STATE.peerConnection.addIceCandidate(new RTCIceCandidate(msg.data));
        } catch (e) { console.error(e); }
    }
});

window.endCall = () => {
    if (STATE.mediaStream) {
        STATE.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (STATE.peerConnection) {
        STATE.peerConnection.close();
        STATE.peerConnection = null;
    }
    STATE.mediaStream = null;
    els.localVideo.srcObject = null;
    els.remoteVideo.srcObject = null;
    els.videoOverlay.classList.add('hidden');
    document.getElementById('active-call-panel').classList.add('hidden');
};

// --- UTILS ---
function showToast(title, msg, type) {
    const container = document.getElementById('toast-container');
    const div = document.createElement('div');
    const bg = type === 'error' ? 'bg-rose-600' : 'bg-blue-600';
    div.className = `${bg} text-white px-6 py-3 rounded-lg shadow-xl fade-in`;
    div.innerHTML = `<b>${title}</b><br><span class="text-xs">${msg}</span>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}
