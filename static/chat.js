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
    serverCap: document.getElementById('server-cap-display'),
    // New/Required for Functionality
    endCallBtn: document.getElementById('btn-end-call'),
    regionSelector: document.getElementById('region-selector'),
    regionSelect: document.getElementById('region-select'),
    welcomePlaceholder: document.getElementById('welcome-placeholder'),
    userBadge: document.getElementById('user-badge'),
    activeCallPanel: document.getElementById('active-call-panel')
};

// WebRTC Config
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
    // FIX: Use cached element
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
    // FIX: Ensure WebRTC is cleaned up if a new match occurs during a previous session
    endCall(); 
});

socket.on('group_joined', (data) => {
    STATE.mode = 'group';
    STATE.roomId = data.room || `group_${data.region}`; // Use room ID from server if provided
    els.chatTitle.innerText = `Channel: ${data.region ? data.region.toUpperCase() : 'Public'}`;
    els.chatSubtitle.innerText = "Public Group";
    els.statusIndicator.className = "w-3 h-3 bg-emerald-500 rounded-full";
    enableChat();
    addSystemMessage(`Joined **${data.region}** channel.`);
    endCall(); // Group chat doesn't typically use P2P WebRTC
});

socket.on('peer_disconnected', () => {
    addSystemMessage("Partner disconnected. Chat disabled.");
    els.msgInput.disabled = true;
    els.sendBtn.disabled = true;
    endCall(); // Ensure video cleanup and reset state
});

socket.on('message', (data) => {
    const type = data.isSelf ? 'out' : 'in';
    if (data.audio) {
        addAudioMessage(data.audio, type, data.user); // FIX: Ensure user is passed
    } else {
        addMessage(data.text, type, data.user);
    }
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
    // FIX: Centralize logic
    setActiveMode('p2p');
});

document.getElementById('btn-group').addEventListener('click', () => {
    setActiveMode('group');
});

els.regionSelect.addEventListener('change', (e) => {
    if (STATE.mode === 'group') {
        // FIX: Re-join the new group on selection change
        socket.emit('join_group', { region: e.target.value });
    }
});

// Start group chat when first entering group mode or switch to P2P
function setActiveMode(mode) {
    if (STATE.mode !== mode) {
        // Clear previous state and end call
        STATE.mode = mode;
        clearChat();
        disableChat();
        endCall(); 
    }
    
    if (mode === 'group') {
        els.regionSelector.classList.remove('hidden');
        // FIX: Emit join_group only if a region is selected
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
        e.preventDefault(); // Prevent default newline behavior
        sendMessage();
    }
});

function sendMessage() {
    const text = els.msgInput.value.trim();
    if (!text || !STATE.roomId) return; // FIX: Check for roomId
    socket.emit('send_message', { text: text });
    els.msgInput.value = '';
}

function addMessage(text, type, user) {
    const div = document.createElement('div');
    // FIX: Use appropriate classes for incoming/outgoing messages
    const alignmentClass = type === 'out' ? 'justify-end' : 'justify-start';
    const bubbleClass = type === 'out' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800';
    div.className = `flex ${alignmentClass} mb-2`;

    const messageContent = document.createElement('div');
    messageContent.className = `max-w-[80%] p-3 rounded-xl shadow-md ${bubbleClass} fade-in`;
    
    if (type === 'in') {
        const nameTag = document.createElement('div');
        nameTag.className = "text-[10px] font-bold opacity-80 mb-1";
        nameTag.innerText = user || 'Anonymous'; // Default to Anonymous
        messageContent.appendChild(nameTag);
    }
    
    const content = document.createElement('p');
    content.innerText = text;
    messageContent.appendChild(content);
    
    div.appendChild(messageContent);
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function addAudioMessage(base64Audio, type, user) {
    // This function assumes the server sends a base64 encoded audio chunk
    const div = document.createElement('div');
    const alignmentClass = type === 'out' ? 'justify-end' : 'justify-start';
    const bubbleClass = type === 'out' ? 'bg-purple-500 text-white' : 'bg-gray-300 text-gray-800';
    div.className = `flex ${alignmentClass} mb-2`;

    const messageContent = document.createElement('div');
    messageContent.className = `max-w-[80%] p-3 rounded-xl shadow-md ${bubbleClass} fade-in`;

    if (type === 'in') {
        const nameTag = document.createElement('div');
        nameTag.className = "text-[10px] font-bold opacity-80 mb-1";
        nameTag.innerText = user || 'Anonymous';
        messageContent.appendChild(nameTag);
    }

    const audio = document.createElement('audio');
    // Assuming the format is known, e.g., 'audio/webm; codecs=opus'
    audio.src = `data:audio/webm;base64,${base64Audio}`; 
    audio.controls = true;
    messageContent.appendChild(audio);
    
    div.appendChild(messageContent);
    els.msgContainer.appendChild(div);
    scrollToBottom();
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    // Use innerHTML for simple bolding in system messages
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

// --- AUDIO RECORDING (MISSING IMPLEMENTATION) ---
// You need to implement the MediaRecorder logic here if you want audio messages
els.recordBtn.addEventListener('click', toggleRecording);

function toggleRecording() {
    showToast('Info', 'Audio recording feature not fully implemented in this client code.', 'info');
    // Implement: Start/Stop MediaRecorder, collect STATE.chunks, convert to base64, and socket.emit('send_message', { audio: base64Data });
}

// --- VIDEO CALLING (WebRTC) ---

document.getElementById('btn-video').addEventListener('click', startVideoCall);
document.getElementById('btn-vc').addEventListener('click', startVideoCall);
// Add listener for the END call button
els.endCallBtn.addEventListener('click', endCall); 


async function startVideoCall() {
    if (STATE.mode !== 'p2p' || !STATE.roomId) return showToast('Error', 'Video calls are only available in a P2P chat.', 'error');
    if (STATE.peerConnection) return showToast('Info', 'Call already active.', 'info');
    
    try {
        // 1. Get Local Media
        STATE.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        els.localVideo.srcObject = STATE.mediaStream;
        els.videoOverlay.classList.remove('hidden');
        els.activeCallPanel.classList.remove('hidden');

        // 2. Setup Peer Connection (Caller)
        STATE.peerConnection = new RTCPeerConnection(rtcConfig);
        setupPeerConnectionHandlers(); // Centralize handlers

        // 3. Add tracks
        STATE.mediaStream.getTracks().forEach(track => {
            STATE.peerConnection.addTrack(track, STATE.mediaStream);
        });

        // 4. Create and Send Offer
        const offer = await STATE.peerConnection.createOffer();
        await STATE.peerConnection.setLocalDescription(offer);
        socket.emit('signal', { type: 'offer', data: offer, room: STATE.roomId });
        addSystemMessage("Initiating video call...");

    } catch (err) {
        showToast('Error', 'Could not access camera/mic. Check permissions.', 'error');
        console.error("Error starting video call:", err);
    }
}

// Centralized Peer Connection Handlers
function setupPeerConnectionHandlers() {
    STATE.peerConnection.ontrack = (event) => {
        // Only set the remote stream once
        if (!els.remoteVideo.srcObject) {
            els.remoteVideo.srcObject = event.streams[0];
            addSystemMessage("Video call connected.");
        }
    };

    STATE.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { type: 'candidate', data: event.candidate, room: STATE.roomId });
        }
    };

    STATE.peerConnection.onconnectionstatechange = () => {
        if (STATE.peerConnection.connectionState === 'disconnected' || STATE.peerConnection.connectionState === 'closed') {
            addSystemMessage("WebRTC connection closed or disconnected.");
            endCall();
        }
    };
}


// Handle Signaling
socket.on('signal', async (msg) => {
    // FIX: Only process signal if in the correct room (your server should enforce this)
    if (!STATE.roomId || !STATE.connected) return; 

    if (msg.type === 'offer' && !STATE.peerConnection) {
        // Receiver setup - Must be triggered by a remote offer when no PC is active
        try {
            // 1. Get Local Media for Receiver
            STATE.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            els.localVideo.srcObject = STATE.mediaStream;
            els.videoOverlay.classList.remove('hidden');
            els.activeCallPanel.classList.remove('hidden');
            addSystemMessage("Incoming video call! Answering...");
            
            // 2. Setup Peer Connection (Receiver)
            STATE.peerConnection = new RTCPeerConnection(rtcConfig);
            setupPeerConnectionHandlers(); // Use centralized handlers

            // 3. Add tracks
            STATE.mediaStream.getTracks().forEach(track => STATE.peerConnection.addTrack(track, STATE.mediaStream));

        } catch (e) { 
            console.error("Error setting up receiver media:", e); 
            // If media fails, we cannot answer with video/audio
            return showToast('Error', 'Failed to get camera/mic to answer call.', 'error');
        }
    }

    // Process signals if peerConnection is active
    if (STATE.peerConnection) {
        if (msg.type === 'offer') {
            await STATE.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));
            const answer = await STATE.peerConnection.createAnswer();
            await STATE.peerConnection.setLocalDescription(answer);
            socket.emit('signal', { type: 'answer', data: answer, room: STATE.roomId });
        } else if (msg.type === 'answer') {
            await STATE.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));
            addSystemMessage("Call established.");
        } else if (msg.type === 'candidate') {
            try {
                await STATE.peerConnection.addIceCandidate(new RTCIceCandidate(msg.data));
            } catch (e) { 
                // Ignore errors if the candidate is added too early/late
                console.warn("Error adding ICE candidate:", e); 
            }
        }
    }
});

window.endCall = () => {
    // 1. Close Media Stream
    if (STATE.mediaStream) {
        STATE.mediaStream.getTracks().forEach(t => t.stop());
    }
    // 2. Close Peer Connection
    if (STATE.peerConnection) {
        STATE.peerConnection.close();
    }
    // 3. Reset State & UI
    STATE.peerConnection = null;
    STATE.mediaStream = null;
    els.localVideo.srcObject = null;
    els.remoteVideo.srcObject = null;
    els.videoOverlay.classList.add('hidden');
    els.activeCallPanel.classList.add('hidden');
    
    // Optional: Send a hangup signal to the server if the call was active
    // socket.emit('hangup', { room: STATE.roomId });
};

// --- UTILS ---
function showToast(title, msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return console.log(`Toast: ${title} - ${msg}`); // Safety check
    const div = document.createElement('div');
    const bg = type === 'error' ? 'bg-rose-600' : (type === 'success' ? 'bg-blue-600' : 'bg-yellow-600');
    div.className = `${bg} text-white px-6 py-3 rounded-lg shadow-xl fade-in z-50 fixed bottom-5 right-5`;
    div.innerHTML = `<b>${title}</b><br><span class="text-xs">${msg}</span>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}
