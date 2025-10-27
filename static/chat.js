// --- LOBBY ELEMENTS ---
const lobby = document.getElementById('lobby');
const startChatButton = document.getElementById('start-chat-button');
const nameInput = document.getElementById('name-input');
const ageInput = document.getElementById('age-input');

// --- CHAT ELEMENTS ---
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');
const typingStatus = document.getElementById('typing-status');

// --- VOICE RECORDING ELEMENTS ---
const recordButton = document.getElementById('record-button');
let isRecording = false;
let mediaRecorder;
let audioChunks = [];

// --- NEW: WebRTC ELEMENTS ---
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let socket;
let typingTimer;
let localStream;
let peerConnection;

// --- NEW: STUN Server Configuration ---
const iceServers = {
    'iceServers': [
        { 'urls': 'stun:stun.l.google.com:19302' },
        { 'urls': 'stun:stun1.l.google.com:19302' }
    ]
};


// --- LOBBY LOGIC ---
// MODIFIED: Made this async to wait for media
startChatButton.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const age = parseInt(ageInput.value, 10);

    if (name === '') {
        alert('Please enter your name.');
        return;
    }

    if (isNaN(age) || age < 18) {
        alert('You must be 18 or older to chat.');
        return;
    }

    // --- NEW: Get user media BEFORE starting chat ---
    if (!await startMedia()) {
        console.log('Failed to get media');
        return; // Don't proceed if user denies media
    }

    alert('Welcome to Chat Hub!\nPlease maintain discipline and do not use vulgar language. Be respectful to others.');

    // Hide lobby and show chat
    lobby.style.display = 'none';
    chatContainer.style.display = 'flex';

    // NOW connect to the server
    initializeSocket(name);
});


// --- CHAT LOGIC ---
function initializeSocket(name) {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected with ID:', socket.id);
        socket.emit('join_queue', { name: name });
    });

    // MODIFIED: Made this async to handle WebRTC offer
    socket.on('match_found', async (data) => {
        statusBox.textContent = data.message;
        messagesList.innerHTML = '';
        typingStatus.textContent = '';
        
        // --- NEW: Start WebRTC connection ---
        createPeerConnection(); // Create the connection object
        
        if (data.is_caller) {
            console.log('You are the caller');
            // 1. Caller creates an offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // 2. Send the offer to the other user
            socket.emit('webrtc_offer', { 'offer': offer });
        } else {
            console.log('You are the receiver');
        }
    });

    socket.on('new_message', (data) => {
        addTextMessageToUI(data.message, data.name, false);
    });
    
    socket.on('new_voice_message', (data) => {
        const audioBlob = new Blob([data.audio], { type: 'audio/webm' });
        addAudioMessageToUI(audioBlob, data.name, false);
    });

    socket.on('user_disconnected', (data) => {
        const item = document.createElement('li');
        item.textContent = data.message;
        item.style.color = 'red';
        item.style.fontStyle = 'italic';
        messagesList.appendChild(item);
        statusBox.textContent = 'Stranger disconnected. Refresh to find a new match.';
        typingStatus.textContent = '';
        
        // --- NEW: Clean up video call ---
        closePeerConnection();
    });

    socket.on('stranger_typing', () => {
        typingStatus.textContent = 'Stranger is typing...';
    });

    socket.on('stranger_stopped_typing', () => {
        typingStatus.textContent = '';
    });

    // --- NEW: WebRTC Signaling Listeners ---
    
    socket.on('webrtc_offer', async (data) => {
        if (peerConnection) {
            console.log('Received offer');
            // 1. Receiver sets the remote description (the offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // 2. Receiver creates an answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // 3. Send the answer back to the caller
            socket.emit('webrtc_answer', { 'answer': answer });
        }
    });

    socket.on('webrtc_answer', async (data) => {
        console.log('Received answer');
        // Caller sets the remote description (the answer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('webrtc_ice_candidate', (data) => {
        if (peerConnection) {
            console.log('Received ICE candidate');
            // Add the candidate to the peer connection
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
}


// --- TEXT MESSAGE FUNCTIONS ---
// (Same as before)
function addTextMessageToUI(message, name, isMyMessage) {
    const item = document.createElement('li');
    item.textContent = `${name}: ${message}`;
    if (isMyMessage) {
        item.classList.add('my-message');
    }
    messagesList.appendChild(item);
    messagesList.scrollTop = messagesList.scrollHeight;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '' && socket) {
        addTextMessageToUI(message, 'You', true);
        socket.emit('message', { message: message });
        clearTimeout(typingTimer);
        socket.emit('stop_typing');
        messageInput.value = '';
    }
}
messageInput.addEventListener('keydown', (e) => (e.key === 'Enter') && sendMessage());
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('input', () => {
    if (socket) {
        socket.emit('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            if (socket) socket.emit('stop_typing');
        }, 2000);
    }
});


// --- VOICE RECORDING FUNCTIONS ---
// (Same as before)
function addAudioMessageToUI(audioBlob, name, isMyMessage) {
    const audioUrl = URL.createObjectURL(audioBlob);
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${name}: `;
    const audioPlayer = document.createElement('audio');
    audioPlayer.src = audioUrl;
    audioPlayer.controls = true;
    item.appendChild(label);
    item.appendChild(audioPlayer);
    if (isMyMessage) {
        item.classList.add('my-message');
    }
    messagesList.appendChild(item);
    messagesList.scrollTop = messagesList.scrollHeight;
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecording = true;
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (socket) socket.emit('voice_message', audioBlob);
            addAudioMessageToUI(audioBlob, 'You', true);
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        recordButton.textContent = '⏹️';
        recordButton.classList.add('is-recording');
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please allow microphone permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        recordButton.textContent = '🎤';
        recordButton.classList.remove('is-recording');
    }
}
recordButton.addEventListener('click', () => isRecording ? stopRecording() : startRecording());


// --- NEW: WebRTC HELPER FUNCTIONS ---

async function startMedia() {
    try {
        // Request video and audio
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        // Show local video in the HTML element
        localVideo.srcObject = localStream;
        return true; // Success
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('You must allow camera and mic access to use video chat.');
        return false; // Failure
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);

    // Event Handler: When the remote user adds their video/audio
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Event Handler: When the browser finds a network path (ICE candidate)
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Send this candidate to the other user via our server
            socket.emit('webrtc_ice_candidate', { 
                'candidate': event.candidate 
            });
        }
    };

    // Add your local stream to the connection
    // This sends your video/audio to the other person
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

function closePeerConnection() {
    // 1. Close the connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // 2. Stop all local media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // 3. Clear video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // 4. (Optional) Re-enable media for next chat
    // You might want to automatically call startMedia() here
    // or prompt the user to "Start Video"
}
